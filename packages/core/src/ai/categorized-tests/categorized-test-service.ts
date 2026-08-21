/**
 * @file packages/core/src/ai/categorized-tests/categorized-test-service.ts
 * End-to-end domain orchestration service for Phase 50 Positive, Negative, Boundary & Validation Test Generation.
 */

import {
  type CategorizedTestDesignDto,
  type CategorizedTestGenerationResultDto,
  type CategoryAssessmentDto,
  type GenerateCategorizedTestsInputDto,
  type GetCategorizedTestsInputDto,
  type StructuredTestDesignDto,
} from '@ai-quality/contracts';
import { type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { DatabaseError, getPrismaClient } from '../../database/index.js';
import { getLogger, type ILogger } from '../../logging/index.js';
import { ProjectNotFoundError } from '../../projects/project-errors.js';
import { AiInvalidRequestError } from '../ai-errors.js';
import { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import { RagRequirementChangedError } from '../rag/rag-errors.js';
import { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import {
  CategorizedTestsProjectMismatchError,
  CategorizedTestsRequirementChangedError,
  CategorizedTestsRequirementNotFoundError,
  CategorizedTestsScenarioNotFoundError,
} from './categorized-test-errors.js';
import type {
  CategorizedTestPromptInput,
  StructuredCategorizedTestOutput,
} from './categorized-test-prompt-definition.js';
import {
  CATEGORIZED_TESTS_PROMPT_ID,
  CATEGORIZED_TESTS_PROMPT_VERSION,
} from './categorized-test-types.js';
import { CategorizedTestValidator } from './categorized-test-validator.js';

export interface CategorizedTestServiceOptions {
  readonly prisma?: PrismaClient;
  readonly promptExecutionService?: AiPromptExecutionService;
  readonly retrievalService?: RequirementContextRetrievalService;
  readonly logger?: ILogger;
}

export class CategorizedTestService {
  private readonly prisma: PrismaClient;
  private readonly promptExecutionService: AiPromptExecutionService;
  private readonly retrievalService: RequirementContextRetrievalService;
  private readonly logger: ILogger;

  // In-memory cache for Phase 50 derived intelligence (keyed by projectId:requirementId:fingerprint)
  private readonly memoryCache = new Map<string, CategorizedTestGenerationResultDto>();

  constructor(options: CategorizedTestServiceOptions = {}) {
    const defaultPrisma = getPrismaClient();
    if (!options.prisma && !defaultPrisma) {
      throw new DatabaseError('Prisma client is not initialized. Call initializeDatabase() first.');
    }
    this.prisma = options.prisma ?? defaultPrisma!;
    this.promptExecutionService = options.promptExecutionService ?? new AiPromptExecutionService();
    this.retrievalService = options.retrievalService ?? new RequirementContextRetrievalService();
    this.logger = options.logger ?? getLogger();
  }

  /**
   * Generates or retrieves cached categorized test designs for a requirement.
   */
  public async generateCategorizedTests(
    input: GenerateCategorizedTestsInputDto,
  ): Promise<CategorizedTestGenerationResultDto> {
    const startTime = performance.now();

    // 1. Verify Project
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, status: true },
    });
    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }
    if (project.status === 'ARCHIVED') {
      throw new AiInvalidRequestError(
        'PROJECT_ARCHIVED',
        `Cannot generate categorized tests for requirement in archived project "${input.projectId}".`,
      );
    }

    // 2. Load Authoritative Requirement
    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      include: {
        metadata: true,
        qualityAnalysis: true,
        qualityFindings: {
          where: { reviewStatus: 'OPEN' },
        },
        outgoingRelationships: {
          where: { status: 'CONFIRMED' },
          include: {
            targetRequirement: true,
          },
        },
        repositoryEvidence: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!requirement) {
      throw new CategorizedTestsRequirementNotFoundError(input.requirementId);
    }
    if (requirement.projectId !== input.projectId) {
      throw new CategorizedTestsProjectMismatchError(input.projectId, input.requirementId);
    }
    if (requirement.status === 'ARCHIVED') {
      throw new AiInvalidRequestError(
        'REQUIREMENT_ARCHIVED',
        `Cannot generate tests for archived requirement "${requirement.requirementKey}".`,
      );
    }

    const latestVersion = requirement.versions[0];
    const versionNumber = latestVersion?.versionNumber ?? 1;

    // 3. Load Phase 47 AI Analysis
    const currentAiAnalysis = await this.prisma.requirementAiAnalysis.findFirst({
      where: {
        requirementId: input.requirementId,
        status: 'CURRENT',
      },
      orderBy: { createdAt: 'desc' },
    });

    // 4. Load Phase 48 Test Design Intelligence
    const currentTestDesign = await this.prisma.requirementTestDesign.findFirst({
      where: {
        requirementId: input.requirementId,
        status: 'CURRENT',
      },
      orderBy: { createdAt: 'desc' },
    });

    // 5. Load Phase 49 Generated Scenario Candidates
    const scenarioGeneration = await this.prisma.requirementScenarioGeneration.findFirst({
      where: {
        requirementId: input.requirementId,
        status: 'GENERATED',
      },
      include: {
        candidates: {
          orderBy: { ordinal: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let scenarios = scenarioGeneration?.candidates ?? [];
    if (input.scenarioId) {
      const matched = scenarios.find(s => s.id === input.scenarioId);
      if (!matched) {
        throw new CategorizedTestsScenarioNotFoundError(input.scenarioId);
      }
      scenarios = [matched];
    }

    // 6. Retrieve Phase 46 Grounded RAG Context Pack
    let ragPack;
    try {
      ragPack = await this.retrievalService.retrieveContext({
        projectId: input.projectId,
        requirementId: input.requirementId,
        purpose: 'TEST_GENERATION',
        limits: { maxItems: 8 },
      });
    } catch (err: unknown) {
      if (err instanceof RagRequirementChangedError) {
        throw new CategorizedTestsRequirementChangedError(err.message);
      }
      this.logger.warn('categorized_tests.rag_retrieval_failed', {
        projectId: input.projectId,
        requirementId: input.requirementId,
        error: err instanceof Error ? err.message : String(err),
      });
      ragPack = {
        items: [],
        warnings: [{ code: 'RAG_UNAVAILABLE', message: 'RAG retrieval failed.' }],
      };
    }

    // 7. Check Testability / Non-Testable Status
    const isNotTestable =
      requirement.qualityAnalysis?.testabilityStatus === 'NOT_TESTABLE' ||
      currentTestDesign?.applicability === 'NOT_TESTABLE';

    if (isNotTestable) {
      return this.createUntestableResult({
        projectId: input.projectId,
        requirementId: input.requirementId,
        requirementKey: requirement.requirementKey,
        versionNumber,
        generationId: scenarioGeneration?.id ?? null,
        startTime,
      });
    }

    // 8. Compute Deterministic Input Fingerprint
    const structuredTestDesign = currentTestDesign?.structuredDesignJson as
      StructuredTestDesignDto | undefined;

    const inputFingerprint = this.computeInputFingerprint({
      requirementStatement: requirement.originalText,
      versionNumber,
      classification: requirement.type,
      scenarioIds: scenarios.map(s => s.id),
      contextItemIds: ragPack.items.map(i => i.id),
    });

    const cacheKey = `${input.projectId}:${input.requirementId}:${input.scenarioId ?? 'ALL'}:${inputFingerprint}`;

    // 9. Cache Lookup (unless forceRegenerate is true)
    if (!input.forceRegenerate && this.memoryCache.has(cacheKey)) {
      this.logger.info('categorized_tests.cache_hit', { cacheKey });
      return this.memoryCache.get(cacheKey)!;
    }

    // 10. Assemble Prompt Input
    const promptInput: CategorizedTestPromptInput = {
      requirementKey: requirement.requirementKey,
      title: requirement.title,
      statement: requirement.originalText,
      versionNumber,
      classification: requirement.type,
      testabilityStatus: requirement.qualityAnalysis?.testabilityStatus ?? 'TESTABLE',
      scenarios: scenarios.map(s => ({
        id: s.id,
        scenarioKey: s.scenarioKey,
        title: s.title,
        objective: s.objective,
        rationale: s.rationale,
        requirementAspect: s.requirementAspect,
        testLevel: s.testLevel,
        testIntent: s.testIntent,
      })),
      qualityFindings: requirement.qualityFindings.map(f => `${f.category}: ${f.message}`),
      relationships: requirement.outgoingRelationships.map(
        r =>
          `${r.relationshipType} -> ${r.targetRequirement?.requirementKey ?? r.targetRequirementId}`,
      ),
      repositoryEvidence: requirement.repositoryEvidence.map(
        e =>
          `[${e.evidenceType}] ${e.filePath ?? 'file'}${e.symbolName ? ` (${e.symbolName})` : ''}`,
      ),
      aiAnalysisSummary: currentAiAnalysis
        ? JSON.stringify(currentAiAnalysis.structuredAnalysisJson)
        : undefined,
      testDesignSummary: structuredTestDesign?.applicabilityRationale,
      recommendedLevels: structuredTestDesign?.recommendedLevels?.map(
        l => `${l.level} (${l.priority}): ${l.rationale}`,
      ),
      recommendedDimensions: structuredTestDesign?.recommendedDimensions?.map(
        d => `${d.dimension} (${d.priority})`,
      ),
      recommendedTechniques: structuredTestDesign?.recommendedTechniques?.map(
        t => `${t.technique} (${t.priority}): ${t.rationale}`,
      ),
      retrievedContextItems: ragPack.items.map(item => ({
        id: item.id,
        sourceType: item.sourceType,
        title: item.title ?? '',
        text: item.text,
        authorityTier: item.authorityTier,
      })),
    };

    // 11. Execute LLM Prompt
    this.logger.info('categorized_tests.generation_started', {
      projectId: input.projectId,
      requirementId: input.requirementId,
      versionNumber,
      scenariosCount: scenarios.length,
    });

    const executionResult = await this.promptExecutionService.executePrompt<
      CategorizedTestPromptInput,
      StructuredCategorizedTestOutput
    >({
      promptId: CATEGORIZED_TESTS_PROMPT_ID,
      version: CATEGORIZED_TESTS_PROMPT_VERSION,
      input: promptInput,
      configOverride: input.configOverride,
    });

    const rawOutput = executionResult.data;

    // 12. Domain Validation & Grounding Enforcement
    const validEvidenceRefIds = new Set<string>([
      requirement.id,
      requirement.requirementKey,
      ...ragPack.items.map(i => i.id),
    ]);

    const validScenarioIds = new Set<string>(scenarios.map(s => s.id));

    const validationResult = CategorizedTestValidator.validateAndSanitize(rawOutput, {
      requirementKey: requirement.requirementKey,
      requirementId: requirement.id,
      requirementText: requirement.originalText,
      validEvidenceRefIds,
      validScenarioIds,
    });

    const totalDurationMs = Math.round(performance.now() - startTime);

    // Map scenarioId back to candidate designs if matching scenarioKey found
    const scenarioMap = new Map<string, string>();
    for (const s of scenarios) {
      if (s.scenarioKey) {
        scenarioMap.set(s.scenarioKey, s.id);
      }
    }

    const boundTestDesigns: CategorizedTestDesignDto[] = validationResult.sanitizedTestDesigns.map(
      design => ({
        ...design,
        scenarioId: design.scenarioKey
          ? (scenarioMap.get(design.scenarioKey) ?? scenarios[0]?.id ?? null)
          : (scenarios[0]?.id ?? null),
        requirementVersionNumber: versionNumber,
      }),
    );

    const warnings = [...validationResult.warnings];

    // Check concurrency edit race
    const freshRequirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { updatedAt: true },
    });

    if (
      freshRequirement &&
      freshRequirement.updatedAt.getTime() !== requirement.updatedAt.getTime()
    ) {
      warnings.push({
        code: 'REQUIREMENT_MODIFIED_CONCURRENTLY',
        message:
          'Requirement was updated during categorized test generation. Results represent the version when generation started.',
      });
    }

    const finalResult: CategorizedTestGenerationResultDto = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      requirementId: input.requirementId,
      requirementKey: requirement.requirementKey,
      requirementVersionNumber: versionNumber,
      generationId: scenarioGeneration?.id ?? null,
      inputFingerprint,
      providerId: executionResult.providerId,
      model: executionResult.modelReported ?? 'default-model',
      promptId: CATEGORIZED_TESTS_PROMPT_ID,
      promptVersion: CATEGORIZED_TESTS_PROMPT_VERSION,
      categoryAssessments: validationResult.sanitizedAssessments,
      testDesigns: boundTestDesigns,
      metrics: validationResult.metrics,
      warnings,
      usage: executionResult.usage,
      durationMs: totalDurationMs,
      createdAt: new Date().toISOString(),
    };

    // Store in memory cache
    this.memoryCache.set(cacheKey, finalResult);

    this.logger.info('categorized_tests.generation_completed', {
      requirementId: input.requirementId,
      totalGenerated: finalResult.metrics.totalGenerated,
      positiveCount: finalResult.metrics.positiveCount,
      negativeCount: finalResult.metrics.negativeCount,
      boundaryCount: finalResult.metrics.boundaryCount,
      validationCount: finalResult.metrics.validationCount,
      durationMs: totalDurationMs,
    });

    return finalResult;
  }

  /**
   * Retrieves current cached categorized tests for a requirement.
   */
  public async getCategorizedTests(
    input: GetCategorizedTestsInputDto,
  ): Promise<CategorizedTestGenerationResultDto | null> {
    // Find the latest memory cache entry matching project and requirement
    const prefix = `${input.projectId}:${input.requirementId}:${input.scenarioId ?? 'ALL'}:`;
    for (const [key, value] of this.memoryCache.entries()) {
      if (key.startsWith(prefix)) {
        return value;
      }
    }
    return null;
  }

  /**
   * Helper to construct non-testable fallback result.
   */
  private createUntestableResult(params: {
    projectId: string;
    requirementId: string;
    requirementKey: string;
    versionNumber: number;
    generationId: string | null;
    startTime: number;
  }): CategorizedTestGenerationResultDto {
    const assessments: CategoryAssessmentDto[] = [
      {
        category: 'POSITIVE',
        applicability: 'NOT_APPLICABLE',
        rationale: 'Requirement lacks measurable criteria or is flagged NOT_TESTABLE.',
        testCount: 0,
      },
      {
        category: 'NEGATIVE',
        applicability: 'NOT_APPLICABLE',
        rationale: 'Requirement lacks measurable criteria or is flagged NOT_TESTABLE.',
        testCount: 0,
      },
      {
        category: 'BOUNDARY',
        applicability: 'NOT_APPLICABLE',
        rationale: 'No quantitative boundaries available on unmeasurable requirement.',
        testCount: 0,
      },
      {
        category: 'VALIDATION',
        applicability: 'NOT_APPLICABLE',
        rationale: 'No verifiable validation constraints evidenced.',
        testCount: 0,
      },
    ];

    return {
      id: crypto.randomUUID(),
      projectId: params.projectId,
      requirementId: params.requirementId,
      requirementKey: params.requirementKey,
      requirementVersionNumber: params.versionNumber,
      generationId: params.generationId,
      inputFingerprint: 'untestable-requirement-fingerprint',
      providerId: 'DETERMINISTIC_RULES',
      model: 'deterministic-rules-engine',
      promptId: CATEGORIZED_TESTS_PROMPT_ID,
      promptVersion: CATEGORIZED_TESTS_PROMPT_VERSION,
      categoryAssessments: assessments,
      testDesigns: [],
      metrics: {
        totalGenerated: 0,
        positiveCount: 0,
        negativeCount: 0,
        boundaryCount: 0,
        validationCount: 0,
        notApplicableCategories: ['POSITIVE', 'NEGATIVE', 'BOUNDARY', 'VALIDATION'],
      },
      warnings: [
        {
          code: 'REQUIREMENT_NOT_TESTABLE',
          message:
            'Requirement is flagged as NOT_TESTABLE or lacks measurable criteria. No categorized tests were generated.',
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      durationMs: Math.round(performance.now() - params.startTime),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Deterministic input fingerprint calculation.
   */
  private computeInputFingerprint(payload: {
    requirementStatement: string;
    versionNumber: number;
    classification: string;
    scenarioIds: readonly string[];
    contextItemIds: readonly string[];
  }): string {
    const raw = JSON.stringify({
      statement: payload.requirementStatement.trim(),
      version: payload.versionNumber,
      type: payload.classification,
      scenarios: [...payload.scenarioIds].sort(),
      context: [...payload.contextItemIds].sort(),
      promptVersion: CATEGORIZED_TESTS_PROMPT_VERSION,
    });
    return createHash('sha256').update(raw).digest('hex');
  }
}
