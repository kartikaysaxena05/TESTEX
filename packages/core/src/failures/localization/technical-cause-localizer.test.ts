/**
 * @file packages/core/src/failures/localization/technical-cause-localizer.test.ts
 * Unit tests for TechnicalCauseLocalizer (V6 Phase 81).
 */

import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { TechnicalCauseLocalizer } from './technical-cause-localizer.js';
import { RepositoryRouteLinker } from './repository-route-linker.js';
import { TimelineCorrelationBuilder } from './timeline-correlation-builder.js';
import { StepNetworkCorrelator } from './step-network-correlator.js';
import type { TechnicalLocalizationFacts } from './localization-types.js';

function createBaseFacts(
  overrides: Partial<TechnicalLocalizationFacts> = {},
): TechnicalLocalizationFacts {
  return {
    projectId: crypto.randomUUID(),
    failureCaseId: crypto.randomUUID(),
    testCaseId: crypto.randomUUID(),
    testCaseTitle: 'User Checkout Flow',
    testRunId: crypto.randomUUID(),
    executionId: crypto.randomUUID(),
    failureSummary: 'Step 2 failed',
    errorCode: null,
    errorMessage: null,
    failureSignature: 'sig-test-456',
    stepIndex: 2,
    domainSeparation: {
      id: crypto.randomUUID(),
      domain: 'APPLICATION_DEFECT_CANDIDATE',
      primaryRationale: 'Authoritative application defect candidate',
      isAuthoritative: true,
      evaluatedAt: new Date(),
    },
    evidenceItems: [],
    reproduction: null,
    classification: null,
    steps: [
      {
        id: crypto.randomUUID(),
        stepIndex: 1,
        actionType: 'NAVIGATE',
        status: 'PASSED',
        startedAt: new Date('2026-09-08T10:00:00Z'),
        completedAt: new Date('2026-09-08T10:00:01Z'),
        durationMs: 1000,
      },
      {
        id: crypto.randomUUID(),
        stepIndex: 2,
        actionType: 'CLICK',
        status: 'FAILED',
        targetLocator: '#checkout-button',
        errorMessage: 'Execution failed',
        startedAt: new Date('2026-09-08T10:00:01Z'),
        completedAt: new Date('2026-09-08T10:00:03Z'),
        durationMs: 2000,
      },
    ],
    repositoryFiles: [
      {
        id: crypto.randomUUID(),
        relativePath: 'src/controllers/checkout.controller.ts',
        name: 'checkout.controller.ts',
        classification: 'BACKEND_CONTROLLER',
        symbols: [
          {
            id: crypto.randomUUID(),
            name: 'processCheckout',
            kind: 'FUNCTION',
            startLine: 25,
            endLine: 60,
          },
        ],
      },
    ],
    ...overrides,
  };
}

