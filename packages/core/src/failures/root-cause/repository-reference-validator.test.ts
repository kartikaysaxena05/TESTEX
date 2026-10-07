/**
 * @file packages/core/src/failures/root-cause/repository-reference-validator.test.ts
 * Unit tests for strict anti-hallucination repository reference validation (Phase 83).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RepositoryReferenceValidator,
  type RepositoryFileRecord,
  type ProposedRepositoryReference,
} from './repository-reference-validator.js';
import { ROOT_CAUSE_BOUNDS } from './root-cause-types.js';

describe('RepositoryReferenceValidator (Phase 83)', () => {
  const validator = new RepositoryReferenceValidator();

  const mockRepoFiles: readonly RepositoryFileRecord[] = [
    {
      id: 'file-uuid-1',
      relativePath: 'src/api/auth.ts',
      symbols: [
        {
          id: 'sym-uuid-1',
          name: 'loginHandler',
          kind: 'FUNCTION',
          startLine: 25,
          endLine: 60,
        },
        {
          id: 'sym-uuid-2',
          name: 'verifyPassword',
          kind: 'METHOD',
          startLine: 70,
          endLine: 85,
        },
      ],
    },
    {
      id: 'file-uuid-2',
      relativePath: 'src/services/userService.ts',
      symbols: [
        {
          id: 'sym-uuid-3',
          name: 'findUserByEmail',
          kind: 'METHOD',
          startLine: 10,
          endLine: 30,
        },
      ],
    },
  ];

  it('rejects all references when repository context is unavailable (no repo files)', () => {
    const proposed: ProposedRepositoryReference[] = [
      { filePath: 'src/api/auth.ts', symbolName: 'loginHandler', relevance: 'Handles login' },
      { filePath: 'src/utils/crypto.ts', relevance: 'Crypto utility' },
    ];

    const result = validator.validateReferences(proposed, []);
    assert.equal(result.validatedReferences.length, 0);
    assert.equal(result.omittedHallucinationsCount, 2);
    assert.ok(result.rejectionReasons[0]?.includes('no connected repository context'));
  });

  it('verifies valid file and exact symbol match', () => {
    const proposed: ProposedRepositoryReference[] = [
      {
        filePath: 'src/api/auth.ts',
        symbolName: 'loginHandler',
        relevance: 'Primary authentication endpoint handler',
      },
    ];

    const result = validator.validateReferences(proposed, mockRepoFiles);
    assert.equal(result.validatedReferences.length, 1);
    assert.equal(result.omittedHallucinationsCount, 0);

    const ref = result.validatedReferences[0]!;
    assert.equal(ref.fileId, 'file-uuid-1');
    assert.equal(ref.filePath, 'src/api/auth.ts');
    assert.equal(ref.symbolId, 'sym-uuid-1');
    assert.equal(ref.symbolName, 'loginHandler');
    assert.equal(ref.symbolKind, 'FUNCTION');
    assert.equal(ref.startLine, 25);
    assert.equal(ref.endLine, 60);
  });

  it('normalizes leading slashes, dot-slashes, and backslashes', () => {
    const proposed: ProposedRepositoryReference[] = [
      {
        filePath: '.\\src\\services\\userService.ts',
        symbolName: 'findUserByEmail',
        relevance: 'User lookup',
      },
    ];

    const result = validator.validateReferences(proposed, mockRepoFiles);
    assert.equal(result.validatedReferences.length, 1);
    assert.equal(result.validatedReferences[0]?.fileId, 'file-uuid-2');
    assert.equal(result.validatedReferences[0]?.symbolId, 'sym-uuid-3');
  });

  it('strictly rejects hallucinated files not present in database records', () => {
    const proposed: ProposedRepositoryReference[] = [
      {
        filePath: 'src/fabricated/phantomService.ts',
        symbolName: 'phantomMethod',
        relevance: 'Speculative cause',
      },
      {
        filePath: 'src/api/auth.ts',
        relevance: 'Verified file',
      },
    ];

    const result = validator.validateReferences(proposed, mockRepoFiles);
    assert.equal(result.validatedReferences.length, 1);
    assert.equal(result.omittedHallucinationsCount, 1);
    assert.equal(result.validatedReferences[0]?.filePath, 'src/api/auth.ts');
    assert.ok(result.rejectionReasons.some(r => r.includes('phantomService.ts')));
  });

  it('degrades to file-level reference when symbol does not exist in verified file', () => {
    const proposed: ProposedRepositoryReference[] = [
      {
        filePath: 'src/api/auth.ts',
        symbolName: 'hallucinatedNonExistentFunction',
        relevance: 'Function that does not exist in file',
      },
    ];

    const result = validator.validateReferences(proposed, mockRepoFiles);
    assert.equal(result.validatedReferences.length, 1);
    assert.equal(result.omittedHallucinationsCount, 0);

    const ref = result.validatedReferences[0]!;
    assert.equal(ref.fileId, 'file-uuid-1');
    assert.equal(ref.filePath, 'src/api/auth.ts');
    assert.equal(ref.symbolId, undefined);
    assert.equal(ref.symbolName, undefined);
    assert.ok(result.rejectionReasons.some(r => r.includes('hallucinatedNonExistentFunction')));
  });

  it('caps validated references to MAX_REPOSITORY_REFERENCES', () => {
    const manyProposed: ProposedRepositoryReference[] = Array.from({ length: 25 }, (_, i) => ({
      filePath: 'src/api/auth.ts',
      relevance: `Ref ${i}`,
    }));

    const result = validator.validateReferences(manyProposed, mockRepoFiles);
    assert.equal(result.validatedReferences.length, ROOT_CAUSE_BOUNDS.MAX_REPOSITORY_REFERENCES);
  });
});
