/**
 * @file packages/core/src/failures/localization/step-network-correlator.ts
 * Correlates test step execution intervals with network requests and HTTP responses for Phase 81.
 */

import type { TimelineEventDto } from '@ai-quality/contracts';
import type { TechnicalLocalizationFacts } from './localization-types.js';

export interface CorrelatedNetworkRequest {
  readonly url: string;
  readonly method: string;
  readonly statusCode?: number;
  readonly timestampMs: number;
  readonly durationMs?: number;
  readonly stepIndex?: number;
  readonly isHttpError: boolean;
  readonly isServerError: boolean;
  readonly isAuthError: boolean;
  readonly isClientError: boolean;
  readonly details: Record<string, unknown>;
}

export interface StepNetworkCorrelationResult {
  readonly failedStepIndex?: number | null;
  readonly correlatedRequests: readonly CorrelatedNetworkRequest[];
  readonly failedHttpRequests: readonly CorrelatedNetworkRequest[];
  readonly backgroundHttpErrors: readonly CorrelatedNetworkRequest[];
  readonly primaryFailedRequest?: CorrelatedNetworkRequest | null;
  readonly hasPendingOrHungRequests: boolean;
}

export class StepNetworkCorrelator {
  /**
   * Correlates network activity with the failed step execution window.
   */
  public correlate(
    facts: TechnicalLocalizationFacts,
    timeline: readonly TimelineEventDto[],
  ): StepNetworkCorrelationResult {
    const failedStep =
      facts.steps.find(s => s.status === 'FAILED') ??
      facts.steps.find(s => s.stepIndex === facts.stepIndex);
    const failedStepIndex = failedStep?.stepIndex ?? facts.stepIndex ?? null;

    const stepStartMs = failedStep && failedStep.startedAt ? failedStep.startedAt.getTime() : null;
    const stepEndMs =
      failedStep && failedStep.completedAt
        ? failedStep.completedAt.getTime() + 1000 // 1s grace buffer
        : stepStartMs
          ? stepStartMs + (failedStep?.durationMs ?? 5000) + 1000
          : null;

    const allRequests: CorrelatedNetworkRequest[] = [];

    // Extract from timeline events
    for (const evt of timeline) {
      if (evt.eventType === 'NETWORK_RESPONSE' || evt.eventType === 'NETWORK_REQUEST') {
        const url = (evt.details.url as string) || '';
        const method = (evt.details.method as string) || 'GET';
        const statusCode =
          typeof evt.details.statusCode === 'number' ? evt.details.statusCode : undefined;

        const isServerError = typeof statusCode === 'number' && statusCode >= 500;
        const isAuthError =
          typeof statusCode === 'number' && (statusCode === 401 || statusCode === 403);
        const isClientError =
          typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500;
        const isHttpError = isServerError || isClientError;

        allRequests.push({
          url,
          method,
          statusCode,
          timestampMs: evt.timestampMs,
          durationMs:
            typeof evt.details.durationMs === 'number' ? evt.details.durationMs : undefined,
          stepIndex: evt.stepIndex,
          isHttpError,
          isServerError,
          isAuthError,
          isClientError,
          details: evt.details,
        });
      }
    }

    // Correlate requests matching the failed step
    const correlated = allRequests.filter(req => {
      if (failedStepIndex !== null && typeof req.stepIndex === 'number') {
        return req.stepIndex === failedStepIndex;
      }
      if (stepStartMs !== null && stepEndMs !== null) {
        return req.timestampMs >= stepStartMs - 500 && req.timestampMs <= stepEndMs;
      }
      return true;
    });

    // Pick out failed requests directly correlated with the step
    const failedHttpRequests = correlated.filter(r => r.isHttpError);
    const backgroundHttpErrors = allRequests.filter(
      r =>
        r.isHttpError && !correlated.some(c => c.url === r.url && c.timestampMs === r.timestampMs),
    );

    // Determine primary failed request: prioritize step-correlated failures
    let primaryFailedRequest: CorrelatedNetworkRequest | null = null;
    const candidates =
      failedHttpRequests.length > 0
        ? failedHttpRequests
        : failedStepIndex === null
          ? allRequests.filter(r => r.isHttpError)
          : [];

    const serverErrors = candidates.filter(r => r.isServerError);
    if (serverErrors.length > 0) {
      primaryFailedRequest = serverErrors[serverErrors.length - 1] ?? null;
    } else {
      const authErrors = candidates.filter(r => r.isAuthError);
      if (authErrors.length > 0) {
        primaryFailedRequest = authErrors[authErrors.length - 1] ?? null;
      } else if (candidates.length > 0) {
        primaryFailedRequest = candidates[candidates.length - 1] ?? null;
      }
    }

    // Check for hung or pending requests (started around step, but no corresponding response found)
    const requestStarts = timeline.filter(e => e.eventType === 'NETWORK_REQUEST');
    const requestResponses = timeline.filter(e => e.eventType === 'NETWORK_RESPONSE');
    const hasPendingOrHungRequests = requestStarts.length > requestResponses.length;

    return {
      failedStepIndex,
      correlatedRequests: correlated,
      failedHttpRequests,
      backgroundHttpErrors,
      primaryFailedRequest,
      hasPendingOrHungRequests,
    };
  }
}
