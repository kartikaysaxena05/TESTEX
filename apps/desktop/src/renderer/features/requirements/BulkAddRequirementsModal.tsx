/**
 * @file apps/desktop/src/renderer/features/requirements/BulkAddRequirementsModal.tsx
 * Modal dialog for pasting multiple requirement statements, deterministic preview, and atomic bulk import.
 */

import React, { useState, useEffect } from 'react';
import type {
  RequirementType,
  RequirementPriority,
  RequirementStatus,
  RequirementCandidate,
  ApprovedBulkCandidateInput,
} from '@ai-quality/contracts';
import { Button, Input, Select, Textarea, Badge } from '../../ui/index.js';

interface EditableCandidate extends RequirementCandidate {
  included: boolean;
  userTitle: string;
  userText: string;
  userType: RequirementType;
  userPriority: RequirementPriority;
  userStatus: RequirementStatus;
}

interface BulkAddRequirementsModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly isArchivedProject?: boolean;
  readonly onClose: () => void;
  readonly onImportSuccess: (count: number) => void;
}

const REQUIREMENT_TYPES: { value: RequirementType; label: string }[] = [
  { value: 'FUNCTIONAL', label: 'Functional' },
  { value: 'NON_FUNCTIONAL', label: 'Non-Functional' },
  { value: 'BUSINESS_RULE', label: 'Business Rule' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'PERFORMANCE', label: 'Performance' },
  { value: 'USABILITY', label: 'Usability' },
  { value: 'DATA', label: 'Data' },
  { value: 'INTEGRATION', label: 'Integration' },
  { value: 'CONSTRAINT', label: 'Constraint' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const REQUIREMENT_PRIORITIES: { value: RequirementPriority; label: string }[] = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
  { value: 'UNSPECIFIED', label: 'Unspecified' },
];

export function BulkAddRequirementsModal({
  isOpen,
  projectId,
  isArchivedProject = false,
  onClose,
  onImportSuccess,
}: BulkAddRequirementsModalProps): React.JSX.Element | null {
  const [step, setStep] = useState<'PASTE' | 'PREVIEW'>('PASTE');
  const [pastedText, setPastedText] = useState<string>('');
  const [sourceName, setSourceName] = useState<string>('');
  const [candidates, setCandidates] = useState<EditableCandidate[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('PASTE');
      setPastedText('');
      setSourceName(`Bulk Paste — ${new Date().toLocaleDateString()}`);
      setCandidates([]);
      setIsParsing(false);
      setIsSubmitting(false);
      setErrorMessage(null);
    }
  }, [isOpen, projectId]);

  if (!isOpen) {
    return null;
  }

  const handleParse = async (): Promise<void> => {
    if (!pastedText.trim()) {
      setErrorMessage('Please paste at least one requirement statement.');
      return;
    }

    setErrorMessage(null);
    setIsParsing(true);

    try {
      if (!window.desktop?.requirements?.parseBulk) {
        throw new Error('Desktop bulk parser API is not available.');
      }

      const res = await window.desktop.requirements.parseBulk({ rawText: pastedText });
      if (!res.ok) {
        setErrorMessage(res.error.message);
        setIsParsing(false);
        return;
      }

      if (res.data.candidates.length === 0) {
        setErrorMessage('No valid requirement candidates could be parsed from the provided text.');
        setIsParsing(false);
        return;
      }

      const editable: EditableCandidate[] = res.data.candidates.map((c: RequirementCandidate) => ({
        ...c,
        included: !c.isDuplicateInBatch,
        userTitle: c.title || c.originalText.slice(0, 80).trim(),
        userText: c.originalText,
        userType: 'FUNCTIONAL',
        userPriority: 'MEDIUM',
        userStatus: 'ACTIVE',
      }));

      setCandidates(editable);
      setStep('PREVIEW');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to parse requirements.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleToggleInclude = (index: number): void => {
    setCandidates(prev => prev.map((c, i) => (i === index ? { ...c, included: !c.included } : c)));
  };

  const handleUpdateCandidate = (
    index: number,
    field: keyof EditableCandidate,
    val: unknown,
  ): void => {
    setCandidates(prev => prev.map((c, i) => (i === index ? { ...c, [field]: val } : c)));
  };

  const handleRemoveCandidate = (index: number): void => {
    setCandidates(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = async (): Promise<void> => {
    const included = candidates.filter(c => c.included);
    if (included.length === 0) {
      setErrorMessage('Please include at least one candidate for import.');
      return;
    }

    if (isArchivedProject) {
      setErrorMessage('Cannot import requirements into an archived project.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (!window.desktop?.requirements?.importBulk) {
        throw new Error('Desktop bulk import API is not available.');
      }

      const payload: ApprovedBulkCandidateInput[] = included.map(c => ({
        originalText: c.userText.trim(),
        title: c.userTitle.trim(),
        type: c.userType,
        priority: c.userPriority,
        status: c.userStatus,
        detectedExternalKey: c.detectedExternalKey ?? undefined,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
      }));

      const res = await window.desktop.requirements.importBulk({
        projectId,
        sourceName: sourceName.trim() || undefined,
        candidates: payload,
      });

      if (!res.ok) {
        setErrorMessage(res.error.message);
        setIsSubmitting(false);
        return;
      }

      onImportSuccess(res.data.importedCount);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to import requirements.');
      setIsSubmitting(false);
    }
  };

  const includedCount = candidates.filter(c => c.included).length;
  const duplicateCount = candidates.filter(c => c.isDuplicateInBatch).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-add-modal-title"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 id="bulk-add-modal-title" className="text-lg font-semibold text-white">
              Bulk Add Requirements
            </h2>
            <p className="text-xs text-slate-400">
              {step === 'PASTE'
                ? 'Paste multiple requirement statements for deterministic parsing.'
                : 'Review, edit, and select parsed requirement candidates before saving.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
            aria-label="Close dialog"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="rounded-lg border border-rose-500/50 bg-rose-950/40 p-4 text-sm text-rose-200">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 shrink-0 text-rose-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {step === 'PASTE' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-800/50 bg-blue-950/30 p-3.5 text-xs text-blue-300">
                <span className="font-semibold block mb-1">Supported Paste Formats:</span>
                <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                  <li>One requirement per line</li>
                  <li>
                    Numbered lists (e.g.{' '}
                    <code className="text-blue-200">1. User shall sign in</code>)
                  </li>
                  <li>
                    Bullet points (e.g. <code className="text-blue-200">- User shall log out</code>{' '}
                    or <code className="text-blue-200">• Text</code>)
                  </li>
                  <li>
                    Prefixed identifiers (e.g.{' '}
                    <code className="text-blue-200">REQ-01: User shall reset password</code>)
                  </li>
                </ul>
              </div>

              <div>
                <label
                  htmlFor="pasted-text-input"
                  className="block text-sm font-medium text-slate-300 mb-1"
                >
                  Paste Requirements Text <span className="text-rose-400">*</span>
                </label>
                <Textarea
                  id="pasted-text-input"
                  value={pastedText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setPastedText(e.target.value)
                  }
                  rows={14}
                  placeholder={`1. The system shall allow users to sign in using email and password.\n2. The system shall lock accounts after five consecutive failed attempts.\n3. The user shall be able to request a password reset link.`}
                  className="w-full font-mono text-xs"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Review Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3.5">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-300">
                    Parsed: <span className="text-white">{candidates.length}</span>
                  </span>
                  <span className="text-xs font-semibold text-emerald-400">
                    Ready to Import: {includedCount}
                  </span>
                  {duplicateCount > 0 && (
                    <span className="text-xs font-semibold text-amber-400">
                      Duplicates Flagged: {duplicateCount}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="bulk-source-name"
                    className="text-xs text-slate-400 whitespace-nowrap"
                  >
                    Source Label:
                  </label>
                  <Input
                    id="bulk-source-name"
                    value={sourceName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSourceName(e.target.value)
                    }
                    placeholder="Source name..."
                    className="h-8 text-xs w-56"
                  />
                </div>
              </div>

              {/* Candidate Cards */}
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {candidates.map((cand, idx) => (
                  <div
                    key={cand.candidateId}
                    className={`rounded-lg border p-3.5 transition-colors ${
                      cand.included
                        ? 'border-slate-700 bg-slate-800/60'
                        : 'border-slate-800 bg-slate-900/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`candidate-check-${idx}`}
                          checked={cand.included}
                          onChange={() => handleToggleInclude(idx)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
                        />
                        <label
                          htmlFor={`candidate-check-${idx}`}
                          className="text-xs font-semibold text-slate-200 cursor-pointer"
                        >
                          Candidate #{idx + 1}
                        </label>
                        {cand.detectedExternalKey && (
                          <Badge variant="info">Ext: {cand.detectedExternalKey}</Badge>
                        )}
                        <Badge variant="neutral">{cand.parseMethod}</Badge>
                        {cand.isDuplicateInBatch && (
                          <Badge variant="warning">Batch Duplicate</Badge>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveCandidate(idx)}
                        className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
                        title="Remove candidate"
                      >
                        Remove
                      </button>
                    </div>

                    {cand.warnings.length > 0 && (
                      <div className="mb-2 rounded border border-amber-500/30 bg-amber-950/20 p-2 text-xs text-amber-300">
                        {cand.warnings.join(' ')}
                      </div>
                    )}

                    {cand.included && (
                      <div className="space-y-2 mt-2">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-400 mb-0.5">
                            Title
                          </label>
                          <Input
                            value={cand.userTitle}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              handleUpdateCandidate(idx, 'userTitle', e.target.value)
                            }
                            className="text-xs h-7"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-400 mb-0.5">
                            Requirement Statement
                          </label>
                          <Textarea
                            value={cand.userText}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                              handleUpdateCandidate(idx, 'userText', e.target.value)
                            }
                            rows={2}
                            className="text-xs font-mono"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-400 mb-0.5">
                              Type
                            </label>
                            <Select
                              value={cand.userType}
                              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                handleUpdateCandidate(
                                  idx,
                                  'userType',
                                  e.target.value as RequirementType,
                                )
                              }
                              className="text-xs h-7"
                            >
                              {REQUIREMENT_TYPES.map(t => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </Select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-400 mb-0.5">
                              Priority
                            </label>
                            <Select
                              value={cand.userPriority}
                              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                handleUpdateCandidate(
                                  idx,
                                  'userPriority',
                                  e.target.value as RequirementPriority,
                                )
                              }
                              className="text-xs h-7"
                            >
                              {REQUIREMENT_PRIORITIES.map(p => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4">
          {step === 'PREVIEW' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setStep('PASTE')}
              disabled={isSubmitting}
            >
              ← Back to Paste
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            {step === 'PASTE' ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleParse}
                disabled={isParsing || !pastedText.trim()}
              >
                {isParsing ? 'Parsing...' : 'Parse Requirements'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleImport}
                disabled={isSubmitting || includedCount === 0 || isArchivedProject}
              >
                {isSubmitting
                  ? 'Importing...'
                  : `Import ${includedCount} Requirement${includedCount === 1 ? '' : 's'}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
