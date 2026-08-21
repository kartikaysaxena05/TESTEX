/**
 * @file packages/core/src/ai/test-design/test-design-service.ts
 * Domain service orchestrating Test Design Intelligence Foundation.
 */

import type {
  AnalyzeTestDesignInputDto,
  GetTestDesignHistoryInputDto,
  GetTestDesignInputDto,
  RegenerateTestDesignInputDto,
  StructuredTestDesignDto,
  TestDesignPlanDto,
  TestDesignStatus,
} from '@ai-quality/contracts';
import {
  analyzeTestDesignInputSchema,
  getTestDesignHistoryInputSchema,
  getTestDesignInputSchema,
  regenerateTestDesignInputSchema,
} from '@ai-quality/contracts';
import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { getLogger, type ILogger } from '../../logging/index.js';
import { ProjectNotFoundError } from '../../projects/project-errors.js';
import { AiInvalidRequestError } from '../ai-errors.js';
import { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import { getPrismaClient, DatabaseError } from '../../database/index.js';
import { RagRequirementChangedError } from '../rag/rag-errors.js';
import { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import { DeterministicRulesEngine } from './deterministic-rules-engine.js';
import {
  TestDesignProjectMismatchError,
  TestDesignRequirementChangedError,
  TestDesignRequirementNotFoundError,
} from './test-design-errors.js';
import type { TestDesignPromptInput } from './test-design-prompt-definition.js';
import {
  TEST_DESIGN_ENGINE_VERSION,
  TEST_DESIGN_PROMPT_ID,
  TEST_DESIGN_PROMPT_VERSION,
} from './test-design-types.js';
import { TestDesignValidator } from './test-design-validator.js';

export interface TestDesignServiceOptions {
  readonly prisma?: PrismaClient;
  readonly promptExecutionService?: AiPromptExecutionService;
  readonly retrievalService?: RequirementContextRetrievalService;
  readonly logger?: ILogger;
}

export class TestDesignService {
  private readonly prisma: PrismaClient;
  private readonly promptExecutionService: AiPromptExecutionService;
  private readonly retrievalService: RequirementContextRetrievalService;
  private readonly logger: ILogger;

  constructor(options: TestDesignServiceOptions = {}) {
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
   * Generates or retrieves a structured Test Design Plan for an authoritative requirement.
   */
  public async analyzeTestDesign(input: AnalyzeTestDesignInputDto): Promise<TestDesignPlanDto> {
    const parseResult = analyzeTestDesignInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new AiInvalidRequestError(
        'INVALID_TEST_DESIGN_REQUEST',
        `Invalid test design analysis input: ${parseResult.error.message}`,
      );
    }

    const startTime = performance.now();

    // 1. Verify Project
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(input.projectId);
    }
    if (project.status === 'ARCHIVED') {
      throw new AiInvalidRequestError(
        'PROJECT_ARCHIVED',
        `Cannot analyze test design for requirement in archived project "${input.projectId}".`,
      );
    }

    // 2. Load Authoritative Requirement Snapshot
    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      include: {
        metadata: true,
        qualityFindings: true,
        outgoingRelationships: {
          include: { targetRequirement: true },
        },
        repositoryEvidence: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        aiAnalyses: {
          where: { status: 'CURRENT' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!requirement) {
      throw new TestDesignRequirementNotFoundError(input.requirementId);
    }

    if (requirement.projectId !== input.projectId) {
      throw new TestDesignProjectMismatchError(input.projectId, input.requirementId);
    }

    const initialUpdatedAt = requirement.updatedAt;
    const versionNumber = requirement.versions[0]?.versionNumber ?? 1;
    const requirementVersionId = requirement.versions[0]?.id ?? null;

    // 3. Extract Authoritative Metadata
    const qualityFindingTexts = requirement.qualityFindings.map(
      f => `[${f.category}/${f.severity}] ${f.message}`,
    );
    const relationshipTexts = requirement.outgoingRelationships.map(
      r =>
        `[${r.relationshipType}] target: ${r.targetRequirement?.requirementKey ?? r.targetRequirementId}`,
    );
    const evidenceTexts = requirement.repositoryEvidence.map(
      e => `[${e.evidenceType}] ${e.filePath}${e.symbolName ? ` (${e.symbolName})` : ''}`,
    );

    const latestAiAnalysis = requirement.aiAnalyses[0];
    const aiAnalysisStructured = latestAiAnalysis?.structuredAnalysisJson as
      Record<string, unknown> | undefined;
    const aiAnalysisSummary = (aiAnalysisStructured?.summary as string) ?? undefined;

    // 4. Retrieve Phase 46 RAG Context
    let ragPack;
    try {
      ragPack = await this.retrievalService.retrieveContext({
        projectId: input.projectId,
        requirementId: input.requirementId,
        purpose: 'TEST_DESIGN',
      });
    } catch (err) {
      if (err instanceof RagRequirementChangedError) {
        throw new TestDesignRequirementChangedError(input.requirementId);
      }
      throw err;
    }

    const contextSha256 = createHash('sha256')
      .update(
        JSON.stringify(
          ragPack.items.map(item => ({
            id: item.id,
            sourceType: item.sourceType,
            text: item.text,
          })),
        ),
      )
      .digest('hex');

    // 5. Run Deterministic Rule Engine
    const deterministicBaseline = DeterministicRulesEngine.evaluate({
      requirementId: requirement.id,
      requirementKey: requirement.requirementKey,
      title: requirement.title,
      statement: requirement.originalText,
      type: requirement.type,
      priority: requirement.priority,
      category: requirement.metadata?.category ?? requirement.type,
      qualityFindings: qualityFindingTexts,
      outgoingRelationships: requirement.outgoingRelationships.map(r => ({
        relationshipType: r.relationshipType,
        targetRequirementKey: r.targetRequirement?.requirementKey,
        targetRequirementId: r.targetRequirementId,
      })),
      repositoryEvidence: requirement.repositoryEvidence.map(e => ({
        evidenceType: e.evidenceType,
        filePath: e.filePath,
        symbolName: e.symbolName,
      })),
      aiInterpretation: aiAnalysisStructured as any,
    });

    // 6. Compute Deterministic Input Fingerprint
    const fingerprintPayload = JSON.stringify({
      key: requirement.requirementKey,
      title: requirement.title,
      statement: requirement.originalText,
      versionNumber,
      classification: requirement.metadata?.category ?? requirement.type,
      qualityFindings: qualityFindingTexts,
      relationships: relationshipTexts,
      repositoryEvidence: evidenceTexts,
      aiAnalysisSummary,
      contextSha256,
      engineVersion: TEST_DESIGN_ENGINE_VERSION,
    });
    const inputFingerprint = createHash('sha256').update(fingerprintPayload).digest('hex');

    // 7. Check Cache if not forced regeneration
    if (!input.forceRegenerate) {
      const cached = await this.prisma.requirementTestDesign.findFirst({
        where: {
          projectId: input.projectId,
          requirementId: input.requirementId,
          inputFingerprint,
          status: 'CURRENT',
        },
      });

      if (cached) {
        this.logger.info('test_design.cache_hit', {
          projectId: input.projectId,
          requirementId: input.requirementId,
          designId: cached.id,
        });
        return this.mapToDto(cached, requirement.requirementKey);
      }
    }

    // 8. Execute LLM Prompt
    const promptInput: TestDesignPromptInput = {
      requirementKey: requirement.requirementKey,
      title: requirement.title,
      statement: requirement.originalText,
      versionNumber,
      classification: requirement.metadata?.category ?? requirement.type,
      qualityFindings: qualityFindingTexts,
      relationships: relationshipTexts,
      repositoryEvidence: evidenceTexts,
      aiAnalysisSummary,
      aiAnalysisDetails: aiAnalysisStructured,
      deterministicBaseline,
      retrievedContextItems: ragPack.items.map(item => ({
        id: item.id,
        sourceType: item.sourceType,
        title: item.title ?? 'Context Item',
        text: item.text,
        authorityTier: item.authorityTier,
        similarityScore: item.relevance.similarityScore,
      })),
    };

    this.logger.info('test_design.started', {
      projectId: input.projectId,
      requirementId: input.requirementId,
      versionNumber,
      contextItemsCount: ragPack.items.length,
    });

    const executionResult = await this.promptExecutionService.executePrompt<
      TestDesignPromptInput,
      StructuredTestDesignDto
    >({
      promptId: TEST_DESIGN_PROMPT_ID,
      version: TEST_DESIGN_PROMPT_VERSION,
      input: promptInput,
      configOverride: input.configOverride,
    });

    const rawDesign = executionResult.data;

    // 9. Merge Deterministic Baseline with LLM Recommendations
    const mergedDesign = this.mergeBaselineWithLlm(deterministicBaseline, rawDesign);

    // 10. Grounding & Evidence Reference Validation
    const validEvidenceIds = new Set<string>([
      requirement.id,
      requirement.requirementKey,
      ...ragPack.items.map(i => i.id),
    ]);

    const validationResult = TestDesignValidator.validateAndSanitize(
      mergedDesign,
      validEvidenceIds,
      requirement.originalText,
    );

    const totalDurationMs = Math.round(performance.now() - startTime);

    // 11. Check for Concurrency Modification Race
    const freshRequirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { updatedAt: true },
    });

    let status: TestDesignStatus = 'CURRENT';
    let staleAt: Date | null = null;

    if (!freshRequirement || freshRequirement.updatedAt.getTime() !== initialUpdatedAt.getTime()) {
      status = 'STALE';
      staleAt = new Date();
      this.logger.warn('test_design.concurrent_modification_detected', {
        requirementId: input.requirementId,
        message:
          'Requirement was modified while test design LLM call was in flight. Stored as STALE.',
      });
    }

    // 12. Persist in Database Transaction
    const savedRecord = await this.prisma.$transaction(async tx => {
      if (status === 'CURRENT') {
        await tx.requirementTestDesign.updateMany({
          where: {
            requirementId: input.requirementId,
            status: 'CURRENT',
          },
          data: {
            status: 'STALE',
            staleAt: new Date(),
          },
        });
      }

      return tx.requirementTestDesign.create({
        data: {
          projectId: input.projectId,
          requirementId: input.requirementId,
          requirementVersionId,
          requirementVersionNumber: versionNumber,
          status,
          applicability: validationResult.sanitizedDesign.applicability,
          automationSuitability: validationResult.sanitizedDesign.automationSuitability,
          inputFingerprint,
          engineVersion: TEST_DESIGN_ENGINE_VERSION,
          promptTemplateVersion: TEST_DESIGN_PROMPT_VERSION,
          providerId: executionResult.providerId,
          model: executionResult.modelReported ?? 'unknown',
          structuredDesignJson: validationResult.sanitizedDesign as any,
          usageJson: executionResult.usage as any,
          durationMs: totalDurationMs,
          staleAt,
        },
      });
    });

    this.logger.info('test_design.completed', {
      designId: savedRecord.id,
      projectId: input.projectId,
      requirementId: input.requirementId,
      status: savedRecord.status,
      durationMs: totalDurationMs,
      validEvidenceRefs: validationResult.validEvidenceRefs,
      invalidEvidenceRefs: validationResult.invalidEvidenceRefs,
    });

    return this.mapToDto(savedRecord, requirement.requirementKey);
  }

  /**
   * Retrieves the current Test Design Plan for a requirement.
   */
  public async getTestDesign(input: GetTestDesignInputDto): Promise<TestDesignPlanDto | null> {
    const parseResult = getTestDesignInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new AiInvalidRequestError(
        'INVALID_GET_TEST_DESIGN_REQUEST',
        `Invalid get test design input: ${parseResult.error.message}`,
      );
    }

    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { projectId: true, requirementKey: true },
    });

    if (!requirement) {
      throw new TestDesignRequirementNotFoundError(input.requirementId);
    }

    if (requirement.projectId !== input.projectId) {
      throw new TestDesignProjectMismatchError(input.projectId, input.requirementId);
    }

    const design = await this.prisma.requirementTestDesign.findFirst({
      where: {
        requirementId: input.requirementId,
        projectId: input.projectId,
        status: 'CURRENT',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!design) {
      return null;
    }

    return this.mapToDto(design, requirement.requirementKey);
  }

  /**
   * Retrieves historical Test Design Plans for a requirement.
   */
  public async getTestDesignHistory(
    input: GetTestDesignHistoryInputDto,
  ): Promise<readonly TestDesignPlanDto[]> {
    const parseResult = getTestDesignHistoryInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new AiInvalidRequestError(
        'INVALID_GET_TEST_DESIGN_HISTORY_REQUEST',
        `Invalid get test design history input: ${parseResult.error.message}`,
      );
    }

    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { projectId: true, requirementKey: true },
    });

    if (!requirement) {
      throw new TestDesignRequirementNotFoundError(input.requirementId);
    }

    if (requirement.projectId !== input.projectId) {
      throw new TestDesignProjectMismatchError(input.projectId, input.requirementId);
    }

    const designs = await this.prisma.requirementTestDesign.findMany({
      where: {
        requirementId: input.requirementId,
        projectId: input.projectId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return designs.map(d => this.mapToDto(d, requirement.requirementKey));
  }

  /**
   * Forces regeneration of the Test Design Plan.
   */
  public async regenerateTestDesign(
    input: RegenerateTestDesignInputDto,
  ): Promise<TestDesignPlanDto> {
    const parseResult = regenerateTestDesignInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new AiInvalidRequestError(
        'INVALID_REGENERATE_TEST_DESIGN_REQUEST',
        `Invalid regenerate test design input: ${parseResult.error.message}`,
      );
    }

    return this.analyzeTestDesign({
      projectId: input.projectId,
      requirementId: input.requirementId,
      forceRegenerate: true,
      configOverride: input.configOverride,
    });
  }

  private mergeBaselineWithLlm(
    baseline: StructuredTestDesignDto,
    llm: StructuredTestDesignDto,
  ): StructuredTestDesignDto {
    const levelsMap = new Map(baseline.recommendedLevels.map(l => [l.level, l]));
    for (const l of llm.recommendedLevels ?? []) {
      if (!levelsMap.has(l.level)) {
        levelsMap.set(l.level, l);
      }
    }

    const dimensionsMap = new Map(baseline.recommendedDimensions.map(d => [d.dimension, d]));
    for (const d of llm.recommendedDimensions ?? []) {
      if (!dimensionsMap.has(d.dimension)) {
        dimensionsMap.set(d.dimension, d);
      }
    }

    const techniquesMap = new Map(baseline.recommendedTechniques.map(t => [t.technique, t]));
    for (const t of llm.recommendedTechniques ?? []) {
      if (!techniquesMap.has(t.technique)) {
        techniquesMap.set(t.technique, t);
      }
    }

    const objectives = [...baseline.coverageObjectives];
    for (const o of llm.coverageObjectives ?? []) {
      if (!objectives.some(ex => ex.description.toLowerCase() === o.description.toLowerCase())) {
        objectives.push(o);
      }
    }

    const constraints = [...baseline.identifiedConstraints];
    for (const c of llm.identifiedConstraints ?? []) {
      if (!constraints.some(ex => ex.value === c.value && ex.parameter === c.parameter)) {
        constraints.push(c);
      }
    }

    const designQuestions = [...baseline.designQuestions];
    for (const q of llm.designQuestions ?? []) {
      if (!designQuestions.some(ex => ex.question === q.question)) {
        designQuestions.push(q);
      }
    }

    return {
      applicability:
        baseline.applicability === 'REQUIRES_CLARIFICATION' ||
        baseline.applicability === 'INSUFFICIENT_INFORMATION'
          ? baseline.applicability
          : (llm.applicability ?? baseline.applicability),
      applicabilityRationale: llm.applicabilityRationale || baseline.applicabilityRationale,
      automationSuitability:
        baseline.automationSuitability === 'UNKNOWN'
          ? 'UNKNOWN'
          : (llm.automationSuitability ?? baseline.automationSuitability),
      automationRationale: llm.automationRationale || baseline.automationRationale,
      recommendedLevels: Array.from(levelsMap.values()),
      recommendedDimensions: Array.from(dimensionsMap.values()),
      recommendedTechniques: Array.from(techniquesMap.values()),
      coverageObjectives: objectives,
      riskFocusAreas: [...baseline.riskFocusAreas, ...(llm.riskFocusAreas ?? [])],
      identifiedConstraints: constraints,
      designQuestions,
      rationale: [...baseline.rationale, ...(llm.rationale ?? [])],
      sourceContext: [...baseline.sourceContext, ...(llm.sourceContext ?? [])],
    };
  }

  private mapToDto(record: any, requirementKey: string): TestDesignPlanDto {
    return {
      id: record.id,
      projectId: record.projectId,
      requirementId: record.requirementId,
      requirementKey,
      requirementVersionId: record.requirementVersionId,
      requirementVersionNumber: record.requirementVersionNumber,
      status: record.status,
      applicability: record.applicability,
      automationSuitability: record.automationSuitability,
      inputFingerprint: record.inputFingerprint,
      engineVersion: record.engineVersion,
      promptTemplateVersion: record.promptTemplateVersion,
      providerId: record.providerId,
      model: record.model,
      structuredDesign: record.structuredDesignJson,
      usage: record.usageJson,
      durationMs: record.durationMs,
      errorMessage: record.errorMessage,
      createdAt:
        record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
      updatedAt:
        record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
      staleAt:
        record.staleAt instanceof Date ? record.staleAt.toISOString() : (record.staleAt ?? null),
    };
  }
}
