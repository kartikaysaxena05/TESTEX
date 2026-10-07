/**
 * @file packages/core/src/failures/localization/timeline-correlation.test.ts
 * Unit tests for TimelineCorrelationBuilder and StepNetworkCorrelator (V6 Phase 81).
 */

import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { TimelineCorrelationBuilder } from './timeline-correlation-builder.js';
import { StepNetworkCorrelator } from './step-network-correlator.js';
import type { TechnicalLocalizationFacts } from './localization-types.js';

test('Timeline Correlation Engine (Phase 81)', async t => {
  const timelineBuilder = new TimelineCorrelationBuilder();
  const networkCorrelator = new StepNetworkCorrelator();

  await t.test(
    '1. Merges steps, network, console, and assertion into deterministic chronological timeline',
    () => {
      const t0 = new Date('2026-09-08T12:00:00.000Z');
      const t1 = new Date('2026-09-08T12:00:00.100Z');
      const t2 = new Date('2026-09-08T12:00:00.250Z');
      const t3 = new Date('2026-09-08T12:00:00.400Z');
      const t4 = new Date('2026-09-08T12:00:00.600Z');

      const facts: TechnicalLocalizationFacts = {
        projectId: crypto.randomUUID(),
        failureCaseId: crypto.randomUUID(),
        testCaseId: crypto.randomUUID(),
        testCaseTitle: 'Timeline Verification Test',
        testRunId: crypto.randomUUID(),
        executionId: crypto.randomUUID(),
        stepIndex: 1,
        domainSeparation: null,
        steps: [
          {
            id: 'step-1',
            stepIndex: 1,
            actionType: 'CLICK',
            status: 'FAILED',
            targetLocator: '#submit-btn',
            errorMessage: 'Server 500 error',
            startedAt: t0,
            completedAt: t4,
            durationMs: 600,
          },
        ],
        evidenceItems: [
          {
            id: 'art-net-req',
            artifactType: 'NETWORK_REQUEST',
            logicalName: 'submit_req',
            integrityStatus: 'VALID',
            metadataJson: {
              url: 'http://localhost:3000/api/submit',
              method: 'POST',
              stepIndex: 1,
              timestampMs: t1.getTime(),
            },
            createdAt: t1,
          },
          {
            id: 'art-console',
            artifactType: 'CONSOLE_LOG',
            logicalName: 'console_err',
            integrityStatus: 'VALID',
            metadataJson: {
              level: 'error',
              message: 'Failed to load resource: the server responded with a status of 500',
              stepIndex: 1,
              timestampMs: t2.getTime(),
            },
            createdAt: t2,
          },
          {
            id: 'art-net-resp',
            artifactType: 'NETWORK_RESPONSE',
            logicalName: 'submit_resp',
            integrityStatus: 'VALID',
            metadataJson: {
              url: 'http://localhost:3000/api/submit',
              method: 'POST',
              statusCode: 500,
              stepIndex: 1,
              timestampMs: t3.getTime(),
            },
            createdAt: t3,
          },
        ],
        repositoryFiles: [],
      };

      const timeline = timelineBuilder.buildTimeline(facts);

      assert.strictEqual(timeline.length, 5); // stepStart, netReq, console, netResp, stepFailure
      assert.strictEqual(timeline[0]?.eventId, 'evt_0001');
      assert.strictEqual(timeline[0]?.eventType, 'STEP_EXECUTION');
      assert.strictEqual(timeline[0]?.relativeTimeMs, 0);

      assert.strictEqual(timeline[1]?.eventId, 'evt_0002');
      assert.strictEqual(timeline[1]?.eventType, 'NETWORK_REQUEST');
      assert.strictEqual(timeline[1]?.relativeTimeMs, 100);

      assert.strictEqual(timeline[2]?.eventId, 'evt_0003');
      assert.strictEqual(timeline[2]?.eventType, 'CONSOLE_ERROR');
      assert.strictEqual(timeline[2]?.relativeTimeMs, 250);

      assert.strictEqual(timeline[3]?.eventId, 'evt_0004');
      assert.strictEqual(timeline[3]?.eventType, 'NETWORK_RESPONSE');
      assert.strictEqual(timeline[3]?.relativeTimeMs, 400);

      assert.strictEqual(timeline[4]?.eventId, 'evt_0005');
      assert.strictEqual(timeline[4]?.eventType, 'ASSERTION_FAILURE');
      assert.strictEqual(timeline[4]?.relativeTimeMs, 600);
    },
  );

  await t.test(
    '2. StepNetworkCorrelator detects failed requests within step execution interval',
    () => {
      const t0 = new Date('2026-09-08T12:00:00.000Z');
      const t1 = new Date('2026-09-08T12:00:01.000Z');

      const facts: TechnicalLocalizationFacts = {
        projectId: crypto.randomUUID(),
        failureCaseId: crypto.randomUUID(),
        testCaseId: crypto.randomUUID(),
        testCaseTitle: 'Network Correlator Test',
        testRunId: crypto.randomUUID(),
        executionId: crypto.randomUUID(),
        stepIndex: 1,
        domainSeparation: null,
        steps: [
          {
            id: 'step-1',
            stepIndex: 1,
            actionType: 'CLICK',
            status: 'FAILED',
            targetLocator: '#checkout',
            errorMessage: 'Step failed',
            startedAt: t0,
            completedAt: t1,
            durationMs: 1000,
          },
        ],
        evidenceItems: [
          {
            id: 'req-1',
            artifactType: 'NETWORK_RESPONSE',
            logicalName: 'api_cart',
            integrityStatus: 'VALID',
            metadataJson: {
              url: 'http://localhost:3000/api/cart',
              method: 'GET',
              statusCode: 200,
              stepIndex: 1,
              timestampMs: t0.getTime() + 200,
            },
            createdAt: t0,
          },
          {
            id: 'req-2',
            artifactType: 'NETWORK_RESPONSE',
            logicalName: 'api_pay',
            integrityStatus: 'VALID',
            metadataJson: {
              url: 'http://localhost:3000/api/pay',
              method: 'POST',
              statusCode: 502,
              stepIndex: 1,
              timestampMs: t0.getTime() + 500,
            },
            createdAt: t0,
          },
        ],
        repositoryFiles: [],
      };

      const timeline = timelineBuilder.buildTimeline(facts);
      const correlation = networkCorrelator.correlate(facts, timeline);

      assert.strictEqual(correlation.failedStepIndex, 1);
      assert.strictEqual(correlation.correlatedRequests.length, 2);
      assert.strictEqual(correlation.failedHttpRequests.length, 1);
      assert.ok(correlation.primaryFailedRequest);
      assert.strictEqual(correlation.primaryFailedRequest?.statusCode, 502);
      assert.strictEqual(correlation.primaryFailedRequest?.url, 'http://localhost:3000/api/pay');
      assert.strictEqual(correlation.primaryFailedRequest?.isServerError, true);
    },
  );
});
