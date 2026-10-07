/**
 * @file apps/desktop/src/main/ipc/jira-phase92-handlers.test.ts
 * Main process IPC handler tests for Jira Bug Evidence & Artifact Attachment (V7 Phase 92).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleListAttachableEvidence,
  handleAttachEvidence,
  handleGetAttachmentStatus,
  setSharedJiraEvidenceAttachmentService,
} from './jira-handlers.js';
import type { IJiraEvidenceAttachmentService } from '@ai-quality/core';
import { JiraCrossProjectError, JiraEvidenceNotFoundError } from '@ai-quality/core';
import type {
  JiraAttachableEvidenceItemDto,
  JiraAttachmentBatchResultDto,
  JiraEvidenceAttachmentDto,
} from '@ai-quality/contracts';

describe('Jira Evidence Attachment IPC Handlers (Phase 92)', () => {
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
  const validExternalIssueId = '33333333-3333-3333-3333-333333333333';
  const validEvidenceRefId = '44444444-4444-4444-4444-444444444444';

  const mockAttachableItems: readonly JiraAttachableEvidenceItemDto[] = [
    {
      evidenceReferenceId: validEvidenceRefId,
      artifactType: 'SCREENSHOT',
      logicalName: 'error_screenshot.png',
      mimeType: 'image/png',
      byteSize: 2048,
      sha256: 'abc123sha256',
      isEligible: true,
      requiresRedaction: false,
      isAlreadyAttached: false,
    },
    {
      evidenceReferenceId: '55555555-5555-5555-5555-555555555555',
      artifactType: 'PLAYWRIGHT_TRACE',
      logicalName: 'trace.zip',
      mimeType: 'application/zip',
      byteSize: 10240,
      sha256: 'trace123sha256',
      isEligible: false,
      ineligibilityReason:
        'Sensitive trace content cannot be safely sanitized; manual review required',
      requiresRedaction: false,
      isAlreadyAttached: false,
    },
  ];

  const mockBatchResult: JiraAttachmentBatchResultDto = {
    externalIssueId: validExternalIssueId,
    jiraIssueKey: 'ENG-101',
    totalRequested: 1,
    attachedCount: 1,
    blockedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    attachments: [
      {
        id: 'att-record-1',
        projectId: validProjectId,
        externalIssueId: validExternalIssueId,
        bugReportId: '66666666-6666-6666-6666-666666666666',
        evidenceReferenceId: validEvidenceRefId,
        evidenceType: 'SCREENSHOT',
        artifactHash: 'abc123sha256',
        jiraAttachmentId: 'jira-att-999',
        jiraFilename: '[ENG-101]_screenshot_error_screenshot.png',
        contentType: 'image/png',
        sizeBytes: 2048,
        status: 'ATTACHED',
        isDerivedRedacted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  const mockStatusList: readonly JiraEvidenceAttachmentDto[] = [
    {
      id: 'att-record-1',
      projectId: validProjectId,
      externalIssueId: validExternalIssueId,
      bugReportId: '66666666-6666-6666-6666-666666666666',
      evidenceReferenceId: validEvidenceRefId,
      evidenceType: 'SCREENSHOT',
      artifactHash: 'abc123sha256',
      jiraAttachmentId: 'jira-att-999',
      jiraFilename: '[ENG-101]_screenshot_error_screenshot.png',
      contentType: 'image/png',
      sizeBytes: 2048,
      status: 'ATTACHED',
      isDerivedRedacted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  let mockService: Partial<IJiraEvidenceAttachmentService>;

  beforeEach(() => {
    mockService = {
      async listAttachableEvidence(input) {
        if (input.projectId === '99999999-9999-9999-9999-999999999999') {
          throw new JiraCrossProjectError('failureCase', input.projectId);
        }
        return mockAttachableItems;
      },
      async attachEvidence(input) {
        if (input.externalIssueId === '00000000-0000-0000-0000-000000000000') {
          throw new JiraEvidenceNotFoundError('External Jira issue');
        }
        return mockBatchResult;
      },
      async getAttachmentStatus(_input) {
        return mockStatusList;
      },
    };

    setSharedJiraEvidenceAttachmentService(mockService as IJiraEvidenceAttachmentService);
  });

  describe('handleListAttachableEvidence', () => {
    it('rejects untrusted sender frame with UNAUTHORIZED_SENDER', async () => {
      const res = await handleListAttachableEvidence(fakeUntrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects invalid payload violating UUID format with VALIDATION_ERROR', async () => {
      const res = await handleListAttachableEvidence(fakeTrustedEvent, {
        projectId: 'not-a-uuid',
        failureCaseId: validFailureCaseId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'VALIDATION_ERROR');
      }
    });

    it('successfully returns attachable evidence items', async () => {
      const res = await handleListAttachableEvidence(fakeTrustedEvent, {
        projectId: validProjectId,
        failureCaseId: validFailureCaseId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.deepEqual(res.data, mockAttachableItems);
      }
    });

    it('returns typed error code on JiraCrossProjectError', async () => {
      const res = await handleListAttachableEvidence(fakeTrustedEvent, {
        projectId: '99999999-9999-9999-9999-999999999999',
        failureCaseId: validFailureCaseId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'JIRA_CROSS_PROJECT');
      }
    });
  });

  describe('handleAttachEvidence', () => {
    it('rejects untrusted sender frame with UNAUTHORIZED_SENDER', async () => {
      const res = await handleAttachEvidence(fakeUntrustedEvent, {
        projectId: validProjectId,
        externalIssueId: validExternalIssueId,
        evidenceReferenceIds: [validEvidenceRefId],
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects empty evidenceReferenceIds array with VALIDATION_ERROR', async () => {
      const res = await handleAttachEvidence(fakeTrustedEvent, {
        projectId: validProjectId,
        externalIssueId: validExternalIssueId,
        evidenceReferenceIds: [],
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'VALIDATION_ERROR');
      }
    });

    it('successfully attaches evidence and returns batch result', async () => {
      const res = await handleAttachEvidence(fakeTrustedEvent, {
        projectId: validProjectId,
        externalIssueId: validExternalIssueId,
        evidenceReferenceIds: [validEvidenceRefId],
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.deepEqual(res.data, mockBatchResult);
      }
    });

    it('returns typed error code when external issue is not found', async () => {
      const res = await handleAttachEvidence(fakeTrustedEvent, {
        projectId: validProjectId,
        externalIssueId: '00000000-0000-0000-0000-000000000000',
        evidenceReferenceIds: [validEvidenceRefId],
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'JIRA_EVIDENCE_NOT_FOUND');
      }
    });
  });

  describe('handleGetAttachmentStatus', () => {
    it('rejects untrusted sender frame with UNAUTHORIZED_SENDER', async () => {
      const res = await handleGetAttachmentStatus(fakeUntrustedEvent, {
        projectId: validProjectId,
        externalIssueId: validExternalIssueId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects invalid payload violating UUID format with VALIDATION_ERROR', async () => {
      const res = await handleGetAttachmentStatus(fakeTrustedEvent, {
        projectId: 'not-a-uuid',
        externalIssueId: validExternalIssueId,
      });

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'VALIDATION_ERROR');
      }
    });

    it('successfully returns list of evidence attachments', async () => {
      const res = await handleGetAttachmentStatus(fakeTrustedEvent, {
        projectId: validProjectId,
        externalIssueId: validExternalIssueId,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.deepEqual(res.data, mockStatusList);
      }
    });
  });
});
