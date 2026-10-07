/**
 * @file packages/core/src/retest/retest-adversarial.test.ts
 * Adversarial, cross-project security, secret redaction, and boundary tests for RetestPlanService (V7 Phase 106).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { RetestPlanService } from './retest-plan-service.js';
import {
  RetestConcurrentAnalysisError,
  RetestProjectMismatchError,
  RetestValidationError,
} from './retest-errors.js';
import { RETEST_BOUNDS } from './retest-types.js';

describe('RetestPlanService Adversarial & Security Tests', () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  let changeSnapshots: any[] = [];
  let retestPlans: any[] = [];
  let service: RetestPlanService;

  const mockRequirements = [
    {
      id: 'req-tenant-a-1',
      projectId: tenantA,
      requirementKey: 'REQ-TENANT-A-01',
      title: 'Tenant A Secret Vault',
      priority: 'HIGH',
      status: 'CONFIRMED',
      repositoryEvidence: [
        {
          filePath: 'src/vault/secret.ts',
          symbolName: 'getVaultSecret',
          lineStart: 1,
          lineEnd: 20,
        },
      ],
      testTraces: [
        {
          testCaseId: 'tc-a-1',
          testCase: {
            id: 'tc-a-1',
            testCaseKey: 'TC-A-001',
            title: 'Verify Vault Secret Access',
            priority: 'HIGH',
            status: 'CONFIRMED',
          },
        },
      ],
    },
    {
      id: 'req-tenant-b-1',
      projectId: tenantB,
      requirementKey: 'REQ-TENANT-B-01',
      title: 'Tenant B Financial Ledger',
      priority: 'HIGH',
      status: 'CONFIRMED',
      repositoryEvidence: [
        {
          filePath: 'src/ledger/financial.ts',
          symbolName: 'getLedger',
          lineStart: 1,
          lineEnd: 30,
        },
      ],
      testTraces: [
        {
          testCaseId: 'tc-b-1',
          testCase: {
            id: 'tc-b-1',
            testCaseKey: 'TC-B-001',
            title: 'Verify Ledger Balance',
            priority: 'HIGH',
            status: 'CONFIRMED',
          },
        },
      ],
    },
  ];

  const mockTestCases = [
    {
      id: 'tc-a-1',
      projectId: tenantA,
      testCaseKey: 'TC-A-001',
      title: 'Verify Vault Secret Access',
      priority: 'HIGH',
      status: 'CONFIRMED',
      versions: [{ id: 'ver-a-1', versionNumber: 1 }],
      executableTestPlans: [{ id: 'plan-a-1', isExecutable: true }],
      testRuns: [{ status: 'PASSED', healingUsed: false }],
    },
    {
      id: 'tc-b-1',
      projectId: tenantB,
      testCaseKey: 'TC-B-001',
      title: 'Verify Ledger Balance',
      priority: 'HIGH',
      status: 'CONFIRMED',
      versions: [{ id: 'ver-b-1', versionNumber: 1 }],
      executableTestPlans: [{ id: 'plan-b-1', isExecutable: true }],
      testRuns: [{ status: 'PASSED', healingUsed: false }],
    },
  ];

  const mockPatchApprovals = [
    {
      id: 'patch-tenant-b-1',
      projectId: tenantB,
      baseRevision: 'commit-b-0',
      appliedRevision: 'commit-b-1',
      appliedUnifiedDiff:
        '--- a/src/ledger/financial.ts\n+++ b/src/ledger/financial.ts\n@@ -1,1 +1,1 @@\n- old\n+ new\n',
      affectedFiles: ['src/ledger/financial.ts'],
      patchProposal: {
        unifiedDiff: '--- a/src/ledger/financial.ts\n+++ b/src/ledger/financial.ts\n',
        primaryFilePath: 'src/ledger/financial.ts',
        primarySymbolName: 'getLedger',
        startLine: 1,
        endLine: 30,
      },
      failureCase: {
        testCaseId: 'tc-b-1',
      },
    },
  ];

  beforeEach(() => {
    changeSnapshots = [];
    retestPlans = [];

    const mockPrisma = {
      project: {
        findUnique: async ({ where }: any) => {
          if (where.id === tenantA || where.id === tenantB) {
            return { id: where.id, name: `Project ${where.id}` };
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
        count: async ({ where }: any) => {
          return mockRequirements.filter(r => r.projectId === where.projectId).length;
        },
      },
      projectSource: {
        findMany: async ({ where }: any) => {
          return [{ id: `src-${where.projectId}`, projectId: where.projectId }];
        },
      },
      repositoryFile: {
        findMany: async () => [],
      },
      testCase: {
        findMany: async ({ where }: any) => {
          return mockTestCases.filter(t => t.projectId === where.projectId);
        },
      },
      defectPatchApproval: {
        findUnique: async ({ where }: any) => {
          return mockPatchApprovals.find(p => p.id === where.id) || null;
        },
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

  it('rejects cross-project requirement change snapshot creation', async () => {
    // Tenant A attempts to create a change snapshot referencing Tenant B requirement
    await assert.rejects(
      async () => {
        await service.createChangeSnapshot({
          projectId: tenantA,
          sourceType: 'REQUIREMENT_CHANGE',
          sourceEntityId: 'req-tenant-b-1',
          title: 'Malicious Cross-Tenant Requirement Snapshot',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RetestProjectMismatchError);
        assert.ok((err as Error).message.includes(tenantA));
        return true;
      },
    );
  });

  it('rejects cross-project patch approval snapshot creation', async () => {
    // Tenant A attempts to create a change snapshot referencing Tenant B patch approval
    await assert.rejects(
      async () => {
        await service.createChangeSnapshot({
          projectId: tenantA,
          sourceType: 'APPROVED_PATCH',
          sourceEntityId: 'patch-tenant-b-1',
          title: 'Malicious Cross-Tenant Patch Snapshot',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RetestProjectMismatchError);
        assert.ok((err as Error).message.includes(tenantA));
        return true;
      },
    );
  });

  it('rejects planning retest with cross-project snapshot ID', async () => {
    // Legitimate Tenant B snapshot
    const snapB = await service.createChangeSnapshot({
      projectId: tenantB,
      sourceType: 'REQUIREMENT_CHANGE',
      sourceEntityId: 'req-tenant-b-1',
      title: 'Tenant B Valid Snapshot',
    });

    // Tenant A attempts to plan retest using Tenant B's snapshot
    await assert.rejects(
      async () => {
        await service.planRetest({
          projectId: tenantA,
          changeSnapshotId: snapB.id,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RetestProjectMismatchError);
        assert.ok((err as Error).message.includes(tenantA));
        return true;
      },
    );
  });

  it('rejects retrieving plan belonging to another project', async () => {
    const snapB = await service.createChangeSnapshot({
      projectId: tenantB,
      sourceType: 'REQUIREMENT_CHANGE',
      sourceEntityId: 'req-tenant-b-1',
      title: 'Tenant B Valid Snapshot',
    });
    const planB = await service.planRetest({
      projectId: tenantB,
      changeSnapshotId: snapB.id,
    });

    // Tenant A attempts to retrieve Tenant B's plan
    await assert.rejects(
      async () => {
        await service.getRetestPlan({
          projectId: tenantA,
          planId: planB.id,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RetestProjectMismatchError);
        return true;
      },
    );
  });

  it('rejects explaining test selection for cross-project test case', async () => {
    const snapA = await service.createChangeSnapshot({
      projectId: tenantA,
      sourceType: 'REQUIREMENT_CHANGE',
      sourceEntityId: 'req-tenant-a-1',
      title: 'Tenant A Valid Snapshot',
    });
    const planA = await service.planRetest({
      projectId: tenantA,
      changeSnapshotId: snapA.id,
    });

    // Request explanation for Tenant B test case in Tenant A's plan
    await assert.rejects(
      async () => {
        await service.explainTestSelection({
          projectId: tenantA,
          planId: planA.id,
          testCaseId: 'tc-b-1',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RetestValidationError);
        assert.ok((err as Error).message.includes('tc-b-1'));
        return true;
      },
    );
  });

  it('sanitizes and redacts secrets from diff text and configurations', async () => {
    const rawDiff = `--- a/config/auth.env
+++ b/config/auth.env
@@ -1,3 +1,3 @@
-API_KEY=old
+API_KEY=ghp_ABC1234567890abcdefghijklmnopqrstuv
+PASSWORD="super_secret_password_123!"
+BEARER_TOKEN="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.secret"
`;

    const snapshot = await service.createChangeSnapshot({
      projectId: tenantA,
      sourceType: 'MANUAL_FILE_CHANGE',
      title: 'Update Auth Config with Raw Secrets',
      diffText: rawDiff,
      changedFiles: ['config/auth.env'],
      changedConfiguration: {
        secretToken: 'sk-proj-1234567890abcdef',
        normalConfig: 'production',
      },
    });

    assert.ok(snapshot.diffText);
    assert.doesNotMatch(snapshot.diffText, /ghp_ABC1234567890abcdef/);
    assert.doesNotMatch(snapshot.diffText, /super_secret_password_123!/);
    assert.match(snapshot.diffText, /\[REDACTED_SECRET\]/);

    const plan = await service.planRetest({
      projectId: tenantA,
      changeSnapshotId: snapshot.id,
    });

    assert.equal(plan.status, 'COMPLETED');
  });

  it('rejects oversized diff text exceeding 2MB limit', async () => {
    const oversizedDiff = 'A'.repeat(RETEST_BOUNDS.MAX_DIFF_BYTES + 10);

    await assert.rejects(
      async () => {
        await service.createChangeSnapshot({
          projectId: tenantA,
          sourceType: 'COMMIT_DIFF',
          title: 'Oversized Commit Diff',
          diffText: oversizedDiff,
          changedFiles: ['large.file'],
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RetestValidationError);
        assert.ok((err as Error).message.includes('exceeds limit'));
        return true;
      },
    );
  });

  it('handles concurrency lock protection gracefully', async () => {
    const snapA = await service.createChangeSnapshot({
      projectId: tenantA,
      sourceType: 'REQUIREMENT_CHANGE',
      sourceEntityId: 'req-tenant-a-1',
      title: 'Tenant A Concurrency Snapshot',
    });

    // Run two simultaneous plans on same snapshot
    const promise1 = service.planRetest({
      projectId: tenantA,
      changeSnapshotId: snapA.id,
    });
    const promise2 = service.planRetest({
      projectId: tenantA,
      changeSnapshotId: snapA.id,
    });

    const [res1, res2] = await Promise.allSettled([promise1, promise2]);

    // Both should either succeed idempotently or one succeed and one reject with concurrency lock
    if (res1.status === 'fulfilled' && res2.status === 'fulfilled') {
      assert.equal(res1.value.id, res2.value.id);
    } else {
      const rejected =
        res1.status === 'rejected' ? res1.reason : res2.status === 'rejected' ? res2.reason : null;
      assert.ok(rejected instanceof RetestConcurrentAnalysisError);
    }
  });
});
