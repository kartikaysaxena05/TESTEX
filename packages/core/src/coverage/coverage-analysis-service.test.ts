/**
 * @file packages/core/src/coverage/coverage-analysis-service.test.ts
 * Integration test suite for CoverageAnalysisService and DimensionRequirementEngine.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CoverageAnalysisService } from './coverage-analysis-service.js';
import { deriveRequiredDimensions } from './dimension-requirement-engine.js';
import { getPrismaClient } from '../database/index.js';
import { RequirementTestTraceService } from '../traceability/requirement-test-trace-service.js';
import { TestCaseService } from '../test-cases/test-case-service.js';
import { RequirementVersionService } from '../requirements/versioning/requirement-version-service.js';

describe('CoverageAnalysisService Integration', () => {
  const prisma = getPrismaClient()!;
  const coverageService = new CoverageAnalysisService(prisma);
  const traceService = new RequirementTestTraceService(prisma);
  const testCaseService = new TestCaseService(prisma);
  const versionService = new RequirementVersionService();

  let testProjectId: string;

  before(async () => {
    const project = await prisma.project.create({
      data: {
        name: `Coverage Test Project ${Date.now()}`,
        description: 'Test project for coverage intelligence',
      },
    });
    testProjectId = project.id;
  });

  after(async () => {
    if (testProjectId) {
      await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
    }
  });

  it('handles empty project without errors or divide-by-zero', async () => {
    const summary = await coverageService.getProjectCoverageSummary({
      projectId: testProjectId,
    });
    assert.equal(summary.totalRequirements, 0);
    assert.equal(summary.eligibleRequirements, 0);
    assert.equal(summary.coveredCount, 0);
    assert.equal(summary.overallCoveragePercentage, null);
    assert.equal(summary.overallWithPartialPercentage, null);
    assert.equal(summary.totalLinkedTests, 0);
    assert.equal(summary.orphanTests, 0);

    const matrix = await coverageService.getTraceabilityMatrix({
      projectId: testProjectId,
    });
    assert.equal(matrix.rows.length, 0);
    assert.equal(matrix.total, 0);
  });

  it('derives dimension requirements accurately for diverse requirement profiles', () => {
    // Non-quantitative functional requirement: requires POSITIVE only
    const logoReq = {
      title: 'Company Branding',
      originalText: 'The application header shall display the company logo.',
    };
    const logoDims = deriveRequiredDimensions(logoReq);
    assert.deepEqual(logoDims, ['POSITIVE']);

    // Quantitative boundary requirement
    const pwdReq = {
      title: 'Password Rules',
      originalText: 'The password length must be between 8 and 64 characters.',
    };
    const pwdDims = deriveRequiredDimensions(pwdReq);
    assert.ok(pwdDims.includes('POSITIVE'));
    assert.ok(pwdDims.includes('BOUNDARY'));

    // Negative & security requirement
    const authReq = {
      title: 'Authentication Rejection',
      originalText:
        'The system shall reject login attempts with invalid credentials and unauthorized tokens.',
    };
    const authDims = deriveRequiredDimensions(authReq);
    assert.ok(authDims.includes('POSITIVE'));
    assert.ok(authDims.includes('NEGATIVE'));
    assert.ok(authDims.includes('SECURITY'));

    // Validation requirement
    const emailReq = {
      title: 'Email Format',
      originalText: 'The user email address must use a valid email format.',
    };
    const emailDims = deriveRequiredDimensions(emailReq);
    assert.ok(emailDims.includes('VALIDATION'));
  });

  it('correctly evaluates zero tests state on active requirements', async () => {
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-COV-001',
        title: 'User Profile Update',
        originalText: 'Users shall be able to update their display name and avatar.',
        status: 'ACTIVE',
        priority: 'HIGH',
      },
    });

    const summary = await coverageService.getProjectCoverageSummary({
      projectId: testProjectId,
    });
    assert.equal(summary.totalRequirements, 1);
    assert.equal(summary.eligibleRequirements, 1);
    assert.equal(summary.uncoveredCount, 1);
    assert.equal(summary.coveredCount, 0);
    assert.equal(summary.overallCoveragePercentage, 0);

    const detail = await coverageService.getRequirementCoverage({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(detail.coverageStatus, 'UNCOVERED');
    assert.equal(detail.coveragePercentage, 0);
    assert.equal(detail.eligibleLinkedTests, 0);
  });

  it('evaluates fully covered requirement when all required dimensions are satisfied', async () => {
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-COV-002',
        title: 'User Sign In',
        originalText: 'Users shall log in with credentials or be rejected if invalid.',
        status: 'ACTIVE',
        priority: 'CRITICAL',
      },
    });

    // Create positive test case
    const tcPositive = await testCaseService.createTestCase({
      projectId: testProjectId,
      title: 'Successful Login with Valid Credentials',
      objective: 'Verify successful user login',
      type: 'POSITIVE',
      priority: 'HIGH',
      steps: [{ action: 'Submit valid credentials', expectedResult: 'Login succeeds' }],
    });
    await traceService.createTrace({
      projectId: testProjectId,
      requirementId: req.id,
      testCaseId: tcPositive.id,
    });

    // Create negative test case
    const tcNegative = await testCaseService.createTestCase({
      projectId: testProjectId,
      title: 'Reject Login with Invalid Credentials',
      objective: 'Verify rejection of invalid login',
      type: 'NEGATIVE',
      priority: 'HIGH',
      steps: [{ action: 'Submit invalid password', expectedResult: 'Login rejected' }],
    });
    await traceService.createTrace({
      projectId: testProjectId,
      requirementId: req.id,
      testCaseId: tcNegative.id,
    });

    // Create security test case
    const tcSecurity = await testCaseService.createTestCase({
      projectId: testProjectId,
      title: 'Protect Credentials Against Brute Force and Injection',
      objective: 'Verify authentication credential security',
      type: 'SECURITY',
      priority: 'CRITICAL',
      steps: [{ action: 'Attempt credential attack', expectedResult: 'Attack blocked' }],
    });
    await traceService.createTrace({
      projectId: testProjectId,
      requirementId: req.id,
      testCaseId: tcSecurity.id,
    });

    const detail = await coverageService.getRequirementCoverage({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(detail.coverageStatus, 'COVERED');
    assert.equal(detail.coveragePercentage, 100);
    assert.equal(detail.missingDimensions.length, 0);
    assert.equal(detail.eligibleLinkedTests, 3);
  });

  it('evaluates partially covered requirement with missing dimension reporting', async () => {
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-COV-003',
        title: 'Password Complexity Validation',
        originalText:
          'Password length must be between 8 and 64 characters and reject invalid symbols.',
        status: 'ACTIVE',
        priority: 'HIGH',
      },
    });

    // Only create a POSITIVE test case
    const tcPositive = await testCaseService.createTestCase({
      projectId: testProjectId,
      title: 'Set Valid Password',
      objective: 'Verify password entry',
      type: 'POSITIVE',
      priority: 'MEDIUM',
      steps: [{ action: 'Enter password', expectedResult: 'Accepted' }],
    });
    await traceService.createTrace({
      projectId: testProjectId,
      requirementId: req.id,
      testCaseId: tcPositive.id,
    });

    const detail = await coverageService.getRequirementCoverage({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(detail.coverageStatus, 'PARTIALLY_COVERED');
    assert.ok(detail.missingDimensions.includes('BOUNDARY'));
    assert.ok(detail.coveragePercentage! < 100);
    assert.ok(detail.coveragePercentage! > 0);
  });

  it('excludes hallucination-rejected test cases from eligible coverage', async () => {
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-COV-004',
        title: 'Export Audit Log',
        originalText: 'Admins shall be able to export system audit logs as CSV.',
        status: 'ACTIVE',
        priority: 'MEDIUM',
      },
    });

    const tc = await testCaseService.createTestCase({
      projectId: testProjectId,
      title: 'Export Audit Log with Invented Nonexistent Enterprise Format',
      objective: 'Audit export validation test',
      type: 'POSITIVE',
      priority: 'MEDIUM',
      steps: [{ action: 'Export log', expectedResult: 'Export succeeds' }],
    });
    await traceService.createTrace({
      projectId: testProjectId,
      requirementId: req.id,
      testCaseId: tc.id,
    });

    // Add REJECTED validation record
    await prisma.testCaseValidation.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        requirementId: req.id,
        status: 'REJECTED',
        findings: {
          create: [
            {
              code: 'HALLUCINATION',
              severity: 'BLOCKER',
              message: 'Invented hallucinated API',
            },
          ],
        },
        testContentHash: 'hash-test-content-rejected',
        metricsJson: { groundingScore: 0.1, structuralScore: 0.2 },
      },
    });

    const detail = await coverageService.getRequirementCoverage({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(detail.coverageStatus, 'UNCOVERED');
    assert.equal(detail.eligibleLinkedTests, 0);
    assert.equal(detail.rejectedLinkedTests, 1);
  });

  it('excludes stale traces when Requirement version advances', async () => {
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-COV-005',
        title: 'Checkout Cart Flow',
        originalText: 'Users shall checkout items in their cart using credit card.',
        status: 'ACTIVE',
        priority: 'HIGH',
      },
    });

    // Create initial version 1 snapshot
    await prisma.requirementVersion.create({
      data: {
        projectId: testProjectId,
        requirementId: req.id,
        versionNumber: 1,
        requirementKeySnapshot: req.requirementKey,
        title: req.title,
        originalText: req.originalText,
        sourceRequirementTextSha256: 'sha256-test',
        changeKind: 'CREATED',
        changedFields: ['title', 'originalText'],
      },
    });

    const tc = await testCaseService.createTestCase({
      projectId: testProjectId,
      title: 'Credit Card Cart Checkout',
      objective: 'Verify cart checkout',
      type: 'POSITIVE',
      priority: 'HIGH',
      steps: [{ action: 'Submit payment', expectedResult: 'Order confirmed' }],
    });
    await traceService.createTrace({
      projectId: testProjectId,
      requirementId: req.id,
      testCaseId: tc.id,
    });

    // Initial check: covered
    const initialDetail = await coverageService.getRequirementCoverage({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(initialDetail.coverageStatus, 'COVERED');

    // Advance requirement to version 2
    await versionService.updateRequirementVersioned({
      projectId: testProjectId,
      requirementId: req.id,
      title: 'Checkout Cart Flow Updated',
      originalText:
        'Users shall checkout items in their cart using credit card, debit card, or crypto wallet.',
    });

    // Post update: trace is stale, coverage becomes UNCOVERED
    const updatedDetail = await coverageService.getRequirementCoverage({
      projectId: testProjectId,
      requirementId: req.id,
    });
    assert.equal(updatedDetail.coverageStatus, 'UNCOVERED');
    assert.equal(updatedDetail.eligibleLinkedTests, 0);
    assert.equal(updatedDetail.staleLinkedTests, 1);
  });

  it('prevents duplicate test cases from inflating completeness', async () => {
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-COV-006',
        title: 'Multi Test Requirement',
        originalText: 'System shall allow search and reject malicious queries.',
        status: 'ACTIVE',
        priority: 'MEDIUM',
      },
    });

    // Link 4 POSITIVE tests
    for (let i = 1; i <= 4; i++) {
      const tc = await testCaseService.createTestCase({
        projectId: testProjectId,
        title: `Positive Search Variant ${i}`,
        objective: `Search variant ${i}`,
        type: 'POSITIVE',
        priority: 'LOW',
        steps: [{ action: 'Run query', expectedResult: 'Results returned' }],
      });
      await traceService.createTrace({
        projectId: testProjectId,
        requirementId: req.id,
        testCaseId: tc.id,
      });
    }

    const detail = await coverageService.getRequirementCoverage({
      projectId: testProjectId,
      requirementId: req.id,
    });
    // Missing NEGATIVE dimension, so status is PARTIALLY_COVERED despite having 4 tests
    assert.equal(detail.coverageStatus, 'PARTIALLY_COVERED');
    assert.equal(detail.totalLinkedTests, 4);
    assert.equal(detail.eligibleLinkedTests, 4);
    assert.ok(detail.missingDimensions.includes('NEGATIVE'));
    assert.ok(detail.coveragePercentage! <= 50);
  });

  it('supports pagination, filtering, and sorting in Traceability Matrix (RTM)', async () => {
    const matrixAll = await coverageService.getTraceabilityMatrix({
      projectId: testProjectId,
      page: 1,
      pageSize: 50,
      sortBy: 'priority',
      sortDirection: 'desc',
    });
    assert.ok(matrixAll.rows.length >= 4);

    // Filter by COVERED
    const matrixCovered = await coverageService.getTraceabilityMatrix({
      projectId: testProjectId,
      coverageStatus: 'COVERED',
    });
    for (const r of matrixCovered.rows) {
      assert.equal(r.coverageStatus, 'COVERED');
    }

    // Filter by missing dimension
    const matrixMissingBoundary = await coverageService.getTraceabilityMatrix({
      projectId: testProjectId,
      missingDimension: 'BOUNDARY',
    });
    for (const r of matrixMissingBoundary.rows) {
      assert.ok(r.missingDimensions.includes('BOUNDARY'));
    }
  });

  it('supports reverse traceability and orphan test detection', async () => {
    // Create an orphan test with no trace link
    const orphanTc = await testCaseService.createTestCase({
      projectId: testProjectId,
      title: 'Untraced Legacy Test Case',
      objective: 'Untraced test',
      type: 'SMOKE',
      priority: 'LOW',
      steps: [{ action: 'Check server', expectedResult: 'Healthy' }],
    });

    const reverseRes = await coverageService.getReverseTraceability({
      projectId: testProjectId,
      orphansOnly: true,
    });
    assert.ok(reverseRes.totalOrphans >= 1);
    const foundOrphan = reverseRes.items.find(i => i.testCaseId === orphanTc.id);
    assert.ok(foundOrphan);
    assert.equal(foundOrphan.isOrphan, true);
    assert.equal(foundOrphan.linkedRequirements.length, 0);

    const orphanAudit = await coverageService.getOrphanTests({
      projectId: testProjectId,
    });
    assert.ok(orphanAudit.total >= 1);
    assert.ok(orphanAudit.orphanTestCases.some(tc => tc.id === orphanTc.id));
  });

  it('enforces strict project isolation for coverage operations', async () => {
    const otherProject = await prisma.project.create({
      data: {
        name: `Other Project ${Date.now()}`,
        description: 'Other project for isolation test',
      },
    });

    try {
      const otherReq = await prisma.requirement.create({
        data: {
          projectId: otherProject.id,
          requirementKey: 'REQ-ISO-001',
          title: 'Secret Requirement',
          originalText: 'Top secret algorithm.',
        },
      });

      // Attempting to query otherReq with testProjectId must fail
      await assert.rejects(
        async () => {
          await coverageService.getRequirementCoverage({
            projectId: testProjectId,
            requirementId: otherReq.id,
          });
        },
        { name: 'CoverageProjectMismatchError' },
      );
    } finally {
      await prisma.project.delete({ where: { id: otherProject.id } }).catch(() => {});
    }
  });
});
