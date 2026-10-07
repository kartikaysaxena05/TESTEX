/**
 * @file apps/desktop/src/renderer/features/conversational-agent/ConversationalAgentPanel.tsx
 * 3-Pane Codex-style layout for V8 Phase 124: Conversational AI Testing Agent, Run Controls & Evidence Review.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  useConversationalAgent,
  type UseConversationalAgentResult,
} from './useConversationalAgent.js';
import { RunControlsPanel } from './RunControlsPanel.js';
import { EvidenceReviewDrawer } from './EvidenceReviewDrawer.js';
import { Button, Badge, Spinner, Alert } from '../../ui/index.js';

export interface ConversationalAgentPanelProps {
  readonly projectId: string | null;
  readonly hookOverride?: UseConversationalAgentResult;
}

export function ConversationalAgentPanel({
  projectId,
  hookOverride,
}: ConversationalAgentPanelProps): React.JSX.Element {
  const agentHook = useConversationalAgent(projectId);
  const {
    sessions,
    activeSession,
    activeSessionId,
    isLoading,
    isSending,
    error,
    activities,
    activePlan,
    activeTask,
    runStatus,
    evidenceResult,
    pendingApproval,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
    approveAction,
    runControl,
    queryEvidence,
  } = hookOverride ?? agentHook;

  const [promptInput, setPromptInput] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, activities]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptInput.trim();
    if (!trimmed || isSending) return;
    setPromptInput('');
    await sendMessage(trimmed);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setPromptInput(suggestion);
  };

  const promptSuggestions = [
    'Test the user login and authentication flow',
    'Run Playwright tests against staging checkout page',
    'Investigate failure in REQ-AUTH-001',
    'Show me console logs and screenshot of failed step 2',
  ];

  return (
    <div
      className="conversational-agent-panel h-full flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden"
      data-testid="conversational-agent-panel"
    >
      {/* GLOBAL ERROR BANNER */}
      {error && (
        <div className="p-2 border-b border-rose-900 bg-rose-950/60" data-testid="agent-error-banner">
          <Alert variant="danger" title="Agent Error">
            {error}
          </Alert>
        </div>
      )}

      {/* THREE-PANE LAYOUT */}
      <div className="flex-1 grid grid-cols-12 divide-x divide-neutral-800 overflow-hidden min-h-0">
        {/* PANE 1: CONVERSATIONAL THREAD (5 COLS) */}
        <div className="col-span-5 flex flex-col h-full overflow-hidden bg-neutral-900/60" data-testid="conversational-thread-pane">
          {/* SESSION BAR */}
          <div className="p-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-900">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Session:</span>
              {sessions.length > 0 ? (
                <select
                  value={activeSessionId ?? ''}
                  onChange={(e) => void selectSession(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-hidden max-w-[180px] truncate"
                  data-testid="session-selector"
                  aria-label="Active session selector"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.status})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-neutral-500 italic">No sessions</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void createSession()}
                disabled={isLoading || isSending}
                data-testid="new-session-btn"
                aria-label="Create new testing session"
              >
                + New Session
              </Button>
              {activeSessionId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteSession(activeSessionId)}
                  disabled={isLoading || isSending}
                  data-testid="delete-session-btn"
                  title="Delete current session"
                  aria-label="Delete current session"
                >
                  ✕
                </Button>
              )}
            </div>
          </div>

          {/* MESSAGE HISTORY */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs" role="log" aria-label="Conversation History" data-testid="message-timeline">
            {(!activeSession?.messages || activeSession.messages.length === 0) && (
              <div className="text-center py-12 text-neutral-500 space-y-2" data-testid="empty-conversation-state">
                <p className="font-medium text-neutral-400">Conversational AI Testing Agent</p>
                <p className="text-[11px] max-w-sm mx-auto">
                  Type a testing request in plain English. The agent translates requests into structured Playwright execution plans, runs tests, and diagnoses failures.
                </p>
                <div className="pt-4 flex flex-col gap-1.5 max-w-xs mx-auto">
                  {promptSuggestions.map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSuggestionClick(sug)}
                      className="text-left px-2.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700/80 text-neutral-300 text-[11px] transition-colors border border-neutral-700/50 truncate"
                    >
                      💡 {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeSession?.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'USER' ? 'items-end' : 'items-start'
                }`}
                data-testid={`message-${msg.role.toLowerCase()}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-neutral-500 font-semibold uppercase">
                    {msg.role === 'USER' ? 'You' : msg.role === 'ASSISTANT' ? 'AI Testing Agent' : 'System Tool'}
                  </span>
                  <span className="text-[10px] text-neutral-600">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div
                  className={`p-3 rounded-lg max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'USER'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-neutral-800 text-neutral-200 border border-neutral-700/60 rounded-tl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* REAL-TIME ACTIVITY STREAM INDICATORS */}
            {activities.length > 0 && isSending && (
              <div className="space-y-1.5 bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-800" data-testid="activity-stream-container">
                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block">
                  Agent Pipeline Activity
                </span>
                {activities.map((act, index) => (
                  <div key={index} className="flex items-center gap-2 text-[11px] text-neutral-300" data-testid="activity-item">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                    <span className="font-semibold text-blue-400">
                      {act.type === 'THINKING'
                        ? 'Understanding request...'
                        : act.type === 'PLANNING'
                          ? 'Generating task plan...'
                          : act.type === 'TOOL_CALLING'
                            ? 'Calling quality tools...'
                            : act.type === 'EXECUTING'
                              ? 'Running Playwright...'
                              : act.type === 'EVALUATING'
                                ? 'Collecting evidence...'
                                : act.type}
                    </span>
                    <span className="text-neutral-400 truncate">{act.message}</span>
                  </div>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* INPUT PROMPT COMPOSER */}
          <form onSubmit={handleSend} className="p-3 border-t border-neutral-800 bg-neutral-900 space-y-2" data-testid="agent-prompt-composer">
            <div className="flex gap-2">
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Ask agent to test, inspect evidence, or run Playwright..."
                className="flex-1 bg-neutral-950 border border-neutral-700/80 rounded-md px-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-blue-500"
                disabled={isSending || isLoading}
                data-testid="agent-prompt-input"
                aria-label="Testing instruction prompt"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!promptInput.trim() || isSending || isLoading}
                data-testid="agent-prompt-send-btn"
                aria-label="Send testing prompt"
              >
                {isSending ? <Spinner size="sm" /> : 'Send'}
              </Button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-neutral-500">
              <span>Safety: Production Safe Mode enabled. Whitelisted tool calling only.</span>
              <span>Enter to send</span>
            </div>
          </form>
        </div>

        {/* PANE 2: INSPECTABLE TASK PLAN & APPROVAL BANNER (4 COLS) */}
        <div className="col-span-4 flex flex-col h-full overflow-hidden bg-neutral-900/40" data-testid="task-plan-pane">
          {/* PANE HEADER */}
          <div className="p-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-900">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Inspectable Task Plan
            </span>
            {activePlan?.requiresApproval && (
              <Badge variant="warning">
                Approval Required
              </Badge>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* DESTRUCTIVE ACTION & PRODUCTION SAFE MODE BANNER */}
            {pendingApproval && (
              <div
                className="bg-amber-950/80 border-2 border-amber-600 rounded-lg p-3 space-y-2 text-amber-100 animate-pulse"
                data-testid="production-approval-banner"
              >
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <span className="text-base">⚠️</span>
                  <span>Approval Required: Production / Destructive Action</span>
                </div>
                <p className="text-[11px] text-amber-200">
                  {`${pendingApproval.description} (Target: ${pendingApproval.environment ?? 'PRODUCTION'})`}
                </p>
                <div className="text-[10px] font-mono bg-black/40 p-2 rounded text-neutral-300">
                  {`Action: ${pendingApproval.action}`}
                </div>

                {showRejectInput ? (
                  <div className="space-y-2 pt-2">
                    <input
                      type="text"
                      placeholder="Reason for rejection..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200"
                      data-testid="approval-reject-reason-input"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void approveAction(false, rejectReason || 'Rejected by user')}
                        data-testid="approval-confirm-reject-btn"
                      >
                        Confirm Rejection
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowRejectInput(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void approveAction(true)}
                      data-testid="approval-approve-btn"
                    >
                      ✓ Approve Execution
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setShowRejectInput(true)}
                      data-testid="approval-reject-btn"
                    >
                      ✕ Reject
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* TASK PLAN OVERVIEW */}
            {activePlan ? (
              <div className="space-y-3" data-testid="task-plan-details">
                <div className="bg-neutral-950/60 border border-neutral-800 rounded p-3 space-y-1.5">
                  <span className="text-[10px] text-neutral-500 uppercase font-bold block">Summary & Intent</span>
                  <div className="font-medium text-neutral-200">{activePlan.summary}</div>
                  <div className="text-[11px] text-neutral-400">{activePlan.intent}</div>
                  {activePlan.approvalReason && (
                    <div className="text-[10px] text-amber-400 bg-amber-950/40 p-1.5 rounded border border-amber-900/60">
                      {activePlan.approvalReason}
                    </div>
                  )}
                </div>

                {/* STEPS LIST */}
                <div className="space-y-2">
                  <span className="text-[10px] text-neutral-500 uppercase font-bold block">
                    Execution Steps ({activePlan.steps.length})
                  </span>
                  {activePlan.steps.map((step) => (
                    <div
                      key={step.stepIndex}
                      className="p-2.5 bg-neutral-950 border border-neutral-800/80 rounded-md space-y-1"
                      data-testid={`task-step-${step.stepIndex}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-neutral-300">
                          Step {step.stepIndex}: {step.action}
                        </span>
                        <Badge
                          variant={
                            step.status === 'COMPLETED'
                              ? 'success'
                              : step.status === 'FAILED'
                                ? 'danger'
                                : step.status === 'RUNNING'
                                  ? 'warning'
                                  : 'neutral'
                          }
                        >
                          {step.status}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {step.description}
                      </div>
                      {step.targetTool && (
                        <div className="text-[11px] text-neutral-400 truncate">
                          Tool: <span className="font-mono text-blue-400">{step.targetTool}</span>
                        </div>
                      )}
                      {step.requiresApproval && (
                        <div className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold">
                          <span>🛡️ Approval Required</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-neutral-500 text-xs" data-testid="empty-task-plan-state">
                No active task plan. Send a testing instruction to generate a step-by-step execution plan.
              </div>
            )}
          </div>
        </div>

        {/* PANE 3: RUN CONTROLS & EVIDENCE REVIEW DRAWER (3 COLS) */}
        <div className="col-span-3 flex flex-col h-full overflow-hidden bg-neutral-900/60 p-2 space-y-2" data-testid="run-controls-evidence-pane">
          {/* RUN CONTROLS PANEL */}
          <RunControlsPanel
            activeRunId={activeSession?.activeRunId}
            runStatus={runStatus}
            activeTask={activeTask}
            currentStep={activePlan?.steps.findIndex((s) => s.status === 'RUNNING' || s.status === 'PENDING') !== -1 ? (activePlan?.steps.findIndex((s) => s.status === 'RUNNING' || s.status === 'PENDING') ?? 0) + 1 : activePlan?.steps.length ?? 1}
            totalSteps={activePlan?.steps.length ?? 1}
            currentStepDescription={activePlan?.steps.find((s) => s.status === 'RUNNING')?.description ?? activePlan?.summary}
            browserEngine="Chromium (Headless)"
            environment="STAGING"
            requirementKey={evidenceResult?.requirementKey}
            testCaseKey={evidenceResult?.testCaseKey}
            onRunControl={async (action, reason) => {
              await runControl(action, activeSession?.activeRunId ?? undefined, reason);
            }}
          />

          {/* EVIDENCE REVIEW DRAWER */}
          <div className="flex-1 overflow-hidden min-h-0">
            <EvidenceReviewDrawer
              evidenceResult={evidenceResult}
              onQueryEvidence={async (query) => {
                await queryEvidence(query, activeSession?.activeRunId ?? undefined);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
