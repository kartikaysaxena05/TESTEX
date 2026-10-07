/**
 * @file packages/core/src/execution/evidence/execution-evidence-service.ts
 * Authoritative domain service for execution failure evidence bundles, artifact metadata, and managed persistence.
 */

import type { PrismaClient } from '@prisma/client';
import {
  EVIDENCE_BOUNDS,
  type IExecutionEvidenceService,
  type IEvidenceStorageService,
} from './evidence-types.js';
import {
  EvidenceDomainError,
  EvidenceBundleNotFoundError,
  EvidenceArtifactNotFoundError,
  EvidenceOwnershipMismatchError,
  EvidenceBundleAlreadyFinalizedError,
  EvidenceSizeLimitExceededError,
  EvidenceStorageError,
} from './evidence-errors.js';
import { EvidenceStorageService } from './evidence-storage-service.js';
import { EvidenceRedactor } from './evidence-redactor.js';
import type {
  ExecutionEvidenceBundleDto,
  ExecutionEvidenceArtifactDto,
  CreateEvidenceBundleInputDto,
  AddEvidenceArtifactInputDto,
  FinalizeEvidenceBundleInputDto,
  GetEvidenceBundleInputDto,
  ListEvidenceBundlesInputDto,
  ListEvidenceArtifactsInputDto,
  GetEvidenceArtifactMetadataInputDto,
  VerifyEvidenceArtifactIntegrityInputDto,
  PurgeExecutionEvidenceInputDto,
} from '@ai-quality/contracts';
import {
  createEvidenceBundleInputSchema,
  addEvidenceArtifactInputSchema,
  finalizeEvidenceBundleInputSchema,
  getEvidenceBundleInputSchema,
  listEvidenceBundlesInputSchema,
  listEvidenceArtifactsInputSchema,
  getEvidenceArtifactMetadataInputSchema,
  verifyEvidenceArtifactIntegrityInputSchema,
  purgeExecutionEvidenceInputSchema,
} from '@ai-quality/contracts';
import type { ILogger } from '../../logging/index.js';

export interface ExecutionEvidenceServiceOptions {
  readonly prisma: PrismaClient;
  readonly storageService?: IEvidenceStorageService;
  readonly redactor?: EvidenceRedactor;
  readonly logger?: ILogger;
}

export class ExecutionEvidenceService implements IExecutionEvidenceService {
  private readonly prisma: PrismaClient;
  private readonly storageService: IEvidenceStorageService;
  private readonly redactor: EvidenceRedactor;
  private readonly logger?: ILogger;

  constructor(options: ExecutionEvidenceServiceOptions) {
    this.prisma = options.prisma;
    this.storageService =
      options.storageService ?? new EvidenceStorageService(undefined, options.logger);
    this.redactor = options.redactor ?? new EvidenceRedactor();
    this.logger = options.logger;
  }

