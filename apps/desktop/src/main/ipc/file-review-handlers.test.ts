/**
 * @file apps/desktop/src/main/ipc/file-review-handlers.test.ts
 * Privileged IPC boundary unit tests for V10 Phase 156: File & Diff Review Workspace.
 *
 * Verifies:
 * 1. Untrusted sender origin rejection (isTrustedIpcSender)
 * 2. User authentication enforcement (extractUser / assertAuthenticated)
 * 3. Zod schema input validation
 * 4. Error mapping to DesktopResult contracts (NotFoundError, NotApproved, PathTraversal, etc.)
 * 5. Full lifecycle IPC handling: create, get, list, approve, reject, cancel, apply, getFileContent
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import { EventEmitter } from 'node:events';
import {
  handleCreateFileReview,
  handleGetFileReview,
  handleListFileReviews,
  handleApproveFileReview,
  handleRejectFileReview,
  handleCancelFileReview,
  handleApplyFileReview,
  handleGetFileReviewContent,
  setFileReviewServiceForTest,
} from './file-review-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  FileReviewNotFoundError,
  FileReviewAlreadyDecidedError,
  FileReviewNotApprovedError,
  FileReviewAlreadyAppliedError,
  FileReviewPathTraversalError,
  FileReviewFileNotFoundError,
  FileReviewFileTooLargeError,
  FileReviewUnauthorizedError,
  FileReviewChecksumMismatchError,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  FileDiffReviewDto,
  ApplyFileReviewResultDto,
  FileReviewContentDto,
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

class MockWebContents extends EventEmitter {
  public id = 42;
  private destroyed = false;

  public isDestroyed(): boolean {
    return this.destroyed;
  }

  public destroy(): void {
    this.destroyed = true;
    this.emit('destroyed');
  }
}

describe('V10 Phase 156 File & Diff Review IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testThreadId = 'cccccccc-1111-1111-1111-cccccccccccc';
  const testTaskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const testReviewId = '99999999-9999-9999-9999-999999999999';
  const notFoundReviewId = '00000000-0000-0000-0000-000000000000';
  const decidedReviewId = '88888888-8888-8888-8888-888888888888';
  const notApprovedReviewId = '77777777-7777-7777-7777-777777777777';
  const appliedReviewId = '66666666-6666-6666-6666-666666666666';
  const checksumMismatchReviewId = '55555555-5555-5555-5555-555555555555';
  const testUserId = 'user-uuid-1111-2222';

  const validDiff =
    '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,1 +1,1 @@\n-const a = 1;\n+const a = 2;\n';

  let mockSender: MockWebContents;
  let mockSecureStorage: MockSecureStorage;
  let mockService: any;

  const createTrustedEvent = (sender: any = mockSender): IpcMainInvokeEvent =>
    ({
      senderFrame: {
        parent: null,
        url: 'app://renderer/index.html',
      },
      sender,
    }) as unknown as IpcMainInvokeEvent;

  const createUntrustedEvent = (sender: any = mockSender): IpcMainInvokeEvent =>
    ({
      senderFrame: {
        parent: null,
        url: 'https://evil-untrusted-site.com',
      },
      sender,
    }) as unknown as IpcMainInvokeEvent;

  const sampleReviewDto: FileDiffReviewDto = {
    id: testReviewId,
    userId: testUserId,
    projectId: testProjectId,
    threadId: testThreadId,
    taskId: testTaskId,
    approvalRequestId: null,
    title: 'Update index.ts',
    description: 'Fix constant',
    affectedFiles: ['src/index.ts'],
    originalDiff: validDiff,
    diffChecksum: 'abc123canonicalhash',
    status: 'PENDING_REVIEW',
    reviewedBy: null,
    reviewedAt: null,
    decisionReason: null,
    appliedAt: null,
    appliedCommit: null,
    metadata: {},
    createdAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T10:00:00.000Z',
  };

  beforeEach(() => {
    mockSender = new MockWebContents();
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    const mockAuthService = {
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
      createReview: async (input: any, userId: string): Promise<FileDiffReviewDto> => {
        if (userId !== testUserId) {
          throw new FileReviewUnauthorizedError('Unauthorized');
        }
        return { ...sampleReviewDto, ...input };
      },
      getReview: async (input: any, userId: string): Promise<FileDiffReviewDto | null> => {
        if (userId !== testUserId) {
          throw new FileReviewUnauthorizedError('Unauthorized');
        }
        if (input.reviewId === notFoundReviewId) {
          return null;
        }
        return sampleReviewDto;
      },
      listReviews: async (input: any, userId: string): Promise<FileDiffReviewDto[]> => {
        if (userId !== testUserId) {
          throw new FileReviewUnauthorizedError('Unauthorized');
        }
        return [sampleReviewDto];
      },
      approveReview: async (input: any, userId: string): Promise<FileDiffReviewDto> => {
        if (userId !== testUserId) {
          throw new FileReviewUnauthorizedError('Unauthorized');
        }
        if (input.reviewId === notFoundReviewId) {
          throw new FileReviewNotFoundError(input.reviewId);
        }
        if (input.reviewId === decidedReviewId) {
          throw new FileReviewAlreadyDecidedError(input.reviewId, 'APPROVED');
        }
        return {
          ...sampleReviewDto,
          status: 'APPROVED',
          reviewedBy: userId,
          reviewedAt: new Date().toISOString(),
          decisionReason: input.reason ?? null,
        };
      },
      rejectReview: async (input: any, userId: string): Promise<FileDiffReviewDto> => {
        if (userId !== testUserId) {
          throw new FileReviewUnauthorizedError('Unauthorized');
        }
        if (input.reviewId === decidedReviewId) {
          throw new FileReviewAlreadyDecidedError(input.reviewId, 'REJECTED');
        }
        return {
          ...sampleReviewDto,
          status: 'REJECTED',
          reviewedBy: userId,
          reviewedAt: new Date().toISOString(),
          decisionReason: input.reason ?? null,
        };
      },
      cancelReview: async (input: any, userId: string): Promise<FileDiffReviewDto> => {
        if (userId !== testUserId) {
          throw new FileReviewUnauthorizedError('Unauthorized');
        }
        if (input.reviewId === decidedReviewId) {
          throw new FileReviewAlreadyDecidedError(input.reviewId, 'CANCELLED');
        }
        return {
          ...sampleReviewDto,
          status: 'CANCELLED',
          reviewedBy: userId,
          reviewedAt: new Date().toISOString(),
          decisionReason: input.reason ?? null,
        };
      },
      applyReview: async (input: any, userId: string): Promise<ApplyFileReviewResultDto> => {
        if (userId !== testUserId) {
          throw new FileReviewUnauthorizedError('Unauthorized');
        }
        if (input.reviewId === notApprovedReviewId) {
          throw new FileReviewNotApprovedError(input.reviewId, 'PENDING_REVIEW');
        }
        if (input.reviewId === appliedReviewId) {
          throw new FileReviewAlreadyAppliedError(input.reviewId);
        }
        if (input.reviewId === checksumMismatchReviewId) {
          throw new FileReviewChecksumMismatchError(input.reviewId);
        }
        return {
          reviewId: input.reviewId,
          status: 'APPLIED',
          appliedAt: new Date().toISOString(),
          appliedCommit: 'review-99999999',
          filesModifiedCount: 1,
          affectedFiles: ['src/index.ts'],
          linesAdded: 1,
          linesRemoved: 1,
        };
      },
      getFileContent: async (input: any, userId: string): Promise<FileReviewContentDto> => {
        if (userId !== testUserId) {
          throw new FileReviewUnauthorizedError('Unauthorized');
        }
        if (input.filePath.includes('..') || input.filePath.includes('\0')) {
          throw new FileReviewPathTraversalError(input.filePath);
        }
        if (input.filePath === 'non-existent.ts') {
          throw new FileReviewFileNotFoundError(input.filePath);
        }
        if (input.filePath === 'huge.bin') {
          throw new FileReviewFileTooLargeError(input.filePath, 25000000, 5242880);
        }
        return {
          filePath: input.filePath,
          language: 'typescript',
          sizeBytes: 120,
          modifiedAt: '2026-10-06T10:00:00.000Z',
          isBinary: false,
          content: 'export const hello = "world";',
          lineCount: 1,
        };
      },
    };

    setFileReviewServiceForTest(mockService);
  });

  // ============================================================================
  // Sender Origin Security
  // ============================================================================
  describe('IPC Sender Security', () => {
    it('rejects untrusted sender frame for handleCreateFileReview', async () => {
      const event = createUntrustedEvent();
      const res = await handleCreateFileReview(event, {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        title: 'Title',
        description: 'Desc',
        originalDiff: validDiff,
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender frame for handleApproveFileReview', async () => {
      const event = createUntrustedEvent();
      const res = await handleApproveFileReview(event, {
        projectId: testProjectId,
        reviewId: testReviewId,
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender frame for handleApplyFileReview', async () => {
      const event = createUntrustedEvent();
      const res = await handleApplyFileReview(event, {
        projectId: testProjectId,
        reviewId: testReviewId,
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'UNAUTHORIZED_SENDER');
    });

    it('rejects untrusted sender frame for handleGetFileReviewContent', async () => {
      const event = createUntrustedEvent();
      const res = await handleGetFileReviewContent(event, {
        projectId: testProjectId,
        filePath: 'src/index.ts',
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'UNAUTHORIZED_SENDER');
    });
  });

  // ============================================================================
  // Authentication Enforcement
  // ============================================================================
  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated requests when session token is missing', async () => {
      mockSecureStorage.token = null;
      const event = createTrustedEvent();
      const res = await handleCreateFileReview(event, {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        title: 'Title',
        description: 'Desc',
        originalDiff: validDiff,
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'UNAUTHORIZED');
    });
  });

  // ============================================================================
  // Schema Validation
  // ============================================================================
  describe('Schema Validation', () => {
    it('returns VALIDATION_ERROR on malformed input (missing required fields)', async () => {
      const event = createTrustedEvent();
      const res = await handleCreateFileReview(event, {
        projectId: testProjectId,
        // missing threadId, taskId, title, description, originalDiff
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'VALIDATION_ERROR');
    });

    it('returns VALIDATION_ERROR when IDs are not valid UUIDs', async () => {
      const event = createTrustedEvent();
      const res = await handleCreateFileReview(event, {
        projectId: 'not-a-uuid',
        threadId: testThreadId,
        taskId: testTaskId,
        title: 'Title',
        description: 'Desc',
        originalDiff: validDiff,
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // Review Creation & Retrieval
  // ============================================================================
  describe('Review Operations', () => {
    it('creates a review successfully when input is valid', async () => {
      const event = createTrustedEvent();
      const res = await handleCreateFileReview(event, {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        title: 'Update index.ts',
        description: 'Fix constant',
        originalDiff: validDiff,
      });
      assert.equal(res.ok, true);
      assert.equal(res.data?.id, testReviewId);
      assert.equal(res.data?.status, 'PENDING_REVIEW');
    });

    it('retrieves an existing review by ID', async () => {
      const event = createTrustedEvent();
      const res = await handleGetFileReview(event, {
        projectId: testProjectId,
        reviewId: testReviewId,
      });
      assert.equal(res.ok, true);
      assert.equal(res.data?.id, testReviewId);
    });

    it('returns null data when review does not exist', async () => {
      const event = createTrustedEvent();
      const res = await handleGetFileReview(event, {
        projectId: testProjectId,
        reviewId: notFoundReviewId,
      });
      assert.equal(res.ok, true);
      assert.equal(res.data, null);
    });

    it('lists reviews for a project', async () => {
      const event = createTrustedEvent();
      const res = await handleListFileReviews(event, {
        projectId: testProjectId,
      });
      assert.equal(res.ok, true);
      assert.equal(res.data?.length, 1);
      assert.equal(res.data?.[0]?.id, testReviewId);
    });
  });

  // ============================================================================
  // Review Decisions (Approve, Reject, Cancel)
  // ============================================================================
  describe('Review Decisions', () => {
    it('approves a pending review successfully', async () => {
      const event = createTrustedEvent();
      const res = await handleApproveFileReview(event, {
        projectId: testProjectId,
        reviewId: testReviewId,
        reason: 'Looks great',
      });
      assert.equal(res.ok, true);
      assert.equal(res.data?.status, 'APPROVED');
      assert.equal(res.data?.decisionReason, 'Looks great');
    });

    it('rejects an already decided review with FILE_REVIEW_ALREADY_DECIDED', async () => {
      const event = createTrustedEvent();
      const res = await handleApproveFileReview(event, {
        projectId: testProjectId,
        reviewId: decidedReviewId,
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'FILE_REVIEW_ALREADY_DECIDED');
    });

    it('rejects a review successfully', async () => {
      const event = createTrustedEvent();
      const res = await handleRejectFileReview(event, {
        projectId: testProjectId,
        reviewId: testReviewId,
        reason: 'Incorrect logic',
      });
      assert.equal(res.ok, true);
      assert.equal(res.data?.status, 'REJECTED');
    });

    it('cancels a review successfully', async () => {
      const event = createTrustedEvent();
      const res = await handleCancelFileReview(event, {
        projectId: testProjectId,
        reviewId: testReviewId,
        reason: 'Superseded',
      });
      assert.equal(res.ok, true);
      assert.equal(res.data?.status, 'CANCELLED');
    });
  });

  // ============================================================================
  // Apply Review Patch (Pre-Approval Gate)
  // ============================================================================
  describe('Apply Review Patch', () => {
    it('applies an approved review successfully', async () => {
      const event = createTrustedEvent();
      const res = await handleApplyFileReview(event, {
        projectId: testProjectId,
        reviewId: testReviewId,
      });
      assert.equal(res.ok, true);
      assert.equal(res.data?.status, 'APPLIED');
      assert.equal(res.data?.filesModifiedCount, 1);
    });

    it('blocks applying an unapproved review with FILE_REVIEW_NOT_APPROVED', async () => {
      const event = createTrustedEvent();
      const res = await handleApplyFileReview(event, {
        projectId: testProjectId,
        reviewId: notApprovedReviewId,
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'FILE_REVIEW_NOT_APPROVED');
    });

    it('blocks re-applying an already applied review with FILE_REVIEW_ALREADY_APPLIED', async () => {
      const event = createTrustedEvent();
      const res = await handleApplyFileReview(event, {
        projectId: testProjectId,
        reviewId: appliedReviewId,
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'FILE_REVIEW_ALREADY_APPLIED');
    });

    it('detects diff checksum tampering with FILE_REVIEW_CHECKSUM_MISMATCH', async () => {
      const event = createTrustedEvent();
      const res = await handleApplyFileReview(event, {
        projectId: testProjectId,
        reviewId: checksumMismatchReviewId,
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'FILE_REVIEW_CHECKSUM_MISMATCH');
    });
  });

  // ============================================================================
  // Safe Read-Only File Inspection
  // ============================================================================
  describe('Safe File Inspection', () => {
    it('reads a project file safely and returns content and metadata', async () => {
      const event = createTrustedEvent();
      const res = await handleGetFileReviewContent(event, {
        projectId: testProjectId,
        filePath: 'src/index.ts',
      });
      assert.equal(res.ok, true);
      assert.equal(res.data?.filePath, 'src/index.ts');
      assert.equal(res.data?.language, 'typescript');
      assert.equal(res.data?.isBinary, false);
      assert.ok(res.data?.content.includes('hello'));
    });

    it('rejects path traversal attempts with FILE_REVIEW_PATH_TRAVERSAL', async () => {
      const event = createTrustedEvent();
      const res = await handleGetFileReviewContent(event, {
        projectId: testProjectId,
        filePath: '../../etc/passwd',
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'FILE_REVIEW_PATH_TRAVERSAL');
    });

    it('rejects non-existent file with FILE_REVIEW_FILE_NOT_FOUND', async () => {
      const event = createTrustedEvent();
      const res = await handleGetFileReviewContent(event, {
        projectId: testProjectId,
        filePath: 'non-existent.ts',
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'FILE_REVIEW_FILE_NOT_FOUND');
    });

    it('rejects file exceeding max size with FILE_REVIEW_FILE_TOO_LARGE', async () => {
      const event = createTrustedEvent();
      const res = await handleGetFileReviewContent(event, {
        projectId: testProjectId,
        filePath: 'huge.bin',
      });
      assert.equal(res.ok, false);
      assert.equal(res.error?.code, 'FILE_REVIEW_FILE_TOO_LARGE');
    });
  });
});
