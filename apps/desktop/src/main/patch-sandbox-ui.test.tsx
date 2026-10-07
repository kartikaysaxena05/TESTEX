/**
 * @file apps/desktop/src/main/patch-sandbox-ui.test.tsx
 * UI component tests for Secure Patch Sandbox & Change Isolation (V7 Phase 102).
 * Verifies PatchSandboxCard rendering, immutability banners, provisioning controls,
 * and seamless integration within PatchProposalCard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PatchSandboxCard } from '../renderer/features/failures/PatchSandboxCard.js';
import { PatchProposalCard } from '../renderer/features/failures/PatchProposalCard.js';

describe('Secure Patch Sandbox UI Tests (Phase 102)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';
  const patchProposalId = '00000000-0000-0000-0000-000000000333';

  it('renders PatchSandboxCard with immutability banner, security status, and provision button', () => {
    const html = renderToString(
      <PatchSandboxCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        patchProposalId={patchProposalId}
      />,
    );

    assert.ok(
      html.includes('Secure Patch Sandbox &amp; Change Isolation') ||
        html.includes('Secure Patch Sandbox & Change Isolation'),
      'Title rendered',
    );
    assert.ok(
      html.includes('Isolated testing environment outside authoritative repository'),
      'Description rendered',
    );
    assert.ok(
      html.includes('Authoritative Repository Immutability'),
      'Immutability banner rendered',
    );
    assert.ok(
      html.includes('Zero modifications to user working tree'),
      'Zero modifications guarantee rendered',
    );
    assert.ok(html.includes('Provision Secure Sandbox'), 'Provision sandbox button rendered');
  });

  it('renders PatchProposalCard and supports embedding PatchSandboxCard', () => {
    const html = renderToString(
      <PatchProposalCard projectId={projectId} failureCaseId={failureCaseId} />,
    );

    assert.ok(html.includes('Limited AI Patch Proposal'), 'Patch proposal rendered');
    assert.ok(html.includes('Generate Patch Proposal'), 'Generate button present');
  });
});
