/**
 * @file packages/core/src/failures/evidence/failure-evidence-security.test.ts
 * Multi-tenant isolation and security boundary tests for Failure Evidence Ingestion (V6 Phase 75).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FailureEvidenceIngestionService } from './failure-evidence-ingestion-service.js';
import { FailureCaseNotFoundError, CrossProjectAccessDeniedError } from '../failure-errors.js';
import { EvidenceReferenceNotFoundError } from './failure-evidence-errors.js';

describe('Failure Evidence Security & Multi-Tenant Boundaries (Phase 75)', () => {
  const projectA = '11111111-1111-1111-1111-111111111111';
  const projectB = '22222222-2222-2222-2222-222222222222';
  const caseA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const executionA = '33333333-3333-3333-3333-333333333333';
  const referenceA = '44444444-4444-4444-4444-444444444444';

  it('rejects evidence ingestion when requested for a failure case belonging to another project', async () => {
    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => ({
          id: caseA,
          projectId: projectA, // Case belongs to Project A
          executionId: executionA,
        }),
      },
    };

    const service = new FailureEvidenceIngestionService({ prisma: mockPrisma });

    // Request from Project B
    await assert.rejects(
      async () => {
        await service.ingestEvidence({
          projectId: projectB,
          failureCaseId: caseA,
        });
      },
      (err: any) => err instanceof FailureCaseNotFoundError,
    );
  });

  it('rejects execution evidence when underlying execution belongs to a different project', async () => {
    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => ({
          id: caseA,
          projectId: projectA,
          executionId: executionA,
          testCase: {
            id: '55555555-5555-5555-5555-555555555555',
            sourceRequirementId: null,
            sourceRequirementKey: null,
          },
        }),
      },
      testCaseExecution: {
        findUniqueOrThrow: async () => ({
          id: executionA,
          projectId: projectB, // Malicious mismatch: execution belongs to Project B
          testRunId: '66666666-6666-6666-6666-666666666666',
          attempt: 1,
          status: 'FAILED',
          browserEngine: 'chromium',
          stepExecutions: [],
          assertionExecutionRecords: [],
          locatorHealingAttempts: [],
          evidenceBundles: [],
        }),
      },
    };

    const service = new FailureEvidenceIngestionService({ prisma: mockPrisma });

    await assert.rejects(
      async () => {
        await service.ingestEvidence({
          projectId: projectA,
          failureCaseId: caseA,
        });
      },
      (err: any) => err instanceof CrossProjectAccessDeniedError,
    );
  });

  it('rejects reading evidence artifact content across project boundaries', async () => {
    const mockPrisma: any = {
      failureEvidenceReference: {
        findUnique: async () => ({
          id: referenceA,
          projectId: projectA, // Reference belongs to Project A
          failureCaseId: caseA,
          artifactType: 'SCREENSHOT',
          logicalName: 'screenshot.png',
        }),
      },
    };

    const service = new FailureEvidenceIngestionService({ prisma: mockPrisma });

    // Request from Project B
    await assert.rejects(
      async () => {
        await service.getEvidenceArtifactContent({
          projectId: projectB,
          failureCaseId: caseA,
          referenceId: referenceA,
        });
      },
      (err: any) => err instanceof EvidenceReferenceNotFoundError,
    );
  });
});
