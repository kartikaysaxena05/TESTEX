/**
 * @file apps/desktop/src/renderer/features/retest/ImpactExplanationModal.tsx
 * Modal providing comprehensive trace, code, dependency, and risk explanations for a selected test case.
 */

import React from 'react';
import type { RetestSelectedTestDto } from '@ai-quality/contracts';
import { Button } from '../../ui/index.js';

export interface ImpactExplanationModalProps {
  readonly test: RetestSelectedTestDto | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export const ImpactExplanationModal: React.FC<ImpactExplanationModalProps> = ({
  test,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !test) {
    return null;
  }

  const getStateBadgeClass = (state: string) => {
    switch (state) {
      case 'MANDATORY':
        return 'bg-red-500/10 text-red-500 border border-red-500/30';
      case 'RECOMMENDED':
        return 'bg-blue-500/10 text-blue-500 border border-blue-500/30';
      case 'OPTIONAL':
        return 'bg-purple-500/10 text-purple-500 border border-purple-500/30';
      case 'UNKNOWN':
        return 'bg-amber-500/10 text-amber-500 border border-amber-500/30';
      case 'EXCLUDED':
      case 'NOT_IMPACTED':
      default:
        return 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-2xl w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-lg text-zinc-100">Test Selection Explanation</h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStateBadgeClass(
                test.selectionState,
              )}`}
            >
              {test.selectionState}
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 text-lg font-bold">
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {/* Target Test Info */}
          <div className="bg-zinc-950/60 p-4 rounded-lg border border-zinc-800">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-indigo-400">{test.testCaseKey}</span>
                <h4 className="text-base font-semibold text-zinc-100">{test.testCaseTitle}</h4>
              </div>
              <div className="text-right">
                <span className="text-xs text-zinc-400">Impact Category</span>
                <div className="text-sm font-medium text-zinc-200">{test.impactCategory}</div>
              </div>
            </div>
          </div>

          {/* Core Reason */}
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Why was this test selected?
            </h4>
            <div className="p-3 bg-zinc-950 rounded border border-zinc-800 text-sm text-zinc-200 leading-relaxed font-sans">
              {test.selectionReason}
            </div>
          </div>

          {/* Explainable Traversal Path */}
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Traceability & Dependency Chain
            </h4>
            <div className="bg-zinc-950 p-3 rounded border border-zinc-800 font-mono text-xs text-zinc-300 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">1. Change Ingested</span>
                <span className="text-zinc-500">→</span>
                <span className="text-zinc-200">Repository Diff / Requirement Update</span>
              </div>
              {test.dependencyPath.length > 0 && (
                <div className="flex items-start gap-2 pl-4 border-l border-zinc-800">
                  <span className="text-amber-400">2. Dependency Path:</span>
                  <div className="space-y-0.5">
                    {test.dependencyPath.map((step, idx) => (
                      <div key={idx} className="text-zinc-300">
                        {idx > 0 && '↳ '}
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {test.evidenceReferences.length > 0 && (
                <div className="flex items-center gap-2 pl-4 border-l border-zinc-800">
                  <span className="text-sky-400">3. Evidence:</span>
                  <span className="text-zinc-300">{test.evidenceReferences.join(', ')}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-indigo-400">4. Target Test:</span>
                <span className="text-zinc-100 font-medium">
                  {test.testCaseKey}: {test.testCaseTitle}
                </span>
              </div>
            </div>
          </div>

          {/* Risk Signals & Historical Badges */}
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Risk Signals & Confidence
            </h4>
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 bg-zinc-800 text-zinc-200 text-xs rounded border border-zinc-700">
                Confidence: <strong className="text-white">{test.confidence}</strong>
              </span>
              {test.historicalFailureSignal && (
                <span className="px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs rounded font-medium">
                  ⚠ Historical Failure Signal Detected
                </span>
              )}
              {test.riskSignals.map((signal, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs rounded font-medium"
                >
                  ⚡ {signal}
                </span>
              ))}
              {test.isExecutable ? (
                <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs rounded font-medium">
                  ✓ Executable Test Plan Available
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-zinc-800 text-zinc-400 border border-zinc-700 text-xs rounded">
                  Plan Pending Compilation
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-zinc-800">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
