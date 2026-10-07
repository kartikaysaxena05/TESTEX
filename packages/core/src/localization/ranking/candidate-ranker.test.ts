/**
 * @file packages/core/src/localization/ranking/candidate-ranker.test.ts
 * Tests for CandidateValidator and CandidateRanker.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateValidator } from './candidate-validator.js';
import { CandidateRanker } from './candidate-ranker.js';
import { DefectLocalizationPathTraversalError } from '../defect-localization-errors.js';
import type { LocalizationContext, RawCandidateFact } from '../defect-localization-types.js';

function createMockContext(overrides: Partial<LocalizationContext> = {}): LocalizationContext {
  return {
    projectId: '11111111-1111-1111-1111-111111111111',
    failureCaseId: '22222222-2222-2222-2222-222222222222',
    repositoryId: '33333333-3333-3333-3333-333333333333',
    workspaceRoot: null,
    branchName: 'main',
    headCommit: 'abcdef1234567890',
    failureTimeCommit: 'abcdef1234567890',
    revisionState: 'EXACT_REVISION',
    isDrifted: false,
    driftDetails: null,
    failureCase: {
      id: '22222222-2222-2222-2222-222222222222',
      title: 'Auth defect',
      status: 'OPEN',
      testCaseId: '44444444-4444-4444-4444-444444444444',
    },
    networkEvidence: [],
    consoleEvidence: [],
    repositoryFiles: [
      {
        id: 'rf-1',
        relativePath: 'src/auth/login-service.ts',
        name: 'login-service.ts',
        symbols: [
          {
            id: 's-1',
            name: 'authenticateUser',
            kind: 'FUNCTION',
            startLine: 35,
            endLine: 80,
            isExported: true,
          },
        ],
        imports: [],
      },
      {
        id: 'rf-2',
        relativePath: 'src/auth/login-old.ts',
        name: 'login-old.ts',
        symbols: [],
        imports: [],
      },
      {
        id: 'rf-3',
        relativePath: 'src/auth/login-helper.ts',
        name: 'login-helper.ts',
        symbols: [],
        imports: [],
      },
    ],
    ...overrides,
  };
}

describe('CandidateValidator & CandidateRanker (Phase 100)', () => {
  test('CandidateValidator filters out fabricated/hallucinated files not in repository', () => {
    const validator = new CandidateValidator();
    const context = createMockContext();
    const rawFacts: RawCandidateFact[] = [
      {
        filePath: 'src/auth/login-service.ts',
        symbolName: 'authenticateUser',
        candidateType: 'SERVICE',
        signal: 'NETWORK_ENDPOINT',
        strength: 'STRONG',
        description: 'Matches endpoint',
        provenance: 'Network log',
      },
      {
        filePath: 'src/fake/magic-solver.ts', // Non-existent hallucinated file
        symbolName: 'fixAllBugs',
        candidateType: 'FUNCTION',
        signal: 'KEYWORD_SIMILARITY',
        strength: 'WEAK',
        description: 'Hallucinated candidate',
        provenance: 'AI suggestion',
      },
    ];

    const validated = validator.validateCandidateFacts(rawFacts, context);
    assert.equal(validated.length, 1);
    assert.equal(validated[0]!.filePath, 'src/auth/login-service.ts');
    assert.equal(validated[0]!.isSymbolVerified, true);
  });

  test('CandidateValidator rejects path traversal attempts with DefectLocalizationPathTraversalError', () => {
    const validator = new CandidateValidator();
    const context = createMockContext();
    const traversalFacts: RawCandidateFact[] = [
      {
        filePath: '../../etc/passwd',
        candidateType: 'FILE',
        signal: 'KEYWORD_SIMILARITY',
        strength: 'WEAK',
        description: 'Traverse',
        provenance: 'Attack',
      },
    ];

    assert.throws(
      () => validator.validateCandidateFacts(traversalFacts, context),
      DefectLocalizationPathTraversalError,
    );
  });

  test('CandidateValidator redacts sensitive secrets in provenance and descriptions', () => {
    const validator = new CandidateValidator();
    const context = createMockContext();
    const rawFacts: RawCandidateFact[] = [
      {
        filePath: 'src/auth/login-service.ts',
        candidateType: 'SERVICE',
        signal: 'NETWORK_ENDPOINT',
        strength: 'STRONG',
        description: 'Request sent with api_key="sk-proj-supersecretkey1234567890"',
        provenance: 'Bearer token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload"',
      },
    ];

    const validated = validator.validateCandidateFacts(rawFacts, context);
    assert.equal(validated.length, 1);
    assert.ok(!validated[0]!.description.includes('sk-proj-supersecretkey1234567890'));
    assert.ok(validated[0]!.description.includes('[REDACTED_SECRET]'));
    assert.ok(validated[0]!.provenance.includes('[REDACTED_SECRET]'));
  });

  test('CandidateRanker ranks candidate with strong concrete evidence higher than similarly named files', () => {
    const validator = new CandidateValidator();
    const ranker = new CandidateRanker();
    const context = createMockContext();

    const rawFacts: RawCandidateFact[] = [
      // login-old.ts has only weak keyword similarity
      {
        filePath: 'src/auth/login-old.ts',
        candidateType: 'FILE',
        signal: 'KEYWORD_SIMILARITY',
        strength: 'WEAK',
        description: 'Filename contains login',
        provenance: 'Keyword match',
      },
      // login-helper.ts has weak import signal
      {
        filePath: 'src/auth/login-helper.ts',
        candidateType: 'FUNCTION',
        signal: 'SYMBOL_GRAPH_IMPORT',
        strength: 'WEAK',
        description: 'Imported helper',
        provenance: 'AST import',
      },
      // login-service.ts has strong stack trace AND strong network endpoint
      {
        filePath: 'src/auth/login-service.ts',
        symbolName: 'authenticateUser',
        candidateType: 'SERVICE',
        signal: 'STACK_TRACE',
        strength: 'STRONG',
        description: 'Stack frame points to line 42',
        provenance: 'Runtime exception',
      },
      {
        filePath: 'src/auth/login-service.ts',
        symbolName: 'authenticateUser',
        candidateType: 'SERVICE',
        signal: 'NETWORK_ENDPOINT',
        strength: 'STRONG',
        description: 'POST /api/auth/login endpoint',
        provenance: 'Network trace',
      },
    ];

    const validated = validator.validateCandidateFacts(rawFacts, context);
    const result = ranker.rank(validated, context);

    assert.equal(result.rankedCandidates.length, 3);
    assert.equal(result.topCandidate?.filePath, 'src/auth/login-service.ts');
    assert.equal(result.topCandidate?.rank, 1);
    assert.ok(result.topCandidate!.score >= 0.95);
    assert.equal(result.topCandidate?.priorityStatus, 'HIGH_PRIORITY_CANDIDATE');

    // login-old.ts should be lowest rank
    const lowest = result.rankedCandidates[2]!;
    assert.equal(lowest.filePath, 'src/auth/login-old.ts');
    assert.ok(lowest.score < 0.3);
  });

  test('CandidateRanker detects contradicting evidence when presentation file flagged for database failure', () => {
    const ranker = new CandidateRanker();
    const context = createMockContext({
      rootCauseAnalysis: {
        id: 'rca-1',
        rootCauseStatus: 'IDENTIFIED',
        probableLayer: 'DATABASE',
        probableCause: 'Deadlock on users table',
      },
      repositoryFiles: [
        {
          id: 'rf-ui',
          relativePath: 'src/components/LoginForm.tsx',
          name: 'LoginForm.tsx',
          symbols: [],
          imports: [],
        },
      ],
    });

    const validatedFacts: any[] = [
      {
        filePath: 'src/components/LoginForm.tsx',
        candidateType: 'COMPONENT',
        signal: 'DOM_COMPONENT',
        strength: 'MODERATE',
        description: 'UI button clicked',
        provenance: 'DOM click',
        isValidated: true,
        isSymbolVerified: false,
      },
    ];

    const result = ranker.rank(validatedFacts, context);
    assert.equal(result.rankedCandidates.length, 1);
    const candidate = result.rankedCandidates[0]!;
    assert.ok(candidate.contradictingEvidence.length >= 1);
    assert.ok(
      candidate.contradictingEvidence[0]!.description.includes(
        'root-cause confirmed DATABASE failure',
      ),
    );
  });
});
