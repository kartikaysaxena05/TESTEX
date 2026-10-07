/**
 * @file packages/core/src/website-targets/production-safety-checker.ts
 * Evaluates action safety, side-effects, and deterministic blocking of destructive
 * or financial operations under Production Safe Mode.
 */

import type { ActionSafetyClass, EnvironmentType } from '@ai-quality/contracts';
import { ProductionSafeModeViolationError } from './website-target-errors.js';

export interface ActionEvaluationContext {
  readonly action: string;
  readonly description?: string | null;
  readonly targetSelector?: string | null;
  readonly value?: string | null;
}

export interface TargetSafetyContext {
  readonly environmentType: EnvironmentType;
  readonly safeModeEnabled: boolean;
}

export interface ActionSafetyEvaluationResult {
  readonly isSafe: boolean;
  readonly safetyClass: ActionSafetyClass;
  readonly reason: string;
  readonly isBlockedBySafeMode: boolean;
  readonly detectedKeywords: readonly string[];
}

export class ProductionSafetyChecker {
  private static readonly DESTRUCTIVE_KEYWORDS = [
    'delete',
    'destroy',
    'remove',
    'cancel_order',
    'cancel-order',
    'cancel order',
    'account_delete',
    'account-delete',
    'delete account',
    'terminate',
    'wipe',
    'purge',
    'erase',
    'drop',
  ];

  private static readonly FINANCIAL_KEYWORDS = [
    'pay',
    'payment',
    'purchase',
    'order',
    'checkout',
    'buy',
    'charge',
    'wire',
    'credit_card',
    'credit-card',
    'credit card',
    'transfer money',
    'transfer_money',
    'execute_trade',
    'execute trade',
    'subscribe',
  ];

  private static readonly EXTERNAL_SIDE_EFFECT_KEYWORDS = [
    'email_send',
    'email-send',
    'send email',
    'send_email',
    'sms_send',
    'sms-send',
    'send sms',
    'send_sms',
    'notification',
    'webhook',
    'blast',
    'mass_message',
    'broadcast',
  ];

  private static readonly READ_ONLY_ACTIONS = new Set<string>([
    'NAVIGATE',
    'GO_BACK',
    'GO_FORWARD',
    'RELOAD',
    'SCREENSHOT',
    'SNAPSHOT',
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

  /**
   * Evaluates a candidate action against target environment rules and Production Safe Mode.
   */
  public static evaluateAction(
    target: TargetSafetyContext,
    context: ActionEvaluationContext,
  ): ActionSafetyEvaluationResult {
    const actionUpper = (context.action || '').toUpperCase();
    const isReadOnly = this.READ_ONLY_ACTIONS.has(actionUpper);

    // Combine contextual text to inspect for destructive/financial keywords
    const combinedText = [
      context.action,
      context.description ?? '',
      context.targetSelector ?? '',
      context.value ?? '',
    ]
      .join(' ')
      .toLowerCase();

    const detectedKeywords: string[] = [];

    // Check DESTRUCTIVE
    for (const kw of this.DESTRUCTIVE_KEYWORDS) {
      if (combinedText.includes(kw)) {
        detectedKeywords.push(kw);
      }
    }
    if (detectedKeywords.length > 0 && !isReadOnly) {
      const isBlocked = target.environmentType === 'PRODUCTION' && target.safeModeEnabled;
      return {
        isSafe: !isBlocked,
        safetyClass: 'DESTRUCTIVE',
        reason: isBlocked
          ? `Destructive action blocked by Production Safe Mode (detected keywords: ${detectedKeywords.join(', ')}).`
          : `Destructive action identified (${detectedKeywords.join(', ')}).`,
        isBlockedBySafeMode: isBlocked,
        detectedKeywords,
      };
    }

    // Check FINANCIAL
    for (const kw of this.FINANCIAL_KEYWORDS) {
      if (combinedText.includes(kw)) {
        detectedKeywords.push(kw);
      }
    }
    if (detectedKeywords.length > 0 && !isReadOnly) {
      const isBlocked = target.environmentType === 'PRODUCTION' && target.safeModeEnabled;
      return {
        isSafe: !isBlocked,
        safetyClass: 'FINANCIAL',
        reason: isBlocked
          ? `Financial / transaction action blocked by Production Safe Mode (detected keywords: ${detectedKeywords.join(', ')}).`
          : `Financial action identified (${detectedKeywords.join(', ')}).`,
        isBlockedBySafeMode: isBlocked,
        detectedKeywords,
      };
    }

    // Check EXTERNAL_SIDE_EFFECT
    for (const kw of this.EXTERNAL_SIDE_EFFECT_KEYWORDS) {
      if (combinedText.includes(kw)) {
        detectedKeywords.push(kw);
      }
    }
    if (detectedKeywords.length > 0 && !isReadOnly) {
      const isBlocked = target.environmentType === 'PRODUCTION' && target.safeModeEnabled;
      return {
        isSafe: !isBlocked,
        safetyClass: 'EXTERNAL_SIDE_EFFECT',
        reason: isBlocked
          ? `External side-effect action blocked by Production Safe Mode (detected keywords: ${detectedKeywords.join(', ')}).`
          : `External side-effect action identified (${detectedKeywords.join(', ')}).`,
        isBlockedBySafeMode: isBlocked,
        detectedKeywords,
      };
    }

    // Interactive mutations (CLICK, FILL, TYPE, SELECT, CHECK) without dangerous keywords
    if (!isReadOnly) {
      return {
        isSafe: true,
        safetyClass: 'LOW_RISK_MUTATION',
        reason: 'Low risk mutation permitted.',
        isBlockedBySafeMode: false,
        detectedKeywords: [],
      };
    }

    // Read only
    return {
      isSafe: true,
      safetyClass: 'SAFE_READ',
      reason: 'Read-only action safe to execute.',
      isBlockedBySafeMode: false,
      detectedKeywords: [],
    };
  }

  /**
   * Asserts that an action is safe to execute on the specified target.
   * Throws ProductionSafeModeViolationError if blocked.
   */
  public static assertActionSafe(
    target: TargetSafetyContext,
    context: ActionEvaluationContext,
  ): void {
    const res = this.evaluateAction(target, context);
    if (!res.isSafe) {
      throw new ProductionSafeModeViolationError(res.reason);
    }
  }
}
