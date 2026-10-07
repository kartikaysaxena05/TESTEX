/**
 * @file packages/core/src/patch/patch-proposal-adversarial.test.ts
 * Adversarial, security boundary, and repository immutability certification tests (V7 Phase 101).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import { PatchContextBuilder } from './context/patch-context-builder.js';
import { PatchGenerator } from './generation/patch-generator.js';
import { PatchProposalService } from './patch-proposal-service.js';
import {
  PatchProposalConcurrentMutationError,
  PatchProposalHallucinatedEntityError,
  PatchProposalHighRiskBlockedError,
  PatchProposalIneligibleError,
  PatchProposalLocalizationRequiredError,
  PatchProposalOversizedError,
  PatchProposalPathTraversalError,
  PatchProposalUnauthorizedFileError,
} from './patch-errors.js';
import type { PatchContext } from './patch-types.js';

const execFileAsync = promisify(execFile);

describe('Limited AI Patch Generation Adversarial & Security Certification (Phase 101)', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const failureCaseId = '22222222-2222-2222-2222-222222222222';
  const repositoryId = '33333333-3333-3333-3333-333333333333';

  // 1. Ineligible Defect Rejection (Phase 99 Grounding)
  it('1. Phase 99 Ineligible Defect: strictly rejected when decision is NOT_ELIGIBLE or BLOCKED', async () => {
    const mockPrisma = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId,
          title: 'Unsafe defect',
          testCaseId: 'tc-1',
          testCase: { id: 'tc-1', testCaseKey: 'TC-1', title: 'Test 1' },
        }),
      },
      quickFixEligibilityAssessment: {
        findFirst: async () => ({
          id: 'qf-ineligible',
          projectId,
          failureCaseId,
          decision: 'NOT_ELIGIBLE',
          policyVersion: '1.0.0',
          riskFactorsJson: { overallRisk: 'HIGH' },
          matchedRules: ['BLOCKED_AUTH_MUTATION'],
          safetyWarnings: ['Modifying auth is prohibited'],
          primaryReason: 'Touches core authentication service',
        }),
      },
    } as unknown as PrismaClient;

    const builder = new PatchContextBuilder({ prisma: mockPrisma });
    await assert.rejects(
      async () => builder.buildContext(projectId, failureCaseId),
      (err: unknown) => {
        assert.ok(err instanceof PatchProposalIneligibleError);
        assert.ok(err.message.includes('NOT_ELIGIBLE'));
        return true;
      },
    );
  });

  it('2. Phase 99 Missing Assessment: strictly rejected when QuickFix assessment does not exist', async () => {
    const mockPrisma = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId,
          title: 'Defect without assessment',
          testCaseId: 'tc-1',
          testCase: { id: 'tc-1', testCaseKey: 'TC-1', title: 'Test 1' },
        }),
      },
      quickFixEligibilityAssessment: {
        findFirst: async () => null,
      },
    } as unknown as PrismaClient;

    const builder = new PatchContextBuilder({ prisma: mockPrisma });
    await assert.rejects(
      async () => builder.buildContext(projectId, failureCaseId),
      (err: unknown) => err instanceof PatchProposalIneligibleError,
    );
  });

  // 2. Localization Grounding (Phase 100 Grounding)
  it('3. Phase 100 Missing Localization: strictly rejected when localization is missing', async () => {
    const mockPrisma = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId,
          title: 'Defect without localization',
          testCaseId: 'tc-1',
          testCase: { id: 'tc-1', testCaseKey: 'TC-1', title: 'Test 1' },
        }),
      },
      quickFixEligibilityAssessment: {
        findFirst: async () => ({
          id: 'qf-1',
          projectId,
          failureCaseId,
          decision: 'ELIGIBLE',
          policyVersion: '1.0.0',
          riskFactorsJson: {},
          matchedRules: [],
          safetyWarnings: [],
          primaryReason: 'Eligible',
        }),
      },
      repositoryDefectLocalization: {
        findFirst: async () => null,
      },
    } as unknown as PrismaClient;

    const builder = new PatchContextBuilder({ prisma: mockPrisma });
    await assert.rejects(
      async () => builder.buildContext(projectId, failureCaseId),
      (err: unknown) => err instanceof PatchProposalLocalizationRequiredError,
    );
  });

  // 3. Target File Allowlist
  it('4. Target File Allowlist: strictly rejects patch proposing files outside candidateFiles', async () => {
    const mockContext: PatchContext = {
      projectId,
      failureCaseId,
      repositoryId,
      workspaceRoot: process.cwd(),
      repositoryRevision: 'rev-allowlist-1',
      branchName: 'main',
      isDrifted: false,
      quickFixAssessment: {
        id: 'qf-1',
        eligibility: 'ELIGIBLE',
        safetyPolicy: '1.0.0',
        riskLevel: 'LOW',
        reasons: [],
        suggestedActions: [],
      },
      defectLocalization: {
        id: 'loc-1',
        candidateFiles: ['package.json'], // Only package.json is authorized
        topCandidateFilePath: 'package.json',
        rankedCandidates: [],
        repositoryRevision: 'rev-allowlist-1',
        isDrifted: false,
      },
      failureCase: {
        id: failureCaseId,
        title: 'Unauthorized file test',
        testCaseId: 'tc-1',
      },
      snippets: [],
    };

    // Generator attempts to propose edits in src/db/schema.prisma or unauthorized files
    const unauthorizedGenerator = new PatchGenerator({
      customGenerator: async () => ({
        targetFiles: ['package.json', 'prisma/schema.prisma'], // unauthorized second file
        unifiedDiff: `--- a/prisma/schema.prisma\n+++ b/prisma/schema.prisma\n@@ -1,1 +1,1 @@\n-old\n+new\n`,
        structuredEdits: [],
      }),
    });

    await assert.rejects(
      async () => unauthorizedGenerator.generatePatch(mockContext),
      (err: unknown) => {
        assert.ok(err instanceof PatchProposalUnauthorizedFileError);
        assert.ok(err.message.includes('prisma/schema.prisma'));
        return true;
      },
    );
  });

  // 4. Path Traversal Rejection
  it('5. Path Traversal Attack: candidate files with ../ or .git are blocked', async () => {
    const mockPrisma = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId,
          title: 'Traversal test',
          testCaseId: 'tc-1',
          testCase: { id: 'tc-1', testCaseKey: 'TC-1', title: 'Test 1' },
        }),
      },
      quickFixEligibilityAssessment: {
        findFirst: async () => ({
          id: 'qf-1',
          projectId,
          failureCaseId,
          decision: 'ELIGIBLE',
          policyVersion: '1.0.0',
          riskFactorsJson: {},
          matchedRules: [],
          safetyWarnings: [],
          primaryReason: 'Eligible',
        }),
      },
      repositoryDefectLocalization: {
        findFirst: async () => ({
          id: 'loc-1',
          projectId,
          failureCaseId,
          candidateFiles: ['../../etc/passwd'], // Traversal attack
          repositoryRevision: 'rev-1',
          isDrifted: false,
        }),
      },
      projectSource: {
        findFirst: async () => ({
          id: repositoryId,
          projectId,
          rootPath: process.cwd(),
        }),
      },
    } as unknown as PrismaClient;

    const builder = new PatchContextBuilder({ prisma: mockPrisma });
    await assert.rejects(
      async () => builder.buildContext(projectId, failureCaseId),
      (err: unknown) => err instanceof PatchProposalPathTraversalError,
    );
  });

  // 5. Hallucinated File & Nonexistent Symbol Rejection
  it('6. Hallucinated Entity Attack: nonexistent file or nonexistent symbol is rejected', async () => {
    const mockContext: PatchContext = {
      projectId,
      failureCaseId,
      repositoryId,
      workspaceRoot: process.cwd(),
      repositoryRevision: 'rev-1',
      branchName: 'main',
      isDrifted: false,
      quickFixAssessment: {
        id: 'qf-1',
        eligibility: 'ELIGIBLE',
        safetyPolicy: '1.0.0',
        riskLevel: 'LOW',
        reasons: [],
        suggestedActions: [],
      },
      defectLocalization: {
        id: 'loc-1',
        candidateFiles: ['package.json'],
        topCandidateFilePath: 'package.json',
        topCandidateSymbolName: 'DEFINITELY_FABRICATED_SYMBOL_XYZ_123',
        rankedCandidates: [],
        repositoryRevision: 'rev-1',
        isDrifted: false,
      },
      failureCase: {
        id: failureCaseId,
        title: 'Hallucinated symbol test',
        testCaseId: 'tc-1',
      },
      snippets: [],
    };

    const generator = new PatchGenerator();
    await assert.rejects(
      async () => generator.generatePatch(mockContext),
      (err: unknown) => err instanceof PatchProposalHallucinatedEntityError,
    );
  });

  // 6. Oversized Patch Rejection
  it('7. Oversized Patch: rejects patches with >50 added or >30 removed lines', async () => {
    const mockContext: PatchContext = {
      projectId,
      failureCaseId,
      repositoryId,
      workspaceRoot: process.cwd(),
      repositoryRevision: 'rev-1',
      branchName: 'main',
      isDrifted: false,
      quickFixAssessment: {
        id: 'qf-1',
        eligibility: 'ELIGIBLE',
        safetyPolicy: '1.0.0',
        riskLevel: 'LOW',
        reasons: [],
        suggestedActions: [],
      },
      defectLocalization: {
        id: 'loc-1',
        candidateFiles: ['package.json'],
        topCandidateFilePath: 'package.json',
        rankedCandidates: [],
        repositoryRevision: 'rev-1',
        isDrifted: false,
      },
      failureCase: {
        id: failureCaseId,
        title: 'Oversized patch test',
        testCaseId: 'tc-1',
      },
      snippets: [],
    };

    // Construct 55 added lines
    const addedLines = Array.from({ length: 55 }, (_, i) => `+added line ${i}`).join('\n');
    const oversizedDiff = `--- a/package.json\n+++ b/package.json\n@@ -1,1 +1,56 @@\n {\n${addedLines}\n`;

    const generator = new PatchGenerator({
      customGenerator: async () => ({
        targetFiles: ['package.json'],
        unifiedDiff: oversizedDiff,
      }),
    });

    await assert.rejects(
      async () => generator.generatePatch(mockContext),
      (err: unknown) => err instanceof PatchProposalOversizedError,
    );
  });

  // 7. High-Risk / Dangerous Code Rejection
  it('8. High-Risk Operation: rejects dangerous operations (rm -rf, eval, drop table, exec)', async () => {
    const mockContext: PatchContext = {
      projectId,
      failureCaseId,
      repositoryId,
      workspaceRoot: process.cwd(),
      repositoryRevision: 'rev-1',
      branchName: 'main',
      isDrifted: false,
      quickFixAssessment: {
        id: 'qf-1',
        eligibility: 'ELIGIBLE',
        safetyPolicy: '1.0.0',
        riskLevel: 'LOW',
        reasons: [],
        suggestedActions: [],
      },
      defectLocalization: {
        id: 'loc-1',
        candidateFiles: ['package.json'],
        topCandidateFilePath: 'package.json',
        rankedCandidates: [],
        repositoryRevision: 'rev-1',
        isDrifted: false,
      },
      failureCase: {
        id: failureCaseId,
        title: 'Dangerous diff test',
        testCaseId: 'tc-1',
      },
      snippets: [],
    };

    const dangerousDiff = `--- a/package.json\n+++ b/package.json\n@@ -1,1 +1,2 @@\n {\n+exec("rm -rf /");\n`;

    const generator = new PatchGenerator({
      customGenerator: async () => ({
        targetFiles: ['package.json'],
        unifiedDiff: dangerousDiff,
      }),
    });

    await assert.rejects(
      async () => generator.generatePatch(mockContext),
      (err: unknown) => err instanceof PatchProposalHighRiskBlockedError,
    );
  });

  // 8. Security-Sensitive Escalation
  it('9. Security-Sensitive Escalation: patches touching auth/crypto/token are escalated to HIGH risk', async () => {
    const mockContext: PatchContext = {
      projectId,
      failureCaseId,
      repositoryId,
      workspaceRoot: process.cwd(),
      repositoryRevision: 'rev-1',
      branchName: 'main',
      isDrifted: false,
      quickFixAssessment: {
        id: 'qf-1',
        eligibility: 'ELIGIBLE',
        safetyPolicy: '1.0.0',
        riskLevel: 'LOW',
        reasons: [],
        suggestedActions: [],
      },
      defectLocalization: {
        id: 'loc-1',
        candidateFiles: ['package.json'],
        topCandidateFilePath: 'package.json',
        rankedCandidates: [],
        repositoryRevision: 'rev-1',
        isDrifted: false,
      },
      failureCase: {
        id: failureCaseId,
        title: 'Security keyword test',
        testCaseId: 'tc-1',
      },
      snippets: [],
    };

    const securityDiff = `--- a/package.json\n+++ b/package.json\n@@ -1,1 +1,2 @@\n {\n+  "authToken": "refreshed",\n`;

    const generator = new PatchGenerator({
      customGenerator: async () => ({
        targetFiles: ['package.json'],
        unifiedDiff: securityDiff,
        riskLevel: 'LOW', // AI claims it's LOW
      }),
    });

    const result = await generator.generatePatch(mockContext);
    assert.equal(result.riskLevel, 'HIGH');
    assert.ok(result.riskFactors.some(rf => rf.includes('security-sensitive')));
  });

  // 9. Secret Redaction Test
  it('10. Secret Redaction: redacts API keys, passwords, and JWTs from context and rationale', () => {
    const rawWithSecrets =
      'Error in service: ghp_123456789012345678901234567890123456 with password="super-secret-password" and token=eyJhbGciOiJIUzI1NiJ9.test.jwt';
    const redacted = PatchContextBuilder.redactSecrets(rawWithSecrets);

    assert.equal(redacted.includes('ghp_'), false);
    assert.equal(redacted.includes('super-secret-password'), false);
    assert.equal(redacted.includes('eyJhbGciOiJIUzI1NiJ9'), false);
    assert.ok(redacted.includes('[REDACTED_SECRET]'));
  });

  // 10. Concurrency Mutex
  it('11. Concurrency Mutex: simultaneous generation requests on same failureCase fail with ConcurrentMutationError', async () => {
    let resolveFirst: () => void;
    const firstPromise = new Promise<void>(resolve => {
      resolveFirst = resolve;
    });

    const mockPrisma = {
      defectPatchProposal: {
        findFirst: async () => null,
      },
    } as unknown as PrismaClient;

    const slowContextBuilder = {
      buildContext: async () => {
        await firstPromise;
        return {
          projectId,
          failureCaseId,
          repositoryId,
          workspaceRoot: process.cwd(),
          repositoryRevision: 'rev-1',
          branchName: 'main',
          isDrifted: false,
          quickFixAssessment: { id: 'qf-1', eligibility: 'ELIGIBLE' },
          defectLocalization: { id: 'loc-1', candidateFiles: ['package.json'] },
          failureCase: { id: failureCaseId, title: 'Concurrency', testCaseId: 'tc-1' },
          snippets: [],
        };
      },
    };

    const service = new PatchProposalService({
      prisma: mockPrisma,
      contextBuilder: slowContextBuilder as any,
    });

    // Start first request (runs and waits on firstPromise)
    const req1 = service.generateProposal({ projectId, failureCaseId });

    // Immediately start second request on same failureCase
    await assert.rejects(
      async () => service.generateProposal({ projectId, failureCaseId }),
      (err: unknown) => err instanceof PatchProposalConcurrentMutationError,
    );

    resolveFirst!();
    try {
      await req1;
    } catch {
      // Ignored for mutex test
    }
  });

  // 11. Immutability & Zero Repository Mutation Invariant
  it('12. Immutability Audit: Phase 101 execution produces strictly 0 working tree modifications', async () => {
    // 1. Capture git status before
    const { stdout: statusBefore } = await execFileAsync('git', ['status', '--short'], {
      cwd: process.cwd(),
    });

    // 2. Capture git HEAD commit before
    const { stdout: headBefore } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
    });

    // 3. Run complete PatchProposalService generation flow
    let createdProposal: any = null;
    const mockPrisma = {
      defectPatchProposal: {
        findFirst: async () => null,
        findMany: async () => [],
      },
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId,
          title: 'Validate age 18',
          errorMessage: 'Expected true, got false for age 18',
          testCaseId: 'tc-1',
          testCase: { id: 'tc-1', testCaseKey: 'TC-1', title: 'Age Test' },
        }),
      },
      quickFixEligibilityAssessment: {
        findFirst: async () => ({
          id: 'qf-1',
          projectId,
          failureCaseId,
          decision: 'ELIGIBLE',
          policyVersion: '1.0.0',
          riskFactorsJson: { overallRisk: 'LOW' },
          matchedRules: ['SINGLE_LINE_LOGIC_CORRECTION'],
          safetyWarnings: [],
          primaryReason: 'Eligible for single line boundary fix',
        }),
      },
      repositoryDefectLocalization: {
        findFirst: async () => ({
          id: 'loc-1',
          projectId,
          failureCaseId,
          candidateFiles: ['package.json'],
          topCandidateFilePath: 'package.json',
          topCandidateSymbolName: '"name"',
          rankedCandidatesJson: [
            {
              filePath: 'package.json',
              startLine: 2,
              endLine: 2,
            },
          ],
          repositoryRevision: headBefore.trim(),
          isDrifted: false,
        }),
      },
      projectSource: {
        findFirst: async () => ({
          id: repositoryId,
          projectId,
          rootPath: process.cwd(),
        }),
      },
      $transaction: async (fn: any) =>
        fn({
          defectPatchProposal: {
            updateMany: async () => {},
            create: async ({ data }: any) => {
              createdProposal = {
                id: 'proposal-real-cert',
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              return createdProposal;
            },
          },
        }),
    } as unknown as PrismaClient;

    const service = new PatchProposalService({ prisma: mockPrisma });
    const proposal = await service.generateProposal({
      projectId,
      failureCaseId,
    });

    assert.ok(proposal);
    assert.equal(proposal.status, 'PROPOSED');
    assert.equal(proposal.isReadOnlyProposal, true);

    // 4. Capture git status after
    const { stdout: statusAfter } = await execFileAsync('git', ['status', '--short'], {
      cwd: process.cwd(),
    });

    // 5. Capture git HEAD after
    const { stdout: headAfter } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
    });

    // 6. Invariant verification: Authoritative source modifications = 0
    assert.equal(
      statusBefore,
      statusAfter,
      'CRITICAL VIOLATION: Target repository source was modified during Phase 101 patch generation!',
    );

    // 7. Invariant verification: Git HEAD unchanged
    assert.equal(
      headBefore.trim(),
      headAfter.trim(),
      'CRITICAL VIOLATION: Git HEAD was altered during Phase 101 patch generation!',
    );

    // 8. Service prototype audit: strictly NO direct write or git write methods
    const protoMethods = Object.getOwnPropertyNames(PatchProposalService.prototype);
    const forbiddenWriteMethods = [
      'applyPatch',
      'writeSource',
      'writeFile',
      'commit',
      'gitCommit',
      'push',
      'gitPush',
      'deploy',
      'mergeBranch',
    ];

    for (const forbidden of forbiddenWriteMethods) {
      assert.equal(
        protoMethods.includes(forbidden),
        false,
        `CRITICAL VIOLATION: Forbidden write/apply method '${forbidden}' exists on PatchProposalService!`,
      );
    }
  });
});
