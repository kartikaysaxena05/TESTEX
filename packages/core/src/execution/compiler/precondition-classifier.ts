/**
 * @file packages/core/src/execution/compiler/precondition-classifier.ts
 * Classifies test case preconditions into structured executable execution assumptions.
 */

import crypto from 'node:crypto';
import type { ExecutablePreconditionDto, TestCasePreconditionDto } from '@ai-quality/contracts';

export class PreconditionClassifier {
  /**
   * Classifies an array of TestCasePreconditionDto items into ExecutablePreconditionDto objects.
   */
  public classifyPreconditions(
    preconditions?: readonly TestCasePreconditionDto[],
  ): readonly ExecutablePreconditionDto[] {
    if (!preconditions || preconditions.length === 0) {
      return [];
    }

    return preconditions.map((pre, idx) => {
      const desc = pre.description.trim();
      const lower = desc.toLowerCase();

      let category:
        | 'EXECUTION_PREREQUISITE'
        | 'AUTHENTICATION'
        | 'ENVIRONMENT_ASSUMPTION'
        | 'DATA_REQUIREMENT'
        | 'MANUAL_CONSTRAINT' = 'EXECUTION_PREREQUISITE';

      if (
        lower.includes('logged in') ||
        lower.includes('authenticated') ||
        lower.includes('auth token') ||
        lower.includes('session exists') ||
        lower.includes('credentials')
      ) {
        category = 'AUTHENTICATION';
      } else if (
        lower.includes('account exists') ||
        lower.includes('user exists') ||
        lower.includes('database contains') ||
        lower.includes('item in cart') ||
        lower.includes('record created') ||
        lower.includes('product exists')
      ) {
        category = 'DATA_REQUIREMENT';
      } else if (
        lower.includes('environment') ||
        lower.includes('server running') ||
        lower.includes('api available') ||
        lower.includes('network connected')
      ) {
        category = 'ENVIRONMENT_ASSUMPTION';
      } else if (
        lower.includes('manual') ||
        lower.includes('physical') ||
        lower.includes('sms') ||
        lower.includes('phone') ||
        lower.includes('hardware')
      ) {
        category = 'MANUAL_CONSTRAINT';
      }

      return {
        id: crypto.randomUUID(),
        sequence: pre.sequenceOrder ?? idx + 1,
        category,
        description: desc,
        isEnforced: pre.isEnforced ?? true,
      };
    });
  }
}
