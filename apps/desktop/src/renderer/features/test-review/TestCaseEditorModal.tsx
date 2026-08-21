/**
 * @file apps/desktop/src/renderer/features/test-review/TestCaseEditorModal.tsx
 * Structured human test case editor creating immutable versions (Phase 56).
 */

import React, { useState } from 'react';
import type {
  EditTestCaseInputDto,
  TestCaseExecutionSuitability,
  TestCasePriority,
  TestCaseType,
  TestCaseVersionDto,
} from '@ai-quality/contracts';

interface TestCaseEditorModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly testCaseId: string;
  readonly initialVersion: TestCaseVersionDto;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onSave: (input: EditTestCaseInputDto) => Promise<void>;
}

export const TestCaseEditorModal: React.FC<TestCaseEditorModalProps> = ({
  isOpen,
  projectId,
  testCaseId,
  initialVersion,
  isSubmitting,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState(initialVersion.title);
  const [objective, setObjective] = useState(initialVersion.objective);
  const [description, setDescription] = useState(initialVersion.description ?? '');
  const [type, setType] = useState<TestCaseType>(initialVersion.type);
  const [priority, setPriority] = useState<TestCasePriority>(initialVersion.priority);
  const [executionSuitability, setExecutionSuitability] = useState<TestCaseExecutionSuitability>(
    initialVersion.executionSuitability,
  );
  const [overallExpectedResult, setOverallExpectedResult] = useState(
    initialVersion.overallExpectedResult ?? '',
  );
  const [changeReason, setChangeReason] = useState('');

  // Editable lists
  const [preconditions, setPreconditions] = useState(
    initialVersion.preconditions.map(p => ({
      sequenceOrder: p.sequenceOrder,
      category: p.category,
      description: p.description,
      isEnforced: p.isEnforced,
    })),
  );

  const [steps, setSteps] = useState(
    initialVersion.steps.map(s => ({
      stepNumber: s.stepNumber,
      action: s.action,
      expectedResult: s.expectedResult ?? '',
      testDataSummary: s.testDataSummary ?? '',
      stateChangeFrom: s.stateChangeFrom ?? '',
      stateChangeTo: s.stateChangeTo ?? '',
      isOptional: s.isOptional,
    })),
  );

  const [testData, setTestData] = useState(
    initialVersion.testData.map(d => ({
      sequenceOrder: d.sequenceOrder,
      name: d.name,
      dataType: d.dataType,
      origin: d.origin,
      valueJson: d.valueJson ?? d.value,
      constraint: d.constraint ?? '',
      isSensitive: d.isSensitive,
    })),
  );

  const [activeTab, setActiveTab] = useState<'general' | 'steps' | 'preconditions' | 'data'>(
    'general',
  );

  if (!isOpen) return null;

  const handleAddPrecondition = () => {
    setPreconditions(prev => [
      ...prev,
      {
        sequenceOrder: prev.length + 1,
        category: 'OTHER',
        description: '',
        isEnforced: true,
      },
    ]);
  };

  const handleRemovePrecondition = (index: number) => {
    setPreconditions(prev =>
      prev.filter((_, i) => i !== index).map((p, idx) => ({ ...p, sequenceOrder: idx + 1 })),
    );
  };

  const handleAddStep = () => {
    setSteps(prev => [
      ...prev,
      {
        stepNumber: prev.length + 1,
        action: '',
        expectedResult: '',
        testDataSummary: '',
        stateChangeFrom: '',
        stateChangeTo: '',
        isOptional: false,
      },
    ]);
  };

  const handleRemoveStep = (index: number) => {
    setSteps(prev =>
      prev.filter((_, i) => i !== index).map((s, idx) => ({ ...s, stepNumber: idx + 1 })),
    );
  };

  const handleAddTestData = () => {
    setTestData(prev => [
      ...prev,
      {
        sequenceOrder: prev.length + 1,
        name: `param_${prev.length + 1}`,
        dataType: 'STRING',
        origin: 'HUMAN_INPUT',
        valueJson: '',
        constraint: '',
        isSensitive: false,
      },
    ]);
  };

  const handleRemoveTestData = (index: number) => {
    setTestData(prev =>
      prev.filter((_, i) => i !== index).map((d, idx) => ({ ...d, sequenceOrder: idx + 1 })),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      projectId,
      testCaseId,
      expectedVersionNumber: initialVersion.versionNumber,
      title: title.trim(),
      objective: objective.trim(),
      description: description.trim() || undefined,
      type,
      priority,
      executionSuitability,
      overallExpectedResult: overallExpectedResult.trim() || undefined,
      changeReason: changeReason.trim() || 'Human edit',
      preconditions: preconditions.map(p => ({
        sequenceOrder: p.sequenceOrder,
        category: p.category,
        description: p.description.trim(),
        isEnforced: p.isEnforced,
      })),
      steps: steps.map(s => ({
        stepNumber: s.stepNumber,
        action: s.action.trim(),
        expectedResult: s.expectedResult?.trim() || undefined,
        testDataSummary: s.testDataSummary?.trim() || undefined,
        stateChangeFrom: s.stateChangeFrom?.trim() || undefined,
        stateChangeTo: s.stateChangeTo?.trim() || undefined,
        isOptional: s.isOptional,
      })),
      testData: testData.map(d => ({
        sequenceOrder: d.sequenceOrder,
        name: d.name.trim(),
        dataType: d.dataType,
        origin: d.origin,
        valueJson: d.valueJson,
        constraint: d.constraint?.trim() || undefined,
        isSensitive: d.isSensitive,
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-100">Edit Test Case</h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/20 text-blue-300 font-semibold">
                Creating v{initialVersion.versionNumber + 1}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Editing will create an immutable new version and attribute changes to{' '}
              <span className="font-semibold text-slate-200">HUMAN_EDIT</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 border-b border-slate-800 flex gap-4 text-xs font-medium bg-slate-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-3 border-b-2 transition ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            General Spec
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('steps')}
            className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'steps'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Test Steps
            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-300">
              {steps.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preconditions')}
            className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'preconditions'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Preconditions
            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-300">
              {preconditions.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'data'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Test Data
            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-300">
              {testData.length}
            </span>
          </button>
        </div>

        {/* Content Area */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Objective <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={objective}
                  onChange={e => setObjective(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Additional context or notes..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Type</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as TestCaseType)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="POSITIVE">Positive</option>
                    <option value="NEGATIVE">Negative</option>
                    <option value="BOUNDARY">Boundary</option>
                    <option value="VALIDATION">Validation</option>
                    <option value="SECURITY">Security</option>
                    <option value="PERFORMANCE">Performance</option>
                    <option value="ACCESSIBILITY">Accessibility</option>
                    <option value="COMPATIBILITY">Compatibility</option>
                    <option value="BUSINESS_RULE">Business Rule</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as TestCasePriority)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Suitability
                  </label>
                  <select
                    value={executionSuitability}
                    onChange={e =>
                      setExecutionSuitability(e.target.value as TestCaseExecutionSuitability)
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="AUTOMATED">Automated</option>
                    <option value="MANUAL_ONLY">Manual Only</option>
                    <option value="SEMI_AUTOMATED">Semi Automated</option>
                    <option value="UNKNOWN">Unknown</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Overall Expected Result
                </label>
                <textarea
                  rows={2}
                  value={overallExpectedResult}
                  onChange={e => setOverallExpectedResult(e.target.value)}
                  placeholder="Final state assertion when test finishes successfully..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Change Reason / Version Notes <span className="text-blue-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={changeReason}
                  onChange={e => setChangeReason(e.target.value)}
                  placeholder="E.g., Added session token verification step per security policy"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {activeTab === 'steps' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-400">
                  Sequential actions and expected results executed in this test case.
                </p>
                <button
                  type="button"
                  onClick={handleAddStep}
                  className="px-2.5 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-semibold flex items-center gap-1 transition"
                >
                  + Add Step
                </button>
              </div>

              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2 relative group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 font-mono">
                      Step {step.stepNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveStep(idx)}
                      className="text-xs text-rose-400 hover:text-rose-300 transition"
                    >
                      Delete
                    </button>
                  </div>

                  <div>
                    <input
                      type="text"
                      required
                      placeholder="Step Action (e.g. Enter credentials and click Submit)"
                      value={step.action}
                      onChange={e => {
                        const val = e.target.value;
                        setSteps(prev =>
                          prev.map((s, i) => (i === idx ? { ...s, action: val } : s)),
                        );
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <input
                      type="text"
                      placeholder="Expected Result (e.g. User is redirected to dashboard)"
                      value={step.expectedResult}
                      onChange={e => {
                        const val = e.target.value;
                        setSteps(prev =>
                          prev.map((s, i) => (i === idx ? { ...s, expectedResult: val } : s)),
                        );
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'preconditions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-400">
                  Pre-requisites and setup requirements before test execution begins.
                </p>
                <button
                  type="button"
                  onClick={handleAddPrecondition}
                  className="px-2.5 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-semibold flex items-center gap-1 transition"
                >
                  + Add Precondition
                </button>
              </div>

              {preconditions.map((p, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 font-mono">
                      #{p.sequenceOrder}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePrecondition(idx)}
                      className="text-xs text-rose-400 hover:text-rose-300 transition"
                    >
                      Delete
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Description of prerequisite state..."
                    value={p.description}
                    onChange={e => {
                      const val = e.target.value;
                      setPreconditions(prev =>
                        prev.map((item, i) => (i === idx ? { ...item, description: val } : item)),
                      );
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-400">
                  Parameter sets and realistic values bound to this test.
                </p>
                <button
                  type="button"
                  onClick={handleAddTestData}
                  className="px-2.5 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-semibold flex items-center gap-1 transition"
                >
                  + Add Test Data
                </button>
              </div>

              {testData.map((d, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg grid grid-cols-3 gap-2"
                >
                  <div>
                    <input
                      type="text"
                      placeholder="Parameter Name"
                      value={d.name}
                      onChange={e => {
                        const val = e.target.value;
                        setTestData(prev =>
                          prev.map((item, i) => (i === idx ? { ...item, name: val } : item)),
                        );
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Value"
                      value={
                        typeof d.valueJson === 'string'
                          ? d.valueJson
                          : JSON.stringify(d.valueJson ?? '')
                      }
                      onChange={e => {
                        const val = e.target.value;
                        setTestData(prev =>
                          prev.map((item, i) => (i === idx ? { ...item, valueJson: val } : item)),
                        );
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      placeholder="Constraint / notes"
                      value={d.constraint}
                      onChange={e => {
                        const val = e.target.value;
                        setTestData(prev =>
                          prev.map((item, i) => (i === idx ? { ...item, constraint: val } : item)),
                        );
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTestData(idx)}
                      className="ml-2 text-xs text-rose-400 hover:text-rose-300"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer Save */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !objective.trim()}
              className="px-5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow-sm"
            >
              {isSubmitting ? 'Saving Version...' : `Save as v${initialVersion.versionNumber + 1}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