test('TechnicalCauseLocalizer (Phase 81)', async t => {
  const routeLinker = new RepositoryRouteLinker();
  const localizer = new TechnicalCauseLocalizer(routeLinker);
  const timelineBuilder = new TimelineCorrelationBuilder();
  const networkCorrelator = new StepNetworkCorrelator();

  await t.test(
    '1. Backend API 500 error: localizes to BACKEND_API and links controller symbol',
    () => {
      const facts = createBaseFacts({
        evidenceItems: [
          {
            id: crypto.randomUUID(),
            artifactType: 'NETWORK_REQUEST',
            logicalName: 'checkout_request',
            integrityStatus: 'VALID',
            metadataJson: {
              url: 'http://localhost:3000/api/v1/checkout/process',
              method: 'POST',
              stepIndex: 2,
              timestampMs: new Date('2026-09-08T10:00:01.500Z').getTime(),
            },
            createdAt: new Date('2026-09-08T10:00:01.500Z'),
          },
          {
            id: crypto.randomUUID(),
            artifactType: 'NETWORK_RESPONSE',
            logicalName: 'checkout_response',
            integrityStatus: 'VALID',
            metadataJson: {
              url: 'http://localhost:3000/api/v1/checkout/process',
              method: 'POST',
              statusCode: 500,
              stepIndex: 2,
              timestampMs: new Date('2026-09-08T10:00:02.000Z').getTime(),
            },
            createdAt: new Date('2026-09-08T10:00:02.000Z'),
          },
        ],
      });

      const timeline = timelineBuilder.buildTimeline(facts);
      const network = networkCorrelator.correlate(facts, timeline);
      const result = localizer.localize(facts, timeline, network);

      assert.strictEqual(result.primaryLayer, 'BACKEND_API');
      assert.strictEqual(result.primaryTargetType, 'API_ENDPOINT');
      assert.strictEqual(result.httpStatusCode, 500);
      assert.strictEqual(result.matchedFilePath, 'src/controllers/checkout.controller.ts');
      assert.strictEqual(result.matchedSymbolName, 'processCheckout');
      assert.ok(result.correlationSignals.some(s => s.signalType === 'HTTP_5XX_SERVER_ERROR'));
      assert.ok(result.correlationSignals.some(s => s.signalType === 'REPOSITORY_CODE_LINKAGE'));
    },
  );

  await t.test('2. Database operation failure: localizes to DATABASE layer', () => {
    const facts = createBaseFacts({
      errorMessage:
        'PrismaClientKnownRequestError: Unique constraint failed on the fields: (email)',
      failureSummary: 'Database unique constraint violation during user registration',
    });

    const timeline = timelineBuilder.buildTimeline(facts);
    const network = networkCorrelator.correlate(facts, timeline);
    const result = localizer.localize(facts, timeline, network);

    assert.strictEqual(result.primaryLayer, 'DATABASE');
    assert.strictEqual(result.primaryTargetType, 'DATABASE_OPERATION');
    assert.strictEqual(result.primaryTargetIdentifier, 'unique_constraint_violation');
    assert.ok(result.secondaryLayers.includes('BACKEND_SERVICE'));
    assert.ok(result.correlationSignals.some(s => s.signalType === 'DATABASE_EXCEPTION_EVIDENCE'));
  });

  await t.test('3. Authentication rejection: localizes to AUTHENTICATION on HTTP 401', () => {
    const facts = createBaseFacts({
      evidenceItems: [
        {
          id: crypto.randomUUID(),
          artifactType: 'NETWORK_RESPONSE',
          logicalName: 'auth_response',
          integrityStatus: 'VALID',
          metadataJson: {
            url: 'http://localhost:3000/api/auth/token',
            method: 'POST',
            statusCode: 401,
            stepIndex: 2,
            timestampMs: new Date('2026-09-08T10:00:01.800Z').getTime(),
          },
          createdAt: new Date('2026-09-08T10:00:01.800Z'),
        },
      ],
    });

    const timeline = timelineBuilder.buildTimeline(facts);
    const network = networkCorrelator.correlate(facts, timeline);
    const result = localizer.localize(facts, timeline, network);

    assert.strictEqual(result.primaryLayer, 'AUTHENTICATION');
    assert.strictEqual(result.primaryTargetType, 'API_ENDPOINT');
    assert.strictEqual(result.httpStatusCode, 401);
  });

  await t.test('4. Authorization rejection: localizes to AUTHORIZATION on HTTP 403', () => {
    const facts = createBaseFacts({
      evidenceItems: [
        {
          id: crypto.randomUUID(),
          artifactType: 'NETWORK_RESPONSE',
          logicalName: 'admin_response',
          integrityStatus: 'VALID',
          metadataJson: {
            url: 'http://localhost:3000/api/admin/users',
            method: 'GET',
            statusCode: 403,
            stepIndex: 2,
            timestampMs: new Date('2026-09-08T10:00:01.800Z').getTime(),
          },
          createdAt: new Date('2026-09-08T10:00:01.800Z'),
        },
      ],
    });

    const timeline = timelineBuilder.buildTimeline(facts);
    const network = networkCorrelator.correlate(facts, timeline);
    const result = localizer.localize(facts, timeline, network);

    assert.strictEqual(result.primaryLayer, 'AUTHORIZATION');
    assert.strictEqual(result.primaryTargetType, 'API_ENDPOINT');
    assert.strictEqual(result.httpStatusCode, 403);
  });

  await t.test('5. Uncaught client-side JavaScript error: localizes to FRONTEND_STATE', () => {
    const facts = createBaseFacts({
      evidenceItems: [
        {
          id: crypto.randomUUID(),
          artifactType: 'CONSOLE_LOG',
          logicalName: 'browser_console',
          integrityStatus: 'VALID',
          metadataJson: {
            level: 'error',
            message: "TypeError: Cannot read properties of undefined (reading 'price')",
            stepIndex: 2,
            timestampMs: new Date('2026-09-08T10:00:02.000Z').getTime(),
          },
          createdAt: new Date('2026-09-08T10:00:02.000Z'),
        },
      ],
    });

    const timeline = timelineBuilder.buildTimeline(facts);
    const network = networkCorrelator.correlate(facts, timeline);
    const result = localizer.localize(facts, timeline, network);

    assert.strictEqual(result.primaryLayer, 'FRONTEND_STATE');
    assert.strictEqual(result.primaryTargetType, 'FRONTEND_COMPONENT');
    assert.ok(result.correlationSignals.some(s => s.signalType === 'CLIENT_SCRIPT_EXCEPTION'));
  });

  await t.test(
    '6. Phase 80 domain boundary guard: AUTOMATION_FAILURE restricts to BROWSER_AUTOMATION',
    () => {
      const facts = createBaseFacts({
        domainSeparation: {
          id: crypto.randomUUID(),
          domain: 'AUTOMATION_FAILURE',
          primaryRationale: 'Locator timeout',
          isAuthoritative: true,
          evaluatedAt: new Date(),
        },
        errorMessage: 'Timeout 30000ms exceeded waiting for locator("#cart-total")',
        failedStepTarget: '#cart-total',
      });

      const timeline = timelineBuilder.buildTimeline(facts);
      const network = networkCorrelator.correlate(facts, timeline);
      const result = localizer.localize(facts, timeline, network);

      assert.strictEqual(result.primaryLayer, 'BROWSER_AUTOMATION');
      assert.strictEqual(result.primaryTargetType, 'DOM_ELEMENT');
      assert.strictEqual(result.domSelector, '#cart-total');
      assert.ok(
        result.correlationSignals.some(s => s.signalType === 'AUTHORITATIVE_AUTOMATION_DOMAIN'),
      );
    },
  );

  await t.test(
    '7. Phase 80 domain boundary guard: TEST_DATA_FAILURE restricts to TEST_DATA',
    () => {
      const facts = createBaseFacts({
        domainSeparation: {
          id: crypto.randomUUID(),
          domain: 'TEST_DATA_FAILURE',
          primaryRationale: 'User account not found in test fixture',
          isAuthoritative: true,
          evaluatedAt: new Date(),
        },
        failedStepValue: 'testuser_missing@example.com',
      });

      const timeline = timelineBuilder.buildTimeline(facts);
      const network = networkCorrelator.correlate(facts, timeline);
      const result = localizer.localize(facts, timeline, network);

      assert.strictEqual(result.primaryLayer, 'TEST_DATA');
      assert.strictEqual(result.primaryTargetType, 'TEST_STEP');
      assert.strictEqual(result.primaryTargetIdentifier, 'testuser_missing@example.com');
    },
  );

  await t.test('8. Conflicting signals detection: background 500 when UI assertion failed', () => {
    const facts = createBaseFacts({
      steps: [
        {
          id: crypto.randomUUID(),
          stepIndex: 1,
          actionType: 'ASSERT',
          status: 'FAILED',
          targetLocator: '.status-badge',
          errorMessage: 'Expected "Active" but got "Pending"',
          startedAt: new Date('2026-09-08T10:00:01Z'),
          completedAt: new Date('2026-09-08T10:00:02Z'),
          durationMs: 1000,
        },
      ],
      evidenceItems: [
        {
          id: crypto.randomUUID(),
          artifactType: 'NETWORK_RESPONSE',
          logicalName: 'analytics_response',
          integrityStatus: 'VALID',
          metadataJson: {
            url: 'http://localhost:3000/api/analytics/track',
            method: 'POST',
            statusCode: 500,
            stepIndex: 99, // Unrelated background request
            timestampMs: new Date('2026-09-08T10:00:01.200Z').getTime(),
          },
          createdAt: new Date('2026-09-08T10:00:01.200Z'),
        },
      ],
    });

    const timeline = timelineBuilder.buildTimeline(facts);
    const network = networkCorrelator.correlate(facts, timeline);
    const result = localizer.localize(facts, timeline, network);

    assert.strictEqual(result.primaryLayer, 'FRONTEND_UI');
    assert.strictEqual(result.primaryTargetType, 'ASSERTION');
    assert.strictEqual(result.conflictingSignals.length, 1);
    assert.strictEqual(
      result.conflictingSignals[0]?.signalType,
      'UNSOLICITED_BACKGROUND_HTTP_ERROR',
    );
  });
});
