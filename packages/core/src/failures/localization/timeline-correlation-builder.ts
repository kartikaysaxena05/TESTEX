/**
 * @file packages/core/src/failures/localization/timeline-correlation-builder.ts
 * Deterministic chronological timeline builder merging steps, network requests,
 * console errors, DOM events, and assertion failures for Phase 81.
 */

import type { TimelineEventDto, TimelineEventType } from '@ai-quality/contracts';
import { LOCALIZATION_BOUNDS, type TechnicalLocalizationFacts } from './localization-types.js';

interface RawEvent {
  readonly eventType: TimelineEventType;
  readonly timestampMs: number;
  readonly stepIndex?: number;
  readonly summary: string;
  readonly details: Record<string, unknown>;
  readonly evidenceArtifactId?: string;
  readonly fallbackOrder: number;
}

export class TimelineCorrelationBuilder {
  /**
   * Constructs a strictly ordered chronological event timeline from failure facts.
   */
  public buildTimeline(facts: TechnicalLocalizationFacts): readonly TimelineEventDto[] {
    const rawEvents: RawEvent[] = [];
    let fallbackOrder = 0;

    // 1. Process Step Execution Records
    for (const step of facts.steps) {
      const stepStartMs = step.startedAt ? step.startedAt.getTime() : fallbackOrder * 1000;
      rawEvents.push({
        eventType: 'STEP_EXECUTION',
        timestampMs: stepStartMs,
        stepIndex: step.stepIndex,
        summary: `Step ${step.stepIndex} started: ${step.actionType}${step.targetLocator ? ` on "${step.targetLocator}"` : ''}`,
        details: {
          actionType: step.actionType,
          status: step.status,
          targetLocator: step.targetLocator ?? undefined,
          actionValue: step.actionValue ?? undefined,
          durationMs: step.durationMs ?? undefined,
        },
        fallbackOrder: fallbackOrder++,
      });

      if (step.status === 'FAILED') {
        const failureTimestamp = step.completedAt
          ? step.completedAt.getTime()
          : stepStartMs + (step.durationMs ?? 100);
        rawEvents.push({
          eventType: 'ASSERTION_FAILURE',
          timestampMs: failureTimestamp,
          stepIndex: step.stepIndex,
          summary: `Step ${step.stepIndex} failed: ${step.errorMessage || 'Unknown step failure'}`,
          details: {
            errorMessage: step.errorMessage ?? undefined,
            targetLocator: step.targetLocator ?? undefined,
            actionType: step.actionType,
          },
          fallbackOrder: fallbackOrder++,
        });
      }
    }

    // 2. Process Evidence Artifacts
    for (const artifact of facts.evidenceItems) {
      const artifactTimeMs = artifact.createdAt.getTime();
      const meta = artifact.metadataJson ?? {};

      switch (artifact.artifactType) {
        case 'NETWORK_REQUEST': {
          const url = (meta.url as string) || (meta.endpoint as string) || 'unknown';
          const method = (meta.method as string) || 'GET';
          const reqTime = typeof meta.timestampMs === 'number' ? meta.timestampMs : artifactTimeMs;

          rawEvents.push({
            eventType: 'NETWORK_REQUEST',
            timestampMs: reqTime,
            stepIndex: typeof meta.stepIndex === 'number' ? meta.stepIndex : undefined,
            summary: `Network request: ${method} ${url}`,
            details: {
              url,
              method,
              headers: meta.headers,
              bodySample: meta.bodySample,
            },
            evidenceArtifactId: artifact.id,
            fallbackOrder: fallbackOrder++,
          });
          break;
        }

        case 'NETWORK_RESPONSE': {
          const url = (meta.url as string) || (meta.endpoint as string) || 'unknown';
          const status =
            typeof meta.statusCode === 'number' ? meta.statusCode : (meta.status as number) || 200;
          const respTime = typeof meta.timestampMs === 'number' ? meta.timestampMs : artifactTimeMs;

          rawEvents.push({
            eventType: 'NETWORK_RESPONSE',
            timestampMs: respTime,
            stepIndex: typeof meta.stepIndex === 'number' ? meta.stepIndex : undefined,
            summary: `Network response: ${status} for ${url}`,
            details: {
              url,
              statusCode: status,
              durationMs: meta.durationMs,
              responseBodySample: meta.responseBodySample,
            },
            evidenceArtifactId: artifact.id,
            fallbackOrder: fallbackOrder++,
          });
          break;
        }

        case 'NETWORK_LOG': {
          // May contain entries array
          if (Array.isArray(meta.entries)) {
            for (const entry of meta.entries as Record<string, unknown>[]) {
              const url = (entry.url as string) || 'unknown';
              const status = typeof entry.statusCode === 'number' ? entry.statusCode : 200;
              const entryTime =
                typeof entry.timestampMs === 'number' ? entry.timestampMs : artifactTimeMs;

              rawEvents.push({
                eventType: 'NETWORK_RESPONSE',
                timestampMs: entryTime,
                stepIndex: typeof entry.stepIndex === 'number' ? entry.stepIndex : undefined,
                summary: `HTTP ${status}: ${url}`,
                details: entry,
                evidenceArtifactId: artifact.id,
                fallbackOrder: fallbackOrder++,
              });
            }
          }
          break;
        }

        case 'CONSOLE_LOG': {
          if (Array.isArray(meta.entries)) {
            for (const entry of meta.entries as Record<string, unknown>[]) {
              const level = (entry.level as string) || 'error';
              const message = (entry.message as string) || (entry.text as string) || '';
              const logTime =
                typeof entry.timestampMs === 'number' ? entry.timestampMs : artifactTimeMs;

              rawEvents.push({
                eventType: 'CONSOLE_ERROR',
                timestampMs: logTime,
                stepIndex: typeof entry.stepIndex === 'number' ? entry.stepIndex : undefined,
                summary: `Console [${level}]: ${message.slice(0, 120)}`,
                details: entry,
                evidenceArtifactId: artifact.id,
                fallbackOrder: fallbackOrder++,
              });
            }
          } else if (meta.message || meta.text) {
            const message = (meta.message as string) || (meta.text as string) || '';
            rawEvents.push({
              eventType: 'CONSOLE_ERROR',
              timestampMs: typeof meta.timestampMs === 'number' ? meta.timestampMs : artifactTimeMs,
              stepIndex: typeof meta.stepIndex === 'number' ? meta.stepIndex : undefined,
              summary: `Console log: ${message.slice(0, 120)}`,
              details: meta,
              evidenceArtifactId: artifact.id,
              fallbackOrder: fallbackOrder++,
            });
          }
          break;
        }

        case 'DOM_SNAPSHOT': {
          rawEvents.push({
            eventType: 'DOM_MUTATION',
            timestampMs: typeof meta.timestampMs === 'number' ? meta.timestampMs : artifactTimeMs,
            stepIndex:
              typeof meta.stepIndex === 'number' ? meta.stepIndex : (facts.stepIndex ?? undefined),
            summary: `DOM snapshot captured${meta.title ? `: "${meta.title}"` : ''}`,
            details: {
              url: meta.url,
              nodeCount: meta.nodeCount,
              activeElement: meta.activeElement,
            },
            evidenceArtifactId: artifact.id,
            fallbackOrder: fallbackOrder++,
          });
          break;
        }

        case 'ASSERTION_CONTEXT': {
          rawEvents.push({
            eventType: 'ASSERTION_FAILURE',
            timestampMs: typeof meta.timestampMs === 'number' ? meta.timestampMs : artifactTimeMs,
            stepIndex:
              typeof meta.stepIndex === 'number' ? meta.stepIndex : (facts.stepIndex ?? undefined),
            summary: `Assertion evaluated: ${meta.assertionType || 'assertion'} failed`,
            details: meta,
            evidenceArtifactId: artifact.id,
            fallbackOrder: fallbackOrder++,
          });
          break;
        }

        case 'ERROR_CONTEXT': {
          rawEvents.push({
            eventType: 'ERROR_EVENT',
            timestampMs: typeof meta.timestampMs === 'number' ? meta.timestampMs : artifactTimeMs,
            stepIndex: facts.stepIndex ?? undefined,
            summary: `Execution error: ${meta.errorMessage || meta.message || 'Error occurred'}`,
            details: meta,
            evidenceArtifactId: artifact.id,
            fallbackOrder: fallbackOrder++,
          });
          break;
        }
      }
    }

    // Sort deterministically: primary by timestampMs ascending, secondary by fallbackOrder
    rawEvents.sort((a, b) => {
      if (a.timestampMs !== b.timestampMs) {
        return a.timestampMs - b.timestampMs;
      }
      return a.fallbackOrder - b.fallbackOrder;
    });

    const baseTimeMs = rawEvents[0]?.timestampMs ?? Date.now();
    const limitedEvents = rawEvents.slice(0, LOCALIZATION_BOUNDS.MAX_TIMELINE_EVENTS);

    return limitedEvents.map((raw, idx) => ({
      eventId: `evt_${String(idx + 1).padStart(4, '0')}`,
      eventType: raw.eventType,
      timestampMs: raw.timestampMs,
      relativeTimeMs: Math.max(0, raw.timestampMs - baseTimeMs),
      stepIndex: raw.stepIndex,
      summary: raw.summary,
      details: raw.details,
      evidenceArtifactId: raw.evidenceArtifactId,
    }));
  }
}
