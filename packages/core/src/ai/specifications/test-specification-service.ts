/**
 * @file packages/core/src/ai/specifications/test-specification-service.ts
 * End-to-end domain orchestration service for Phase 51 Test Specification Enrichment.
 */

import type {
  EnrichTestSpecificationInputDto,
  GetEnrichedTestSpecificationsInputDto,
  TestSpecificationEnrichmentResultDto,
} from '@ai-quality/contracts';
import { type PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/index.js';
import { getLogger, type ILogger } from '../../logging/index.js';
import { ProjectNotFoundError } from '../../projects/project-errors.js';
import { AiInvalidRequestError } from '../ai-errors.js';
import type { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import type { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import {
  TestSpecificationsGenerationFailedError,
  TestSpecificationsProjectMismatchError,
  TestSpecificationsRequirementChangedError,
  TestSpecificationsRequirementNotFoundError,
  TestSpecificationsScenarioNotFoundError,
} from './specification-errors.js';
import type {
  SpecificationPromptInput,
  StructuredSpecificationOutput,
} from './specification-prompt-definition.js';
import {
  TEST_SPECIFICATIONS_PROMPT_ID,
  TEST_SPECIFICATIONS_PROMPT_VERSION,
  type TestSpecificationValidationContext,
} from './specification-types.js';
import { TestSpecificationValidator } from './specification-validator.js';

export interface TestSpecificationServiceDeps {
  readonly prisma?: PrismaClient;
  readonly promptExecutionService: AiPromptExecutionService;
  readonly retrievalService: RequirementContextRetrievalService;
  readonly logger?: ILogger;
}

export class TestSpecificationEnrichmentService {
  private readonly prisma: PrismaClient;
  private readonly promptExecutionService: AiPromptExecutionService;
  private readonly retrievalService: RequirementContextRetrievalService;
  private readonly logger: ILogger;

  // In-memory cache for enriched specifications (fingerprint-keyed)
  private readonly resultCache = new Map<string, TestSpecificationEnrichmentResultDto>();

  constructor(deps: TestSpecificationServiceDeps) {
    const prismaInstance = deps.prisma ?? getPrismaClient();
    if (!prismaInstance) {
      throw new Error('PrismaClient is not initialized.');
    }
    this.prisma = prismaInstance;
    this.promptExecutionService = deps.promptExecutionService;
    this.retrievalService = deps.retrievalService;
    this.logger = deps.logger ?? getLogger();
  }

  /**
   * Generates or retrieves cached enriched test specifications for a requirement / scenario.
   */
  async enrichTestSpecifications(
    input: EnrichTestSpecificationInputDto,
  ): Promise<TestSpecificationEnrichmentResultDto> {
    const startTime = performance.now();

    // 1. Verify Project Existence and Status
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }
    if (project.status === 'ARCHIVED') {
      throw new AiInvalidRequestError(
        `Cannot enrich test specifications in an ARCHIVED project '${input.projectId}'.`,
      );
    }

    // 2. Fetch Authoritative Requirement and Active Version Snapshot
    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      include: {
        qualityAnalysis: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!requirement) {
      throw new TestSpecificationsRequirementNotFoundError(input.requirementId);
    }

    if (requirement.projectId !== input.projectId) {
      throw new TestSpecificationsProjectMismatchError(input.requirementId, input.projectId);
    }

    const currentVersion = requirement.versions[0];
    const versionNumber = currentVersion?.versionNumber ?? 1;
    const requirementStatement = currentVersion?.originalText ?? requirement.originalText;
    const requirementTitle = currentVersion?.title ?? requirement.title;
    const requirementType = currentVersion?.type ?? requirement.type;
    const initialUpdatedAt = requirement.updatedAt;

    // 3. Load Candidate Scenarios
    const candidates = await this.prisma.requirementScenarioCandidate.findMany({
      where: {
        requirementId: input.requirementId,
        projectId: input.projectId,
        ...(input.scenarioId ? { id: input.scenarioId } : {}),
      },
      orderBy: { ordinal: 'asc' },
    });

    if (input.scenarioId && candidates.length === 0) {
      throw new TestSpecificationsScenarioNotFoundError(input.scenarioId, input.requirementId);
    }

    // 4. Retrieve Bounded RAG Context
    const ragContext = await this.retrievalService.retrieveContext({
      projectId: input.projectId,
      requirementId: input.requirementId,
      purpose: 'TEST_GENERATION',
    });

    // 5. Compute Deterministic Input Fingerprint
    const candidateIds = candidates.map((c: { id: string }) => c.id).join(',');
    const contextIds = ragContext.items.map(i => i.id).join(',');
    const fingerprintInput = [
      requirement.id,
      versionNumber,
      requirementStatement,
      requirementType,
      candidateIds,
      contextIds,
    ].join('::');

    const inputFingerprint = crypto
      .createHash('sha256')
      .update(fingerprintInput, 'utf8')
      .digest('hex');

    const cacheKey = `${input.projectId}:${input.requirementId}:${input.scenarioId ?? 'ALL'}:${inputFingerprint}`;

    // 6. Check In-Memory Cache
    if (!input.forceRegenerate && this.resultCache.has(cacheKey)) {
      const cached = this.resultCache.get(cacheKey)!;
      this.logger.info('test_specifications.cache_hit', { cacheKey });
      return cached;
    }

    // 7. Check Testability Status
    const isNotTestable = requirement.qualityAnalysis?.testabilityStatus === 'NOT_TESTABLE';
    if (isNotTestable) {
      this.logger.warn('test_specifications.requirement_not_testable', {
        requirementId: input.requirementId,
        testabilityStatus: requirement.qualityAnalysis?.testabilityStatus,
      });

      const notTestableResult: TestSpecificationEnrichmentResultDto = {
        id: crypto.randomUUID(),
        projectId: input.projectId,
        requirementId: input.requirementId,
        requirementKey: requirement.requirementKey,
        requirementVersionNumber: versionNumber,
        scenarioId: input.scenarioId ?? null,
        inputFingerprint,
        providerId: 'SYSTEM',
        model: 'deterministic-rules',
        promptId: TEST_SPECIFICATIONS_PROMPT_ID,
        promptVersion: TEST_SPECIFICATIONS_PROMPT_VERSION,
        specifications: [],
        metrics: {
          totalSpecifications: 0,
          totalPreconditions: 0,
          totalTestDataItems: 0,
          totalExpectedResults: 0,
          reviewRequiredCount: 0,
          unknownCount: 0,
        },
        warnings: [
          {
            code: 'REQUIREMENT_NOT_TESTABLE',
            message:
              'Requirement testability status is NOT_TESTABLE. Detailed executable specifications cannot be grounded.',
          },
        ],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        durationMs: Math.round(performance.now() - startTime),
        createdAt: new Date().toISOString(),
      };

      this.resultCache.set(cacheKey, notTestableResult);
      return notTestableResult;
    }

    // 8. Prepare Prompt Input
    const promptInput: SpecificationPromptInput = {
      requirementKey: requirement.requirementKey,
      title: requirementTitle,
      statement: requirementStatement,
      versionNumber,
      classification: requirementType,
      testabilityStatus: requirement.qualityAnalysis?.testabilityStatus ?? 'TESTABLE',
      scenarios: candidates.map(c => ({
        scenarioKey: c.scenarioKey ?? `SCN-${String(c.ordinal + 1).padStart(3, '0')}`,
        title: c.title,
        objective: c.objective,
        rationale: c.rationale,
        requirementAspect: c.requirementAspect ?? undefined,
      })),
      retrievedContextItems: ragContext.items.map(item => ({
        id: item.id,
        sourceType: item.sourceType,
        title: item.title ?? 'Context Item',
        text: item.text,
        authorityTier: item.authorityTier,
      })),
    };

    this.logger.info('test_specifications.enrichment_started', {
      projectId: input.projectId,
      requirementId: input.requirementId,
      versionNumber,
      scenariosCount: candidates.length,
    });

    // 9. Execute Prompt via AiPromptExecutionService
    let executionResult;
    try {
      executionResult = await this.promptExecutionService.executePrompt<
        SpecificationPromptInput,
        StructuredSpecificationOutput
      >({
        promptId: TEST_SPECIFICATIONS_PROMPT_ID,
        version: TEST_SPECIFICATIONS_PROMPT_VERSION,
        input: promptInput,
        configOverride: input.configOverride,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn('test_specifications.generation_failed', {
        requirementId: input.requirementId,
        error: errorMsg,
      });
      throw new TestSpecificationsGenerationFailedError(errorMsg);
    }

    // 10. Validate and Sanitize Output
    const candidateScenarioKeys = candidates
      .map(c => c.scenarioKey)
      .filter((k): k is string => Boolean(k));

    const validEvidenceRefIds = new Set<string>([
      requirement.id,
      requirement.requirementKey,
      ...ragContext.items.map(i => i.id),
      ...candidateScenarioKeys,
    ]);

    const validScenarioIds = new Set<string>(candidates.map(c => c.id));

    const validationContext: TestSpecificationValidationContext = {
      requirementKey: requirement.requirementKey,
      requirementId: requirement.id,
      requirementText: requirementStatement,
      validEvidenceRefIds,
      validScenarioIds,
      isNotTestable: false,
    };

    const sanitized = TestSpecificationValidator.validateAndSanitize(
      executionResult.data,
      validationContext,
    );

    // 11. Bind scenario IDs where matching scenarioKeys exist
    const scenarioMap = new Map<string, string>();
    for (const c of candidates) {
      if (c.scenarioKey) {
        scenarioMap.set(c.scenarioKey, c.id);
      }
    }

    const boundSpecifications = sanitized.sanitizedSpecifications.map(spec => ({
      ...spec,
      scenarioId: spec.scenarioKey
        ? (scenarioMap.get(spec.scenarioKey) ?? candidates[0]?.id ?? null)
        : (candidates[0]?.id ?? null),
    }));

    // 12. Concurrency check: verify Requirement was not updated while LLM was running
    const freshRequirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { updatedAt: true },
    });

    if (freshRequirement && freshRequirement.updatedAt.getTime() !== initialUpdatedAt.getTime()) {
      throw new TestSpecificationsRequirementChangedError(requirement.requirementKey);
    }

    const durationMs = Math.round(performance.now() - startTime);

    const result: TestSpecificationEnrichmentResultDto = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      requirementId: input.requirementId,
      requirementKey: requirement.requirementKey,
      requirementVersionNumber: versionNumber,
      scenarioId: input.scenarioId ?? null,
      inputFingerprint,
      providerId: executionResult.providerId,
      model: executionResult.modelReported ?? 'default-model',
      promptId: executionResult.promptId,
      promptVersion: executionResult.promptVersion,
      specifications: boundSpecifications,
      metrics: sanitized.metrics,
      warnings: sanitized.warnings,
      usage: executionResult.usage,
      durationMs,
      createdAt: new Date().toISOString(),
    };

    this.resultCache.set(cacheKey, result);

    this.logger.info('test_specifications.enrichment_completed', {
      requirementId: input.requirementId,
      totalSpecifications: result.metrics.totalSpecifications,
      totalPreconditions: result.metrics.totalPreconditions,
      totalTestDataItems: result.metrics.totalTestDataItems,
      totalExpectedResults: result.metrics.totalExpectedResults,
      durationMs,
    });

    return result;
  }

  /**
   * Retrieves current cached enriched test specifications if available.
   */
  async getEnrichedTestSpecifications(
    input: GetEnrichedTestSpecificationsInputDto,
  ): Promise<TestSpecificationEnrichmentResultDto | null> {
    for (const [key, val] of this.resultCache.entries()) {
      if (
        key.startsWith(`${input.projectId}:${input.requirementId}:${input.scenarioId ?? 'ALL'}:`)
      ) {
        return val;
      }
    }
    return null;
  }
}
