/**
 * @file packages/core/src/failures/evidence/failure-evidence-ingestion-service.ts
 * Central service for Failure Evidence Ingestion, Normalization & Integrity (V6 Phase 75).
 */

import * as fs from 'node:fs/promises';
import {
  type PrismaClient,
  type FailureEvidenceReference as PrismaFailureEvidenceReference,
} from '@prisma/client';
import {
  ingestFailureEvidenceInputSchema,
  getFailureEvidencePackageInputSchema,
  verifyEvidenceIntegrityInputSchema,
  getFailureEvidenceArtifactContentInputSchema,
  type IngestFailureEvidenceInputDto,
  type GetFailureEvidencePackageInputDto,
  type VerifyEvidenceIntegrityInputDto,
  type GetFailureEvidenceArtifactContentInputDto,
  type FailureEvidencePackageDto,
  type FailureEvidenceIntegrityReportDto,
  type FailureEvidenceArtifactContentDto,
  type FailureEvidenceReferenceDto,
} from '@ai-quality/contracts';
import {
  FAILURE_EVIDENCE_BOUNDS,
  type IFailureEvidenceIngestionService,
} from './failure-evidence-types.js';
import {
  EvidenceReferenceNotFoundError,
  FailureEvidencePathTraversalError,
  FailureEvidenceArtifactMissingError,
} from './failure-evidence-errors.js';
import { FailureCaseNotFoundError, CrossProjectAccessDeniedError } from '../failure-errors.js';
import { FailureEvidenceRedactor } from './failure-evidence-redactor.js';
import { FailureSignatureGenerator } from './failure-signature-generator.js';
import { FailureEvidenceNormalizer } from './failure-evidence-normalizer.js';
import { FailureEvidenceIntegrityVerifier } from './failure-evidence-integrity-verifier.js';
import { EvidenceStorageService } from '../../execution/evidence/evidence-storage-service.js';
import type { ILogger } from '../../logging/index.js';

export interface FailureEvidenceIngestionServiceDependencies {
  readonly prisma: PrismaClient;
  readonly storageService?: EvidenceStorageService;
  readonly redactor?: FailureEvidenceRedactor;
  readonly signatureGenerator?: FailureSignatureGenerator;
  readonly normalizer?: FailureEvidenceNormalizer;
  readonly verifier?: FailureEvidenceIntegrityVerifier;
  readonly logger?: ILogger;
}

export class FailureEvidenceIngestionService implements IFailureEvidenceIngestionService {
  private readonly prisma: PrismaClient;
  private readonly storageService: EvidenceStorageService;
  private readonly redactor: FailureEvidenceRedactor;
  private readonly signatureGenerator: FailureSignatureGenerator;
  private readonly normalizer: FailureEvidenceNormalizer;
  private readonly verifier: FailureEvidenceIntegrityVerifier;
  private readonly logger?: ILogger;

  constructor(deps: FailureEvidenceIngestionServiceDependencies) {
    this.prisma = deps.prisma;
    this.storageService = deps.storageService ?? new EvidenceStorageService(undefined, deps.logger);
    this.redactor = deps.redactor ?? new FailureEvidenceRedactor();
    this.signatureGenerator = deps.signatureGenerator ?? new FailureSignatureGenerator();
    this.normalizer =
      deps.normalizer ?? new FailureEvidenceNormalizer(this.redactor, this.signatureGenerator);
    this.verifier =
      deps.verifier ?? new FailureEvidenceIntegrityVerifier(this.storageService, deps.logger);
    this.logger = deps.logger;
  }

