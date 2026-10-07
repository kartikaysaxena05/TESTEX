/**
 * @file apps/desktop/src/main/approval-ui.test.tsx
 * UI component tests for V10 Phase 155: Human Approval Gates.
 * Verifies HumanApprovalCard and ApprovalHistoryView rendering across all states.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { HumanApprovalCard } from '../renderer/features/agent-approval/HumanApprovalCard.js';
import { ApprovalHistoryView } from '../renderer/features/agent-approval/ApprovalHistoryView.js';
import type { ApprovalRequestDto } from '@ai-quality/contracts';

describe('V10 Phase 155 Human Approval Gates UI Tests', () => {
  const testApprovalId = 'appr-1111-1111-1111-111111111111';
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testTaskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const testThreadId = 'cccccccc-1111-1111-1111-cccccccccccc';

  const samplePendingApproval: ApprovalRequestDto = {
    id: testApprovalId,
    userId: 'user-owner-1111',
    projectId: testProjectId,
    threadId: testThreadId,
    taskId: testTaskId,
    executionStepId: 'step-1',
    approvalType: 'FILE_WRITE',
    title: 'Modify Source Code',
    description: 'Edit auth controller to fix login issue',
    riskLevel: 'HIGH',
    requestedAction: 'file.write',
    requestedInput: { path: 'src/auth/login.ts', content: 'export const login = true;' },
    affectedFiles: ['src/auth/login.ts'],
    affectedTools: ['file.write'],
    status: 'PENDING',
    actionHash: 'hash123456789',
    requestedAt: '2026-10-06T10:00:00.000Z',
    respondedAt: null,
    respondedBy: null,
    expiresAt: '2026-10-07T10:00:00.000Z',
    responseReason: null,
    metadata: {},
    createdAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T10:00:00.000Z',
  };

  const sampleCriticalDeleteApproval: ApprovalRequestDto = {
    id: 'appr-2222',
    userId: 'user-owner-1111',
    projectId: testProjectId,
    threadId: testThreadId,
    taskId: testTaskId,
    executionStepId: 'step-2',
    approvalType: 'FILE_DELETE',
    title: 'Delete Production Database Config',
    description: 'Remove legacy database configuration',
    riskLevel: 'CRITICAL',
    requestedAction: 'file.delete',
    requestedInput: { path: 'config/database.prod.json' },
    affectedFiles: ['config/database.prod.json'],
    affectedTools: ['file.delete'],
    status: 'PENDING',
    actionHash: 'hash-critical-del',
    requestedAt: '2026-10-06T10:05:00.000Z',
    respondedAt: null,
    respondedBy: null,
    expiresAt: '2026-10-07T10:05:00.000Z',
    responseReason: null,
    metadata: {},
    createdAt: '2026-10-06T10:05:00.000Z',
    updatedAt: '2026-10-06T10:05:00.000Z',
  };

  // ---------------------------------------------------------------------------
  // 1. HumanApprovalCard Tests
  // ---------------------------------------------------------------------------
  describe('HumanApprovalCard', () => {
    it('renders pending approval with action title, risk badge, and affected files', () => {
      const html = renderToString(
        <HumanApprovalCard
          approval={samplePendingApproval}
          onApprove={() => {}}
          onReject={() => {}}
          onCancelTask={() => {}}
        />,
      );

      assert.ok(html.includes('Modify Source Code'), 'Displays action title');
      assert.ok(html.includes('HIGH'), 'Displays risk level badge');
      assert.ok(html.includes('file.write'), 'Displays tool name');
      assert.ok(html.includes('src/auth/login.ts'), 'Displays affected file path');
      assert.ok(html.includes('Awaiting approval'), 'Displays pending status label');
      assert.ok(html.includes('Approve'), 'Displays Approve button');
      assert.ok(html.includes('Reject'), 'Displays Reject button');
      assert.ok(html.includes('Cancel Task'), 'Displays Cancel Task button');
    });

    it('renders destructive warning banner for CRITICAL risk or FILE_DELETE actions', () => {
      const html = renderToString(
        <HumanApprovalCard
          approval={sampleCriticalDeleteApproval}
          onApprove={() => {}}
          onReject={() => {}}
          onCancelTask={() => {}}
        />,
      );

      assert.ok(html.includes('CRITICAL'), 'Displays CRITICAL risk badge');
      assert.ok(html.includes('FILE_DELETE'), 'Displays FILE_DELETE approval type');
      assert.ok(html.includes('Destructive Action Warning'), 'Displays destructive action banner');
      assert.ok(
        html.includes('permanently delete files or modify core production data'),
        'Displays destructive warning message',
      );
    });

    it('renders APPROVED status badge cleanly when already approved', () => {
      const approvedItem: ApprovalRequestDto = {
        ...samplePendingApproval,
        status: 'APPROVED',
        respondedBy: 'user-admin',
        respondedAt: '2026-10-06T10:15:00.000Z',
      };

      const html = renderToString(
        <HumanApprovalCard
          approval={approvedItem}
          onApprove={() => {}}
          onReject={() => {}}
        />,
      );

      assert.ok(html.includes('Approved'), 'Displays Approved status badge');
      assert.ok(!html.includes('Cancel Task'), 'Does not show pending action buttons when decided');
    });

    it('renders REJECTED status badge with rejection reason', () => {
      const rejectedItem: ApprovalRequestDto = {
        ...samplePendingApproval,
        status: 'REJECTED',
        respondedBy: 'user-admin',
        respondedAt: '2026-10-06T10:15:00.000Z',
        responseReason: 'Security violation: raw credential modified',
      };

      const html = renderToString(
        <HumanApprovalCard
          approval={rejectedItem}
          onApprove={() => {}}
          onReject={() => {}}
        />,
      );

      assert.ok(html.includes('Rejected'), 'Displays Rejected status badge');
      assert.ok(html.includes('Security violation'), 'Displays rejection reason in card');
    });

    it('renders EXPIRED and CANCELLED status badges', () => {
      const expiredHtml = renderToString(
        <HumanApprovalCard
          approval={{ ...samplePendingApproval, status: 'EXPIRED' }}
          onApprove={() => {}}
          onReject={() => {}}
        />,
      );
      assert.ok(expiredHtml.includes('Expired'), 'Displays Expired status');

      const cancelledHtml = renderToString(
        <HumanApprovalCard
          approval={{ ...samplePendingApproval, status: 'CANCELLED' }}
          onApprove={() => {}}
          onReject={() => {}}
        />,
      );
      assert.ok(cancelledHtml.includes('Cancelled'), 'Displays Cancelled status');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ApprovalHistoryView Tests
  // ---------------------------------------------------------------------------
  describe('ApprovalHistoryView', () => {
    it('renders loading state when isLoading is true', () => {
      const html = renderToString(<ApprovalHistoryView history={[]} isLoading={true} />);
      assert.ok(html.includes('Loading approval history...'), 'Shows loading indicator');
    });

    it('renders empty state when history is empty', () => {
      const html = renderToString(<ApprovalHistoryView history={[]} isLoading={false} />);
      assert.ok(html.includes('No Approval History'), 'Shows empty state title');
      assert.ok(html.includes('No sensitive operations'), 'Shows empty state description');
    });

    it('renders list of immutable approval decisions with details', () => {
      const historyList: ApprovalRequestDto[] = [
        {
          ...samplePendingApproval,
          id: 'appr-1',
          status: 'APPROVED',
          respondedBy: 'reviewer@company.com',
          respondedAt: '2026-10-06T10:20:00.000Z',
        },
        {
          ...sampleCriticalDeleteApproval,
          id: 'appr-2',
          status: 'REJECTED',
          respondedBy: 'lead@company.com',
          respondedAt: '2026-10-06T10:30:00.000Z',
          responseReason: 'Do not delete production config',
        },
      ];

      const html = renderToString(<ApprovalHistoryView history={historyList} />);

      assert.ok(html.includes('Approval Decisions &amp; Audit History (2)'), 'Shows header with count');
      assert.ok(html.includes('Immutable Record'), 'Shows immutable label');
      assert.ok(html.includes('Modify Source Code'), 'Displays item 1 title');
      assert.ok(html.includes('Delete Production Database Config'), 'Displays item 2 title');
      assert.ok(html.includes('APPROVED'), 'Displays APPROVED badge');
      assert.ok(html.includes('REJECTED'), 'Displays REJECTED badge');
      assert.ok(html.includes('reviewer@company.com'), 'Displays item 1 responder');
      assert.ok(html.includes('Do not delete production config'), 'Displays item 2 rejection reason');
    });
  });
});
