/**
 * @file packages/core/src/jira/jira-evidence-attachment-service.ts
 * Core domain service for attaching V5/V6 execution evidence and artifacts to authoritative Jira issues.
 * Enforces strict evidence eligibility, secret redaction, original evidence immutability,
 * multi-tenant isolation, cryptographic integrity validation, safe filenames, and audit trails.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  PrismaClient,
  JiraEvidenceAttachment as PrismaJiraEvidenceAttachment,
} from '@prisma/client';
import {
  type IJiraEvidenceAttachmentService,
  type IJiraCredentialVault,
  type IJiraClient,
  type ListAttachableEvidenceInputDto,
  type JiraAttachableEvidenceItemDto,
  type AttachEvidenceInputDto,
  type JiraEvidenceAttachmentDto,
  type JiraAttachmentBatchResultDto,
  type GetAttachmentStatusInputDto,
  listAttachableEvidenceInputSchema,
  attachEvidenceInputSchema,
  getAttachmentStatusInputSchema,
  JIRA_BOUNDS,
} from './jira-types.js';
import { JiraCredentialVault } from './jira-credential-vault.js';
import { JiraClient } from './jira-client.js';
import { EvidenceStorageService } from '../execution/evidence/evidence-storage-service.js';
import { FailureEvidenceRedactor } from '../failures/evidence/failure-evidence-redactor.js';
import {
  JiraConnectionNotFoundError,
  JiraCrossProjectError,
  JiraEvidenceNotFoundError,
  JiraEvidenceIntegrityError,
} from './jira-errors.js';
import { ProjectNotFoundError } from '../projects/project-errors.js';

export class JiraEvidenceAttachmentService implements IJiraEvidenceAttachmentService {
  private readonly prisma: PrismaClient;
  private readonly storageService: EvidenceStorageService;
  private readonly redactor: FailureEvidenceRedactor;
  private readonly vault: IJiraCredentialVault;
  private readonly jiraClient: IJiraClient;
  private readonly attachmentLocks: Map<string, Promise<void>> = new Map();
  private readonly allowLocalhostForTesting: boolean;

  constructor(options: {
    readonly prisma: PrismaClient;
    readonly storageService?: EvidenceStorageService;
    readonly redactor?: FailureEvidenceRedactor;
    readonly vault?: IJiraCredentialVault;
    readonly jiraClient?: IJiraClient;
    readonly allowLocalhostForTesting?: boolean;
  }) {
    this.prisma = options.prisma;
    this.storageService = options.storageService ?? new EvidenceStorageService();
    this.redactor = options.redactor ?? new FailureEvidenceRedactor();
    this.vault = options.vault ?? new JiraCredentialVault();
    this.jiraClient = options.jiraClient ?? new JiraClient();
    this.allowLocalhostForTesting = Boolean(options.allowLocalhostForTesting);
  }

  /**
   * Acquires a serialized in-memory lock for a specific externalIssueId to prevent concurrent duplicate uploads.
   */
  private async acquireLock(lockKey: string): Promise<() => void> {
    while (this.attachmentLocks.has(lockKey)) {
      await this.attachmentLocks.get(lockKey);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    this.attachmentLocks.set(lockKey, lockPromise);

    return () => {
      this.attachmentLocks.delete(lockKey);
      resolveLock();
    };
  }

  /**
   * Sanitizes a logical filename to prevent directory traversal and strip unsafe characters.
   */
  private sanitizeFilename(logicalName: string): string {
    const base = path.basename(logicalName);
    // Replace any non-alphanumeric, non-hyphen, non-dot, non-underscore characters with an underscore
    const sanitized = base.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    return sanitized.length > 0 ? sanitized : 'evidence_artifact';
  }

  /**
   * Checks whether an artifact type contains text/log/JSON content requiring secret redaction.
   */
  private isTextArtifact(artifactType: string, mimeType?: string | null): boolean {
    if (
      artifactType === 'CONSOLE_LOG' ||
      artifactType === 'NETWORK_LOG' ||
      artifactType === 'NETWORK_REQUEST' ||
      artifactType === 'NETWORK_RESPONSE' ||
      artifactType === 'DOM_SNAPSHOT' ||
      artifactType === 'PAGE_METADATA' ||
      artifactType === 'ASSERTION_CONTEXT' ||
      artifactType === 'ERROR_CONTEXT'
    ) {
      return true;
    }
    if (mimeType) {
      const lower = mimeType.toLowerCase();
      if (
        lower.startsWith('text/') ||
        lower === 'application/json' ||
        lower === 'application/javascript' ||
        lower === 'application/xml'
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Lists all attachable evidence artifacts for a failure case or bug report,
   * annotating each item with eligibility, redaction requirements, and attachment status.
   */
  public async listAttachableEvidence(
    rawInput: ListAttachableEvidenceInputDto,
  ): Promise<readonly JiraAttachableEvidenceItemDto[]> {
    const input = listAttachableEvidenceInputSchema.parse(rawInput);

    // 1. Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }

    // 2. Verify failure case belongs to project
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: input.failureCaseId },
    });
    if (!failureCase || failureCase.projectId !== input.projectId) {
      throw new JiraCrossProjectError('failureCase', input.projectId);
    }

    // 3. Fetch all evidence references for this failure case
    const references = await this.prisma.failureEvidenceReference.findMany({
      where: {
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
      },
      orderBy: { attachedAt: 'asc' },
    });

    // 4. Fetch any existing Jira evidence attachments for these references
    const refIds = references.map(r => r.id);
    const existingAttachments = await this.prisma.jiraEvidenceAttachment.findMany({
      where: {
        projectId: input.projectId,
        evidenceReferenceId: { in: refIds },
      },
    });

    const attachmentMap = new Map<string, PrismaJiraEvidenceAttachment>();
    for (const att of existingAttachments) {
      attachmentMap.set(att.evidenceReferenceId, att);
    }

    // 5. Evaluate eligibility and annotate each reference
    return references.map(ref => {
      const existing = attachmentMap.get(ref.id);
      const isAlreadyAttached = existing?.status === 'ATTACHED';
      const requiresRedaction = this.isTextArtifact(ref.artifactType, ref.mimeType);

      let isEligible = true;
      let ineligibilityReason: string | undefined;

      // Playwright traces are strictly blocked from automated upload
      if (ref.artifactType === 'PLAYWRIGHT_TRACE') {
        isEligible = false;
        ineligibilityReason =
          'Sensitive trace content cannot be safely sanitized; manual review required';
      } else if (ref.byteSize && ref.byteSize > JIRA_BOUNDS.MAX_ATTACHMENT_SIZE_BYTES) {
        isEligible = false;
        ineligibilityReason = `Evidence artifact size (${ref.byteSize} bytes) exceeds Jira upload limit of ${JIRA_BOUNDS.MAX_ATTACHMENT_SIZE_BYTES} bytes`;
      } else if (isAlreadyAttached) {
        isEligible = false;
        ineligibilityReason = 'Artifact is already attached to this Jira issue';
      }

      return {
        evidenceReferenceId: ref.id,
        artifactType: ref.artifactType,
        logicalName: ref.logicalName,
        mimeType: ref.mimeType ?? undefined,
        byteSize: ref.byteSize ?? undefined,
        sha256: ref.sha256 ?? undefined,
        isEligible,
        ineligibilityReason,
        requiresRedaction,
        isAlreadyAttached,
        attachedJiraAttachmentId: existing?.jiraAttachmentId ?? undefined,
        attachmentStatus: (existing?.status as any) ?? undefined,
      };
    });
  }

  /**
   * Securely attaches selected evidence artifacts to an authoritative Jira issue.
   * Performs redaction on text derivatives, verifies cryptographic integrity, enforces immutability
   * of original files, handles deduplication/idempotency, and logs full audit trails.
   */
  public async attachEvidence(
    rawInput: AttachEvidenceInputDto,
  ): Promise<JiraAttachmentBatchResultDto> {
    const input = attachEvidenceInputSchema.parse(rawInput);

    // 1. Lock serialization to prevent concurrent race conditions for the same Jira issue
    const lockKey = `${input.projectId}:${input.externalIssueId}`;
    const releaseLock = await this.acquireLock(lockKey);

    try {
      // 2. Fetch authoritative external issue with related connection, project, and failure case
      const externalIssue = await this.prisma.jiraExternalIssue.findUnique({
        where: { id: input.externalIssueId },
        include: {
          project: true,
          connection: true,
          bugReport: true,
          failureCase: true,
        },
      });

      if (!externalIssue) {
        throw new JiraEvidenceNotFoundError(`External Jira issue '${input.externalIssueId}'`);
      }

      // 3. Strict tenant isolation
      if (externalIssue.projectId !== input.projectId) {
        throw new JiraCrossProjectError(externalIssue.id, input.projectId);
      }

      // 4. Verify Jira connection
      const connection = externalIssue.connection;
      if (!connection || connection.projectId !== input.projectId) {
        throw new JiraConnectionNotFoundError(externalIssue.connectionId);
      }

      if (!connection.encryptedCredentials) {
        throw new JiraConnectionNotFoundError('Missing connection credentials');
      }

      const plainToken = await this.vault.decrypt(connection.encryptedCredentials, connection.id);

      let attachedCount = 0;
      let blockedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const attachments: JiraEvidenceAttachmentDto[] = [];

      // 5. Process each requested evidence reference sequentially
      for (const evidenceRefId of input.evidenceReferenceIds) {
        // Check if already attached to this external issue
        const existing = await this.prisma.jiraEvidenceAttachment.findUnique({
          where: {
            externalIssueId_evidenceReferenceId: {
              externalIssueId: externalIssue.id,
              evidenceReferenceId: evidenceRefId,
            },
          },
        });

        if (existing && existing.status === 'ATTACHED') {
          skippedCount++;
          attachments.push(this.mapToDto(existing));
          continue;
        }

        // Fetch authoritative evidence reference
        const evidenceRef = await this.prisma.failureEvidenceReference.findUnique({
          where: { id: evidenceRefId },
        });

        if (
          !evidenceRef ||
          evidenceRef.projectId !== input.projectId ||
          evidenceRef.failureCaseId !== externalIssue.failureCaseId
        ) {
          failedCount++;
          const failedRecord = await this.prisma.jiraEvidenceAttachment.upsert({
            where: {
              externalIssueId_evidenceReferenceId: {
                externalIssueId: externalIssue.id,
                evidenceReferenceId: evidenceRefId,
              },
            },
            create: {
              projectId: input.projectId,
              externalIssueId: externalIssue.id,
              bugReportId: externalIssue.bugReportId,
              evidenceReferenceId: evidenceRefId,
              evidenceType: evidenceRef?.artifactType ?? 'ERROR_CONTEXT',
              artifactHash: evidenceRef?.sha256 || 'UNKNOWN',
              jiraFilename: 'unknown_artifact',
              contentType: 'application/octet-stream',
              sizeBytes: 0,
              status: 'FAILED',
              failureCode: 'JIRA_EVIDENCE_NOT_FOUND',
              failureReason: `Evidence reference '${evidenceRefId}' does not exist or does not belong to project '${input.projectId}'.`,
            },
            update: {
              status: 'FAILED',
              failureCode: 'JIRA_EVIDENCE_NOT_FOUND',
              failureReason: `Evidence reference '${evidenceRefId}' does not exist or does not belong to project '${input.projectId}'.`,
            },
          });
          attachments.push(this.mapToDto(failedRecord));
          continue;
        }

        // Security Policy Check: Playwright Traces are strictly blocked
        if (evidenceRef.artifactType === 'PLAYWRIGHT_TRACE') {
          blockedCount++;
          const safeName = `[${externalIssue.jiraIssueKey}]_playwright_trace_${this.sanitizeFilename(evidenceRef.logicalName)}.zip`;
          const blockedRecord = await this.prisma.jiraEvidenceAttachment.upsert({
            where: {
              externalIssueId_evidenceReferenceId: {
                externalIssueId: externalIssue.id,
                evidenceReferenceId: evidenceRef.id,
              },
            },
            create: {
              projectId: input.projectId,
              externalIssueId: externalIssue.id,
              bugReportId: externalIssue.bugReportId,
              evidenceReferenceId: evidenceRef.id,
              evidenceType: evidenceRef.artifactType,
              artifactHash: evidenceRef.sha256 || 'UNKNOWN',
              jiraFilename: safeName,
              contentType: evidenceRef.mimeType || 'application/zip',
              sizeBytes: evidenceRef.byteSize || 0,
              status: 'BLOCKED',
              failureCode: 'JIRA_ATTACHMENT_INELIGIBLE',
              failureReason:
                'Sensitive trace content cannot be safely sanitized; manual review required',
            },
            update: {
              status: 'BLOCKED',
              failureCode: 'JIRA_ATTACHMENT_INELIGIBLE',
              failureReason:
                'Sensitive trace content cannot be safely sanitized; manual review required',
            },
          });
          attachments.push(this.mapToDto(blockedRecord));
          continue;
        }

        // 6. Read and verify original evidence from managed storage
        let rawBuffer: Buffer;
        let originalSha256: string;

        try {
          if (!evidenceRef.storageIdentity) {
            // Textual metadata evidence
            const contentStr = JSON.stringify(evidenceRef.metadataJson ?? {});
            rawBuffer = Buffer.from(contentStr, 'utf8');
            originalSha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');
          } else {
            const filePath = this.storageService.resolveManagedPath(
              evidenceRef.projectId,
              externalIssue.failureCase.testRunId,
              evidenceRef.executionId,
              evidenceRef.storageIdentity,
            );

            rawBuffer = await fs.readFile(filePath);
            originalSha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');

            // Verify integrity
            if (evidenceRef.sha256 && originalSha256 !== evidenceRef.sha256) {
              throw new JiraEvidenceIntegrityError(
                evidenceRef.id,
                `Expected ${evidenceRef.sha256}, got ${originalSha256}`,
              );
            }
          }
        } catch (err: unknown) {
          failedCount++;
          const reason = err instanceof Error ? err.message : String(err);
          const failedRecord = await this.prisma.jiraEvidenceAttachment.upsert({
            where: {
              externalIssueId_evidenceReferenceId: {
                externalIssueId: externalIssue.id,
                evidenceReferenceId: evidenceRef.id,
              },
            },
            create: {
              projectId: input.projectId,
              externalIssueId: externalIssue.id,
              bugReportId: externalIssue.bugReportId,
              evidenceReferenceId: evidenceRef.id,
              evidenceType: evidenceRef.artifactType,
              artifactHash: evidenceRef.sha256 || 'UNKNOWN',
              jiraFilename: this.sanitizeFilename(evidenceRef.logicalName),
              contentType: evidenceRef.mimeType || 'application/octet-stream',
              sizeBytes: evidenceRef.byteSize || 0,
              status: 'FAILED',
              failureCode:
                err instanceof JiraEvidenceIntegrityError
                  ? 'JIRA_EVIDENCE_INTEGRITY_FAILED'
                  : 'JIRA_EVIDENCE_NOT_FOUND',
              failureReason: reason,
            },
            update: {
              status: 'FAILED',
              failureCode:
                err instanceof JiraEvidenceIntegrityError
                  ? 'JIRA_EVIDENCE_INTEGRITY_FAILED'
                  : 'JIRA_EVIDENCE_NOT_FOUND',
              failureReason: reason,
            },
          });
          attachments.push(this.mapToDto(failedRecord));
          continue;
        }

        // Enforce maximum upload size limit
        if (rawBuffer.length > JIRA_BOUNDS.MAX_ATTACHMENT_SIZE_BYTES) {
          failedCount++;
          const failedRecord = await this.prisma.jiraEvidenceAttachment.upsert({
            where: {
              externalIssueId_evidenceReferenceId: {
                externalIssueId: externalIssue.id,
                evidenceReferenceId: evidenceRef.id,
              },
            },
            create: {
              projectId: input.projectId,
              externalIssueId: externalIssue.id,
              bugReportId: externalIssue.bugReportId,
              evidenceReferenceId: evidenceRef.id,
              evidenceType: evidenceRef.artifactType,
              artifactHash: originalSha256,
              jiraFilename: this.sanitizeFilename(evidenceRef.logicalName),
              contentType: evidenceRef.mimeType || 'application/octet-stream',
              sizeBytes: rawBuffer.length,
              status: 'FAILED',
              failureCode: 'JIRA_EVIDENCE_TOO_LARGE',
              failureReason: `Size ${rawBuffer.length} exceeds Jira limit of ${JIRA_BOUNDS.MAX_ATTACHMENT_SIZE_BYTES} bytes`,
            },
            update: {
              status: 'FAILED',
              failureCode: 'JIRA_EVIDENCE_TOO_LARGE',
              failureReason: `Size ${rawBuffer.length} exceeds Jira limit of ${JIRA_BOUNDS.MAX_ATTACHMENT_SIZE_BYTES} bytes`,
            },
          });
          attachments.push(this.mapToDto(failedRecord));
          continue;
        }

        // 7. Redaction & Sanitization
        let uploadBuffer: Buffer;
        let isDerivedRedacted = false;
        let sourceArtifactHash: string | undefined;
        let redactionVersion: string | undefined;

        if (this.isTextArtifact(evidenceRef.artifactType, evidenceRef.mimeType)) {
          const rawText = rawBuffer.toString('utf8');
          const { redacted, isRedacted } = this.redactor.redactText(rawText);
          uploadBuffer = Buffer.from(redacted, 'utf8');
          isDerivedRedacted = isRedacted;
          sourceArtifactHash = originalSha256;
          redactionVersion = '1.0.0';
        } else {
          uploadBuffer = rawBuffer;
          isDerivedRedacted = false;
        }

        const uploadSha256 = crypto.createHash('sha256').update(uploadBuffer).digest('hex');

        // 8. Safe Filename Construction
        const cleanLogical = this.sanitizeFilename(evidenceRef.logicalName);
        const prefix = `[${externalIssue.jiraIssueKey}]_${evidenceRef.artifactType.toLowerCase()}`;
        const jiraFilename = cleanLogical.startsWith(`[${externalIssue.jiraIssueKey}]`)
          ? cleanLogical
          : `${prefix}_${cleanLogical}`;

        const contentType = evidenceRef.mimeType || 'application/octet-stream';

        // 9. Audit Upload Attempt
        await this.prisma.jiraConnectionAudit.create({
          data: {
            connectionId: connection.id,
            projectId: input.projectId,
            eventType: 'EVIDENCE_ATTACHMENT_ATTEMPTED',
            actor: 'USER',
            details: {
              externalIssueId: externalIssue.id,
              jiraIssueKey: externalIssue.jiraIssueKey,
              evidenceReferenceId: evidenceRef.id,
              artifactType: evidenceRef.artifactType,
              jiraFilename,
              sizeBytes: uploadBuffer.length,
              isDerivedRedacted,
            },
          },
        });

        // 10. Dispatch Upload to Jira API
        try {
          const jiraResponses = await this.jiraClient.attachEvidence({
            baseUrl: connection.baseUrl,
            deploymentType: connection.deploymentType,
            authenticationType: connection.authenticationType,
            accountIdentifier: connection.accountIdentifier,
            apiToken: plainToken,
            issueIdOrKey: externalIssue.jiraIssueKey,
            filename: jiraFilename,
            content: uploadBuffer,
            mimeType: contentType,
            allowLocalhostForTesting: this.allowLocalhostForTesting,
          });

          const primaryAttachment = jiraResponses[0];
          const jiraAttachmentId = primaryAttachment ? primaryAttachment.id : undefined;
          const finalFilename = primaryAttachment ? primaryAttachment.filename : jiraFilename;

          attachedCount++;
          const attachedRecord = await this.prisma.jiraEvidenceAttachment.upsert({
            where: {
              externalIssueId_evidenceReferenceId: {
                externalIssueId: externalIssue.id,
                evidenceReferenceId: evidenceRef.id,
              },
            },
            create: {
              projectId: input.projectId,
              externalIssueId: externalIssue.id,
              bugReportId: externalIssue.bugReportId,
              evidenceReferenceId: evidenceRef.id,
              evidenceType: evidenceRef.artifactType,
              artifactHash: uploadSha256,
              jiraAttachmentId,
              jiraFilename: finalFilename,
              contentType,
              sizeBytes: uploadBuffer.length,
              status: 'ATTACHED',
              isDerivedRedacted,
              sourceArtifactHash,
              redactionVersion,
              uploadedAt: new Date(),
            },
            update: {
              artifactHash: uploadSha256,
              jiraAttachmentId,
              jiraFilename: finalFilename,
              contentType,
              sizeBytes: uploadBuffer.length,
              status: 'ATTACHED',
              failureCode: null,
              failureReason: null,
              isDerivedRedacted,
              sourceArtifactHash,
              redactionVersion,
              uploadedAt: new Date(),
            },
          });

          // Audit successful attachment
          await this.prisma.jiraConnectionAudit.create({
            data: {
              connectionId: connection.id,
              projectId: input.projectId,
              eventType: 'EVIDENCE_ATTACHED',
              actor: 'USER',
              details: {
                externalIssueId: externalIssue.id,
                jiraIssueKey: externalIssue.jiraIssueKey,
                evidenceReferenceId: evidenceRef.id,
                jiraAttachmentId,
                jiraFilename: finalFilename,
                sizeBytes: uploadBuffer.length,
              },
            },
          });

          attachments.push(this.mapToDto(attachedRecord));
        } catch (err: unknown) {
          failedCount++;
          const errorMessage = err instanceof Error ? err.message : String(err);
          const errorCode = (err as any)?.code || 'JIRA_ATTACHMENT_FAILED';

          const failedRecord = await this.prisma.jiraEvidenceAttachment.upsert({
            where: {
              externalIssueId_evidenceReferenceId: {
                externalIssueId: externalIssue.id,
                evidenceReferenceId: evidenceRef.id,
              },
            },
            create: {
              projectId: input.projectId,
              externalIssueId: externalIssue.id,
              bugReportId: externalIssue.bugReportId,
              evidenceReferenceId: evidenceRef.id,
              evidenceType: evidenceRef.artifactType,
              artifactHash: uploadSha256,
              jiraFilename,
              contentType,
              sizeBytes: uploadBuffer.length,
              status: 'FAILED',
              failureCode: errorCode,
              failureReason: errorMessage,
              isDerivedRedacted,
              sourceArtifactHash,
              redactionVersion,
            },
            update: {
              artifactHash: uploadSha256,
              jiraFilename,
              contentType,
              sizeBytes: uploadBuffer.length,
              status: 'FAILED',
              failureCode: errorCode,
              failureReason: errorMessage,
              isDerivedRedacted,
              sourceArtifactHash,
              redactionVersion,
            },
          });

          // Audit failure
          await this.prisma.jiraConnectionAudit.create({
            data: {
              connectionId: connection.id,
              projectId: input.projectId,
              eventType: 'EVIDENCE_ATTACHMENT_FAILED',
              actor: 'USER',
              details: {
                externalIssueId: externalIssue.id,
                jiraIssueKey: externalIssue.jiraIssueKey,
                evidenceReferenceId: evidenceRef.id,
                jiraFilename,
                error: errorMessage,
                errorCode,
              },
            },
          });

          attachments.push(this.mapToDto(failedRecord));
        }
      }

      return {
        externalIssueId: externalIssue.id,
        jiraIssueKey: externalIssue.jiraIssueKey,
        totalRequested: input.evidenceReferenceIds.length,
        attachedCount,
        blockedCount,
        failedCount,
        skippedCount,
        attachments,
      };
    } finally {
      releaseLock();
    }
  }

  /**
   * Retrieves all attachment records and their statuses for a given external Jira issue.
   */
  public async getAttachmentStatus(
    rawInput: GetAttachmentStatusInputDto,
  ): Promise<readonly JiraEvidenceAttachmentDto[]> {
    const input = getAttachmentStatusInputSchema.parse(rawInput);

    // Verify project existence
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }

    const records = await this.prisma.jiraEvidenceAttachment.findMany({
      where: {
        projectId: input.projectId,
        externalIssueId: input.externalIssueId,
      },
      orderBy: { createdAt: 'asc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  private mapToDto(model: PrismaJiraEvidenceAttachment): JiraEvidenceAttachmentDto {
    return {
      id: model.id,
      projectId: model.projectId,
      externalIssueId: model.externalIssueId,
      bugReportId: model.bugReportId,
      evidenceReferenceId: model.evidenceReferenceId,
      evidenceType: model.evidenceType,
      artifactHash: model.artifactHash,
      jiraAttachmentId: model.jiraAttachmentId ?? undefined,
      jiraFilename: model.jiraFilename,
      contentType: model.contentType,
      sizeBytes: model.sizeBytes,
      status: model.status as any,
      failureCode: model.failureCode ?? undefined,
      failureReason: model.failureReason ?? undefined,
      isDerivedRedacted: model.isDerivedRedacted,
      sourceArtifactHash: model.sourceArtifactHash ?? undefined,
      redactionVersion: model.redactionVersion ?? undefined,
      uploadedAt: model.uploadedAt ? model.uploadedAt.toISOString() : undefined,
      createdAt: model.createdAt.toISOString(),
      updatedAt: model.updatedAt.toISOString(),
    };
  }
}
