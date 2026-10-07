/**
 * @file packages/core/src/execution/actions/action-handlers/navigate-action-handler.ts
 * Handler for NAVIGATE action with URL resolution, unsafe scheme blocking, and target origin boundary enforcement.
 */

import type { ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import type { ActionExecutionContext } from '../action-types.js';
import { NavigationRejectedError, InvalidActionError } from '../action-errors.js';
import { UNSAFE_URL_PROTOCOLS } from '../../compiler/compiler-types.js';

export class NavigateActionHandler extends BaseActionHandler {
  public readonly actionType = 'NAVIGATE' as const;
  public readonly riskLevel = 'READ_ONLY' as const;

  protected async executeAction(
    action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    valueSummary?: string;
    metadataJson?: Record<string, unknown>;
  }> {
    const rawUrl = (
      action.target?.route ||
      action.value?.value ||
      action.target?.name ||
      ''
    ).trim();

    if (!rawUrl) {
      throw new InvalidActionError('NAVIGATE action requires a target route or URL.');
    }

    const resolvedUrl = this.resolveAndValidateUrl(rawUrl, context);

    await context.page.goto(resolvedUrl, {
      timeout: timeoutMs,
      waitUntil: 'load',
    });

    const finalUrl = context.page.url();

    return {
      targetSummary: `route="${rawUrl}" -> ${resolvedUrl}`,
      valueSummary: resolvedUrl,
      metadataJson: {
        resolvedUrl,
        finalUrl,
      },
    };
  }

  private resolveAndValidateUrl(rawUrl: string, context: ActionExecutionContext): string {
    const lower = rawUrl.toLowerCase();

    // 1. Check prohibited unsafe schemes
    for (const protocol of UNSAFE_URL_PROTOCOLS) {
      if (lower.startsWith(protocol)) {
        throw new NavigationRejectedError(
          rawUrl,
          `Prohibited protocol scheme '${protocol}' is not permitted.`,
        );
      }
    }

    const baseUrl = (context.baseUrl || context.environment?.baseUrl || '').trim();

    // 2. Relative URL resolution
    if (rawUrl.startsWith('/') || !rawUrl.includes('://')) {
      if (!baseUrl) {
        throw new NavigationRejectedError(
          rawUrl,
          'Cannot resolve relative URL because no environment base URL is configured.',
        );
      }

      try {
        const full = new URL(rawUrl, baseUrl);
        return full.toString();
      } catch (err: unknown) {
        throw new NavigationRejectedError(
          rawUrl,
          `Failed to resolve relative URL against base '${baseUrl}': ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 3. Absolute URL: Check origin boundary against configured environment base URL
    try {
      const targetParsed = new URL(rawUrl);

      if (baseUrl) {
        const baseParsed = new URL(baseUrl);
        if (targetParsed.origin !== baseParsed.origin) {
          throw new NavigationRejectedError(
            rawUrl,
            `Cross-origin navigation to '${targetParsed.origin}' is prohibited. Authorized origin: '${baseParsed.origin}'.`,
          );
        }
      }

      return targetParsed.toString();
    } catch (err: unknown) {
      if (err instanceof NavigationRejectedError) {
        throw err;
      }
      throw new NavigationRejectedError(
        rawUrl,
        `Malformed URL: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
