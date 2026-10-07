/**
 * @file packages/core/src/execution/actions/action-handlers/press-key-action-handler.ts
 * Handler for PRESS / PRESS_KEY actions with allowed keyboard key validation.
 */

import type { ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import { ALLOWED_PLAYWRIGHT_KEYS, type ActionExecutionContext } from '../action-types.js';
import { InvalidActionValueError } from '../action-errors.js';

export class PressKeyActionHandler extends BaseActionHandler {
  public readonly actionType = 'PRESS' as const;
  public readonly riskLevel = 'MUTATING' as const;

  protected async executeAction(
    action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    valueSummary?: string;
    metadataJson?: Record<string, unknown>;
  }> {
    const rawKey = (
      action.value?.value ||
      action.value?.keyName ||
      action.target?.name ||
      ''
    ).trim();

    if (!rawKey) {
      throw new InvalidActionValueError('PRESS action requires a valid keyboard key name.');
    }

    // Validate key against allowed Playwright keys (case-insensitive lookup, normalized)
    const normalizedKey = this.validateAndNormalizeKey(rawKey);

    let targetSummary = 'KEYBOARD_GLOBAL';

    if (
      action.target &&
      (action.target.name || action.target.testId || action.target.role || action.target.label)
    ) {
      const locator = await this.locatorResolver.resolve(context.page, action.target, {
        strict: true,
      });
      await locator.press(normalizedKey, { timeout: timeoutMs });
      targetSummary = this.locatorResolver.summarizeTarget(action.target);
    } else {
      await context.page.keyboard.press(normalizedKey);
    }

    return {
      targetSummary,
      valueSummary: normalizedKey,
      metadataJson: {
        key: normalizedKey,
      },
    };
  }

  private validateAndNormalizeKey(rawKey: string): string {
    const match = ALLOWED_PLAYWRIGHT_KEYS.find(k => k.toLowerCase() === rawKey.toLowerCase());

    if (match) {
      return match;
    }

    // Also support combination modifiers like Control+A, Shift+Tab, Meta+Enter
    const parts = rawKey.split('+').map(p => p.trim());
    if (parts.length > 1) {
      const normalizedParts = parts.map(part => {
        const found = ALLOWED_PLAYWRIGHT_KEYS.find(k => k.toLowerCase() === part.toLowerCase());
        if (!found) {
          // Allow single printable characters e.g. 'a', 'c', 'v' in Control+C
          if (part.length === 1 && /^[a-zA-Z0-9]$/.test(part)) {
            return part;
          }
          throw new InvalidActionValueError(
            `Key modifier component '${part}' in combination '${rawKey}' is not a recognized key.`,
          );
        }
        return found;
      });

      return normalizedParts.join('+');
    }

    // If single alphanumeric key
    if (rawKey.length === 1 && /^[a-zA-Z0-9]$/.test(rawKey)) {
      return rawKey;
    }

    throw new InvalidActionValueError(
      `Key '${rawKey}' is not a valid Playwright keyboard key. Allowed keys: ${ALLOWED_PLAYWRIGHT_KEYS.join(', ')}`,
    );
  }
}
