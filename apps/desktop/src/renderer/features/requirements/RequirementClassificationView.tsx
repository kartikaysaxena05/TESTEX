/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementClassificationView.tsx
 * Component for displaying, explaining, staleness-checking, and reviewing multidimensional requirement classification metadata.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  RequirementMetadataDto,
  RequirementCategory,
  RequirementSubCategory,
  RequirementPriority,
  RequirementRiskLevel,
  RequirementCriticality,
} from '@ai-quality/contracts';

interface RequirementClassificationViewProps {
  readonly projectId: string;
  readonly requirementId: string;
}

export const RequirementClassificationView: React.FC<RequirementClassificationViewProps> = ({
  projectId,
  requirementId,
}) => {
  const [metadata, setMetadata] = useState<RequirementMetadataDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Edit form state
  const [editCategory, setEditCategory] = useState<RequirementCategory>('UNKNOWN');
  const [editSubCategory, setEditSubCategory] = useState<RequirementSubCategory | ''>('');
  const [editDomain, setEditDomain] = useState<string>('');
  const [editModule, setEditModule] = useState<string>('');
  const [editBusinessCapability, setEditBusinessCapability] = useState<string>('');
  const [editPriority, setEditPriority] = useState<RequirementPriority>('UNSPECIFIED');
  const [editRiskLevel, setEditRiskLevel] = useState<RequirementRiskLevel>('UNSPECIFIED');
  const [editCriticality, setEditCriticality] = useState<RequirementCriticality>('UNSPECIFIED');
  const [editSecurity, setEditSecurity] = useState<boolean>(false);
  const [editPerformance, setEditPerformance] = useState<boolean>(false);
  const [editCompliance, setEditCompliance] = useState<boolean>(false);
  const [editTags, setEditTags] = useState<string>('');

  const fetchMetadata = useCallback(async () => {
    if (!window.desktop?.requirements) return;
    try {
      setLoading(true);
      setError(null);
      const res = await window.desktop.requirements.getMetadata({
        projectId,
        requirementId,
      });

      if (res.ok) {
        setMetadata(res.data);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to load requirement classification metadata.');
    } finally {
      setLoading(false);
    }
  }, [projectId, requirementId]);

  useEffect(() => {
    void fetchMetadata();
  }, [fetchMetadata]);

  const handleClassify = async () => {
    if (!window.desktop?.requirements) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.classify({
        projectId,
        requirementId,
      });

      if (res.ok) {
        setMetadata(res.data);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to classify requirement.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!window.desktop?.requirements) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await window.desktop.requirements.regenerateMetadata({
        projectId,
        requirementId,
      });

      if (res.ok) {
        setMetadata(res.data);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to regenerate metadata.');
    } finally {
      setActionLoading(false);
    }
  };

  const startEdit = () => {
    if (!metadata) return;
    setEditCategory(metadata.category);
    setEditSubCategory(metadata.subCategory ?? '');
    setEditDomain(metadata.domain ?? '');
    setEditModule(metadata.module ?? '');
    setEditBusinessCapability(metadata.businessCapability ?? '');
    setEditPriority(metadata.priority);
    setEditRiskLevel(metadata.riskLevel);
    setEditCriticality(metadata.criticality);
    setEditSecurity(metadata.securityRelevant);
    setEditPerformance(metadata.performanceRelevant);
    setEditCompliance(metadata.complianceRelevant);
    setEditTags(metadata.tags.join(', '));
    setIsEditing(true);
  };

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktop?.requirements) return;
    try {
      setActionLoading(true);
      setError(null);

      const parsedTags = editTags
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);

      const res = await window.desktop.requirements.updateMetadata({
        projectId,
        requirementId,
        category: editCategory,
        subCategory: editSubCategory ? (editSubCategory as RequirementSubCategory) : null,
        domain: editDomain.trim() || null,
        module: editModule.trim() || null,
        businessCapability: editBusinessCapability.trim() || null,
        priority: editPriority,
        riskLevel: editRiskLevel,
        criticality: editCriticality,
        securityRelevant: editSecurity,
        performanceRelevant: editPerformance,
        complianceRelevant: editCompliance,
        tags: parsedTags,
      });

      if (res.ok) {
        setMetadata(res.data);
        setIsEditing(false);
      } else {
        setError(res.error.message);
      }
    } catch {
      setError('Failed to update requirement metadata.');
    } finally {
      setActionLoading(false);
    }
  };

  const getPriorityBadgeClass = (p: RequirementPriority) => {
    switch (p) {
      case 'CRITICAL':
        return 'badge-critical';
      case 'HIGH':
        return 'badge-high';
      case 'MEDIUM':
        return 'badge-medium';
      case 'LOW':
        return 'badge-low';
      default:
        return 'badge-unspecified';
    }
  };

  const getRiskBadgeClass = (r: RequirementRiskLevel) => {
    switch (r) {
      case 'CRITICAL':
        return 'badge-critical';
      case 'HIGH':
        return 'badge-high';
      case 'MEDIUM':
        return 'badge-medium';
      case 'LOW':
        return 'badge-low';
      default:
        return 'badge-unspecified';
    }
  };

  if (loading) {
    return (
      <div className="representation-loading" data-testid="classification-loading">
        <span className="spinner" /> Loading requirement classification...
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="representation-empty" data-testid="classification-empty">
        <div className="empty-title">Requirement Not Classified</div>
        <p className="empty-description">
          This requirement does not yet have an active classification and metadata enrichment
          record.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleClassify}
          disabled={actionLoading}
          data-testid="classify-button"
        >
          {actionLoading ? 'Classifying...' : 'Classify Requirement'}
        </button>
        {error && <div className="error-banner">{error}</div>}
      </div>
    );
  }

  return (
    <div className="requirement-representation-container" data-testid="classification-view">
      {error && <div className="error-banner">{error}</div>}

      {/* Staleness Banner */}
      {metadata.isStale && (
        <div className="staleness-banner" data-testid="classification-stale-banner">
          <div className="staleness-icon">⚠️</div>
          <div className="staleness-content">
            <div className="staleness-title">Classification Metadata is Stale</div>
            <div className="staleness-desc">
              The original requirement wording has changed since this metadata was derived.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-warning"
            onClick={handleRegenerate}
            disabled={actionLoading}
            data-testid="reclassify-button"
          >
            {actionLoading ? 'Re-classifying...' : 'Re-classify'}
          </button>
        </div>
      )}

      {/* Header Info */}
      <div className="representation-header-bar">
        <div className="status-badges-group">
          <span className={`status-pill category-pill`} data-testid="category-badge">
            Category: {metadata.category}
          </span>
          {metadata.subCategory && (
            <span className="status-pill subcategory-pill" data-testid="subcategory-badge">
              Subcategory: {metadata.subCategory}
            </span>
          )}
          <span className={`status-pill priority-pill ${getPriorityBadgeClass(metadata.priority)}`}>
            Priority: {metadata.priority}
          </span>
          <span className={`status-pill risk-pill ${getRiskBadgeClass(metadata.riskLevel)}`}>
            Risk: {metadata.riskLevel}
          </span>
          <span className={`status-pill review-pill ${metadata.reviewStatus.toLowerCase()}`}>
            {metadata.reviewStatus === 'REVIEWED' ? 'Human Reviewed' : 'Auto Generated'}
          </span>
        </div>

        <div className="action-buttons-group">
          {!isEditing ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={startEdit}
                data-testid="edit-metadata-button"
              >
                Edit Metadata
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={handleRegenerate}
                disabled={actionLoading}
                title="Force deterministic re-computation"
                data-testid="regenerate-metadata-button"
              >
                Regenerate
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setIsEditing(false)}
            >
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      {/* Inline Review Editor */}
      {isEditing ? (
        <form
          onSubmit={handleSaveReview}
          className="representation-edit-form"
          data-testid="edit-metadata-form"
        >
          <div className="form-section-title">Review & Correct Metadata</div>

          <div className="form-row">
            <div className="form-col">
              <label>Category</label>
              <select
                value={editCategory}
                onChange={e => setEditCategory(e.target.value as RequirementCategory)}
                className="form-control"
              >
                <option value="FUNCTIONAL">FUNCTIONAL</option>
                <option value="NON_FUNCTIONAL">NON_FUNCTIONAL</option>
                <option value="BUSINESS_RULE">BUSINESS_RULE</option>
                <option value="INTERFACE">INTERFACE</option>
                <option value="DATA">DATA</option>
                <option value="COMPLIANCE">COMPLIANCE</option>
                <option value="CONSTRAINT">CONSTRAINT</option>
                <option value="UNKNOWN">UNKNOWN</option>
              </select>
            </div>

            <div className="form-col">
              <label>Subcategory</label>
              <select
                value={editSubCategory}
                onChange={e => setEditSubCategory(e.target.value as RequirementSubCategory | '')}
                className="form-control"
              >
                <option value="">None / N/A</option>
                <option value="PERFORMANCE">PERFORMANCE</option>
                <option value="SECURITY">SECURITY</option>
                <option value="USABILITY">USABILITY</option>
                <option value="RELIABILITY">RELIABILITY</option>
                <option value="AVAILABILITY">AVAILABILITY</option>
                <option value="SCALABILITY">SCALABILITY</option>
                <option value="MAINTAINABILITY">MAINTAINABILITY</option>
                <option value="ACCESSIBILITY">ACCESSIBILITY</option>
                <option value="COMPATIBILITY">COMPATIBILITY</option>
                <option value="PORTABILITY">PORTABILITY</option>
                <option value="OBSERVABILITY">OBSERVABILITY</option>
                <option value="RECOVERABILITY">RECOVERABILITY</option>
                <option value="RETENTION">RETENTION</option>
                <option value="INTEGRATION">INTEGRATION</option>
                <option value="TECHNICAL_CONSTRAINT">TECHNICAL_CONSTRAINT</option>
                <option value="BUSINESS_LOGIC">BUSINESS_LOGIC</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-col">
              <label>Domain</label>
              <input
                type="text"
                value={editDomain}
                onChange={e => setEditDomain(e.target.value)}
                className="form-control"
                placeholder="e.g. Authentication, Billing & Payments"
              />
            </div>
            <div className="form-col">
              <label>Module</label>
              <input
                type="text"
                value={editModule}
                onChange={e => setEditModule(e.target.value)}
                className="form-control"
                placeholder="e.g. Identity & Access, Checkout"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-col">
              <label>Priority</label>
              <select
                value={editPriority}
                onChange={e => setEditPriority(e.target.value as RequirementPriority)}
                className="form-control"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
                <option value="UNSPECIFIED">UNSPECIFIED</option>
              </select>
            </div>
            <div className="form-col">
              <label>Risk Level</label>
              <select
                value={editRiskLevel}
                onChange={e => setEditRiskLevel(e.target.value as RequirementRiskLevel)}
                className="form-control"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
                <option value="UNSPECIFIED">UNSPECIFIED</option>
              </select>
            </div>
            <div className="form-col">
              <label>Criticality</label>
              <select
                value={editCriticality}
                onChange={e => setEditCriticality(e.target.value as RequirementCriticality)}
                className="form-control"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
                <option value="UNSPECIFIED">UNSPECIFIED</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-col">
              <label>Tags (comma separated, max 10)</label>
              <input
                type="text"
                value={editTags}
                onChange={e => setEditTags(e.target.value)}
                className="form-control"
                placeholder="security, auth, password, encryption"
              />
            </div>
          </div>

          <div className="form-row flags-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={editSecurity}
                onChange={e => setEditSecurity(e.target.checked)}
              />
              Security Relevant
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={editPerformance}
                onChange={e => setEditPerformance(e.target.checked)}
              />
              Performance Relevant
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={editCompliance}
                onChange={e => setEditCompliance(e.target.checked)}
              />
              Compliance Relevant
            </label>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={actionLoading}
              data-testid="save-metadata-review-button"
            >
              {actionLoading ? 'Saving...' : 'Save Reviewed Metadata'}
            </button>
          </div>
        </form>
      ) : (
        /* Metadata Display Grid */
        <div className="representation-grid">
          {/* Domain & Capability Card */}
          <div className="representation-card">
            <div className="card-header">Domain & Business Scope</div>
            <div className="card-body">
              <div className="meta-field">
                <span className="field-label">Domain:</span>
                <span className="field-value">{metadata.domain || 'Not specified'}</span>
              </div>
              <div className="meta-field">
                <span className="field-label">Module:</span>
                <span className="field-value">{metadata.module || 'Not specified'}</span>
              </div>
              {metadata.businessCapability && (
                <div className="meta-field">
                  <span className="field-label">Capability:</span>
                  <span className="field-value">{metadata.businessCapability}</span>
                </div>
              )}
            </div>
          </div>

          {/* Relevance Flags & Standards Card */}
          <div className="representation-card">
            <div className="card-header">Quality Dimensions & Relevance</div>
            <div className="card-body">
              <div className="flags-group">
                <span
                  className={`flag-chip ${metadata.securityRelevant ? 'flag-active' : 'flag-inactive'}`}
                >
                  🔒 Security: {metadata.securityRelevant ? 'Relevant' : 'No'}
                </span>
                <span
                  className={`flag-chip ${metadata.performanceRelevant ? 'flag-active' : 'flag-inactive'}`}
                >
                  ⚡ Performance: {metadata.performanceRelevant ? 'Relevant' : 'No'}
                </span>
                <span
                  className={`flag-chip ${metadata.complianceRelevant ? 'flag-active' : 'flag-inactive'}`}
                >
                  📜 Compliance: {metadata.complianceRelevant ? 'Relevant' : 'No'}
                </span>
              </div>

              {metadata.complianceStandards.length > 0 && (
                <div className="standards-list" style={{ marginTop: '8px' }}>
                  <span className="field-label">Standards:</span>
                  <div className="chips-list">
                    {metadata.complianceStandards.map((std, idx) => (
                      <span key={idx} className="clause-chip standard-chip">
                        {std}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actors & Tags Card */}
          <div className="representation-card">
            <div className="card-header">Actors & Tags</div>
            <div className="card-body">
              <div className="meta-field">
                <span className="field-label">Actors:</span>
                {metadata.actors.length > 0 ? (
                  <div className="chips-list">
                    {metadata.actors.map((act, idx) => (
                      <span key={idx} className="clause-chip actor-chip">
                        {act}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="field-value field-empty">None identified</span>
                )}
              </div>

              <div className="meta-field" style={{ marginTop: '8px' }}>
                <span className="field-label">Tags:</span>
                {metadata.tags.length > 0 ? (
                  <div className="chips-list">
                    {metadata.tags.map((tag, idx) => (
                      <span key={idx} className="clause-chip tag-chip">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="field-value field-empty">No tags</span>
                )}
              </div>
            </div>
          </div>

          {/* Detection Reasons Card */}
          <div className="representation-card">
            <div className="card-header">Classification Reasons & Evidence</div>
            <div className="card-body">
              {metadata.reasons.length > 0 ? (
                <ul className="warnings-list" style={{ margin: 0, paddingLeft: '20px' }}>
                  {metadata.reasons.map((reason, idx) => (
                    <li key={idx} className="reason-item">
                      <code>{reason}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="field-value field-empty">No reason codes recorded</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metadata Audit Footer */}
      <div className="representation-footer">
        <span>
          Classifier: <code>{metadata.classifierVersion}</code>
        </span>
        <span>
          Method: <code>{metadata.classificationMethod}</code>
        </span>
        <span>
          Source Hash: <code>{metadata.sourceRequirementTextSha256.substring(0, 12)}...</code>
        </span>
      </div>
    </div>
  );
};
