/**
 * @file packages/core/src/failures/localization/repository-route-linker.test.ts
 * Unit tests for RepositoryRouteLinker (V6 Phase 81).
 */

import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { RepositoryRouteLinker } from './repository-route-linker.js';
import type { TechnicalLocalizationFacts } from './localization-types.js';

function createFactsWithFiles(
  repositoryFiles: TechnicalLocalizationFacts['repositoryFiles'],
): TechnicalLocalizationFacts {
  return {
    projectId: crypto.randomUUID(),
    failureCaseId: crypto.randomUUID(),
    testCaseId: crypto.randomUUID(),
    testCaseTitle: 'Repo Linker Test',
    testRunId: crypto.randomUUID(),
    executionId: crypto.randomUUID(),
    stepIndex: 1,
    domainSeparation: null,
    evidenceItems: [],
    steps: [],
    repositoryFiles,
  };
}

test('RepositoryRouteLinker (Phase 81)', async t => {
  const linker = new RepositoryRouteLinker();

  const fileId1 = crypto.randomUUID();
  const symbolId1 = crypto.randomUUID();
  const fileId2 = crypto.randomUUID();
  const symbolId2 = crypto.randomUUID();

  const mockFiles: TechnicalLocalizationFacts['repositoryFiles'] = [
    {
      id: fileId1,
      relativePath: 'src/api/auth/login.controller.ts',
      name: 'login.controller.ts',
      classification: 'BACKEND_CONTROLLER',
      language: 'typescript',
      symbols: [
        {
          id: symbolId1,
          name: 'handleLogin',
          kind: 'FUNCTION',
          startLine: 15,
          endLine: 45,
        },
      ],
    },
    {
      id: fileId2,
      relativePath: 'src/components/LoginForm.tsx',
      name: 'LoginForm.tsx',
      classification: 'FRONTEND_COMPONENT',
      language: 'typescript',
      symbols: [
        {
          id: symbolId2,
          name: 'LoginForm',
          kind: 'COMPONENT',
          startLine: 10,
          endLine: 80,
        },
      ],
    },
  ];

  await t.test(
    '1. Links API endpoint /api/auth/login to login.controller.ts and handleLogin symbol',
    () => {
      const facts = createFactsWithFiles(mockFiles);
      const result = linker.linkTarget(
        facts,
        'http://localhost:3000/api/auth/login',
        'API_ENDPOINT',
      );

      assert.strictEqual(result.confidence, 'EXACT');
      assert.strictEqual(result.repositoryFileId, fileId1);
      assert.strictEqual(result.repositorySymbolId, symbolId1);
      assert.strictEqual(result.matchedFilePath, 'src/api/auth/login.controller.ts');
      assert.strictEqual(result.matchedSymbolName, 'handleLogin');
      assert.strictEqual(result.matchedLineNumber, 15);
    },
  );

  await t.test('2. Links UI component selector to LoginForm.tsx and LoginForm component', () => {
    const facts = createFactsWithFiles(mockFiles);
    const result = linker.linkTarget(facts, '[data-testid="login-form"]', 'UI_COMPONENT');

    assert.ok(result.confidence === 'EXACT' || result.confidence === 'HIGH');
    assert.strictEqual(result.repositoryFileId, fileId2);
    assert.strictEqual(result.matchedFilePath, 'src/components/LoginForm.tsx');
  });

  await t.test('3. Returns NONE when no repository files match the endpoint', () => {
    const facts = createFactsWithFiles(mockFiles);
    const result = linker.linkTarget(facts, '/api/v1/billing/invoices/999', 'API_ENDPOINT');

    assert.strictEqual(result.confidence, 'NONE');
    assert.strictEqual(result.repositoryFileId, undefined);
    assert.strictEqual(result.repositorySymbolId, undefined);
  });

  await t.test('4. Gracefully handles empty repository files list', () => {
    const facts = createFactsWithFiles([]);
    const result = linker.linkTarget(facts, '/api/v1/auth/login', 'API_ENDPOINT');

    assert.strictEqual(result.confidence, 'NONE');
  });
});
