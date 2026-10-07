/**
 * @file apps/desktop/src/main/file-review-ui.test.tsx
 * UI component and rendering tests for V10 Phase 156: File & Diff Review Workspace.
 * Verifies DiffViewer, FileViewer, FileReviewWorkspace rendering across states,
 * and diff parsing utilities.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DiffViewer } from '../renderer/features/file-review/DiffViewer.js';
import { FileViewer } from '../renderer/features/file-review/FileViewer.js';
import { FileReviewWorkspace } from '../renderer/features/file-review/FileReviewWorkspace.js';
import {
  parseUnifiedDiffForUi,
  formatFileSize,
} from '../renderer/features/file-review/diff-utils.js';
import type { UseFileReviewResult } from '../renderer/features/file-review/useFileReview.js';
import type { FileDiffReviewDto, FileReviewContentDto } from '@ai-quality/contracts';

describe('V10 Phase 156 File & Diff Review Workspace UI Tests', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testThreadId = 'cccccccc-1111-1111-1111-cccccccccccc';
  const testTaskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const testReviewId = '99999999-9999-9999-9999-999999999999';

  const sampleDiff =
    '--- a/src/calculator.ts\n+++ b/src/calculator.ts\n@@ -1,3 +1,3 @@\n export function add(a: number, b: number): number {\n-  return a - b;\n+  return a + b;\n }\n';

  const multiFileDiff =
    '--- a/src/calculator.ts\n+++ b/src/calculator.ts\n@@ -1,3 +1,3 @@\n-  return a - b;\n+  return a + b;\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -1,2 +1,2 @@\n-export const debug = false;\n+export const debug = true;\n';

  const samplePendingReview: FileDiffReviewDto = {
    id: testReviewId,
    userId: 'user-owner-1111',
    projectId: testProjectId,
    threadId: testThreadId,
    taskId: testTaskId,
    approvalRequestId: 'appr-1234',
    title: 'Fix addition bug in calculator',
    description: 'Autonomous patch proposed to fix bug in add function',
    affectedFiles: ['src/calculator.ts'],
    originalDiff: sampleDiff,
    diffChecksum: 'abc123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
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

  const sampleApprovedReview: FileDiffReviewDto = {
    ...samplePendingReview,
    status: 'APPROVED',
    reviewedBy: 'user-owner-1111',
    reviewedAt: '2026-10-06T10:30:00.000Z',
    decisionReason: 'Verified correctness manually',
  };

  const sampleAppliedReview: FileDiffReviewDto = {
    ...sampleApprovedReview,
    status: 'APPLIED',
    appliedAt: '2026-10-06T10:35:00.000Z',
    appliedCommit: 'review-99999999',
  };

  const sampleRejectedReview: FileDiffReviewDto = {
    ...samplePendingReview,
    status: 'REJECTED',
    reviewedBy: 'user-owner-1111',
    reviewedAt: '2026-10-06T10:40:00.000Z',
    decisionReason: 'Needs different implementation',
  };

  const sampleFileContent: FileReviewContentDto = {
    filePath: 'src/calculator.ts',
    language: 'typescript',
    sizeBytes: 154,
    modifiedAt: '2026-10-06T10:00:00.000Z',
    isBinary: false,
    content: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
    lineCount: 3,
  };

  const createMockHook = (overrides?: Partial<UseFileReviewResult>): UseFileReviewResult => ({
    reviews: [samplePendingReview],
    activeReview: samplePendingReview,
    selectedFile: 'src/calculator.ts',
    viewMode: 'diff',
    fileContent: sampleFileContent,
    isLoading: false,
    isSubmitting: false,
    isFileLoading: false,
    error: null,
    fileError: null,
    setActiveReviewId: () => {},
    setSelectedFile: () => {},
    setViewMode: () => {},
    refreshReviews: async () => {},
    approveReview: async () => true,
    rejectReview: async () => true,
    cancelReview: async () => true,
    applyReview: async () => null,
    ...overrides,
  });

  // ============================================================================
  // 1. Diff Utils
  // ============================================================================
  describe('Diff Parsing & Stats Utilities', () => {
    it('parses unified diff into structured UI file diffs and statistics', () => {
      const files = parseUnifiedDiffForUi(sampleDiff);
      assert.equal(files.length, 1);
      assert.equal(files[0]?.filePath, 'src/calculator.ts');
      assert.equal(files[0]?.linesAdded, 1);
      assert.equal(files[0]?.linesRemoved, 1);
      assert.ok(files[0]?.lines.some(l => l.type === 'removed' && l.content === '  return a - b;'));
      assert.ok(files[0]?.lines.some(l => l.type === 'added' && l.content === '  return a + b;'));
      assert.ok(files[0]?.lines.some(l => l.type === 'context'));
    });

    it('parses multi-file unified diff into multiple UI file diffs', () => {
      const files = parseUnifiedDiffForUi(multiFileDiff);
      assert.equal(files.length, 2);
      assert.equal(files[0]?.filePath, 'src/calculator.ts');
      assert.equal(files[1]?.filePath, 'src/config.ts');
      assert.equal(files[0]?.linesAdded, 1);
      assert.equal(files[1]?.linesAdded, 1);
    });

    it('formats file sizes accurately', () => {
      assert.equal(formatFileSize(512), '512 B');
      assert.equal(formatFileSize(2048), '2.0 KB');
      assert.equal(formatFileSize(2097152), '2.00 MB');
    });
  });

  // ============================================================================
  // 2. DiffViewer Component
  // ============================================================================
  describe('DiffViewer Component', () => {
    it('renders unified diff view with added and deleted lines', () => {
      const html = renderToString(
        <DiffViewer diffText={sampleDiff} selectedFilePath="src/calculator.ts" />,
      );

      assert.ok(html.includes('src/calculator.ts'), 'Displays file path header');
      assert.ok(html.includes('+1'), 'Displays additions counter');
      assert.ok(html.includes('-1'), 'Displays deletions counter');
      assert.ok(html.includes('Unified'), 'Displays Unified mode toggle');
      assert.ok(html.includes('Split'), 'Displays Split mode toggle');
      assert.ok(html.includes('return a - b;'), 'Displays deleted line');
      assert.ok(html.includes('return a + b;'), 'Displays added line');
    });

    it('renders empty notice when diff is blank', () => {
      const html = renderToString(<DiffViewer diffText="" />);
      assert.ok(
        html.includes('No differences or valid patch hunks found'),
        'Displays empty notice',
      );
    });
  });

  // ============================================================================
  // 3. FileViewer Component
  // ============================================================================
  describe('FileViewer Component', () => {
    it('renders read-only project file inspection view', () => {
      const html = renderToString(<FileViewer fileContent={sampleFileContent} />);

      assert.ok(html.includes('src/calculator.ts'), 'Displays inspected file path');
      assert.ok(html.includes('typescript'), 'Displays detected language badge');
      assert.ok(html.includes('154 B'), 'Displays file size badge');
      assert.ok(html.includes('Read-Only'), 'Displays Read-Only badge');
      assert.ok(html.includes('return a + b;'), 'Renders file content');
    });

    it('renders binary file omission notice when isBinary is true', () => {
      const binaryData: FileReviewContentDto = {
        filePath: 'assets/icon.png',
        language: 'plaintext',
        sizeBytes: 4096,
        modifiedAt: '2026-10-06T10:00:00.000Z',
        isBinary: true,
        content: '[Binary file content omitted]',
        lineCount: 0,
      };

      const html = renderToString(<FileViewer fileContent={binaryData} />);

      assert.ok(
        html.includes('Binary file: visual text preview not available'),
        'Displays binary omission notice',
      );
      assert.ok(html.includes('assets/icon.png'), 'Displays file path');
    });

    it('renders loading indicator when isLoading is true', () => {
      const html = renderToString(<FileViewer isLoading={true} />);
      assert.ok(html.includes('Loading file content securely...'), 'Displays loading notice');
    });

    it('renders error notice when error occurs', () => {
      const html = renderToString(<FileViewer error="File not found in project workspace." />);
      assert.ok(html.includes('File not found in project workspace.'), 'Displays error notice');
    });
  });

  // ============================================================================
  // 4. FileReviewWorkspace Component
  // ============================================================================
  describe('FileReviewWorkspace Component', () => {
    it('renders pending review with review controls and checksum badge', () => {
      const mockHook = createMockHook({
        reviews: [samplePendingReview],
        activeReview: samplePendingReview,
      });

      const html = renderToString(
        <FileReviewWorkspace
          projectId={testProjectId}
          threadId={testThreadId}
          taskId={testTaskId}
          hookOverride={mockHook}
        />,
      );

      assert.ok(html.includes('Fix addition bug in calculator'), 'Displays proposal title');
      assert.ok(html.includes('Pending Review'), 'Displays Pending Review badge');
      assert.ok(html.includes('SHA:'), 'Displays SHA checksum label');
      assert.ok(html.includes('abc1234567'), 'Displays diff checksum snippet');
      assert.ok(html.includes('src/calculator.ts'), 'Displays affected file');
      assert.ok(html.includes('Approve Proposed Changes'), 'Displays Approve button');
      assert.ok(html.includes('Reject Changes'), 'Displays Reject button');
      assert.ok(html.includes('Cancel Review'), 'Displays Cancel button');
      assert.ok(
        html.includes('Must approve review before changes can be applied'),
        'Displays pre-approval notice',
      );
    });

    it('renders approved review with Apply Patch to Workspace button enabled', () => {
      const mockHook = createMockHook({
        reviews: [sampleApprovedReview],
        activeReview: sampleApprovedReview,
      });

      const html = renderToString(
        <FileReviewWorkspace
          projectId={testProjectId}
          threadId={testThreadId}
          taskId={testTaskId}
          hookOverride={mockHook}
        />,
      );

      assert.ok(html.includes('Approved'), 'Displays Approved badge');
      assert.ok(html.includes('Verified correctness manually'), 'Displays approval reason');
      assert.ok(
        html.includes('Apply Patch to Workspace'),
        'Displays Apply button for approved review',
      );
    });

    it('renders applied review with applied commit reference and badge', () => {
      const mockHook = createMockHook({
        reviews: [sampleAppliedReview],
        activeReview: sampleAppliedReview,
      });

      const html = renderToString(
        <FileReviewWorkspace
          projectId={testProjectId}
          threadId={testThreadId}
          taskId={testTaskId}
          hookOverride={mockHook}
        />,
      );

      assert.ok(html.includes('Applied'), 'Displays Applied badge');
      assert.ok(html.includes('review-99999999'), 'Displays applied commit reference');
      assert.ok(html.includes('Patch Already Applied'), 'Displays patch applied state banner');
    });

    it('renders rejected review with rejection reason and no apply button', () => {
      const mockHook = createMockHook({
        reviews: [sampleRejectedReview],
        activeReview: sampleRejectedReview,
      });

      const html = renderToString(
        <FileReviewWorkspace
          projectId={testProjectId}
          threadId={testThreadId}
          taskId={testTaskId}
          hookOverride={mockHook}
        />,
      );

      assert.ok(html.includes('Rejected'), 'Displays Rejected badge');
      assert.ok(html.includes('Needs different implementation'), 'Displays rejection reason');
      assert.ok(
        html.includes('Must approve review before changes can be applied'),
        'Pre-approval restriction shown',
      );
    });

    it('renders loading state when reviews are fetching', () => {
      const mockHook = createMockHook({
        isLoading: true,
        reviews: [],
        activeReview: null,
      });

      const html = renderToString(
        <FileReviewWorkspace projectId={testProjectId} hookOverride={mockHook} />,
      );

      assert.ok(html.includes('Loading files...'), 'Displays loading notice');
    });

    it('renders error notice when workspace fails to load reviews', () => {
      const mockHook = createMockHook({
        error: 'Failed to connect to review service.',
        reviews: [],
        activeReview: null,
      });

      const html = renderToString(
        <FileReviewWorkspace projectId={testProjectId} hookOverride={mockHook} />,
      );

      assert.ok(html.includes('Failed to connect to review service.'), 'Displays error banner');
    });
  });
});
