/**
 * @file apps/desktop/src/main/ipc/failure-classification-handlers.test.ts
 * Unit and security tests for Failure Classification IPC handlers (V6 Phase 77).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleClassifyFailure,
  handleGetFailureClassification,
  handleReclassifyFailure,
  handleListFailureClassificationHistory,
  setSharedFailureClassificationService,
} from './failure-handlers.js';
import type { FailureDeterministicClassifier } from '@ai-quality/core';

describe('Failure Classification IPC Handlers & Security Tests (V6 Phase 77)', () => {
  function createMockEvent(isMainFrame = true): IpcMainInvokeEvent {
    return {
      senderFrame: {
        parent: isMainFrame ? null : ({} as any),
        url: isMainFrame ? 'app://renderer/index.html' : 'https://malicious-website.com',
      },
    } as unknown as IpcMainInvokeEvent;
  }

  const trustedEvent = createMockEvent(true);
  const untrustedEvent = createMockEvent(false);

  const testProjectId = crypto.randomUUID();
  const testFailureCaseId = crypto.randomUUID();

  let mockService: Partial<FailureDeterministicClassifier>;

  beforeEach(() => {
    mockService = {
      classify: async (input: any) => ({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        analysisRunId: null,
        category: 'APPLICATION_FAILURE' as const,
        subcategory: 'ASSERTION_MISMATCH' as const,
        classifierVersion: '1.0.0',
        taxonomyVersion: '1.0.0',
        primaryRuleId: 'APP_ASSERTION_MISMATCH_001',
        matchedRuleIds: ['APP_ASSERTION_MISMATCH_001'],
        ruleExplanations: [
          {
            ruleId: 'APP_ASSERTION_MISMATCH_001',
            ruleName: 'Application Assertion Mismatch',
            category: 'APPLICATION_FAILURE' as const,
            subcategory: 'ASSERTION_MISMATCH' as const,
            explanation: 'Application assertion failed',
            supportingEvidence: ['Assertion value mismatch'],
            signalStrength: 'DEFINITIVE' as const,
          },
        ],
        conflictingRuleIds: [],
        evidenceReferences: [],
        isAuthoritative: true,
        reclassificationReason: input.reclassificationReason ?? null,
        supersededById: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),

      getClassification: async (input: any) => ({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        analysisRunId: null,
        category: 'APPLICATION_FAILURE' as const,
        subcategory: 'ASSERTION_MISMATCH' as const,
        classifierVersion: '1.0.0',
        taxonomyVersion: '1.0.0',
        primaryRuleId: 'APP_ASSERTION_MISMATCH_001',
        matchedRuleIds: ['APP_ASSERTION_MISMATCH_001'],
        ruleExplanations: [],
        conflictingRuleIds: [],
        evidenceReferences: [],
        isAuthoritative: true,
        reclassificationReason: null,
        supersededById: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),

      reclassify: async (input: any) => ({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        analysisRunId: null,
        category: 'APPLICATION_FAILURE' as const,
        subcategory: 'ASSERTION_MISMATCH' as const,
        classifierVersion: '1.0.0',
        taxonomyVersion: '1.0.0',
        primaryRuleId: 'APP_ASSERTION_MISMATCH_001',
        matchedRuleIds: ['APP_ASSERTION_MISMATCH_001'],
        ruleExplanations: [],
        conflictingRuleIds: [],
        evidenceReferences: [],
        isAuthoritative: true,
        reclassificationReason: input.reclassificationReason,
        supersededById: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),

      listClassificationHistory: async (input: any) => [
        {
          id: crypto.randomUUID(),
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          analysisRunId: null,
          category: 'APPLICATION_FAILURE' as const,
          subcategory: 'ASSERTION_MISMATCH' as const,
          classifierVersion: '1.0.0',
          taxonomyVersion: '1.0.0',
          primaryRuleId: 'APP_ASSERTION_MISMATCH_001',
          matchedRuleIds: ['APP_ASSERTION_MISMATCH_001'],
          ruleExplanations: [],
          conflictingRuleIds: [],
          evidenceReferences: [],
          isAuthoritative: true,
          reclassificationReason: null,
          supersededById: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    setSharedFailureClassificationService(mockService as FailureDeterministicClassifier);
  });

  describe('handleClassifyFailure', () => {
    it('rejects untrusted sender frame', async () => {
      const res = await handleClassifyFailure(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects invalid payload without required projectId', async () => {
      const res = await handleClassifyFailure(trustedEvent, {
        failureCaseId: testFailureCaseId,
      });

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'VALIDATION_ERROR');
      }
    });

    it('processes valid classification request and returns DesktopResult with DTO', async () => {
      const res = await handleClassifyFailure(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.category, 'APPLICATION_FAILURE');
        assert.strictEqual(res.data.primaryRuleId, 'APP_ASSERTION_MISMATCH_001');
      }
    });
  });

  describe('handleGetFailureClassification', () => {
    it('rejects untrusted sender frame', async () => {
      const res = await handleGetFailureClassification(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('returns classification for trusted request', async () => {
      const res = await handleGetFailureClassification(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.ok(res.data);
        assert.strictEqual(res.data?.category, 'APPLICATION_FAILURE');
      }
    });
  });

  describe('handleReclassifyFailure', () => {
    it('rejects untrusted sender', async () => {
      const res = await handleReclassifyFailure(untrustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reclassificationReason: 'Reason',
      });

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects reclassification without mandatory reason', async () => {
      const res = await handleReclassifyFailure(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reclassificationReason: '', // empty reason
      });

      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, 'VALIDATION_ERROR');
      }
    });

    it('processes valid reclassification', async () => {
      const res = await handleReclassifyFailure(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reclassificationReason: 'Environment stabilized after DNS fix',
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.reclassificationReason, 'Environment stabilized after DNS fix');
      }
    });
  });

  describe('handleListFailureClassificationHistory', () => {
    it('returns classification history revisions', async () => {
      const res = await handleListFailureClassificationHistory(trustedEvent, {
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
      });

      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.data.length, 1);
      }
    });
  });
});
