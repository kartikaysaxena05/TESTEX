/**
 * @file packages/core/src/execution/healing/locator-healing-engine.ts
 * Coordinates candidate discovery, deterministic scoring, safety thresholding, and audit recording for failed locators.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  ExecutableTargetDescriptorDto,
  LocatorHealingAttemptDto,
} from '@ai-quality/contracts';
import {
  HEALING_BOUNDS,
  type ILocatorHealingEngine,
  type IHealingCandidateDiscovery,
  type IHealingCandidateScorer,
  type IHealingSuggestionService,
  type HealingExecutionContext,
  type HealingExecutionResult,
} from './healing-types.js';
import { HealingCandidateDiscovery } from './healing-candidate-discovery.js';
import { HealingCandidateScorer } from './healing-candidate-scorer.js';
import { HealingSuggestionService } from './healing-suggestion-service.js';
import type { ILogger } from '../../logging/index.js';

export interface LocatorHealingEngineOptions {
  readonly discovery?: IHealingCandidateDiscovery;
  readonly scorer?: IHealingCandidateScorer;
  readonly suggestionService?: IHealingSuggestionService;
  readonly logger?: ILogger;
  readonly confidenceThreshold?: number;
  readonly destructiveThreshold?: number;
}

export class LocatorHealingEngine implements ILocatorHealingEngine {
  private readonly prisma?: PrismaClient;
  private readonly discovery: IHealingCandidateDiscovery;
  private readonly scorer: IHealingCandidateScorer;
  private readonly suggestionService?: IHealingSuggestionService;
  private readonly logger?: ILogger;
  private readonly confidenceThreshold: number;
  private readonly destructiveThreshold: number;

  constructor(prisma?: PrismaClient, options?: LocatorHealingEngineOptions) {
    this.prisma = prisma;
    this.logger = options?.logger;
    this.discovery = options?.discovery ?? new HealingCandidateDiscovery();
    this.scorer = options?.scorer ?? new HealingCandidateScorer();
    this.suggestionService =
      options?.suggestionService ??
      (prisma ? new HealingSuggestionService(prisma, options?.logger) : undefined);
    this.confidenceThreshold =
      options?.confidenceThreshold ?? HEALING_BOUNDS.DEFAULT_CONFIDENCE_THRESHOLD;
    this.destructiveThreshold =
      options?.destructiveThreshold ?? HEALING_BOUNDS.DESTRUCTIVE_CONFIDENCE_THRESHOLD;
  }

  /**
   * Attempts bounded and auditable self-healing for a failed target descriptor.
   */
  public async healLocator(context: HealingExecutionContext): Promise<HealingExecutionResult> {
    const tStart = performance.now();
    const isDestructive = context.isDestructiveAction ?? false;
    const requiredThreshold = isDestructive ? this.destructiveThreshold : this.confidenceThreshold;

    this.logger?.info('locator_healing.started', {
      projectId: context.projectId,
      testRunId: context.testRunId,
      stepIndex: context.stepIndex,
      actionType: context.actionType,
      isDestructive,
      requiredThreshold,
    });

    try {
      // 1. Discover candidates on the live page
      const candidates = await this.discovery.discoverCandidates(
        context.page,
        context.originalTarget,
        HEALING_BOUNDS.MAX_HEALING_CANDIDATES,
      );

      if (candidates.length === 0) {
        const durationMs = Math.round(performance.now() - tStart);
        const result: HealingExecutionResult = {
          healingResult: 'HEAL_FAILED',
          candidateCount: 0,
          candidatesEvaluated: [],
          confidenceThreshold: requiredThreshold,
          durationMs,
          reason: 'No candidate interactive elements discovered on page.',
        };
        await this.recordAuditAttempt(context, result);
        return result;
      }

      // 2. Rank and score candidates deterministically
      const ranked = this.scorer.rankCandidates(context.originalTarget, candidates, isDestructive);

      const evaluatedDtos = ranked.map(r => r.candidate);
      const top = ranked[0];
      const runnerUp = ranked.length > 1 ? ranked[1] : null;

      const durationMs = Math.round(performance.now() - tStart);

      // 3. Ambiguity Evaluation (Ambiguity Margin Guardrail)
      if (
        top &&
        !top.isDisqualified &&
        top.candidate.score >= 50 &&
        runnerUp &&
        !runnerUp.isDisqualified &&
        runnerUp.candidate.score >= 50
      ) {
        const scoreDifference = top.candidate.score - runnerUp.candidate.score;
        if (scoreDifference < HEALING_BOUNDS.AMBIGUITY_MARGIN) {
          const result: HealingExecutionResult = {
            healingResult: 'AMBIGUOUS',
            selectedScore: top.candidate.score,
            candidateCount: candidates.length,
            candidatesEvaluated: evaluatedDtos,
            confidenceThreshold: requiredThreshold,
            durationMs,
            reason: `Ambiguous candidates detected: Top candidate score ${top.candidate.score} vs Runner-up ${runnerUp.candidate.score} (margin ${scoreDifference} < ${HEALING_BOUNDS.AMBIGUITY_MARGIN}). Refusing to guess.`,
          };
          await this.recordAuditAttempt(context, result);
          return result;
        }
      }

      // 4. Evaluate Qualifications and Confidence Threshold
      if (!top || top.isDisqualified || top.candidate.score < requiredThreshold) {
        const topScore = top ? top.candidate.score : 0;
        const result: HealingExecutionResult = {
          healingResult: 'HEAL_FAILED',
          selectedScore: topScore,
          candidateCount: candidates.length,
          candidatesEvaluated: evaluatedDtos,
          confidenceThreshold: requiredThreshold,
          durationMs,
          reason: `Top candidate score (${topScore}) is below required threshold (${requiredThreshold}).`,
        };
        await this.recordAuditAttempt(context, result);
        return result;
      }

      // 5. Build replacement target descriptor
      const suggestedTarget = this.buildSuggestedTarget(context.originalTarget, top.candidate);

      // 6. Record reviewable suggestion if service is available
      let suggestion = null;
      if (this.suggestionService) {
        try {
          const runRecord = this.prisma
            ? await this.prisma.testRun.findUnique({ where: { id: context.testRunId } })
            : null;

          if (runRecord) {
            suggestion = await this.suggestionService.recordSuggestion({
              projectId: context.projectId,
              testCaseId: runRecord.testCaseId,
              testCaseVersionNumber: runRecord.testCaseVersionNumber,
              stepIndex: context.stepIndex,
              originalTarget: context.originalTarget,
              suggestedTarget,
              suggestedSelector: top.candidate.selectorRecipe,
              reason: `Deterministic self-healing matched candidate with score ${top.candidate.score}/100.`,
              score: top.candidate.score,
              discoveredInRunId: context.testRunId,
            });
          }
        } catch (err) {
          this.logger?.warn('locator_healing.suggestion_failed', { error: String(err) });
        }
      }

      // 7. Successful healing result
      const successfulResult: HealingExecutionResult = {
        healingResult: 'HEALED',
        selectedLocator: top.locator,
        selectedCandidate: top.candidate,
        selectedScore: top.candidate.score,
        candidateCount: candidates.length,
        candidatesEvaluated: evaluatedDtos,
        confidenceThreshold: requiredThreshold,
        suggestionCreated: suggestion,
        durationMs,
        reason: `Cleanly healed to replacement element with confidence score ${top.candidate.score}/100.`,
      };

      const audit = await this.recordAuditAttempt(context, successfulResult);
      return {
        ...successfulResult,
        auditRecord: audit,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - tStart);
      const errorMsg = err instanceof Error ? err.message : String(err);
      const failedResult: HealingExecutionResult = {
        healingResult: 'HEAL_FAILED',
        candidateCount: 0,
        candidatesEvaluated: [],
        confidenceThreshold: requiredThreshold,
        durationMs,
        reason: `Self-healing encountered runtime error: ${errorMsg}`,
      };
      await this.recordAuditAttempt(context, failedResult);
      return failedResult;
    }
  }

  private buildSuggestedTarget(
    original: ExecutableTargetDescriptorDto,
    candidate: any,
  ): ExecutableTargetDescriptorDto {
    if (candidate.testId) {
      return {
        ...original,
        strategy: 'TEST_ID',
        testId: candidate.testId,
      };
    }
    if (candidate.role && candidate.accessibleName) {
      return {
        ...original,
        strategy: 'ROLE',
        role: candidate.role,
        name: candidate.accessibleName,
      };
    }
    if (candidate.label) {
      return {
        ...original,
        strategy: 'LABEL',
        label: candidate.label,
      };
    }
    if (candidate.accessibleName) {
      return {
        ...original,
        strategy: 'TEXT',
        text: candidate.accessibleName,
      };
    }
    return original;
  }

  private async recordAuditAttempt(
    context: HealingExecutionContext,
    result: HealingExecutionResult,
  ): Promise<LocatorHealingAttemptDto | null> {
    if (!this.prisma) return null;

    try {
      const record = await this.prisma.locatorHealingAttempt.create({
        data: {
          projectId: context.projectId,
          testRunId: context.testRunId,
          executionId: context.executionId,
          stepExecutionId: context.stepExecutionId ?? null,
          stepIndex: context.stepIndex,
          attempt: context.attempt,
          actionType: context.actionType,
          originalTargetJson: context.originalTarget as any,
          originalSelector: context.originalSelector,
          failureReason: context.failureReason,
          healingResult: result.healingResult,
          candidateCount: result.candidateCount,
          selectedCandidateJson: (result.selectedCandidate as any) ?? null,
          selectedScore: result.selectedScore ?? null,
          confidenceThreshold: result.confidenceThreshold,
          scoringModelVersion: HEALING_BOUNDS.SCORING_MODEL_VERSION,
          policyVersion: HEALING_BOUNDS.HEALING_POLICY_VERSION,
          durationMs: result.durationMs,
          candidatesEvaluatedJson: result.candidatesEvaluated as any,
          actionAttempted: result.healingResult === 'HEALED',
          actionSucceeded: false, // Updated downstream upon action completion
        },
      });

      this.logger?.info('locator_healing.audit_recorded', {
        attemptId: record.id,
        healingResult: record.healingResult,
        selectedScore: record.selectedScore,
      });

      return {
        id: record.id,
        projectId: record.projectId,
        testRunId: record.testRunId,
        executionId: record.executionId,
        stepExecutionId: record.stepExecutionId,
        stepIndex: record.stepIndex,
        attempt: record.attempt,
        actionType: record.actionType,
        originalTarget: record.originalTargetJson as any,
        originalSelector: record.originalSelector,
        failureReason: record.failureReason,
        healingResult: record.healingResult as any,
        candidateCount: record.candidateCount,
        selectedCandidate: record.selectedCandidateJson as any,
        selectedScore: record.selectedScore,
        confidenceThreshold: record.confidenceThreshold,
        scoringModelVersion: record.scoringModelVersion,
        policyVersion: record.policyVersion,
        durationMs: record.durationMs,
        candidatesEvaluated: record.candidatesEvaluatedJson as any,
        actionAttempted: record.actionAttempted,
        actionSucceeded: record.actionSucceeded,
        evidenceBundleId: record.evidenceBundleId,
        createdAt: record.createdAt.toISOString(),
      };
    } catch (err) {
      this.logger?.error('locator_healing.audit_failed', { error: String(err) });
      return null;
    }
  }
}
