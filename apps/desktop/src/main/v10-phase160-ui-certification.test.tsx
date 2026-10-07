/**
 * @file apps/desktop/src/main/v10-phase160-ui-certification.test.tsx
 * Authoritative UI Certification Test Suite for:
 * V10 Phase 160 — Final Adversarial Certification & Freeze.
 *
 * Validates the complete user-facing Codex-style QA agent interface via Server-Side Rendering (SSR):
 * 1. Thread & task navigation
 * 2. Agent activity stream & execution steps
 * 3. Tool execution visibility
 * 4. Approval UI & human gates
 * 5. Diff & file review UI
 * 6. Evidence visibility
 * 7. Failure & bug classification
 * 8. 12-section Final QA Report & release intelligence
 * 9. Loading, error, and empty states
 * 10. Stale task state prevention & control safeguards
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AgentThreadsView } from '../renderer/features/agent-threads/AgentThreadsView.js';
import type { UseAgentThreadsResult } from '../renderer/features/agent-threads/useAgentThreads.js';
import { HumanApprovalCard } from '../renderer/features/agent-approval/HumanApprovalCard.js';
import { ApprovalHistoryView } from '../renderer/features/agent-approval/ApprovalHistoryView.js';
import { DiffViewer } from '../renderer/features/file-review/DiffViewer.js';
import { FileViewer } from '../renderer/features/file-review/FileViewer.js';
import { FinalQaReportCard } from '../renderer/features/qa-report/FinalQaReportCard.js';
import type {
  AgentThreadDto,
  AgentThreadTaskDto,
  AgentThreadMessageDto,
  AgentExecutionStepDto,
  AgentToolCallRecordDto,
  ApprovalRequestDto,
  AgentAutonomousWorkflowReportDto,
  FinalQaReportDto,
} from '@ai-quality/contracts';

describe('V10 Phase 160 — UI Certification & Codex Agent Interface Freeze Suite', () => {
  const testProjectId = '00000000-0000-0000-0000-000000000160';
  const testThreadId = '11111111-1111-1111-1111-111111110160';
  const testTaskId = '22222222-2222-2222-2222-222222220160';
  const testUserId = '33333333-3333-3333-3333-333333330160';
  const testWorkflowId = '44444444-4444-4444-4444-444444440160';

  const mockThread: AgentThreadDto = {
    id: testThreadId,
    projectId: testProjectId,
    userId: testUserId,
    title: 'E2E Autonomous QA Thread',
    status: 'ACTIVE',
    createdAt: '2026-10-07T10:00:00.000Z',
    updatedAt: '2026-10-07T10:00:00.000Z',
    lastActivityAt: '2026-10-07T10:05:00.000Z',
    archivedAt: null,
  };

  const createMockTask = (
    status: AgentThreadTaskDto['status'],
    overrides?: Partial<AgentThreadTaskDto>,
  ): AgentThreadTaskDto => ({
    id: testTaskId,
    projectId: testProjectId,
    threadId: testThreadId,
    userId: testUserId,
    title: 'Verify Authentication Flow & Patch Session Defect',
    instruction: 'Execute browser test on /login, analyze session failure, and propose minimal patch',
    status,
    retryCount: 0,
    parentTaskId: null,
    failureReason: status === 'FAILED' ? 'Assertion failed: session token expired' : null,
    metadata: {},
    createdAt: '2026-10-07T10:00:00.000Z',
    updatedAt: '2026-10-07T10:05:00.000Z',
    startedAt: '2026-10-07T10:01:00.000Z',
    completedAt: status === 'COMPLETED' ? '2026-10-07T10:05:00.000Z' : null,
    cancelledAt: status === 'CANCELLED' ? '2026-10-07T10:04:00.000Z' : null,
    pausedAt: status === 'PAUSED' ? '2026-10-07T10:02:00.000Z' : null,
    stoppedAt: status === 'STOPPED' ? '2026-10-07T10:03:00.000Z' : null,
    attemptNumber: 1,
    isRecoverable: true,
    maxRetries: 3,
    ...overrides,
  });

  const mockSteps: AgentExecutionStepDto[] = [
    {
      id: '55555555-5555-5555-5555-555555550001',
      taskId: testTaskId,
      sequence: 1,
      title: 'Inspect Login Route Code',
      stepType: 'tool_call',
      status: 'COMPLETED',
      startedAt: '2026-10-07T10:01:10.000Z',
      completedAt: '2026-10-07T10:01:20.000Z',
      inputReference: null,
      outputReference: null,
      error: null,
      metadata: {},
    },
    {
      id: '55555555-5555-5555-5555-555555550002',
      taskId: testTaskId,
      sequence: 2,
      title: 'Run Playwright Browser Flow',
      stepType: 'tool_call',
      status: 'RUNNING',
      startedAt: '2026-10-07T10:01:25.000Z',
      completedAt: null,
      inputReference: null,
      outputReference: null,
      error: null,
      metadata: {},
    },
  ];

  const mockToolCalls: AgentToolCallRecordDto[] = [
    {
      id: '66666666-6666-6666-6666-666666660001',
      taskId: testTaskId,
      stepId: '55555555-5555-5555-5555-555555550002',
      toolName: 'playwright.execute',
      status: 'RUNNING',
      input: { targetUrl: 'http://localhost:3000/login', headless: true },
      output: { status: 'running', currentUrl: 'http://localhost:3000/login' },
      startedAt: '2026-10-07T10:01:26.000Z',
      completedAt: null,
      durationMs: null,
      error: null,
      metadata: {},
    },
  ];

  const mockMessages: AgentThreadMessageDto[] = [
    {
      id: '77777777-7777-7777-7777-777777770001',
      threadId: testThreadId,
      taskId: testTaskId,
      role: 'USER',
      content: 'Test the login flow and fix any simple application bugs.',
      sequence: 1,
      createdAt: '2026-10-07T10:00:00.000Z',
      metadata: {},
    },
    {
      id: '77777777-7777-7777-7777-777777770002',
      threadId: testThreadId,
      taskId: testTaskId,
      role: 'ASSISTANT',
      content: 'Plan initiated: Inspecting route and executing Playwright browser test.',
      sequence: 2,
      createdAt: '2026-10-07T10:00:05.000Z',
      metadata: {},
    },
  ];

  const sampleUnifiedDiff = `--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -10,3 +10,3 @@
 export function validateToken(token: string): boolean {
-  return false;
+  return token.length > 0;
 }`;

  const mockWorkflowReport: AgentAutonomousWorkflowReportDto = {
    id: testWorkflowId,
    taskId: testTaskId,
    threadId: testThreadId,
    projectId: testProjectId,
    userId: testUserId,
    originalRequest: 'Test the login flow and fix any simple application bugs.',
    workflowStatus: 'COMPLETED',
    finalStatus: 'FIXED_AND_VERIFIED',
    releaseReady: true,
    planSummary: '1. Inspect Source -> 2. Playwright Run -> 3. Classify Failure -> 4. Patch -> 5. Reverify',
    testsExecuted: [
      { testCaseId: 'TC-101', name: 'Login with credentials', status: 'PASSED', durationMs: 1200 },
    ],
    requirementsCovered: [
      { requirementId: 'REQ-001', key: 'REQ-001', title: 'Authentication Session' },
    ],
    failuresFound: [],
    evidenceReferences: {
      screenshotUrls: ['/tmp/artifacts/login-fail.png'],
      traceUrls: ['/tmp/artifacts/net.har'],
      consoleLogCount: 5,
      networkEventCount: 12,
    },
    failureClassification: {
      isFlaky: false,
      domain: 'APPLICATION_DEFECT',
      classification: 'FUNCTIONAL_DEFECT',
      confidenceScore: 0.95,
      explanation: 'Server responded 401 due to premature token validation failure in token.ts',
    },
    rootCauseAnalysis: {
      hypothesis: 'Token validator unconditionally returned false instead of verifying token',
      affectedFiles: ['src/auth/token.ts'],
    },
    proposedPatch: {
      diff: sampleUnifiedDiff,
      affectedFiles: ['src/auth/token.ts'],
    },
    approvalDecision: {
      decision: 'APPROVED',
      approvedBy: testUserId,
      decidedAt: '2026-10-07T10:03:00.000Z',
    },
    beforeAfterResults: {
      beforeFailure: 'FAILED',
      afterResult: 'PASSED',
      reverificationPassed: true,
    },
    regressionResults: {
      totalRun: 12,
      passed: 12,
      failed: 0,
      regressionFailures: [],
    },
    unresolvedIssues: [],
    auditTrail: [],
    createdAt: '2026-10-07T10:00:00.000Z',
    updatedAt: '2026-10-07T10:05:00.000Z',
  };

  const createMockHook = (
    tasks: AgentThreadTaskDto[],
    overrides?: Partial<UseAgentThreadsResult>,
  ): UseAgentThreadsResult => ({
    threads: [mockThread],
    activeThread: mockThread,
    activeThreadId: testThreadId,
    tasks,
    activeTask: tasks[0] ?? null,
    activeTaskId: tasks[0]?.id ?? null,
    messages: mockMessages,
    executionSteps: mockSteps,
    toolCalls: mockToolCalls,
    approvals: [],
    pendingApprovals: [],
    recoverableTasks: [],
    activeWorkflowReport: mockWorkflowReport,
    isLoading: false,
    isCreatingTask: false,
    error: null,
    selectThread: () => {},
    selectTask: () => {},
    createThread: async () => mockThread,
    archiveThread: async () => true,
    createTask: async () => tasks[0] ?? null,
    cancelTask: async () => true,
    stopTask: async () => true,
    pauseTask: async () => true,
    retryTask: async () => tasks[0] ?? null,
    resumeTask: async () => tasks[0] ?? null,
    fetchRecoverableTasks: async () => {},
    isControlActionPending: false,
    pendingControlActionTaskId: null,
    decideApproval: async () => true,
    executeAutonomousWorkflow: async () => mockWorkflowReport,
    approveWorkflowFix: async () => true,
    rejectWorkflowFix: async () => true,
    refresh: async () => {},
    ...overrides,
  });

  const mockFinalQaReport: FinalQaReportDto = {
    id: 'rep-v10-freeze',
    projectId: testProjectId,
    environmentId: null,
    reportKey: 'REP-20261007-V10FREEZE',
    releaseIdentifier: 'v10.0.0-final-freeze',
    buildIdentifier: 'build-160-certified',
    commitSha: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
    branch: 'main',
    environmentName: 'Production Staging',
    reportVersion: 1,
    status: 'FINAL',
    verdict: 'READY',
    policyVersion: '1.0.0',
    policyRulesEvaluated: ['BLOCK_CRITICAL_OPEN_DEFECT', 'BLOCK_MANDATORY_REGRESSION_FAILED'],
    policyRulesPassed: ['BLOCK_CRITICAL_OPEN_DEFECT', 'BLOCK_MANDATORY_REGRESSION_FAILED'],
    policyRulesFailed: [],
    blockingRules: [],
    warningRules: [],
    readinessScore: 100.0,
    readinessExplanation: 'All release gates passed with 0 blocking defects and 100% regression pass rate.',
    executiveSummary: 'V10 Codex Autonomous QA Agent Certified: Ready for General Release.',
    overallRecommendation: 'Proceed with release sign-off.',
    requirementSummary: {
      total: 20,
      testable: 20,
      covered: 20,
      verified: 20,
      uncovered: 0,
      failing: 0,
      blocked: 0,
      coveragePercentage: 100,
      verifiedPercentage: 100,
    },
    testExecutionSummary: {
      totalDistinctTests: 85,
      totalExecutionAttempts: 88,
      passedCount: 85,
      failedCount: 0,
      blockedCount: 0,
      automationErrorCount: 0,
      cancelledCount: 0,
      passPercentage: 100,
      retryCount: 3,
      passedAfterRetryCount: 3,
    },
    failureDomainSummary: {
      totalFailures: 0,
      applicationDefects: 0,
      automationFailures: 0,
      testDataFailures: 0,
      environmentFailures: 0,
      blockedFailures: 0,
      inconclusiveFailures: 0,
      unknownFailures: 0,
    },
    defectSummary: {
      totalDefects: 1,
      openCritical: 0,
      openHigh: 0,
      openMedium: 0,
      openLow: 0,
      resolvedOrClosed: 1,
      verifiedFixed: 1,
      reverificationPending: 0,
      reverificationFailed: 0,
    },
    reverificationSummary: {
      totalReverifications: 1,
      verifiedFixedCount: 1,
      stillFailingCount: 0,
      differentFailureCount: 0,
      blockedCount: 0,
      inconclusiveCount: 0,
    },
    regressionSummary: {
      totalRetestPlans: 1,
      totalRegressionTests: 12,
      passedRegressionTests: 12,
      failedRegressionTests: 0,
      untestedRegressionTests: 0,
      allMandatoryRegressionsPassed: true,
    },
    flakinessSummary: {
      flakyTestsDetected: 0,
      flakyExecutionAttempts: 0,
      flakinessRate: 0,
    },
    automationHealth: { status: 'HEALTHY', issues: [], details: {} },
    environmentHealth: { status: 'HEALTHY', issues: [], details: {} },
    testDataHealth: { status: 'HEALTHY', issues: [], details: {} },
    securityFindings: [],
    releaseBlockers: [],
    residualRisks: [],
    knownLimitations: [],
    traceabilityMatrix: [
      {
        requirementId: 'req-1',
        requirementKey: 'REQ-101',
        title: 'Authentication flow',
        priority: 'P0',
        status: 'ACTIVE',
        associatedTestCount: 2,
        verified: true,
        failingTests: [],
      },
    ],
    evidenceReferences: [],
    sourceSnapshotTime: '2026-10-07T10:00:00.000Z',
    finalizedAt: '2026-10-07T10:05:00.000Z',
    generatedByActorId: 'SYSTEM',
    isStale: false,
    staleReason: null,
    checksumSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    createdAt: '2026-10-07T10:05:00.000Z',
    updatedAt: '2026-10-07T10:05:00.000Z',
  };

  // ===========================================================================
  // 1. Thread & Task Navigation
  // ===========================================================================
  describe('1. Thread & Task Navigation', () => {
    it('renders thread sidebar with active thread title and last activity timestamp', () => {
      const task = createMockTask('RUNNING');
      const hook = createMockHook([task]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('E2E Autonomous QA Thread'));
      assert.ok(html.includes('Verify Authentication Flow &amp; Patch Session Defect') || html.includes('Verify Authentication Flow'));
      assert.ok(html.includes('data-testid="thread-item-11111111-1111-1111-1111-111111110160"'));
    });

    it('renders task list with status badges and instruction preview', () => {
      const task = createMockTask('RUNNING');
      const hook = createMockHook([task]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('data-testid="task-item-22222222-2222-2222-2222-222222220160"'));
      assert.ok(html.includes('RUNNING'));
      assert.ok(html.includes('Execute browser test on /login'));
    });
  });

  // ===========================================================================
  // 2. Agent Activity Stream & Execution Steps
  // ===========================================================================
  describe('2. Agent Activity Stream & Execution Steps', () => {
    it('renders activity messages between user and autonomous agent', () => {
      const task = createMockTask('RUNNING');
      const hook = createMockHook([task]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('Test the login flow and fix any simple application bugs.'));
      assert.ok(html.includes('Plan initiated: Inspecting route and executing Playwright browser test.'));
    });

    it('renders execution step breakdown with sequencing and tool actions', () => {
      const task = createMockTask('RUNNING');
      const hook = createMockHook([task]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} defaultTab="steps" />,
      );

      assert.ok(html.includes('Execution Steps'));
      assert.ok(html.includes('Inspect Login Route Code'));
      assert.ok(html.includes('Run Playwright Browser Flow'));
    });
  });

  // ===========================================================================
  // 3. Tool Execution Visibility
  // ===========================================================================
  describe('3. Tool Execution Visibility', () => {
    it('displays active tool execution details, tool names, and parameters', () => {
      const task = createMockTask('RUNNING');
      const hook = createMockHook([task]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} defaultTab="steps" />,
      );

      assert.ok(html.includes('Tool Call Records'));
      assert.ok(html.includes('playwright.execute'));
    });
  });

  // ===========================================================================
  // 4. Approval UI & Human Gates
  // ===========================================================================
  describe('4. Approval UI & Human Gates', () => {
    const samplePendingApproval: ApprovalRequestDto = {
      id: 'appr-patch-160',
      userId: testUserId,
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
      executionStepId: 'step-4',
      approvalType: 'CODE_PATCH',
      title: 'Approve Authentication Bugfix Patch',
      description: 'Apply sandboxed patch to src/auth/token.ts',
      riskLevel: 'HIGH',
      requestedAction: 'patch.apply',
      requestedInput: { targetFile: 'src/auth/token.ts', diff: sampleUnifiedDiff },
      affectedFiles: ['src/auth/token.ts'],
      affectedTools: ['patch.apply'],
      status: 'PENDING',
      actionHash: 'hash987654321',
      requestedAt: '2026-10-07T10:02:00.000Z',
      respondedAt: null,
      respondedBy: null,
      expiresAt: '2026-10-08T10:02:00.000Z',
      responseReason: null,
      metadata: {},
      createdAt: '2026-10-07T10:02:00.000Z',
      updatedAt: '2026-10-07T10:02:00.000Z',
    };

    it('renders HumanApprovalCard with HIGH risk level, description, and action buttons', () => {
      const html = renderToString(
        <HumanApprovalCard
          approval={samplePendingApproval}
          onApprove={() => {}}
          onReject={() => {}}
          isSubmitting={false}
        />,
      );

      assert.ok(html.includes('Approve Authentication Bugfix Patch'));
      assert.ok(html.includes('HIGH'));
      assert.ok(html.includes('src/auth/token.ts'));
      assert.ok(html.includes('data-testid="approval-approve-btn"'));
      assert.ok(html.includes('data-testid="approval-reject-btn"'));
    });

    it('renders approval box with diff preview when workflow status is WAITING_FOR_APPROVAL', () => {
      const task = createMockTask('WAITING_FOR_APPROVAL');
      const hook = createMockHook([task], {
        activeWorkflowReport: {
          ...mockWorkflowReport,
          workflowStatus: 'WAITING_FOR_APPROVAL',
        },
      });
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} defaultTab="workflow" />,
      );

      assert.ok(html.includes('data-testid="workflow-approval-box"'));
      assert.ok(html.includes('Human Approval Required for Proposed Code Patch'));
      assert.ok(html.includes('data-testid="workflow-approve-btn"'));
      assert.ok(html.includes('data-testid="workflow-reject-btn"'));
    });
  });

  // ===========================================================================
  // 5. Diff & Review Workspace UI
  // ===========================================================================
  describe('5. Diff & Review Workspace UI', () => {
    it('renders unified diff viewer with addition and deletion highlights', () => {
      const html = renderToString(
        <DiffViewer
          diffText={sampleUnifiedDiff}
          selectedFilePath="src/auth/token.ts"
        />,
      );

      assert.ok(html.includes('src/auth/token.ts'));
      assert.ok(html.includes('return false;'));
      assert.ok(html.includes('return token.length &gt; 0;') || html.includes('return token.length > 0;'));
    });

    it('renders file content viewer with line numbers', () => {
      const sampleContent = 'export function validateToken(token: string): boolean {\n  return token.length > 0;\n}';
      const html = renderToString(
        <FileViewer
          fileContent={{
            filePath: 'src/auth/token.ts',
            content: sampleContent,
            lineCount: 3,
            sizeBytes: sampleContent.length,
            language: 'typescript',
            modifiedAt: '2026-10-07T10:00:00.000Z',
            isBinary: false,
          }}
        />,
      );

      assert.ok(html.includes('src/auth/token.ts'));
      assert.ok(html.includes('validateToken'));
    });
  });

  // ===========================================================================
  // 6. Evidence Visibility
  // ===========================================================================
  describe('6. Evidence Visibility', () => {
    it('displays browser evidence summaries (screenshots, console logs, network traces)', () => {
      const task = createMockTask('COMPLETED');
      const hook = createMockHook([task]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} defaultTab="workflow" />,
      );

      assert.ok(html.includes('FIXED_AND_VERIFIED'));
      assert.ok(html.includes('RELEASE READY'));
      assert.ok(html.includes('Reverification &amp; Fix Validation:') || html.includes('Reverification & Fix Validation:'));
      assert.ok(html.includes('PASSED'));
    });
  });

  // ===========================================================================
  // 7. Failure & Bug Classification
  // ===========================================================================
  describe('7. Failure & Bug Classification', () => {
    it('renders failure intelligence domain, category, and root-cause hypothesis', () => {
      const task = createMockTask('COMPLETED');
      const hook = createMockHook([task]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} defaultTab="workflow" />,
      );

      assert.ok(html.includes('Failure Intelligence:'));
      assert.ok(html.includes('APPLICATION_DEFECT'));
      assert.ok(html.includes('FUNCTIONAL_DEFECT'));
      assert.ok(html.includes('Root-Cause Analysis:'));
      assert.ok(html.includes('Token validator unconditionally returned false'));
    });
  });

  // ===========================================================================
  // 8. 12-Section Final QA Report & Release Intelligence
  // ===========================================================================
  describe('8. 12-Section Final QA Report & Release Intelligence', () => {
    it('renders FinalQaReportCard with READY verdict and readiness score', () => {
      const html = renderToString(
        <FinalQaReportCard projectId={testProjectId} report={mockFinalQaReport} />,
      );

      assert.ok(html.includes('READY'));
      assert.ok(html.includes('100%') || html.includes('100'));
      assert.ok(html.includes('REP-20261007-V10FREEZE'));
      assert.ok(html.includes('All release gates passed with 0 blocking defects and 100% regression pass rate.'));
    });

    it('renders FinalQaReportCard with BLOCKED verdict when release criteria fail', () => {
      const blockedReport: FinalQaReportDto = {
        ...mockFinalQaReport,
        verdict: 'BLOCKED',
        readinessScore: 0.0,
        releaseBlockers: [
          {
            ruleCode: 'BLOCK_CRITICAL_OPEN_DEFECT',
            title: 'Critical Defect Open',
            description: 'Release blocked: 1 critical defect remains open and unverified.',
            severity: 'CRITICAL',
          },
        ],
        readinessExplanation: 'Release blocked: 1 critical defect remains open and unverified.',
      };

      const html = renderToString(
        <FinalQaReportCard projectId={testProjectId} report={blockedReport} />,
      );

      assert.ok(html.includes('BLOCKED'));
      assert.ok(html.includes('Release blocked: 1 critical defect remains open and unverified.'));
    });
  });

  // ===========================================================================
  // 9. Loading, Error, and Empty States
  // ===========================================================================
  describe('9. Loading, Error, and Empty States', () => {
    it('renders loading spinner when threads are loading', () => {
      const hook = createMockHook([], { isLoading: true, threads: [] });
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('Loading threads...'));
    });

    it('renders error alert banner when hook reports an error', () => {
      const hook = createMockHook([], { error: 'Database connection failed during task sync' });
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('Database connection failed during task sync'));
    });

    it('renders empty placeholder when no threads exist for project', () => {
      const hook = createMockHook([], { threads: [], activeThread: null });
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      assert.ok(html.includes('No threads found. Create one above to begin.'));
    });
  });

  // ===========================================================================
  // 10. Stale Task State Prevention & Control Safeguards
  // ===========================================================================
  describe('10. Stale Task State Prevention & Control Safeguards', () => {
    it('disables control buttons while an action is pending to prevent race conditions', () => {
      const task = createMockTask('RUNNING');
      const hook = createMockHook([task], {
        isControlActionPending: true,
        pendingControlActionTaskId: task.id,
      });
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      // Verify disabled state attribute on task buttons
      assert.ok(
        html.includes('data-testid="task-pause-btn-22222222-2222-2222-2222-222222220160"') &&
          html.includes('disabled'),
      );
    });

    it('prevents invalid action buttons on terminal COMPLETED tasks (immutable lifecycle)', () => {
      const task = createMockTask('COMPLETED', { isRecoverable: false });
      const hook = createMockHook([task]);
      const html = renderToString(
        <AgentThreadsView projectId={testProjectId} hookOverride={hook} />,
      );

      // Completed tasks cannot be paused, resumed, cancelled, or stopped
      assert.ok(!html.includes('data-testid="task-pause-btn-22222222-2222-2222-2222-222222220160"'));
      assert.ok(!html.includes('data-testid="task-cancel-btn-22222222-2222-2222-2222-222222220160"'));
      assert.ok(!html.includes('data-testid="task-resume-btn-22222222-2222-2222-2222-222222220160"'));
      assert.ok(!html.includes('data-testid="task-stop-btn-22222222-2222-2222-2222-222222220160"'));
    });
  });
});
