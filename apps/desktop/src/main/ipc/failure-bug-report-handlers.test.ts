/**
 * @file apps/desktop/src/main/ipc/failure-bug-report-handlers.test.ts
 * Unit and security tests for Structured Bug Report IPC handlers (V6 Phase 87).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCreateBugReport,
  handleGetBugReport,
  handleListBugReports,
  handleRegenerateBugReport,
  handleListBugReportHistory,
  setSharedStructuredBugReportService,
} from './failure-handlers.js';
import type { StructuredBugReportService } from '@ai-quality/core';
import type { StructuredBugReportDto } from '@ai-quality/contracts';

describe('Structured Bug Report IPC Handlers (V6 Phase 87)', () => {
  function createMockEvent(isMainFrame = true): IpcMainInvokeEvent {
    return {
      senderFrame: {
        parent: isMainFrame ? null : ({} as any),
        url: isMainFrame ? 'app://renderer/index.html' : 'https://malicious-site.com',
      },
    } as unknown as IpcMainInvokeEvent;
  }

  const trustedEvent = createMockEvent(true);
  const untrustedEvent = createMockEvent(false);

  const testProjectId = crypto.randomUUID();
  const testFailureCaseId = crypto.randomUUID();
  const testReportId = crypto.randomUUID();

  const mockReportDto: StructuredBugReportDto = {
    id: testReportId,
    projectId: testProjectId,
    failureCaseId: testFailureCaseId,
    analysisRunId: null,
    reportNumber: 'BUG-000001',
    revision: 1,
    status: 'READY',
    defectState: 'CONFIRMED_APPLICATION_DEFECT',
    isApplicationDefect: true,
    title: '[CONFIRMED_APPLICATION_DEFECT] Checkout 500 Failure',
    summary: 'Payment API returned unhandled 500 error',
    environmentSummary: { os: 'linux', browserEngine: 'chromium' },
    requirementId: crypto.randomUUID(),
    requirementKey: 'REQ-CHECKOUT-01',
    requirementVersion: 2,
    testCaseId: crypto.randomUUID(),
    testCaseKey: 'TC-ECOM-042',
    testCaseVersion: 3,
    executionPlanId: 'plan-1',
    preconditions: ['User authenticated with verified account'],
    reproductionSteps: [
      {
        stepIndex: 1,
        actionType: 'NAVIGATE',
        description: 'NAVIGATE: https://app.example.com/cart',
        targetSummary: 'https://app.example.com/cart',
        actionDataJson: null,
        expectedSummary: 'Cart loaded',
        actualSummary: 'Cart rendered',
        status: 'PASSED',
        isFailureStep: false,
        errorMessage: null,
      },
      {
        stepIndex: 2,
        actionType: 'CLICK',
        description: 'CLICK: button#pay',
        targetSummary: 'button#pay',
        actionDataJson: null,
        expectedSummary: 'Order confirmed',
        actualSummary: '500 Internal Server Error',
        status: 'FAILED',
        isFailureStep: true,
        errorMessage: 'HTTP 500 Internal Server Error',
      },
    ],
    expectedBehavior: 'Order confirmation page displayed',
    actualBehavior: 'HTTP 500 Internal Server Error',
    failedStepIndex: 2,
    rootCauseHypothesis: '[SUPPORTED_HYPOTHESIS] NullReferenceException in OrderProcessingService',
    probableLayer: 'BACKEND_SERVICE',
    probableComponent: 'OrderProcessingService',
    severity: 'CRITICAL',
    priority: 'P0_IMMEDIATE',
    clusterKey: 'CLUST-ECOM-001',
    clusterMemberCount: 3,
    calibratedScore: 0.94,
    evidenceReferences: [
      {
        id: crypto.randomUUID(),
        evidenceType: 'SCREENSHOT',
        filePath: 'artifacts/shot.png',
        sha256: 'a'.repeat(64),
        byteSize: 10240,
        mimeType: 'image/png',
        integrityStatus: 'VERIFIED',
      },
    ],
    limitationsAndUnknowns: [
      'Root-cause analysis is a probabilistic hypothesis generated from telemetry',
    ],
    reportMarkdown: '# BUG-000001 (Rev 1)',
    reportFingerprint: 'f'.repeat(64),
    generatorVersion: '1.0.0',
    regenerationReason: null,
    supersededById: null,
    supersedesId: null,
    isStale: false,
    stalenessReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockService: Partial<StructuredBugReportService>;

  beforeEach(() => {
    mockService = {
      createBugReport: async () => mockReportDto,
      getBugReport: async () => mockReportDto,
      listBugReports: async () => ({
        items: [mockReportDto],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      }),
      regenerateBugReport: async () => ({
        ...mockReportDto,
        revision: 2,
        regenerationReason: 'New evidence attached',
      }),
      listBugReportHistory: async () => [mockReportDto],
    };
    setSharedStructuredBugReportService(mockService as StructuredBugReportService);
  });

  describe('handleCreateBugReport', () => {
    it('rejects untrusted sender', async () => {
      const result = await handleCreateBugReport(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects invalid payload', async () => {
      const result = await handleCreateBugReport(trustedEvent, {
        projectId: 'not-a-uuid',
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, 'VALIDATION_ERROR');
      }
    });

    it('successfully creates bug report', async () => {
      const result = await handleCreateBugReport(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.reportNumber, 'BUG-000001');
        assert.equal(result.data.defectState, 'CONFIRMED_APPLICATION_DEFECT');
      }
    });
  });

  describe('handleGetBugReport', () => {
    it('rejects untrusted sender', async () => {
      const result = await handleGetBugReport(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('returns structured bug report for valid query', async () => {
      const result = await handleGetBugReport(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.ok(result.data);
        assert.equal(result.data?.reportNumber, 'BUG-000001');
      }
    });
  });

  describe('handleListBugReports', () => {
    it('lists bug reports with pagination', async () => {
      const result = await handleListBugReports(trustedEvent, {
        projectId: testProjectId,
        page: 1,
        pageSize: 10,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.items.length, 1);
        assert.equal(result.data.total, 1);
      }
    });
  });

  describe('handleRegenerateBugReport', () => {
    it('successfully regenerates bug report with reason', async () => {
      const result = await handleRegenerateBugReport(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reason: 'New evidence attached',
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.revision, 2);
        assert.equal(result.data.regenerationReason, 'New evidence attached');
      }
    });
  });

  describe('handleListBugReportHistory', () => {
    it('lists audit history of bug reports', async () => {
      const result = await handleListBugReportHistory(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.length, 1);
      }
    });
  });
});
