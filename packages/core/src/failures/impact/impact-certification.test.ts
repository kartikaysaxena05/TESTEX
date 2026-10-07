/**
 * @file packages/core/src/failures/impact/impact-certification.test.ts
 * Comprehensive certification test suite for V6 Phase 84 Severity, Priority & Impact Intelligence.
 * Covers Scenarios A through H, dynamic staleness detection, and revision lineage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureImpactAssessmentService } from './failure-impact-assessment-service.js';
import {
  defectSeveritySchema,
  defectPrioritySchema,
  releaseRecommendationSchema,
} from '@ai-quality/contracts';

test('V6 Phase 84: Severity, Priority & Impact Intelligence Certification', async t => {
  const client = getPrismaClient();
  if (!client) {
    throw new Error('Prisma client unavailable');
  }
  const prisma: PrismaClient = client;
  const service = new FailureImpactAssessmentService(prisma);

  // Helper to create test fixtures
  async function createFixture(params: {
    projectName: string;
    errorMessage?: string | null;
    reqCriticality?: string | null;
    tcPriority?: string | null;
    domain?: string | null;
    layer?: string | null;
    hasEvidence?: boolean;
    evidenceType?: string;
    evidenceMeta?: Record<string, unknown>;
  }) {
    const projectId = crypto.randomUUID();
    await prisma.project.create({ data: { id: projectId, name: params.projectName } });

    let reqId: string | null = null;
    if (params.reqCriticality) {
      const req = await prisma.requirement.create({
        data: {
          projectId,
          requirementKey: `REQ-CERT-84-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: 'Cert Requirement',
          originalText: 'System must certify severity and priority intelligence',
        },
      });
      reqId = req.id;
    }

    const tc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: `TC-CERT-84-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: 'Cert Test Case',
        objective: 'Certify impact intelligence',
        currentVersionNumber: 1,
        sourceRequirementId: reqId,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: `plan-cert-84-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        summary: 'Cert Plan',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const tr = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        planFingerprint: plan.planFingerprint,
        testCaseTitle: tc.title,
      },
    });

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId,
        testRunId: tr.id,
        testCaseId: tc.id,
        testCaseVersionId: null,
        executableTestPlanId: plan.id,
        testCaseVersionNumber: 1,
        status: 'FAILED',
        errorMessage: params.errorMessage ?? 'Execution failed with error',
        environmentSnapshotJson: { os: 'darwin', env: 'STAGING' },
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId,
        executionId: exec.id,
        testRunId: tr.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        stepIndex: 1,
        title: 'Cert Failure Case',
        errorMessage: params.errorMessage ?? 'Execution failed with error',
        failureSignature: `sig-cert-84-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        isEligible: true,
      },
    });

    if (params.domain) {
      await prisma.failureDomainSeparation.create({
        data: {
          projectId,
          failureCaseId: fc.id,
          testCaseId: tc.id,
          domain: params.domain as any,
          domainSubreason: 'OperationalTriage',
          primaryRationale: 'Domain separation result',
          decisionExplanation: 'Tested domain separation',
          separationFingerprint: `sep-fp-${Date.now()}`,
          isAuthoritative: true,
        },
      });
    }

    if (params.layer) {
      await prisma.failureTechnicalLocalization.create({
        data: {
          projectId,
          failureCaseId: fc.id,
          testCaseId: tc.id,
          primaryLayer: params.layer as any,
          primaryTargetType: 'API_ENDPOINT',
          primaryTargetIdentifier: '/api/v1/resource',
          localizationRationale: 'Local layer identified',
          localizationFingerprint: `loc-fp-${Date.now()}`,
          isAuthoritative: true,
        },
      });
    }

    if (params.hasEvidence) {
      await prisma.failureEvidenceReference.create({
        data: {
          projectId,
          failureCaseId: fc.id,
          executionId: exec.id,
          artifactType: (params.evidenceType as any) ?? 'CONSOLE_LOG',
          logicalName: 'console.log',
          storageIdentity: 'local',
          sha256: crypto.createHash('sha256').update('evidence-cert').digest('hex'),
          byteSize: 256,
          mimeType: 'text/plain',
          metadataJson: (params.evidenceMeta as any) ?? {},
        },
      });
    }

    return { projectId, failureCaseId: fc.id, testCaseId: tc.id, executionId: exec.id };
  }

  // ---------------------------------------------------------------------------
  // Scenario A — Critical Defect
  // ---------------------------------------------------------------------------
  await t.test(
    'Scenario A — Critical Defect: Authorization Bypass & Total Outage evaluate to CRITICAL',
    async () => {
      const fixture = await createFixture({
        projectName: 'Cert Scenario A',
        errorMessage:
          'Security control bypass: authentication bypass detected in JWT token validation',
        layer: 'AUTHENTICATION',
        hasEvidence: true,
      });

      const result = await service.assessImpact({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });

      assert.equal(result.severity, 'CRITICAL');
      assert.equal(result.securityImpact, 'AUTHENTICATION_BYPASS');
      assert.equal(result.releaseRecommendation, 'BLOCK_RELEASE');
      assert.ok(defectSeveritySchema.safeParse(result.severity).success);
      assert.ok(defectPrioritySchema.safeParse(result.priority).success);
      assert.ok(releaseRecommendationSchema.safeParse(result.releaseRecommendation).success);
    },
  );

  // ---------------------------------------------------------------------------
  // Scenario B — High Severity
  // ---------------------------------------------------------------------------
  await t.test(
    'Scenario B — High Severity: Major workflow unavailable with 500 error evaluates to HIGH',
    async () => {
      const fixture = await createFixture({
        projectName: 'Cert Scenario B',
        errorMessage: 'Persistent HTTP 500 Internal Server Error during checkout order creation',
        reqCriticality: 'HIGH',
        tcPriority: 'HIGH',
        hasEvidence: true,
        evidenceType: 'NETWORK_REQUEST',
        evidenceMeta: { requests: [{ url: '/api/v1/checkout', status: 500 }] },
      });

      const result = await service.assessImpact({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });

      assert.equal(result.severity, 'HIGH');
      assert.equal(result.workaroundStatus, 'NO_WORKAROUND');
      assert.equal(result.releaseRecommendation, 'BLOCK_RELEASE');
    },
  );

  // ---------------------------------------------------------------------------
  // Scenario C — Medium Severity
  // ---------------------------------------------------------------------------
  await t.test(
    'Scenario C — Medium Severity: Non-critical feature impaired evaluates to MEDIUM',
    async () => {
      const fixture = await createFixture({
        projectName: 'Cert Scenario C',
        errorMessage: 'Dropdown sort order was descending instead of ascending on search results',
        reqCriticality: 'STANDARD',
        tcPriority: 'NORMAL',
        hasEvidence: true,
      });

      const result = await service.assessImpact({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });

      assert.equal(result.severity, 'MEDIUM');
      assert.equal(result.priority, 'P2_NORMAL');
      assert.equal(result.releaseRecommendation, 'REVIEW_REQUIRED');
    },
  );

  // ---------------------------------------------------------------------------
  // Scenario D — Low Severity
  // ---------------------------------------------------------------------------
  await t.test(
    'Scenario D — Low Severity: Minor cosmetic discrepancy evaluates to LOW',
    async () => {
      const fixture = await createFixture({
        projectName: 'Cert Scenario D',
        errorMessage: 'Element margin alignment 2px typo variance on footer notice',
        reqCriticality: 'LOW',
        tcPriority: 'LOW',
        hasEvidence: true,
      });

      const result = await service.assessImpact({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });

      assert.equal(result.severity, 'LOW');
      assert.equal(result.priority, 'P3_LOW');
      assert.equal(result.dataImpact, 'DISPLAY_ONLY');
      assert.equal(result.releaseRecommendation, 'NON_BLOCKING');
    },
  );

  // ---------------------------------------------------------------------------
  // Scenario E — Severity vs Priority Difference
  // ---------------------------------------------------------------------------
  await t.test(
    'Scenario E — Severity vs Priority: Medium severity with release blocking evaluates to P1',
    async () => {
      const fixture = await createFixture({
        projectName: 'Cert Scenario E',
        errorMessage: 'Secondary filter options mismatch in report generator',
        reqCriticality: 'MEDIUM',
        tcPriority: 'NORMAL',
        hasEvidence: true,
      });

      const result = await service.assessImpact({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
        releaseBlockingOverride: true, // Force release blocker
      });

      // Proves severity and priority are NOT hardwired together!
      assert.equal(result.severity, 'MEDIUM');
      assert.equal(result.priority, 'P1_URGENT');
      assert.equal(result.releaseRecommendation, 'BLOCK_RELEASE');
    },
  );

  // ---------------------------------------------------------------------------
  // Scenario F — Unknown (Sparse Evidence)
  // ---------------------------------------------------------------------------
  await t.test(
    'Scenario F — Unknown: Zero diagnostic telemetry preserves truthful UNKNOWN (no inflation)',
    async () => {
      const fixture = await createFixture({
        projectName: 'Cert Scenario F',
        errorMessage: null,
        hasEvidence: false,
      });

      // Directly clear error message on failure case
      await prisma.failureCase.update({
        where: { id: fixture.failureCaseId },
        data: { errorMessage: null, title: 'Blank Error' },
      });
      await prisma.testCaseExecution.update({
        where: { id: fixture.executionId },
        data: { errorMessage: null },
      });

      const result = await service.assessImpact({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });

      assert.equal(result.severity, 'UNKNOWN');
      assert.equal(result.priority, 'UNKNOWN');
      assert.equal(result.releaseRecommendation, 'UNKNOWN');
    },
  );

  // ---------------------------------------------------------------------------
  // Scenario G — Data Impact Distinction
  // ---------------------------------------------------------------------------
  await t.test(
    'Scenario G — Data Impact: Demonstrates factual distinction without collapsing categories',
    async () => {
      // 1. Display Only
      const displayFix = await createFixture({
        projectName: 'Data Display Only',
        errorMessage:
          'Expected table cell text to display formatted currency but displayed raw float',
        hasEvidence: true,
      });
      const displayRes = await service.assessImpact({
        projectId: displayFix.projectId,
        failureCaseId: displayFix.failureCaseId,
      });
      assert.equal(displayRes.dataImpact, 'DISPLAY_ONLY');

      // 2. Write Failure
      const writeFix = await createFixture({
        projectName: 'Data Write Failure',
        errorMessage: 'Failed to save form record during POST mutation request',
        hasEvidence: true,
      });
      const writeRes = await service.assessImpact({
        projectId: writeFix.projectId,
        failureCaseId: writeFix.failureCaseId,
      });
      assert.equal(writeRes.dataImpact, 'FAILED_WRITE');

      // 3. Data Corruption
      const corruptFix = await createFixture({
        projectName: 'Data Corruption',
        errorMessage:
          'Fatal database error: irreversible data corruption in customer financial balance table',
        hasEvidence: true,
      });
      const corruptRes = await service.assessImpact({
        projectId: corruptFix.projectId,
        failureCaseId: corruptFix.failureCaseId,
      });
      assert.equal(corruptRes.dataImpact, 'DATA_CORRUPTION');
    },
  );

  // ---------------------------------------------------------------------------
  // Scenario H — No Application Severity (Operational Failure)
  // ---------------------------------------------------------------------------
  await t.test(
    'Scenario H — No Application Severity: AUTOMATION_FAILURE produces NOT_APPLICABLE',
    async () => {
      const fixture = await createFixture({
        projectName: 'Cert Scenario H',
        errorMessage: 'Timeout waiting for Playwright locator button',
        domain: 'AUTOMATION_FAILURE',
        hasEvidence: true,
      });

      const result = await service.assessImpact({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });

      assert.equal(result.severity, 'NOT_APPLICABLE');
      assert.equal(result.priority, 'P3_LOW');
      assert.equal(result.releaseRecommendation, 'NON_BLOCKING');
    },
  );

  // ---------------------------------------------------------------------------
  // Dynamic Staleness Detection
  // ---------------------------------------------------------------------------
  await t.test(
    'Dynamic Staleness: Marks assessment stale on passive read when new evidence arrives',
    async () => {
      const fixture = await createFixture({
        projectName: 'Staleness Detection Cert',
        errorMessage: 'Original error in billing calculation',
        hasEvidence: true,
      });

      const initial = await service.assessImpact({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });
      assert.equal(initial.isStale, false);

      // Initial passive read should be fresh
      const readFresh = await service.getImpactAssessment({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });
      assert.ok(readFresh);
      assert.equal(readFresh.isStale, false);

      // Attach a newer evidence reference in the future
      const futureDate = new Date(Date.now() + 5000);
      await prisma.failureEvidenceReference.create({
        data: {
          projectId: fixture.projectId,
          failureCaseId: fixture.failureCaseId,
          executionId: fixture.executionId,
          artifactType: 'DOM_SNAPSHOT',
          logicalName: 'future.html',
          storageIdentity: 'local',
          sha256: crypto.createHash('sha256').update('future-dom').digest('hex'),
          byteSize: 100,
          mimeType: 'text/html',
          attachedAt: futureDate,
        },
      });

      // Passive read should dynamically detect staleness without recomputation
      const readStale = await service.getImpactAssessment({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });
      assert.ok(readStale);
      assert.equal(readStale.isStale, true);
      assert.ok(readStale.stalenessReason?.includes('new evidence artifact(s) attached'));
    },
  );

  // ---------------------------------------------------------------------------
  // Revision Lineage and History
  // ---------------------------------------------------------------------------
  await t.test(
    'Revision Lineage: Re-assessing creates authoritative record with supersede pointer',
    async () => {
      const fixture = await createFixture({
        projectName: 'Revision Lineage Cert',
        errorMessage: 'Original calculation discrepancy',
        hasEvidence: true,
      });

      const first = await service.assessImpact({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });

      const reassessed = await service.reassessImpact({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
        reassessmentReason: 'Re-assessed after QA lead verified lack of workaround',
        releaseBlockingOverride: true,
      });

      assert.notEqual(first.id, reassessed.id);
      assert.equal(reassessed.isAuthoritative, true);
      assert.equal(reassessed.reassessmentCount, 1);
      assert.equal(
        reassessed.reassessmentReason,
        'Re-assessed after QA lead verified lack of workaround',
      );

      // Verify previous record in database was marked non-authoritative and superseded
      const prevInDb = await prisma.failureImpactAssessment.findUniqueOrThrow({
        where: { id: first.id },
      });
      assert.equal(prevInDb.isAuthoritative, false);
      assert.equal(prevInDb.supersededById, reassessed.id);

      // List history returns both in descending chronological order
      const history = await service.listImpactHistory({
        projectId: fixture.projectId,
        failureCaseId: fixture.failureCaseId,
      });
      assert.equal(history.length, 2);
      assert.equal(history[0]?.id, reassessed.id);
      assert.equal(history[1]?.id, first.id);
    },
  );
});
