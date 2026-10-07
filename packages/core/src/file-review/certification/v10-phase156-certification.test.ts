/**
 * @file packages/core/src/file-review/certification/v10-phase156-certification.test.ts
 * Comprehensive certification test suite for V10 Phase 156: File & Diff Review Workspace.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  FileReviewService,
  FileReviewAlreadyDecidedError,
  FileReviewNotApprovedError,
  FileReviewAlreadyAppliedError,
  FileReviewPathTraversalError,
  FileReviewFileNotFoundError,
  FileReviewUnauthorizedError,
  FileReviewValidationError,
  FileReviewApplyFailedError,
  FileReviewChecksumMismatchError,
  detectFileLanguage,
} from '../index.js';
import { ApprovalService } from '../../agent-approval/approval-service.js';

describe('V10 Phase 156: File & Diff Review Workspace Certification Suite', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-owner-1111';
  const otherUserId = 'user-other-2222';
  const testThreadId = 'cccccccc-1111-1111-1111-cccccccccccc';
  const testTaskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const otherTaskId = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';

  let tempWorkspaceDir: string;
  let mockProjects: Array<any>;
  let _mockThreads: Array<any>;
  let mockTasks: Array<any>;
  let mockReviews: Array<any>;
  let mockApprovals: Array<any>;
  let mockAuditLogs: Array<any>;
  let mockPrisma: any;
  let approvalService: ApprovalService;
  let fileReviewService: FileReviewService;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase156-cert-'));

    // Create sample files in temp workspace
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'calculator.ts'),
      'export function add(a: number, b: number): number {\n  return a - b;\n}\n',
    );
    fs.writeFileSync(path.join(tempWorkspaceDir, 'config.json'), '{\n  "version": "1.0.0"\n}\n');

    mockProjects = [
      {
        id: testProjectId,
        userId: testUserId,
        deletedAt: null,
        source: { rootPath: tempWorkspaceDir },
      },
      {
        id: otherProjectId,
        userId: otherUserId,
        deletedAt: null,
        source: { rootPath: tempWorkspaceDir },
      },
    ];

    _mockThreads = [
      {
        id: testThreadId,
        projectId: testProjectId,
        userId: testUserId,
        title: 'Fix Add Function Thread',
      },
    ];

    mockTasks = [
      {
        id: testTaskId,
        projectId: testProjectId,
        threadId: testThreadId,
        userId: testUserId,
        title: 'Fix addition subtraction bug',
        status: 'RUNNING',
      },
      {
        id: otherTaskId,
        projectId: otherProjectId,
        threadId: 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
        userId: otherUserId,
        title: 'Other task',
        status: 'RUNNING',
      },
    ];

    mockReviews = [];
    mockApprovals = [];
    mockAuditLogs = [];

    let txQueue: Promise<unknown> = Promise.resolve();
    mockPrisma = {
      $transaction: async (cb: any) => {
        const next = txQueue.then(() => cb(mockPrisma));
        txQueue = next.then(
          () => {},
          () => {},
        );
        return next;
      },
      project: {
        findUnique: async ({ where }: any) => {
          return mockProjects.find(p => p.id === where.id) || null;
        },
      },
      agentThreadTask: {
        findUnique: async ({ where }: any) => {
          return mockTasks.find(t => t.id === where.id) || null;
        },
        update: async ({ where, data }: any) => {
          const item = mockTasks.find(t => t.id === where.id);
          if (item) Object.assign(item, data);
          return item;
        },
      },
      approvalRequest: {
        findFirst: async ({ where }: any) => {
          return (
            mockApprovals.find(
              a => a.taskId === where.taskId && (!where.status || a.status === where.status),
            ) || null
          );
        },
        findUnique: async ({ where }: any) => {
          return mockApprovals.find(a => a.id === where.id) || null;
        },
        create: async ({ data }: any) => {
          const item = {
            id: crypto.randomUUID(),
            ...data,
            requestedAt: data.requestedAt ?? new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockApprovals.push(item);
          return item;
        },
        update: async ({ where, data }: any) => {
          const item = mockApprovals.find(a => a.id === where.id);
          if (item) Object.assign(item, data);
          return item;
        },
      },
      approvalAuditLog: {
        create: async ({ data }: any) => {
          const item = { id: crypto.randomUUID(), ...data, timestamp: new Date() };
          mockAuditLogs.push(item);
          return item;
        },
      },
      fileDiffReview: {
        create: async ({ data }: any) => {
          const item = {
            id: crypto.randomUUID(),
            ...data,
            reviewedBy: null,
            reviewedAt: null,
            decisionReason: null,
            appliedAt: null,
            appliedCommit: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockReviews.push(item);
          return item;
        },
        findUnique: async ({ where }: any) => {
          return mockReviews.find(r => r.id === where.id) || null;
        },
        findFirst: async ({ where }: any) => {
          return (
            mockReviews.find(
              r =>
                (!where.projectId || r.projectId === where.projectId) &&
                (!where.approvalRequestId || r.approvalRequestId === where.approvalRequestId) &&
                (!where.status || r.status === where.status),
            ) || null
          );
        },
        findMany: async ({ where }: any) => {
          return mockReviews.filter(
            r =>
              (!where.projectId || r.projectId === where.projectId) &&
              (!where.threadId || r.threadId === where.threadId) &&
              (!where.taskId || r.taskId === where.taskId) &&
              (!where.status || r.status === where.status),
          );
        },
        update: async ({ where, data }: any) => {
          const item = mockReviews.find(r => r.id === where.id);
          if (item) Object.assign(item, data);
          return item;
        },
      },
    };

    approvalService = new ApprovalService({ prisma: mockPrisma });
    fileReviewService = new FileReviewService({ prisma: mockPrisma, approvalService });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  // ============================================================================
  // 1. Review Creation & Diff Persistence
  // ============================================================================
  describe('1. Review Creation & Diff Persistence', () => {
    const validDiff =
      '--- a/calculator.ts\n+++ b/calculator.ts\n@@ -2,1 +2,1 @@\n-  return a - b;\n+  return a + b;\n';

    it('creates review with required fields, computes SHA-256 diffChecksum, and extracts affected files', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Fix addition operator',
          description: 'Change minus to plus operator in add function',
          originalDiff: validDiff,
        },
        testUserId,
      );

      assert.ok(review.id);
      assert.equal(review.projectId, testProjectId);
      assert.equal(review.taskId, testTaskId);
      assert.equal(review.status, 'PENDING_REVIEW');
      assert.deepEqual(review.affectedFiles, ['calculator.ts']);
      assert.equal(review.originalDiff, validDiff);

      const expectedChecksum = crypto.createHash('sha256').update(validDiff).digest('hex');
      assert.equal(review.diffChecksum, expectedChecksum);
    });

    it('parses multi-file unified diff into affected files list', async () => {
      const multiDiff =
        '--- a/calculator.ts\n+++ b/calculator.ts\n@@ -2,1 +2,1 @@\n-  return a - b;\n+  return a + b;\n--- a/config.json\n+++ b/config.json\n@@ -2,1 +2,1 @@\n-  "version": "1.0.0"\n+  "version": "1.0.1"\n';

      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Update math and bump version',
          description: 'Fix add function and increment patch version',
          originalDiff: multiDiff,
        },
        testUserId,
      );

      assert.deepEqual(review.affectedFiles, ['calculator.ts', 'config.json']);
    });

    it('rejects empty diff with FileReviewValidationError', async () => {
      await assert.rejects(
        fileReviewService.createReview(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: testTaskId,
            title: 'Empty diff test',
            description: 'Should fail',
            originalDiff: '   ',
          },
          testUserId,
        ),
        (err: any) => err instanceof FileReviewValidationError,
      );
    });

    it('preserves immutable original proposal across reads', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Check immutability',
          description: 'Ensure original diff is stored intact',
          originalDiff: validDiff,
        },
        testUserId,
      );

      const fetched = await fileReviewService.getReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );
      assert.ok(fetched);
      assert.equal(fetched.originalDiff, validDiff);
      assert.equal(fetched.diffChecksum, review.diffChecksum);
    });
  });

  // ============================================================================
  // 2. Change Review State Machine & Invariants
  // ============================================================================
  describe('2. Change Review State Machine & Invariants', () => {
    const validDiff =
      '--- a/calculator.ts\n+++ b/calculator.ts\n@@ -2,1 +2,1 @@\n-  return a - b;\n+  return a + b;\n';

    it('handles transition: PENDING_REVIEW -> APPROVED', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Approve test',
          description: 'To approve',
          originalDiff: validDiff,
        },
        testUserId,
      );

      const approved = await fileReviewService.approveReview(
        { projectId: testProjectId, reviewId: review.id, reason: 'Looks great!' },
        testUserId,
      );

      assert.equal(approved.status, 'APPROVED');
      assert.equal(approved.reviewedBy, testUserId);
      assert.equal(approved.decisionReason, 'Looks great!');
      assert.ok(approved.reviewedAt);
    });

    it('handles transition: PENDING_REVIEW -> REJECTED', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Reject test',
          description: 'To reject',
          originalDiff: validDiff,
        },
        testUserId,
      );

      const rejected = await fileReviewService.rejectReview(
        { projectId: testProjectId, reviewId: review.id, reason: 'Incomplete implementation' },
        testUserId,
      );

      assert.equal(rejected.status, 'REJECTED');
      assert.equal(rejected.reviewedBy, testUserId);
      assert.equal(rejected.decisionReason, 'Incomplete implementation');
      assert.ok(rejected.reviewedAt);
    });

    it('handles transition: PENDING_REVIEW -> CANCELLED', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Cancel test',
          description: 'To cancel',
          originalDiff: validDiff,
        },
        testUserId,
      );

      const cancelled = await fileReviewService.cancelReview(
        { projectId: testProjectId, reviewId: review.id, reason: 'Task cancelled by user' },
        testUserId,
      );

      assert.equal(cancelled.status, 'CANCELLED');
      assert.equal(cancelled.decisionReason, 'Task cancelled by user');
    });

    it('blocks applying changes before approval (PENDING_REVIEW -> apply throws FileReviewNotApprovedError)', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Premature apply',
          description: 'Must not apply while pending',
          originalDiff: validDiff,
        },
        testUserId,
      );

      await assert.rejects(
        fileReviewService.applyReview(
          { projectId: testProjectId, reviewId: review.id },
          testUserId,
        ),
        (err: any) =>
          err instanceof FileReviewNotApprovedError && err.code === 'FILE_REVIEW_NOT_APPROVED',
      );
    });

    it('blocks applying rejected or cancelled reviews with FileReviewNotApprovedError', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Rejected apply',
          description: 'Cannot apply rejected',
          originalDiff: validDiff,
        },
        testUserId,
      );

      await fileReviewService.rejectReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );

      await assert.rejects(
        fileReviewService.applyReview(
          { projectId: testProjectId, reviewId: review.id },
          testUserId,
        ),
        (err: any) => err instanceof FileReviewNotApprovedError,
      );
    });

    it('blocks approving or rejecting an already decided review with FileReviewAlreadyDecidedError', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Double decision test',
          description: 'Must not re-decide',
          originalDiff: validDiff,
        },
        testUserId,
      );

      await fileReviewService.approveReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );

      // Attempt second approval
      await assert.rejects(
        fileReviewService.approveReview(
          { projectId: testProjectId, reviewId: review.id },
          testUserId,
        ),
        (err: any) => err instanceof FileReviewAlreadyDecidedError,
      );

      // Attempt rejection after approval
      await assert.rejects(
        fileReviewService.rejectReview(
          { projectId: testProjectId, reviewId: review.id },
          testUserId,
        ),
        (err: any) => err instanceof FileReviewAlreadyDecidedError,
      );
    });
  });

  // ============================================================================
  // 3. Approval Gate Integration (Phase 155 Human Approval)
  // ============================================================================
  describe('3. Approval Gate Integration', () => {
    const validDiff =
      '--- a/calculator.ts\n+++ b/calculator.ts\n@@ -2,1 +2,1 @@\n-  return a - b;\n+  return a + b;\n';

    it('synchronizes review approval with linked Phase 155 ApprovalRequest', async () => {
      const approval = await approvalService.createRequest(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          approvalType: 'CODE_PATCH',
          title: 'Repair patch for calculator',
          description: 'Fix add function',
          riskLevel: 'HIGH',
          requestedAction: 'repair.applyPatch',
          requestedInput: { diff: validDiff },
        },
        testUserId,
      );

      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          approvalRequestId: approval.id,
          title: 'Repair patch for calculator',
          description: 'Fix add function',
          originalDiff: validDiff,
        },
        testUserId,
      );

      assert.equal(review.approvalRequestId, approval.id);

      // Approving the file review should synchronize the linked approval request
      await fileReviewService.approveReview(
        { projectId: testProjectId, reviewId: review.id, reason: 'Verified manually' },
        testUserId,
      );

      const updatedApproval = await approvalService.getRequest(
        { projectId: testProjectId, approvalId: approval.id },
        testUserId,
      );
      assert.ok(updatedApproval);
      assert.equal(updatedApproval.status, 'APPROVED');
    });

    it('synchronizes review rejection with linked Phase 155 ApprovalRequest', async () => {
      const approval = await approvalService.createRequest(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          approvalType: 'CODE_PATCH',
          title: 'Reject patch test',
          description: 'Testing rejection synchronization',
          riskLevel: 'HIGH',
          requestedAction: 'repair.applyPatch',
          requestedInput: { diff: validDiff },
        },
        testUserId,
      );

      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          approvalRequestId: approval.id,
          title: 'Reject patch test',
          description: 'Testing rejection synchronization',
          originalDiff: validDiff,
        },
        testUserId,
      );

      await fileReviewService.rejectReview(
        { projectId: testProjectId, reviewId: review.id, reason: 'Patch rejected by operator' },
        testUserId,
      );

      const updatedApproval = await approvalService.getRequest(
        { projectId: testProjectId, approvalId: approval.id },
        testUserId,
      );
      assert.ok(updatedApproval);
      assert.equal(updatedApproval.status, 'REJECTED');
    });
  });

  // ============================================================================
  // 4. Apply Integration via V7 PatchApplicator
  // ============================================================================
  describe('4. Apply Integration via V7 PatchApplicator', () => {
    const validDiff =
      '--- a/calculator.ts\n+++ b/calculator.ts\n@@ -2,1 +2,1 @@\n-  return a - b;\n+  return a + b;\n';

    it('applies approved patch atomically to project workspace files and marks APPLIED', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Apply patch to calculator.ts',
          description: 'Change minus to plus',
          originalDiff: validDiff,
        },
        testUserId,
      );

      // 1. Approve
      await fileReviewService.approveReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );

      // 2. Apply
      const result = await fileReviewService.applyReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );

      assert.equal(result.status, 'APPLIED');
      assert.equal(result.filesModifiedCount, 1);
      assert.deepEqual(result.affectedFiles, ['calculator.ts']);
      assert.equal(result.linesAdded, 1);
      assert.equal(result.linesRemoved, 1);
      assert.ok(result.appliedCommit);

      // Verify file on disk was modified correctly
      const updatedDiskContent = fs.readFileSync(
        path.join(tempWorkspaceDir, 'calculator.ts'),
        'utf8',
      );
      assert.equal(
        updatedDiskContent,
        'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
      );

      // Verify review record is in APPLIED state
      const fetched = await fileReviewService.getReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );
      assert.ok(fetched);
      assert.equal(fetched.status, 'APPLIED');
      assert.ok(fetched.appliedAt);
      assert.ok(fetched.appliedCommit);
    });

    it('rejects double-apply with FileReviewAlreadyAppliedError', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Double apply test',
          description: 'Apply twice',
          originalDiff: validDiff,
        },
        testUserId,
      );

      await fileReviewService.approveReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );
      await fileReviewService.applyReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );

      // Second apply attempt
      await assert.rejects(
        fileReviewService.applyReview(
          { projectId: testProjectId, reviewId: review.id },
          testUserId,
        ),
        (err: any) => err instanceof FileReviewAlreadyAppliedError,
      );
    });

    it('detects tampered original proposal diff and rejects with FileReviewChecksumMismatchError', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Tamper test',
          description: 'Tampered diff',
          originalDiff: validDiff,
        },
        testUserId,
      );

      await fileReviewService.approveReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );

      // Simulate malicious tampering of originalDiff in the database record
      const dbRecord = mockReviews.find(r => r.id === review.id);
      dbRecord.originalDiff =
        '--- a/calculator.ts\n+++ b/calculator.ts\n@@ -2,1 +2,1 @@\n-  return a - b;\n+  maliciousCode();\n';

      await assert.rejects(
        fileReviewService.applyReview(
          { projectId: testProjectId, reviewId: review.id },
          testUserId,
        ),
        (err: any) =>
          err instanceof FileReviewChecksumMismatchError &&
          err.code === 'FILE_REVIEW_CHECKSUM_MISMATCH',
      );
    });

    it('fails safely and throws FileReviewApplyFailedError if workspace file does not match hunk', async () => {
      const mismatchedDiff =
        '--- a/calculator.ts\n+++ b/calculator.ts\n@@ -10,1 +10,1 @@\n-  nonExistentLine();\n+  newLine();\n';

      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Conflict test',
          description: 'Mismatched hunk lines',
          originalDiff: mismatchedDiff,
        },
        testUserId,
      );

      await fileReviewService.approveReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );

      await assert.rejects(
        fileReviewService.applyReview(
          { projectId: testProjectId, reviewId: review.id },
          testUserId,
        ),
        (err: any) => err instanceof FileReviewApplyFailedError,
      );
    });
  });

  // ============================================================================
  // 5. Safe Read-Only Project File Inspection
  // ============================================================================
  describe('5. Safe Read-Only Project File Inspection', () => {
    it('safely reads project file and returns metadata and non-executed content', async () => {
      const fileData = await fileReviewService.getFileContent(
        {
          projectId: testProjectId,
          filePath: 'calculator.ts',
        },
        testUserId,
      );

      assert.equal(fileData.filePath, 'calculator.ts');
      assert.equal(fileData.language, 'typescript');
      assert.equal(fileData.isBinary, false);
      assert.ok(fileData.sizeBytes > 0);
      assert.ok(fileData.lineCount > 0);
      assert.ok(fileData.content.includes('export function add'));
    });

    it('rejects path traversal using .. with FileReviewPathTraversalError', async () => {
      await assert.rejects(
        fileReviewService.getFileContent(
          {
            projectId: testProjectId,
            filePath: '../etc/passwd',
          },
          testUserId,
        ),
        (err: any) =>
          err instanceof FileReviewPathTraversalError && err.code === 'FILE_REVIEW_PATH_TRAVERSAL',
      );
    });

    it('rejects URL-encoded path traversal (%2e%2e) with FileReviewPathTraversalError', async () => {
      await assert.rejects(
        fileReviewService.getFileContent(
          {
            projectId: testProjectId,
            filePath: '%2e%2e/secret.env',
          },
          testUserId,
        ),
        (err: any) => err instanceof FileReviewPathTraversalError,
      );
    });

    it('rejects paths containing null byte with FileReviewPathTraversalError', async () => {
      await assert.rejects(
        fileReviewService.getFileContent(
          {
            projectId: testProjectId,
            filePath: 'calculator.ts\0.txt',
          },
          testUserId,
        ),
        (err: any) => err instanceof FileReviewPathTraversalError,
      );
    });

    it('rejects absolute paths with FileReviewPathTraversalError', async () => {
      await assert.rejects(
        fileReviewService.getFileContent(
          {
            projectId: testProjectId,
            filePath: '/etc/hosts',
          },
          testUserId,
        ),
        (err: any) => err instanceof FileReviewPathTraversalError,
      );
    });

    it('rejects non-existent file with FileReviewFileNotFoundError', async () => {
      await assert.rejects(
        fileReviewService.getFileContent(
          {
            projectId: testProjectId,
            filePath: 'does-not-exist.ts',
          },
          testUserId,
        ),
        (err: any) =>
          err instanceof FileReviewFileNotFoundError && err.code === 'FILE_REVIEW_FILE_NOT_FOUND',
      );
    });

    it('detects binary file and omits executable bytes', async () => {
      const binaryPath = path.join(tempWorkspaceDir, 'image.png');
      fs.writeFileSync(binaryPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]));

      const fileData = await fileReviewService.getFileContent(
        {
          projectId: testProjectId,
          filePath: 'image.png',
        },
        testUserId,
      );

      assert.equal(fileData.isBinary, true);
      assert.equal(fileData.lineCount, 0);
      assert.ok(fileData.content.includes('[Binary file content omitted]'));
    });

    it('correctly maps file extensions to language names', () => {
      assert.equal(detectFileLanguage('main.ts'), 'typescript');
      assert.equal(detectFileLanguage('App.tsx'), 'typescriptreact');
      assert.equal(detectFileLanguage('index.js'), 'javascript');
      assert.equal(detectFileLanguage('package.json'), 'json');
      assert.equal(detectFileLanguage('script.py'), 'python');
      assert.equal(detectFileLanguage('main.go'), 'go');
      assert.equal(detectFileLanguage('styles.css'), 'css');
      assert.equal(detectFileLanguage('doc.md'), 'markdown');
      assert.equal(detectFileLanguage('Dockerfile'), 'dockerfile');
      assert.equal(detectFileLanguage('unknown.xyz'), 'plaintext');
    });
  });

  // ============================================================================
  // 6. Security, Multi-Tenant Isolation & Secret Redaction
  // ============================================================================
  describe('6. Security & Multi-Tenant Isolation', () => {
    const validDiff =
      '--- a/calculator.ts\n+++ b/calculator.ts\n@@ -2,1 +2,1 @@\n-  return a - b;\n+  return a + b;\n';

    it('rejects cross-user access to project reviews with FileReviewUnauthorizedError', async () => {
      await assert.rejects(
        fileReviewService.createReview(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: testTaskId,
            title: 'Unauthorized user test',
            description: 'Should fail',
            originalDiff: validDiff,
          },
          otherUserId,
        ),
        (err: any) =>
          err instanceof FileReviewUnauthorizedError && err.code === 'FILE_REVIEW_UNAUTHORIZED',
      );
    });

    it('rejects task from different project with FileReviewUnauthorizedError', async () => {
      await assert.rejects(
        fileReviewService.createReview(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: otherTaskId,
            title: 'Cross project task test',
            description: 'Should fail',
            originalDiff: validDiff,
          },
          testUserId,
        ),
        (err: any) => err instanceof FileReviewUnauthorizedError,
      );
    });

    it('redacts sensitive secrets from original proposal diff', async () => {
      const secretDiff =
        '--- a/config.json\n+++ b/config.json\n@@ -2,1 +2,1 @@\n-  "api_key": "old-val"\n+  "api_key": "AKIAIOSFODNN7EXAMPLE"\n';

      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Secret test',
          description: 'Testing secret redaction',
          originalDiff: secretDiff,
        },
        testUserId,
      );

      assert.ok(!review.originalDiff.includes('AKIAIOSFODNN7EXAMPLE'));
      assert.ok(review.originalDiff.includes('[REDACTED'));
    });

    it('redacts sensitive secrets from inspected project files', async () => {
      fs.writeFileSync(
        path.join(tempWorkspaceDir, 'secrets.env'),
        'API_KEY=ghp_ABC1234567890abcdefghijklmnopqrstuvwxyz\n',
      );

      const fileData = await fileReviewService.getFileContent(
        {
          projectId: testProjectId,
          filePath: 'secrets.env',
        },
        testUserId,
      );

      assert.ok(!fileData.content.includes('ghp_ABC1234567890abcdefghijklmnopqrstuvwxyz'));
      assert.ok(fileData.content.includes('[REDACTED'));
    });
  });

  // ============================================================================
  // 7. Concurrency & Race Condition Protection
  // ============================================================================
  describe('7. Concurrency Protection', () => {
    const validDiff =
      '--- a/calculator.ts\n+++ b/calculator.ts\n@@ -2,1 +2,1 @@\n-  return a - b;\n+  return a + b;\n';

    it('handles simultaneous approvals atomically: only one succeeds', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Concurrent approve test',
          description: 'Simultaneous calls',
          originalDiff: validDiff,
        },
        testUserId,
      );

      const [res1, res2] = await Promise.allSettled([
        fileReviewService.approveReview(
          { projectId: testProjectId, reviewId: review.id, reason: 'First' },
          testUserId,
        ),
        fileReviewService.approveReview(
          { projectId: testProjectId, reviewId: review.id, reason: 'Second' },
          testUserId,
        ),
      ]);

      const successes = [res1, res2].filter(r => r.status === 'fulfilled');
      const rejections = [res1, res2].filter(r => r.status === 'rejected');

      assert.equal(successes.length, 1);
      assert.equal(rejections.length, 1);
      assert.ok(
        (rejections[0] as PromiseRejectedResult).reason instanceof FileReviewAlreadyDecidedError,
      );
    });

    it('handles approve vs reject race: exactly one decision records', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Approve vs reject race',
          description: 'Simultaneous opposing decisions',
          originalDiff: validDiff,
        },
        testUserId,
      );

      const [res1, res2] = await Promise.allSettled([
        fileReviewService.approveReview(
          { projectId: testProjectId, reviewId: review.id },
          testUserId,
        ),
        fileReviewService.rejectReview(
          { projectId: testProjectId, reviewId: review.id },
          testUserId,
        ),
      ]);

      const successes = [res1, res2].filter(r => r.status === 'fulfilled');
      const rejections = [res1, res2].filter(r => r.status === 'rejected');

      assert.equal(successes.length, 1);
      assert.equal(rejections.length, 1);
    });
  });

  // ============================================================================
  // 8. Restart & Recovery
  // ============================================================================
  describe('8. Restart & Recovery Scenarios', () => {
    const validDiff =
      '--- a/calculator.ts\n+++ b/calculator.ts\n@@ -2,1 +2,1 @@\n-  return a - b;\n+  return a + b;\n';

    it('restores pending review state across simulated app restart without auto-applying', async () => {
      const review = await fileReviewService.createReview(
        {
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          title: 'Restart recovery review',
          description: 'Pending state must survive',
          originalDiff: validDiff,
        },
        testUserId,
      );

      // Simulate service restart by instantiating new service instances with same DB state
      const restoredApprovalService = new ApprovalService({ prisma: mockPrisma });
      const restoredFileReviewService = new FileReviewService({
        prisma: mockPrisma,
        approvalService: restoredApprovalService,
      });

      const fetched = await restoredFileReviewService.getReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );

      assert.ok(fetched);
      assert.equal(fetched.status, 'PENDING_REVIEW');
      assert.equal(fetched.diffChecksum, review.diffChecksum);

      // Now approve and apply using restored service
      await restoredFileReviewService.approveReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );

      const applyRes = await restoredFileReviewService.applyReview(
        { projectId: testProjectId, reviewId: review.id },
        testUserId,
      );
      assert.equal(applyRes.status, 'APPLIED');
    });
  });
});
