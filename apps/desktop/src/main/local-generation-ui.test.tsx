/**
 * @file apps/desktop/src/main/local-generation-ui.test.tsx
 * Unit test for LocalGenerationPlaygroundCard UI component (Phase 130).
 * Verifies rendering of generation playground card, controls, prompt input, and buttons.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { LocalGenerationPlaygroundCard } from '../renderer/features/ai/LocalGenerationPlaygroundCard.js';

describe('V9 Phase 130 Local Generation Runtime UI Component Tests', () => {
  it('should render LocalGenerationPlaygroundCard shell and controls correctly', () => {
    const html = renderToString(
      <LocalGenerationPlaygroundCard projectId="11111111-1111-1111-1111-111111111111" />,
    );

    // Assert card header and titles
    assert(html.includes('Local Model Generation Runtime (Phase 130)'));
    assert(
      html.includes(
        'Execute production-ready local AI generation through Ollama with bounded project context',
      ),
    );

    // Assert labels and form controls
    assert(html.includes('Target Model:'));
    assert(html.includes('Auto-resolve default model'));
    assert(html.includes('Advanced Controls:'));
    assert(html.includes('Configure Parameters (Temp, Tokens)'));
    assert(html.includes('User Prompt:'));

    // Assert Generate button
    assert(html.includes('Generate Response'));

    // Assert badges
    assert(html.includes('Ollama:'));
    assert(html.includes('Status:'));
    assert(html.includes('IDLE'));
  });

  it('should render Phase 131 streaming controls and toggle correctly', () => {
    const html = renderToString(
      <LocalGenerationPlaygroundCard projectId="11111111-1111-1111-1111-111111111111" />,
    );

    // Assert Phase 131 streaming toggle
    assert(html.includes('Stream response tokens progressively (Phase 131)'));
    assert(html.includes('type="checkbox"'));
  });

  it('should render Phase 132 structured output controls and toggle correctly', () => {
    const html = renderToString(
      <LocalGenerationPlaygroundCard projectId="11111111-1111-1111-1111-111111111111" />,
    );

    // Assert Phase 132 structured toggle
    assert(html.includes('Enforce validated structured output schema (Phase 132)'));
  });
});



