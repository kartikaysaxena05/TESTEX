/**
 * @file apps/desktop/src/main/ipc/jira-phase93-handlers.test.ts
 * Main process IPC handler tests for Jira Duplicate Prevention & Existing-Issue Linking (V7 Phase 93).
 * Verifies untrusted sender validation, schema validation, successful execution, and domain error sanitization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleEvaluateDuplicate,
  handleLinkExistingIssue,
  handleGetIssueLink,
  setSharedJiraDuplicatePreventionService,
} from './jira-handlers.js';
import type { IJiraDuplicatePreventionService } from '@ai-quality/core';
import { JiraCrossProjectError, JiraDeduplicationConflictError } from '@ai-quality/core';
import type { JiraDuplicateEvaluationDto, JiraIssueLinkDto } from '@ai-quality/contracts';

describe('Jira Duplicate Prevention IPC Handlers (Phase 93)', () => {
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
  const validLinkId = '44444444-4444-4444-4444-444444444444';

  const mockEvaluationDto: JiraDuplicateEvaluationDto = {
    decision: 'USE_EXISTING',
    ruleId: 'JIRA_RULE_1_EXACT_BUG_REPORT',
    reason: 'Exact bug report is already linked to Jira issue ENG-101.',
    jiraIssueKey: 'ENG-101',
    jiraIssueId: '10001',
    jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-101',
    candidateCount: 1,
    evaluatedAt: new Date().toISOString(),
  };

  const mockLinkDto: JiraIssueLinkDto = {
    id: validLinkId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    bugReportId: validBugReportId,
    defectClusterId: null,
    externalIssueId: null,
    jiraConnectionId: '55555555-5555-5555-5555-555555555555',
    jiraProjectKey: 'ENG',
    jiraIssueId: '10001',
    jiraIssueKey: 'ENG-101',
    jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-101',
    linkReason: 'User linked to existing issue',
    linkSource: 'USER_CONFIRMED_LINK',
    ruleId: null,
    decision: 'USE_EXISTING',
    isActive: true,
    invalidationReason: null,
    supersededById: null,
    metadataSnapshot: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockPreventionService: IJiraDuplicatePreventionService;

  beforeEach(() => {
    mockPreventionService = {
      async evaluateBeforeCreate() {
        return mockEvaluationDto;
      },
      async linkExistingIssue() {
        return mockLinkDto;
      },
      async getIssueLink() {
        return mockLinkDto;
      },
      async invalidateLink() {
        return {
          ...mockLinkDto,
          isActive: false,
          invalidationReason: 'Manually unlinked',
        };
      },
    };
    setSharedJiraDuplicatePreventionService(mockPreventionService);
  });

  // ==========================================================================
  // Untrusted IPC Origin Rejection
  // ==========================================================================
  describe('Untrusted IPC Origin Rejection', () => {
    it('rejects handleEvaluateDuplicate from untrusted sender frame', async () => {
      const result = await handleEvaluateDuplicate(fakeUntrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects handleLinkExistingIssue from untrusted sender frame', async () => {
      const result = await handleLinkExistingIssue(fakeUntrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        jiraIssueKey: 'ENG-101',
        linkReason: 'Manual link',
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects handleGetIssueLink from untrusted sender frame', async () => {
      const result = await handleGetIssueLink(fakeUntrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    });
  });

  // ==========================================================================
  // Input Schema Validation
  // ==========================================================================
  describe('Input Schema Validation', () => {
    it('rejects handleEvaluateDuplicate when invalid UUID is provided', async () => {
      const result = await handleEvaluateDuplicate(fakeTrustedEvent, {
        projectId: 'not-a-uuid',
        failureCaseId: validFailureCaseId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    });

    it('rejects handleLinkExistingIssue when linkReason is empty or missing', async () => {
      const result = await handleLinkExistingIssue(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        jiraIssueKey: 'ENG-101',
        linkReason: '',
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    });

    it('rejects handleGetIssueLink when failureCaseId is missing', async () => {
      const result = await handleGetIssueLink(fakeTrustedEvent, {
        projectId: validProjectId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // Successful Handler Invocation
  // ==========================================================================
  describe('Successful Handler Invocation', () => {
    it('returns evaluation result on handleEvaluateDuplicate', async () => {
      const result = await handleEvaluateDuplicate(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        bugReportId: validBugReportId,
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.data, mockEvaluationDto);
    });

    it('returns created link on handleLinkExistingIssue', async () => {
      const result = await handleLinkExistingIssue(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        bugReportId: validBugReportId,
        jiraIssueKey: 'ENG-101',
        linkReason: 'User confirmed linking',
        linkSource: 'USER_CONFIRMED_LINK',
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.data, mockLinkDto);
    });

    it('returns active link on handleGetIssueLink', async () => {
      const result = await handleGetIssueLink(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.data, mockLinkDto);
    });

    it('returns null on handleGetIssueLink when no link exists', async () => {
      mockPreventionService.getIssueLink = async () => null;

      const result = await handleGetIssueLink(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });

      assert.equal(result.ok, true);
      assert.equal(result.data, null);
    });
  });

  // ==========================================================================
  // Domain Error Sanitization
  // ==========================================================================
  describe('Domain Error Sanitization', () => {
    it('sanitizes JiraCrossProjectError on handleEvaluateDuplicate', async () => {
      mockPreventionService.evaluateBeforeCreate = async () => {
        throw new JiraCrossProjectError(validFailureCaseId, validProjectId);
      };

      const result = await handleEvaluateDuplicate(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'JIRA_CROSS_PROJECT');
    });

    it('sanitizes JiraDeduplicationConflictError on handleLinkExistingIssue', async () => {
      mockPreventionService.linkExistingIssue = async () => {
        throw new JiraDeduplicationConflictError(
          'Merged defect cluster contains multiple conflicting Jira issues (ENG-1, ENG-2).',
        );
      };

      const result = await handleLinkExistingIssue(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
        jiraIssueKey: 'ENG-101',
        linkReason: 'Conflict test',
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'JIRA_DEDUPLICATION_CONFLICT');
    });
  });
});
