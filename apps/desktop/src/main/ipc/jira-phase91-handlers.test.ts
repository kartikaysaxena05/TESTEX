/**
 * @file apps/desktop/src/main/ipc/jira-phase91-handlers.test.ts
 * Main process IPC handler tests for automated Jira issue creation and retrieval (V7 Phase 91).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCreateJiraIssue,
  handleGetJiraIssue,
  setSharedJiraIssueCreationService,
} from './jira-handlers.js';
import type { JiraIssueCreationService } from '@ai-quality/core';
import { JiraIssueIneligibleError, JiraBugReportNotFoundError } from '@ai-quality/core';

describe('Jira Issue Creation IPC Handlers (Phase 91)', () => {
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

  const mockExternalIssue = {
    id: '11111111-2222-3333-4444-555555555555',
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    bugReportId: validBugReportId,
    connectionId: '66666666-7777-8888-9999-000000000000',
    jiraProjectId: '10000',
    jiraProjectKey: 'ENG',
    jiraIssueId: '10001',
    jiraIssueKey: 'ENG-101',
    jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-101',
    issueType: 'Bug',
    summary: 'Checkout failure defect',
    priority: 'High',
    creationStatus: 'CREATED' as const,
    requestFingerprint: 'mock-sha256-fingerprint',
    metadataSnapshot: null,
    createdBy: 'USER',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockService: Partial<JiraIssueCreationService>;

  beforeEach(() => {
    mockService = {
      async createIssue(input) {
        if (input.bugReportId === '00000000-0000-0000-0000-000000000000') {
          throw new JiraBugReportNotFoundError(input.bugReportId);
        }
        if (input.bugReportId === '99999999-9999-9999-9999-999999999999') {
          throw new JiraIssueIneligibleError('AUTOMATION_FAILURE is not eligible');
        }
        return mockExternalIssue;
      },
      async getIssue(input) {
        if (input.failureCaseId === validFailureCaseId) {
          return mockExternalIssue;
        }
        return null;
      },
    };

    setSharedJiraIssueCreationService(mockService as JiraIssueCreationService);
  });

  describe('handleCreateJiraIssue', () => {
    it('rejects untrusted sender frame with UNAUTHORIZED_SENDER', async () => {
      const res = await handleCreateJiraIssue(fakeUntrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        bugReportId: validBugReportId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects invalid payload violating UUID format with VALIDATION_ERROR', async () => {
      const res = await handleCreateJiraIssue(fakeTrustedEvent, {
        projectId: 'not-a-uuid',
        failureCaseId: validFailureCaseId,
        bugReportId: validBugReportId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'VALIDATION_ERROR');
      }
    });

    it('successfully creates issue and returns JiraExternalIssueDto', async () => {
      const res = await handleCreateJiraIssue(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        bugReportId: validBugReportId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.deepEqual(res.data, mockExternalIssue);
      }
    });

    it('returns typed domain error code when bug report is not found', async () => {
      const res = await handleCreateJiraIssue(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        bugReportId: '00000000-0000-0000-0000-000000000000',
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'JIRA_BUG_REPORT_NOT_FOUND');
      }
    });

    it('returns JIRA_ISSUE_INELIGIBLE when defect state is ineligible', async () => {
      const res = await handleCreateJiraIssue(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        bugReportId: '99999999-9999-9999-9999-999999999999',
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'JIRA_ISSUE_INELIGIBLE');
        assert.ok(res.error.message.includes('AUTOMATION_FAILURE'));
      }
    });
  });

  describe('handleGetJiraIssue', () => {
    it('rejects untrusted sender frame with UNAUTHORIZED_SENDER', async () => {
      const res = await handleGetJiraIssue(fakeUntrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects invalid payload violating UUID format with VALIDATION_ERROR', async () => {
      const res = await handleGetJiraIssue(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: 'invalid-uuid',
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'VALIDATION_ERROR');
      }
    });

    it('returns existing issue when found', async () => {
      const res = await handleGetJiraIssue(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.deepEqual(res.data, mockExternalIssue);
      }
    });

    it('returns null when no Jira issue has been created', async () => {
      const res = await handleGetJiraIssue(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: '44444444-4444-4444-4444-444444444444',
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.data, null);
      }
    });
  });
});
