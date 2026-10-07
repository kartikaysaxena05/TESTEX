/**
 * @file packages/core/src/failures/root-cause/root-cause-certification.test.ts
 * Comprehensive certification test suite for V6 Phase 83 Root-Cause Analysis & Probable Layer Identification.
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureRootCauseService } from './failure-root-cause-service.js';
import { AiPromptExecutionService } from '../../ai/ai-prompt-execution-service.js';
import { PromptRegistry } from '../../ai/prompt-registry.js';
import { AiProviderRegistry } from '../../ai/ai-provider-registry.js';
import { AiProviderGateway } from '../../ai/ai-provider-gateway.js';
import { FakeAiProvider } from '../../ai/fake-ai-provider.js';
import { rootCauseProbableLayerSchema, rootCauseStatusSchema } from '@ai-quality/contracts';

test('V6 Phase 83: Root-Cause Analysis & Probable Layer Identification Certification', async t => {
  let prisma: PrismaClient;
  let service: FailureRootCauseService;

  let projectId: string;
  let failureCaseId: string;
  let testCaseId: string;
  let executionId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;

    projectId = crypto.randomUUID();

    await prisma.project.create({
      data: { id: projectId, name: 'Certification Project Phase 83' },
    });

    const source = await prisma.projectSource.create({
      data: {
        projectId,
        displayName: 'Certification Repo',
        rootPath: '/tmp/repo',
        kind: 'LOCAL_DIRECTORY',
      },
    });
    // Create indexed repository files and symbols
    const authFile = await prisma.repositoryFile.create({
      data: {
        sourceId: source.id,
        relativePath: 'src/auth/jwt-service.ts',
        name: 'jwt-service.ts',
        classification: 'SOURCE',
        sizeBytes: 4096,
      },
    });

    await prisma.repositorySymbol.create({
      data: {
        repositoryFileId: authFile.id,
        name: 'verifySessionToken',
        kind: 'FUNCTION',
        startLine: 40,
        endLine: 85,
      },
    });

    const req = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: `REQ-CERT-83-${Date.now()}`,
        title: 'Root-Cause Certification Requirement',
        originalText:
          'System must certify root-cause analysis hypothesis formulation and probable layer identification',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: `TC-CERT-83-${Date.now()}`,
        title: 'Session Expiry Test Case',
        objective: 'Certify root-cause analysis',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });
    testCaseId = tc.id;

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: `plan-fp-cert-83-${Date.now()}`,
        summary: 'Cert 83 Plan',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const run = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        planFingerprint: `plan-fp-cert-83-${Date.now()}`,
        testCaseTitle: tc.title,
      },
    });

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        errorMessage: '500 Server Error: TokenExpiredError in jwt-service.ts',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testRunId: run.id,
        executionId: exec.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Session Token Expiry Failure Case',
        errorMessage: '500 Server Error: TokenExpiredError',
      },
    });
    failureCaseId = fc.id;
    executionId = exec.id;

    // Attach Phase 75 evidence reference
    await prisma.failureEvidenceReference.create({
      data: {
        projectId,
        failureCaseId: fc.id,
        executionId: exec.id,
        artifactType: 'CONSOLE_LOG',
        logicalName: 'console.log',
        storageIdentity: 'local',
        sha256: crypto.createHash('sha256').update('console-log-cert-83').digest('hex'),
        byteSize: 1024,
        mimeType: 'text/plain',
        metadataJson: {
          messages: [
            { type: 'error', text: 'TokenExpiredError: jwt expired at verifySessionToken' },
          ],
        },
      },
    });

    // Attach Phase 77 deterministic classification
    const classification = await prisma.failureClassification.create({
      data: {
        projectId,
        failureCaseId: fc.id,
        category: 'APPLICATION_FAILURE',
        primaryRuleId: 'RULE_SERVER_500',
        ruleExplanationsJson: ['Server responded with HTTP 500 TokenExpiredError'],
        isAuthoritative: true,
      },
    });

    // Attach Phase 80 domain separation
    const domainSep = await prisma.failureDomainSeparation.create({
      data: {
        projectId,
        failureCaseId: fc.id,
        testCaseId: tc.id,
        domain: 'APPLICATION_DEFECT_CANDIDATE',
        domainSubreason: 'AuthService',
        primaryRationale: 'Application defect candidate in auth service',
        decisionExplanation: 'Unhandled exception thrown in backend service',
        separationFingerprint: 'mock-sep-fp-83',
        isAuthoritative: true,
      },
    });

    // Attach Phase 81 technical localization
    const localization = await prisma.failureTechnicalLocalization.create({
      data: {
        projectId,
        failureCaseId: fc.id,
        testCaseId: tc.id,
        primaryLayer: 'BACKEND_API',
        primaryTargetType: 'REPOSITORY_SYMBOL',
        primaryTargetIdentifier: 'verifySessionToken',
        matchedFilePath: 'src/auth/jwt-service.ts',
        matchedSymbolName: 'verifySessionToken',
        isAuthoritative: true,
        localizationRationale:
          'TokenExpiredError stack trace points directly to verifySessionToken',
        localizationFingerprint: 'mock-loc-fp-83',
      },
    });

    // Attach Phase 82 AI assessment
    await prisma.failureAiAssessment.create({
      data: {
        projectId,
        failureCaseId: fc.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        deterministicClassificationId: classification.id,
        technicalLocalizationId: localization.id,
        domainSeparationId: domainSep.id,
        aiCategory: 'APPLICATION_FAILURE',
        aiSubcategory: 'HTTP_ERROR_RESPONSE',
        agreementState: 'AGREES',
        confidenceLevel: 'HIGH',
        confidenceScore: 0.94,
        confidenceBasis: ['Consistent 500 error code', 'Exact stack trace in jwt-service.ts'],
        primaryReasoning: 'Token expiration handling unhandled in backend server.',
        humanExplanation:
          'The backend failed to catch TokenExpiredError and crashed with HTTP 500.',
        supportingEvidence: [],
        contradictingEvidence: [],
        alternativeHypotheses: [],
        uncertainties: [],
        modelProvider: 'fake',
        modelName: 'mock-classifier-v1',
        promptVersion: '1.0.0',
        schemaVersion: '1.0.0',
        assessmentFingerprint: 'mock-assessment-fp-83',
        isAuthoritative: true,
      },
    });

    // Setup Fake AI Provider with comprehensive root-cause output
    const mockRcaResponse = JSON.stringify({
      rootCauseStatus: 'SUPPORTED_HYPOTHESIS',
      probableLayer: 'AUTHENTICATION',
      probableComponent: 'JwtService',
      relatedEndpoint: '/api/v1/session',
      probableCause:
        'Unhandled TokenExpiredError exception thrown by verifySessionToken during session renewal.',
      humanExplanation:
        'The application backend does not catch jwt TokenExpiredError in verifySessionToken, propagating an unhandled 500 error instead of a 401 Unauthorized status.',
      affectedExecutionPath: [
        'Client requests /api/v1/session with expired token',
        'Backend invokes verifySessionToken in src/auth/jwt-service.ts',
        'jsonwebtoken library throws TokenExpiredError',
        'Unhandled exception triggers 500 Internal Server Error',
      ],
      supportingEvidence: [
        {
          id: 'ev-cert-1',
          fact: 'Console error explicitly mentions TokenExpiredError at verifySessionToken',
          significance: 'CRITICAL',
          evidenceType: 'CONSOLE_LOG',
        },
        {
          id: 'ev-cert-2',
          fact: 'Deterministic rule RULE_SERVER_500 classified as APPLICATION_FAILURE',
          significance: 'HIGH',
        },
      ],
      contradictingEvidence: [],
      alternativeHypotheses: [
        {
          layer: 'BACKEND',
          probableCause: 'Global Express error handler middleware missing or crashed',
          rationale: 'Express may fail to format the error object properly',
          plausibility: 'LOW',
          disqualifyingFactor: 'Stack trace explicitly originates inside verifySessionToken',
        },
      ],
      repositoryReferences: [
        {
          filePath: 'src/auth/jwt-service.ts',
          symbolName: 'verifySessionToken',
          relevance: 'Location where TokenExpiredError was thrown without a try/catch block',
        },
      ],
      limitations: ['Network request payload headers could not be inspected.'],
      uncertainties: [],
    });

    const fakeProvider = new FakeAiProvider({
      defaultResponse: mockRcaResponse,
    });

    const providerRegistry = new AiProviderRegistry([fakeProvider]);
    const gateway = new AiProviderGateway({ registry: providerRegistry });
    const promptRegistry = PromptRegistry.createDefault();
    const promptService = new AiPromptExecutionService({
      registry: promptRegistry,
      gateway,
    });

    service = new FailureRootCauseService(prisma, {
      promptExecutionService: promptService,
    });
  });

  await t.test('1. End-to-end analyzeRootCause executes and produces compliant DTO', async () => {
    const analysis = await service.analyzeRootCause({
      projectId,
      failureCaseId,
    });

    assert.ok(analysis.id);
    assert.equal(analysis.projectId, projectId);
    assert.equal(analysis.failureCaseId, failureCaseId);
    assert.equal(analysis.testCaseId, testCaseId);
    assert.equal(analysis.isAuthoritative, true);
    assert.equal(analysis.isStale, false);
    assert.equal(analysis.reanalysisCount, 0);

    // Validate enum compliance
    assert.ok(rootCauseProbableLayerSchema.safeParse(analysis.probableLayer).success);
    assert.ok(rootCauseStatusSchema.safeParse(analysis.rootCauseStatus).success);
    assert.equal(analysis.probableLayer, 'AUTHENTICATION');
    assert.equal(analysis.rootCauseStatus, 'SUPPORTED_HYPOTHESIS');

    // Validate repository reference was anti-hallucination verified
    assert.equal(analysis.repositoryContextAvailable, true);
    assert.equal(analysis.repositoryReferences.length, 1);
    const repoRef = analysis.repositoryReferences[0]!;
    assert.equal(repoRef.filePath, 'src/auth/jwt-service.ts');
    assert.equal(repoRef.symbolName, 'verifySessionToken');
    assert.ok(repoRef.fileId);
    assert.ok(repoRef.symbolId);

    // Validate structured fields
    assert.ok(analysis.probableCause.length > 20);
    assert.ok(analysis.humanExplanation.length > 20);
    assert.equal(analysis.affectedExecutionPath.length, 4);
    assert.equal(analysis.supportingEvidence.length, 2);
    assert.equal(analysis.alternativeHypotheses.length, 1);
    assert.equal(analysis.limitations.length, 1);
  });

  await t.test(
    '2. Dynamic staleness detection marks analysis stale on passive read without calling LLM',
    async () => {
      // 0. Perform initial root-cause analysis
      await service.analyzeRootCause({ projectId, failureCaseId });

      // 1. Initial read should be fresh
      const fresh = await service.getRootCauseAnalysis({ projectId, failureCaseId });
      assert.ok(fresh);
      assert.equal(fresh.isStale, false);
      assert.equal(fresh.stalenessReason, null);

      // 2. Attach a newer evidence reference in the future
      const futureDate = new Date(Date.now() + 5000);
      await prisma.failureEvidenceReference.create({
        data: {
          projectId,
          failureCaseId,
          executionId,
          artifactType: 'DOM_SNAPSHOT',
          logicalName: 'dom.html',
          storageIdentity: 'local',
          byteSize: 512,
          mimeType: 'text/html',
          sha256: crypto.createHash('sha256').update('new-dom-sha').digest('hex'),
          attachedAt: futureDate,
        },
      });

      // 3. Passive read should dynamically detect staleness and persist it
      const stale = await service.getRootCauseAnalysis({ projectId, failureCaseId });
      assert.ok(stale);
      assert.equal(stale.isStale, true);
      assert.ok(stale.stalenessReason?.includes('new evidence artifact(s) attached'));

      // 4. Verify DB record was updated directly
      const dbRecord = await prisma.failureRootCauseAnalysis.findUniqueOrThrow({
        where: { id: stale.id },
      });
      assert.equal(dbRecord.isStale, true);
    },
  );

  await t.test(
    '3. Re-analysis creates new authoritative record, increments revision count, and tracks lineage',
    async () => {
      // 0. Perform initial root-cause analysis
      const initial = await service.analyzeRootCause({ projectId, failureCaseId });
      assert.ok(initial);

      const reanalyzed = await service.reanalyzeRootCause({
        projectId,
        failureCaseId,
        reanalysisReason: 'Re-analyzed after new DOM snapshot was captured',
      });

      assert.notEqual(initial.id, reanalyzed.id);
      assert.equal(reanalyzed.isAuthoritative, true);
      assert.equal(reanalyzed.isStale, false);
      assert.equal(reanalyzed.reanalysisCount, 1);
      assert.equal(reanalyzed.reanalysisReason, 'Re-analyzed after new DOM snapshot was captured');
      assert.ok(reanalyzed.lastReanalyzedAt);

      // Check old record in DB is un-authorized and points to new record
      const oldRecord = await prisma.failureRootCauseAnalysis.findUniqueOrThrow({
        where: { id: initial.id },
      });
      assert.equal(oldRecord.isAuthoritative, false);
      assert.equal(oldRecord.supersededById, reanalyzed.id);

      // List history returns both records
      const history = await service.listRootCauseHistory({ projectId, failureCaseId });
      assert.equal(history.length, 2);
      assert.equal(history[0]?.id, reanalyzed.id);
      assert.equal(history[1]?.id, initial.id);
    },
  );
});
