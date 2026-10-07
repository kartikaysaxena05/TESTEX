/**
 * @file packages/core/src/localization/defect-localization-adversarial.test.ts
 * Adversarial and security boundary tests for V7 Phase 100 Repository-Aware Defect Localization.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CandidateValidator } from './ranking/candidate-validator.js';
import { DefectLocalizationService } from './defect-localization-service.js';
import {
  DefectLocalizationCrossProjectError,
  DefectLocalizationPathTraversalError,
} from './defect-localization-errors.js';
import type { LocalizationContext, RawCandidateFact } from './defect-localization-types.js';

const execFileAsync = promisify(execFile);

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
      title: 'Adversarial defect',
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
    ],
    ...overrides,
  };
}

describe('Defect Localization Adversarial & Security Boundary Tests (Phase 100)', () => {
  test('rejects fabricated / hallucinated candidate files proposed by AI or external caller', () => {
    const validator = new CandidateValidator();
    const context = createMockContext();

    const fabricatedFacts: RawCandidateFact[] = [
      {
        filePath: 'src/magic/ai-suggested-nonexistent-fix.ts',
        symbolName: 'fixVulnerability',
        candidateType: 'FUNCTION',
        signal: 'KEYWORD_SIMILARITY',
        strength: 'WEAK',
        description: 'AI hallucinated candidate',
        provenance: 'AI suggestion',
      },
      {
        filePath: 'src/auth/login-service.ts',
        symbolName: 'nonexistentSymbolInRealFile',
        candidateType: 'FUNCTION',
        signal: 'NETWORK_ENDPOINT',
        strength: 'STRONG',
        description: 'Real file with fabricated symbol',
        provenance: 'Network trace',
      },
    ];

    const validated = validator.validateCandidateFacts(fabricatedFacts, context);
    // Non-existent file must be omitted completely
    assert.equal(validated.length, 1);
    assert.equal(validated[0]!.filePath, 'src/auth/login-service.ts');
    // Non-existent symbol in real file must be sanitized to null
    assert.equal(validated[0]!.symbolName, null);
    assert.equal(validated[0]!.isSymbolVerified, false);
  });

  test('blocks cross-project repository access attempts', async () => {
    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => ({
          id: 'fc-proj-a',
          projectId: 'project-A',
          title: 'Project A defect',
          status: 'OPEN',
        }),
      },
      projectSource: {
        findUnique: async () => ({
          id: 'src-proj-b',
          projectId: 'project-B', // Target repo belongs to Project B!
          rootPath: '/mock/repo',
        }),
      },
      repositoryDefectLocalization: {
        findFirst: async () => null,
      },
    };

    const service = new DefectLocalizationService(mockPrisma);

    await assert.rejects(
      () =>
        service.localizeDefect({
          projectId: 'project-B', // Caller asks for Project B, but defect belongs to Project A
          failureCaseId: 'fc-proj-a',
        }),
      DefectLocalizationCrossProjectError,
    );
  });

  test('detects and blocks path traversal attacks in candidate facts', () => {
    const validator = new CandidateValidator();
    const context = createMockContext();

    const traversalAttacks = [
      '../../etc/passwd',
      '../../../.ssh/id_rsa',
      '/etc/shadow',
      '\\windows\\system32\\cmd.exe',
      'src/../../secret.env',
    ];

    for (const attackPath of traversalAttacks) {
      assert.throws(
        () =>
          validator.validateCandidateFacts(
            [
              {
                filePath: attackPath,
                candidateType: 'FILE',
                signal: 'KEYWORD_SIMILARITY',
                strength: 'WEAK',
                description: 'Attack',
                provenance: 'Attack',
              },
            ],
            context,
          ),
        DefectLocalizationPathTraversalError,
      );
    }
  });

  test('redacts secrets from candidate descriptions, provenance, and logs', () => {
    const validator = new CandidateValidator();
    const context = createMockContext();

    const factWithSecrets: RawCandidateFact = {
      filePath: 'src/auth/login-service.ts',
      candidateType: 'SERVICE',
      signal: 'NETWORK_ENDPOINT',
      strength: 'STRONG',
      description: 'Found token="ghp_123456789012345678901234567890123456" in trace',
      provenance: 'API key: "api_key=secret-abcdef1234567890"',
    };

    const validated = validator.validateCandidateFacts([factWithSecrets], context);
    assert.equal(validated.length, 1);
    assert.ok(!validated[0]!.description.includes('ghp_123456789012345678901234567890123456'));
    assert.ok(!validated[0]!.provenance.includes('secret-abcdef1234567890'));
    assert.ok(validated[0]!.description.includes('[REDACTED_SECRET]'));
  });

  test('verifies ZERO source code modification invariant on target repository', async () => {
    // 1. Capture git status before localization
    const { stdout: statusBefore } = await execFileAsync('git', ['status', '--short'], {
      cwd: process.cwd(),
    });

    // 2. Perform localization
    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => ({
          id: 'fc-immutability',
          projectId: 'proj-1',
          title: 'Immutability test defect',
          status: 'OPEN',
          testCaseId: 'tc-1',
          testRunId: 'tr-1',
          executionId: 'exec-1',
        }),
      },
      projectSource: {
        findUnique: async () => ({
          id: 'src-1',
          projectId: 'proj-1',
          rootPath: process.cwd(),
          gitMetadata: {
            currentBranch: 'main',
            headCommit: 'abcdef',
          },
          repositoryFiles: [
            {
              id: 'rf-1',
              relativePath: 'package.json',
              name: 'package.json',
              symbols: [],
              imports: [],
            },
          ],
        }),
      },
      requirementTestTrace: { findFirst: async () => null },
      failureTechnicalLocalization: { findFirst: async () => null },
      failureRootCauseAnalysis: { findFirst: async () => null },
      quickFixEligibilityAssessment: { findFirst: async () => null },
      repositoryDefectLocalization: {
        findFirst: async () => null,
      },
      $transaction: async (fn: any) =>
        fn({
          repositoryDefectLocalization: {
            create: async ({ data }: any) => ({
              id: 'loc-test',
              ...data,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        }),
    };

    const service = new DefectLocalizationService(mockPrisma);
    await service.localizeDefect({
      projectId: 'proj-1',
      failureCaseId: 'fc-immutability',
      forceRelocalize: true,
    });

    // 3. Capture git status after localization
    const { stdout: statusAfter } = await execFileAsync('git', ['status', '--short'], {
      cwd: process.cwd(),
    });

    // 4. Invariant: target source files must NOT be changed by defect localization
    assert.equal(
      statusBefore,
      statusAfter,
      'Target repository git status was modified by DefectLocalizationService!',
    );

    // 5. Invariant: DefectLocalizationService prototype contains 0 patch or file write methods
    const serviceProto = Object.getOwnPropertyNames(DefectLocalizationService.prototype);
    const forbiddenMethods = [
      'patch',
      'generatePatch',
      'applyFix',
      'modifyFile',
      'writeFile',
      'commit',
      'createBranch',
      'createPullRequest',
      'repair',
    ];

    for (const forbidden of forbiddenMethods) {
      assert.equal(
        serviceProto.includes(forbidden),
        false,
        `Forbidden repair/patch method '${forbidden}' found on DefectLocalizationService!`,
      );
    }
  });
});
