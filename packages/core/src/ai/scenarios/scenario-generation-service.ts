/**
 * @file packages/core/src/ai/scenarios/scenario-generation-service.ts
 * Domain service orchestrating Requirement-to-Test Scenario Generation (V4 Phase 49).
 */

import type {
  GenerateScenariosInputDto,
  GeneratedTestScenarioDto,
  GetRequirementScenariosHistoryInputDto,
  GetRequirementScenariosInputDto,
  RegenerateRequirementScenariosInputDto,
  RequirementScenarioGenerationDto,
  ScenarioGenerationStatus,
  ScenarioGenerationWarningDto,
  StructuredScenarioGenerationOutputDto,
  StructuredTestDesignDto,
} from '@ai-quality/contracts';
import {
  generateScenariosInputSchema,
  getRequirementScenariosHistoryInputSchema,
  getRequirementScenariosInputSchema,
  regenerateRequirementScenariosInputSchema,
} from '@ai-quality/contracts';
import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { DatabaseError, getPrismaClient } from '../../database/index.js';
import { getLogger, type ILogger } from '../../logging/index.js';
import { ProjectNotFoundError } from '../../projects/project-errors.js';
import { AiInvalidRequestError } from '../ai-errors.js';
import { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import { RagRequirementChangedError } from '../rag/rag-errors.js';
import { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import {
  ScenarioProjectMismatchError,
  ScenarioRequirementChangedError,
  ScenarioRequirementNotFoundError,
} from './scenario-errors.js';
import type { ScenarioGenerationPromptInput } from './scenario-prompt-definition.js';
import { SCENARIO_PROMPT_ID, SCENARIO_PROMPT_VERSION } from './scenario-types.js';
import { ScenarioValidator } from './scenario-validator.js';

export interface ScenarioGenerationServiceOptions {
  readonly prisma?: PrismaClient;
  readonly promptExecutionService?: AiPromptExecutionService;
  readonly retrievalService?: RequirementContextRetrievalService;
  readonly logger?: ILogger;
}

export class ScenarioGenerationService {
  private readonly prisma: PrismaClient;
  private readonly promptExecutionService: AiPromptExecutionService;
  private readonly retrievalService: RequirementContextRetrievalService;
  private readonly logger: ILogger;

  constructor(options: ScenarioGenerationServiceOptions = {}) {
    const client = options.prisma ?? getPrismaClient();
    if (!client) {
      throw new DatabaseError('Database client is not available');
    }
    this.prisma = client;
    this.promptExecutionService = options.promptExecutionService ?? new AiPromptExecutionService();
    this.retrievalService =
      options.retrievalService ?? new RequirementContextRetrievalService({ prisma: this.prisma });
    this.logger = options.logger ?? getLogger();
  }

  /**
   * Generates or retrieves grounded, candidate test scenarios for an authoritative requirement.
   */
  public async generateScenarios(
    input: GenerateScenariosInputDto,
  ): Promise<RequirementScenarioGenerationDto> {
    const parseResult = generateScenariosInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new AiInvalidRequestError(
        'INVALID_SCENARIO_REQUEST',
        `Invalid scenario generation input: ${parseResult.error.message}`,
      );
    }

    const startTime = performance.now();

    // 1. Verify Project Ownership & Active Status
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }
    if (project.status === 'ARCHIVED') {
      throw new AiInvalidRequestError(
        'PROJECT_ARCHIVED',
        `Cannot generate scenarios for requirement in archived project "${input.projectId}".`,
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
      throw new ScenarioRequirementNotFoundError(input.requirementId);
    }
    if (requirement.projectId !== input.projectId) {
      throw new ScenarioProjectMismatchError();
    }
    if (requirement.status === 'ARCHIVED') {
      throw new AiInvalidRequestError(
        'REQUIREMENT_ARCHIVED',
        `Cannot generate scenarios for archived requirement "${requirement.requirementKey}".`,
      );
    }

    const initialUpdatedAt = requirement.updatedAt;
    const latestVersion = requirement.versions[0];
    const versionNumber = latestVersion?.versionNumber ?? 1;
    const requirementVersionId = latestVersion?.id ?? null;

    // 3. Load Phase 47 AI Requirement Analysis (CURRENT)
    const currentAiAnalysis = await this.prisma.requirementAiAnalysis.findFirst({
      where: {
        requirementId: input.requirementId,
        status: 'CURRENT',
      },
      orderBy: { createdAt: 'desc' },
    });

    // 4. Load Phase 48 Test Design Intelligence (CURRENT)
    const currentTestDesign = await this.prisma.requirementTestDesign.findFirst({
      where: {
        requirementId: input.requirementId,
        status: 'CURRENT',
      },
      orderBy: { createdAt: 'desc' },
    });

    // 5. Retrieve Phase 46 Grounded RAG Context Pack
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
        throw new ScenarioRequirementChangedError(err.message);
      }
      this.logger.warn('scenarios.rag_retrieval_failed', {
        projectId: input.projectId,
        requirementId: input.requirementId,
        error: err instanceof Error ? err.message : String(err),
      });
      ragPack = {
        items: [],
        warnings: [
          {
            code: 'RAG_UNAVAILABLE',
            message: 'RAG retrieval failed. Proceeding with requirement text.',
          },
        ],
      };
    }

    // 6. Check Testability / Non-Testable Status
    const isNotTestable =
      requirement.qualityAnalysis?.testabilityStatus === 'NOT_TESTABLE' ||
      currentTestDesign?.applicability === 'NOT_TESTABLE';

    if (isNotTestable) {
      const warnings: ScenarioGenerationWarningDto[] = [
        {
          code: 'REQUIREMENT_NOT_TESTABLE',
          message:
            'Requirement is flagged as NOT_TESTABLE or lacks measurable criteria. No candidate scenarios were generated.',
        },
      ];

      return this.persistNonTestableGeneration({
        projectId: input.projectId,
        requirementId: input.requirementId,
        requirementKey: requirement.requirementKey,
        requirementVersionId,
        versionNumber,
        status: 'INSUFFICIENT_INFORMATION',
        warnings,
        startTime,
      });
    }

    // 7. Compute Deterministic Input Fingerprint
    const structuredTestDesign = currentTestDesign?.structuredDesignJson as
      StructuredTestDesignDto | undefined;

    const inputFingerprint = this.computeInputFingerprint({
      requirementStatement: requirement.originalText,
      versionNumber,
      classification: requirement.type,
      qualityFindings: requirement.qualityFindings.map(f => f.code),
      relationships: requirement.outgoingRelationships.map(
        r =>
          `${r.relationshipType}:${r.targetRequirement?.requirementKey ?? r.targetRequirementId}`,
      ),
      repositoryEvidence: requirement.repositoryEvidence.map(
        e => `${e.evidenceType}:${e.filePath ?? e.id}${e.symbolName ? `:${e.symbolName}` : ''}`,
      ),
      aiAnalysisJson: currentAiAnalysis?.structuredAnalysisJson ?? null,
      testDesignJson: structuredTestDesign ?? null,
      contextItemIds: ragPack.items.map(i => i.id),
    });

    // 8. Cache Lookup (unless forceRegenerate is set)
    if (!input.forceRegenerate) {
      const cached = await this.prisma.requirementScenarioGeneration.findFirst({
        where: {
          projectId: input.projectId,
          requirementId: input.requirementId,
          inputFingerprint,
          status: 'GENERATED',
        },
        include: {
          candidates: {
            orderBy: { ordinal: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (cached) {
        this.logger.info('scenarios.cache_hit', {
          generationId: cached.id,
          requirementId: input.requirementId,
          fingerprint: inputFingerprint,
        });
        return this.mapToDto(cached, cached.candidates, requirement.requirementKey);
      }
    }

    // 9. Assemble Prompt Input
    const promptInput: ScenarioGenerationPromptInput = {
      requirementKey: requirement.requirementKey,
      title: requirement.title,
      statement: requirement.originalText,
      versionNumber,
      classification: requirement.type,
      testabilityStatus: requirement.qualityAnalysis?.testabilityStatus ?? 'TESTABLE',
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
      coverageObjectives: structuredTestDesign?.coverageObjectives?.map(
        o => `[${o.category} - ${o.priority}] ${o.description}`,
      ),
      identifiedConstraints: structuredTestDesign?.identifiedConstraints?.map(
        c => `${c.constraintType} [${c.parameter}]: ${c.value}`,
      ),
      retrievedContextItems: ragPack.items.map(item => ({
        id: item.id,
        sourceType: item.sourceType,
        title: item.title ?? 'Context Item',
        text: item.text,
        authorityTier: item.authorityTier,
      })),
    };

    this.logger.info('scenarios.generation_started', {
      projectId: input.projectId,
      requirementId: input.requirementId,
      versionNumber,
      contextItemsCount: ragPack.items.length,
    });

    // 10. Execute LLM Prompt
    const executionResult = await this.promptExecutionService.executePrompt<
      ScenarioGenerationPromptInput,
      StructuredScenarioGenerationOutputDto
    >({
      promptId: SCENARIO_PROMPT_ID,
      version: SCENARIO_PROMPT_VERSION,
      input: promptInput,
      configOverride: input.configOverride,
    });

    const rawOutput = executionResult.data;

    // 11. Domain Validation & Grounding Enforcement
    const validEvidenceRefIds = new Set<string>([
      requirement.id,
      requirement.requirementKey,
      ...ragPack.items.map(i => i.id),
    ]);

    const validationResult = ScenarioValidator.validateAndSanitize(rawOutput, {
      requirementKey: requirement.requirementKey,
      requirementId: requirement.id,
      requirementText: requirement.originalText,
      validEvidenceRefIds,
    });

    const totalDurationMs = Math.round(performance.now() - startTime);

    // 12. Check Concurrency Race
    const freshRequirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { updatedAt: true },
    });

    let status: ScenarioGenerationStatus = 'GENERATED';
    let staleAt: Date | null = null;

    if (!freshRequirement || freshRequirement.updatedAt.getTime() !== initialUpdatedAt.getTime()) {
      status = 'STALE';
      staleAt = new Date();
      this.logger.warn('scenarios.concurrent_modification_detected', {
        requirementId: input.requirementId,
        message:
          'Requirement was modified while scenario generation LLM call was in flight. Stored as STALE.',
      });
    }

    if (validationResult.sanitizedOutput.scenarios.length === 0 && status !== 'STALE') {
      status = 'NO_SCENARIOS';
    }

    // 13. Persist Generation & Candidates Transactionally
    const savedRecord = await this.prisma.$transaction(async tx => {
      if (status === 'GENERATED') {
        await tx.requirementScenarioGeneration.updateMany({
          where: {
            requirementId: input.requirementId,
            status: 'GENERATED',
          },
          data: {
            status: 'STALE',
            staleAt: new Date(),
          },
        });
      }

      const generation = await tx.requirementScenarioGeneration.create({
        data: {
          projectId: input.projectId,
          requirementId: input.requirementId,
          requirementVersionId,
          requirementVersionNumber: versionNumber,
          status,
          inputFingerprint,
          providerId: executionResult.providerId,
          model: executionResult.modelReported ?? 'unknown',
          promptId: SCENARIO_PROMPT_ID,
          promptVersion: SCENARIO_PROMPT_VERSION,
          scenarioCount: validationResult.sanitizedOutput.scenarios.length,
          warningsJson: validationResult.warnings as any,
          usageJson: executionResult.usage as any,
          durationMs: totalDurationMs,
          staleAt,
        },
      });

      const candidateRows = validationResult.sanitizedOutput.scenarios.map((scenario, index) => ({
        id: scenario.id || undefined,
        generationId: generation.id,
        projectId: input.projectId,
        requirementId: input.requirementId,
        ordinal: index + 1,
        scenarioKey: scenario.scenarioKey ?? `SCN-${String(index + 1).padStart(3, '0')}`,
        title: scenario.title,
        objective: scenario.objective,
        rationale: scenario.rationale,
        requirementAspect: scenario.requirementAspect,
        testLevel: scenario.testLevel ?? null,
        testIntent: scenario.testIntent ?? null,
        applicability: scenario.applicability ?? 'APPLICABLE',
        assumptionsJson: scenario.assumptions as any,
        sourceEvidenceRefsJson: scenario.sourceEvidenceRefs as any,
      }));

      if (candidateRows.length > 0) {
        await tx.requirementScenarioCandidate.createMany({
          data: candidateRows,
        });
      }

      const createdCandidates = await tx.requirementScenarioCandidate.findMany({
        where: { generationId: generation.id },
        orderBy: { ordinal: 'asc' },
      });

      return { generation, candidates: createdCandidates };
    });

    this.logger.info('scenarios.generation_completed', {
      generationId: savedRecord.generation.id,
      requirementId: input.requirementId,
      scenariosCount: savedRecord.candidates.length,
      durationMs: totalDurationMs,
    });

    return this.mapToDto(
      savedRecord.generation,
      savedRecord.candidates,
      requirement.requirementKey,
    );
  }

  /**
   * Retrieves the current (active) scenario generation for a requirement.
   */
  public async getCurrentScenarios(
    input: GetRequirementScenariosInputDto,
  ): Promise<RequirementScenarioGenerationDto | null> {
    const parseResult = getRequirementScenariosInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new AiInvalidRequestError(
        'INVALID_GET_SCENARIOS_REQUEST',
        `Invalid input: ${parseResult.error.message}`,
      );
    }

    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { id: true, projectId: true, requirementKey: true },
    });
    if (!requirement) {
      throw new ScenarioRequirementNotFoundError(input.requirementId);
    }
    if (requirement.projectId !== input.projectId) {
      throw new ScenarioProjectMismatchError();
    }

    const current = await this.prisma.requirementScenarioGeneration.findFirst({
      where: {
        projectId: input.projectId,
        requirementId: input.requirementId,
        status: { in: ['GENERATED', 'NO_SCENARIOS', 'INSUFFICIENT_INFORMATION'] },
      },
      include: {
        candidates: {
          orderBy: { ordinal: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!current) {
      return null;
    }

    return this.mapToDto(current, current.candidates, requirement.requirementKey);
  }

  /**
   * Retrieves historical scenario generations for a requirement.
   */
  public async getScenariosHistory(
    input: GetRequirementScenariosHistoryInputDto,
  ): Promise<readonly RequirementScenarioGenerationDto[]> {
    const parseResult = getRequirementScenariosHistoryInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new AiInvalidRequestError(
        'INVALID_GET_SCENARIOS_HISTORY_REQUEST',
        `Invalid input: ${parseResult.error.message}`,
      );
    }

    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { id: true, projectId: true, requirementKey: true },
    });
    if (!requirement) {
      throw new ScenarioRequirementNotFoundError(input.requirementId);
    }
    if (requirement.projectId !== input.projectId) {
      throw new ScenarioProjectMismatchError();
    }

    const records = await this.prisma.requirementScenarioGeneration.findMany({
      where: {
        projectId: input.projectId,
        requirementId: input.requirementId,
      },
      include: {
        candidates: {
          orderBy: { ordinal: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return records.map(record =>
      this.mapToDto(record, record.candidates, requirement.requirementKey),
    );
  }

  /**
   * Forces regeneration of scenario candidates for a requirement.
   */
  public async regenerateScenarios(
    input: RegenerateRequirementScenariosInputDto,
  ): Promise<RequirementScenarioGenerationDto> {
    const parseResult = regenerateRequirementScenariosInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new AiInvalidRequestError(
        'INVALID_REGENERATE_SCENARIOS_REQUEST',
        `Invalid input: ${parseResult.error.message}`,
      );
    }

    return this.generateScenarios({
      projectId: input.projectId,
      requirementId: input.requirementId,
      forceRegenerate: true,
      configOverride: input.configOverride,
    });
  }

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  private computeInputFingerprint(payload: Record<string, unknown>): string {
    const serialized = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash('sha256').update(serialized).digest('hex');
  }

  private async persistNonTestableGeneration(params: {
    projectId: string;
    requirementId: string;
    requirementKey: string;
    requirementVersionId: string | null;
    versionNumber: number;
    status: ScenarioGenerationStatus;
    warnings: ScenarioGenerationWarningDto[];
    startTime: number;
  }): Promise<RequirementScenarioGenerationDto> {
    const durationMs = Math.round(performance.now() - params.startTime);
    const inputFingerprint = this.computeInputFingerprint({
      requirementId: params.requirementId,
      versionNumber: params.versionNumber,
      status: params.status,
    });

    const generation = await this.prisma.$transaction(async tx => {
      await tx.requirementScenarioGeneration.updateMany({
        where: {
          requirementId: params.requirementId,
          status: 'GENERATED',
        },
        data: {
          status: 'STALE',
          staleAt: new Date(),
        },
      });

      return tx.requirementScenarioGeneration.create({
        data: {
          projectId: params.projectId,
          requirementId: params.requirementId,
          requirementVersionId: params.requirementVersionId,
          requirementVersionNumber: params.versionNumber,
          status: params.status,
          inputFingerprint,
          providerId: 'SYSTEM',
          model: 'deterministic-testability-check',
          promptId: SCENARIO_PROMPT_ID,
          promptVersion: SCENARIO_PROMPT_VERSION,
          scenarioCount: 0,
          warningsJson: params.warnings as any,
          usageJson: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } as any,
          durationMs,
        },
      });
    });

    return this.mapToDto(generation, [], params.requirementKey);
  }

  private mapToDto(
    generation: any,
    candidates: any[],
    requirementKey: string,
  ): RequirementScenarioGenerationDto {
    const scenarios: GeneratedTestScenarioDto[] = candidates.map(c => ({
      id: c.id,
      scenarioKey: c.scenarioKey ?? `SCN-${c.ordinal}`,
      title: c.title,
      objective: c.objective,
      rationale: c.rationale,
      requirementAspect: c.requirementAspect,
      testLevel: c.testLevel ?? null,
      testIntent: c.testIntent ?? null,
      applicability: c.applicability ?? 'APPLICABLE',
      assumptions: Array.isArray(c.assumptionsJson) ? (c.assumptionsJson as string[]) : [],
      sourceEvidenceRefs: Array.isArray(c.sourceEvidenceRefsJson)
        ? (c.sourceEvidenceRefsJson as string[])
        : [requirementKey],
    }));

    const warnings: ScenarioGenerationWarningDto[] = Array.isArray(generation.warningsJson)
      ? (generation.warningsJson as ScenarioGenerationWarningDto[])
      : [];

    const usage = generation.usageJson ?? {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    };

    return {
      id: generation.id,
      projectId: generation.projectId,
      requirementId: generation.requirementId,
      requirementKey,
      requirementVersionId: generation.requirementVersionId ?? null,
      requirementVersionNumber: generation.requirementVersionNumber,
      status: generation.status as ScenarioGenerationStatus,
      inputFingerprint: generation.inputFingerprint,
      providerId: generation.providerId,
      model: generation.model,
      promptId: generation.promptId,
      promptVersion: generation.promptVersion,
      scenarioCount: scenarios.length,
      scenarios,
      warnings,
      usage,
      durationMs: generation.durationMs,
      errorMessage: generation.errorMessage ?? null,
      createdAt: generation.createdAt.toISOString(),
      updatedAt: generation.updatedAt.toISOString(),
      staleAt: generation.staleAt ? generation.staleAt.toISOString() : null,
    };
  }
}
