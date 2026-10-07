/**
 * @file packages/core/src/execution/retry/side-effect-safety-analyzer.ts
 * Inspects executable test plans to detect side-effecting/mutating actions and prevent unsafe retries.
 */

import type { ExecutablePlanStepDto } from '@ai-quality/contracts';
import type { ISideEffectSafetyAnalyzer, PlanSafetyAnalysisResult } from './retry-types.js';

export class SideEffectSafetyAnalyzer implements ISideEffectSafetyAnalyzer {
  private static readonly MUTATING_ACTION_TYPES = new Set<string>([
    'FILL',
    'TYPE',
    'CLEAR',
    'SELECT_OPTION',
    'UPLOAD_FILE',
    'CHECK',
    'UNCHECK',
    'DRAG_AND_DROP',
  ]);

  private static readonly READ_ONLY_ACTION_TYPES = new Set<string>([
    'NAVIGATE',
    'GO_BACK',
    'GO_FORWARD',
    'RELOAD',
    'WAIT',
    'WAIT_FOR_ELEMENT',
    'WAIT_FOR_URL',
    'WAIT_FOR_NETWORK',
    'ASSERT_VISIBLE',
    'ASSERT_TEXT',
    'ASSERT_VALUE',
    'ASSERT_URL',
    'ASSERT_TITLE',
    'ASSERT_COUNT',
    'ASSERT_ATTRIBUTE',
    'SCROLL',
    'SCROLL_INTO_VIEW',
    'HOVER',
    'FOCUS',
    'BLUR',
  ]);

  private static readonly MUTATING_KEYWORD_REGEX =
    /\b(?:submit|create|delete|remove|pay|payment|purchase|order|checkout|buy|charge|send|post|save|update|transfer|approve|cancel_order|destroy|subscribe|unsubscribe|finalize|execute_trade|wire)\b/i;

  /**
   * Analyzes an executable plan and failure context for side-effect safety.
   */
  public analyzePlan(
    steps: readonly ExecutablePlanStepDto[],
    failedStepIndex?: number | null,
  ): PlanSafetyAnalysisResult {
    if (!steps || steps.length === 0) {
      return {
        safetyLevel: 'SAFE_TO_RETRY',
        isSafe: true,
        reason: 'Empty plan has no mutating actions.',
        mutatingStepIndices: [],
        failedStepIndex,
      };
    }

    const mutatingIndices: number[] = [];

    for (const step of steps) {
      const actionUpper = step.action.toUpperCase();
      const isExplicitMutating = SideEffectSafetyAnalyzer.MUTATING_ACTION_TYPES.has(actionUpper);
      const isExplicitReadOnly = SideEffectSafetyAnalyzer.READ_ONLY_ACTION_TYPES.has(actionUpper);

      if (isExplicitMutating) {
        mutatingIndices.push(step.sequence);
        continue;
      }

      if (isExplicitReadOnly) {
        // Read-only actions (navigation, waiting, assertions) are never mutating even if target contains keywords
        continue;
      }

      // For interactive actions (e.g. CLICK, PRESS_KEY), check if target/description contains mutating keywords
      const targetText = [
        step.description ?? '',
        step.target?.name ?? '',
        step.target?.label ?? '',
        step.target?.role ?? '',
        step.target?.placeholder ?? '',
        step.target?.testId ?? '',
        step.target?.text ?? '',
        step.target?.css ?? '',
        step.target?.xpath ?? '',
        step.target?.semanticHint ?? '',
      ].join(' ');

      const hasMutatingKeyword = SideEffectSafetyAnalyzer.MUTATING_KEYWORD_REGEX.test(targetText);

      if (hasMutatingKeyword) {
        mutatingIndices.push(step.sequence);
      }
    }

    // No mutating steps detected -> Pure read-only flow
    if (mutatingIndices.length === 0) {
      return {
        safetyLevel: 'SAFE_TO_RETRY',
        isSafe: true,
        reason: 'Plan consists entirely of idempotent read/navigation actions and assertions.',
        mutatingStepIndices: [],
        failedStepIndex,
      };
    }

    // If failure occurred BEFORE any mutating step was executed
    if (failedStepIndex !== null && failedStepIndex !== undefined && failedStepIndex > 0) {
      const firstMutatingIndex = mutatingIndices[0] ?? Infinity;
      if (failedStepIndex < firstMutatingIndex) {
        return {
          safetyLevel: 'SAFE_TO_RETRY',
          isSafe: true,
          reason: `Failure occurred at step ${failedStepIndex} before reaching any mutating steps (first mutating step is at ${firstMutatingIndex}).`,
          mutatingStepIndices: mutatingIndices,
          failedStepIndex,
        };
      }
    }

    // Mutating steps were reached or failure occurred on/after mutation
    return {
      safetyLevel: 'NOT_SAFE_TO_RETRY',
      isSafe: false,
      reason: `Plan contains state-mutating actions at steps [${mutatingIndices.join(', ')}] which may cause duplicate transactions or inconsistent state if automatically retried.`,
      mutatingStepIndices: mutatingIndices,
      failedStepIndex,
    };
  }
}
