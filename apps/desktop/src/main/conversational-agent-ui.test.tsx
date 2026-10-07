/**
 * @file apps/desktop/src/main/conversational-agent-ui.test.tsx
 * UI Unit & Component Certification Test Suite for V8 Phase 124 Conversational AI Testing Agent.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  ConversationalAgentPanel,
  RunControlsPanel,
  EvidenceReviewDrawer,
  type UseConversationalAgentResult,
} from '../renderer/features/conversational-agent/index.js';
import type {
  AgentSessionDto,
  AgentPlanDto,
  AgentActivityDto,
  AgentEvidenceQueryResultDto,
  AgentTaskDto,
} from '@ai-quality/contracts';

describe('V8 Phase 124 — Conversational AI Testing Agent UI Component Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testSessionId = '22222222-2222-2222-2222-222222222222';
  const testRunId = '33333333-3333-3333-3333-333333333333';

  const mockPlan: AgentPlanDto = {
    summary: 'Execution plan for checkout flow',
    intent: 'Test checkout flow on staging',
    requiresApproval: false,
    steps: [
      {
        stepIndex: 1,
        action: 'SEARCH',
        description: 'Search for existing checkout test cases',
        targetTool: 'test_search',
        status: 'COMPLETED',
        isDestructive: false,
        requiresApproval: false,
      },
      {
        stepIndex: 2,
        action: 'EXECUTE',
        description: 'Execute Playwright automated checkout test spec',
        targetTool: 'playwright_execution',
        status: 'COMPLETED',
        isDestructive: false,
        requiresApproval: false,
      },
    ],
  };

  const mockTask: AgentTaskDto = {
    id: 'task-1',
    sessionId: testSessionId,
    projectId: testProjectId,
    userPrompt: 'Test checkout flow on staging',
    status: 'COMPLETED',
    approvalState: 'NOT_REQUIRED',
    plan: mockPlan,
    activeRunId: testRunId,
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockSession: AgentSessionDto = {
    id: testSessionId,
    projectId: testProjectId,
    userId: 'user-1',
    title: 'Checkout Flow Testing',
    status: 'COMPLETED',
    approvalState: 'NOT_REQUIRED',
    activeRunId: testRunId,
    currentTaskId: 'task-1',
    currentTask: mockTask,
    metadata: {},
    messages: [
      {
        id: 'm1',
        sessionId: testSessionId,
        role: 'USER',
        content: 'Test checkout flow on staging',
        createdAt: dummyDateStr,
      },
      {
        id: 'm2',
        sessionId: testSessionId,
        role: 'ASSISTANT',
        content: 'Playwright execution completed. All 2 steps passed.',
        createdAt: dummyDateStr,
      },
    ],
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockEvidence: AgentEvidenceQueryResultDto = {
    runId: testRunId,
    testCaseKey: 'TC-CHK-01',
    requirementKey: 'REQ-CHK-001',
    verdict: 'FAILED',
    evidenceItems: [
      {
        evidenceId: 'e1',
        title: 'Step 2 Screenshot',
        artifactType: 'SCREENSHOT',
        urlOrPath: 'file:///evidence/screenshot-step2.png',
        stepNumber: 2,
      },
      {
        evidenceId: 'e2',
        title: 'Step 2 Console Log',
        artifactType: 'CONSOLE_LOG',
        urlOrPath: 'file:///evidence/console.log',
        stepNumber: 2,
        actualResult: 'TypeError: undefined is not a function',
      },
    ],
    failureAnalysis: {
      rootCause: 'TypeError in cart subtotal calculation',
      failureSignature: 'SIG-TYPEERROR-CART',
      classification: 'PRODUCT_DEFECT',
      suggestedFix: 'Check nullability of cart items before reduce',
    },
    naturalLanguageExplanation: 'Step 2 failed because cart subtotal was null.',
  };

  const defaultMockHook: UseConversationalAgentResult = {
    sessions: [mockSession],
    activeSession: mockSession,
    activeSessionId: testSessionId,
    isLoading: false,
    isSending: false,
    error: null,
    activities: [],
    activePlan: mockPlan,
    activeTask: mockTask,
    runStatus: {
      sessionId: testSessionId,
      runId: testRunId,
      action: 'START',
      success: true,
      runStatus: 'RUNNING',
      message: 'Test run running on chromium engine.',
    },
    evidenceResult: mockEvidence,
    pendingApproval: null,
    createSession: async () => null,
    selectSession: async () => {},
    deleteSession: async () => {},
    sendMessage: async () => {},
    approveAction: async () => null,
    runControl: async () => null,
    queryEvidence: async () => null,
    refresh: async () => {},
  };

  // =========================================================================
  // 1. 3-Pane Layout & Conversational Thread
  // =========================================================================

  it('renders 3-pane Codex layout with conversational thread, task plan, and run controls', () => {
    const html = renderToString(
      <ConversationalAgentPanel projectId={testProjectId} hookOverride={defaultMockHook} />,
    );

    // Verify 3 panes exist in the DOM
    assert(html.includes('data-testid="conversational-thread-pane"'));
    assert(html.includes('data-testid="task-plan-pane"'));
    assert(html.includes('data-testid="run-controls-evidence-pane"'));

    // Verify session selector and action buttons
    assert(html.includes('data-testid="session-selector"'));
    assert(html.includes('+ New Session'));
    assert(html.includes('data-testid="delete-session-btn"'));

    // Verify message bubbles rendered
    assert(html.includes('data-testid="message-user"'));
    assert(html.includes('Test checkout flow on staging'));
    assert(html.includes('data-testid="message-assistant"'));
    assert(html.includes('Playwright execution completed. All 2 steps passed.'));

    // Verify prompt composer
    assert(html.includes('data-testid="agent-prompt-composer"'));
    assert(html.includes('data-testid="agent-prompt-input"'));
    assert(html.includes('data-testid="agent-prompt-send-btn"'));
  });

  it('renders empty conversation state with suggestions when no messages exist', () => {
    const emptySessionHook: UseConversationalAgentResult = {
      ...defaultMockHook,
      activeSession: {
        ...mockSession,
        messages: [],
      },
      activePlan: null,
    };

    const html = renderToString(
      <ConversationalAgentPanel projectId={testProjectId} hookOverride={emptySessionHook} />,
    );

    assert(html.includes('data-testid="empty-conversation-state"'));
    assert(html.includes('Test the user login and authentication flow'));
    assert(html.includes('data-testid="empty-task-plan-state"'));
  });

  // =========================================================================
  // 2. Activity Stream Indicators
  // =========================================================================

  it('renders activity indicators for understanding, test search, Playwright execution, and evidence', () => {
    const activities: AgentActivityDto[] = [
      {
        type: 'THINKING',
        message: 'Parsing natural language testing intent',
        timestamp: dummyDateStr,
      },
      {
        type: 'EXECUTING',
        message: 'Executing Playwright test spec in headless browser',
        timestamp: dummyDateStr,
      },
      {
        type: 'EVALUATING',
        message: 'Capturing DOM snapshot and console logs',
        timestamp: dummyDateStr,
      },
    ];

    const activeHook: UseConversationalAgentResult = {
      ...defaultMockHook,
      isSending: true,
      activities,
    };

    const html = renderToString(
      <ConversationalAgentPanel projectId={testProjectId} hookOverride={activeHook} />,
    );

    assert(html.includes('data-testid="activity-stream-container"'));
    assert(html.includes('Understanding request...'));
    assert(html.includes('Running Playwright...'));
    assert(html.includes('Collecting evidence...'));
  });

  // =========================================================================
  // 3. Inspectable Task Plan & Production Safe Mode
  // =========================================================================

  it('renders inspectable task plan with steps, tools, and parameters', () => {
    const html = renderToString(
      <ConversationalAgentPanel projectId={testProjectId} hookOverride={defaultMockHook} />,
    );

    assert(html.includes('data-testid="task-plan-details"'));
    assert(html.includes('Execution plan for checkout flow'));
    assert(html.includes('Test checkout flow on staging'));
    assert(html.includes('data-testid="task-step-1"'));
    assert(html.includes('test_search'));
    assert(html.includes('data-testid="task-step-2"'));
    assert(html.includes('playwright_execution'));
  });

  it('renders production safe mode / destructive action approval banner with Approve & Reject buttons', () => {
    const pendingApprovalHook: UseConversationalAgentResult = {
      ...defaultMockHook,
      pendingApproval: {
        action: 'playwright_execution',
        description: 'Execute automated regression against live production environment',
        environment: 'PRODUCTION',
      },
    };

    const html = renderToString(
      <ConversationalAgentPanel projectId={testProjectId} hookOverride={pendingApprovalHook} />,
    );

    assert(html.includes('data-testid="production-approval-banner"'));
    assert(html.includes('Approval Required: Production / Destructive Action'));
    assert(html.includes('Target: PRODUCTION'));
    assert(html.includes('data-testid="approval-approve-btn"'));
    assert(html.includes('data-testid="approval-reject-btn"'));
  });

  // =========================================================================
  // 4. RunControlsPanel Component
  // =========================================================================

  it('renders RunControlsPanel with step progression, status, and control buttons', () => {
    const html = renderToString(
      <RunControlsPanel
        activeRunId={testRunId}
        runStatus={{
          sessionId: testSessionId,
          runId: testRunId,
          action: 'START',
          success: true,
          runStatus: 'RUNNING',
          message: 'Executing Step 2 in Chromium',
        }}
        activeTask={mockTask}
        currentStep={2}
        totalSteps={2}
        currentStepDescription="Executing Playwright automated checkout test spec"
        browserEngine="Chromium (Headless)"
        environment="STAGING"
        requirementKey="REQ-CHK-001"
        testCaseKey="TC-CHK-01"
        onRunControl={async () => {}}
      />,
    );

    assert(html.includes('data-testid="run-controls-panel"'));
    assert(html.includes('data-testid="step-progression-tracker"'));
    assert(html.includes('Step 2 of 2'));
    assert(html.includes('100%'));
    assert(html.includes('Chromium (Headless)'));
    assert(html.includes('STAGING'));
    assert(html.includes('REQ-CHK-001'));
    assert(html.includes('TC-CHK-01'));
    assert(html.includes('data-testid="run-control-pause-btn"'));
    assert(html.includes('data-testid="run-control-cancel-btn"'));
    assert(html.includes('data-testid="run-control-stop-btn"'));
  });

  it('renders start/retry buttons when run is idle or completed', () => {
    const html = renderToString(
      <RunControlsPanel
        activeRunId={null}
        runStatus={{
          sessionId: testSessionId,
          action: 'STOP',
          success: true,
          runStatus: 'COMPLETED',
          message: 'Run finished.',
        }}
        onRunControl={async () => {}}
      />,
    );

    assert(html.includes('data-testid="run-control-retry-btn"'));
  });

  // =========================================================================
  // 5. EvidenceReviewDrawer Component
  // =========================================================================

  it('renders EvidenceReviewDrawer with grounded query bar, tabs, and failure classification', () => {
    const html = renderToString(
      <EvidenceReviewDrawer
        evidenceResult={mockEvidence}
        isQuerying={false}
        onQueryEvidence={async () => {}}
      />,
    );

    assert(html.includes('data-testid="evidence-review-drawer"'));
    assert(html.includes('data-testid="evidence-query-form"'));
    assert(html.includes('data-testid="evidence-query-input"'));
    assert(html.includes('data-testid="evidence-query-submit-btn"'));
    assert(html.includes('data-testid="evidence-nl-explanation"'));
    assert(html.includes('Step 2 failed because cart subtotal was null.'));

    // Verify tabs
    assert(html.includes('data-testid="evidence-tab-overview"'));
    assert(html.includes('data-testid="evidence-tab-screenshots"'));
    assert(html.includes('data-testid="evidence-tab-logs"'));
    assert(html.includes('data-testid="evidence-tab-network"'));
    assert(html.includes('data-testid="evidence-tab-dom"'));
    assert(html.includes('data-testid="evidence-tab-provenance"'));

    // Verify failure classification
    assert(html.includes('PRODUCT_DEFECT'));
    assert(html.includes('SIG-TYPEERROR-CART'));
    assert(html.includes('TypeError in cart subtotal calculation'));
    assert(html.includes('Check nullability of cart items before reduce'));
  });
});
