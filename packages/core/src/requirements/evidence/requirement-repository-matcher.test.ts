/**
 * @file packages/core/src/requirements/evidence/requirement-repository-matcher.test.ts
 * Unit tests for RequirementRepositoryMatcher scoring, tokenization, and deterministic candidate selection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequirementRepositoryMatcher } from './requirement-repository-matcher.js';
import type { MatcherRequirementInput, IndexedEntityForMatching } from './evidence-types.js';

describe('RequirementRepositoryMatcher', () => {
  const requirement: MatcherRequirementInput = {
    id: '11111111-1111-1111-1111-111111111111',
    requirementKey: 'REQ-101',
    title: 'User Password Reset Service',
    originalText:
      'The system shall allow users to reset their forgotten passwords via email token.',
    sha256: 'sha-req-101',
    actor: 'User',
    action: 'reset',
    object: 'password',
    domain: 'Authentication',
    module: 'Security',
    tags: ['auth', 'security', 'password-reset'],
  };

  const indexedEntities: readonly IndexedEntityForMatching[] = [
    {
      fileId: 'file-1',
      relativePath: 'src/services/password-reset.service.ts',
      language: 'TypeScript',
      classification: 'SERVICE',
      contentHash: 'hash-file-1',
      symbols: [
        {
          id: 'sym-1',
          name: 'PasswordResetService',
          kind: 'CLASS',
          startLine: 10,
          endLine: 80,
          isExported: true,
        },
        {
          id: 'sym-2',
          name: 'sendPasswordResetEmail',
          kind: 'METHOD',
          startLine: 25,
          endLine: 45,
          isExported: true,
        },
      ],
    },
    {
      fileId: 'file-2',
      relativePath: 'src/routes/auth.routes.ts',
      language: 'TypeScript',
      classification: 'ROUTE',
      contentHash: 'hash-file-2',
      symbols: [
        {
          id: 'sym-3',
          name: 'POST /api/v1/auth/password-reset',
          kind: 'FUNCTION',
          startLine: 15,
          endLine: 35,
          isExported: true,
        },
      ],
    },
    {
      fileId: 'file-3',
      relativePath: 'src/models/user.model.ts',
      language: 'TypeScript',
      classification: 'DATABASE',
      contentHash: 'hash-file-3',
      symbols: [
        {
          id: 'sym-4',
          name: 'UserModel',
          kind: 'CLASS',
          startLine: 1,
          endLine: 50,
          isExported: true,
        },
      ],
    },
    {
      fileId: 'file-4',
      relativePath: 'src/utils/math-calculator.ts',
      language: 'TypeScript',
      classification: 'UTILITY',
      contentHash: 'hash-file-4',
      symbols: [
        {
          id: 'sym-5',
          name: 'calculateGeometry',
          kind: 'FUNCTION',
          startLine: 1,
          endLine: 20,
          isExported: false,
        },
      ],
    },
  ];

  it('tokenizes text correctly with camelCase, kebab-case, and stopword removal', () => {
    const tokens = RequirementRepositoryMatcher.extractTokens(
      'PasswordResetService and send_password_reset_email for the user!',
    );

    assert.ok(tokens.includes('password'));
    assert.ok(tokens.includes('reset'));
    assert.ok(tokens.includes('service'));
    assert.ok(tokens.includes('send'));
    assert.ok(tokens.includes('email'));
    // Stopwords removed
    assert.ok(!tokens.includes('and'));
    assert.ok(!tokens.includes('for'));
    assert.ok(!tokens.includes('the'));
  });

  it('matches service file and symbols with high score (>= 7)', () => {
    const candidates = RequirementRepositoryMatcher.matchRequirement(
      requirement,
      'proj-1',
      'source-1',
      'snap-1',
      indexedEntities,
    );

    assert.ok(candidates.length > 0);

    const serviceSymbol = candidates.find(c => c.symbolName === 'PasswordResetService');
    assert.ok(serviceSymbol);
    assert.ok(serviceSymbol!.evidenceScore >= 7);
    assert.strictEqual(serviceSymbol?.evidenceType, 'SERVICE');
    assert.ok(serviceSymbol?.reasonCodes.includes('EXACT_SYMBOL_NAME'));
  });

  it('matches route endpoint symbol and assigns ROUTE_TOKEN_MATCH', () => {
    const candidates = RequirementRepositoryMatcher.matchRequirement(
      requirement,
      'proj-1',
      'source-1',
      'snap-1',
      indexedEntities,
    );

    const routeEvidence = candidates.find(c => c.symbolName?.includes('password-reset'));
    assert.ok(routeEvidence);
    assert.ok(routeEvidence?.reasonCodes.includes('ROUTE_TOKEN_MATCH'));
  });

  it('filters out completely unrelated files with score below threshold', () => {
    const candidates = RequirementRepositoryMatcher.matchRequirement(
      requirement,
      'proj-1',
      'source-1',
      'snap-1',
      indexedEntities,
    );

    const mathUtil = candidates.find(c => c.filePath.includes('math-calculator'));
    assert.strictEqual(mathUtil, undefined);
  });

  it('sorts candidates deterministically by score descending, then filePath ascending', () => {
    const candidates = RequirementRepositoryMatcher.matchRequirement(
      requirement,
      'proj-1',
      'source-1',
      'snap-1',
      indexedEntities,
    );

    for (let i = 1; i < candidates.length; i++) {
      const prev = candidates[i - 1]!;
      const curr = candidates[i]!;
      if (prev.evidenceScore === curr.evidenceScore) {
        assert.ok(prev.filePath.localeCompare(curr.filePath) <= 0);
      } else {
        assert.ok(prev.evidenceScore >= curr.evidenceScore);
      }
    }
  });

  it('caps candidates to a maximum of 20 results', () => {
    const manyEntities: IndexedEntityForMatching[] = Array.from({ length: 30 }, (_, i) => ({
      fileId: `file-${i}`,
      relativePath: `src/services/password-reset-${i}.ts`,
      language: 'TypeScript',
      classification: 'SERVICE',
      contentHash: `hash-${i}`,
      symbols: [
        {
          id: `sym-${i}`,
          name: `PasswordResetService${i}`,
          kind: 'CLASS',
          startLine: 1,
          endLine: 50,
          isExported: true,
        },
      ],
    }));

    const candidates = RequirementRepositoryMatcher.matchRequirement(
      requirement,
      'proj-1',
      'source-1',
      'snap-1',
      manyEntities,
    );

    assert.ok(candidates.length <= 20);
  });
});
