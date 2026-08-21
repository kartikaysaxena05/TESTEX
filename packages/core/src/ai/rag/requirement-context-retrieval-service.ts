/**
 * @file packages/core/src/ai/rag/requirement-context-retrieval-service.ts
 * Main orchestration service for RAG requirement context retrieval.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  RetrieveRequirementContextInputDto,
  RequirementContextPackDto,
  RagRetrievalConfigDto,
} from '@ai-quality/contracts';
import { getPrismaClient, DatabaseError } from '../../database/index.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../../projects/project-errors.js';
import { RagInvalidRequestError, RagRequirementChangedError } from './rag-errors.js';
import {
  DEFAULT_RAG_STRATEGY,
  DEFAULT_RAG_STRATEGY_VERSION,
  DEFAULT_RAG_PURPOSE,
  DEFAULT_RAG_LIMITS,
  DEFAULT_RAG_CONFIG,
  RAG_PLATFORM_LIMITS,
} from './rag-types.js';
import { RagContextAssembler } from './rag-context-assembler.js';
import { RagFilterRankingEngine } from './rag-filter-ranking-engine.js';
import { VectorSearchService } from '../vector-search-service.js';
import { getLogger, type ILogger } from '../../logging/index.js';

export interface RetrievalServiceOptions {
  readonly prisma?: PrismaClient;
  readonly vectorSearchService?: VectorSearchService;
  readonly logger?: ILogger;
}

export class RequirementContextRetrievalService {
  private readonly prisma?: PrismaClient;
  private readonly vectorSearchService?: VectorSearchService;
  private readonly assembler: RagContextAssembler;
  private readonly logger: ILogger;

  constructor(options?: RetrievalServiceOptions) {
    this.prisma = options?.prisma;
    this.vectorSearchService =
      options?.vectorSearchService ?? new VectorSearchService({ prisma: options?.prisma });
    this.assembler = new RagContextAssembler({
      prisma: this.prisma,
      vectorSearchService: this.vectorSearchService,
    });
    this.logger = options?.logger ?? getLogger();
  }

  private getPrisma(): PrismaClient {
    const client = this.prisma ?? getPrismaClient();
    if (!client) {
      throw new DatabaseError(
        'Database client is unavailable for RAG retrieval.',
        'DATABASE_UNAVAILABLE',
      );
    }
    return client;
  }

  /**
   * Returns default retrieval configuration parameters.
   */
  public getConfigDefaults(): RagRetrievalConfigDto {
    return DEFAULT_RAG_CONFIG;
  }

  /**
   * Retrieves an authoritative, bounded, project-isolated context pack for a requirement.
   */
  public async retrieveContext(
    input: RetrieveRequirementContextInputDto,
    signal?: AbortSignal,
  ): Promise<RequirementContextPackDto> {
    const startTime = performance.now();

    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new RagInvalidRequestError('Valid Project ID is required.');
    }
    if (!input.requirementId || typeof input.requirementId !== 'string') {
      throw new RagInvalidRequestError('Valid Requirement ID is required.');
    }

    const prisma = this.getPrisma();

    // 1. Authorize and Validate Project
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
    });

    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError(input.projectId);
    }

    // 2. Bound and Clamp Retrieval Limits (Defense in Depth against Limit Abuse)
    const rawLimits = input.limits ?? {};
    const clampedLimits = {
      maxItems: Math.min(
        Math.max(rawLimits.maxItems ?? DEFAULT_RAG_LIMITS.maxItems, RAG_PLATFORM_LIMITS.MIN_ITEMS),
        RAG_PLATFORM_LIMITS.MAX_ITEMS,
      ),
      maxCharacters: Math.min(
        Math.max(
          rawLimits.maxCharacters ?? DEFAULT_RAG_LIMITS.maxCharacters,
          RAG_PLATFORM_LIMITS.MIN_CHARACTERS,
        ),
        RAG_PLATFORM_LIMITS.MAX_CHARACTERS,
      ),
      maxEstimatedTokens: Math.min(
        Math.max(
          rawLimits.maxEstimatedTokens ?? DEFAULT_RAG_LIMITS.maxEstimatedTokens,
          RAG_PLATFORM_LIMITS.MIN_ESTIMATED_TOKENS,
        ),
        RAG_PLATFORM_LIMITS.MAX_ESTIMATED_TOKENS,
      ),
      maxRelatedRequirements: Math.min(
        Math.max(rawLimits.maxRelatedRequirements ?? DEFAULT_RAG_LIMITS.maxRelatedRequirements, 0),
        RAG_PLATFORM_LIMITS.MAX_RELATED_REQUIREMENTS,
      ),
      maxDocumentItems: Math.min(
        Math.max(rawLimits.maxDocumentItems ?? DEFAULT_RAG_LIMITS.maxDocumentItems, 0),
        RAG_PLATFORM_LIMITS.MAX_DOCUMENT_ITEMS,
      ),
      maxRepositoryItems: Math.min(
        Math.max(rawLimits.maxRepositoryItems ?? DEFAULT_RAG_LIMITS.maxRepositoryItems, 0),
        RAG_PLATFORM_LIMITS.MAX_REPOSITORY_ITEMS,
      ),
      maxRelationshipDepth: Math.min(
        Math.max(rawLimits.maxRelationshipDepth ?? DEFAULT_RAG_LIMITS.maxRelationshipDepth, 1),
        RAG_PLATFORM_LIMITS.MAX_RELATIONSHIP_DEPTH,
      ),
      minimumSimilarity:
        rawLimits.minimumSimilarity !== undefined
          ? Math.max(0, Math.min(1, rawLimits.minimumSimilarity))
          : DEFAULT_RAG_LIMITS.minimumSimilarity,
      includeStale: Boolean(rawLimits.includeStale),
    };

    const purpose = input.purpose ?? DEFAULT_RAG_PURPOSE;

    // 3. Assemble Raw Candidate Items from Multi-Source Foundation
    const rawContext = await this.assembler.assembleContext(
      {
        projectId: input.projectId,
        requirementId: input.requirementId,
        purpose,
        limits: clampedLimits,
      },
      signal,
    );

    // 4. Concurrency Check: Verify requirement has not changed during retrieval
    const freshCheck = await prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { updatedAt: true },
    });

    if (
      freshCheck &&
      freshCheck.updatedAt.getTime() !== rawContext.primaryRequirement.updatedAt.getTime()
    ) {
      throw new RagRequirementChangedError(input.requirementId);
    }

    // 5. Filter, Rank by Authority Tier, Deduplicate, and Enforce Context Budget
    const processed = RagFilterRankingEngine.process(rawContext.items, clampedLimits);

    const totalDurationMs = Math.round(performance.now() - startTime);

    const contextPack: RequirementContextPackDto = {
      projectId: input.projectId,
      requirementId: input.requirementId,
      requirementKey: rawContext.primaryRequirement.requirementKey,
      requirementVersion: rawContext.primaryRequirement.versionNumber,
      purpose,
      retrieval: {
        strategy: DEFAULT_RAG_STRATEGY,
        strategyVersion: DEFAULT_RAG_STRATEGY_VERSION,
        retrievedAt: new Date().toISOString(),
      },
      primaryRequirement: {
        id: rawContext.primaryRequirement.id,
        requirementKey: rawContext.primaryRequirement.requirementKey,
        title: rawContext.primaryRequirement.title,
        originalText: rawContext.primaryRequirement.originalText,
        type: rawContext.primaryRequirement.type,
        priority: rawContext.primaryRequirement.priority,
        status: rawContext.primaryRequirement.status,
        versionNumber: rawContext.primaryRequirement.versionNumber,
      },
      items: processed.items,
      budget: processed.budget,
      diagnostics: {
        candidateCount: processed.candidateCount,
        filteredCount: processed.filteredCount,
        deduplicatedCount: processed.deduplicatedCount,
        sourcesConsulted: rawContext.sourcesConsulted,
        warnings: rawContext.warnings,
        durationMs: totalDurationMs,
        vectorSearchDurationMs: rawContext.vectorSearchDurationMs,
      },
    };

    this.logger.info('rag.context_retrieved', {
      projectId: input.projectId,
      requirementId: input.requirementId,
      requirementKey: contextPack.requirementKey,
      purpose,
      itemCount: contextPack.items.length,
      estimatedTokens: contextPack.budget.estimatedTokens,
      truncated: contextPack.budget.truncated,
      durationMs: totalDurationMs,
    });

    return contextPack;
  }
}
