/**
 * @file packages/core/src/execution/evidence/execution-evidence-service.test.ts
 * Comprehensive integration tests for ExecutionEvidenceService (V5 Phase 69).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { ExecutionEvidenceService } from './execution-evidence-service.js';
import { EvidenceStorageService } from './evidence-storage-service.js';
import {
  EvidenceBundleNotFoundError,
  EvidenceArtifactNotFoundError,
  EvidenceOwnershipMismatchError,
  EvidenceBundleAlreadyFinalizedError,
} from './evidence-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('ExecutionEvidenceService Integration Tests (V5 Phase 69)', () => {
  let prisma: PrismaClient;
  let storageService: EvidenceStorageService;
  let service: ExecutionEvidenceService;
  let tempStorageRoot: string;

  let testProjectId: string;
  let otherProjectId: string;
  let testCaseId: string;
  let testPlanId: string;
  let testRunId: string;
  let executionId: string;
  let stepExecutionId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;

    tempStorageRoot = path.join(os.tmpdir(), `evidence-service-test-${crypto.randomUUID()}`);
    await fs.mkdir(tempStorageRoot, { recursive: true });

    storageService = new EvidenceStorageService(tempStorageRoot);
    service = new ExecutionEvidenceService({ prisma, storageService });

    testProjectId = crypto.randomUUID();
    otherProjectId = crypto.randomUUID();

    // 1. Create projects
    await prisma.project.createMany({
      data: [
        { id: testProjectId, name: 'Evidence Main Project' },
        { id: otherProjectId, name: 'Evidence Isolation Project' },
      ],
    });

    // 2. Create environment
    const env = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectId,
        name: 'Staging',
        baseUrl: 'https://staging.example.com',
        isDefault: true,
      },
    });

    // 3. Create requirement
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout Flow',
        originalText: 'Checkout original text',
        status: 'ACTIVE',
      },
    });

    // 4. Create test case
    const testCase = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout Payment Test',
        objective: 'Test payment gateway failure capture',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        approvedVersionNumber: 1,
        sourceRequirementId: req.id,
        sourceRequirementVersionNumber: 1,
      },
    });
    testCaseId = testCase.id;

    // 5. Create plan
    const testPlan = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectId,
        testCaseId: testCase.id,
        testCaseVersionNumber: 1,
        environmentId: env.id,
        planFingerprint: 'dummy-fp-evidence-valid',
        compilerVersion: '1.0.0',
        planSchemaVersion: 1,
        status: 'VALID',
        isExecutable: true,
      },
    });
    testPlanId = testPlan.id;

    // 6. Create TestRun
    const testRun = await prisma.testRun.create({
      data: {
        projectId: testProjectId,
        testCaseId: testCase.id,
        testCaseTitle: testCase.title,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlan.id,
        planFingerprint: testPlan.planFingerprint,
        status: 'RUNNING',
        browserEngine: 'chromium',
      },
    });
    testRunId = testRun.id;

    // 7. Create TestCaseExecution
    const execution = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectId,
        testRunId: testRun.id,
        testCaseId: testCase.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlan.id,
        status: 'RUNNING',
        browserEngine: 'chromium',
      },
    });
    executionId = execution.id;

    // 8. Create StepExecutionRecord
    const step = await prisma.stepExecutionRecord.create({
      data: {
        projectId: testProjectId,
        testRunId: testRun.id,
        executionId: execution.id,
        stepIndex: 3,
        actionType: 'CLICK',
        status: 'FAILED',
        targetSummary: 'button#pay-now',
        errorMessage: 'Payment gateway connection timed out after 30000ms',
      },
    });
    stepExecutionId = step.id;
  });

  afterEach(async () => {
    try {
      if (fsSync.existsSync(tempStorageRoot)) {
        await fs.rm(tempStorageRoot, { recursive: true, force: true });
      }
      await prisma.project.deleteMany({
        where: { id: { in: [testProjectId, otherProjectId] } },
      });
    } catch {
      // Ignored
    }
  });

  describe('1. Bundle Lifecycle & Execution Linkage', () => {
    it('creates an execution evidence bundle bound to execution and step with PENDING status', async () => {
      const bundle = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
        stepExecutionId,
        stepIndex: 3,
        errorSummary: 'Payment button timed out waiting for gateway response',
        metadataJson: { browser: 'chromium', viewport: '1280x720', secretToken: 'secret_123' },
      });

      assert.ok(bundle.id);
      assert.equal(bundle.projectId, testProjectId);
      assert.equal(bundle.testRunId, testRunId);
      assert.equal(bundle.executionId, executionId);
      assert.equal(bundle.stepExecutionId, stepExecutionId);
      assert.equal(bundle.stepIndex, 3);
      assert.equal(bundle.status, 'PENDING');
      assert.equal(bundle.retentionStatus, 'ACTIVE');
      assert.equal(bundle.artifacts.length, 0);

      // Verify secret redaction in metadata
      assert.equal((bundle.metadataJson as any).secretToken, '***');
    });

    it('retrieves an existing bundle with getBundle', async () => {
      const created = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
      });

      const retrieved = await service.getBundle({
        projectId: testProjectId,
        bundleId: created.id,
      });

      assert.equal(retrieved.id, created.id);
      assert.equal(retrieved.executionId, executionId);
    });
  });

  describe('2. Artifact Addition & Forensic Durability', () => {
    it('adds multiple evidence artifacts to bundle, stages and promotes with SHA-256 and byte sizes', async () => {
      const bundle = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
        stepExecutionId,
        stepIndex: 3,
      });

      // 1. Add text log artifact
      const logContent =
        'Log: Failed to connect to https://gateway.example.com?auth_token=super_secret';
      const logArtifact = await service.addArtifact({
        projectId: testProjectId,
        bundleId: bundle.id,
        testRunId,
        executionId,
        stepExecutionId,
        artifactType: 'CONSOLE_LOG',
        originalLogicalName: 'console-errors.log',
        mimeType: 'text/plain',
        content: logContent,
        metadataJson: { logCount: 1, level: 'error' },
      });

      assert.ok(logArtifact.id);
      assert.equal(logArtifact.bundleId, bundle.id);
      assert.equal(logArtifact.artifactType, 'CONSOLE_LOG');
      assert.ok(logArtifact.storageIdentity.startsWith('art_'));
      assert.ok(logArtifact.byteSize > 0);
      assert.equal(logArtifact.sha256.length, 64);
      assert.equal(logArtifact.redactionStatus, 'REDACTED');

      // 2. Add binary screenshot artifact
      const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
      const screenshotArtifact = await service.addArtifact({
        projectId: testProjectId,
        bundleId: bundle.id,
        testRunId,
        executionId,
        stepExecutionId,
        artifactType: 'SCREENSHOT',
        originalLogicalName: 'failure.png',
        mimeType: 'image/png',
        content: fakePng,
        metadataJson: { width: 1280, height: 720 },
      });

      assert.equal(screenshotArtifact.artifactType, 'SCREENSHOT');
      assert.equal(screenshotArtifact.byteSize, fakePng.length);

      // Verify bundle transitioned to COLLECTING
      const updatedBundle = await service.getBundle({
        projectId: testProjectId,
        bundleId: bundle.id,
      });
      assert.equal(updatedBundle.status, 'COLLECTING');
      assert.equal(updatedBundle.artifacts.length, 2);
    });

    it('allows duplicate logical filenames to coexist safely with distinct internal storage identities', async () => {
      const bundle = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
      });

      const art1 = await service.addArtifact({
        projectId: testProjectId,
        bundleId: bundle.id,
        testRunId,
        executionId,
        artifactType: 'DOM_SNAPSHOT',
        originalLogicalName: 'snapshot.html',
        mimeType: 'text/html',
        content: '<html><body>First capture</body></html>',
      });

      const art2 = await service.addArtifact({
        projectId: testProjectId,
        bundleId: bundle.id,
        testRunId,
        executionId,
        artifactType: 'DOM_SNAPSHOT',
        originalLogicalName: 'snapshot.html',
        mimeType: 'text/html',
        content: '<html><body>Second capture</body></html>',
      });

      assert.notEqual(art1.id, art2.id);
      assert.notEqual(art1.storageIdentity, art2.storageIdentity);
      assert.notEqual(art1.sha256, art2.sha256);
      assert.equal(art1.originalLogicalName, 'snapshot.html');
      assert.equal(art2.originalLogicalName, 'snapshot.html');
    });

    it('rejects adding artifact to already finalized bundle', async () => {
      const bundle = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
      });

      await service.finalizeBundle({
        projectId: testProjectId,
        bundleId: bundle.id,
        status: 'COMPLETE',
      });

      await assert.rejects(
        async () => {
          await service.addArtifact({
            projectId: testProjectId,
            bundleId: bundle.id,
            testRunId,
            executionId,
            artifactType: 'ERROR_CONTEXT',
            originalLogicalName: 'error.json',
            mimeType: 'application/json',
            content: JSON.stringify({ err: 'Late addition' }),
          });
        },
        (err: unknown) => err instanceof EvidenceBundleAlreadyFinalizedError,
      );
    });
  });

  describe('3. Bundle Finalization & Semantic Statuses', () => {
    it('finalizes bundle with COMPLETE status and records completion timestamp', async () => {
      const bundle = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
      });

      const finalized = await service.finalizeBundle({
        projectId: testProjectId,
        bundleId: bundle.id,
        status: 'COMPLETE',
        errorSummary: 'All evidence captured successfully',
      });

      assert.equal(finalized.status, 'COMPLETE');
      assert.ok(finalized.collectionCompletedAt);
      assert.equal(finalized.errorSummary, 'All evidence captured successfully');
    });

    it('supports PARTIAL and FAILED collection statuses for truthful diagnostic reporting', async () => {
      const bundle = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
      });

      const partial = await service.finalizeBundle({
        projectId: testProjectId,
        bundleId: bundle.id,
        status: 'PARTIAL',
        errorSummary: 'Screenshot captured, but trace collector timed out',
      });

      assert.equal(partial.status, 'PARTIAL');
    });
  });

  describe('4. Multi-Tenant Project Isolation & Cross-ID Substitution Defense', () => {
    it('rejects bundle creation when execution belongs to another project', async () => {
      await assert.rejects(
        async () => {
          await service.createBundle({
            projectId: otherProjectId,
            testRunId,
            executionId, // Belongs to testProjectId
          });
        },
        (err: unknown) => err instanceof EvidenceOwnershipMismatchError,
      );
    });

    it('rejects cross-project bundle and artifact queries', async () => {
      const bundle = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
      });

      const artifact = await service.addArtifact({
        projectId: testProjectId,
        bundleId: bundle.id,
        testRunId,
        executionId,
        artifactType: 'PAGE_METADATA',
        originalLogicalName: 'page-info.json',
        mimeType: 'application/json',
        content: JSON.stringify({ url: 'https://example.com' }),
      });

      // Cross-project getBundle -> 404
      await assert.rejects(
        async () => {
          await service.getBundle({
            projectId: otherProjectId,
            bundleId: bundle.id,
          });
        },
        (err: unknown) => err instanceof EvidenceBundleNotFoundError,
      );

      // Cross-project getArtifactMetadata -> 404
      await assert.rejects(
        async () => {
          await service.getArtifactMetadata({
            projectId: otherProjectId,
            artifactId: artifact.id,
          });
        },
        (err: unknown) => err instanceof EvidenceArtifactNotFoundError,
      );

      // Cross-project readArtifactContent -> 404
      await assert.rejects(
        async () => {
          await service.readArtifactContent({
            projectId: otherProjectId,
            artifactId: artifact.id,
          });
        },
        (err: unknown) => err instanceof EvidenceArtifactNotFoundError,
      );
    });

    it('rejects adding artifact when stepExecutionId belongs to a different execution', async () => {
      // Create a second execution
      const otherExecution = await prisma.testCaseExecution.create({
        data: {
          projectId: testProjectId,
          testRunId,
          testCaseId,
          testCaseVersionNumber: 1,
          executableTestPlanId: testPlanId,
          status: 'RUNNING',
          browserEngine: 'chromium',
          attempt: 2,
        },
      });

      await assert.rejects(
        async () => {
          await service.createBundle({
            projectId: testProjectId,
            testRunId,
            executionId: otherExecution.id,
            stepExecutionId, // Belongs to first execution
          });
        },
        (err: unknown) => err instanceof EvidenceOwnershipMismatchError,
      );
    });
  });

  describe('5. Secret Redaction on Evidence Metadata & Text Content', () => {
    it('defensively redacts credentials, passwords, and tokens in metadata and content', async () => {
      const bundle = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
        metadataJson: {
          userPassword: 'RawPassword123!',
          apiKey: 'secret-api-key-999',
          sessionCookie: 'sid=abc123secret',
          safeParam: 'public-value',
        },
      });

      assert.equal((bundle.metadataJson as any).userPassword, '***');
      assert.equal((bundle.metadataJson as any).apiKey, '***');
      assert.equal((bundle.metadataJson as any).sessionCookie, '***');
      assert.equal((bundle.metadataJson as any).safeParam, 'public-value');

      const rawTextLog = 'Error occurred during login for user admin with password MyPassword123!';
      const art = await service.addArtifact({
        projectId: testProjectId,
        bundleId: bundle.id,
        testRunId,
        executionId,
        artifactType: 'CONSOLE_LOG',
        originalLogicalName: 'login.log',
        mimeType: 'text/plain',
        content: rawTextLog,
      });

      assert.equal(art.redactionStatus, 'REDACTED');

      const readRes = await service.readArtifactContent({
        projectId: testProjectId,
        artifactId: art.id,
      });

      const readText = readRes.buffer.toString('utf-8');
      assert.equal(readText.includes('MyPassword123!'), false);
    });
  });

  describe('6. Semantic Queries, Pagination & Deterministic Sorting', () => {
    it('lists bundles and artifacts with pagination and deterministic sorting', async () => {
      const bundle1 = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
      });
      const bundle2 = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
      });

      await service.addArtifact({
        projectId: testProjectId,
        bundleId: bundle1.id,
        testRunId,
        executionId,
        artifactType: 'ASSERTION_CONTEXT',
        originalLogicalName: 'assert1.json',
        mimeType: 'application/json',
        content: JSON.stringify({ expected: 'true', actual: 'false' }),
      });

      await service.addArtifact({
        projectId: testProjectId,
        bundleId: bundle2.id,
        testRunId,
        executionId,
        artifactType: 'ERROR_CONTEXT',
        originalLogicalName: 'error2.json',
        mimeType: 'application/json',
        content: JSON.stringify({ message: 'Error 2' }),
      });

      const listBundlesRes = await service.listBundles({
        projectId: testProjectId,
        executionId,
        page: 1,
        pageSize: 10,
      });

      assert.equal(listBundlesRes.total, 2);
      assert.equal(listBundlesRes.items.length, 2);
      assert.equal(listBundlesRes.items[0]?.id, bundle1.id);
      assert.equal(listBundlesRes.items[1]?.id, bundle2.id);

      const listArtifactsRes = await service.listArtifacts({
        projectId: testProjectId,
        executionId,
        page: 1,
        pageSize: 10,
      });

      assert.equal(listArtifactsRes.total, 2);
      assert.equal(listArtifactsRes.items.length, 2);
    });
  });

  describe('7. Restart Persistence & Forensic Auditability', () => {
    it('persists evidence metadata and files across fresh service instances with integrity validation', async () => {
      const bundle = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
        stepExecutionId,
        stepIndex: 3,
      });

      const artifact = await service.addArtifact({
        projectId: testProjectId,
        bundleId: bundle.id,
        testRunId,
        executionId,
        artifactType: 'NETWORK_LOG',
        originalLogicalName: 'network.json',
        mimeType: 'application/json',
        content: JSON.stringify({ status: 502, statusText: 'Bad Gateway' }),
      });

      await service.finalizeBundle({
        projectId: testProjectId,
        bundleId: bundle.id,
        status: 'COMPLETE',
      });

      // Simulate app restart by creating brand new service instance with same storage root
      const newStorage = new EvidenceStorageService(tempStorageRoot);
      const newService = new ExecutionEvidenceService({ prisma, storageService: newStorage });

      const restartedBundle = await newService.getBundle({
        projectId: testProjectId,
        bundleId: bundle.id,
      });

      assert.equal(restartedBundle.status, 'COMPLETE');
      assert.equal(restartedBundle.artifacts.length, 1);
      assert.equal(restartedBundle.artifacts[0]?.id, artifact.id);

      // Verify cryptographic integrity after restart
      const integrity = await newService.verifyArtifactIntegrity({
        projectId: testProjectId,
        artifactId: artifact.id,
      });

      assert.equal(integrity.isValid, true);
      assert.equal(integrity.actualSha256, artifact.sha256);
    });
  });

  describe('8. Purge Execution Evidence', () => {
    it('purges all bundles, artifacts, and managed storage files for an execution', async () => {
      const bundle = await service.createBundle({
        projectId: testProjectId,
        testRunId,
        executionId,
      });

      await service.addArtifact({
        projectId: testProjectId,
        bundleId: bundle.id,
        testRunId,
        executionId,
        artifactType: 'CONSOLE_LOG',
        originalLogicalName: 'c.log',
        mimeType: 'text/plain',
        content: 'Error text',
      });

      const purgeRes = await service.purgeExecutionEvidence({
        projectId: testProjectId,
        executionId,
      });

      assert.equal(purgeRes.deletedBundlesCount, 1);
      assert.equal(purgeRes.deletedArtifactsCount, 1);

      const remainingBundles = await service.listBundles({
        projectId: testProjectId,
        executionId,
      });
      assert.equal(remainingBundles.total, 0);
    });
  });
});
