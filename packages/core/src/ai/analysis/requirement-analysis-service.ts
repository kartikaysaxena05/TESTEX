/**
 * @file packages/core/src/ai/analysis/requirement-analysis-service.ts
 * Core domain service for LLM-powered Requirement Analysis & Context-Aware Reasoning.
 */

import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient, DatabaseError } from '../../database/index.js';
import {
  type AnalyzeRequirementInputDto,
  type GetRequirementAnalysisInputDto,
  type GetRequirementAnalysisHistoryInputDto,
  type RegenerateRequirementAnalysisInputDto,
  type RequirementAiAnalysisDto,
  type RequirementInterpretationDto,
  type GroundingSummaryDto,
  type AiTokenUsageDto,
  analyzeRequirementInputSchema,
  getRequirementAnalysisInputSchema,
  getRequirementAnalysisHistoryInputSchema,
  regenerateRequirementAnalysisInputSchema,
} from '@ai-quality/contracts';
import {
  AiAnalysisProjectMismatchError,
  AiAnalysisRequirementNotFoundError,
  AiAnalysisError,
} from './analysis-errors.js';
import {
  REQUIREMENT_ANALYSIS_PROMPT_ID,
  REQUIREMENT_ANALYSIS_PROMPT_VERSION,
  REQUIREMENT_ANALYSIS_SCHEMA_VERSION,
} from './analysis-types.js';
import { GroundingValidator } from './grounding-validator.js';
import type { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import type { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import type { RequirementAnalysisPromptInput } from './analysis-prompt-definition.js';
import { AppLogger } from '../../logging/logger.js';

export interface RequirementAnalysisServiceOptions {
  readonly prisma?: PrismaClient;
  readonly retrievalService: RequirementContextRetrievalService;
  readonly promptExecutionService: AiPromptExecutionService;
  readonly logger?: AppLogger;
}

export class RequirementAnalysisService {
  private readonly prisma: PrismaClient;
  private readonly retrievalService: RequirementContextRetrievalService;
  private readonly promptExecutionService: AiPromptExecutionService;
  private readonly logger: AppLogger;

  constructor(options: RequirementAnalysisServiceOptions) {
    const client = options.prisma ?? getPrismaClient();
    if (!client) {
      throw new DatabaseError('Database client is not available');
    }
    this.prisma = client;
    this.retrievalService = options.retrievalService;
    this.promptExecutionService = options.promptExecutionService;
    this.logger = options.logger ?? new AppLogger();
  }

  /**
   * Performs or reuses a grounded LLM requirement analysis.
   */
  public async analyzeRequirement(
    rawInput: AnalyzeRequirementInputDto,
    _signal?: AbortSignal,
  ): Promise<RequirementAiAnalysisDto> {
    const input = analyzeRequirementInputSchema.parse(rawInput);

    // 1. Verify project exists and is not archived
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new AiAnalysisError(
        `Project with ID "${input.projectId}" not found.`,
        'PROJECT_NOT_FOUND',
      );
    }

    if (project.status === 'ARCHIVED') {
      throw new AiAnalysisError(
        `Project "${input.projectId}" is archived. Operations on archived projects are prohibited.`,
        'PROJECT_ARCHIVED',
      );
    }

    // 2. Load authoritative requirement with V3 intelligence
    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        representation: true,
        metadata: true,
        qualityAnalysis: true,
        qualityFindings: true,
        outgoingRelationships: true,
        repositoryEvidence: true,
      },
    });

    if (!requirement) {
      throw new AiAnalysisRequirementNotFoundError(input.requirementId);
    }

    if (requirement.projectId !== input.projectId) {
      throw new AiAnalysisProjectMismatchError();
    }

    const latestVersion = requirement.versions[0];
    const versionNumber = latestVersion ? latestVersion.versionNumber : 1;
    const versionId = latestVersion?.id ?? null;
    const initialUpdatedAt = requirement.updatedAt;

    // 3. Compute Input Fingerprint
    const qualityFindingTexts = requirement.qualityFindings.map(
      f => `[${f.category}/${f.severity}] ${f.message}`,
    );
    const relationshipTexts = requirement.outgoingRelationships.map(
      r => `[${r.relationshipType}] target: ${r.targetRequirementId}`,
    );
    const evidenceTexts = requirement.repositoryEvidence.map(
      e => `[${e.evidenceType}] ${e.filePath}${e.symbolName ? ` (${e.symbolName})` : ''}`,
    );

    const inputDataToHash = JSON.stringify({
      key: requirement.requirementKey,
      title: requirement.title,
      statement: requirement.originalText,
      versionNumber,
      classification: requirement.metadata?.category ?? requirement.type,
      qualityFindings: qualityFindingTexts,
      relationships: relationshipTexts,
      repositoryEvidence: evidenceTexts,
    });
    const inputSha256 = createHash('sha256').update(inputDataToHash).digest('hex');

    // 4. Retrieve Phase 46 RAG Context
    const ragPack = await this.retrievalService.retrieveContext({
      projectId: input.projectId,
      requirementId: input.requirementId,
      purpose: 'GENERAL_REQUIREMENT_REASONING',
    });

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

    // 5. Check Identical Input Cache (unless forceRegenerate is set)
    if (!input.forceRegenerate) {
      const existingCurrent = await this.prisma.requirementAiAnalysis.findFirst({
        where: {
          projectId: input.projectId,
          requirementId: input.requirementId,
          requirementVersionNumber: versionNumber,
          inputSha256,
          contextSha256,
          status: 'CURRENT',
        },
      });

      if (existingCurrent) {
        return this.mapToDto(existingCurrent, requirement.requirementKey);
      }
    }

    // 6. Build Prompt Input & Set of Valid Evidence IDs
    const validEvidenceIds = new Set<string>();
    validEvidenceIds.add(requirement.id);
    validEvidenceIds.add(requirement.requirementKey);
    for (const item of ragPack.items) {
      validEvidenceIds.add(item.id);
    }

    const promptInput: RequirementAnalysisPromptInput = {
      requirementKey: requirement.requirementKey,
      title: requirement.title,
      statement: requirement.originalText,
      versionNumber,
      classification: requirement.metadata?.category ?? requirement.type,
      qualityFindings: qualityFindingTexts,
      relationships: relationshipTexts,
      repositoryEvidence: evidenceTexts,
      retrievedContextItems: ragPack.items.map(item => ({
        id: item.id,
        sourceType: item.sourceType,
        title: item.title ?? 'Context Item',
        text: item.text,
        authorityTier: item.authorityTier,
        similarityScore: item.relevance.similarityScore,
      })),
    };

    this.logger.info('ai.analysis.started', {
      projectId: input.projectId,
      requirementId: input.requirementId,
      versionNumber,
      contextItemsCount: ragPack.items.length,
    });

    // 7. Execute Structured Prompt via Phase 44 & Phase 43
    const startTime = performance.now();
    const promptResult = await this.promptExecutionService.executePrompt<
      RequirementAnalysisPromptInput,
      RequirementInterpretationDto
    >({
      promptId: REQUIREMENT_ANALYSIS_PROMPT_ID,
      version: REQUIREMENT_ANALYSIS_PROMPT_VERSION,
      input: promptInput,
      configOverride: input.configOverride,
    });
    const durationMs = Math.round(performance.now() - startTime);

    // 8. Grounding & Citations Validation
    const { validatedAnalysis, groundingSummary } = GroundingValidator.validate(
      promptResult.data,
      requirement.originalText,
      validEvidenceIds,
    );

    // 9. Concurrency / Race Check
    // Verify requirement was not edited during LLM execution
    const freshReq = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { updatedAt: true },
    });

    const isStaleDueToRace =
      !freshReq || freshReq.updatedAt.getTime() !== initialUpdatedAt.getTime();
    const status = isStaleDueToRace ? 'STALE' : 'CURRENT';
    const staleAt = isStaleDueToRace ? new Date() : null;

    // 10. Persist in Database Transaction
    const analysisRecord = await this.prisma.$transaction(async tx => {
      // Mark any prior CURRENT analysis as STALE
      if (status === 'CURRENT') {
        await tx.requirementAiAnalysis.updateMany({
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

      // Insert new analysis
      return tx.requirementAiAnalysis.create({
        data: {
          projectId: input.projectId,
          requirementId: input.requirementId,
          requirementVersionId: versionId,
          requirementVersionNumber: versionNumber,
          status,
          providerId: promptResult.providerId,
          model: promptResult.modelReported ?? 'unknown',
          promptId: promptResult.promptId,
          promptVersion: promptResult.promptVersion,
          schemaVersion: REQUIREMENT_ANALYSIS_SCHEMA_VERSION,
          inputSha256,
          contextSha256,
          structuredAnalysisJson: validatedAnalysis as any,
          groundingSummaryJson: groundingSummary as any,
          usageJson: promptResult.usage as any,
          durationMs,
          staleAt,
        },
      });
    });

    this.logger.info('ai.analysis.completed', {
      analysisId: analysisRecord.id,
      projectId: input.projectId,
      requirementId: input.requirementId,
      status,
      durationMs,
      validCitations: groundingSummary.validCitations,
      unsupportedClaims: groundingSummary.unsupportedClaims,
    });

    return this.mapToDto(analysisRecord, requirement.requirementKey);
  }

  /**
   * Retrieves the current active AI analysis for a requirement.
   */
  public async getCurrentAnalysis(
    rawInput: GetRequirementAnalysisInputDto,
  ): Promise<RequirementAiAnalysisDto | null> {
    const input = getRequirementAnalysisInputSchema.parse(rawInput);

    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { projectId: true, requirementKey: true },
    });

    if (!requirement) {
      throw new AiAnalysisRequirementNotFoundError(input.requirementId);
    }

    if (requirement.projectId !== input.projectId) {
      throw new AiAnalysisProjectMismatchError();
    }

    const currentAnalysis = await this.prisma.requirementAiAnalysis.findFirst({
      where: {
        projectId: input.projectId,
        requirementId: input.requirementId,
        status: 'CURRENT',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!currentAnalysis) {
      return null;
    }

    return this.mapToDto(currentAnalysis, requirement.requirementKey);
  }

  /**
   * Retrieves historical analyses for a requirement.
   */
  public async getAnalysisHistory(
    rawInput: GetRequirementAnalysisHistoryInputDto,
  ): Promise<readonly RequirementAiAnalysisDto[]> {
    const input = getRequirementAnalysisHistoryInputSchema.parse(rawInput);

    const requirement = await this.prisma.requirement.findUnique({
      where: { id: input.requirementId },
      select: { projectId: true, requirementKey: true },
    });

    if (!requirement) {
      throw new AiAnalysisRequirementNotFoundError(input.requirementId);
    }

    if (requirement.projectId !== input.projectId) {
      throw new AiAnalysisProjectMismatchError();
    }

    const records = await this.prisma.requirementAiAnalysis.findMany({
      where: {
        projectId: input.projectId,
        requirementId: input.requirementId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(rec => this.mapToDto(rec, requirement.requirementKey));
  }

  /**
   * Explicitly regenerates the analysis for a requirement.
   */
  public async regenerateAnalysis(
    rawInput: RegenerateRequirementAnalysisInputDto,
    signal?: AbortSignal,
  ): Promise<RequirementAiAnalysisDto> {
    const input = regenerateRequirementAnalysisInputSchema.parse(rawInput);
    return this.analyzeRequirement({ ...input, forceRegenerate: true }, signal);
  }

  /**
   * Marks all CURRENT analyses for a requirement as STALE (e.g. upon requirement editing).
   */
  public async markStaleForRequirement(requirementId: string): Promise<number> {
    const res = await this.prisma.requirementAiAnalysis.updateMany({
      where: {
        requirementId,
        status: 'CURRENT',
      },
      data: {
        status: 'STALE',
        staleAt: new Date(),
      },
    });

    return res.count;
  }

  private mapToDto(record: any, requirementKey: string): RequirementAiAnalysisDto {
    return {
      id: record.id,
      projectId: record.projectId,
      requirementId: record.requirementId,
      requirementKey,
      requirementVersionId: record.requirementVersionId ?? null,
      requirementVersionNumber: record.requirementVersionNumber,
      status: record.status,
      providerId: record.providerId,
      model: record.model,
      promptId: record.promptId,
      promptVersion: record.promptVersion,
      schemaVersion: record.schemaVersion,
      inputSha256: record.inputSha256,
      contextSha256: record.contextSha256,
      structuredAnalysis: record.structuredAnalysisJson as RequirementInterpretationDto,
      groundingSummary: record.groundingSummaryJson as GroundingSummaryDto,
      usage: record.usageJson as AiTokenUsageDto,
      durationMs: record.durationMs,
      errorMessage: record.errorMessage ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      staleAt: record.staleAt ? record.staleAt.toISOString() : null,
    };
  }
}
