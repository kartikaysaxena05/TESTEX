/**
 * @file packages/core/src/failures/evidence/failure-evidence-concurrency.test.ts
 * Concurrency and idempotency tests for Failure Evidence Ingestion (V6 Phase 75).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FailureEvidenceIngestionService } from './failure-evidence-ingestion-service.js';

describe('Failure Evidence Ingestion Concurrency & Idempotency (Phase 75)', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const failureCaseId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const executionId = '33333333-3333-3333-3333-333333333333';

  it('handles concurrent ingestion calls on the same failure case without race conditions or duplication', async () => {
    const existingReferences: any[] = [];

    const mockPrisma: any = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId,
          executionId,
          testRunId: 'run-1',
          testCaseId: 'tc-1',
          testCaseVersionNumber: 1,
          triggeringExecutionStatus: 'FAILED',
          title: 'Case Title',
          testCase: { id: 'tc-1', sourceRequirementId: null, sourceRequirementKey: null },
        }),
        update: async () => ({ id: failureCaseId }),
      },
      testCaseExecution: {
        findUniqueOrThrow: async () => ({
          id: executionId,
          projectId,
          testRunId: 'run-1',
          attempt: 1,
          status: 'FAILED',
          browserEngine: 'chromium',
          stepExecutions: [],
          assertionExecutionRecords: [],
          locatorHealingAttempts: [],
          evidenceBundles: [
            {
              id: 'bundle-1',
              artifacts: [
                {
                  id: 'art-1',
                  projectId,
                  bundleId: 'bundle-1',
                  artifactType: 'SCREENSHOT',
                  storageIdentity: 'shot1.png',
                  originalLogicalName: 'shot1.png',
                  mimeType: 'image/png',
                  byteSize: 2048,
                  sha256: 'abc123hash',
                  metadataJson: {},
                },
              ],
            },
          ],
        }),
        findMany: async () => [],
      },
      failureEvidenceReference: {
        findFirst: async ({ where }: { where: any }) => {
          return existingReferences.find(
            r =>
              r.failureCaseId === where.failureCaseId &&
              r.sourceArtifactId === where.sourceArtifactId,
          );
        },
        create: async ({ data }: { data: any }) => {
          const created = {
            id: `ref-${existingReferences.length + 1}`,
            ...data,
            attachedAt: new Date(),
          };
          existingReferences.push(created);
          return created;
        },
        findMany: async () => existingReferences,
        update: async () => ({}),
      },
      $transaction: (() => {
        let currentLock = Promise.resolve();
        return async (callback: (tx: any) => Promise<any>) => {
          const prev = currentLock;
          let release: () => void;
          currentLock = new Promise(resolve => {
            release = resolve;
          });
          await prev;
          try {
            return await callback(mockPrisma);
          } finally {
            release!();
          }
        };
      })(),
    };

    const service = new FailureEvidenceIngestionService({
      prisma: mockPrisma,
      verifier: {
        verifyReference: async () => ({ status: 'VERIFIED', details: null }),
        verifyBatch: async () => ({
          overallIntegrity: 'VERIFIED',
          itemsVerified: 1,
          itemsMissing: 0,
          itemsCorrupt: 0,
          itemsUnavailable: 0,
          itemReports: [],
        }),
      } as any,
    });

    // Launch 3 concurrent ingestion requests
    const [res1, res2, res3] = await Promise.all([
      service.ingestEvidence({ projectId, failureCaseId, revalidateIntegrity: false }),
      service.ingestEvidence({ projectId, failureCaseId, revalidateIntegrity: false }),
      service.ingestEvidence({ projectId, failureCaseId, revalidateIntegrity: false }),
    ]);

    assert.ok(res1.failureSignature);
    assert.equal(res2.failureSignature, res1.failureSignature);
    assert.equal(res3.failureSignature, res1.failureSignature);
    // Only 1 reference created despite 3 concurrent calls
    assert.equal(existingReferences.length, 1);
  });
});
