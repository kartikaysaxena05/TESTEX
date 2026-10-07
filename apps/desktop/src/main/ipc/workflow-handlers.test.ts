/**
 * @file apps/desktop/src/main/ipc/workflow-handlers.test.ts
 * Main process IPC handler tests for Bug Status & External Workflow Synchronization (V7 Phase 96).
 * Verifies untrusted sender validation, schema validation, successful execution, and domain error sanitization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetWorkflowState,
  handleUpdateInternalStatus,
  handleGetWorkflowStatusMappings,
  handleSaveWorkflowStatusMapping,
  handleDeleteWorkflowStatusMapping,
  handleSyncWorkflowNow,
  handleResolveWorkflowConflict,
  handleListWorkflowSyncEvents,
  setWorkflowSyncService,
} from './workflow-handlers.js';
import {
  WorkflowStateNotFoundError,
  InvalidWorkflowTransitionError,
  WorkflowCrossProjectForbiddenError,
  WorkflowMappingNotFoundError,
} from '@ai-quality/core';
import type {
  BugWorkflowStateDto,
  WorkflowStatusMappingDto,
  WorkflowSyncEventDto,
} from '@ai-quality/contracts';

describe('Workflow IPC Handlers (Phase 96)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any,
      url: 'https://attacker.site/malicious.html',
    } as any,
  } as IpcMainInvokeEvent;

  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validFailureCaseId = '22222222-2222-2222-2222-222222222222';
  const validBugReportId = '33333333-3333-3333-3333-333333333333';
  const validMappingId = '44444444-4444-4444-4444-444444444444';

  const mockStateDto: BugWorkflowStateDto = {
    id: 'state-1',
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    bugReportId: validBugReportId,
    currentStatus: 'OPEN',
    verificationStatus: 'NOT_VERIFIED',
    statusReason: null,
    resolvedAt: null,
    resolutionReason: null,
    reopenedAt: null,
    reopenReason: null,
    closedAt: null,
    lastChangedBy: 'SYSTEM',
    workflowVersion: 1,
    lastExternalStatus: 'To Do',
    lastExternalStatusId: '1',
    lastSyncedInternalStatus: 'OPEN',
    lastSyncedExternalStatus: 'To Do',
    lastSyncedAt: new Date().toISOString(),
    lastExternalUpdatedAt: null,
    syncVersion: 0,
    lastSyncResult: 'SYNCED',
    lastSyncError: null,
    conflictState: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockMappingDto: WorkflowStatusMappingDto = {
    id: validMappingId,
    projectId: validProjectId,
    connectionId: null,
    externalSystem: 'JIRA',
    externalStatusId: '10',
    externalStatusName: 'Done',
    internalStatus: 'RESOLVED',
    direction: 'BIDIRECTIONAL',
    conflictPolicy: 'MANUAL_REVIEW',
    isEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockSyncEventDto: WorkflowSyncEventDto = {
    id: 'evt-1',
    projectId: validProjectId,
    workflowStateId: 'state-1',
    failureCaseId: validFailureCaseId,
    bugReportId: validBugReportId,
    connectionId: 'conn-1',
    externalIssueId: '10050',
    externalIssueKey: 'TEST-100',
    direction: 'INTERNAL_TO_EXTERNAL',
    sourceStatus: 'RESOLVED',
    targetStatus: 'Done',
    mappedStatus: 'Done',
    syncResult: 'SYNCED',
    conflictDetails: null,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    externalUpdatedAt: null,
    internalUpdatedAt: null,
    errorCode: null,
    errorMessage: null,
    retryCount: 0,
    actor: 'SYSTEM',
    createdAt: new Date().toISOString(),
  };

  let mockService: any;

  beforeEach(() => {
    mockService = {
      getState: async () => mockStateDto,
      updateInternalStatus: async () => ({
        ...mockStateDto,
        currentStatus: 'IN_PROGRESS',
        workflowVersion: 2,
      }),
      getStatusMappings: async () => [mockMappingDto],
      saveStatusMapping: async () => mockMappingDto,
      deleteStatusMapping: async () => ({ deleted: true }),
      syncNow: async () => ({ ...mockStateDto, lastSyncResult: 'SYNCED' }),
      resolveConflict: async () => ({ ...mockStateDto, conflictState: null }),
      listSyncEvents: async () => ({
        items: [mockSyncEventDto],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      }),
    };

    setWorkflowSyncService(mockService);
  });

  describe('Security: Untrusted sender validation', () => {
    it('rejects untrusted sender for handleGetWorkflowState', async () => {
      const result = await handleGetWorkflowState(fakeUntrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender for handleUpdateInternalStatus', async () => {
      const result = await handleUpdateInternalStatus(fakeUntrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        targetStatus: 'IN_PROGRESS',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender for handleGetWorkflowStatusMappings', async () => {
      const result = await handleGetWorkflowStatusMappings(fakeUntrustedEvent, {
        projectId: validProjectId,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender for handleSaveWorkflowStatusMapping', async () => {
      const result = await handleSaveWorkflowStatusMapping(fakeUntrustedEvent, {
        projectId: validProjectId,
        externalStatusName: 'Done',
        internalStatus: 'RESOLVED',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender for handleDeleteWorkflowStatusMapping', async () => {
      const result = await handleDeleteWorkflowStatusMapping(fakeUntrustedEvent, {
        projectId: validProjectId,
        mappingId: validMappingId,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender for handleSyncWorkflowNow', async () => {
      const result = await handleSyncWorkflowNow(fakeUntrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender for handleResolveWorkflowConflict', async () => {
      const result = await handleResolveWorkflowConflict(fakeUntrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        chosenWinner: 'INTERNAL',
        resolutionNote: 'Note',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender for handleListWorkflowSyncEvents', async () => {
      const result = await handleListWorkflowSyncEvents(fakeUntrustedEvent, {
        projectId: validProjectId,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'UNAUTHORIZED_SENDER');
    });
  });

  describe('Validation: Invalid input rejection', () => {
    it('rejects invalid UUID in handleGetWorkflowState', async () => {
      const result = await handleGetWorkflowState(fakeTrustedEvent, {
        projectId: 'invalid-uuid',
        failureCaseId: validFailureCaseId,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
    });

    it('rejects invalid targetStatus in handleUpdateInternalStatus', async () => {
      const result = await handleUpdateInternalStatus(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        targetStatus: 'NON_EXISTENT_STATUS',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
    });

    it('rejects empty externalStatusName in handleSaveWorkflowStatusMapping', async () => {
      const result = await handleSaveWorkflowStatusMapping(fakeTrustedEvent, {
        projectId: validProjectId,
        externalStatusName: '',
        internalStatus: 'RESOLVED',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
    });

    it('rejects invalid chosenWinner in handleResolveWorkflowConflict', async () => {
      const result = await handleResolveWorkflowConflict(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        chosenWinner: 'INVALID_CHOICE',
        resolutionNote: 'Some note',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'VALIDATION_ERROR');
    });
  });

  describe('Execution & Domain Error Sanitization', () => {
    it('successfully executes handleGetWorkflowState', async () => {
      const result = await handleGetWorkflowState(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.currentStatus, 'OPEN');
      assert.strictEqual(result.data?.verificationStatus, 'NOT_VERIFIED');
    });

    it('successfully executes handleUpdateInternalStatus', async () => {
      const result = await handleUpdateInternalStatus(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        targetStatus: 'IN_PROGRESS',
        reason: 'Work started',
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.currentStatus, 'IN_PROGRESS');
    });

    it('sanitizes InvalidWorkflowTransitionError', async () => {
      mockService.updateInternalStatus = async () => {
        throw new InvalidWorkflowTransitionError('CLOSED', 'IN_PROGRESS', 'Must reopen first');
      };

      const result = await handleUpdateInternalStatus(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        targetStatus: 'IN_PROGRESS',
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'WORKFLOW_INVALID_TRANSITION');
      assert.match(result.error?.message ?? '', /Must reopen first/);
    });

    it('sanitizes WorkflowCrossProjectForbiddenError', async () => {
      mockService.getState = async () => {
        throw new WorkflowCrossProjectForbiddenError('Access forbidden');
      };

      const result = await handleGetWorkflowState(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'WORKFLOW_CROSS_PROJECT_FORBIDDEN');
    });

    it('sanitizes WorkflowMappingNotFoundError', async () => {
      mockService.deleteStatusMapping = async () => {
        throw new WorkflowMappingNotFoundError(validMappingId);
      };

      const result = await handleDeleteWorkflowStatusMapping(fakeTrustedEvent, {
        projectId: validProjectId,
        mappingId: validMappingId,
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error?.code, 'WORKFLOW_MAPPING_NOT_FOUND');
    });

    it('successfully executes handleSyncWorkflowNow', async () => {
      const result = await handleSyncWorkflowNow(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.lastSyncResult, 'SYNCED');
    });

    it('successfully executes handleResolveWorkflowConflict', async () => {
      const result = await handleResolveWorkflowConflict(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        chosenWinner: 'INTERNAL',
        resolutionNote: 'Internal decision upheld',
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.conflictState, null);
    });

    it('successfully executes handleListWorkflowSyncEvents', async () => {
      const result = await handleListWorkflowSyncEvents(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.data?.total, 1);
      assert.strictEqual(result.data?.items[0]?.externalIssueKey, 'TEST-100');
    });
  });
});
