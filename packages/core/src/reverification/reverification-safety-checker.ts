/**
 * @file packages/core/src/reverification/reverification-safety-checker.ts
 * Evaluates target environment safety policies and detects destructive actions in production targets.
 */

import type { ProjectEnvironment } from '@prisma/client';
import type { EnvironmentSafetyResult } from './reverification-types.js';

export class ReverificationSafetyChecker {
  private static readonly MUTATING_KEYWORDS = [
    'pay',
    'payment',
    'purchase',
    'order',
    'checkout',
    'buy',
    'charge',
    'wire',
    'credit_card',
    'delete',
    'destroy',
    'remove',
    'cancel_order',
    'account_delete',
    'data_destruction',
    'email_send',
    'sms_send',
    'upload',
    'execute_trade',
  ];

  private static readonly MUTATING_ACTIONS = new Set([
    'FILL',
    'TYPE',
    'SELECT_OPTION',
    'UPLOAD_FILE',
    'CHECK',
    'UNCHECK',
    'DRAG_AND_DROP',
    'CLEAR',
  ]);

  /**
   * Evaluates whether reverification is safe to run on the target environment.
   */
  public evaluateSafety(
    environment: ProjectEnvironment,
    testSteps: ReadonlyArray<{
      readonly stepNumber: number;
      readonly action: string;
      readonly expectedResult?: string | null;
    }>,
  ): EnvironmentSafetyResult {
    if (!environment.isEnabled) {
      return {
        isSafe: false,
        safetyStatus: 'BLOCKED',
        safetyReason: `Target environment '${environment.name}' is disabled.`,
        isProduction: environment.isProduction,
        policy: environment.productionSafetyPolicy,
        mutatingStepIndices: [],
        detectedMutatingKeywords: [],
      };
    }

    const mutatingStepIndices: number[] = [];
    const detectedKeywords = new Set<string>();

    for (const step of testSteps) {
      const actionText = step.action.toLowerCase();
      const expectedText = (step.expectedResult || '').toLowerCase();
      const combined = `${actionText} ${expectedText}`;

      let hasMutatingKeyword = false;
      for (const kw of ReverificationSafetyChecker.MUTATING_KEYWORDS) {
        if (combined.includes(kw)) {
          hasMutatingKeyword = true;
          detectedKeywords.add(kw);
        }
      }

      const words = actionText.toUpperCase().split(/\s+/);
      const firstWord = words[0] || '';
      const isMutatingAction = ReverificationSafetyChecker.MUTATING_ACTIONS.has(firstWord);

      if (hasMutatingKeyword || isMutatingAction) {
        mutatingStepIndices.push(step.stepNumber);
      }
    }

    const detectedList = Array.from(detectedKeywords);

    // If environment is production, enforce production safety policy
    if (environment.isProduction) {
      if (environment.productionSafetyPolicy === 'PROHIBITED') {
        return {
          isSafe: false,
          safetyStatus: 'BLOCKED',
          safetyReason: `Production execution is strictly PROHIBITED for environment '${environment.name}'.`,
          isProduction: true,
          policy: environment.productionSafetyPolicy,
          mutatingStepIndices,
          detectedMutatingKeywords: detectedList,
        };
      }

      if (mutatingStepIndices.length > 0) {
        return {
          isSafe: false,
          safetyStatus: 'BLOCKED',
          safetyReason: `Execution would involve potentially destructive / mutating actions in production environment '${environment.name}' (detected: ${detectedList.join(', ') || 'mutating actions'} on step(s) ${mutatingStepIndices.join(', ')}).`,
          isProduction: true,
          policy: environment.productionSafetyPolicy,
          mutatingStepIndices,
          detectedMutatingKeywords: detectedList,
        };
      }
    }

    return {
      isSafe: true,
      safetyStatus: 'SAFE',
      safetyReason: environment.isProduction
        ? 'Read-only test execution allowed in production.'
        : 'Target environment allows execution.',
      isProduction: environment.isProduction,
      policy: environment.productionSafetyPolicy,
      mutatingStepIndices,
      detectedMutatingKeywords: detectedList,
    };
  }
}