  /**
   * Ingests, attaches, verifies, and normalizes evidence for a FailureCase.
   * Fully idempotent and atomic.
   */
  public async ingestEvidence(
    input: IngestFailureEvidenceInputDto,
  ): Promise<FailureEvidencePackageDto> {
    const data = ingestFailureEvidenceInputSchema.parse(input);

    // 1. Load FailureCase and verify project ownership
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: data.failureCaseId },
      include: {
        testCase: true,
      },
    });

    if (!failureCase || failureCase.projectId !== data.projectId) {
      throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
    }

    // 2. Load authoritative V5 execution
    const execution = await this.prisma.testCaseExecution.findUniqueOrThrow({
      where: { id: failureCase.executionId },
      include: {
        stepExecutions: { orderBy: { stepIndex: 'asc' } },
        assertionExecutionRecords: true,
        locatorHealingAttempts: true,
        testRun: {
          include: {
            environment: true,
          },
        },
        evidenceBundles: {
          include: {
            artifacts: true,
          },
        },
      },
    });

    if (execution.projectId !== data.projectId) {
      throw new CrossProjectAccessDeniedError(
        'TestCaseExecution',
        execution.id,
        data.projectId,
        execution.projectId,
      );
    }

    // 3. Discover V5 artifacts and idempotently link FailureEvidenceReference records
    const discoveredArtifacts = execution.evidenceBundles.flatMap(b => b.artifacts);

    await this.prisma.$transaction(async tx => {
      for (const artifact of discoveredArtifacts) {
        if (artifact.projectId !== data.projectId) {
          throw new CrossProjectAccessDeniedError(
            'ExecutionEvidenceArtifact',
            artifact.id,
            data.projectId,
            artifact.projectId,
          );
        }

        const existingRef = await tx.failureEvidenceReference.findFirst({
          where: {
            failureCaseId: failureCase.id,
            sourceArtifactId: artifact.id,
          },
        });

        if (!existingRef) {
          await tx.failureEvidenceReference.create({
            data: {
              projectId: data.projectId,
              failureCaseId: failureCase.id,
              executionId: execution.id,
              bundleId: artifact.bundleId,
              artifactType: artifact.artifactType,
              sourceArtifactId: artifact.id,
              stepExecutionId: artifact.stepExecutionId,
              storageIdentity: artifact.storageIdentity,
              logicalName: artifact.originalLogicalName,
              mimeType: artifact.mimeType,
              byteSize: artifact.byteSize,
              sha256: artifact.sha256,
              integrityStatus: 'UNVERIFIED',
              metadataJson: (artifact.metadataJson as any) ?? {},
            },
          });
        }
      }
    });

    // 4. Fetch all current evidence references for this case
    const references = await this.prisma.failureEvidenceReference.findMany({
      where: {
        failureCaseId: failureCase.id,
        projectId: data.projectId,
      },
      orderBy: { attachedAt: 'asc' },
    });

    // 5. Verify integrity if requested
    if (data.revalidateIntegrity) {
      for (const ref of references) {
        const report = await this.verifier.verifyReference({
          id: ref.id,
          projectId: ref.projectId,
          testRunId: execution.testRunId,
          executionId: ref.executionId,
          storageIdentity: ref.storageIdentity,
          logicalName: ref.logicalName,
          artifactType: ref.artifactType,
          byteSize: ref.byteSize,
          sha256: ref.sha256,
        });

        if (ref.integrityStatus !== report.status || ref.integrityDetails !== report.details) {
          await this.prisma.failureEvidenceReference.update({
            where: { id: ref.id },
            data: {
              integrityStatus: report.status as any,
              integrityDetails: report.details,
              lastVerifiedAt: new Date(),
            },
          });
          (ref as any).integrityStatus = report.status;
          (ref as any).integrityDetails = report.details;
          (ref as any).lastVerifiedAt = new Date();
        }
      }
    }

    // 6. Load sibling executions for retry history
    const siblingExecutions = await this.prisma.testCaseExecution.findMany({
      where: {
        testRunId: execution.testRunId,
        projectId: data.projectId,
      },
      orderBy: { attempt: 'asc' },
    });

    // 7. Canonical Normalization
    const mappedRefs = references.map(this.mapReferenceToDto);
    const normalizedPackage = this.normalizer.normalize({
      failureCase,
      execution,
      siblingExecutions,
      evidenceReferences: mappedRefs,
    });

    // 8. Update FailureCase with computed signature & completeness
    await this.prisma.failureCase.update({
      where: { id: failureCase.id },
      data: {
        failureSignature: normalizedPackage.failureSignature,
        evidenceCompleteness: normalizedPackage.completeness as any,
      },
    });

    this.logger?.info('failure_evidence.ingested', {
      projectId: data.projectId,
      failureCaseId: failureCase.id,
      referencesCount: references.length,
      completeness: normalizedPackage.completeness,
      integrity: normalizedPackage.integrityStatus,
      signature: normalizedPackage.failureSignature,
    });

    return normalizedPackage;
  }

  /**
   * Retrieves the normalized failure evidence package for a failure case.
   */
  public async getEvidencePackage(
    input: GetFailureEvidencePackageInputDto,
  ): Promise<FailureEvidencePackageDto> {
    const data = getFailureEvidencePackageInputSchema.parse(input);

    return this.ingestEvidence({
      projectId: data.projectId,
      failureCaseId: data.failureCaseId,
      revalidateIntegrity: false,
    });
  }

  /**
   * Revalidates cryptographic SHA-256 and physical presence for all evidence items.
   */
  public async verifyEvidenceIntegrity(
    input: VerifyEvidenceIntegrityInputDto,
  ): Promise<FailureEvidenceIntegrityReportDto> {
    const data = verifyEvidenceIntegrityInputSchema.parse(input);

    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: data.failureCaseId },
    });

    if (!failureCase || failureCase.projectId !== data.projectId) {
      throw new FailureCaseNotFoundError(data.failureCaseId, data.projectId);
    }

    const references = await this.prisma.failureEvidenceReference.findMany({
      where: {
        failureCaseId: failureCase.id,
        projectId: data.projectId,
      },
    });

    const verifiableRefs = references.map(ref => ({
      id: ref.id,
      projectId: ref.projectId,
      testRunId: failureCase.testRunId,
      executionId: ref.executionId,
      storageIdentity: ref.storageIdentity,
      logicalName: ref.logicalName,
      artifactType: ref.artifactType,
      byteSize: ref.byteSize,
      sha256: ref.sha256,
    }));

    const batchResult = await this.verifier.verifyBatch(
      data.projectId,
      data.failureCaseId,
      verifiableRefs,
    );

    // Update database status
    for (const report of batchResult.itemReports) {
      await this.prisma.failureEvidenceReference.update({
        where: { id: report.referenceId },
        data: {
          integrityStatus: report.status as any,
          integrityDetails: report.details,
          lastVerifiedAt: new Date(),
        },
      });
    }

    return {
      failureCaseId: failureCase.id,
      projectId: data.projectId,
      overallIntegrity: batchResult.overallIntegrity,
      itemsVerified: batchResult.itemsVerified,
      itemsMissing: batchResult.itemsMissing,
      itemsCorrupt: batchResult.itemsCorrupt,
      itemsUnavailable: batchResult.itemsUnavailable,
      verifiedAt: new Date().toISOString(),
      itemReports: batchResult.itemReports,
    };
  }

  /**
   * Safely reads the content of an evidence artifact for preview.
   * Strictly verifies multi-tenant ownership and rejects path traversal.
   */
  public async getEvidenceArtifactContent(
    input: GetFailureEvidenceArtifactContentInputDto,
  ): Promise<FailureEvidenceArtifactContentDto> {
    const data = getFailureEvidenceArtifactContentInputSchema.parse(input);

    const ref = await this.prisma.failureEvidenceReference.findUnique({
      where: { id: data.referenceId },
    });

    if (!ref || ref.projectId !== data.projectId || ref.failureCaseId !== data.failureCaseId) {
      throw new EvidenceReferenceNotFoundError(data.referenceId);
    }

    if (!ref.storageIdentity) {
      return {
        referenceId: ref.id,
        artifactType: ref.artifactType,
        mimeType: ref.mimeType || 'text/plain',
        byteSize: ref.byteSize || 0,
        sha256: ref.sha256 || '',
        contentBase64: null,
        contentText: JSON.stringify(ref.metadataJson),
        logicalName: ref.logicalName,
      };
    }

    const failureCase = await this.prisma.failureCase.findUniqueOrThrow({
      where: { id: ref.failureCaseId },
    });

    const filePath = this.storageService.resolveManagedPath(
      ref.projectId,
      failureCase.testRunId,
      ref.executionId,
      ref.storageIdentity,
    );

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        throw new FailureEvidenceArtifactMissingError(ref.id, ref.storageIdentity);
      }
      throw new FailureEvidencePathTraversalError(
        filePath,
        `Failed to access file: ${err?.message}`,
      );
    }

    if (stat.size > FAILURE_EVIDENCE_BOUNDS.MAX_ARTIFACT_BYTE_SIZE) {
      throw new FailureEvidencePathTraversalError(
        filePath,
        `Artifact size exceeds ${FAILURE_EVIDENCE_BOUNDS.MAX_ARTIFACT_BYTE_SIZE} bytes`,
      );
    }

    const buffer = await fs.readFile(filePath);
    const mime = (ref.mimeType || 'application/octet-stream').toLowerCase();

    const isImage = mime.startsWith('image/');
    const isText =
      mime.startsWith('text/') || mime === 'application/json' || mime === 'application/javascript';

    return {
      referenceId: ref.id,
      artifactType: ref.artifactType,
      mimeType: mime,
      byteSize: buffer.length,
      sha256: ref.sha256 || '',
      contentBase64: isImage ? buffer.toString('base64') : null,
      contentText: isText ? buffer.toString('utf8') : null,
      logicalName: ref.logicalName,
    };
  }

  private mapReferenceToDto(ref: PrismaFailureEvidenceReference): FailureEvidenceReferenceDto {
    return {
      id: ref.id,
      projectId: ref.projectId,
      failureCaseId: ref.failureCaseId,
      analysisRunId: ref.analysisRunId ?? undefined,
      executionId: ref.executionId,
      bundleId: ref.bundleId ?? undefined,
      artifactType: ref.artifactType,
      sourceArtifactId: ref.sourceArtifactId ?? undefined,
      stepExecutionId: ref.stepExecutionId ?? undefined,
      storageIdentity: ref.storageIdentity ?? undefined,
      logicalName: ref.logicalName,
      mimeType: ref.mimeType ?? undefined,
      byteSize: ref.byteSize ?? undefined,
      sha256: ref.sha256 ?? undefined,
      integrityStatus: (ref.integrityStatus as any) || 'UNVERIFIED',
      integrityDetails: ref.integrityDetails ?? undefined,
      lastVerifiedAt: ref.lastVerifiedAt ? ref.lastVerifiedAt.toISOString() : undefined,
      metadataJson: (ref.metadataJson as Record<string, unknown>) ?? {},
      attachedAt: ref.attachedAt.toISOString(),
    };
  }
}
