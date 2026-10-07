/**
 * @file packages/core/src/ai-provider/certification/v9-phase136-certification.test.ts
 * Comprehensive Certification Test Suite for V9 Phase 136:
 * Requirement & Test Context Adapter.
 *
 * Verifies all 7 core certification criteria:
 * 1. Requirement retrieval & provenance preservation (sourceKind, text, section, page, lines).
 * 2. Test retrieval & step formatting (preconditions, numbered steps, expected results, suitability).
 * 3. Traceability traversal (Requirement -> Test Case -> Test Execution -> Defect/Failure).
 * 4. Multi-tenant project isolation & cross-project denial (strict tenant boundaries).
 * 5. Secret redaction in requirement/test text (passwords, bearer tokens, API keys).
 * 6. Token budgeting, priority ranking, and deterministic truncation.
 * 7. End-to-end integration with local generation runtime (AI generation using assembled context).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../../database/client.js';
import {
  AiProviderService,
  RequirementTestContextAdapter,
  OllamaProviderAdapter,
  AiProviderRegistry,
  AiCrossProjectAccessError,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';

describe('V9 Phase 136 — Requirement & Test Context Adapter Certification Suite', () => {
  let prisma: PrismaClient;
  let mockServer: http.Server;
  let mockPort: number;
  let mockBaseUrl: string;

  const testUserId = '00000000-0000-0000-0000-000000000176';
  const otherUserId = '00000000-0000-0000-0000-000000000177';
  const testProjectId = '00000000-0000-0000-0000-000000001360';
  const otherProjectId = '00000000-0000-0000-0000-000000001361';

  const testReqSourceId = '00000000-0000-0000-0000-000000001362';
  const testReqId = '00000000-0000-0000-0000-000000001363';
  const otherReqId = '00000000-0000-0000-0000-000000001364';

  const testTestCaseId = '00000000-0000-0000-0000-000000001365';
  const testPlanId = '00000000-0000-0000-0000-000000001366';
  const testRunId = '00000000-0000-0000-0000-000000001367';
  const testExecutionId = '00000000-0000-0000-0000-000000001368';
  const testFailureId = '00000000-0000-0000-0000-000000001369';

  before(async () => {
    prisma = getPrismaClient()!;

    // 1. Clean up potential old artifacts
    await prisma.failureCase.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.testCaseExecution.deleteMany({
      where: { testRunId },
    });
    await prisma.testRun.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.executableTestPlan.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.requirementTestTrace.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.testCaseStep.deleteMany({
      where: { testCaseId: testTestCaseId },
    });
    await prisma.testCasePrecondition.deleteMany({
      where: { testCaseId: testTestCaseId },
    });
    await prisma.testCase.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.requirementProvenance.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.requirementVersion.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.requirement.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.requirementSource.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.aiPrivacySettings.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.aiProviderConfig.deleteMany({
      where: { projectId: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectId, otherProjectId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, otherUserId] } },
    });

    // 2. Create users
    await prisma.user.createMany({
      data: [
        {
          id: testUserId,
          email: 'phase136_user@quality.local',
          normalizedEmail: 'phase136_user@quality.local',
          displayName: 'Phase 136 Owner',
        },
        {
          id: otherUserId,
          email: 'phase136_other@quality.local',
          normalizedEmail: 'phase136_other@quality.local',
          displayName: 'Phase 136 Tenant B',
        },
      ],
    });

    // 3. Create projects
    await prisma.project.createMany({
      data: [
        {
          id: testProjectId,
          userId: testUserId,
          name: 'Phase 136 Project Alpha',
        },
        {
          id: otherProjectId,
          userId: otherUserId,
          name: 'Phase 136 Project Beta',
        },
      ],
    });

    // 4. Create requirement source
    await prisma.requirementSource.create({
      data: {
        id: testReqSourceId,
        projectId: testProjectId,
        name: 'SRS Specification v1.0',
        sourceType: 'DOCUMENT',
      },
    });

    // 5. Create requirements with version and provenance
    await prisma.requirement.create({
      data: {
        id: testReqId,
        projectId: testProjectId,
        requirementSourceId: testReqSourceId,
        requirementKey: 'REQ-AUTH-01',
        title: 'User Authentication with Password and Token',
        originalText: 'System must authenticate users with passwords like SuperSecretPwd123! and Bearer eyJhbGciOiJIUzI1NiJ9.',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
        status: 'ACTIVE',
      },
    });

    await prisma.requirementVersion.create({
      data: {
        projectId: testProjectId,
        requirementId: testReqId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-AUTH-01',
        title: 'User Authentication with Password and Token',
        originalText: 'System must authenticate users with passwords like SuperSecretPwd123! and Bearer eyJhbGciOiJIUzI1NiJ9.',
        sourceRequirementTextSha256: 'sha256-placeholder',
      },
    });

    await prisma.requirementProvenance.create({
      data: {
        projectId: testProjectId,
        requirementId: testReqId,
        requirementSourceId: testReqSourceId,
        sourceKind: 'DOCUMENT',
        sectionPath: 'Security > Authentication',
        pageNumber: 14,
        lineStart: 120,
        lineEnd: 135,
        sourceText: 'The user enters their credentials.',
      },
    });

    // Other project requirement
    await prisma.requirement.create({
      data: {
        id: otherReqId,
        projectId: otherProjectId,
        requirementKey: 'REQ-OTHER-01',
        title: 'Secret Tenant B Requirement',
        originalText: 'Isolated requirement for Tenant B',
        type: 'SECURITY',
        priority: 'CRITICAL',
        status: 'ACTIVE',
      },
    });

    // 6. Create Test Case with steps and preconditions
    await prisma.testCase.create({
      data: {
        id: testTestCaseId,
        projectId: testProjectId,
        testCaseKey: 'TC-AUTH-01',
        title: 'Verify valid login credentials',
        objective: 'Ensure authenticated access succeeds',
        type: 'POSITIVE',
        priority: 'HIGH',
        status: 'ACTIVE',
        reviewStatus: 'APPROVED',
        sourceRequirementId: testReqId,
        sourceRequirementKey: 'REQ-AUTH-01',
        overallExpectedResult: 'User dashboard is visible with active session.',
      },
    });

    await prisma.testCasePrecondition.create({
      data: {
        testCaseId: testTestCaseId,
        sequenceOrder: 1,
        description: 'User account exists with API key sk-test-999888777.',
      },
    });

    await prisma.testCaseStep.createMany({
      data: [
        {
          testCaseId: testTestCaseId,
          stepNumber: 1,
          action: 'Navigate to /login page',
          expectedResult: 'Login form is displayed',
        },
        {
          testCaseId: testTestCaseId,
          stepNumber: 2,
          action: 'Enter username and password SuperSecretPwd123!',
          expectedResult: 'Fields are populated',
        },
        {
          testCaseId: testTestCaseId,
          stepNumber: 3,
          action: 'Click Login button',
          expectedResult: 'Redirected to dashboard',
        },
      ],
    });

    // 7. Create Traceability link
    await prisma.requirementTestTrace.create({
      data: {
        projectId: testProjectId,
        requirementId: testReqId,
        testCaseId: testTestCaseId,
        requirementVersionNumber: 1,
        status: 'CURRENT',
        origin: 'GENERATED',
      },
    });

    // 8. Create Executable Test Plan, Run, and Execution
    await prisma.executableTestPlan.create({
      data: {
        id: testPlanId,
        projectId: testProjectId,
        testCaseId: testTestCaseId,
        testCaseVersionNumber: 1,
        planFingerprint: 'smoke-auth-fingerprint',
        summary: 'Smoke Plan Auth',
      },
    });

    await prisma.testRun.create({
      data: {
        id: testRunId,
        projectId: testProjectId,
        testCaseId: testTestCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        status: 'FAILED',
        planFingerprint: 'smoke-auth-fingerprint',
        testCaseTitle: 'Verify valid login credentials',
        executionDurationMs: 4200,
        errorMessage: 'Assertion failed: expected dashboard, got error 401',
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: testExecutionId,
        projectId: testProjectId,
        testRunId,
        testCaseId: testTestCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        attempt: 1,
        status: 'FAILED',
        durationMs: 4200,
        errorMessage: 'Assertion failed: expected dashboard, got error 401',
      },
    });

    // 9. Create Failure Case
    await prisma.failureCase.create({
      data: {
        id: testFailureId,
        projectId: testProjectId,
        testCaseId: testTestCaseId,
        testCaseVersionNumber: 1,
        testRunId,
        executionId: testExecutionId,
        triggeringExecutionStatus: 'FAILED',
        status: 'FAILED',
        title: 'Authentication 401 on valid submission',
        failureSummary: 'Login endpoint rejected valid token',
        errorCode: 'ERR_UNAUTHORIZED',
        errorMessage: 'Database connection string postgres://admin:dbsecret@db.internal:5432/app failed',
        failureSignature: 'SIG-AUTH-401-TOKEN',
      },
    });

    // 10. Start Mock Ollama Server for End-to-End Test
    mockServer = http.createServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [
              {
                name: 'llama3:8b',
                modified_at: '2026-09-01T00:00:00Z',
                size: 4661224676,
              },
            ],
          }),
        );
      } else if (req.url === '/api/generate') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            model: 'llama3:8b',
            created_at: '2026-09-01T00:00:01Z',
            response: 'Requirement REQ-AUTH-01 and Test Case TC-AUTH-01 verified.',
            done: true,
            total_duration: 150000000,
            load_duration: 50000000,
            prompt_eval_count: 85,
            eval_count: 24,
          }),
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as AddressInfo;
        mockPort = addr.port;
        mockBaseUrl = `http://127.0.0.1:${mockPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
  });

  it('1. retrieves requirements preserving provenance and metadata', async () => {
    const adapter = new RequirementTestContextAdapter({ prisma });
    const result = await adapter.assembleContext({
      projectId: testProjectId,
      requirementKeys: ['REQ-AUTH-01'],
      includeExecutions: false,
      includeFailures: false,
    }, testUserId);

    assert.strictEqual(result.requirements.length, 1);
    const req = result.requirements[0]!;
    assert.strictEqual(req.requirementKey, 'REQ-AUTH-01');
    assert.strictEqual(req.type, 'FUNCTIONAL');
    assert.strictEqual(req.priority, 'HIGH');
    assert.strictEqual(req.status, 'ACTIVE');
    assert.strictEqual(req.versionNumber, 1);
    assert.ok(req.provenance);
    assert.strictEqual(req.provenance?.sourceKind, 'DOCUMENT');
    assert.strictEqual(req.provenance?.sectionPath, 'Security > Authentication');
    assert.strictEqual(req.provenance?.pageNumber, 14);
    assert.strictEqual(req.provenance?.lineStart, 120);
    assert.strictEqual(req.provenance?.lineEnd, 135);
    assert.ok(result.formattedRequirementContext.includes('[REQUIREMENT: REQ-AUTH-01]'));
    assert.ok(result.formattedRequirementContext.includes('Provenance: Source: DOCUMENT'));
  });

  it('2. retrieves test cases with numbered steps and execution metadata', async () => {
    const adapter = new RequirementTestContextAdapter({ prisma });
    const result = await adapter.assembleContext({
      projectId: testProjectId,
      testCaseKeys: ['TC-AUTH-01'],
      includeTraceability: false,
      includeExecutions: false,
      includeFailures: false,
    }, testUserId);

    assert.strictEqual(result.testCases.length, 1);
    const tc = result.testCases[0]!;
    assert.strictEqual(tc.testCaseKey, 'TC-AUTH-01');
    assert.strictEqual(tc.reviewStatus, 'APPROVED');
    assert.ok(tc.steps);
    assert.strictEqual(tc.steps.length, 3);
    const firstStep = tc.steps[0]!;
    assert.strictEqual(firstStep.stepNumber, 1);
    assert.strictEqual(firstStep.action, 'Navigate to /login page');
    assert.ok(result.formattedTestContext.includes('[TEST CASE: TC-AUTH-01]'));
    assert.ok(result.formattedTestContext.includes('Step 1: Navigate to /login page'));
  });

  it('3. traverses full traceability from Requirement to Test, Execution, and Failure', async () => {
    const adapter = new RequirementTestContextAdapter({ prisma });
    const result = await adapter.assembleContext({
      projectId: testProjectId,
      requirementKeys: ['REQ-AUTH-01'],
      includeTraceability: true,
      includeExecutions: true,
      includeFailures: true,
    }, testUserId);

    assert.strictEqual(result.requirements.length, 1);
    assert.strictEqual(result.testCases.length, 1);
    assert.strictEqual(result.traceability.length, 1);
    assert.strictEqual(result.executions.length, 1);
    assert.strictEqual(result.failures.length, 1);

    const trace = result.traceability[0]!;
    assert.strictEqual(trace.requirementKey, 'REQ-AUTH-01');
    assert.strictEqual(trace.testCaseKey, 'TC-AUTH-01');

    const exec = result.executions[0]!;
    assert.strictEqual(exec.testCaseKey, 'TC-AUTH-01');
    assert.strictEqual(exec.status, 'FAILED');
    assert.strictEqual(exec.durationMs, 4200);

    const fail = result.failures[0]!;
    assert.strictEqual(fail.testCaseKey, 'TC-AUTH-01');
    assert.strictEqual(fail.failureSignature, 'SIG-AUTH-401-TOKEN');

    assert.ok(result.formattedUnifiedContext.includes('[RECENT TEST EXECUTIONS]'));
    assert.ok(result.formattedUnifiedContext.includes('[ACTIVE DEFECTS & FAILURES]'));
  });

  it('4. strictly enforces multi-tenant project isolation and denies cross-project access', async () => {
    const adapter = new RequirementTestContextAdapter({ prisma });

    // User A attempting to query Tenant B's project must throw AiCrossProjectAccessError
    await assert.rejects(
      async () => {
        await adapter.assembleContext({
          projectId: otherProjectId,
        }, testUserId);
      },
      (err: unknown) => {
        assert.ok(err instanceof AiCrossProjectAccessError);
        return true;
      },
    );

    // Context query on Project Alpha must NEVER return Tenant B's requirements
    const resultAlpha = await adapter.assembleContext({
      projectId: testProjectId,
    }, testUserId);

    assert.ok(!resultAlpha.requirements.some((r) => r.id === otherReqId));
    assert.ok(!resultAlpha.formattedUnifiedContext.includes('Secret Tenant B Requirement'));
  });

  it('5. performs deep secret redaction on sensitive credentials in requirements and tests', async () => {
    const adapter = new RequirementTestContextAdapter({ prisma });
    const result = await adapter.assembleContext({
      projectId: testProjectId,
      requirementKeys: ['REQ-AUTH-01'],
      testCaseKeys: ['TC-AUTH-01'],
      includeExecutions: true,
      includeFailures: true,
    }, testUserId);

    // Requirement description had SuperSecretPwd123! and Bearer token
    assert.ok(!result.formattedUnifiedContext.includes('Bearer eyJhbGciOiJIUzI1NiJ9'));
    // Test case precondition had sk-test-999888777
    assert.ok(!result.formattedUnifiedContext.includes('sk-test-999888777'));
    // Failure case error message had postgres://admin:dbsecret@...
    assert.ok(!result.formattedUnifiedContext.includes('dbsecret'));
    assert.ok(result.formattedUnifiedContext.includes('[REDACTED]'));
  });

  it('6. deterministic token budgeting prunes non-essential context when budget is restricted', async () => {
    const adapter = new RequirementTestContextAdapter({ prisma });

    // Request with very small maxTokens (e.g. 100 tokens)
    const result = await adapter.assembleContext({
      projectId: testProjectId,
      requirementKeys: ['REQ-AUTH-01'],
      testCaseKeys: ['TC-AUTH-01'],
      includeTraceability: true,
      includeExecutions: true,
      includeFailures: true,
      maxTokens: 120,
    }, testUserId);

    assert.strictEqual(result.truncated, true);
    assert.ok(result.truncationReason);
    // Lower priority execution and failure records should be pruned first
    assert.strictEqual(result.executions.length, 0);
    assert.strictEqual(result.failures.length, 0);
    assert.ok(result.estimatedTokens <= 120);
  });

  it('7. end-to-end integration: feeds assembled context seamlessly into local generation runtime', async () => {
    const provider = new OllamaProviderAdapter({
      baseUrl: mockBaseUrl,
      defaultModel: 'llama3:8b',
    });
    const registry = new AiProviderRegistry();
    registry.register(provider);

    const service = new AiProviderService({
      prisma,
      registry,
    });

    // 1. Assemble requirement and test context
    const contextResult = await service.assembleRequirementTestContext({
      projectId: testProjectId,
      requirementKeys: ['REQ-AUTH-01'],
      testCaseKeys: ['TC-AUTH-01'],
      includeTraceability: true,
    }, testUserId);

    assert.ok(contextResult.formattedRequirementContext.length > 0);
    assert.ok(contextResult.formattedTestContext.length > 0);

    // 2. Feed into Local Generation Runtime via AiProjectContextDto
    const generationResult = await service.generateLocal({
      projectId: testProjectId,
      providerId: 'OLLAMA',
      modelId: 'llama3:8b',
      prompt: 'Summarize verification steps for authentication requirement.',
      context: {
        requirements: contextResult.formattedRequirementContext,
        testInfo: contextResult.formattedTestContext,
      },
    }, testUserId);

    assert.strictEqual(generationResult.state, 'COMPLETED');
    assert.ok(generationResult.content.includes('REQ-AUTH-01'));
  });
});
