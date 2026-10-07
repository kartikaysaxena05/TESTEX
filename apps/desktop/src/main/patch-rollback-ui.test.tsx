/**
 * @file apps/desktop/src/main/patch-rollback-ui.test.tsx
 * UI component tests for Patch Rollback & Recovery (V7 Phase 105).
 * Verifies PatchRollbackCard rendering, safety notices, and integration within PatchApprovalCard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PatchRollbackCard } from '../renderer/features/failures/PatchRollbackCard.js';
import { PatchApprovalCard } from '../renderer/features/failures/PatchApprovalCard.js';
import type { DefectPatchApprovalDto } from '@ai-quality/contracts';

describe('Patch Rollback UI Tests (Phase 105)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';
  const patchProposalId = '00000000-0000-0000-0000-000000000333';
  const approvalId = '00000000-0000-0000-0000-000000000444';

  const appliedApproval: DefectPatchApprovalDto = {
    id: approvalId,
    projectId,
    failureCaseId,
    patchProposalId,
    validationId: '00000000-0000-0000-0000-000000000555',
    repositoryId: null,
    status: 'APPLIED',
    reviewedPatchHash: 'hash12345678',
    appliedPatchHash: 'hash12345678',
    baseRevision: 'base123',
    appliedRevision: 'base123',
    reviewedBy: 'HUMAN_REVIEWER',
    reviewedAt: new Date().toISOString(),
    reviewComment: 'Approved',
    rejectionReason: null,
    rejectionDetails: null,
    applyRequestedAt: new Date().toISOString(),
    applyStartedAt: new Date().toISOString(),
    appliedAt: new Date().toISOString(),
    appliedBy: 'HUMAN_REVIEWER',
    applyError: null,
    applyErrorCategory: null,
    affectedFiles: ['src/math.ts'],
    filesModifiedCount: 1,
    linesAdded: 1,
    linesRemoved: 1,
    appliedUnifiedDiff: '@@ -1,1 +1,1 @@\n',
    auditTrail: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('renders PatchRollbackCard with action buttons and safety description for applied patch', () => {
    const html = renderToString(
      <PatchRollbackCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        approval={appliedApproval}
      />,
    );

    assert.ok(
      html.includes('Patch Rollback &amp; Recovery Engine') ||
        html.includes('Patch Rollback & Recovery Engine'),
      'Phase 105 header rendered',
    );
    assert.ok(html.includes('Phase 105'), 'Phase 105 badge rendered');
    assert.ok(
      html.includes('Dry-Run &amp; Conflict Check') ||
        html.includes('Dry-Run & Conflict Check'),
      'Dry-run button rendered',
    );
    assert.ok(html.includes('Execute Rollback'), 'Execute Rollback button rendered');
    assert.ok(
      html.includes('Restores patch lines to baseline while preserving independent user edits'),
      'Safety preservation description rendered',
    );
  });

  it('renders PatchApprovalCard with initial waiting state', () => {
    const html = renderToString(
      <PatchApprovalCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        patchProposalId={patchProposalId}
      />,
    );

    assert.ok(html.includes('Phase 104'), 'Phase 104 header rendered');
  });
});
