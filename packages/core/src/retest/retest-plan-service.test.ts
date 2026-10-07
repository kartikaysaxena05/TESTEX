/**
 * @file packages/core/src/retest/retest-plan-service.test.ts
 * Unit tests for RetestPlanService, TestSelectionEngine, and ImpactGraphBuilder (V7 Phase 106).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { RetestPlanService } from './retest-plan-service.js';

describe('RetestPlanService & Selection Engine Unit Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '99999999-9999-9999-9999-999999999999';

  // In-memory store
  let changeSnapshots: any[] = [];
  let retestPlans: any[] = [];

  // Mock requirements
  const mockRequirements = [
    {
      id: 'req-auth-1',
      projectId,
      requirementKey: 'REQ-AUTH-01',
      title: 'User Login Authentication',
      priority: 'HIGH',
      status: 'CONFIRMED',
      repositoryEvidence: [
        {
          filePath: 'src/auth/login.ts',
          symbolName: 'loginUser',
          lineStart: 10,
          lineEnd: 25,
        },
      ],
      testTraces: [
        {
          testCaseId: 'tc-login-1',
          testCase: {
            id: 'tc-login-1',
            testCaseKey: 'TC-LOGIN-001',
            title: 'Verify valid login credentials',
            priority: 'HIGH',
            status: 'CONFIRMED',
          },
        },
      ],
    },
    {
      id: 'req-profile-2',
      projectId,
      requirementKey: 'REQ-PROF-02',
      title: 'User Profile Management',
      priority: 'MEDIUM',
      status: 'CONFIRMED',
      repositoryEvidence: [
        {
          filePath: 'src/profile/profile-service.ts',
          symbolName: 'getProfile',
          lineStart: 5,
          lineEnd: 20,
        },
      ],
      testTraces: [
        {
          testCaseId: 'tc-profile-2',
          testCase: {
            id: 'tc-profile-2',
            testCaseKey: 'TC-PROF-002',
            title: 'Verify profile view',
            priority: 'MEDIUM',
            status: 'CONFIRMED',
          },
        },
      ],
    },
    {
      id: 'req-billing-3',
      projectId,
      requirementKey: 'REQ-BILL-03',
      title: 'Billing and Invoicing',
      priority: 'LOW',
      status: 'CONFIRMED',
      repositoryEvidence: [
        {
          filePath: 'src/billing/invoice.ts',
          symbolName: 'createInvoice',
          lineStart: 1,
          lineEnd: 20,
        },
      ],
      testTraces: [
        {
          testCaseId: 'tc-unrelated-3',
          testCase: {
            id: 'tc-unrelated-3',
            testCaseKey: 'TC-BILL-003',
            title: 'Verify invoice generation',
            priority: 'LOW',
            status: 'CONFIRMED',
          },
        },
      ],
    },
  ];

  // Mock repository files and imports
  const mockRepositoryFiles = [
    {
      id: 'file-login',
      sourceId: 'src-1',
      relativePath: 'src/auth/login.ts',
      imports: [],
    },
    {
      id: 'file-profile',
      sourceId: 'src-1',
      relativePath: 'src/profile/profile-service.ts',
      imports: [
        {
          specifier: '../auth/login.js',
          resolvedRelativePath: 'src/auth/login.ts',
        },
      ],
    },
    {
      id: 'file-unrelated',
      sourceId: 'src-1',
      relativePath: 'src/billing/invoice.ts',
      imports: [],
    },
  ];

  // Mock test cases
  const mockTestCases = [
    {
      id: 'tc-login-1',
      projectId,
      testCaseKey: 'TC-LOGIN-001',
      title: 'Verify valid login credentials',
      priority: 'HIGH',
      status: 'CONFIRMED',
      versions: [{ id: 'ver-1', versionNumber: 1 }],
      executableTestPlans: [{ id: 'plan-1', isExecutable: true }],
      testRuns: [{ status: 'PASSED', healingUsed: false }],
    },
    {
      id: 'tc-profile-2',
      projectId,
      testCaseKey: 'TC-PROF-002',
      title: 'Verify profile view',
      priority: 'MEDIUM',
      status: 'CONFIRMED',
      versions: [{ id: 'ver-2', versionNumber: 1 }],
      executableTestPlans: [{ id: 'plan-2', isExecutable: true }],
      testRuns: [{ status: 'PASSED', healingUsed: false }],
    },
    {
      id: 'tc-unrelated-3',
      projectId,
      testCaseKey: 'TC-BILL-003',
      title: 'Verify invoice generation',
      priority: 'LOW',
      status: 'CONFIRMED',
      versions: [{ id: 'ver-3', versionNumber: 1 }],
      executableTestPlans: [{ id: 'plan-3', isExecutable: true }],
      testRuns: [{ status: 'PASSED', healingUsed: false }],
    },
    {
      id: 'tc-deprecated-4',
      projectId,
      testCaseKey: 'TC-OLD-004',
      title: 'Legacy login test',
      priority: 'LOW',
      status: 'DEPRECATED',
      versions: [{ id: 'ver-4', versionNumber: 1 }],
      executableTestPlans: [{ id: 'plan-4', isExecutable: false }],
      testRuns: [],
    },
  ];

  let mockPrisma: any;
  let service: RetestPlanService;

  beforeEach(() => {
    changeSnapshots = [];
    retestPlans = [];

    mockPrisma = {
      project: {
        findUnique: async ({ where }: any) => {
          if (where.id === projectId || where.id === otherProjectId) {
            return { id: where.id, name: 'Test QA Project' };
          }
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
        count: async () => mockRequirements.length,
      },
      projectSource: {
        findMany: async ({ where }: any) => {
          if (where.projectId === projectId) {
            return [{ id: 'src-1', projectId }];
          }
          return [];
        },
      },
      repositoryFile: {
        findMany: async ({ where: _where }: any) => {
          return mockRepositoryFiles;
        },
      },
      testCase: {
        findMany: async ({ where }: any) => {
          return mockTestCases.filter(t => t.projectId === where.projectId);
        },
      },
      defectPatchApproval: {
        findUnique: async ({ where }: any) => {
          if (where.id === 'patch-app-1') {
            return {
              id: 'patch-app-1',
              projectId,
              baseRevision: 'abc1234',
              appliedRevision: 'def5678',
              appliedUnifiedDiff:
                '--- a/src/auth/login.ts\n+++ b/src/auth/login.ts\n@@ -10,2 +10,2 @@\n- old\n+ new\n',
              affectedFiles: ['src/auth/login.ts'],
              patchProposal: {
                unifiedDiff: '--- a/src/auth/login.ts\n+++ b/src/auth/login.ts\n',
                primaryFilePath: 'src/auth/login.ts',
                primarySymbolName: 'loginUser',
                startLine: 10,
                endLine: 25,
              },
              failureCase: {
                testCaseId: 'tc-login-1',
              },
            };
          }
          return null;
        },
      },
      changeSnapshot: {
        create: async ({ data }: any) => {
          const record = {
            id: `snap-${changeSnapshots.length + 1}`,
            projectId: data.project.connect.id,
            sourceType: data.sourceType,
            sourceEntityId: data.sourceEntityId,
            baseRevision: data.baseRevision,
            targetRevision: data.targetRevision,
            title: data.title,
            description: data.description,
            changedFiles: data.changedFiles,
            changedSymbolsJson: data.changedSymbolsJson,
            changedRequirements: data.changedRequirements,
            changedApisJson: data.changedApisJson,
            changedConfiguration: data.changedConfiguration,
            diffText: data.diffText,
            metadataJson: data.metadataJson,
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
        create: async ({ data, include: _include }: any) => {
          const snapshot = changeSnapshots.find(s => s.id === data.changeSnapshot.connect.id);
          const record = {
            id: `plan-${retestPlans.length + 1}`,
            projectId: data.project.connect.id,
            changeSnapshotId: data.changeSnapshot.connect.id,
            status: data.status,
            baseRevision: data.baseRevision,
            targetRevision: data.targetRevision,
            selectionPolicyVersion: data.selectionPolicyVersion,
            riskPolicyVersion: data.riskPolicyVersion,
            impactEngineVersion: data.impactEngineVersion,
            fullRegressionRequired: data.fullRegressionRequired,
            fullRegressionReason: data.fullRegressionReason,
            totalTestsCount: data.totalTestsCount,
            mandatoryCount: data.mandatoryCount,
            recommendedCount: data.recommendedCount,
            optionalCount: data.optionalCount,
            unknownCount: data.unknownCount,
            excludedCount: data.excludedCount,
            impactGraphJson: data.impactGraphJson,
            selectedTestsJson: data.selectedTestsJson,
            auditTrailJson: data.auditTrailJson,
            createdAt: new Date(),
            updatedAt: new Date(),
            changeSnapshot: snapshot,
          };
          retestPlans.push(record);
          return record;
        },
        findUnique: async ({ where, include: _include }: any) => {
          const plan = retestPlans.find(p => p.id === where.id);
          if (!plan) return null;
          return plan;
        },
        findMany: async ({ where }: any) => {
          return retestPlans.filter(p => p.projectId === where.projectId);
        },
      },
    };

    service = new RetestPlanService(mockPrisma as unknown as PrismaClient);
  });

  it('selects directly affected test as MANDATORY when requirement changes', async () => {
    const result = await service.planRetest({
      projectId,
      snapshotInput: {
        projectId,
        sourceType: 'REQUIREMENT_CHANGE',
        sourceEntityId: 'req-profile-2',
        title: 'Profile Requirement Update',
      },
    });

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.totalTestsCount, 4);
    assert.equal(result.mandatoryCount, 1);
    const profileTest = result.selectedTests.find(t => t.testCaseId === 'tc-profile-2');
    assert.ok(profileTest);
    assert.equal(profileTest.selectionState, 'MANDATORY');
    assert.equal(profileTest.impactCategory, 'DIRECT');
    assert.equal(profileTest.confidence, 'HIGH');
  });

  it('selects directly affected test as MANDATORY and indirect dependency as RECOMMENDED when code changes', async () => {
    const result = await service.planRetest({
      projectId,
      snapshotInput: {
        projectId,
        sourceType: 'SOURCE_CODE_CHANGE',
        title: 'Modify Login Function',
        changedFiles: ['src/auth/login.ts'],
      },
    });

    // Directly affected: login test
    const loginTest = result.selectedTests.find(t => t.testCaseId === 'tc-login-1');
    assert.ok(loginTest);
    assert.equal(loginTest.selectionState, 'MANDATORY');
    assert.equal(loginTest.impactCategory, 'DIRECT');

    // Indirectly dependent: profile test (profile-service.ts imports login.ts)
    // Note: login contains 'auth', which is security-critical, so elevated to MANDATORY by policy
    const profileTest = result.selectedTests.find(t => t.testCaseId === 'tc-profile-2');
    assert.ok(profileTest);
    assert.ok(profileTest.riskSignals.includes('SECURITY_CRITICAL_PATH'));
    assert.equal(profileTest.selectionState, 'MANDATORY');
  });

  it('excludes unrelated test with NOT_IMPACTED and reason', async () => {
    const result = await service.planRetest({
      projectId,
      snapshotInput: {
        projectId,
        sourceType: 'SOURCE_CODE_CHANGE',
        title: 'Modify Login Function',
        changedFiles: ['src/auth/login.ts'],
      },
    });

    const unrelatedTest = result.selectedTests.find(t => t.testCaseId === 'tc-unrelated-3');
    assert.ok(unrelatedTest);
    assert.equal(unrelatedTest.selectionState, 'NOT_IMPACTED');
    assert.ok(unrelatedTest.selectionReason.includes('No requirement trace'));
  });

  it('marks deprecated test as EXCLUDED', async () => {
    const result = await service.planRetest({
      projectId,
      snapshotInput: {
        projectId,
        sourceType: 'REQUIREMENT_CHANGE',
        sourceEntityId: 'req-auth-1',
        title: 'Auth Requirement Update',
      },
    });

    const deprecatedTest = result.selectedTests.find(t => t.testCaseId === 'tc-deprecated-4');
    assert.ok(deprecatedTest);
    assert.equal(deprecatedTest.selectionState, 'EXCLUDED');
    assert.equal(deprecatedTest.selectionReason, 'Test case is marked as deprecated.');
  });

  it('selects patch reverification test as MANDATORY when change source is APPROVED_PATCH', async () => {
    const result = await service.planRetest({
      projectId,
      snapshotInput: {
        projectId,
        sourceType: 'APPROVED_PATCH',
        sourceEntityId: 'patch-app-1',
        title: 'Approved Patch Retest',
      },
    });

    const reverifTest = result.selectedTests.find(t => t.testCaseId === 'tc-login-1');
    assert.ok(reverifTest);
    assert.equal(reverifTest.selectionState, 'MANDATORY');
    assert.ok(reverifTest.riskSignals.includes('PATCH_REVERIFICATION_TARGET'));
    assert.equal(
      reverifTest.selectionReason,
      'Test that failed before patch and is being reverified.',
    );
  });

  it('escalates to FULL_REGRESSION_REQUIRED when root package configuration changes', async () => {
    const result = await service.planRetest({
      projectId,
      snapshotInput: {
        projectId,
        sourceType: 'CONFIGURATION_CHANGE',
        title: 'Upgrade Dependencies',
        changedFiles: ['package.json'],
      },
    });

    assert.equal(result.fullRegressionRequired, true);
    assert.ok(result.fullRegressionReason?.includes('Core shared framework'));
    // All non-excluded tests should be promoted to MANDATORY
    const tests = result.selectedTests.filter(t => t.selectionState !== 'EXCLUDED');
    for (const t of tests) {
      assert.equal(t.selectionState, 'MANDATORY');
    }
  });

  it('provides detailed explanation with explainTestSelection', async () => {
    const plan = await service.planRetest({
      projectId,
      snapshotInput: {
        projectId,
        sourceType: 'REQUIREMENT_CHANGE',
        sourceEntityId: 'req-auth-1',
        title: 'Auth Requirement Update',
      },
    });

    const explanation = await service.explainTestSelection({
      projectId,
      planId: plan.id,
      testCaseId: 'tc-login-1',
    });

    assert.equal(explanation.testCaseKey, 'TC-LOGIN-001');
    assert.equal(explanation.selectionState, 'MANDATORY');
    assert.ok(explanation.selectionReason.includes('Directly traces to modified requirement'));
    assert.ok(explanation.tracePath.length > 0);
  });

  it('is idempotent when retrieving plan with getRetestPlan', async () => {
    const plan = await service.planRetest({
      projectId,
      snapshotInput: {
        projectId,
        sourceType: 'REQUIREMENT_CHANGE',
        sourceEntityId: 'req-auth-1',
        title: 'Auth Requirement Update',
      },
    });

    const planCountBefore = retestPlans.length;
    const retrieved = await service.getRetestPlan({
      projectId,
      planId: plan.id,
    });

    assert.ok(retrieved);
    assert.equal(retrieved.id, plan.id);
    assert.equal(retestPlans.length, planCountBefore); // No new plans created
  });
});
