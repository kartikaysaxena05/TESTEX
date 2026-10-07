/**
 * @file packages/core/src/retest/retest-real-git.test.ts
 * Real Git repository certification test for V7 Phase 106 Requirement Change-Impact & Intelligent Retest Selection.
 * Certifies:
 * 1. Real Git repo initialization (S0 baseline)
 * 2. Real code change to validation logic, real git diff generation
 * 3. Authoritative selection: directly affected test is MANDATORY
 * 4. False-Positive Certification: unrelated tests marked NOT_IMPACTED
 * 5. False-Negative Certification: transitive importing modules selected (RECOMMENDED / MANDATORY)
 * 6. Full-Regression Certification: root configuration / package.json modification escalates to FULL_REGRESSION_REQUIRED
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import { RetestPlanService } from './retest-plan-service.js';

const execFileAsync = promisify(execFile);

describe('Real Git Repository Change-Impact & Retest Selection Certification', () => {
  const projectId = '33333333-3333-3333-3333-333333333333';

  let tempDir: string;
  let repoDir: string;
  let initialCommitSha: string;
  let service: RetestPlanService;

  const changeSnapshots: any[] = [];
  const retestPlans: any[] = [];

  const initialValidationCode =
    [
      'export function checkEmailFormat(email: string): boolean {',
      '  return email.includes("@");',
      '}',
    ].join('\n') + '\n';

  const initialUserServiceCode =
    [
      'import { checkEmailFormat } from "./validation.js";',
      'export function registerAccount(email: string) {',
      '  if (!checkEmailFormat(email)) throw new Error("Invalid");',
      '  return { email, status: "active" };',
      '}',
    ].join('\n') + '\n';

  const initialBillingCode =
    ['export function calculateTax(amount: number): number {', '  return amount * 0.15;', '}'].join(
      '\n',
    ) + '\n';

  const initialPackageJson =
    JSON.stringify(
      {
        name: 'sample-system',
        version: '1.0.0',
        dependencies: { zod: '^3.22.0' },
      },
      null,
      2,
    ) + '\n';

  // Mock requirements for the real git project
  const mockRequirements = [
    {
      id: 'req-val-1',
      projectId,
      requirementKey: 'REQ-VAL-01',
      title: 'Email Format Validation Rule',
      priority: 'HIGH',
      status: 'CONFIRMED',
      repositoryEvidence: [
        {
          filePath: 'src/validation.ts',
          symbolName: 'checkEmailFormat',
          lineStart: 1,
          lineEnd: 3,
        },
      ],
      testTraces: [
        {
          testCaseId: 'tc-val-1',
          testCase: {
            id: 'tc-val-1',
            testCaseKey: 'TC-VAL-001',
            title: 'Verify valid email format check',
            priority: 'HIGH',
            status: 'CONFIRMED',
          },
        },
      ],
    },
    {
      id: 'req-user-2',
      projectId,
      requirementKey: 'REQ-USER-02',
      title: 'User Account Onboarding',
      priority: 'HIGH',
      status: 'CONFIRMED',
      repositoryEvidence: [
        {
          filePath: 'src/user-service.ts',
          symbolName: 'registerAccount',
          lineStart: 2,
          lineEnd: 5,
        },
      ],
      testTraces: [
        {
          testCaseId: 'tc-user-2',
          testCase: {
            id: 'tc-user-2',
            testCaseKey: 'TC-USER-002',
            title: 'Verify onboarding registration',
            priority: 'HIGH',
            status: 'CONFIRMED',
          },
        },
      ],
    },
    {
      id: 'req-bill-3',
      projectId,
      requirementKey: 'REQ-BILL-03',
      title: 'Tax Calculation Engine',
      priority: 'LOW',
      status: 'CONFIRMED',
      repositoryEvidence: [
        {
          filePath: 'src/billing.ts',
          symbolName: 'calculateTax',
          lineStart: 1,
          lineEnd: 3,
        },
      ],
      testTraces: [
        {
          testCaseId: 'tc-bill-3',
          testCase: {
            id: 'tc-bill-3',
            testCaseKey: 'TC-BILL-003',
            title: 'Verify tax arithmetic',
            priority: 'LOW',
            status: 'CONFIRMED',
          },
        },
      ],
    },
    {
      id: 'req-rep-4',
      projectId,
      requirementKey: 'REQ-REP-04',
      title: 'Report Summary Export',
      priority: 'LOW',
      status: 'CONFIRMED',
      repositoryEvidence: [
        {
          filePath: 'src/reports.ts',
          symbolName: 'exportReport',
          lineStart: 1,
          lineEnd: 10,
        },
      ],
      testTraces: [
        {
          testCaseId: 'tc-rep-4',
          testCase: {
            id: 'tc-rep-4',
            testCaseKey: 'TC-REP-004',
            title: 'Verify export report PDF',
            priority: 'LOW',
            status: 'CONFIRMED',
          },
        },
      ],
    },
  ];

  const mockRepositoryFiles = [
    {
      id: 'file-val',
      sourceId: 'src-1',
      relativePath: 'src/validation.ts',
      imports: [],
    },
    {
      id: 'file-user',
      sourceId: 'src-1',
      relativePath: 'src/user-service.ts',
      imports: [
        {
          specifier: './validation.js',
          resolvedRelativePath: 'src/validation.ts',
        },
      ],
    },
    {
      id: 'file-bill',
      sourceId: 'src-1',
      relativePath: 'src/billing.ts',
      imports: [],
    },
    {
      id: 'file-rep',
      sourceId: 'src-1',
      relativePath: 'src/reports.ts',
      imports: [],
    },
  ];

  const mockTestCases = [
    {
      id: 'tc-val-1',
      projectId,
      testCaseKey: 'TC-VAL-001',
      title: 'Verify valid email format check',
      priority: 'HIGH',
      status: 'CONFIRMED',
      versions: [{ id: 'ver-val-1', versionNumber: 1 }],
      executableTestPlans: [{ id: 'plan-val-1', isExecutable: true }],
      testRuns: [{ status: 'PASSED', healingUsed: false }],
    },
    {
      id: 'tc-user-2',
      projectId,
      testCaseKey: 'TC-USER-002',
      title: 'Verify onboarding registration',
      priority: 'HIGH',
      status: 'CONFIRMED',
      versions: [{ id: 'ver-user-2', versionNumber: 1 }],
      executableTestPlans: [{ id: 'plan-user-2', isExecutable: true }],
      testRuns: [{ status: 'PASSED', healingUsed: false }],
    },
    {
      id: 'tc-bill-3',
      projectId,
      testCaseKey: 'TC-BILL-003',
      title: 'Verify tax arithmetic',
      priority: 'LOW',
      status: 'CONFIRMED',
      versions: [{ id: 'ver-bill-3', versionNumber: 1 }],
      executableTestPlans: [{ id: 'plan-bill-3', isExecutable: true }],
      testRuns: [{ status: 'PASSED', healingUsed: false }],
    },
    {
      id: 'tc-rep-4',
      projectId,
      testCaseKey: 'TC-REP-004',
      title: 'Verify export report PDF',
      priority: 'LOW',
      status: 'CONFIRMED',
      versions: [{ id: 'ver-rep-4', versionNumber: 1 }],
      executableTestPlans: [{ id: 'plan-rep-4', isExecutable: true }],
      testRuns: [{ status: 'PASSED', healingUsed: false }],
    },
  ];

  before(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'retest-real-git-')));
    repoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });

    await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Retest QA Bot'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'retest-bot@ai-quality.org'], {
      cwd: repoDir,
    });

    fs.writeFileSync(path.join(repoDir, 'package.json'), initialPackageJson, 'utf8');
    fs.writeFileSync(path.join(repoDir, 'src', 'validation.ts'), initialValidationCode, 'utf8');
    fs.writeFileSync(path.join(repoDir, 'src', 'user-service.ts'), initialUserServiceCode, 'utf8');
    fs.writeFileSync(path.join(repoDir, 'src', 'billing.ts'), initialBillingCode, 'utf8');

    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'S0 baseline code commit'], { cwd: repoDir });

    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    initialCommitSha = stdout.trim();

    const mockPrisma = {
      project: {
        findUnique: async ({ where }: any) => {
          if (where.id === projectId) return { id: projectId, name: 'Real Git Project' };
          return null;
        },
      },
      requirement: {
        findMany: async ({ where }: any) => {
          return mockRequirements.filter(r => r.projectId === where.projectId);
        },
        findUnique: async ({ where }: any) => {
          return mockRequirements.find(r => r.id === where.id) || null;
        },
        count: async ({ where }: any) => {
          return mockRequirements.filter(r => r.projectId === where.projectId).length;
        },
      },
      projectSource: {
        findMany: async ({ where: _where }: any) => {
          return [{ id: 'src-1', projectId }];
        },
      },
      repositoryFile: {
        findMany: async () => mockRepositoryFiles,
      },
      testCase: {
        findMany: async ({ where }: any) => {
          return mockTestCases.filter(t => t.projectId === where.projectId);
        },
      },
      defectPatchApproval: {
        findUnique: async () => null,
      },
      changeSnapshot: {
        create: async ({ data }: any) => {
          const record = {
            id: `snap-${changeSnapshots.length + 1}`,
            projectId: data.project.connect.id,
            sourceType: data.sourceType,
            sourceEntityId: data.sourceEntityId ?? null,
            baseRevision: data.baseRevision ?? null,
            targetRevision: data.targetRevision ?? null,
            diffText: data.diffText ?? null,
            changedFiles: data.changedFiles ?? [],
            changedSymbolsJson: data.changedSymbolsJson ?? [],
            changedRequirements: data.changedRequirements ?? [],
            changedApisJson: data.changedApisJson ?? [],
            changedConfiguration: data.changedConfiguration ?? {},
            title: data.title ?? 'Snapshot',
            description: data.description ?? null,
            metadata: data.metadata ?? {},
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          changeSnapshots.push(record);
          return record;
        },
        findUnique: async ({ where }: any) => {
          return changeSnapshots.find(s => s.id === where.id) || null;
        },
      },
      retestPlan: {
        create: async ({ data }: any) => {
          const record = {
            id: `plan-${retestPlans.length + 1}`,
            projectId: data.project.connect.id,
            changeSnapshotId: data.changeSnapshot.connect.id,
            impactGraphJson: data.impactGraphJson,
            selectedTestsJson: data.selectedTestsJson,
            totalTestsCount: data.totalTestsCount,
            mandatoryCount: data.mandatoryCount,
            recommendedCount: data.recommendedCount,
            optionalCount: data.optionalCount,
            unknownCount: data.unknownCount,
            excludedCount: data.excludedCount,
            fullRegressionRequired: data.fullRegressionRequired,
            fullRegressionReason: data.fullRegressionReason,
            status: data.status,
            selectionPolicyVersion: data.selectionPolicyVersion,
            riskPolicyVersion: data.riskPolicyVersion,
            impactEngineVersion: data.impactEngineVersion,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          retestPlans.push(record);
          return record;
        },
        findUnique: async ({ where }: any) => {
          return retestPlans.find(p => p.id === where.id) || null;
        },
        findFirst: async ({ where }: any) => {
          return (
            retestPlans.find(
              p => p.projectId === where.projectId && p.changeSnapshotId === where.changeSnapshotId,
            ) || null
          );
        },
        findMany: async ({ where }: any) => {
          return retestPlans.filter(p => p.projectId === where.projectId);
        },
      },
    };

    service = new RetestPlanService(mockPrisma as unknown as PrismaClient);
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('certifies real git diff analysis selects directly affected test as MANDATORY and transitive importer as RECOMMENDED', async () => {
    // 1. Make real code change in src/validation.ts
    const updatedValidationCode =
      [
        'export function checkEmailFormat(email: string): boolean {',
        '  return email.includes("@") && email.endsWith(".com");',
        '}',
      ].join('\n') + '\n';
    fs.writeFileSync(path.join(repoDir, 'src', 'validation.ts'), updatedValidationCode, 'utf8');

    // 2. Generate real git diff
    const { stdout: realDiff } = await execFileAsync('git', ['diff', 'src/validation.ts'], {
      cwd: repoDir,
    });
    assert.ok(realDiff.includes('--- a/src/validation.ts'));
    assert.ok(realDiff.includes('+++ b/src/validation.ts'));
    assert.ok(realDiff.includes('-  return email.includes("@");'));
    assert.ok(realDiff.includes('+  return email.includes("@") && email.endsWith(".com");'));

    // 3. Ingest real git diff into RetestPlanService
    const plan = await service.planRetest({
      projectId,
      snapshotInput: {
        projectId,
        sourceType: 'COMMIT_DIFF',
        title: 'Email Validation Strictness Update',
        baseRevision: initialCommitSha,
        targetRevision: 'HEAD',
        diffText: realDiff,
      },
    });

    assert.equal(plan.status, 'COMPLETED');
    assert.equal(plan.fullRegressionRequired, false);
    assert.equal(plan.totalTestsCount, 4);

    // 4. Verify Directly Affected Test: TC-VAL-001 is MANDATORY
    const valTest = plan.selectedTests.find(t => t.testCaseKey === 'TC-VAL-001');
    assert.ok(valTest, 'TC-VAL-001 must be evaluated');
    assert.equal(valTest.selectionState, 'MANDATORY');
    assert.equal(valTest.impactCategory, 'DIRECT');
    assert.equal(valTest.confidence, 'HIGH');
    assert.ok(valTest.selectionReason.includes('src/validation.ts'));

    // 5. False-Negative Certification: Transitive importer TC-USER-002 is RECOMMENDED
    const userTest = plan.selectedTests.find(t => t.testCaseKey === 'TC-USER-002');
    assert.ok(userTest, 'TC-USER-002 must be evaluated');
    assert.equal(userTest.selectionState, 'RECOMMENDED');
    assert.equal(userTest.impactCategory, 'INDIRECT');
    assert.ok(userTest.selectionReason.includes('src/validation.ts'));
    assert.deepEqual(userTest.dependencyPath, ['src/validation.ts', 'src/user-service.ts']);

    // 6. False-Positive Certification: Unrelated tests TC-BILL-003 and TC-REP-004 are NOT_IMPACTED
    const billTest = plan.selectedTests.find(t => t.testCaseKey === 'TC-BILL-003');
    assert.ok(billTest);
    assert.equal(billTest.selectionState, 'NOT_IMPACTED');
    assert.equal(billTest.confidence, 'HIGH');

    const repTest = plan.selectedTests.find(t => t.testCaseKey === 'TC-REP-004');
    assert.ok(repTest);
    assert.equal(repTest.selectionState, 'NOT_IMPACTED');
    assert.equal(repTest.confidence, 'HIGH');

    // 7. Verify explanation endpoint on real git selection
    const explanation = await service.explainTestSelection({
      projectId,
      planId: plan.id,
      testCaseId: userTest.testCaseId,
    });
    assert.equal(explanation.selectionState, 'RECOMMENDED');
    assert.equal(explanation.impactCategory, 'INDIRECT');
    assert.ok(explanation.tracePath.length >= 2);
  });

  it('certifies root package.json configuration change escalates to FULL_REGRESSION_REQUIRED with all tests MANDATORY', async () => {
    // 1. Make real change to root package.json
    const updatedPackageJson =
      JSON.stringify(
        {
          name: 'sample-system',
          version: '1.1.0',
          dependencies: { zod: '^3.23.0', axios: '^1.6.0' },
        },
        null,
        2,
      ) + '\n';
    fs.writeFileSync(path.join(repoDir, 'package.json'), updatedPackageJson, 'utf8');

    // 2. Generate real git diff on package.json
    const { stdout: pkgDiff } = await execFileAsync('git', ['diff', 'package.json'], {
      cwd: repoDir,
    });
    assert.ok(pkgDiff.includes('--- a/package.json'));
    assert.ok(pkgDiff.includes('+++ b/package.json'));

    // 3. Ingest root config change into RetestPlanService
    const plan = await service.planRetest({
      projectId,
      snapshotInput: {
        projectId,
        sourceType: 'CONFIGURATION_CHANGE',
        title: 'Upgrade Dependencies in package.json',
        diffText: pkgDiff,
      },
    });

    assert.equal(plan.status, 'COMPLETED');
    assert.equal(plan.fullRegressionRequired, true);
    assert.ok(plan.fullRegressionReason);
    assert.ok(
      plan.fullRegressionReason.includes(
        'Core shared framework or root package configuration changed',
      ),
    );
    assert.equal(plan.mandatoryCount, 4);
    assert.equal(plan.recommendedCount, 0);
    assert.equal(plan.selectedTests.filter(t => t.selectionState === 'NOT_IMPACTED').length, 0);

    for (const test of plan.selectedTests) {
      assert.equal(test.selectionState, 'MANDATORY');
      assert.ok(test.selectionReason.includes('Full regression required'));
    }
  });
});
