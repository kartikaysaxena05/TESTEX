/**
 * @file apps/desktop/src/main/ai-models-ui.test.tsx
 * Unit test for InstalledModelsCard UI component (Phase 128).
 * Tests rendering of InstalledModelsCard in static and stateful configurations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { InstalledModelsCard } from '../renderer/features/ai/InstalledModelsCard.js';

describe('V9 Phase 128 & Phase 129 Installed AI Models UI Component Tests', () => {
  it('should render InstalledModelsCard static shell correctly', () => {
    const html = renderToString(
      <InstalledModelsCard projectId="11111111-1111-1111-1111-111111111111" />,
    );

    // Assert card header and titles
    assert(html.includes('Installed AI Models &amp; Capabilities'));
    assert(
      html.includes(
        'Discovered local and configured provider models with capability detection and project assignment.',
      ),
    );

    // Assert refresh button and aria-label
    assert(html.includes('Refresh'));
    assert(html.includes('aria-label="Refresh installed models"'));

    // Assert footer notes
    assert(
      html.includes('Discovery cached for 30s. Click Refresh to force reload.'),
    );
  });
});
