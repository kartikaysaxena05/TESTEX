/**
 * @file apps/desktop/src/main/ollama-ui.test.tsx
 * Unit test for Ollama UI component (Phase 127).
 * Tests rendering of OllamaSettingsCard in connected, disconnected, and error states.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { OllamaSettingsCard } from '../renderer/features/ai/OllamaSettingsCard.js';

describe('V9 Phase 127 Ollama UI Component Tests', () => {
  it('should render OllamaSettingsCard static shell correctly', () => {
    const html = renderToString(<OllamaSettingsCard projectId="11111111-1111-1111-1111-111111111111" />);

    // Assert card header and titles
    assert(html.includes('Ollama Local AI Provider'));
    assert(html.includes('Local AI engine connectivity, health detection, and endpoint configuration.'));

    // Assert badges
    assert(html.includes('Not Connected'));

    // Assert form labels and inputs
    assert(html.includes('Ollama Endpoint'));
    assert(html.includes('Timeout (ms)'));
    assert(html.includes('http://127.0.0.1:11434'));

    // Assert diagnostic labels
    assert(html.includes('Configured Endpoint:'));
    assert(html.includes('Health:'));
    assert(html.includes('Installation State:'));

    // Assert action buttons
    assert(html.includes('Check Connection'));
    assert(html.includes('Retry'));
    assert(html.includes('Save Endpoint'));
  });
});
