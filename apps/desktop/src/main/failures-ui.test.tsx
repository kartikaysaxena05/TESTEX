/**
 * @file apps/desktop/src/main/failures-ui.test.tsx
 * Unit tests for Failure Intelligence UI components (V6 Phase 74).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { FailureCasesListView } from '../renderer/features/failures/FailureCasesListView.js';
import { DefectsScreen } from '../renderer/screens/DefectsScreen.js';
import { ProjectProvider } from '../renderer/context/ProjectContext.js';

describe('Failure Intelligence UI Component Tests (V6 Phase 74)', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        failures: {
          listCases: async () => ({
            ok: true,
            data: {
              items: [],
              total: 0,
              page: 1,
              pageSize: 50,
              totalPages: 1,
            },
          }),
          getCase: async () => ({ ok: true, data: {} }),
          listRuns: async () => ({ ok: true, data: [] }),
          listEvidenceReferences: async () => ({ ok: true, data: [] }),
        },
      },
    };
  });

  it('renders FailureCasesListView in initial loading state', () => {
    const html = renderToString(<FailureCasesListView projectId="proj-1111-2222" />);

    assert.ok(html.includes('data-testid="failure-cases-loading"'));
    assert.ok(html.includes('Loading failure intelligence cases'));
  });

  it('renders DefectsScreen with No Project Selected when empty', () => {
    const html = renderToString(
      <ProjectProvider>
        <DefectsScreen />
      </ProjectProvider>,
    );

    assert.ok(html.includes('No Project Selected'));
  });
});
