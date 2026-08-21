/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementRepresentationView.tsx
 * Component displaying structured requirement representation, normalized text, extracted clauses,
 * quantitative constraints, human review editor, and staleness detection banner.
 */

import React, { useEffect, useState, useCallback } from 'react';
import type {
  RequirementDto,
  RequirementRepresentationDto,
  RequirementModality,
} from '@ai-quality/contracts';
import { Button, Badge } from '../../ui/index.js';

interface RequirementRepresentationViewProps {
  readonly requirement: RequirementDto;
  readonly isArchivedProject?: boolean;
}

export function RequirementRepresentationView({
  requirement,
  isArchivedProject = false,
}: RequirementRepresentationViewProps): React.JSX.Element {
  const [representation, setRepresentation] = useState<RequirementRepresentationDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isNormalizing, setIsNormalizing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Edit / Review Mode
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editActor, setEditActor] = useState<string>('');
  const [editAction, setEditAction] = useState<string>('');
  const [editObject, setEditObject] = useState<string>('');
  const [editExpectedOutcome, setEditExpectedOutcome] = useState<string>('');
  const [editNormalizedText, setEditNormalizedText] = useState<string>('');
  const [editModality, setEditModality] = useState<RequirementModality>('UNSPECIFIED');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const loadRepresentation = useCallback(async () => {
    if (!window.desktop?.requirements) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await window.desktop.requirements.getRepresentation({
        projectId: requirement.projectId,
        requirementId: requirement.id,
      });

      if (res.ok) {
        setRepresentation(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load representation.');
    } finally {
      setIsLoading(false);
    }
  }, [requirement.projectId, requirement.id]);

  useEffect(() => {
    loadRepresentation();
  }, [loadRepresentation]);

  const handleNormalize = async () => {
    if (!window.desktop?.requirements) return;
    try {
      setIsNormalizing(true);
      setError(null);
      const res = await window.desktop.requirements.normalize({
        projectId: requirement.projectId,
        requirementId: requirement.id,
      });

      if (res.ok) {
        setRepresentation(res.data);
        setIsEditing(false);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Normalization failed.');
    } finally {
      setIsNormalizing(false);
    }
  };

  const handleRegenerate = async () => {
    if (!window.desktop?.requirements) return;
    try {
      setIsNormalizing(true);
      setError(null);
      const res = await window.desktop.requirements.regenerateRepresentation({
        projectId: requirement.projectId,
        requirementId: requirement.id,
      });

      if (res.ok) {
        setRepresentation(res.data);
        setIsEditing(false);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed.');
    } finally {
      setIsNormalizing(false);
    }
  };

  const startEditing = () => {
    if (!representation) return;
    setEditActor(representation.actor || '');
    setEditAction(representation.action || '');
    setEditObject(representation.object || '');
    setEditExpectedOutcome(representation.expectedOutcome || '');
    setEditNormalizedText(representation.normalizedText || '');
    setEditModality(representation.modality || 'UNSPECIFIED');
    setIsEditing(true);
  };

  const handleSaveReview = async () => {
    if (!representation || !window.desktop?.requirements) return;
    try {
      setIsSaving(true);
      setError(null);
      const res = await window.desktop.requirements.updateRepresentation({
        projectId: requirement.projectId,
        requirementId: requirement.id,
        actor: editActor.trim() ? editActor.trim() : null,
        action: editAction.trim() ? editAction.trim() : null,
        object: editObject.trim() ? editObject.trim() : null,
        expectedOutcome: editExpectedOutcome.trim() ? editExpectedOutcome.trim() : null,
        normalizedText: editNormalizedText.trim() ? editNormalizedText.trim() : undefined,
        modality: editModality,
      });

      if (res.ok) {
        setRepresentation(res.data);
        setIsEditing(false);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save review.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-neutral-950/60 border border-neutral-800 rounded-lg text-xs text-neutral-400">
        Loading structured representation...
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-neutral-800/80 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Structured Representation & Normalization
        </h3>
        {!isArchivedProject && (
          <div className="flex gap-2">
            {!representation ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleNormalize}
                disabled={isNormalizing}
              >
                {isNormalizing ? 'Normalizing...' : 'Normalize Requirement'}
              </Button>
            ) : (
              <>
                {!isEditing && (
                  <Button variant="secondary" size="sm" onClick={startEditing}>
                    Review / Edit
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={isNormalizing}
                >
                  {isNormalizing ? 'Regenerating...' : 'Regenerate'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Staleness Banner */}
      {representation?.isStale && (
        <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-lg flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold">⚠️ Stale Representation:</span>
            <span>
              The requirement text was modified after normalization. The representation may be out
              of date.
            </span>
          </div>
          {!isArchivedProject && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRegenerate}
              disabled={isNormalizing}
            >
              Update Representation
            </Button>
          )}
        </div>
      )}

      {!representation && !isLoading && (
        <div className="p-4 bg-neutral-950/40 border border-neutral-800 border-dashed rounded-lg text-center text-xs text-neutral-400">
          No structured representation generated yet for this requirement.
        </div>
      )}

      {representation && !isEditing && (
        <div className="p-4 bg-neutral-950/60 border border-neutral-800 rounded-lg space-y-4 text-xs">
          {/* Status & Method Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                representation.normalizationStatus === 'STALE'
                  ? 'warning'
                  : representation.normalizationStatus === 'REVIEWED'
                    ? 'info'
                    : 'success'
              }
            >
              {`Status: ${representation.normalizationStatus}`}
            </Badge>
            <Badge variant="neutral">{`Method: ${representation.normalizationMethod}`}</Badge>
            <Badge variant="neutral">{`Review: ${representation.reviewStatus}`}</Badge>
            <Badge variant="neutral">{`Normalizer: ${representation.normalizerVersion}`}</Badge>
          </div>

          {/* Normalized text display */}
          <div>
            <div className="text-neutral-400 font-medium mb-1">Normalized Text:</div>
            <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {representation.normalizedText}
            </div>
          </div>

          {/* Structured Clauses Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-2.5 bg-neutral-900/80 border border-neutral-800 rounded">
              <div className="text-neutral-400 font-medium mb-1">Actor / Subject</div>
              <div className="text-neutral-200 font-medium">
                {representation.actor || (
                  <span className="text-neutral-400 italic">Not identified</span>
                )}
              </div>
            </div>

            <div className="p-2.5 bg-neutral-900/80 border border-neutral-800 rounded">
              <div className="text-neutral-400 font-medium mb-1">Modality</div>
              <div className="flex items-center gap-1.5">
                <Badge
                  variant={
                    representation.negated
                      ? 'danger'
                      : representation.modality === 'SHALL' || representation.modality === 'MUST'
                        ? 'info'
                        : 'neutral'
                  }
                >
                  {representation.modality}
                </Badge>
                {representation.negated && <Badge variant="danger">Negated</Badge>}
              </div>
            </div>

            <div className="p-2.5 bg-neutral-900/80 border border-neutral-800 rounded">
              <div className="text-neutral-400 font-medium mb-1">Action</div>
              <div className="text-neutral-200 font-medium">
                {representation.action || (
                  <span className="text-neutral-400 italic">Not identified</span>
                )}
              </div>
            </div>

            <div className="p-2.5 bg-neutral-900/80 border border-neutral-800 rounded">
              <div className="text-neutral-400 font-medium mb-1">Object</div>
              <div className="text-neutral-200 truncate" title={representation.object || ''}>
                {representation.object || <span className="text-neutral-400 italic">None</span>}
              </div>
            </div>
          </div>

          {/* Conditions */}
          {representation.conditions.length > 0 && (
            <div>
              <div className="text-neutral-400 font-medium mb-1.5">Conditions:</div>
              <div className="space-y-1.5">
                {representation.conditions.map((cond, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 bg-neutral-900/90 border border-neutral-800 rounded"
                  >
                    <Badge variant="info">{cond.type}</Badge>
                    <span className="text-neutral-200">{cond.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Constraints & Quantitative Values */}
          {(representation.constraints.length > 0 ||
            representation.quantitativeValues.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {representation.constraints.length > 0 && (
                <div>
                  <div className="text-neutral-400 font-medium mb-1.5">Constraints:</div>
                  <div className="space-y-1">
                    {representation.constraints.map((c, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-neutral-900/80 border border-neutral-800 rounded text-neutral-300"
                      >
                        {c.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {representation.quantitativeValues.length > 0 && (
                <div>
                  <div className="text-neutral-400 font-medium mb-1.5">Quantitative Values:</div>
                  <div className="space-y-1">
                    {representation.quantitativeValues.map((qv, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-neutral-900/80 border border-neutral-800 rounded flex items-center justify-between text-neutral-300"
                      >
                        <span className="font-mono text-xs text-sky-400">{qv.text}</span>
                        {qv.operator && <Badge variant="neutral">{qv.operator}</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Expected Outcome */}
          {representation.expectedOutcome && (
            <div>
              <div className="text-neutral-400 font-medium mb-1">Expected Outcome:</div>
              <div className="p-2 bg-neutral-900/80 border border-neutral-800 rounded text-neutral-200">
                {representation.expectedOutcome}
              </div>
            </div>
          )}

          {/* Warnings */}
          {representation.warnings.length > 0 && (
            <div>
              <div className="text-amber-400 font-medium mb-1">Structure Notes / Warnings:</div>
              <div className="flex flex-wrap gap-1.5">
                {representation.warnings.map((w, idx) => (
                  <Badge key={idx} variant="warning">
                    {w}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inline Review Editor */}
      {representation && isEditing && (
        <div className="p-4 bg-neutral-950/80 border border-sky-900/60 rounded-lg space-y-3 text-xs">
          <div className="font-semibold text-neutral-200">Review & Correct Structured Fields</div>

          <div>
            <label className="block text-neutral-400 mb-1">Normalized Text</label>
            <textarea
              className="w-full p-2 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 font-mono text-xs"
              rows={3}
              value={editNormalizedText}
              onChange={e => setEditNormalizedText(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1">Actor / Subject</label>
              <input
                type="text"
                className="w-full p-2 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 text-xs"
                value={editActor}
                onChange={e => setEditActor(e.target.value)}
                placeholder="e.g. administrator, system"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">Modality</label>
              <select
                className="w-full p-2 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 text-xs"
                value={editModality}
                onChange={e => setEditModality(e.target.value as RequirementModality)}
              >
                <option value="SHALL">SHALL</option>
                <option value="MUST">MUST</option>
                <option value="SHALL_NOT">SHALL_NOT</option>
                <option value="MUST_NOT">MUST_NOT</option>
                <option value="SHOULD">SHOULD</option>
                <option value="MAY">MAY</option>
                <option value="REQUIRED_TO">REQUIRED_TO</option>
                <option value="UNSPECIFIED">UNSPECIFIED</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1">Action</label>
              <input
                type="text"
                className="w-full p-2 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 text-xs"
                value={editAction}
                onChange={e => setEditAction(e.target.value)}
                placeholder="e.g. lock, encrypt, validate"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">Object</label>
              <input
                type="text"
                className="w-full p-2 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 text-xs"
                value={editObject}
                onChange={e => setEditObject(e.target.value)}
                placeholder="e.g. stored credentials"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Expected Outcome</label>
            <input
              type="text"
              className="w-full p-2 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 text-xs"
              value={editExpectedOutcome}
              onChange={e => setEditExpectedOutcome(e.target.value)}
              placeholder="e.g. access denied"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveReview} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Review'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
