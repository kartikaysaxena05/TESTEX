/**
 * @file apps/desktop/src/main/agent-activity-ui.test.tsx
 * UI component tests for V10 Phase 154 Streaming Activity & Tool Progress UI.
 * Verifies ToolProgressCard and AgentActivityStreamView rendering across all states.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ToolProgressCard } from '../renderer/features/agent-activity/ToolProgressCard.js';
import { AgentActivityStreamView } from '../renderer/features/agent-activity/AgentActivityStreamView.js';
import type { UseAgentActivityStreamResult } from '../renderer/features/agent-activity/useAgentActivityStream.js';
import type { AgentActivityTimelineDto } from '@ai-quality/contracts';

describe('V10 Phase 154 Streaming Activity UI Tests', () => {
  const projectId = '11111111-1111-1111-1111-111111111111';
  const taskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';

  // ---------------------------------------------------------------------------
  // 1. ToolProgressCard Tests
  // ---------------------------------------------------------------------------
  describe('ToolProgressCard', () => {
    it('renders RUNNING state with badge, duration, and tool name', () => {
      const html = renderToString(
        <ToolProgressCard
          toolName="test.run_diagnostic"
          status="RUNNING"
          durationMs={1250}
          inputSummary={{ testSuite: 'checkout' }}
        />,
      );

      assert.ok(html.includes('test.run_diagnostic'), 'Displays tool name');
      assert.ok(html.includes('RUNNING'), 'Displays RUNNING status badge');
      assert.ok(html.includes('1250ms'), 'Displays millisecond duration');
    });

    it('renders SUCCESS state with result preview', () => {
      const html = renderToString(
        <ToolProgressCard
          toolName="repository.search_files"
          status="SUCCESS"
          durationMs={45}
          defaultExpanded={true}
          inputSummary={{ pattern: 'cart' }}
          resultSummary={{ count: 3, matches: ['cart.ts', 'cart.test.ts'] }}
        />,
      );

      assert.ok(html.includes('SUCCESS'), 'Displays SUCCESS status badge');
      assert.ok(html.includes('45ms'), 'Displays millisecond duration');
      assert.ok(html.includes('cart.ts'), 'Displays result summary');
    });

    it('renders FAILED state with error message', () => {
      const html = renderToString(
        <ToolProgressCard
          toolName="terminal.execute"
          status="FAILED"
          durationMs={300}
          error="Exit code 1: Command failed"
        />,
      );

      assert.ok(html.includes('FAILED'), 'Displays FAILED status badge');
      assert.ok(html.includes('Exit code 1: Command failed'), 'Displays error message');
    });

    it('renders CANCELLED state badge', () => {
      const html = renderToString(
        <ToolProgressCard toolName="test.long_run" status="CANCELLED" durationMs={500} />,
      );

      assert.ok(html.includes('CANCELLED'), 'Displays CANCELLED status badge');
    });

    it('renders sanitized input preview without unredacted secrets', () => {
      const html = renderToString(
        <ToolProgressCard
          toolName="api.call"
          status="SUCCESS"
          defaultExpanded={true}
          inputSummary={{
            endpoint: '/api/v1/auth',
            token: '[REDACTED]',
          }}
        />,
      );

      assert.ok(html.includes('[REDACTED]'), 'Includes redacted secret token');
      assert.ok(!html.includes('super-secret-token'), 'Never exposes plaintext token');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. AgentActivityStreamView Tests
  // ---------------------------------------------------------------------------
  describe('AgentActivityStreamView', () => {
    const dummyRef = { current: null };

    it('renders loading state when timeline is fetching', () => {
      const mockHook: UseAgentActivityStreamResult = {
        timeline: null,
        isLoading: true,
        isSubscribed: false,
        error: null,
        autoScroll: true,
        isUserScrolledUp: false,
        scrollContainerRef: dummyRef,
        setAutoScroll: () => {},
        resumeAutoScroll: () => {},
        handleScroll: () => {},
        refresh: async () => {},
      };

      const html = renderToString(
        <AgentActivityStreamView projectId={projectId} taskId={taskId} hookOverride={mockHook} />,
      );

      assert.ok(html.includes('Loading activity timeline...'), 'Shows loading indicator');
    });

    it('renders error alert when error occurs', () => {
      const mockHook: UseAgentActivityStreamResult = {
        timeline: null,
        isLoading: false,
        isSubscribed: false,
        error: 'Access denied to project.',
        autoScroll: true,
        isUserScrolledUp: false,
        scrollContainerRef: dummyRef,
        setAutoScroll: () => {},
        resumeAutoScroll: () => {},
        handleScroll: () => {},
        refresh: async () => {},
      };

      const html = renderToString(
        <AgentActivityStreamView projectId={projectId} taskId={taskId} hookOverride={mockHook} />,
      );

      assert.ok(html.includes('Access denied to project.'), 'Displays error message');
    });

    it('renders empty timeline empty state', () => {
      const emptyTimeline: AgentActivityTimelineDto = {
        taskId,
        projectId,
        threadId: 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb',
        taskTitle: 'Fresh Task',
        taskStatus: 'QUEUED',
        activeStepTitle: null,
        activeToolName: null,
        activeToolStatus: null,
        totalSteps: 0,
        completedSteps: 0,
        toolCallsCount: 0,
        durationMs: 0,
        items: [],
      };

      const mockHook: UseAgentActivityStreamResult = {
        timeline: emptyTimeline,
        isLoading: false,
        isSubscribed: true,
        error: null,
        autoScroll: true,
        isUserScrolledUp: false,
        scrollContainerRef: dummyRef,
        setAutoScroll: () => {},
        resumeAutoScroll: () => {},
        handleScroll: () => {},
        refresh: async () => {},
      };

      const html = renderToString(
        <AgentActivityStreamView projectId={projectId} taskId={taskId} hookOverride={mockHook} />,
      );

      assert.ok(html.includes('No activity recorded yet for this task.'), 'Displays empty state');
    });

    it('renders active task header with running status banner', () => {
      const activeTimeline: AgentActivityTimelineDto = {
        taskId,
        projectId,
        threadId: 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb',
        taskTitle: 'Investigate Cart Defect',
        taskStatus: 'RUNNING',
        activeStepTitle: 'Step 2: Run reproduction tests',
        activeToolName: 'test.run',
        activeToolStatus: 'RUNNING',
        totalSteps: 3,
        completedSteps: 1,
        toolCallsCount: 1,
        durationMs: 250,
        items: [
          {
            id: 'item-1',
            taskId,
            sequence: 1,
            kind: 'PLANNING',
            title: 'Generate Execution Plan',
            status: 'COMPLETED',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const mockHook: UseAgentActivityStreamResult = {
        timeline: activeTimeline,
        isLoading: false,
        isSubscribed: true,
        error: null,
        autoScroll: true,
        isUserScrolledUp: false,
        scrollContainerRef: dummyRef,
        setAutoScroll: () => {},
        resumeAutoScroll: () => {},
        handleScroll: () => {},
        refresh: async () => {},
      };

      const html = renderToString(
        <AgentActivityStreamView projectId={projectId} taskId={taskId} hookOverride={mockHook} />,
      );

      assert.ok(html.includes('Investigate Cart Defect'), 'Renders task title');
      assert.ok(html.includes('Step 2: Run reproduction tests'), 'Renders active step title');
      assert.ok(html.includes('test.run'), 'Renders active tool name');
    });

    it('renders all timeline item types (Planning, Tool, Approval, Failure, Cancellation)', () => {
      const fullTimeline: AgentActivityTimelineDto = {
        taskId,
        projectId,
        threadId: 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb',
        taskTitle: 'Comprehensive Task',
        taskStatus: 'FAILED',
        activeStepTitle: null,
        activeToolName: null,
        activeToolStatus: null,
        totalSteps: 5,
        completedSteps: 2,
        toolCallsCount: 1,
        durationMs: 500,
        items: [
          {
            id: 'item-1',
            taskId,
            sequence: 1,
            kind: 'PLANNING',
            title: 'Initial Plan Creation',
            status: 'COMPLETED',
            timestamp: '2026-10-06T10:00:00.000Z',
          },
          {
            id: 'item-2',
            taskId,
            sequence: 2,
            kind: 'TOOL_EXECUTION',
            title: 'Execute test runner',
            toolName: 'test.run',
            status: 'SUCCESS',
            toolStatus: 'SUCCESS',
            durationMs: 250,
            timestamp: '2026-10-06T10:00:05.000Z',
          },
          {
            id: 'item-3',
            taskId,
            sequence: 3,
            kind: 'APPROVAL_WAITING',
            title: 'Wait for user approval',
            toolName: 'terminal.sudo_run',
            status: 'PENDING',
            timestamp: '2026-10-06T10:00:10.000Z',
          },
          {
            id: 'item-4',
            taskId,
            sequence: 4,
            kind: 'FAILURE',
            title: 'Task failed',
            error: 'Database connection failed',
            status: 'FAILED',
            timestamp: '2026-10-06T10:00:15.000Z',
          },
          {
            id: 'item-5',
            taskId,
            sequence: 5,
            kind: 'CANCELLATION',
            title: 'Task cancelled by user',
            status: 'CANCELLED',
            timestamp: '2026-10-06T10:00:20.000Z',
          },
        ],
      };

      const mockHook: UseAgentActivityStreamResult = {
        timeline: fullTimeline,
        isLoading: false,
        isSubscribed: false,
        error: null,
        autoScroll: true,
        isUserScrolledUp: false,
        scrollContainerRef: dummyRef,
        setAutoScroll: () => {},
        resumeAutoScroll: () => {},
        handleScroll: () => {},
        refresh: async () => {},
      };

      const html = renderToString(
        <AgentActivityStreamView projectId={projectId} taskId={taskId} hookOverride={mockHook} />,
      );

      assert.ok(html.includes('Initial Plan Creation'), 'Renders planning item');
      assert.ok(html.includes('test.run'), 'Renders tool execution item');
      assert.ok(html.includes('Wait for user approval'), 'Renders approval item');
      assert.ok(html.includes('Database connection failed'), 'Renders failure item');
      assert.ok(html.includes('Task cancelled by user'), 'Renders cancellation item');
    });

    it('renders resume auto-scroll button when user has scrolled up', () => {
      const activeTimeline: AgentActivityTimelineDto = {
        taskId,
        projectId,
        threadId: 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb',
        taskTitle: 'Long Running Task',
        taskStatus: 'RUNNING',
        activeStepTitle: 'Step 1',
        activeToolName: 'build.run',
        activeToolStatus: 'RUNNING',
        totalSteps: 1,
        completedSteps: 0,
        toolCallsCount: 1,
        durationMs: 100,
        items: [
          {
            id: 'item-1',
            taskId,
            sequence: 1,
            kind: 'TOOL_EXECUTION',
            title: 'Build project',
            toolName: 'build.run',
            status: 'RUNNING',
            toolStatus: 'RUNNING',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const mockHook: UseAgentActivityStreamResult = {
        timeline: activeTimeline,
        isLoading: false,
        isSubscribed: true,
        error: null,
        autoScroll: false,
        isUserScrolledUp: true, // User scrolled up manually!
        scrollContainerRef: dummyRef,
        setAutoScroll: () => {},
        resumeAutoScroll: () => {},
        handleScroll: () => {},
        refresh: async () => {},
      };

      const html = renderToString(
        <AgentActivityStreamView projectId={projectId} taskId={taskId} hookOverride={mockHook} />,
      );

      assert.ok(html.includes('Resume auto-scroll'), 'Shows floating resume auto-scroll button');
    });
  });
});
