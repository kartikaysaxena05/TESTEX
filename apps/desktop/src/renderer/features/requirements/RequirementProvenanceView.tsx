/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementProvenanceView.tsx
 * Visual component displaying the cryptographic and relational source provenance chain,
 * exact source text evidence, document/candidate linkage, and source integrity status.
 */

import React, { useEffect, useState } from 'react';
import type {
  RequirementDto,
  RequirementProvenanceDto,
  RequirementSourceContextDto,
} from '@ai-quality/contracts';
import { Badge, Button } from '../../ui/index.js';

interface RequirementProvenanceViewProps {
  readonly requirement: RequirementDto;
}

export function RequirementProvenanceView({
  requirement,
}: RequirementProvenanceViewProps): React.JSX.Element {
  const [provenance, setProvenance] = useState<RequirementProvenanceDto | null>(null);
  const [context, setContext] = useState<RequirementSourceContextDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingContext, setIsLoadingContext] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadProvenance() {
      setIsLoading(true);
      setError(null);

      try {
        if (!window.desktop?.requirements) {
          setError('Desktop bridge is not available.');
          return;
        }

        const res = await window.desktop.requirements.getProvenance({
          projectId: requirement.projectId,
          requirementId: requirement.id,
        });

        if (isCancelled) return;

        if (!res.ok) {
          setError(res.error.message || 'Failed to load requirement provenance.');
          return;
        }

        setProvenance(res.data);
      } catch (err: unknown) {
        if (isCancelled) return;
        setError(err instanceof Error ? err.message : 'Unknown error loading provenance.');
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    void loadProvenance();

    return () => {
      isCancelled = true;
    };
  }, [requirement.id, requirement.projectId]);

  const handleLoadContext = async () => {
    setIsLoadingContext(true);
    try {
      if (!window.desktop?.requirements) return;
      const res = await window.desktop.requirements.getSourceContext({
        projectId: requirement.projectId,
        requirementId: requirement.id,
      });
      if (res.ok && res.data) {
        setContext(res.data);
      }
    } catch {
      // Non-critical context fetch
    } finally {
      setIsLoadingContext(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-neutral-950/60 border border-neutral-800 rounded-lg text-center text-xs text-neutral-400">
        Loading source provenance evidence...
      </div>
    );
  }

  if (error || !provenance) {
    return (
      <div className="p-4 bg-red-950/20 border border-red-800/40 rounded-lg text-xs text-red-300">
        {error || 'Provenance record unavailable.'}
      </div>
    );
  }

  const getIntegrityVariant = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return 'success' as const;
      case 'MISSING_FILE':
      case 'HASH_MISMATCH':
      case 'SOURCE_RECORD_MISSING':
        return 'danger' as const;
      default:
        return 'warning' as const;
    }
  };

  return (
    <div
      className="space-y-4 border-t border-neutral-800/80 pt-4"
      data-testid="requirement-provenance-view"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
          <span>Source Provenance & Audit Trail</span>
          <Badge variant={getIntegrityVariant(provenance.integrityStatus)}>
            {provenance.integrityStatus}
          </Badge>
        </h3>
        <span className="text-[11px] text-neutral-500 font-mono">
          Completeness: {provenance.completeness}
        </span>
      </div>

      {/* Integrity Alert Warning if file missing or mismatch */}
      {provenance.integrityStatus !== 'VERIFIED' && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-200">
          <strong className="font-semibold">Source Integrity Warning:</strong>{' '}
          {provenance.integrityMessage}
        </div>
      )}

      {/* Provenance Chain Visualizer */}
      <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg">
        <div className="text-[11px] font-semibold uppercase text-neutral-400 mb-2">
          Evidence Chain
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          <span className="bg-sky-950/80 text-sky-300 px-2 py-1 rounded border border-sky-800/50">
            {requirement.requirementKey}
          </span>
          <span className="text-neutral-500">→</span>

          {provenance.sourceKind === 'MANUAL' && (
            <span className="bg-neutral-900 text-neutral-300 px-2 py-1 rounded border border-neutral-800">
              Manual Entry
            </span>
          )}

          {provenance.sourceKind === 'PASTED_TEXT' && (
            <>
              <span className="bg-emerald-950/80 text-emerald-300 px-2 py-1 rounded border border-emerald-800/50">
                Bulk Paste
              </span>
              {provenance.lineStart && (
                <>
                  <span className="text-neutral-500">→</span>
                  <span className="bg-neutral-900 text-neutral-300 px-2 py-1 rounded border border-neutral-800">
                    Lines {provenance.lineStart}–{provenance.lineEnd || provenance.lineStart}
                  </span>
                </>
              )}
            </>
          )}

          {provenance.sourceKind === 'DOCUMENT' && (
            <>
              {provenance.candidateId && (
                <>
                  <span
                    className="bg-purple-950/80 text-purple-300 px-2 py-1 rounded border border-purple-800/50"
                    title={`Candidate ID: ${provenance.candidateId}`}
                  >
                    Candidate
                  </span>
                  <span className="text-neutral-500">→</span>
                </>
              )}

              {provenance.sectionPath && (
                <>
                  <span className="bg-neutral-900 text-neutral-300 px-2 py-1 rounded border border-neutral-800">
                    Section: {provenance.sectionPath}
                  </span>
                  <span className="text-neutral-500">→</span>
                </>
              )}

              {provenance.pageNumber && (
                <>
                  <span className="bg-neutral-900 text-neutral-300 px-2 py-1 rounded border border-neutral-800">
                    Page {provenance.pageNumber}
                  </span>
                  <span className="text-neutral-500">→</span>
                </>
              )}

              {provenance.documentMetadata && (
                <>
                  <span className="bg-amber-950/80 text-amber-300 px-2 py-1 rounded border border-amber-800/50">
                    {provenance.documentMetadata.originalFileName}
                  </span>
                  <span className="text-neutral-500">→</span>
                  <span
                    className="bg-neutral-900 text-neutral-400 px-2 py-1 rounded border border-neutral-800 font-mono text-[11px]"
                    title={`Full SHA-256: ${provenance.sourceSha256}`}
                  >
                    SHA: {provenance.sourceSha256?.slice(0, 12)}...
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* External ID and Metadata Details */}
      <div className="grid grid-cols-2 gap-3 text-xs bg-neutral-950/40 p-3 rounded-lg border border-neutral-800/60">
        <div>
          <span className="text-neutral-400">Origin Type:</span>{' '}
          <strong className="text-neutral-200">{provenance.sourceKind}</strong>
        </div>
        {provenance.externalRequirementKey && (
          <div>
            <span className="text-neutral-400">Source Identifier:</span>{' '}
            <strong className="text-sky-400 font-mono">{provenance.externalRequirementKey}</strong>
          </div>
        )}
        {provenance.detectorVersion && (
          <div>
            <span className="text-neutral-400">Detector Version:</span>{' '}
            <span className="font-mono text-neutral-300">{provenance.detectorVersion}</span>
          </div>
        )}
        {provenance.sourceBlockId && (
          <div>
            <span className="text-neutral-400">Source Block:</span>{' '}
            <span className="font-mono text-neutral-300">{provenance.sourceBlockId}</span>
          </div>
        )}
      </div>

      {/* Exact Source Text (Immutable Evidence) */}
      {provenance.sourceText && provenance.sourceText !== requirement.originalText && (
        <div>
          <div className="text-[11px] font-semibold uppercase text-neutral-400 mb-1 flex items-center justify-between">
            <span>Immutable Source Text (From Evidence)</span>
            <span className="text-[10px] text-amber-400 font-normal">
              Modified after extraction/import
            </span>
          </div>
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
            {provenance.sourceText}
          </div>
        </div>
      )}

      {/* Reviewed Text if candidate was edited before import */}
      {provenance.reviewedText && provenance.reviewedText !== provenance.sourceText && (
        <div>
          <div className="text-[11px] font-semibold uppercase text-neutral-400 mb-1">
            Candidate Reviewed Text
          </div>
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
            {provenance.reviewedText}
          </div>
        </div>
      )}

      {/* Surrounding Source Context Section */}
      {provenance.sourceKind === 'DOCUMENT' && (
        <div className="space-y-2">
          {!context ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLoadContext}
              disabled={isLoadingContext}
            >
              {isLoadingContext ? 'Loading Surrounding Context...' : 'View Surrounding SRS Context'}
            </Button>
          ) : (
            <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3">
              <div className="text-[11px] font-semibold uppercase text-neutral-400 flex items-center justify-between">
                <span>Surrounding Document Extraction Blocks</span>
                <span className="text-[10px] text-neutral-500 font-mono">
                  Total Blocks: {context.totalSurroundingBlocks}
                </span>
              </div>

              {context.precedingBlocks.map(b => (
                <div
                  key={b.id}
                  className="p-2 bg-neutral-900/60 rounded border border-neutral-800/40 text-xs text-neutral-400"
                >
                  <div className="text-[10px] text-neutral-500 font-mono mb-0.5">
                    {b.id} (Preceding)
                  </div>
                  <div className="whitespace-pre-wrap">{b.text}</div>
                </div>
              ))}

              {context.targetBlock && (
                <div className="p-2.5 bg-sky-950/40 rounded border border-sky-800/60 text-xs text-sky-100">
                  <div className="text-[10px] text-sky-400 font-mono mb-0.5">
                    {context.targetBlock.id} (Candidate Target Block)
                  </div>
                  <div className="whitespace-pre-wrap font-medium">{context.targetBlock.text}</div>
                </div>
              )}

              {context.succeedingBlocks.map(b => (
                <div
                  key={b.id}
                  className="p-2 bg-neutral-900/60 rounded border border-neutral-800/40 text-xs text-neutral-400"
                >
                  <div className="text-[10px] text-neutral-500 font-mono mb-0.5">
                    {b.id} (Succeeding)
                  </div>
                  <div className="whitespace-pre-wrap">{b.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
