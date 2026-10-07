/**
 * @file apps/desktop/src/main/ipc/git-review-handlers.test.ts
 * Security, authentication, authorization, and boundary validation unit tests
 * for V10 Phase 150 Git Diff & Change Review IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetGitWorkingStatus,
  handleGetGitDiff,
  handleCreateGitChangeReview,
  handleGetGitChangeReview,
  handleApproveGitChangeReview,
  handleRejectGitChangeReview,
  setGitChangeReviewServiceForTest,
} from './git-review-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  GitChangeReviewService,
  AiCrossProjectAccessError,
  GitReviewUnauthorizedApprovalError,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  GitWorkingStatusDto,
  GitDiffResultDto,
  AgentGitChangeReviewDto,
} from '@ai-quality/contracts';
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

describe('V10 Phase 150 Git Diff & Change Review IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';
  const testReviewId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const testTaskId = 'cccccccc-1111-1111-1111-cccccccccccc';

  const mockWorkingStatus: GitWorkingStatusDto = {
    isGitRepository: true,
    repositoryRoot: '/path/to/repo',
    currentBranch: 'main',
    headCommit: 'abcdef123456',
    isClean: false,
    stagedFiles: [],
    unstagedFiles: [
      {
        filePath: 'src/index.ts',
        status: 'MODIFIED',
        staged: false,
        additions: 2,
        deletions: 1,
        binary: false,
        isDangerous: false,
        isDependencyOrConfig: false,
        isTestFile: false,
        isGeneratedFile: false,
      },
    ],
    untrackedFiles: [],
    totalChangedFiles: 1,
  };

  const mockDiffResult: GitDiffResultDto = {
    diff: 'diff --git a/src/index.ts b/src/index.ts\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,1 +1,2 @@\n-old\n+new',
    staged: false,
    files: [
      {
        filePath: 'src/index.ts',
        status: 'MODIFIED',
        staged: false,
        additions: 1,
        deletions: 1,
        binary: false,
        isDangerous: false,
        isDependencyOrConfig: false,
        isTestFile: false,
        isGeneratedFile: false,
      },
    ],
    analysis: {
      filesChangedCount: 1,
      linesAddedCount: 1,
      linesRemovedCount: 1,
      newFiles: [],
      deletedFiles: [],
      modifiedFiles: ['src/index.ts'],
      potentiallyDangerousFiles: [],
      dependencyConfigFiles: [],
      testFiles: [],
      generatedFiles: [],
      hasSecretRedactions: false,
      redactedSecretOccurrences: 0,
      safetyAssessment: 'SAFE',
    },
    redacted: false,
  };

  const mockReviewDto: AgentGitChangeReviewDto = {
    id: testReviewId,
    projectId: testProjectId,
    taskId: testTaskId,
    commitBaseRef: 'base-commit-hash',
    status: 'PENDING',
    changedFiles: ['src/index.ts'],
    additions: 1,
    deletions: 1,
    diffContent: mockDiffResult.diff,
    diffRef: `reviews/${testReviewId}/diff.patch`,
    reviewedBy: null,
    reviewedAt: null,
    decisionComment: null,
    analysis: mockDiffResult.analysis,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockSecureStorage: MockSecureStorage;
  let mockAuthService: AuthenticationService;
  let mockService: Partial<GitChangeReviewService>;

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
    } as unknown as AuthenticationService;
    setAuthServiceForTest(mockAuthService);

    mockService = {
      getStatus: async (_input: any, _userId: string) => {
        return mockWorkingStatus;
      },
      getDiff: async (_input: any, _userId: string) => {
        return mockDiffResult;
      },
      createReview: async (_input: any, _userId: string) => {
        return mockReviewDto;
      },
      getReview: async (_input: any, _userId: string) => {
        return mockReviewDto;
      },
      approveReview: async (input: any, _userId: string) => {
        if (input.reviewedBy && (input.reviewedBy.toLowerCase().startsWith('agent') || input.reviewedBy.toLowerCase().startsWith('ai_'))) {
          throw new GitReviewUnauthorizedApprovalError('Agents are strictly forbidden from approving reviews.');
        }
        return {
          ...mockReviewDto,
          status: 'APPROVED',
          reviewedBy: input.reviewedBy ?? 'HUMAN_REVIEWER',
          reviewedAt: new Date().toISOString(),
          decisionComment: input.decisionComment ?? null,
        };
      },
      rejectReview: async (input: any, _userId: string) => {
        return {
          ...mockReviewDto,
          status: 'REJECTED',
          reviewedBy: input.reviewedBy ?? 'HUMAN_REVIEWER',
          decisionComment: input.reason,
          reviewedAt: new Date().toISOString(),
        };
      },
    };

    setGitChangeReviewServiceForTest(mockService as GitChangeReviewService);
  });

  const validEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'http://evil-origin.com/attack.html',
    },
  } as unknown as IpcMainInvokeEvent;

  it('rejects untrusted sender frame origin across all git review channels', async () => {
    const resStatus = await handleGetGitWorkingStatus(untrustedEvent, { projectId: testProjectId });
    assert.equal(resStatus.ok, false);
    if (!resStatus.ok) assert.equal(resStatus.error.code, 'UNAUTHORIZED_SENDER');

    const resDiff = await handleGetGitDiff(untrustedEvent, { projectId: testProjectId });
    assert.equal(resDiff.ok, false);
    if (!resDiff.ok) assert.equal(resDiff.error.code, 'UNAUTHORIZED_SENDER');

    const resCreate = await handleCreateGitChangeReview(untrustedEvent, {
      projectId: testProjectId,
      taskId: testTaskId,
    });
    assert.equal(resCreate.ok, false);
    if (!resCreate.ok) assert.equal(resCreate.error.code, 'UNAUTHORIZED_SENDER');

    const resGet = await handleGetGitChangeReview(untrustedEvent, {
      projectId: testProjectId,
      reviewId: testReviewId,
    });
    assert.equal(resGet.ok, false);
    if (!resGet.ok) assert.equal(resGet.error.code, 'UNAUTHORIZED_SENDER');

    const resApprove = await handleApproveGitChangeReview(untrustedEvent, {
      projectId: testProjectId,
      reviewId: testReviewId,
      reviewedBy: 'human_reviewer',
    });
    assert.equal(resApprove.ok, false);
    if (!resApprove.ok) assert.equal(resApprove.error.code, 'UNAUTHORIZED_SENDER');

    const resReject = await handleRejectGitChangeReview(untrustedEvent, {
      projectId: testProjectId,
      reviewId: testReviewId,
      reviewedBy: 'human_reviewer',
      reason: 'Not approved',
    });
    assert.equal(resReject.ok, false);
    if (!resReject.ok) assert.equal(resReject.error.code, 'UNAUTHORIZED_SENDER');
  });

  it('rejects unauthenticated requests when session is missing', async () => {
    mockSecureStorage.token = null;
    const res = await handleGetGitWorkingStatus(validEvent, { projectId: testProjectId });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.code, 'AUTHENTICATION_FAILED');
  });

  it('validates malformed input schemas cleanly', async () => {
    const res = await handleGetGitWorkingStatus(validEvent, { projectId: 'not-a-uuid' });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.code, 'VALIDATION_ERROR');
  });

  it('handles get working status successfully', async () => {
    const res = await handleGetGitWorkingStatus(validEvent, { projectId: testProjectId });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.isGitRepository, true);
      assert.equal(res.data.unstagedFiles.length, 1);
    }
  });

  it('handles get git diff successfully', async () => {
    const res = await handleGetGitDiff(validEvent, { projectId: testProjectId, staged: false });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.ok(res.data.diff.includes('diff --git'));
      assert.equal(res.data.analysis.filesChangedCount, 1);
    }
  });

  it('handles create change review successfully', async () => {
    const res = await handleCreateGitChangeReview(validEvent, {
      projectId: testProjectId,
      taskId: testTaskId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, testReviewId);
      assert.equal(res.data.status, 'PENDING');
    }
  });

  it('handles get change review successfully', async () => {
    const res = await handleGetGitChangeReview(validEvent, {
      projectId: testProjectId,
      reviewId: testReviewId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data?.id, testReviewId);
    }
  });

  it('prevents agent self-approval via IPC boundary', async () => {
    const res = await handleApproveGitChangeReview(validEvent, {
      projectId: testProjectId,
      reviewId: testReviewId,
      reviewedBy: 'agent_coder_v1',
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'INVALID_REQUEST');
      assert.ok(res.error.message.includes('Agents are strictly forbidden from approving reviews.'));
    }
  });

  it('approves change review with human reviewer identity', async () => {
    const res = await handleApproveGitChangeReview(validEvent, {
      projectId: testProjectId,
      reviewId: testReviewId,
      reviewedBy: 'engineer@corp.internal',
      decisionComment: 'Looks solid, verified manually.',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'APPROVED');
      assert.equal(res.data.reviewedBy, 'engineer@corp.internal');
    }
  });

  it('rejects change review with human reviewer reason', async () => {
    const res = await handleRejectGitChangeReview(validEvent, {
      projectId: testProjectId,
      reviewId: testReviewId,
      reviewedBy: 'reviewer@corp.internal',
      reason: 'Breaking changes in database contract.',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'REJECTED');
      assert.equal(res.data.decisionComment, 'Breaking changes in database contract.');
    }
  });

  it('sanitizes cross-project access violations cleanly', async () => {
    mockService.getStatus = async () => {
      throw new AiCrossProjectAccessError('Cannot access project of another tenant.');
    };
    const res = await handleGetGitWorkingStatus(validEvent, { projectId: testProjectId });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'AI_CROSS_PROJECT_ACCESS');
    }
  });
});