  /**
   * Creates an execution evidence bundle associated with an execution (and optional step).
   */
  public async createBundle(
    input: CreateEvidenceBundleInputDto,
  ): Promise<ExecutionEvidenceBundleDto> {
    const data = createEvidenceBundleInputSchema.parse(input);

    // 1. Authoritative relationship and ownership validation
    const execution = await this.prisma.testCaseExecution.findUnique({
      where: { id: data.executionId },
      include: { project: true, testRun: true },
    });

    if (
      !execution ||
      execution.projectId !== data.projectId ||
      execution.testRunId !== data.testRunId
    ) {
      throw new EvidenceOwnershipMismatchError(
        `Execution '${data.executionId}' does not belong to project '${data.projectId}' or run '${data.testRunId}'.`,
        { executionId: data.executionId, projectId: data.projectId, testRunId: data.testRunId },
      );
    }

    if (execution.project.status === 'ARCHIVED') {
      throw new EvidenceOwnershipMismatchError(
        `Project '${data.projectId}' is archived. Evidence operations are disallowed.`,
        { projectId: data.projectId },
      );
    }

    if (data.stepExecutionId) {
      const step = await this.prisma.stepExecutionRecord.findUnique({
        where: { id: data.stepExecutionId },
      });
      if (!step || step.executionId !== data.executionId || step.projectId !== data.projectId) {
        throw new EvidenceOwnershipMismatchError(
          `Step execution '${data.stepExecutionId}' does not belong to execution '${data.executionId}'.`,
          { stepExecutionId: data.stepExecutionId, executionId: data.executionId },
        );
      }
    }

    // 2. Enforce bundle capacity per execution
    const existingBundlesCount = await this.prisma.executionEvidenceBundle.count({
      where: { executionId: data.executionId },
    });

    if (existingBundlesCount >= EVIDENCE_BOUNDS.MAX_BUNDLES_PER_EXECUTION) {
      throw new EvidenceSizeLimitExceededError(
        existingBundlesCount + 1,
        EVIDENCE_BOUNDS.MAX_BUNDLES_PER_EXECUTION,
      );
    }

    // 3. Defensive secret redaction for metadata
    const redactionRes = this.redactor.redactMetadata(data.metadataJson ?? {});
    const errorSummary = data.errorSummary
      ? this.redactor.redactText(
          data.errorSummary.slice(0, EVIDENCE_BOUNDS.MAX_ERROR_SUMMARY_CHARS),
        ).data
      : undefined;

    const now = new Date();
    const created = await this.prisma.executionEvidenceBundle.create({
      data: {
        projectId: data.projectId,
        testRunId: data.testRunId,
        executionId: data.executionId,
        stepExecutionId: data.stepExecutionId,
        stepIndex: data.stepIndex,
        attempt: data.attempt ?? execution.attempt,
        status: 'PENDING',
        failureTimestamp: data.failureTimestamp ? new Date(data.failureTimestamp) : now,
        collectionStartedAt: now,
        errorSummary,
        metadataJson: redactionRes.data as any,
      },
      include: {
        artifacts: true,
      },
    });

    this.logger?.info('evidence.bundle_created', {
      bundleId: created.id,
      executionId: created.executionId,
      projectId: created.projectId,
    });

    return this.mapBundleToDto(created);
  }

