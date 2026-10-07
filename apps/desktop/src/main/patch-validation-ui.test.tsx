/**
 * @file apps/desktop/src/main/patch-validation-ui.test.tsx
 * UI component tests for Patch Validation & Before/After Testing (V7 Phase 103).
 * Verifies PatchValidationCard rendering, before/after comparison layout,
 * quality gate indicators, and integration within PatchProposalCard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PatchValidationCard } from '../renderer/features/failures/PatchValidationCard.js';
import { PatchProposalCard } from '../renderer/features/failures/PatchProposalCard.js';

describe('Patch Validation UI Tests (Phase 103)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';
  const patchProposalId = '00000000-0000-0000-0000-000000000333';

  it('renders PatchValidationCard with header, description, validation button, and options', () => {
    const html = renderToString(
      <PatchValidationCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        patchProposalId={patchProposalId}
      />,
    );

    assert.ok(
      html.includes('Patch Validation &amp; Before/After Testing') ||
        html.includes('Patch Validation & Before/After Testing'),
      'Title rendered',
    );
    assert.ok(
      html.includes(
        'Deterministic verification across isolated pre-patch baseline and patched sandbox states',
      ),
      'Description rendered',
    );
    assert.ok(html.includes('Validate Patch'), 'Validate Patch button rendered');
    assert.ok(html.includes('Skip Quality Gates'), 'Skip Quality Gates option rendered');
    assert.ok(html.includes('No patch validation executed yet'), 'Empty state rendered');
  });

  it('renders PatchProposalCard with embedded PatchValidationCard', () => {
    const html = renderToString(
      <PatchProposalCard projectId={projectId} failureCaseId={failureCaseId} />,
    );

    assert.ok(html.includes('Limited AI Patch Proposal'), 'Patch proposal rendered');
    assert.ok(html.includes('Generate Patch Proposal'), 'Generate button present');
  });
});
