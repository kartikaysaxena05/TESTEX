/**
 * @file scripts/p57-certification-fixture.js
 * End-to-end Phase 57 Certification Fixture measuring pre-cleanup and post-cleanup counts.
 */

import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  AiProviderGateway,
  AiProviderRegistry,
  FakeAiProvider,
  AiPromptExecutionService,
  VectorEmbeddingRepository,
  VectorSearchService,
  DEFAULT_RETRY_POLICY,
  RequirementContextRetrievalService,
  RequirementAnalysisService,
  ScenarioGenerationService,
  TestDesignService,
  DeterministicRulesEngine,
  TestCaseService,
  TestGenerationValidationService,
  RequirementTestTraceService,
  CoverageAnalysisService,
  TestReviewService,
  AppLogger,
} from '../packages/core/dist/index.js';

dotenv.config();

async function runFixture() {
  console.log('===============================================================');
  console.log('V4 Phase 57: End-to-End Certification Fixture & Metric Pipeline');
  console.log('===============================================================');

  const prisma = new PrismaClient();
  const logger = new AppLogger();

  try {
    // 1. Initialize Subsystem
    const registry = AiProviderRegistry.createDefault();
    const fakeProvider = new FakeAiProvider();
    registry.register(fakeProvider);

    const gateway = new AiProviderGateway({
      registry,
      retryPolicy: DEFAULT_RETRY_POLICY,
      logger,
    });

    const promptExec = new AiPromptExecutionService({ gateway, logger });
    const vectorRepo = new VectorEmbeddingRepository(prisma);
    const vectorSearch = new VectorSearchService({
      prisma,
      gateway,
      repository: vectorRepo,
      logger,
    });
    const ragService = new RequirementContextRetrievalService({
      prisma,
      vectorSearchService: vectorSearch,
      logger,
    });
    const _analysisService = new RequirementAnalysisService({
      prisma,
      retrievalService: ragService,
      promptExecutionService: promptExec,
      logger,
    });
    const testDesignRules = new DeterministicRulesEngine();
    const testDesignService = new TestDesignService({
      prisma,
      promptExecutionService: promptExec,
      retrievalService: ragService,
      rulesEngine: testDesignRules,
      logger,
    });
    const _scenarioService = new ScenarioGenerationService({
      prisma,
      promptExecutionService: promptExec,
      retrievalService: ragService,
      testDesignService,
      logger,
    });
    const testCaseService = new TestCaseService(prisma);
    const _validationService = new TestGenerationValidationService(prisma);
    const traceService = new RequirementTestTraceService(prisma);
    const covService = new CoverageAnalysisService(prisma);
    const reviewService = new TestReviewService({ prisma, logger });

    // 2. Create Isolated Fixture Project
    const project = await prisma.project.create({
      data: {
        name: `P57-E2E-CERT-FIXTURE-${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    const projectId = project.id;
    console.log(`Created Certification Fixture Project: ${project.name} (${projectId})`);

    // 3. Create 4 Distinct Requirements
    // Req 1: User Authentication & Rate Limiting
    const req1 = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: 'REQ-CERT-001',
        title: 'User Authentication & Lockout Policy',
        originalText:
          'Users must authenticate with valid email and password. Account locks after 5 consecutive failed attempts for 15 minutes.',
        status: 'ACTIVE',
        type: 'FUNCTIONAL',
        versions: {
          create: {
            projectId,
            versionNumber: 1,
            requirementKeySnapshot: 'REQ-CERT-001',
            title: 'User Authentication & Lockout Policy',
            originalText:
              'Users must authenticate with valid email and password. Account locks after 5 consecutive failed attempts for 15 minutes.',
            sourceRequirementTextSha256: 'sha256-cert-req-1',
          },
        },
      },
    });

    // Req 2: Payment Checkout & Cart Totaling
    const req2 = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: 'REQ-CERT-002',
        title: 'Credit Card Payment Gateway Processing',
        originalText:
          'Orders must process through PCI-compliant credit card gateway. Order amounts between $1.00 and $10,000.00 inclusive.',
        status: 'ACTIVE',
        type: 'FUNCTIONAL',
        versions: {
          create: {
            projectId,
            versionNumber: 1,
            requirementKeySnapshot: 'REQ-CERT-002',
            title: 'Credit Card Payment Gateway Processing',
            originalText:
              'Orders must process through PCI-compliant credit card gateway. Order amounts between $1.00 and $10,000.00 inclusive.',
            sourceRequirementTextSha256: 'sha256-cert-req-2',
          },
        },
      },
    });

    // Req 3: Profile Updates
    const req3 = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: 'REQ-CERT-003',
        title: 'User Profile Name and Avatar Update',
        originalText:
          'Users can update display name (1-50 chars) and avatar image (PNG/JPEG under 2MB).',
        status: 'ACTIVE',
        type: 'FUNCTIONAL',
        versions: {
          create: {
            projectId,
            versionNumber: 1,
            requirementKeySnapshot: 'REQ-CERT-003',
            title: 'User Profile Name and Avatar Update',
            originalText:
              'Users can update display name (1-50 chars) and avatar image (PNG/JPEG under 2MB).',
            sourceRequirementTextSha256: 'sha256-cert-req-3',
          },
        },
      },
    });

    // Req 4: Admin Audit Logging (Deliberately Uncovered for Fixture)
    const _req4 = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: 'REQ-CERT-004',
        title: 'Administrative Security Audit Logging',
        originalText:
          'All administrative privilege elevations and policy changes must emit immutable audit log entries.',
        status: 'ACTIVE',
        type: 'SECURITY',
        versions: {
          create: {
            projectId,
            versionNumber: 1,
            requirementKeySnapshot: 'REQ-CERT-004',
            title: 'Administrative Security Audit Logging',
            originalText:
              'All administrative privilege elevations and policy changes must emit immutable audit log entries.',
            sourceRequirementTextSha256: 'sha256-cert-req-4',
          },
        },
      },
    });

    console.log('Created 4 Requirements (REQ-CERT-001..004)');

    // 4. Generate Scenarios for Req 1, 2, 3
    const gen1 = await prisma.requirementScenarioGeneration.create({
      data: {
        projectId,
        requirementId: req1.id,
        requirementVersionNumber: 1,
        inputFingerprint: 'sha256-cert-gen1',
        providerId: 'FAKE',
        model: 'fake-model-1',
        promptId: 'requirement.scenario.generation',
        promptVersion: 1,
        scenarioCount: 2,
        candidates: {
          create: [
            {
              projectId,
              requirementId: req1.id,
              scenarioKey: 'SCN-CERT-001',
              ordinal: 1,
              title: 'Successful Authentication with Valid Credentials',
              objective: 'Authenticate user with valid credentials.',
              rationale: 'Core happy path for authentication.',
              requirementAspect: 'Login flow',
            },
            {
              projectId,
              requirementId: req1.id,
              scenarioKey: 'SCN-CERT-002',
              ordinal: 2,
              title: 'Account Lockout on 5th Failed Attempt',
              objective: 'Lock account after 5 failed attempts.',
              rationale: 'Negative security constraint validation.',
              requirementAspect: 'Rate limiting and lockout',
            },
          ],
        },
      },
      include: { candidates: true },
    });

    const gen2 = await prisma.requirementScenarioGeneration.create({
      data: {
        projectId,
        requirementId: req2.id,
        requirementVersionNumber: 1,
        inputFingerprint: 'sha256-cert-gen2',
        providerId: 'FAKE',
        model: 'fake-model-1',
        promptId: 'requirement.scenario.generation',
        promptVersion: 1,
        scenarioCount: 1,
        candidates: {
          create: [
            {
              projectId,
              requirementId: req2.id,
              scenarioKey: 'SCN-CERT-003',
              ordinal: 1,
              title: 'Valid Order Payment Processing',
              objective: 'Process valid credit card payment.',
              rationale: 'Valid payment transaction.',
              requirementAspect: 'Payment processing',
            },
          ],
        },
      },
      include: { candidates: true },
    });

    const gen3 = await prisma.requirementScenarioGeneration.create({
      data: {
        projectId,
        requirementId: req3.id,
        requirementVersionNumber: 1,
        inputFingerprint: 'sha256-cert-gen3',
        providerId: 'FAKE',
        model: 'fake-model-1',
        promptId: 'requirement.scenario.generation',
        promptVersion: 1,
        scenarioCount: 1,
        candidates: {
          create: [
            {
              projectId,
              requirementId: req3.id,
              scenarioKey: 'SCN-CERT-004',
              ordinal: 1,
              title: 'Profile Name Boundary Update',
              objective: 'Update profile name at 50 chars boundary.',
              rationale: 'Boundary testing of name length.',
              requirementAspect: 'Profile display name',
            },
          ],
        },
      },
      include: { candidates: true },
    });

    const sc1 = gen1.candidates[0];
    const sc2 = gen1.candidates[1];
    const sc3 = gen2.candidates[0];
    const sc4 = gen3.candidates[0];

    console.log('Created 4 Scenario Candidates across 3 Generations');

    console.log('Created 4 Scenario Candidates');

    // 5. Generate & Persist Structured Test Cases
    // Test Case 1 for Req 1 (Positive)
    const tc1 = await testCaseService.createTestCase({
      projectId,
      testCaseKey: 'TC-CERT-001',
      title: 'Verify standard login with valid credentials',
      objective: 'Ensure dashboard access upon valid credential authentication.',
      type: 'POSITIVE',
      priority: 'HIGH',
      status: 'ACTIVE',
      sourceRequirementId: req1.id,
      sourceRequirementKey: req1.requirementKey,
      sourceRequirementVersionNumber: 1,
      scenarioCandidateId: sc1.id,
      preconditions: [
        {
          sequenceOrder: 1,
          category: 'AUTHENTICATION',
          description: 'User active in database.',
          isEnforced: true,
        },
      ],
      steps: [
        {
          stepNumber: 1,
          action: 'Submit valid email and password',
          expectedResult: 'Login successful, redirect to dashboard',
          isOptional: false,
        },
      ],
      testData: [
        { sequenceOrder: 1, name: 'email', dataType: 'STRING', valueJson: 'alice@example.com' },
      ],
    });

    // Test Case 2 for Req 1 (Negative - Lockout)
    const tc2 = await testCaseService.createTestCase({
      projectId,
      testCaseKey: 'TC-CERT-002',
      title: 'Verify account lockout after 5 failed password attempts',
      objective: 'Ensure account lock activates on 5th failure.',
      type: 'NEGATIVE',
      priority: 'HIGH',
      status: 'ACTIVE',
      sourceRequirementId: req1.id,
      sourceRequirementKey: req1.requirementKey,
      sourceRequirementVersionNumber: 1,
      scenarioCandidateId: sc2.id,
      preconditions: [
        {
          sequenceOrder: 1,
          category: 'AUTHENTICATION',
          description: 'User account not locked initially.',
          isEnforced: true,
        },
      ],
      steps: [
        {
          stepNumber: 1,
          action: 'Submit incorrect password 5 times',
          expectedResult: 'Account locked message displayed',
          isOptional: false,
        },
      ],
      testData: [{ sequenceOrder: 1, name: 'attempts', dataType: 'NUMBER', valueJson: '5' }],
    });

    // Test Case 3 for Req 2 (Positive - Payment)
    const tc3 = await testCaseService.createTestCase({
      projectId,
      testCaseKey: 'TC-CERT-003',
      title: 'Verify valid credit card payment processing',
      objective: 'Process order payment successfully.',
      type: 'POSITIVE',
      priority: 'HIGH',
      sourceRequirementId: req2.id,
      sourceRequirementKey: req2.requirementKey,
      sourceRequirementVersionNumber: 1,
      scenarioCandidateId: sc3.id,
      steps: [
        {
          stepNumber: 1,
          action: 'Submit valid test card for $49.99 order',
          expectedResult: 'Payment authorized and receipt generated',
          isOptional: false,
        },
      ],
    });

    // Test Case 4 for Req 2 (Validation - Rejected in Review)
    const tc4 = await testCaseService.createTestCase({
      projectId,
      testCaseKey: 'TC-CERT-004',
      title: 'Verify invalid card number rejection with fabricated endpoint',
      objective: 'Check card format validation.',
      type: 'VALIDATION',
      priority: 'MEDIUM',
      sourceRequirementId: req2.id,
      sourceRequirementKey: req2.requirementKey,
      sourceRequirementVersionNumber: 1,
      steps: [
        {
          stepNumber: 1,
          action: 'Submit invalid card digits',
          expectedResult: 'Card number invalid error',
          isOptional: false,
        },
      ],
    });

    // Test Case 5 for Req 3 (Boundary - Stale)
    const tc5 = await testCaseService.createTestCase({
      projectId,
      testCaseKey: 'TC-CERT-005',
      title: 'Verify 50-character name update',
      objective: 'Check max length boundary.',
      type: 'BOUNDARY',
      priority: 'MEDIUM',
      sourceRequirementId: req3.id,
      sourceRequirementKey: req3.requirementKey,
      sourceRequirementVersionNumber: 1,
      scenarioCandidateId: sc4.id,
      steps: [
        {
          stepNumber: 1,
          action: 'Save 50 character display name',
          expectedResult: 'Display name updated',
          isOptional: false,
        },
      ],
    });

    console.log('Created 5 Structured Test Cases (TC-CERT-001..005)');

    // 6. Create Requirement-to-Test Traceability Links
    await traceService.createTrace({ projectId, requirementId: req1.id, testCaseId: tc1.id });
    await traceService.createTrace({ projectId, requirementId: req1.id, testCaseId: tc2.id });
    await traceService.createTrace({ projectId, requirementId: req2.id, testCaseId: tc3.id });
    await traceService.createTrace({ projectId, requirementId: req2.id, testCaseId: tc4.id });
    await traceService.createTrace({ projectId, requirementId: req3.id, testCaseId: tc5.id });
    console.log('Created 5 Traceability Links');

    // 7. Human Review Operations
    // Approve TC-CERT-001 (Req 1 covered)
    await reviewService.approveTestVersion({
      projectId,
      testCaseId: tc1.id,
      versionNumber: 1,
      comment: 'Lead QA approved standard login spec',
      reviewerActorId: 'QA_LEAD_ALICE',
    });

    // Approve TC-CERT-002 (Req 1 covered)
    await reviewService.approveTestVersion({
      projectId,
      testCaseId: tc2.id,
      versionNumber: 1,
      comment: 'Lead QA approved lockout spec',
      reviewerActorId: 'QA_LEAD_ALICE',
    });

    // Approve TC-CERT-003 (Req 2 covered)
    await reviewService.approveTestVersion({
      projectId,
      testCaseId: tc3.id,
      versionNumber: 1,
      comment: 'Lead QA approved checkout spec',
      reviewerActorId: 'QA_LEAD_ALICE',
    });

    // Reject TC-CERT-004
    await reviewService.rejectTestVersion({
      projectId,
      testCaseId: tc4.id,
      versionNumber: 1,
      rejectionReason: 'INVALID_EXPECTED_RESULT',
      comment: 'Card verification expected result references nonexistent UI modal',
      reviewerActorId: 'QA_LEAD_ALICE',
    });

    // TC-CERT-005 remains in DRAFT status initially

    // 8. Advance Requirement 3 version to v2 to test real-time staleness
    await prisma.requirementVersion.create({
      data: {
        projectId,
        requirementId: req3.id,
        versionNumber: 2,
        requirementKeySnapshot: req3.requirementKey,
        title: 'User Profile Name and Avatar Update v2',
        originalText: 'Users can update display name (1-100 chars now allowed) and avatar image.',
        sourceRequirementTextSha256: 'sha256-cert-req-3-v2',
      },
    });

    // 9. Query Pre-Cleanup Fixture Metrics for this Project
    const fixtureReqCount = await prisma.requirement.count({ where: { projectId } });
    const fixtureScnCount = await prisma.requirementScenarioCandidate.count({
      where: { projectId },
    });
    const fixtureTcCount = await prisma.testCase.count({ where: { projectId } });
    const fixtureDraftCount = await prisma.testCase.count({
      where: { projectId, reviewStatus: 'DRAFT' },
    });
    const fixtureApprovedCount = await prisma.testCase.count({
      where: { projectId, reviewStatus: 'APPROVED' },
    });
    const fixtureRejectedCount = await prisma.testCase.count({
      where: { projectId, reviewStatus: 'REJECTED' },
    });
    const fixtureTraceCount = await prisma.requirementTestTrace.count({ where: { projectId } });

    // Traces for Req 3 evaluate as stale dynamically
    const tracesReq3 = await traceService.listTracesForRequirement({
      projectId,
      requirementId: req3.id,
    });
    const fixtureStaleTests = tracesReq3.traces.filter(t => t.isStale).length;

    // Coverage Summary via CoverageAnalysisService
    const covSummary = await covService.getProjectCoverageSummary({ projectId });

    const fixtureMetrics = {
      CERTIFICATION_FIXTURE_REQUIREMENTS: fixtureReqCount,
      CERTIFICATION_FIXTURE_SCENARIOS_GENERATED: fixtureScnCount,
      CERTIFICATION_FIXTURE_TEST_CASES_GENERATED: fixtureTcCount,
      CERTIFICATION_FIXTURE_DRAFT_TESTS: fixtureDraftCount,
      CERTIFICATION_FIXTURE_APPROVED_TESTS: fixtureApprovedCount,
      CERTIFICATION_FIXTURE_REJECTED_TESTS: fixtureRejectedCount,
      CERTIFICATION_FIXTURE_STALE_TESTS: fixtureStaleTests,
      CERTIFICATION_FIXTURE_TRACEABILITY_LINKS: fixtureTraceCount,
      CERTIFICATION_FIXTURE_ELIGIBLE_REQUIREMENTS: covSummary.eligibleRequirements,
      CERTIFICATION_FIXTURE_COVERED_REQUIREMENTS: covSummary.coveredCount,
      CERTIFICATION_FIXTURE_UNCOVERED_REQUIREMENTS: covSummary.uncoveredCount,
      CERTIFICATION_FIXTURE_OTHER_COVERAGE_STATE: `${covSummary.partiallyCoveredCount} (PARTIALLY_COVERED)`,
      CERTIFICATION_FIXTURE_COVERAGE: `${covSummary.overallCoveragePercentage}%`,
      COVERAGE_COUNT_INVARIANT:
        covSummary.eligibleRequirements ===
        covSummary.coveredCount + covSummary.partiallyCoveredCount + covSummary.uncoveredCount
          ? 'PASS'
          : 'FAIL',
      COVERAGE_FORMULA_CHECK:
        covSummary.overallCoveragePercentage ===
        Math.round((covSummary.coveredCount / covSummary.eligibleRequirements) * 100)
          ? 'PASS'
          : 'FAIL',
    };

    console.log('\n================ PRE-CLEANUP FIXTURE METRICS ================');
    console.log(JSON.stringify(fixtureMetrics, null, 2));

    // 10. Clean up the Fixture Project
    await prisma.project.delete({ where: { id: projectId } });
    console.log('\nCleaned up Certification Fixture Project successfully.');

    // 11. Query Post-Cleanup Global Database Metrics
    const postCleanupReqCount = await prisma.requirement.count();
    const postCleanupTcCount = await prisma.testCase.count();
    const postCleanupTraceCount = await prisma.requirementTestTrace.count();

    const postCleanupMetrics = {
      POST_CLEANUP_DATABASE_REQUIREMENTS: postCleanupReqCount,
      POST_CLEANUP_DATABASE_TEST_CASES: postCleanupTcCount,
      POST_CLEANUP_TRACEABILITY_LINKS: postCleanupTraceCount,
    };

    console.log('\n================ POST-CLEANUP DATABASE METRICS ================');
    console.log(JSON.stringify(postCleanupMetrics, null, 2));

    return {
      fixtureMetrics,
      postCleanupMetrics,
    };
  } finally {
    await prisma.$disconnect();
  }
}

runFixture().catch(err => {
  console.error('Fixture execution failed:', err);
  process.exit(1);
});
