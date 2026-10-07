/**
 * @file apps/desktop/src/renderer/features/planner/MultiStepPlanPanel.tsx
 * Codex-style Multi-Step Planning UI panel for V10 Phase 152.
 *
 * Displays:
 * - Plan status, intent, and summary
 * - Active plan version indicator
 * - Ordered execution steps with sequence, title, objective, toolAction
 * - Step dependencies graph chips
 * - Step statuses (PENDING, READY, RUNNING, COMPLETED, FAILED, SKIPPED, CANCELLED)
 * - Controlled step modifications: add step, remove step, reorder, and step status updates
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  AgentPlanExecutionDto,
  AgentPlanStepExecutionDto,
  AgentPlanStepExecutionStatus,
  PlannedStepDefinitionDto,
} from '@ai-quality/contracts';

export interface MultiStepPlanPanelProps {
  readonly projectId: string;
  readonly threadId?: string;
  readonly taskId: string;
  readonly onPlanUpdated?: (plan: AgentPlanExecutionDto) => void;
}

export const MultiStepPlanPanel: React.FC<MultiStepPlanPanelProps> = ({
  projectId,
  threadId,
  taskId,
  onPlanUpdated,
}) => {
  const [activePlan, setActivePlan] = useState<AgentPlanExecutionDto | null>(null);
  const [plans, setPlans] = useState<readonly AgentPlanExecutionDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New step form state
  const [showAddStepForm, setShowAddStepForm] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newObjective, setNewObjective] = useState<string>('');
  const [newToolAction, setNewToolAction] = useState<string>('repository.search_files');
  const [newDependencies, setNewDependencies] = useState<string>('');

  const loadPlanData = useCallback(async () => {
    const bridge = window.desktop?.planner;
    if (!bridge) {
      setError('Planner desktop bridge unavailable.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const activeRes = await bridge.getActivePlan({ projectId, taskId });
      if (activeRes.ok) {
        setActivePlan(activeRes.data);
      }

      const listRes = await bridge.listPlans({ projectId, taskId });
      if (listRes.ok) {
        setPlans(listRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, taskId]);

  useEffect(() => {
    loadPlanData();
  }, [loadPlanData]);

  const handleGeneratePlan = async () => {
    const bridge = window.desktop?.planner;
    if (!bridge || !threadId) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await bridge.createPlan({
        projectId,
        threadId,
        taskId,
      });

      if (res.ok) {
        setActivePlan(res.data);
        setSuccessMessage(`Plan v${res.data.version} created successfully.`);
        if (onPlanUpdated) onPlanUpdated(res.data);
        await loadPlanData();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generating plan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlan || !window.desktop?.planner) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const depsArray = newDependencies
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const stepPayload: PlannedStepDefinitionDto = {
        title: newTitle.trim(),
        objective: newObjective.trim(),
        toolAction: newToolAction.trim(),
        dependencies: depsArray,
      };

      const res = await window.desktop.planner.addStep({
        projectId,
        planId: activePlan.id,
        step: stepPayload,
      });

      if (res.ok) {
        setActivePlan(res.data);
        setShowAddStepForm(false);
        setNewTitle('');
        setNewObjective('');
        setNewDependencies('');
        setSuccessMessage('Step added successfully.');
        if (onPlanUpdated) onPlanUpdated(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add step.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveStep = async (stepId: string) => {
    if (!activePlan || !window.desktop?.planner) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await window.desktop.planner.removeStep({
        projectId,
        planId: activePlan.id,
        stepId,
      });

      if (res.ok) {
        setActivePlan(res.data);
        setSuccessMessage('Step removed.');
        if (onPlanUpdated) onPlanUpdated(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove step.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetStepStatus = async (stepId: string, status: AgentPlanStepExecutionStatus) => {
    if (!activePlan || !window.desktop?.planner) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await window.desktop.planner.setStepStatus({
        projectId,
        planId: activePlan.id,
        stepId,
        status,
      });

      if (res.ok) {
        setActivePlan(res.data);
        setSuccessMessage(`Step status updated to ${status}.`);
        if (onPlanUpdated) onPlanUpdated(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update step status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return '#10b981';
      case 'RUNNING':
      case 'EXECUTING':
        return '#3b82f6';
      case 'FAILED':
        return '#ef4444';
      case 'READY':
        return '#8b5cf6';
      case 'SKIPPED':
      case 'CANCELLED':
        return '#6b7280';
      default:
        return '#f59e0b';
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
        Loading execution plan...
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'Inter, -apple-system, sans-serif',
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Multi-Step Plan</h2>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            Task ID: <code style={{ color: '#38bdf8' }}>{taskId}</code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {activePlan && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '9999px',
                backgroundColor: `${getStatusBadgeColor(activePlan.status)}20`,
                color: getStatusBadgeColor(activePlan.status),
                border: `1px solid ${getStatusBadgeColor(activePlan.status)}40`,
              }}
            >
              {activePlan.status} (v{activePlan.version})
            </span>
          )}

          <button
            onClick={handleGeneratePlan}
            disabled={isSubmitting || !threadId}
            style={{
              padding: '6px 14px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              fontSize: '13px',
            }}
          >
            {activePlan ? 'Re-plan (New Version)' : 'Generate Plan'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#ef444420',
            color: '#fca5a5',
            border: '1px solid #ef444440',
            borderRadius: '6px',
            marginBottom: '12px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#10b98120',
            color: '#6ee7b7',
            border: '1px solid #10b98140',
            borderRadius: '6px',
            marginBottom: '12px',
            fontSize: '13px',
          }}
        >
          {successMessage}
        </div>
      )}

      {!activePlan ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#94a3b8',
            backgroundColor: '#1e293b30',
            borderRadius: '8px',
            border: '1px dashed #334155',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px' }}>
            No Plan Created Yet
          </div>
          <div style={{ fontSize: '13px', marginBottom: '16px' }}>
            Click "Generate Plan" to transform this task into a structured execution plan before
            tool execution.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            flex: 1,
            overflowY: 'auto',
          }}
        >
          {/* Plan Summary Card */}
          <div
            style={{
              padding: '14px 18px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              border: '1px solid #334155',
            }}
          >
            <div
              style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', marginBottom: '4px' }}
            >
              {activePlan.summary}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Intent: <span style={{ color: '#e2e8f0' }}>{activePlan.intent}</span> | Steps:{' '}
              <span style={{ color: '#e2e8f0' }}>
                {activePlan.completedSteps} / {activePlan.totalSteps} Completed
              </span>{' '}
              | Requires Approval:{' '}
              <span style={{ color: activePlan.requiresApproval ? '#f59e0b' : '#94a3b8' }}>
                {activePlan.requiresApproval ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {/* Steps Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#cbd5e1' }}>
              Execution Steps ({activePlan.steps.length})
            </h3>
            <button
              onClick={() => setShowAddStepForm(!showAddStepForm)}
              style={{
                padding: '4px 10px',
                backgroundColor: '#334155',
                color: '#e2e8f0',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {showAddStepForm ? 'Cancel Add' : '+ Add Step'}
            </button>
          </div>

          {/* Add Step Form */}
          {showAddStepForm && (
            <form
              onSubmit={handleAddStepSubmit}
              style={{
                padding: '14px',
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                border: '1px solid #475569',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                Add Plan Step
              </div>
              <input
                type="text"
                placeholder="Step title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                required
                style={{
                  padding: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontSize: '13px',
                }}
              />
              <textarea
                placeholder="Objective"
                value={newObjective}
                onChange={e => setNewObjective(e.target.value)}
                required
                rows={2}
                style={{
                  padding: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontSize: '13px',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Tool action (e.g. repository.search_files)"
                  value={newToolAction}
                  onChange={e => setNewToolAction(e.target.value)}
                  required
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    color: '#ffffff',
                    fontSize: '13px',
                  }}
                />
                <input
                  type="text"
                  placeholder="Dependencies (comma separated IDs)"
                  value={newDependencies}
                  onChange={e => setNewDependencies(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    color: '#ffffff',
                    fontSize: '13px',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  alignSelf: 'flex-start',
                  padding: '6px 14px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                Save Step
              </button>
            </form>
          )}

          {/* Steps List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activePlan.steps.map((step: AgentPlanStepExecutionDto) => (
              <div
                key={step.id}
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: '#334155',
                        color: '#94a3b8',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      #{step.sequence}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                      {step.title}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: `${getStatusBadgeColor(step.status)}20`,
                        color: getStatusBadgeColor(step.status),
                        border: `1px solid ${getStatusBadgeColor(step.status)}40`,
                      }}
                    >
                      {step.status}
                    </span>

                    {/* Step Action Buttons */}
                    <button
                      onClick={() => handleSetStepStatus(step.id, 'COMPLETED')}
                      disabled={isSubmitting || step.status === 'COMPLETED'}
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        backgroundColor: '#10b98120',
                        color: '#34d399',
                        border: '1px solid #10b98140',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Mark Complete
                    </button>

                    <button
                      onClick={() => handleRemoveStep(step.id)}
                      disabled={isSubmitting || activePlan.steps.length <= 1}
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        backgroundColor: '#ef444420',
                        color: '#f87171',
                        border: '1px solid #ef444440',
                        borderRadius: '4px',
                        cursor: activePlan.steps.length <= 1 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: '13px', color: '#cbd5e1' }}>{step.objective}</div>

                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#94a3b8' }}>
                  <div>
                    Action: <code style={{ color: '#38bdf8' }}>{step.toolAction}</code>
                  </div>
                  {step.dependencies.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span>Depends on:</span>
                      {step.dependencies.map(dep => (
                        <span
                          key={dep}
                          style={{
                            fontSize: '10px',
                            backgroundColor: '#334155',
                            color: '#cbd5e1',
                            padding: '1px 6px',
                            borderRadius: '3px',
                          }}
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Historical Plan Versions */}
          {plans.length > 1 && (
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 8px 0' }}>
                Previous Plan Versions ({plans.length})
              </h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {plans.map(p => (
                  <span
                    key={p.id}
                    style={{
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: p.isActive ? '#1e293b' : '#0f172a',
                      color: p.isActive ? '#38bdf8' : '#64748b',
                      border: p.isActive ? '1px solid #38bdf8' : '1px solid #1e293b',
                    }}
                  >
                    v{p.version} ({p.status})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