  /**
   * Adds an evidence artifact to an active bundle, staging and promoting the file with SHA-256 integrity.
   */
  public async addArtifact(
    input: AddEvidenceArtifactInputDto,
  ): Promise<ExecutionEvidenceArtifactDto> {
    const data = addEvidenceArtifactInputSchema.parse(input);

    // 1. Validate bundle ownership and state
    const bundle = await this.prisma.executionEvidenceBundle.findUnique({
      where: { id: data.bundleId },
      include: { artifacts: true },
    });

    if (!bundle || bundle.projectId !== data.projectId || bundle.executionId !== data.executionId) {
      throw new EvidenceOwnershipMismatchError(
        `Bundle '${data.bundleId}' does not belong to project '${data.projectId}' or execution '${data.executionId}'.`,
        { bundleId: data.bundleId, projectId: data.projectId, executionId: data.executionId },
      );
    }

    if (bundle.status === 'COMPLETE' || bundle.status === 'FAILED') {
      throw new EvidenceBundleAlreadyFinalizedError(bundle.id, bundle.status);
    }

    if (bundle.artifacts.length >= EVIDENCE_BOUNDS.MAX_ARTIFACTS_PER_BUNDLE) {
      throw new EvidenceSizeLimitExceededError(
        bundle.artifacts.length + 1,
        EVIDENCE_BOUNDS.MAX_ARTIFACTS_PER_BUNDLE,
      );
    }

    // 2. Redact metadata & text content if text-based
    let finalContent = data.content;
    let computedRedactionStatus = data.redactionStatus ?? 'NONE';

    if (typeof data.content === 'string') {
      const redRes = this.redactor.redactText(data.content);
      finalContent = redRes.data;
      if (redRes.redactionStatus === 'REDACTED') {
        computedRedactionStatus = 'REDACTED';
      }
    }

    const metadataRedaction = this.redactor.redactMetadata(data.metadataJson ?? {});
    if (metadataRedaction.redactionStatus === 'REDACTED') {
      computedRedactionStatus = 'REDACTED';
    }

    // 3. Stage file to temporary storage while calculating SHA-256 and byte size
    const staged = await this.storageService.stageArtifact({
      projectId: data.projectId,
      testRunId: data.testRunId,
      executionId: data.executionId,
      content: finalContent,
      mimeType: data.mimeType,
      originalLogicalName: data.originalLogicalName,
    });

    const now = new Date();
    let createdArtifactRecord: any;

    try {
      // 4. Atomically insert artifact metadata into DB
      createdArtifactRecord = await this.prisma.$transaction(async tx => {
        const art = await tx.executionEvidenceArtifact.create({
          data: {
            projectId: data.projectId,
            bundleId: data.bundleId,
            testRunId: data.testRunId,
            executionId: data.executionId,
            stepExecutionId: data.stepExecutionId ?? bundle.stepExecutionId,
            artifactType: data.artifactType,
            storageIdentity: staged.storageIdentity,
            originalLogicalName: data.originalLogicalName.slice(
              0,
              EVIDENCE_BOUNDS.MAX_LOGICAL_NAME_LENGTH,
            ),
            mimeType: staged.mimeType.slice(0, EVIDENCE_BOUNDS.MAX_MIME_TYPE_LENGTH),
            byteSize: staged.byteSize,
            sha256: staged.sha256,
            redactionStatus: computedRedactionStatus,
            capturedAt: data.capturedAt ? new Date(data.capturedAt) : now,
            persistedAt: now,
            metadataJson: metadataRedaction.data as any,
          },
        });

        // Update bundle to COLLECTING status
        await tx.executionEvidenceBundle.update({
          where: { id: bundle.id },
          data: { status: 'COLLECTING' },
        });

        return art;
      });

      // 5. Promote staged file to managed read-only storage
      await this.storageService.promoteStagedArtifact(
        staged.stagingFilePath,
        data.projectId,
        data.testRunId,
        data.executionId,
        staged.storageIdentity,
      );

      this.logger?.info('evidence.artifact_added', {
        artifactId: createdArtifactRecord.id,
        bundleId: bundle.id,
        artifactType: data.artifactType,
        byteSize: staged.byteSize,
        sha256: staged.sha256,
      });

      return this.mapArtifactToDto(createdArtifactRecord);
    } catch (err) {
      // Clean up staged file on any error
      await this.storageService.cleanupStagingFile(staged.stagingFilePath).catch(() => {});
      if (err instanceof EvidenceDomainError) {
        throw err;
      }
      throw new EvidenceStorageError(
        `Failed to save evidence artifact metadata: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /**
   * Finalizes an evidence collection bundle (e.g. COMPLETE, PARTIAL, or FAILED).
   */
  public async finalizeBundle(
    input: FinalizeEvidenceBundleInputDto,
  ): Promise<ExecutionEvidenceBundleDto> {
    const data = finalizeEvidenceBundleInputSchema.parse(input);

    const bundle = await this.prisma.executionEvidenceBundle.findUnique({
      where: { id: data.bundleId },
      include: { artifacts: true },
    });

    if (!bundle || bundle.projectId !== data.projectId) {
      throw new EvidenceBundleNotFoundError(data.bundleId, data.projectId);
    }

    const errorSummary = data.errorSummary
      ? this.redactor.redactText(
          data.errorSummary.slice(0, EVIDENCE_BOUNDS.MAX_ERROR_SUMMARY_CHARS),
        ).data
      : bundle.errorSummary;

    const metadataRedaction = this.redactor.redactMetadata(data.metadataJson ?? {});

    const updated = await this.prisma.executionEvidenceBundle.update({
      where: { id: bundle.id },
      data: {
        status: data.status,
        collectionCompletedAt: new Date(),
        errorSummary,
        metadataJson: {
          ...(bundle.metadataJson as Record<string, unknown>),
          ...metadataRedaction.data,
        } as any,
      },
      include: {
        artifacts: {
          orderBy: { capturedAt: 'asc' },
        },
      },
    });

    this.logger?.info('evidence.bundle_finalized', {
      bundleId: updated.id,
      status: updated.status,
      artifactCount: updated.artifacts.length,
    });

    return this.mapBundleToDto(updated);
  }

  /**
   * Retrieves an evidence bundle and its artifacts.
   */
  public async getBundle(input: GetEvidenceBundleInputDto): Promise<ExecutionEvidenceBundleDto> {
    const data = getEvidenceBundleInputSchema.parse(input);

    const bundle = await this.prisma.executionEvidenceBundle.findUnique({
      where: { id: data.bundleId },
      include: {
        artifacts: {
          orderBy: { capturedAt: 'asc' },
        },
      },
    });

    if (!bundle || bundle.projectId !== data.projectId) {
      throw new EvidenceBundleNotFoundError(data.bundleId, data.projectId);
    }

    return this.mapBundleToDto(bundle);
  }

  /**
   * Lists evidence bundles for a project with filters and pagination.
   */
  public async listBundles(input: ListEvidenceBundlesInputDto): Promise<{
    readonly items: readonly ExecutionEvidenceBundleDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }> {
    const data = listEvidenceBundlesInputSchema.parse(input);
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? EVIDENCE_BOUNDS.DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      projectId: data.projectId,
    };
    if (data.testRunId) where.testRunId = data.testRunId;
    if (data.executionId) where.executionId = data.executionId;
    if (data.stepExecutionId) where.stepExecutionId = data.stepExecutionId;
    if (data.status) where.status = data.status;

    const [total, bundles] = await Promise.all([
      this.prisma.executionEvidenceBundle.count({ where: where as any }),
      this.prisma.executionEvidenceBundle.findMany({
        where: where as any,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
          artifacts: {
            orderBy: { capturedAt: 'asc' },
          },
        },
      }),
    ]);

    return {
      items: bundles.map(b => this.mapBundleToDto(b)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Lists individual evidence artifacts for a project with filtering and pagination.
   */
  public async listArtifacts(input: ListEvidenceArtifactsInputDto): Promise<{
    readonly items: readonly ExecutionEvidenceArtifactDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }> {
    const data = listEvidenceArtifactsInputSchema.parse(input);
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? EVIDENCE_BOUNDS.DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      projectId: data.projectId,
    };
    if (data.bundleId) where.bundleId = data.bundleId;
    if (data.testRunId) where.testRunId = data.testRunId;
    if (data.executionId) where.executionId = data.executionId;
    if (data.stepExecutionId) where.stepExecutionId = data.stepExecutionId;
    if (data.artifactType) where.artifactType = data.artifactType;

    const [total, artifacts] = await Promise.all([
      this.prisma.executionEvidenceArtifact.count({ where: where as any }),
      this.prisma.executionEvidenceArtifact.findMany({
        where: where as any,
        skip,
        take: pageSize,
        orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      items: artifacts.map(a => this.mapArtifactToDto(a)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Retrieves metadata for a single evidence artifact.
   */
  public async getArtifactMetadata(
    input: GetEvidenceArtifactMetadataInputDto,
  ): Promise<ExecutionEvidenceArtifactDto> {
    const data = getEvidenceArtifactMetadataInputSchema.parse(input);

    const artifact = await this.prisma.executionEvidenceArtifact.findUnique({
      where: { id: data.artifactId },
    });

    if (!artifact || artifact.projectId !== data.projectId) {
      throw new EvidenceArtifactNotFoundError(data.artifactId, data.projectId);
    }

    return this.mapArtifactToDto(artifact);
  }

  /**
   * Reads raw binary or text content from managed storage, validating cryptographic hash.
   */
  public async readArtifactContent(input: {
    readonly projectId: string;
    readonly artifactId: string;
  }): Promise<{
    readonly buffer: Buffer;
    readonly mimeType: string;
    readonly byteSize: number;
    readonly sha256: string;
  }> {
    const artifact = await this.prisma.executionEvidenceArtifact.findUnique({
      where: { id: input.artifactId },
    });

    if (!artifact || artifact.projectId !== input.projectId) {
      throw new EvidenceArtifactNotFoundError(input.artifactId, input.projectId);
    }

    const fileRes = await this.storageService.readArtifact({
      projectId: artifact.projectId,
      testRunId: artifact.testRunId,
      executionId: artifact.executionId,
      storageIdentity: artifact.storageIdentity,
      expectedSha256: artifact.sha256,
    });

    return {
      buffer: fileRes.buffer,
      mimeType: artifact.mimeType,
      byteSize: fileRes.byteSize,
      sha256: fileRes.sha256,
    };
  }

  /**
   * Cryptographically verifies artifact SHA-256 integrity against stored file bytes.
   */
  public async verifyArtifactIntegrity(input: VerifyEvidenceArtifactIntegrityInputDto): Promise<{
    readonly isValid: boolean;
    readonly expectedSha256: string;
    readonly actualSha256: string;
    readonly byteSize: number;
  }> {
    const data = verifyEvidenceArtifactIntegrityInputSchema.parse(input);

    const artifact = await this.prisma.executionEvidenceArtifact.findUnique({
      where: { id: data.artifactId },
    });

    if (!artifact || artifact.projectId !== data.projectId) {
      throw new EvidenceArtifactNotFoundError(data.artifactId, data.projectId);
    }

    return await this.storageService.verifyArtifactIntegrity({
      projectId: artifact.projectId,
      testRunId: artifact.testRunId,
      executionId: artifact.executionId,
      storageIdentity: artifact.storageIdentity,
      expectedSha256: artifact.sha256,
    });
  }

  /**
   * Purges all evidence bundles, artifacts, and managed files for an execution.
   */
  public async purgeExecutionEvidence(
    input: PurgeExecutionEvidenceInputDto,
  ): Promise<{ readonly deletedBundlesCount: number; readonly deletedArtifactsCount: number }> {
    const data = purgeExecutionEvidenceInputSchema.parse(input);

    const execution = await this.prisma.testCaseExecution.findUnique({
      where: { id: data.executionId },
    });

    if (!execution || execution.projectId !== data.projectId) {
      throw new EvidenceOwnershipMismatchError(
        `Execution '${data.executionId}' does not belong to project '${data.projectId}'.`,
      );
    }

    const [deletedArtifacts, deletedBundles] = await this.prisma.$transaction(async tx => {
      const artCount = await tx.executionEvidenceArtifact.deleteMany({
        where: { executionId: data.executionId, projectId: data.projectId },
      });
      const bunCount = await tx.executionEvidenceBundle.deleteMany({
        where: { executionId: data.executionId, projectId: data.projectId },
      });
      return [artCount.count, bunCount.count];
    });

    // Delete directory from managed storage
    await this.storageService.deleteExecutionDirectory(
      data.projectId,
      execution.testRunId,
      data.executionId,
    );

    return {
      deletedBundlesCount: deletedBundles,
      deletedArtifactsCount: deletedArtifacts,
    };
  }

  private mapBundleToDto(bundle: any): ExecutionEvidenceBundleDto {
    return {
      id: bundle.id,
      projectId: bundle.projectId,
      testRunId: bundle.testRunId,
      executionId: bundle.executionId,
      stepExecutionId: bundle.stepExecutionId ?? undefined,
      stepIndex: bundle.stepIndex ?? undefined,
      attempt: bundle.attempt,
      status: bundle.status,
      failureTimestamp: bundle.failureTimestamp ? bundle.failureTimestamp.toISOString() : undefined,
      collectionStartedAt: bundle.collectionStartedAt
        ? bundle.collectionStartedAt.toISOString()
        : undefined,
      collectionCompletedAt: bundle.collectionCompletedAt
        ? bundle.collectionCompletedAt.toISOString()
        : undefined,
      retentionStatus: bundle.retentionStatus,
      errorSummary: bundle.errorSummary ?? undefined,
      metadataJson: (bundle.metadataJson as Record<string, unknown>) ?? {},
      createdAt: bundle.createdAt.toISOString(),
      updatedAt: bundle.updatedAt.toISOString(),
      artifacts: Array.isArray(bundle.artifacts)
        ? bundle.artifacts.map((a: any) => this.mapArtifactToDto(a))
        : [],
    };
  }

  private mapArtifactToDto(artifact: any): ExecutionEvidenceArtifactDto {
    return {
      id: artifact.id,
      projectId: artifact.projectId,
      bundleId: artifact.bundleId,
      testRunId: artifact.testRunId,
      executionId: artifact.executionId,
      stepExecutionId: artifact.stepExecutionId ?? undefined,
      artifactType: artifact.artifactType,
      storageIdentity: artifact.storageIdentity,
      originalLogicalName: artifact.originalLogicalName,
      mimeType: artifact.mimeType,
      byteSize: artifact.byteSize,
      sha256: artifact.sha256,
      redactionStatus: artifact.redactionStatus,
      capturedAt: artifact.capturedAt.toISOString(),
      persistedAt: artifact.persistedAt.toISOString(),
      metadataJson: (artifact.metadataJson as Record<string, unknown>) ?? {},
      createdAt: artifact.createdAt.toISOString(),
    };
  }
}
