/**
 * @file apps/desktop/src/main/ipc/website-target-handlers.test.ts
 * Privileged IPC Handler Security and Validation Tests for Website Targets.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleCreateWebsiteTarget,
  handleGetWebsiteTarget,
  handleListWebsiteTargets,
  handleUpdateWebsiteTarget,
  handleDeleteWebsiteTarget,
  handleSetActiveWebsiteTarget,
  handleTestWebsiteTargetConnection,
  handleConfirmWebsiteTargetAuth,
  handleResolveWebsiteTargetSnapshot,
  setWebsiteTargetServiceForTest,
} from './website-target-handlers.js';
import {
  WebsiteTargetNotFoundError,
  TargetAccessDeniedError,
  ProductionSafeModeViolationError,
  UnsafeUrlTargetError,
} from '@ai-quality/core';
import type { WebsiteTargetService } from '@ai-quality/core';
import type {
  WebsiteTargetDetails,
  WebsiteTargetSnapshot,
  ConnectivityCheckResultDto,
} from '@ai-quality/contracts';
import type { IpcMainInvokeEvent } from 'electron';

describe('Website Target IPC Handlers & Security Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testTargetId = '22222222-2222-2222-2222-222222222222';

  const mockTargetDetails: WebsiteTargetDetails = {
    id: testTargetId,
    projectId: testProjectId,
    name: 'Staging Portal',
    baseUrl: 'https://staging.example.com',
    canonicalUrl: 'https://staging.example.com',
    environmentType: 'STAGING',
    authorizationState: 'USER_CONFIRMED',
    authorizationConfirmedAt: dummyDateStr,
    authorizationConfirmedBy: 'user-1',
    safeModeEnabled: true,
    requiresAuth: false,
    isActive: true,
    connectionStatus: 'VERIFIED_REACHABLE',
    lastCheckedAt: dummyDateStr,
    lastReachableAt: dummyDateStr,
    lastFailureReason: null,
    lastStatusCode: 200,
    lastResponseTimeMs: 45,
    resolvedFinalUrl: 'https://staging.example.com',
    redirectCount: 0,
    tlsValid: true,
    notes: 'Test staging target',
    environmentId: 'env-1',
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockSnapshot: WebsiteTargetSnapshot = {
    websiteTargetId: testTargetId,
    projectId: testProjectId,
    name: 'Staging Portal',
    baseUrl: 'https://staging.example.com',
    canonicalUrl: 'https://staging.example.com',
    environmentType: 'STAGING',
    resolvedFinalUrl: 'https://staging.example.com',
    protocol: 'https:',
    hostname: 'staging.example.com',
    port: 443,
    connectionStatus: 'VERIFIED_REACHABLE',
    tlsValid: true,
    timestamp: dummyDateStr,
    authorizationState: 'USER_CONFIRMED',
    safeModeEnabled: true,
    requiresAuth: false,
    environmentId: 'env-1',
  };

  const mockConnectivityResult: ConnectivityCheckResultDto = {
    status: 'VERIFIED_REACHABLE',
    statusCode: 200,
    statusText: 'OK',
    requestedUrl: 'https://staging.example.com',
    resolvedFinalUrl: 'https://staging.example.com',
    responseTimeMs: 35,
    redirectCount: 0,
    tlsValid: true,
    message: 'Reachable and verified',
    checkedAt: dummyDateStr,
    dnsResolved: true,
  };

  const mockService = {
    createWebsiteTarget: async () => mockTargetDetails,
    getWebsiteTarget: async () => mockTargetDetails,
    listWebsiteTargets: async () => [mockTargetDetails],
    updateWebsiteTarget: async () => mockTargetDetails,
    deleteWebsiteTarget: async () => ({ deleted: true as const }),
    setActiveWebsiteTarget: async () => mockTargetDetails,
    testConnection: async () => mockConnectivityResult,
    confirmAuthorization: async () => mockTargetDetails,
    resolveSnapshot: async () => mockSnapshot,
  } as unknown as WebsiteTargetService;

  setWebsiteTargetServiceForTest(mockService);

  const untrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'https://malicious.evil.com/phishing',
    },
  } as unknown as IpcMainInvokeEvent;

  describe('Untrusted Frame Sender Rejection', () => {
    it('should reject untrusted sender frame for createWebsiteTarget', async () => {
      await assert.rejects(
        async () => {
          await handleCreateWebsiteTarget(untrustedEvent, {
            projectId: testProjectId,
            name: 'Malicious Target',
            url: 'https://evil.com',
            environmentType: 'DEVELOPMENT',
          });
        },
        (err: Error) => err.message.includes('untrusted sender frame'),
      );
    });

    it('should reject untrusted sender frame for testWebsiteTargetConnection', async () => {
      await assert.rejects(
        async () => {
          await handleTestWebsiteTargetConnection(untrustedEvent, {
            projectId: testProjectId,
            url: 'http://localhost:3000',
            environmentType: 'LOCAL',
          });
        },
        (err: Error) => err.message.includes('untrusted sender frame'),
      );
    });
  });

  describe('Zod Schema Validation in Website Target Handlers', () => {
    it('should reject empty URL in createWebsiteTarget', async () => {
      await assert.rejects(
        async () => {
          await handleCreateWebsiteTarget(undefined, {
            projectId: testProjectId,
            name: 'Invalid URL Target',
            url: '',
            environmentType: 'DEVELOPMENT',
          });
        },
        (err: Error) => err.name === 'TargetValidationError',
      );
    });

    it('should reject invalid environmentType in createWebsiteTarget', async () => {
      await assert.rejects(
        async () => {
          await handleCreateWebsiteTarget(undefined, {
            projectId: testProjectId,
            name: 'Invalid Env Target',
            url: 'https://example.com',
            environmentType: 'INVALID_ENV' as any,
          });
        },
        (err: Error) => err.name === 'TargetValidationError' || err.message.includes('Environment'),
      );
    });

    it('should reject missing targetId in getWebsiteTarget', async () => {
      await assert.rejects(
        async () => {
          await handleGetWebsiteTarget(undefined, {
            projectId: testProjectId,
            targetId: '',
          });
        },
        (err: Error) => err.name === 'TargetValidationError',
      );
    });
  });

  describe('Domain Error Handling & Service Delegation', () => {
    it('should successfully delegate createWebsiteTarget and return target details', async () => {
      const result = await handleCreateWebsiteTarget(undefined, {
        projectId: testProjectId,
        name: 'Staging Portal',
        url: 'https://staging.example.com',
        environmentType: 'STAGING',
      });

      assert.strictEqual(result.id, testTargetId);
      assert.strictEqual(result.name, 'Staging Portal');
      assert.strictEqual(result.environmentType, 'STAGING');
    });

    it('should successfully delegate testWebsiteTargetConnection and return connectivity result', async () => {
      const result = await handleTestWebsiteTargetConnection(undefined, {
        projectId: testProjectId,
        targetId: testTargetId,
      });

      assert.strictEqual(result.status, 'VERIFIED_REACHABLE');
      assert.strictEqual(result.statusCode, 200);
    });

    it('should successfully delegate resolveSnapshot and return frozen snapshot', async () => {
      const snapshot = await handleResolveWebsiteTargetSnapshot(undefined, {
        projectId: testProjectId,
        targetId: testTargetId,
      });

      assert.strictEqual(snapshot.websiteTargetId, testTargetId);
      assert.strictEqual(snapshot.hostname, 'staging.example.com');
    });

    it('should pass through domain errors like WebsiteTargetNotFoundError', async () => {
      setWebsiteTargetServiceForTest({
        getWebsiteTarget: async () => {
          throw new WebsiteTargetNotFoundError('Target was not found in project');
        },
      } as unknown as WebsiteTargetService);

      await assert.rejects(
        async () => {
          await handleGetWebsiteTarget(undefined, {
            projectId: testProjectId,
            targetId: testTargetId,
          });
        },
        WebsiteTargetNotFoundError,
      );

      // Restore mock service
      setWebsiteTargetServiceForTest(mockService);
    });

    it('should pass through domain errors like ProductionSafeModeViolationError', async () => {
      setWebsiteTargetServiceForTest({
        updateWebsiteTarget: async () => {
          throw new ProductionSafeModeViolationError('Operation blocked by Production Safe Mode');
        },
      } as unknown as WebsiteTargetService);

      await assert.rejects(
        async () => {
          await handleUpdateWebsiteTarget(undefined, {
            projectId: testProjectId,
            targetId: testTargetId,
            safeModeEnabled: false,
          });
        },
        ProductionSafeModeViolationError,
      );

      // Restore mock service
      setWebsiteTargetServiceForTest(mockService);
    });
  });
});
