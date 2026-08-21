/**
 * @file packages/core/src/ai/vector-index-service.ts
 * Application service managing vector embedding lifecycle, canonical indexing, staleness detection, and idempotency.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  IndexSubjectsInputDto,
  IndexSubjectsResultDto,
  EmbeddingIndexStatusDto,
  EmbeddingProfileDto,
} from '@ai-quality/contracts';
import { getPrismaClient, DatabaseError } from '../database/index.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../projects/project-errors.js';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { VectorEmbeddingRepository } from './vector-embedding-repository.js';
import { CanonicalEmbeddingInputBuilder } from './canonical-embedding-input.js';
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_CANONICALIZATION_VERSION,
} from './ai-types.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface VectorIndexServiceOptions {
  readonly prisma?: PrismaClient;
  readonly gateway?: AiProviderGateway;
  readonly repository?: VectorEmbeddingRepository;
  readonly logger?: ILogger;
}

export class VectorIndexService {
  private readonly customPrisma?: PrismaClient;
  private readonly gateway: AiProviderGateway;
  private readonly repository: VectorEmbeddingRepository;
  private readonly logger: ILogger;

  constructor(options: VectorIndexServiceOptions = {}) {
    this.customPrisma = options.prisma;
    this.gateway = options.gateway ?? new AiProviderGateway();
    this.repository = options.repository ?? new VectorEmbeddingRepository(options.prisma);
    this.logger = options.logger ?? getLogger();
  }

  private getPrisma(): PrismaClient {
    const client = this.customPrisma ?? getPrismaClient();
    if (!client) {
      throw new DatabaseError('Database client is not available.', 'UNAVAILABLE');
    }
    return client;
  }

  /**
   * Retrieves the current embedding profile configuration.
   */
  public getEffectiveProfile(override?: Partial<EmbeddingProfileDto>): EmbeddingProfileDto {
    const defaultProvider = this.gateway.getRegistry().getDefaultProvider();
    const providerId = override?.providerId ?? defaultProvider.id;
    const model = override?.model ?? DEFAULT_EMBEDDING_MODEL;
    const dimensions = override?.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
    const canonicalizationVersion =
      override?.canonicalizationVersion ?? DEFAULT_CANONICALIZATION_VERSION;

    return {
      providerId,
      model,
      dimensions,
      canonicalizationVersion,
    };
  }

  /**
   * Indexes eligible subjects within a project into vector embeddings.
   */
  public async indexSubjects(
    input: IndexSubjectsInputDto,
    profileOverride?: Partial<EmbeddingProfileDto>,
    signal?: AbortSignal,
  ): Promise<IndexSubjectsResultDto> {
    const startTime = performance.now();
    const project = await this.getPrisma().project.findUnique({
      where: { id: input.projectId },
    });

    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError(input.projectId);
    }

    const profile = this.getEffectiveProfile(profileOverride);
    this.logger.info('vector.index.started', {
      projectId: input.projectId,
      subjectType: input.subjectType,
      providerId: profile.providerId,
      model: profile.model,
    });

    let totalProcessed = 0;
    let succeededCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    if (input.subjectType === 'REQUIREMENT') {
      const requirements = await this.getPrisma().requirement.findMany({
        where: {
          projectId: input.projectId,
          ...(input.subjectIds && input.subjectIds.length > 0
            ? { id: { in: [...input.subjectIds] } }
            : {}),
        },
      });

      totalProcessed = requirements.length;

      for (const req of requirements) {
        if (signal?.aborted) break;

        try {
          const canonical = CanonicalEmbeddingInputBuilder.buildCanonical({
            subjectType: 'REQUIREMENT',
            data: {
              requirementKey: req.requirementKey,
              title: req.title,
              originalText: req.originalText,
              type: req.type,
              priority: req.priority,
            },
          });

          // Check for existing identical current embedding (Idempotency)
          const existing = await this.repository.findCurrentEmbedding(
            input.projectId,
            'REQUIREMENT',
            req.id,
            profile,
          );

          if (existing && existing.inputSha256 === canonical.inputSha256 && !input.forceReindex) {
            skippedCount++;
            continue;
          }

          // Generate embedding from Gateway
          const embedResult = await this.gateway.embed(
            {
              inputs: [canonical.canonicalText],
              providerId: profile.providerId,
              model: profile.model,
              dimensions: profile.dimensions,
            },
            signal,
          );

          const vector = embedResult.embeddings[0];
          if (!vector) {
            failedCount++;
            continue;
          }

          // Atomically update in database: mark previous as stale and save new current
          await this.repository.markSubjectEmbeddingsStale(input.projectId, 'REQUIREMENT', req.id);

          await this.repository.saveEmbedding({
            projectId: input.projectId,
            subjectType: 'REQUIREMENT',
            subjectId: req.id,
            providerId: profile.providerId,
            model: profile.model,
            dimensions: profile.dimensions,
            canonicalizationVersion: canonical.canonicalizationVersion,
            inputSha256: canonical.inputSha256,
            vector,
            status: 'CURRENT',
            metadata: {
              requirementKey: req.requirementKey,
              title: req.title,
            },
          });

          succeededCount++;
        } catch (err: unknown) {
          failedCount++;
          this.logger.error('vector.index.subject_failed', err, {
            projectId: input.projectId,
            subjectId: req.id,
          });
        }
      }
    } else if (input.subjectType === 'REQUIREMENT_VERSION') {
      const versions = await this.getPrisma().requirementVersion.findMany({
        where: {
          projectId: input.projectId,
          ...(input.subjectIds && input.subjectIds.length > 0
            ? { id: { in: [...input.subjectIds] } }
            : {}),
        },
      });

      totalProcessed = versions.length;

      for (const ver of versions) {
        if (signal?.aborted) break;

        try {
          const canonical = CanonicalEmbeddingInputBuilder.buildCanonical({
            subjectType: 'REQUIREMENT_VERSION',
            data: {
              requirementKey: ver.requirementKeySnapshot,
              versionNumber: ver.versionNumber,
              title: ver.title,
              originalText: ver.originalText,
              type: ver.type,
              priority: ver.priority,
            },
          });

          const existing = await this.repository.findCurrentEmbedding(
            input.projectId,
            'REQUIREMENT_VERSION',
            ver.id,
            profile,
          );

          if (existing && existing.inputSha256 === canonical.inputSha256 && !input.forceReindex) {
            skippedCount++;
            continue;
          }

          const embedResult = await this.gateway.embed(
            {
              inputs: [canonical.canonicalText],
              providerId: profile.providerId,
              model: profile.model,
              dimensions: profile.dimensions,
            },
            signal,
          );

          const vector = embedResult.embeddings[0];
          if (!vector) {
            failedCount++;
            continue;
          }

          await this.repository.markSubjectEmbeddingsStale(
            input.projectId,
            'REQUIREMENT_VERSION',
            ver.id,
          );

          await this.repository.saveEmbedding({
            projectId: input.projectId,
            subjectType: 'REQUIREMENT_VERSION',
            subjectId: ver.id,
            sourceVersionId: ver.id,
            providerId: profile.providerId,
            model: profile.model,
            dimensions: profile.dimensions,
            canonicalizationVersion: canonical.canonicalizationVersion,
            inputSha256: canonical.inputSha256,
            vector,
            status: 'CURRENT',
            metadata: {
              requirementId: ver.requirementId,
              versionNumber: ver.versionNumber,
            },
          });

          succeededCount++;
        } catch (err: unknown) {
          failedCount++;
          this.logger.error('vector.index.version_failed', err, {
            projectId: input.projectId,
            versionId: ver.id,
          });
        }
      }
    } else if (input.subjectType === 'DOCUMENT_SECTION') {
      const extractions = await this.getPrisma().requirementDocumentExtraction.findMany({
        where: { projectId: input.projectId },
        include: { requirementDocument: true },
      });

      for (const ext of extractions) {
        if (signal?.aborted) break;
        const sections = Array.isArray(ext.sections)
          ? (ext.sections as Array<{ id?: string; title?: string; text?: string }>)
          : [];
        totalProcessed += sections.length;

        for (let i = 0; i < sections.length; i++) {
          const sec = sections[i];
          if (!sec || !sec.text) continue;

          try {
            const canonical = CanonicalEmbeddingInputBuilder.buildCanonical({
              subjectType: 'DOCUMENT_SECTION',
              data: {
                documentFileName: ext.requirementDocument.originalFileName,
                sectionTitle: sec.title ?? `Section ${i + 1}`,
                contentText: sec.text,
              },
            });

            const subjectId = sec.id && sec.id.length === 36 ? sec.id : ext.id;

            const existing = await this.repository.findCurrentEmbedding(
              input.projectId,
              'DOCUMENT_SECTION',
              subjectId,
              profile,
            );

            if (existing && existing.inputSha256 === canonical.inputSha256 && !input.forceReindex) {
              skippedCount++;
              continue;
            }

            const embedResult = await this.gateway.embed(
              {
                inputs: [canonical.canonicalText],
                providerId: profile.providerId,
                model: profile.model,
                dimensions: profile.dimensions,
              },
              signal,
            );

            const vector = embedResult.embeddings[0];
            if (!vector) {
              failedCount++;
              continue;
            }

            await this.repository.markSubjectEmbeddingsStale(
              input.projectId,
              'DOCUMENT_SECTION',
              subjectId,
            );

            await this.repository.saveEmbedding({
              projectId: input.projectId,
              subjectType: 'DOCUMENT_SECTION',
              subjectId,
              providerId: profile.providerId,
              model: profile.model,
              dimensions: profile.dimensions,
              canonicalizationVersion: canonical.canonicalizationVersion,
              inputSha256: canonical.inputSha256,
              vector,
              status: 'CURRENT',
              metadata: {
                documentId: ext.requirementDocumentId,
                fileName: ext.requirementDocument.originalFileName,
                sectionIndex: i,
              },
            });

            succeededCount++;
          } catch (err: unknown) {
            failedCount++;
            this.logger.error('vector.index.section_failed', err, {
              projectId: input.projectId,
              documentId: ext.requirementDocumentId,
              sectionIndex: i,
            });
          }
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime);

    this.logger.info('vector.index.completed', {
      projectId: input.projectId,
      totalProcessed,
      succeededCount,
      skippedCount,
      failedCount,
      durationMs,
    });

    return {
      projectId: input.projectId,
      totalProcessed,
      succeededCount,
      skippedCount,
      failedCount,
      durationMs,
    };
  }

  /**
   * Reindexes stale subjects in the project.
   */
  public async reindexStale(
    projectId: string,
    profileOverride?: Partial<EmbeddingProfileDto>,
    signal?: AbortSignal,
  ): Promise<IndexSubjectsResultDto> {
    return this.indexSubjects(
      {
        projectId,
        subjectType: 'REQUIREMENT',
        forceReindex: false,
      },
      profileOverride,
      signal,
    );
  }

  /**
   * Retrieves summary index status for the project.
   */
  public async getIndexStatus(
    projectId: string,
    profileOverride?: Partial<EmbeddingProfileDto>,
  ): Promise<EmbeddingIndexStatusDto> {
    const profile = this.getEffectiveProfile(profileOverride);
    return this.repository.getIndexStatus(projectId, profile);
  }
}
