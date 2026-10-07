/**
 * @file apps/desktop/src/main/ipc/repair-patch-handlers.test.ts
 * Security, authentication, authorization, and boundary validation unit tests
 * for V10 Phase 149 Repair / Patch Tool IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleProposeRepairPatch,
  handleGetRepairPatch,
  handleApproveRepairPatch,
  handleRejectRepairPatch,
  handleCancelRepairPatch,
  handleApplyRepairPatch,
  setRepairPatchToolServiceForTest,
} from './repair-patch-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  RepairPatchToolService,
  AiCrossProjectAccessError,
  RepairPatchApprovalRequiredError,
  type AuthenticationService,
} from '@ai-quality/core';
import type { RepairPatchToolOutputDto } from '@ai-quality/contracts';
import type { IDesktopSecureStorage } from '../secure-storage/desktop-secure-storage.js';

class MockSecureStorage implements IDesktopSecureStorage {
  public token: string | null = 'mock-valid-session-token';
  public async storeSessionToken(token: string): Promise<void> {
    this.token = token;
  }
  public async retrieveSessionToken(): Promise<string | null> {
    return this.token;
  }
  public async clearSessionToken(): Promise<void> {
    this.token = null;
  }
}

describe('V10 Phase 149 Repair / Patch Tool IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';
  const testProposalId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const testFailureId = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';

  const mockPatchDto: RepairPatchToolOutputDto = {
    proposalId: testProposalId,
    projectId: testProjectId,
    taskId: 'cccccccc-1111-1111-1111-cccccccccccc',
    failureId: testFailureId,
    defectId: 'DEF-101',
    targetFiles: ['src/auth.ts'],
    primaryFilePath: 'src/auth.ts',
    primarySymbolName: 'validateToken',
    proposedChanges: 'Validate token length before returning',
    patch: '--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -1,1 +1,2 @@\n-return false;\n+return token.length > 8;\n',
    reason: 'Prevent null crash',
    status: 'WAITING_FOR_APPROVAL',
    filesChangedCount: 1,
    linesAddedCount: 1,
    linesRemovedCount: 1,
    totalChangedLinesCount: 2,
    structuredEdits: [
      {
        filePath: 'src/auth.ts',
        startLine: 1,
        endLine: 1,
        originalContent: 'return false;',
        replacementContent: 'return token.length > 8;',
      },
    ],
    isSyntacticallyValid: true,
    riskLevel: 'LOW',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockSecureStorage: MockSecureStorage;
  let mockAuthService: AuthenticationService;
  let mockService: RepairPatchToolService;

  beforeEach(() => {
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    mockAuthService = {
      validateSession: async (token: string) => {
        if (token === 'mock-valid-session-token') {
          return {
            id: 'session-id',
            userId: testUserId,
            token,
            expiresAt: new Date(Date.now() + 3600000),
            createdAt: new Date(),
          };
        }
        return null;
      },
      getUserById: async (userId: string) => {
        return {
          id: userId,
          email: 'test@example.com',
          name: 'Test Engineer',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    } as unknown as AuthenticationService;
    setAuthServiceForTest(mockAuthService);

    mockService = {
      proposePatch: async () => mockPatchDto,
      getPatch: async () => mockPatchDto,
      approvePatch: async () => ({ ...mockPatchDto, status: 'APPROVED' }),
      rejectPatch: async () => ({ ...mockPatchDto, status: 'REJECTED' }),
      cancelPatch: async () => ({ ...mockPatchDto, status: 'CANCELLED' }),
      applyPatch: async () => ({ ...mockPatchDto, status: 'APPLIED' }),
    } as unknown as RepairPatchToolService;
    setRepairPatchToolServiceForTest(mockService);
  });

  const createTrustedEvent = (): IpcMainInvokeEvent =>
    ({
      senderFrame: {
        parent: null,
        url: 'app://renderer/index.html',
      },
    } as unknown as IpcMainInvokeEvent);

  const createUntrustedEvent = (): IpcMainInvokeEvent =>
    ({
      senderFrame: {
        parent: null,
        url: 'http://malicious-website.com/index.html',
      },
    } as unknown as IpcMainInvokeEvent);

  // 1. Untrusted Sender Rejection
  it('should reject IPC calls from untrusted sender origin', async () => {
    const untrustedEvent = createUntrustedEvent();
    const result = await handleProposeRepairPatch(untrustedEvent, {
      projectId: testProjectId,
      failureId: testFailureId,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  // 2. Authentication Enforcement
  it('should reject unauthenticated request when session token is missing', async () => {
    mockSecureStorage.token = null;
    const trustedEvent = createTrustedEvent();

    const result = await handleProposeRepairPatch(trustedEvent, {
      projectId: testProjectId,
      failureId: testFailureId,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'AUTHENTICATION_FAILED');
    }
  });

  // 3. Schema Validation Rejection (Malformed UUID)
  it('should reject malformed input schema with VALIDATION_ERROR', async () => {
    const trustedEvent = createTrustedEvent();
    const result = await handleProposeRepairPatch(trustedEvent, {
      projectId: 'not-a-valid-uuid',
      failureId: 'not-a-uuid',
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    }
  });

  // 4. Successful Propose Patch Delegation
  it('should successfully propose patch and return structured output', async () => {
    const trustedEvent = createTrustedEvent();
    const result = await handleProposeRepairPatch(trustedEvent, {
      projectId: testProjectId,
      failureId: testFailureId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.proposalId, testProposalId);
      assert.equal(result.data.status, 'WAITING_FOR_APPROVAL');
    }
  });

  // 5. Successful Approve Patch Delegation
  it('should successfully approve patch proposal', async () => {
    const trustedEvent = createTrustedEvent();
    const result = await handleApproveRepairPatch(trustedEvent, {
      projectId: testProjectId,
      proposalId: testProposalId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.status, 'APPROVED');
    }
  });

  // 6. Successful Reject Patch Delegation
  it('should successfully reject patch proposal', async () => {
    const trustedEvent = createTrustedEvent();
    const result = await handleRejectRepairPatch(trustedEvent, {
      projectId: testProjectId,
      proposalId: testProposalId,
      rejectionReason: 'OTHER',
      rejectionDetails: 'Unsafe modifications detected',
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.status, 'REJECTED');
    }
  });

  // 7. Successful Cancel Patch Delegation
  it('should successfully cancel patch proposal', async () => {
    const trustedEvent = createTrustedEvent();
    const result = await handleCancelRepairPatch(trustedEvent, {
      projectId: testProjectId,
      proposalId: testProposalId,
      reason: 'Cancelled by user',
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.status, 'CANCELLED');
    }
  });

  // 8. Approval Required Enforcement on Apply
  it('should map RepairPatchApprovalRequiredError to APPROVAL_REQUIRED error code', async () => {
    (mockService as any).applyPatch = async () => {
      throw new RepairPatchApprovalRequiredError(testProposalId, 'WAITING_FOR_APPROVAL');
    };

    const trustedEvent = createTrustedEvent();
    const result = await handleApplyRepairPatch(trustedEvent, {
      projectId: testProjectId,
      proposalId: testProposalId,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'APPROVAL_REQUIRED');
    }
  });

  // 9. Cross-Project Access Rejection
  it('should map AiCrossProjectAccessError to AI_CROSS_PROJECT_ACCESS error code', async () => {
    (mockService as any).getPatch = async () => {
      throw new AiCrossProjectAccessError('Cross-project access forbidden.');
    };

    const trustedEvent = createTrustedEvent();
    const result = await handleGetRepairPatch(trustedEvent, {
      projectId: testProjectId,
      proposalId: testProposalId,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'AI_CROSS_PROJECT_ACCESS');
    }
  });
});
