/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementTestSpecificationsView.tsx
 * UI Component for displaying Phase 51 Enriched Test Specifications.
 */

import type { TestSpecificationEnrichmentResultDto } from '@ai-quality/contracts';
import React, { useEffect, useState } from 'react';

interface RequirementTestSpecificationsViewProps {
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly scenarioId?: string;
}

export const RequirementTestSpecificationsView: React.FC<
  RequirementTestSpecificationsViewProps
> = ({ projectId, requirementId, requirementKey, scenarioId }) => {
  const [result, setResult] = useState<TestSpecificationEnrichmentResultDto | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [persisting, setPersisting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [persistedKeys, setPersistedKeys] = useState<Record<string, string>>({});
  const [persistMessage, setPersistMessage] = useState<string | null>(null);
  const [expandedSpecId, setExpandedSpecId] = useState<string | null>(null);
  const [validationStatuses, setValidationStatuses] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState<boolean>(false);

  const handleValidateAllSpecs = async () => {
    if (!result || result.specifications.length === 0) return;
    if (!window.desktop?.testValidation) return;
    try {
      setValidating(true);
      const res = await window.desktop.testValidation.validateBatch({
        projectId,
        requirementId,
        specifications: result.specifications,
      });
      if (res.ok) {
        const statuses: Record<string, string> = {};
        res.data.validations.forEach((v, idx) => {
          const spec = result.specifications[idx];
          if (spec) {
            statuses[spec.id] = v.status;
          }
        });
        setValidationStatuses(statuses);
      }
    } catch (err: unknown) {
      console.error('Failed to validate specifications:', err);
    } finally {
      setValidating(false);
    }
  };

  const fetchCurrent = async () => {
    if (!window.desktop?.testSpecifications) return;
    try {
      setLoading(true);
      setError(null);
      const res = await window.desktop.testSpecifications.getCurrent({
        projectId,
        requirementId,
        scenarioId,
      });
      if (res.ok && res.data) {
        setResult(res.data);
        if (res.data.specifications.length > 0 && !expandedSpecId) {
          setExpandedSpecId(res.data.specifications[0]?.id ?? null);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEnrich = async (forceRegenerate = false) => {
    if (!window.desktop?.testSpecifications) {
      setError('Desktop API bridge is not available.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setPersistMessage(null);
      const res = await window.desktop.testSpecifications.enrich({
        projectId,
        requirementId,
        scenarioId,
        forceRegenerate,
      });
      if (res.ok) {
        setResult(res.data);
        if (res.data.specifications.length > 0) {
          setExpandedSpecId(res.data.specifications[0]?.id ?? null);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePersistSingle = async (
    spec: NonNullable<typeof result>['specifications'][number],
  ) => {
    if (!window.desktop?.testCases || !result) return;
    try {
      setPersisting(true);
      setError(null);
      setPersistMessage(null);
      const res = await window.desktop.testCases.persistFromGeneration({
        projectId,
        requirementId,
        requirementVersionNumber: result.requirementVersionNumber,
        scenarioId: spec.scenarioId ?? null,
        specification: spec,
        generationProvenance: {
          inputFingerprint: result.inputFingerprint,
          providerId: result.providerId,
          model: result.model,
          promptId: result.promptId,
          promptVersion: result.promptVersion,
        },
      });
      if (res.ok) {
        setPersistedKeys(prev => ({ ...prev, [spec.id]: res.data.testCaseKey }));
        setPersistMessage(`Persisted '${spec.title}' as Test Case ${res.data.testCaseKey}`);
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPersisting(false);
    }
  };

  const handlePersistAll = async () => {
    if (!window.desktop?.testCases || !result || result.specifications.length === 0) return;
    try {
      setPersisting(true);
      setError(null);
      setPersistMessage(null);
      const res = await window.desktop.testCases.persistBatchFromGeneration({
        projectId,
        requirementId,
        requirementVersionNumber: result.requirementVersionNumber,
        specifications: result.specifications,
        generationProvenance: {
          inputFingerprint: result.inputFingerprint,
          providerId: result.providerId,
          model: result.model,
          promptId: result.promptId,
          promptVersion: result.promptVersion,
        },
      });
      if (res.ok) {
        const newKeys: Record<string, string> = {};
        res.data.testCases.forEach(tc => {
          const matchingSpec = result.specifications.find(
            s => s.title.trim() === tc.title.trim() || s.scenarioKey === tc.sourceScenarioKey,
          );
          if (matchingSpec) {
            newKeys[matchingSpec.id] = tc.testCaseKey;
          }
        });
        setPersistedKeys(prev => ({ ...prev, ...newKeys }));
        setPersistMessage(
          `Successfully persisted ${res.data.createdCount} canonical Test Case(s).`,
        );
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPersisting(false);
    }
  };

  useEffect(() => {
    fetchCurrent();
  }, [projectId, requirementId, scenarioId]);

  return (
    <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100">
            Phase 51 & 52: Test Specifications & Persistence
          </h3>
          <p className="text-xs text-slate-400">
            Enriches test scenarios with grounded preconditions, data requirements, observable
            outcomes, and persists them into canonical, structured Test Cases.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {result && result.specifications.length > 0 && (
            <>
              <button
                onClick={handleValidateAllSpecs}
                disabled={validating || loading}
                className="rounded bg-indigo-900 border border-indigo-700 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-800 disabled:opacity-50"
              >
                {validating ? 'Validating...' : '⚡ Validate All Specs'}
              </button>
              <button
                onClick={handlePersistAll}
                disabled={persisting || loading}
                className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {persisting ? 'Persisting...' : 'Persist All as Test Cases'}
              </button>
            </>
          )}
          <button
            onClick={() => handleEnrich(Boolean(result))}
            disabled={loading || persisting}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading
              ? 'Enriching...'
              : result
                ? 'Re-enrich Specifications'
                : 'Generate Specifications'}
          </button>
        </div>
      </div>

      {persistMessage && (
        <div className="rounded border border-emerald-800 bg-emerald-950/50 p-3 text-xs text-emerald-300">
          ✓ {persistMessage}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-800 bg-red-950/50 p-3 text-xs text-red-300">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Metrics Summary */}
      {result && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <div className="rounded bg-slate-800/80 p-2 text-center">
            <div className="text-xs text-slate-400">Specifications</div>
            <div className="text-base font-bold text-slate-100">
              {result.metrics.totalSpecifications}
            </div>
          </div>
          <div className="rounded bg-slate-800/80 p-2 text-center">
            <div className="text-xs text-indigo-400">Preconditions</div>
            <div className="text-base font-bold text-indigo-300">
              {result.metrics.totalPreconditions}
            </div>
          </div>
          <div className="rounded bg-slate-800/80 p-2 text-center">
            <div className="text-xs text-emerald-400">Test Data Items</div>
            <div className="text-base font-bold text-emerald-300">
              {result.metrics.totalTestDataItems}
            </div>
          </div>
          <div className="rounded bg-slate-800/80 p-2 text-center">
            <div className="text-xs text-cyan-400">Expected Results</div>
            <div className="text-base font-bold text-cyan-300">
              {result.metrics.totalExpectedResults}
            </div>
          </div>
          <div className="rounded bg-slate-800/80 p-2 text-center">
            <div className="text-xs text-amber-400">Explicit Unknowns</div>
            <div className="text-base font-bold text-amber-300">{result.metrics.unknownCount}</div>
          </div>
          <div className="rounded bg-slate-800/80 p-2 text-center">
            <div className="text-xs text-rose-400">Review Required</div>
            <div className="text-base font-bold text-rose-300">
              {result.metrics.reviewRequiredCount}
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {result?.warnings && result.warnings.length > 0 && (
        <div className="space-y-1">
          {result.warnings.map((w, idx) => (
            <div
              key={idx}
              className="rounded border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-300"
            >
              <span className="font-semibold">[{w.code}]:</span> {w.message}
            </div>
          ))}
        </div>
      )}

      {/* Specifications List */}
      {result && result.specifications.length > 0 ? (
        <div className="space-y-3">
          {result.specifications.map(spec => {
            const isExpanded = expandedSpecId === spec.id;
            return (
              <div
                key={spec.id}
                className="overflow-hidden rounded-md border border-slate-700 bg-slate-850"
              >
                {/* Spec Card Header */}
                <div
                  onClick={() => setExpandedSpecId(isExpanded ? null : spec.id)}
                  className="flex cursor-pointer items-center justify-between bg-slate-800/90 px-3 py-2 transition hover:bg-slate-750"
                >
                  <div className="flex items-center space-x-2">
                    {spec.scenarioKey && (
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                        {spec.scenarioKey}
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        spec.category === 'POSITIVE'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : spec.category === 'NEGATIVE'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : spec.category === 'BOUNDARY'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-purple-950 text-purple-300 border border-purple-800'
                      }`}
                    >
                      {spec.category}
                    </span>
                    <span className="text-xs font-medium text-slate-200">{spec.title}</span>
                    {validationStatuses[spec.id] && (
                      <span
                        className={`rounded px-1.5 py-0.2 text-[10px] font-bold border ${
                          validationStatuses[spec.id] === 'VALID'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : validationStatuses[spec.id] === 'REVIEW_REQUIRED'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-rose-950 text-rose-300 border-rose-800'
                        }`}
                      >
                        {validationStatuses[spec.id]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-[11px]">
                    {spec.reviewRequired && (
                      <span className="rounded bg-rose-900/60 px-1.5 py-0.5 text-rose-300 border border-rose-700">
                        Review Required
                      </span>
                    )}
                    {persistedKeys[spec.id] ? (
                      <span className="rounded bg-emerald-950 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-700">
                        ✓ {persistedKeys[spec.id]}
                      </span>
                    ) : (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handlePersistSingle(spec);
                        }}
                        disabled={persisting}
                        className="rounded bg-emerald-800/80 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                      >
                        Persist as TC
                      </button>
                    )}
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-slate-300">
                      {spec.preconditions.length} Prec · {spec.testData.length} Data ·{' '}
                      {spec.expectedResults.length} Exp
                    </span>
                    <span className="text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="space-y-4 p-4 text-xs text-slate-300">
                    {/* Review Reasons Callout */}
                    {spec.reviewRequired && spec.reviewReasons.length > 0 && (
                      <div className="rounded border border-rose-800 bg-rose-950/40 p-2.5">
                        <div className="font-semibold text-rose-300">Review Required Reasons:</div>
                        <ul className="list-inside list-disc space-y-0.5 text-rose-200 mt-1">
                          {spec.reviewReasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Section 1: Preconditions */}
                    <div>
                      <h4 className="font-semibold text-indigo-300 mb-1.5 flex items-center space-x-1.5">
                        <span>Preconditions ({spec.preconditions.length})</span>
                      </h4>
                      {spec.preconditions.length === 0 ? (
                        <p className="italic text-slate-500">None required for this scenario.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {spec.preconditions.map(prec => (
                            <div
                              key={prec.id}
                              className="rounded border border-slate-750 bg-slate-900/80 p-2"
                            >
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="rounded bg-indigo-950 border border-indigo-800 px-1.5 py-0.2 text-[10px] text-indigo-300 font-mono">
                                  {prec.category}
                                </span>
                                <span className="font-mono text-[10px] text-slate-400">
                                  {prec.key}
                                </span>
                              </div>
                              <div className="text-slate-200">{prec.description}</div>
                              {prec.assumptions.length > 0 && (
                                <div className="mt-1 text-[11px] text-slate-400">
                                  <span className="font-semibold text-slate-300">Assumption:</span>{' '}
                                  {prec.assumptions.join('; ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Section 2: Test Data Requirements */}
                    <div>
                      <h4 className="font-semibold text-emerald-300 mb-1.5">
                        Test Data Requirements ({spec.testData.length})
                      </h4>
                      {spec.testData.length === 0 ? (
                        <p className="italic text-slate-500">No test data required.</p>
                      ) : (
                        <div className="overflow-x-auto rounded border border-slate-750">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-800 text-slate-400 border-b border-slate-700">
                              <tr>
                                <th className="p-1.5">Key / Name</th>
                                <th className="p-1.5">Data Type</th>
                                <th className="p-1.5">Origin</th>
                                <th className="p-1.5">Value / Generator</th>
                                <th className="p-1.5">Constraint / Note</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                              {spec.testData.map(item => (
                                <tr key={item.id}>
                                  <td className="p-1.5 font-medium text-slate-200">
                                    <span className="font-mono text-slate-400 mr-1">
                                      {item.key}
                                    </span>
                                    {item.name}
                                    {item.isSensitive && (
                                      <span className="ml-1.5 rounded bg-amber-950 border border-amber-800 px-1 py-0.2 text-[9px] text-amber-300">
                                        Sensitive Placeholder
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-1.5 text-slate-300">{item.dataType}</td>
                                  <td className="p-1.5">
                                    <span
                                      className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                                        item.origin === 'EXPLICIT'
                                          ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                          : item.origin === 'DERIVED'
                                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                            : item.origin === 'EXAMPLE' ||
                                                item.origin === 'GENERATED'
                                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                                      }`}
                                    >
                                      {item.origin}
                                    </span>
                                  </td>
                                  <td className="p-1.5 font-mono text-slate-200">
                                    {item.origin === 'UNKNOWN' ? (
                                      <span className="text-amber-400 italic">UNKNOWN</span>
                                    ) : item.value !== null && item.value !== undefined ? (
                                      String(item.value)
                                    ) : item.generator ? (
                                      <span className="text-indigo-300">{item.generator}</span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td className="p-1.5 text-slate-400">
                                    {item.unknownReason ? (
                                      <span className="text-amber-300 italic">
                                        {item.unknownReason}
                                      </span>
                                    ) : item.constraint ? (
                                      item.constraint
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Section 3: Observable Expected Results */}
                    <div>
                      <h4 className="font-semibold text-cyan-300 mb-1.5">
                        Observable Expected Results ({spec.expectedResults.length})
                      </h4>
                      {spec.expectedResults.length === 0 ? (
                        <p className="italic text-rose-400">No expected results derived.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {spec.expectedResults.map(exp => (
                            <div
                              key={exp.id}
                              className="rounded border border-slate-750 bg-slate-900/80 p-2 space-y-1"
                            >
                              <div className="flex items-center space-x-2">
                                <span className="rounded bg-cyan-950 border border-cyan-800 px-1.5 py-0.2 text-[10px] text-cyan-300 font-mono">
                                  {exp.category}
                                </span>
                                <span className="font-mono text-[10px] text-slate-400">
                                  {exp.key}
                                </span>
                                {exp.httpStatusExpected && (
                                  <span className="rounded bg-slate-700 px-1.5 py-0.2 text-[10px] text-slate-200 font-mono">
                                    HTTP {exp.httpStatusExpected}
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-100">{exp.description}</div>
                              {exp.stateChange && (
                                <div className="text-[11px] text-emerald-300">
                                  <span className="font-semibold">State Change:</span>{' '}
                                  {exp.stateChange.entity ?? 'Entity'}:{' '}
                                  {exp.stateChange.from ?? 'Initial'} → {exp.stateChange.to}
                                </div>
                              )}
                              {exp.nonChange && (
                                <div className="text-[11px] text-amber-300">
                                  <span className="font-semibold">Invariant State:</span>{' '}
                                  {exp.nonChange.entity ?? 'Target record'} remains{' '}
                                  {exp.nonChange.preservedState ?? 'unmodified'}
                                </div>
                              )}
                              {exp.exactMessageExpected && (
                                <div className="text-[11px] text-slate-300">
                                  <span className="font-semibold">Exact Message:</span> &quot;
                                  {exp.exactMessageExpected}&quot;
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Section 4: Explicit Unknowns & Assumptions */}
                    {(spec.unknowns.length > 0 || spec.assumptions.length > 0) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                        {spec.unknowns.length > 0 && (
                          <div className="rounded border border-amber-800 bg-amber-950/30 p-2">
                            <div className="font-semibold text-amber-300 mb-1">
                              Explicit Unknowns ({spec.unknowns.length}):
                            </div>
                            <ul className="list-inside list-disc space-y-0.5 text-amber-200 text-[11px]">
                              {spec.unknowns.map((u, i) => (
                                <li key={i}>
                                  <span className="font-medium text-amber-100">{u.name}:</span>{' '}
                                  {u.reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {spec.assumptions.length > 0 && (
                          <div className="rounded border border-slate-700 bg-slate-800/40 p-2">
                            <div className="font-semibold text-slate-300 mb-1">
                              Assumptions ({spec.assumptions.length}):
                            </div>
                            <ul className="list-inside list-disc space-y-0.5 text-slate-300 text-[11px]">
                              {spec.assumptions.map((a, i) => (
                                <li key={i}>{a}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Section 5: Grounding Citations */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-400">Grounding Evidence:</span>
                      {spec.sourceEvidenceRefs.map((ref, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 border border-slate-700"
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !loading && (
          <div className="rounded border border-dashed border-slate-750 p-6 text-center text-xs text-slate-400">
            No enriched test specifications generated yet for {requirementKey}. Click &quot;Generate
            Specifications&quot; to derive preconditions, test data, and expected results.
          </div>
        )
      )}
    </div>
  );
};
