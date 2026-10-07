/**
 * @file apps/desktop/src/main/ipc/jira-phase94-handlers.test.ts
 * Main process IPC handler tests for Engineer Assignment & Defect Ownership Workflow (V7 Phase 94).
 * Verifies untrusted sender validation, schema validation, successful execution, and domain error sanitization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleRegisterProjectEngineer,
  handleListEligibleEngineers,
  handleGetDefectOwnership,
  handleAssignEngineer,
  handleUnassignEngineer,
  handleSyncOwnershipFromJira,
  handleRetryJiraSync,
  setSharedJiraDefectOwnershipService,
} from './jira-handlers.js';
import type { IJiraDefectOwnershipService } from '@ai-quality/core';
import {
  JiraEngineerIneligibleError,
  JiraEngineerNotFoundError,
  JiraStaleOwnershipVersionError,
  JiraOwnershipNotFoundError,
  JiraCrossProjectError,
} from '@ai-quality/core';
import type { ProjectEngineerDto, DefectOwnershipDto } from '@ai-quality/contracts';

describe('Jira Defect Ownership IPC Handlers (Phase 94)', () => {
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
  const validEngineerId = '44444444-4444-4444-4444-444444444444';
  const validOwnershipId = '55555555-5555-5555-5555-555555555555';

  const mockEngineerDto: ProjectEngineerDto = {
    id: validEngineerId,
    projectId: validProjectId,
    userId: 'eng-alice',
    displayName: 'Alice Engineer',
    email: 'alice@company.com',
    jiraAccountId: 'jira-alice-123',
    jiraUsername: null,
    isActive: true,
    routingTags: ['frontend', 'auth'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockOwnershipDto: DefectOwnershipDto = {
    id: validOwnershipId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    bugReportId: validBugReportId,
    jiraIssueLinkId: null,
    assignedEngineerId: validEngineerId,
    assignmentSource: 'MANUAL',
    assignmentReason: 'Alice is lead engineer for auth',
    ruleId: null,
    jiraAssigneeSyncStatus: 'SYNCHRONIZED',
    lastJiraSyncError: null,
    lastJiraSyncAt: new Date().toISOString(),
    ownershipVersion: 1,
    assignedByUserId: 'manager-1',
    assignedAt: new Date().toISOString(),
    assignedEngineer: mockEngineerDto,
    jiraIssueKey: 'ENG-101',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [
      {
        id: 'hist-1',
        ownershipId: validOwnershipId,
        projectId: validProjectId,
        bugReportId: validBugReportId,
        action: 'ASSIGNED',
        previousEngineerId: null,
        newEngineerId: validEngineerId,
        assignmentSource: 'MANUAL',
        assignmentReason: 'Alice is lead engineer for auth',
        ruleId: null,
        jiraAssigneeSyncStatus: 'SYNCHRONIZED',
        syncErrorMessage: null,
        ownershipVersion: 1,
        actorUserId: 'manager-1',
        createdAt: new Date().toISOString(),
      },
    ],
  };

  let mockOwnershipService: IJiraDefectOwnershipService;

  beforeEach(() => {
    mockOwnershipService = {
      async registerProjectEngineer() {
        return mockEngineerDto;
      },
      async listEligibleEngineers() {
        return [mockEngineerDto];
      },
      async getDefectOwnership() {
        return mockOwnershipDto;
      },
      async assignEngineer() {
        return mockOwnershipDto;
      },
      async unassignEngineer() {
        return {
          ...mockOwnershipDto,
          assignedEngineerId: null,
          assignedEngineer: null,
          ownershipVersion: 2,
        };
      },
      async syncOwnershipFromJira() {
        return mockOwnershipDto;
      },
      async retryJiraSync() {
        return mockOwnershipDto;
      },
    };
    setSharedJiraDefectOwnershipService(mockOwnershipService);
  });

  // ==========================================================================
  // Untrusted Origin Validation
  // ==========================================================================
  describe('Untrusted IPC Origin Rejection', () => {
    it('rejects handleRegisterProjectEngineer from untrusted frame', async () => {
      const result = await handleRegisterProjectEngineer(fakeUntrustedEvent, {
        projectId: validProjectId,
        userId: 'alice',
        displayName: 'Alice',
        email: 'alice@test.com',
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects handleListEligibleEngineers from untrusted frame', async () => {
      const result = await handleListEligibleEngineers(fakeUntrustedEvent, {
        projectId: validProjectId,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects handleGetDefectOwnership from untrusted frame', async () => {
      const result = await handleGetDefectOwnership(fakeUntrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects handleAssignEngineer from untrusted frame', async () => {
      const result = await handleAssignEngineer(fakeUntrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
        engineerId: validEngineerId,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects handleUnassignEngineer from untrusted frame', async () => {
      const result = await handleUnassignEngineer(fakeUntrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects handleSyncOwnershipFromJira from untrusted frame', async () => {
      const result = await handleSyncOwnershipFromJira(fakeUntrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects handleRetryJiraSync from untrusted frame', async () => {
      const result = await handleRetryJiraSync(fakeUntrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    });
  });

  // ==========================================================================
  // Schema Validation
  // ==========================================================================
  describe('Schema Validation', () => {
    it('rejects handleRegisterProjectEngineer with invalid email format', async () => {
      const result = await handleRegisterProjectEngineer(fakeTrustedEvent, {
        projectId: validProjectId,
        userId: 'alice',
        displayName: 'Alice',
        email: 'invalid-email-address',
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    });

    it('rejects handleAssignEngineer with non-UUID engineerId', async () => {
      const result = await handleAssignEngineer(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
        engineerId: 'not-a-uuid',
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    });

    it('rejects handleGetDefectOwnership with missing bugReportId', async () => {
      const result = await handleGetDefectOwnership(fakeTrustedEvent, {
        projectId: validProjectId,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // Successful Execution
  // ==========================================================================
  describe('Successful Execution', () => {
    it('successfully registers an engineer', async () => {
      const result = await handleRegisterProjectEngineer(fakeTrustedEvent, {
        projectId: validProjectId,
        userId: 'eng-alice',
        displayName: 'Alice Engineer',
        email: 'alice@company.com',
        jiraAccountId: 'jira-alice-123',
        routingTags: ['frontend', 'auth'],
      });
      assert.equal(result.ok, true);
      assert.deepEqual(result.data, mockEngineerDto);
    });

    it('successfully lists eligible engineers', async () => {
      const result = await handleListEligibleEngineers(fakeTrustedEvent, {
        projectId: validProjectId,
        activeOnly: true,
      });
      assert.equal(result.ok, true);
      assert.deepEqual(result.data, [mockEngineerDto]);
    });

    it('successfully retrieves defect ownership', async () => {
      const result = await handleGetDefectOwnership(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
      });
      assert.equal(result.ok, true);
      assert.deepEqual(result.data, mockOwnershipDto);
    });

    it('successfully assigns an engineer', async () => {
      const result = await handleAssignEngineer(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
        engineerId: validEngineerId,
        assignmentReason: 'Alice is lead engineer for auth',
      });
      assert.equal(result.ok, true);
      assert.deepEqual(result.data, mockOwnershipDto);
    });

    it('successfully unassigns an engineer', async () => {
      const result = await handleUnassignEngineer(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
      });
      assert.equal(result.ok, true);
      assert.equal(result.data?.assignedEngineerId, null);
    });

    it('successfully syncs ownership from Jira', async () => {
      const result = await handleSyncOwnershipFromJira(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
      });
      assert.equal(result.ok, true);
      assert.deepEqual(result.data, mockOwnershipDto);
    });

    it('successfully retries Jira sync', async () => {
      const result = await handleRetryJiraSync(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
      });
      assert.equal(result.ok, true);
      assert.deepEqual(result.data, mockOwnershipDto);
    });
  });

  // ==========================================================================
  // Domain Error Sanitization
  // ==========================================================================
  describe('Domain Error Sanitization', () => {
    it('sanitizes JiraEngineerIneligibleError to JIRA_ENGINEER_INELIGIBLE', async () => {
      mockOwnershipService.assignEngineer = async () => {
        throw new JiraEngineerIneligibleError('Engineer is currently inactive.');
      };

      const result = await handleAssignEngineer(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
        engineerId: validEngineerId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'JIRA_ENGINEER_INELIGIBLE');
    });

    it('sanitizes JiraStaleOwnershipVersionError to JIRA_STALE_OWNERSHIP_VERSION', async () => {
      mockOwnershipService.assignEngineer = async () => {
        throw new JiraStaleOwnershipVersionError(1, 2);
      };

      const result = await handleAssignEngineer(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
        engineerId: validEngineerId,
        expectedVersion: 1,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'JIRA_STALE_OWNERSHIP_VERSION');
    });

    it('sanitizes JiraEngineerNotFoundError to JIRA_ENGINEER_NOT_FOUND', async () => {
      mockOwnershipService.assignEngineer = async () => {
        throw new JiraEngineerNotFoundError(validEngineerId);
      };

      const result = await handleAssignEngineer(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
        engineerId: validEngineerId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'JIRA_ENGINEER_NOT_FOUND');
    });

    it('sanitizes JiraCrossProjectError to JIRA_CROSS_PROJECT', async () => {
      mockOwnershipService.getDefectOwnership = async () => {
        throw new JiraCrossProjectError(validBugReportId, validProjectId);
      };

      const result = await handleGetDefectOwnership(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'JIRA_CROSS_PROJECT');
    });

    it('sanitizes JiraOwnershipNotFoundError to JIRA_OWNERSHIP_NOT_FOUND', async () => {
      mockOwnershipService.unassignEngineer = async () => {
        throw new JiraOwnershipNotFoundError(validBugReportId);
      };

      const result = await handleUnassignEngineer(fakeTrustedEvent, {
        projectId: validProjectId,
        bugReportId: validBugReportId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'JIRA_OWNERSHIP_NOT_FOUND');
    });
  });
});
