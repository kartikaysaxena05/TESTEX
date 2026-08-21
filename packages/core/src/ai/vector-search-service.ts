/**
 * @file packages/core/src/ai/vector-search-service.ts
 * Application service for project-isolated vector similarity search and rank retrieval.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  VectorSearchQueryDto,
  VectorMatchDto,
  EmbeddingProfileDto,
} from '@ai-quality/contracts';
import { getPrismaClient, DatabaseError } from '../database/index.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../projects/project-errors.js';
import { AiProviderGateway } from './ai-provider-gateway.js';
import { VectorEmbeddingRepository } from './vector-embedding-repository.js';
import { VectorValidator } from './vector-validator.js';
import { AiVectorSearchInvalidQueryError } from './ai-errors.js';
import {
  EMBEDDING_LIMITS,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_CANONICALIZATION_VERSION,
} from './ai-types.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface VectorSearchServiceOptions {
  readonly prisma?: PrismaClient;
  readonly gateway?: AiProviderGateway;
  readonly repository?: VectorEmbeddingRepository;
  readonly logger?: ILogger;
}

export class VectorSearchService {
  private readonly customPrisma?: PrismaClient;
  private readonly gateway: AiProviderGateway;
  private readonly repository: VectorEmbeddingRepository;
  private readonly logger: ILogger;

  constructor(options: VectorSearchServiceOptions = {}) {
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
   * Resolves effective embedding profile for the search operation.
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
   * Performs vector similarity search with strict project isolation.
   */
  public async searchSimilar(
    query: VectorSearchQueryDto,
    signal?: AbortSignal,
  ): Promise<readonly VectorMatchDto[]> {
    if (!query.projectId) {
      throw new AiVectorSearchInvalidQueryError('Search query requires a valid projectId.');
    }

    const project = await this.getPrisma().project.findUnique({
      where: { id: query.projectId },
    });

    if (!project) {
      throw new ProjectNotFoundError(query.projectId);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError(query.projectId);
    }

    if (!query.queryText && (!query.queryVector || query.queryVector.length === 0)) {
      throw new AiVectorSearchInvalidQueryError(
        'Vector similarity search requires either queryText or queryVector.',
      );
    }

    const profile = this.getEffectiveProfile(query.embeddingProfile);

    // Resolve or validate query vector
    let queryVector: readonly number[];
    if (query.queryVector && query.queryVector.length > 0) {
      queryVector = VectorValidator.validateVector(query.queryVector, profile.dimensions, {
        providerId: profile.providerId,
        model: profile.model,
      });
    } else {
      const text = query.queryText!.trim();
      if (text.length === 0) {
        throw new AiVectorSearchInvalidQueryError('Query text cannot be empty or whitespace.');
      }

      const embedResult = await this.gateway.embed(
        {
          inputs: [text],
          providerId: profile.providerId,
          model: profile.model,
          dimensions: profile.dimensions,
        },
        signal,
      );

      queryVector = embedResult.embeddings[0]!;
    }

    // Determine topK bounded within platform limits
    const topK = Math.min(
      Math.max(query.topK ?? EMBEDDING_LIMITS.DEFAULT_TOP_K, EMBEDDING_LIMITS.MIN_TOP_K),
      EMBEDDING_LIMITS.MAX_TOP_K,
    );

    const minSim =
      query.minimumSimilarity !== undefined
        ? Math.max(0, Math.min(1, query.minimumSimilarity))
        : undefined;

    const matches = await this.repository.searchSimilar({
      projectId: query.projectId,
      queryVector,
      profile,
      subjectTypes: query.subjectTypes,
      topK,
      minimumSimilarity: minSim,
    });

    this.logger.info('vector.search.completed', {
      projectId: query.projectId,
      resultCount: matches.length,
      topK,
      minSim,
      providerId: profile.providerId,
    });

    return Object.freeze(matches);
  }
}
