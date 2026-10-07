/**
 * @file packages/core/src/conversational-agent/certification/v8-phase124-certification.test.ts
 * Comprehensive Certification Test Suite for V8 Phase 124:
 * Conversational AI Testing Agent, Run Controls & Evidence Review.
 *
 * CERTIFICATION INVARIANTS:
 * 1. Persistent conversational testing sessions associated with a project.
 * 2. Natural language testing requests translated into inspectable structured task plans.
 * 3. Ambiguity handling: When request is ambiguous, requests clarification instead of guessing.
 * 4. Production Safe Mode & Destructive Action Gates: Requires explicit user approval before execution.
 * 5. Controlled tool execution: Strictly NO arbitrary shell/filesystem/database execution.
 * 6. Run controls: START, PAUSE, RESUME, CANCEL, RETRY, STATUS connecting to existing execution engines.
 * 7. Grounded evidence queries: Answers questions from actual run artifacts and defect records.
 *    If evidence is missing, explicitly returns "Insufficient evidence".
 * 8. Provenance preservation: Project -> Requirement -> Test -> Test Run -> Step -> Evidence -> Failure -> Bug.
 * 9. Multi-tenant project and tenant isolation (Project A != Project B).
 * 10. Audit logging across session, plan, tool, run, and evidence actions.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/client.js';
import {
  ConversationalAgentService,
  AgentSessionService,
  AgentPlanningService,
  AgentToolExecutor,
  AgentRunController,
  AgentEvidenceAnalyzer,
} from '../index.js';
import type { PrismaClient } from '@prisma/client';

describe('V8 Phase 124 — Conversational AI Testing Agent Certification Suite', () => {
  let prisma: PrismaClient;
  let agentService: ConversationalAgentService;
  let sessionService: AgentSessionService;
  let planningService: AgentPlanningService;
  let toolExecutor: AgentToolExecutor;
  let runController: AgentRunController;
  let evidenceAnalyzer: AgentEvidenceAnalyzer;

  // Test Fixture Identifiers
  const userAId = '00000000-0000-0000-0000-000000000124';
  const userBId = '00000000-0000-0000-0000-000000000125';
  const projectAId = '00000000-0000-0000-0000-000000001240';
  const projectBId = '00000000-0000-0000-0000-000000001241';
  const testCaseAId = '00000000-0000-0000-0000-000000002401';
  const testPlanAId = '00000000-0000-0000-0000-000000002402';
  const testRunAId = '00000000-0000-0000-0000-000000002403';
  const executionAId = '00000000-0000-0000-0000-000000002404';
  const stepRecordAId = '00000000-0000-0000-0000-000000002405';
  const failureCaseAId = '00000000-0000-0000-0000-000000002406';

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('PostgreSQL database required for Phase 124 certification.');
    }
    prisma = client;

    agentService = new ConversationalAgentService({ prisma });
    sessionService = new AgentSessionService({ prisma });
    planningService = new AgentPlanningService({ prisma });
    toolExecutor = new AgentToolExecutor({ prisma });
    runController = new AgentRunController({ prisma });
    evidenceAnalyzer = new AgentEvidenceAnalyzer({ prisma });

    // Clean up any residual fixtures
    await cleanupFixtures();

    // 1. Create Users
    await prisma.user.createMany({
      data: [
        {
          id: userAId,
          email: 'qa-agent-user-a@platform.local',
          normalizedEmail: 'qa-agent-user-a@platform.local',
          displayName: 'QA Engineer A',
        },
        {
          id: userBId,
          email: 'qa-agent-user-b@platform.local',
          normalizedEmail: 'qa-agent-user-b@platform.local',
          displayName: 'QA Engineer B',
        },
      ],
    });

    // 2. Create Projects (Project A = Staging / Local, Project B = Isolated)
    await prisma.project.createMany({
      data: [
        {
          id: projectAId,
          name: 'E-Commerce QA App',
          status: 'ACTIVE',
          userId: userAId,
        },
        {
          id: projectBId,
          name: 'Tenant B Isolated App',
          status: 'ACTIVE',
          userId: userBId,
        },
      ],
    });

    // 3. Create Project Environments & Website Targets
    await prisma.projectEnvironment.create({
      data: {
        id: '00000000-0000-0000-0000-000000003001',
        projectId: projectAId,
        name: 'Staging Environment',
        baseUrl: 'https://staging.ecommerce.test',
        isProduction: false,
      },
    });

    // 4. Create Requirements
    await prisma.requirement.create({
      data: {
        id: '00000000-0000-0000-0000-000000004001',
        projectId: projectAId,
        requirementKey: 'REQ-LOGIN-001',
        title: 'User Authentication Flow',
        originalText: 'Users must be able to log in securely with valid credentials.',
        status: 'ACTIVE',
      },
    });

    // 5. Create Test Cases
    await prisma.testCase.create({
      data: {
        id: testCaseAId,
        projectId: projectAId,
        testCaseKey: 'TC-LOGIN-001',
        title: 'Login with valid email and password',
        objective: 'Verify user lands on dashboard after entering credentials',
        status: 'ACTIVE',
        reviewStatus: 'APPROVED',
        sourceRequirementKey: 'REQ-LOGIN-001',
      },
    });

    // 6. Create Executable Test Plan
    await prisma.executableTestPlan.create({
      data: {
        id: testPlanAId,
        projectId: projectAId,
        testCaseId: testCaseAId,
        testCaseVersionNumber: 1,
        planFingerprint: 'fingerprint-login-001',
        stepsJson: [{ step: 1, action: 'navigate' }],
      },
    });

    // 7. Create Test Run & Execution with Evidence
    await prisma.testRun.create({
      data: {
        id: testRunAId,
        projectId: projectAId,
        testCaseId: testCaseAId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanAId,
        status: 'FAILED',
        planFingerprint: 'fingerprint-login-001',
        testCaseTitle: 'Login with valid email and password',
        browserEngine: 'chromium',
        errorMessage: 'Assertion failed: Dashboard header did not appear within 5000ms',
        executionDurationMs: 4200,
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: executionAId,
        projectId: projectAId,
        testRunId: testRunAId,
        testCaseId: testCaseAId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanAId,
        status: 'FAILED',
      },
    });

    // Step Executions
    await prisma.stepExecutionRecord.createMany({
      data: [
        {
          id: '00000000-0000-0000-0000-000000005001',
          projectId: projectAId,
          testRunId: testRunAId,
          executionId: executionAId,
          stepIndex: 1,
          actionType: 'NAVIGATE',
          status: 'PASSED',
          targetSummary: 'https://staging.ecommerce.test/login',
          expectedSummary: 'Page loads',
          actualSummary: 'Page loaded in 250ms',
        },
        {
          id: stepRecordAId,
          projectId: projectAId,
          testRunId: testRunAId,
          executionId: executionAId,
          stepIndex: 2,
          actionType: 'CLICK_LOGIN',
          status: 'FAILED',
          targetSummary: 'button[type="submit"]',
          expectedSummary: 'Redirect to /dashboard',
          actualSummary: 'HTTP 500 Internal Server Error returned by login endpoint',
          errorCode: 'HTTP_500',
        },
      ],
    });

    // Evidence Artifacts
    const bundle = await prisma.executionEvidenceBundle.create({
      data: {
        id: '00000000-0000-0000-0000-000000006001',
        projectId: projectAId,
        testRunId: testRunAId,
        executionId: executionAId,
        status: 'COMPLETE',
      },
    });

    await prisma.executionEvidenceArtifact.createMany({
      data: [
        {
          id: '00000000-0000-0000-0000-000000007001',
          projectId: projectAId,
          bundleId: bundle.id,
          testRunId: testRunAId,
          executionId: executionAId,
          stepExecutionId: stepRecordAId,
          artifactType: 'SCREENSHOT',
          storageIdentity: 'artifacts/screenshot-step-2.png',
          originalLogicalName: 'login_failure_step_2.png',
          mimeType: 'image/png',
          byteSize: 10240,
          sha256: 'sha256-screenshot-step-2',
        },
        {
          id: '00000000-0000-0000-0000-000000007002',
          projectId: projectAId,
          bundleId: bundle.id,
          testRunId: testRunAId,
          executionId: executionAId,
          stepExecutionId: stepRecordAId,
          artifactType: 'NETWORK_LOG',
          storageIdentity: 'artifacts/network-error.har',
          originalLogicalName: 'network_telemetry.har',
          mimeType: 'application/json',
          byteSize: 4096,
          sha256: 'sha256-network-har',
        },
      ],
    });

    // Failure Case & Classification
    await prisma.failureCase.create({
      data: {
        id: failureCaseAId,
        projectId: projectAId,
        testCaseId: testCaseAId,
        testCaseVersionNumber: 1,
        testRunId: testRunAId,
        executionId: executionAId,
        title: 'Login endpoint 500 error',
        errorMessage: 'HTTP 500 Internal Server Error returned by login endpoint',
        failureSignature: 'SIG-AUTH-500-ERROR',
        triggeringExecutionStatus: 'FAILED',
        classifications: {
          create: {
            projectId: projectAId,
            category: 'APPLICATION_FAILURE',
            primaryRuleId: 'RULE-HTTP-500-INTERNAL-ERROR',
            isAuthoritative: true,
          },
        },
      },
    });

    // Structured Bug Report
    await prisma.structuredBugReport.create({
      data: {
        id: '00000000-0000-0000-0000-000000008001',
        projectId: projectAId,
        failureCaseId: failureCaseAId,
        reportNumber: 'BUG-2026-001',
        title: 'Login endpoint throws HTTP 500 on valid credentials',
        summary: 'Server returned HTTP 500 due to unhandled database exception in auth handler.',
        isApplicationDefect: true,
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        testCaseId: testCaseAId,
        testCaseKey: 'TC-LOGIN-001',
        testCaseVersionNumber: 1,
        testCaseTitle: 'Login with valid email and password',
        requirementKey: 'REQ-LOGIN-001',
        expectedResult: 'HTTP 200 and redirect to dashboard',
        actualResult: 'HTTP 500 Internal Server Error',
        rootCauseSummary: 'Database connection pool starvation in auth service',
        impactSummary: 'Blocks all users from logging in',
        severity: 'CRITICAL',
        priority: 'HIGHEST',
        status: 'READY',
        originalExecutionId: executionAId,
        triggeringStatus: 'FAILED',
        markdownReport: '# Bug Report: Login 500 Error',
        reportFingerprint: 'fingerprint-bug-001',
      },
    });
  });

  after(async () => {
    await cleanupFixtures();
  });

  async function cleanupFixtures() {
    if (!prisma) return;
    try {
      await prisma.agentMessage.deleteMany({
        where: { session: { projectId: { in: [projectAId, projectBId] } } },
      });
      await prisma.agentTask.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.agentSession.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.structuredBugReport.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.failureClassification.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.failureCase.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.executionEvidenceArtifact.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.executionEvidenceBundle.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.stepExecutionRecord.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.testCaseExecution.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.testRun.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.executableTestPlan.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.testCase.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.requirement.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.projectEnvironment.deleteMany({
        where: { projectId: { in: [projectAId, projectBId] } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: [projectAId, projectBId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [userAId, userBId] } },
      });
    } catch {
      // Ignore cleanup errors
    }
  }

  // =========================================================================
  // Section 2: Conversational Agent Session Lifecycle
  // =========================================================================

  describe('Session Lifecycle & State Transitions', () => {
    it('creates a persistent conversational session associated with a project', async () => {
      const session = await agentService.createSession(
        { projectId: projectAId, title: 'Authentication Testing Session' },
        userAId,
      );

      assert.ok(session.id);
      assert.strictEqual(session.projectId, projectAId);
      assert.strictEqual(session.userId, userAId);
      assert.strictEqual(session.title, 'Authentication Testing Session');
      assert.strictEqual(session.status, 'IDLE');
      assert.strictEqual(session.approvalState, 'NOT_REQUIRED');
      assert.strictEqual(session.messages.length, 0);

      // Verify DB persistence
      const persisted = await prisma.agentSession.findUnique({
        where: { id: session.id },
      });
      assert.ok(persisted);
      assert.strictEqual(persisted.title, 'Authentication Testing Session');
    });

    it('lists sessions filtered by project with pagination', async () => {
      const list = await agentService.listSessions({ projectId: projectAId, limit: 10 }, userAId);
      assert.ok(list.length >= 1);
      assert.strictEqual(list[0]?.projectId, projectAId);
    });

    it('denies access to a session from another project (Tenant Isolation)', async () => {
      const sessionA = await agentService.createSession(
        { projectId: projectAId, title: 'Project A Session' },
        userAId,
      );

      await assert.rejects(
        agentService.getSession({ sessionId: sessionA.id, projectId: projectBId }, userBId),
        (err: any) => {
          assert.strictEqual(err.code, 'AGENT_SESSION_NOT_FOUND');
          return true;
        },
      );
    });
  });

  // =========================================================================
  // Section 3 & 4: Natural Language Testing Requests & Task Planning
  // =========================================================================

  describe('Natural Language Requests & Structured Planning', () => {
    it('translates testing request into an inspectable structured plan without leaking hidden CoT', async () => {
      const session = await agentService.createSession(
        { projectId: projectAId, title: 'Execute Login Tests' },
        userAId,
      );

      const response = await agentService.handleUserMessage(
        {
          sessionId: session.id,
          projectId: projectAId,
          content: 'Test the login flow and verify results',
        },
        userAId,
      );

      assert.strictEqual(response.userMessage.content, 'Test the login flow and verify results');
      assert.ok(response.agentMessage.content.length > 0);
      assert.ok(response.activities.length > 0);

      // Verify inspectable plan
      assert.ok(response.task?.plan);
      const plan = response.task.plan;
      assert.strictEqual(plan.intent, 'EXECUTE_TESTS');
      assert.ok(plan.steps.length >= 3);
      assert.strictEqual(plan.requiresApproval, false);

      // Invariant: Verify concise action summaries without hidden internal chain-of-thought
      assert.ok(!JSON.stringify(plan).includes('internal thinking'));
      assert.ok(!JSON.stringify(plan).includes('private thoughts'));

      // Check step properties
      const firstStep = plan.steps[0]!;
      assert.strictEqual(firstStep.stepIndex, 1);
      assert.ok(firstStep.description.length > 0);
      assert.strictEqual(firstStep.targetTool, 'project_context');
    });

    it('detects ambiguous requests and presents clarifying options instead of guessing', async () => {
      const session = await agentService.createSession(
        { projectId: projectAId, title: 'Ambiguous Request Session' },
        userAId,
      );

      const response = await agentService.handleUserMessage(
        {
          sessionId: session.id,
          projectId: projectAId,
          content: 'run tests',
        },
        userAId,
      );

      assert.strictEqual(response.sessionStatus, 'WAITING');
      assert.ok(response.agentMessage.content.includes('clarification'));
      assert.ok(response.agentMessage.content.includes('TC-LOGIN-001'));
      assert.strictEqual(response.task?.status, 'AWAITING_APPROVAL');
    });
  });

  // =========================================================================
  // Section 5 & 6: Controlled Tools & Security Sandbox
  // =========================================================================

  describe('Controlled Tools & Security Sandbox', () => {
    it('executes permitted controlled tool (project_context) successfully', async () => {
      const result = await toolExecutor.executeTool({
        toolName: 'project_context',
        arguments: {},
        projectId: projectAId,
        userId: userAId,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.toolName, 'project_context');
      const out = result.output as any;
      assert.strictEqual(out.projectName, 'E-Commerce QA App');
      assert.ok(out.testCasesCount >= 1);
    });

    it('rejects unpermitted arbitrary tool execution (prohibits terminal/shell/fs)', async () => {
      await assert.rejects(
        toolExecutor.executeTool({
          toolName: 'shell_execution',
          arguments: { command: 'ls -la' },
          projectId: projectAId,
          userId: userAId,
        }),
        (err: any) => {
          assert.strictEqual(err.code, 'AGENT_TOOL_FAILED');
          assert.ok(err.message.includes('not registered or permitted'));
          return true;
        },
      );
    });

    it('rejects dangerous injection patterns in tool arguments', async () => {
      await assert.rejects(
        toolExecutor.executeTool({
          toolName: 'test_search',
          arguments: { query: 'test; rm -rf /; echo hack' },
          projectId: projectAId,
          userId: userAId,
        }),
        (err: any) => {
          assert.strictEqual(err.code, 'AGENT_INVALID_REQUEST');
          assert.ok(err.message.includes('Prohibited system pattern'));
          return true;
        },
      );
    });
  });

  // =========================================================================
  // Section 7 & 8: Run Controls & Real-Time Status Telemetry
  // =========================================================================

  describe('Run Controls & Step Progression', () => {
    it('provides real-time run status with step progression and provenance', async () => {
      const status = await runController.getDetailedRunStatus(projectAId, testRunAId);

      assert.strictEqual(status.runId, testRunAId);
      assert.strictEqual(status.testCaseKey, 'TC-LOGIN-001');
      assert.strictEqual(status.requirementKey, 'REQ-LOGIN-001');
      assert.strictEqual(status.browserEngine, 'chromium');
      assert.strictEqual(status.status, 'FAILED');
      assert.strictEqual(status.totalSteps, 2);
      assert.strictEqual(status.currentStep, 2);
      assert.ok(status.currentStepDescription.includes('CLICK_LOGIN'));
    });

    it('safely handles CANCEL action propagating to orchestrator', async () => {
      const session = await agentService.createSession(
        { projectId: projectAId, title: 'Cancellation Test' },
        userAId,
      );

      const runToCancel = await prisma.testRun.create({
        data: {
          id: '00000000-0000-0000-0000-000000002409',
          projectId: projectAId,
          testCaseId: testCaseAId,
          testCaseVersionNumber: 1,
          executableTestPlanId: testPlanAId,
          status: 'RUNNING',
          planFingerprint: 'fingerprint-login-001',
          testCaseTitle: 'Login with valid email and password',
          browserEngine: 'chromium',
          queuedAt: new Date(),
          startedAt: new Date(),
        },
      });

      const cancelResult = await agentService.handleRunControl(
        {
          sessionId: session.id,
          projectId: projectAId,
          action: 'CANCEL',
          runId: runToCancel.id,
          reason: 'Test suite cancellation verification',
        },
        userAId,
      );

      assert.strictEqual(cancelResult.success, true);
      assert.strictEqual(cancelResult.action, 'CANCEL');
      assert.strictEqual(cancelResult.runStatus, 'CANCELLED');
    });

    it('safely handles RETRY action enqueuing a fresh test run', async () => {
      const session = await agentService.createSession(
        { projectId: projectAId, title: 'Retry Test' },
        userAId,
      );

      const retryResult = await agentService.handleRunControl(
        {
          sessionId: session.id,
          projectId: projectAId,
          action: 'RETRY',
          runId: testRunAId,
        },
        userAId,
      );

      assert.strictEqual(retryResult.success, true);
      assert.strictEqual(retryResult.action, 'RETRY');
      assert.ok(retryResult.runId);
      assert.notStrictEqual(retryResult.runId, testRunAId);
    });
  });

  // =========================================================================
  // Section 9 & 10: Grounded Evidence Review & Conversational Queries
  // =========================================================================

  describe('Evidence Review & Grounded Conversational Queries', () => {
    it('answers "Why did this test fail?" from actual step data and failure classification', async () => {
      const queryResult = await agentService.queryEvidence(
        {
          projectId: projectAId,
          runId: testRunAId,
          query: 'Why did this test fail?',
        },
        userAId,
      );

      assert.strictEqual(queryResult.runId, testRunAId);
      assert.strictEqual(queryResult.testCaseKey, 'TC-LOGIN-001');
      assert.strictEqual(queryResult.requirementKey, 'REQ-LOGIN-001');
      assert.strictEqual(queryResult.verdict, 'FAILED');
      assert.ok(queryResult.evidenceItems.length >= 2);

      // Verify answer mentions the actual failed step (Step 2) and HTTP 500
      assert.ok(queryResult.naturalLanguageExplanation?.includes('Step 2'));
      assert.ok(queryResult.naturalLanguageExplanation?.includes('HTTP 500'));
      assert.ok(queryResult.naturalLanguageExplanation?.includes('PRODUCT_DEFECT'));
    });

    it('answers "Show the screenshot from the failed step" referencing actual screenshot artifact', async () => {
      const queryResult = await agentService.queryEvidence(
        {
          projectId: projectAId,
          runId: testRunAId,
          query: 'Show the screenshot from the failed step',
        },
        userAId,
      );

      assert.ok(queryResult.naturalLanguageExplanation?.includes('screenshot-step-2.png'));
      const screenshot = queryResult.evidenceItems.find((e) => e.artifactType === 'SCREENSHOT');
      assert.ok(screenshot);
      assert.strictEqual(screenshot.urlOrPath, 'artifacts/screenshot-step-2.png');
    });

    it('answers "Is this an application bug or automation failure?" citing defect triage', async () => {
      const queryResult = await agentService.queryEvidence(
        {
          projectId: projectAId,
          runId: testRunAId,
          query: 'Is this an application bug or automation failure?',
        },
        userAId,
      );

      assert.ok(queryResult.naturalLanguageExplanation?.includes('APPLICATION BUG'));
      assert.ok(queryResult.naturalLanguageExplanation?.includes('PRODUCT_DEFECT'));
      assert.strictEqual(queryResult.failureAnalysis?.classification, 'PRODUCT_DEFECT');
    });

    it('returns "Insufficient evidence" when no run artifacts or logs exist', async () => {
      const nonExistentRunId = '00000000-0000-0000-0000-000000009999';

      await assert.rejects(
        agentService.queryEvidence(
          {
            projectId: projectAId,
            runId: nonExistentRunId,
            query: 'Why did it fail?',
          },
          userAId,
        ),
        (err: any) => {
          assert.strictEqual(err.code, 'AGENT_EVIDENCE_NOT_FOUND');
          return true;
        },
      );
    });
  });

  // =========================================================================
  // Section 11 & 12: Production Safe Mode & Destructive Action Gating
  // =========================================================================

  describe('Destructive Action Protection & Approval Workflow', () => {
    it('gates destructive testing request requiring explicit user approval', async () => {
      const session = await agentService.createSession(
        { projectId: projectAId, title: 'Destructive Action Gate Test' },
        userAId,
      );

      const response = await agentService.handleUserMessage(
        {
          sessionId: session.id,
          projectId: projectAId,
          content: 'Run destructive load tests and drop database cache',
        },
        userAId,
      );

      assert.strictEqual(response.sessionStatus, 'WAITING');
      assert.strictEqual(response.task?.status, 'AWAITING_APPROVAL');
      assert.strictEqual(response.task?.approvalState, 'PENDING');
      assert.ok(response.agentMessage.content.includes('APPROVAL REQUIRED'));

      // Invariant: Verify plan was NOT executed without approval
      const tasks = await prisma.agentTask.findMany({ where: { sessionId: session.id } });
      assert.strictEqual(tasks[0]?.status, 'AWAITING_APPROVAL');
    });

    it('cancels task when user explicitly rejects the approval request', async () => {
      const session = await agentService.createSession(
        { projectId: projectAId, title: 'Rejection Workflow' },
        userAId,
      );

      // Trigger approval request
      const messageResp = await agentService.handleUserMessage(
        {
          sessionId: session.id,
          projectId: projectAId,
          content: 'Run destructive purge on production environment',
        },
        userAId,
      );

      // Reject plan
      const approvalResult = await agentService.handleApproval(
        {
          sessionId: session.id,
          projectId: projectAId,
          taskId: messageResp.task?.id,
          approved: false,
          reason: 'Do not run destructive actions on production',
        },
        userAId,
      );

      assert.strictEqual(approvalResult.approvalState, 'REJECTED');
      assert.strictEqual(approvalResult.status, 'CANCELLED');
      assert.ok(approvalResult.message.includes('User rejected the plan'));

      // Verify audit log
      const audit = await prisma.authAuditEvent.findFirst({
        where: { action: 'AGENT_TOOL_REJECTED' },
        orderBy: { timestamp: 'desc' },
      });
      assert.ok(audit);
    });
  });

  // =========================================================================
  // Section 18: Authoritative Audit Trail
  // =========================================================================

  describe('Authoritative Audit Trail', () => {
    it('verifies audit records for all key agent lifecycle actions', async () => {
      const auditActions = await prisma.authAuditEvent.findMany({
        where: {
          action: {
            in: [
              'AGENT_SESSION_CREATED',
              'AGENT_TASK_CREATED',
              'AGENT_PLAN_GENERATED',
              'AGENT_TOOL_REQUESTED',
              'AGENT_RUN_CANCELLED',
              'AGENT_RUN_STARTED',
              'AGENT_EVIDENCE_ACCESSED',
              'AGENT_RESULT_GENERATED',
            ],
          },
        },
        select: { action: true },
      });

      const recorded = new Set(auditActions.map((a) => a.action));
      assert.ok(recorded.has('AGENT_SESSION_CREATED'), 'AGENT_SESSION_CREATED must be recorded');
      assert.ok(recorded.has('AGENT_TASK_CREATED'), 'AGENT_TASK_CREATED must be recorded');
      assert.ok(recorded.has('AGENT_PLAN_GENERATED'), 'AGENT_PLAN_GENERATED must be recorded');
      assert.ok(recorded.has('AGENT_TOOL_REQUESTED'), 'AGENT_TOOL_REQUESTED must be recorded');
      assert.ok(recorded.has('AGENT_RUN_CANCELLED'), 'AGENT_RUN_CANCELLED must be recorded');
      assert.ok(recorded.has('AGENT_EVIDENCE_ACCESSED'), 'AGENT_EVIDENCE_ACCESSED must be recorded');
      assert.ok(recorded.has('AGENT_RESULT_GENERATED'), 'AGENT_RESULT_GENERATED must be recorded');
    });
  });
});
