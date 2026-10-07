/**
 * @file apps/desktop/src/renderer/screens/projects/ProjectEnvironmentsDialog.tsx
 * Dialog modal for managing deployment and test environments for a project (V5 Phase 59).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '../../ui/Dialog.js';
import { Table } from '../../ui/Table.js';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { FormField } from '../../ui/FormField.js';
import { Input } from '../../ui/Input.js';
import { Select } from '../../ui/Select.js';
import { Alert } from '../../ui/Alert.js';
import { Spinner } from '../../ui/Spinner.js';
import { EmptyState } from '../../ui/EmptyState.js';
import { useProject } from '../../context/ProjectContext.js';
import type {
  ProjectSummary,
  ProjectDetails,
  ProjectEnvironmentDto,
  EnvironmentType,
  ProductionSafetyPolicy,
  BrowserEngine,
  EnvironmentReachabilityResultDto,
  TargetApplicationDto,
} from '@ai-quality/contracts';
import { AuthProfilesModal } from '../../features/environments/AuthProfilesModal.js';

export interface ProjectEnvironmentsDialogProps {
  readonly project: ProjectSummary | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

const ENVIRONMENT_TYPES: readonly { readonly value: EnvironmentType; readonly label: string }[] = [
  { value: 'DEVELOPMENT', label: 'Development' },
  { value: 'LOCAL', label: 'Local (localhost / 127.0.0.1)' },
  { value: 'TEST', label: 'Test' },
  { value: 'QA', label: 'QA' },
  { value: 'STAGING', label: 'Staging' },
  { value: 'UAT', label: 'UAT' },
  { value: 'PRODUCTION', label: 'Production' },
  { value: 'CUSTOM', label: 'Custom' },
];

const PRODUCTION_SAFETY_POLICIES: readonly {
  readonly value: ProductionSafetyPolicy;
  readonly label: string;
}[] = [
  { value: 'PROHIBITED', label: 'Prohibited (Execution Blocked)' },
  { value: 'MANUAL_APPROVAL_REQUIRED', label: 'Manual Approval Required' },
  { value: 'SAFE_MODE', label: 'Safe Mode (Read-Only / Non-Destructive)' },
];

const BROWSER_ENGINES: readonly { readonly value: BrowserEngine; readonly label: string }[] = [
  { value: 'chromium', label: 'Chromium (Default)' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'webkit', label: 'WebKit (Safari engine)' },
];

export function ProjectEnvironmentsDialog({
  project,
  isOpen,
  onClose,
}: ProjectEnvironmentsDialogProps): React.JSX.Element {
  const { refreshProjects } = useProject();

  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [targetApp, setTargetApp] = useState<TargetApplicationDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Target App Edit State
  const [isEditingTargetApp, setIsEditingTargetApp] = useState(false);
  const [targetAppName, setTargetAppName] = useState('');
  const [targetAppDesc, setTargetAppDesc] = useState('');

  // Form State for Add / Edit Environment
  const [isAdding, setIsAdding] = useState(false);
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [envName, setEnvName] = useState('');
  const [envType, setEnvType] = useState<EnvironmentType>('DEVELOPMENT');
  const [envBaseUrl, setEnvBaseUrl] = useState('');
  const [isProduction, setIsProduction] = useState(false);
  const [safetyPolicy, setSafetyPolicy] = useState<ProductionSafetyPolicy>('PROHIBITED');
  const [browserEngine, setBrowserEngine] = useState<BrowserEngine>('chromium');
  const [headless, setHeadless] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [viewportHeight, setViewportHeight] = useState(720);
  const [ignoreHttpsErrors, setIgnoreHttpsErrors] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Preflight Reachability State
  const [preflightResults, setPreflightResults] = useState<
    Record<string, EnvironmentReachabilityResultDto>
  >({});
  const [checkingReachabilityId, setCheckingReachabilityId] = useState<string | null>(null);

  // Delete Confirmation State
  const [deletingEnv, setDeletingEnv] = useState<ProjectEnvironmentDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auth Profiles Modal State
  const [isAuthProfilesOpen, setIsAuthProfilesOpen] = useState(false);

  const fetchDetailsAndApp = useCallback(async () => {
    if (!project?.id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (window.desktop?.projects?.get) {
        const res = await window.desktop.projects.get(project.id);
        if (res.ok) {
          setDetails(res.data);
        } else {
          setErrorMessage(res.error.message);
        }
      }

      if (window.desktop?.targetApplications?.get) {
        const appRes = await window.desktop.targetApplications.get(project.id);
        if (appRes.ok) {
          setTargetApp(appRes.data);
          setTargetAppName(appRes.data.name);
          setTargetAppDesc(appRes.data.description ?? '');
        }
      }
    } catch {
      setErrorMessage('Failed to load project and target application details.');
    } finally {
      setIsLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    if (isOpen && project) {
      void fetchDetailsAndApp();
      setIsAdding(false);
      setEditingEnvId(null);
      setIsEditingTargetApp(false);
      setErrorMessage(null);
      setFormError(null);
      setPreflightResults({});
    }
  }, [isOpen, project, fetchDetailsAndApp]);

  const resetForm = () => {
    setIsAdding(false);
    setEditingEnvId(null);
    setEnvName('');
    setEnvType('DEVELOPMENT');
    setEnvBaseUrl('');
    setIsProduction(false);
    setSafetyPolicy('PROHIBITED');
    setBrowserEngine('chromium');
    setHeadless(true);
    setViewportWidth(1280);
    setViewportHeight(720);
    setIgnoreHttpsErrors(false);
    setIsEnabled(true);
    setNotes('');
    setFormError(null);
  };

  const handleStartAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleStartEdit = (env: ProjectEnvironmentDto) => {
    resetForm();
    setEditingEnvId(env.id);
    setEnvName(env.name);
    setEnvType(env.type);
    setEnvBaseUrl(env.baseUrl ?? '');
    setIsProduction(env.isProduction);
    setSafetyPolicy(env.productionSafetyPolicy ?? 'PROHIBITED');
    setBrowserEngine(env.browserEngine ?? 'chromium');
    setHeadless(env.headless ?? true);
    setViewportWidth(env.viewportWidth ?? 1280);
    setViewportHeight(env.viewportHeight ?? 720);
    setIgnoreHttpsErrors(env.ignoreHttpsErrors ?? false);
    setIsEnabled(env.isEnabled ?? true);
    setNotes(env.notes ?? '');
  };

  const handleSaveTargetApp = async () => {
    if (!project || !window.desktop?.targetApplications?.update) return;
    try {
      const res = await window.desktop.targetApplications.update({
        projectId: project.id,
        name: targetAppName.trim() || project.name,
        description: targetAppDesc.trim() || null,
      });
      if (res.ok) {
        setTargetApp(res.data);
        setIsEditingTargetApp(false);
      } else {
        setErrorMessage(res.error.message);
      }
    } catch {
      setErrorMessage('Failed to update target application.');
    }
  };

  const handleCheckReachability = async (envId?: string, urlToCheck?: string) => {
    if (!project || !window.desktop?.environments?.checkReachability) return;
    const checkKey = envId || 'form-preview';
    setCheckingReachabilityId(checkKey);
    try {
      const res = await window.desktop.environments.checkReachability({
        projectId: project.id,
        environmentId: envId,
        targetUrl: urlToCheck || (envBaseUrl.trim() ? envBaseUrl.trim() : undefined),
        ignoreHttpsErrors,
      });
      if (res.ok) {
        setPreflightResults(prev => ({ ...prev, [checkKey]: res.data }));
      } else {
        setPreflightResults(prev => ({
          ...prev,
          [checkKey]: {
            status: 'UNREACHABLE',
            statusCode: null,
            statusText: null,
            requestedUrl: urlToCheck || envBaseUrl,
            finalUrl: null,
            responseTimeMs: 0,
            redirectCount: 0,
            message: res.error.message,
            checkedAt: new Date().toISOString(),
          },
        }));
      }
    } catch {
      setPreflightResults(prev => ({
        ...prev,
        [checkKey]: {
          status: 'UNREACHABLE',
          statusCode: null,
          statusText: null,
          requestedUrl: urlToCheck || envBaseUrl,
          finalUrl: null,
          responseTimeMs: 0,
          redirectCount: 0,
          message: 'Connection check failed unexpectedly.',
          checkedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setCheckingReachabilityId(null);
    }
  };

  const handleSaveEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || isSubmitting) return;

    const trimmedName = envName.trim();
    if (!trimmedName) {
      setFormError('Environment name is required.');
      return;
    }
    if (trimmedName.length > 80) {
      setFormError('Environment name must be 80 characters or fewer.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      if (editingEnvId) {
        if (!window.desktop?.environments?.update) {
          throw new Error('Environment updates are not supported.');
        }
        const res = await window.desktop.environments.update({
          projectId: project.id,
          environmentId: editingEnvId,
          name: trimmedName,
          type: envType,
          baseUrl: envBaseUrl.trim() || null,
          isProduction,
          productionSafetyPolicy: isProduction ? safetyPolicy : 'PROHIBITED',
          browserEngine,
          headless,
          viewportWidth: Number(viewportWidth) || 1280,
          viewportHeight: Number(viewportHeight) || 720,
          ignoreHttpsErrors,
          isEnabled,
          notes: notes.trim() || null,
        });
        if (!res.ok) {
          setFormError(res.error.message);
          setIsSubmitting(false);
          return;
        }
      } else {
        if (!window.desktop?.environments?.create) {
          throw new Error('Environment creation is not supported.');
        }
        const res = await window.desktop.environments.create({
          projectId: project.id,
          name: trimmedName,
          type: envType,
          baseUrl: envBaseUrl.trim() || null,
          isProduction,
          productionSafetyPolicy: isProduction ? safetyPolicy : 'PROHIBITED',
          browserEngine,
          headless,
          viewportWidth: Number(viewportWidth) || 1280,
          viewportHeight: Number(viewportHeight) || 720,
          ignoreHttpsErrors,
          isEnabled,
          notes: notes.trim() || null,
        });
        if (!res.ok) {
          setFormError(res.error.message);
          setIsSubmitting(false);
          return;
        }
      }

      resetForm();
      await fetchDetailsAndApp();
      await refreshProjects();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (envId: string) => {
    if (!project || !window.desktop?.environments?.setDefault) return;
    try {
      const res = await window.desktop.environments.setDefault({
        projectId: project.id,
        environmentId: envId,
      });
      if (res.ok) {
        await fetchDetailsAndApp();
        await refreshProjects();
      } else {
        setErrorMessage(res.error.message);
      }
    } catch {
      setErrorMessage('Failed to set default environment.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!project || !deletingEnv || !window.desktop?.environments?.delete) return;
    setIsDeleting(true);
    try {
      const res = await window.desktop.environments.delete({
        projectId: project.id,
        environmentId: deletingEnv.id,
      });
      if (res.ok) {
        setDeletingEnv(null);
        await fetchDetailsAndApp();
        await refreshProjects();
      } else {
        setErrorMessage(res.error.message);
      }
    } catch {
      setErrorMessage('Failed to delete environment.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog
        open={isOpen && Boolean(project)}
        onClose={onClose}
        title={`Target App & Environments: ${project?.name ?? ''}`}
        description="Configure target web applications, URLs, browsers, viewports, and execution safeguards."
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            {!isAdding && !editingEnvId ? (
              <Button variant="secondary" size="sm" onClick={handleStartAdd}>
                + Add Environment
              </Button>
            ) : (
              <div />
            )}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        }
      >
        {errorMessage && (
          <div style={{ marginBottom: '16px' }}>
            <Alert variant="danger" title="Configuration Error">
              {errorMessage}
            </Alert>
          </div>
        )}

        {/* Target Application Header Section */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '6px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div
                style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  fontWeight: 600,
                }}
              >
                Target Web Application
              </div>
              <div
                style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}
              >
                {targetApp?.name || project?.name || 'Main Application'}
              </div>
              {targetApp?.description && (
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--color-text-secondary)',
                    marginTop: '2px',
                  }}
                >
                  {targetApp.description}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" size="sm" onClick={() => setIsAuthProfilesOpen(true)}>
                Auth Profiles
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingTargetApp(prev => !prev)}
              >
                {isEditingTargetApp ? 'Cancel' : 'Edit App Info'}
              </Button>
            </div>
          </div>

          {isEditingTargetApp && (
            <div
              style={{
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Input
                  value={targetAppName}
                  onChange={e => setTargetAppName(e.target.value)}
                  placeholder="Application Name"
                  sizeVariant="sm"
                />
                <Input
                  value={targetAppDesc}
                  onChange={e => setTargetAppDesc(e.target.value)}
                  placeholder="Optional description"
                  sizeVariant="sm"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <Button variant="primary" size="sm" onClick={handleSaveTargetApp}>
                  Save Application Info
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Add / Edit Environment Form */}
        {(isAdding || editingEnvId) && (
          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '6px',
              marginBottom: '20px',
            }}
          >
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
              {editingEnvId ? 'Edit Environment' : 'New Environment'}
            </h4>

            {formError && (
              <div style={{ marginBottom: '12px' }}>
                <Alert variant="danger">{formError}</Alert>
              </div>
            )}

            <form onSubmit={handleSaveEnvironment} noValidate>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <FormField
                  label="Environment Name"
                  htmlFor="env-name-input"
                  required
                  description="e.g. Local Dev, Staging, QA"
                >
                  <Input
                    id="env-name-input"
                    value={envName}
                    onChange={e => setEnvName(e.target.value)}
                    placeholder="e.g. Local Dev"
                    disabled={isSubmitting}
                    autoFocus
                  />
                </FormField>

                <FormField label="Environment Type" htmlFor="env-type-select" required>
                  <Select
                    id="env-type-select"
                    value={envType}
                    onChange={e => {
                      const val = e.target.value as EnvironmentType;
                      setEnvType(val);
                      if (val === 'PRODUCTION') {
                        setIsProduction(true);
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    {ENVIRONMENT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>

              <div style={{ marginTop: '8px' }}>
                <FormField
                  label="Base URL"
                  htmlFor="env-baseurl-input"
                  description="Target application address (e.g. http://localhost:3000, https://staging.example.com)."
                >
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Input
                      id="env-baseurl-input"
                      value={envBaseUrl}
                      onChange={e => setEnvBaseUrl(e.target.value)}
                      placeholder="https://staging.example.com"
                      disabled={isSubmitting}
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCheckReachability(editingEnvId ?? undefined, envBaseUrl)}
                      loading={checkingReachabilityId === (editingEnvId || 'form-preview')}
                      disabled={!envBaseUrl.trim() || isSubmitting}
                    >
                      Check Connection
                    </Button>
                  </div>
                </FormField>

                {/* Preflight Reachability Result Banner in Form */}
                {(() => {
                  const formReachability = preflightResults[editingEnvId || 'form-preview'];
                  if (!formReachability) return null;
                  return (
                    <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                      <Alert
                        variant={
                          formReachability.status === 'REACHABLE'
                            ? 'success'
                            : formReachability.status === 'AUTHENTICATION_REQUIRED'
                              ? 'warning'
                              : 'danger'
                        }
                        title={`Reachability: ${formReachability.status}`}
                      >
                        {formReachability.message}
                        {formReachability.responseTimeMs > 0 && (
                          <span style={{ marginLeft: '8px', opacity: 0.8 }}>
                            ({formReachability.responseTimeMs}ms)
                          </span>
                        )}
                      </Alert>
                    </div>
                  );
                })()}
              </div>

              {/* Browser & Viewport Configuration Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '12px',
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: 'var(--color-bg-subtle)',
                  borderRadius: '4px',
                }}
              >
                <FormField label="Browser Engine" htmlFor="env-browser-select">
                  <Select
                    id="env-browser-select"
                    value={browserEngine}
                    onChange={e => setBrowserEngine(e.target.value as BrowserEngine)}
                    disabled={isSubmitting}
                  >
                    {BROWSER_ENGINES.map(b => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="Viewport Width" htmlFor="env-width-input">
                  <Input
                    id="env-width-input"
                    type="number"
                    value={viewportWidth}
                    onChange={e => setViewportWidth(Number(e.target.value))}
                    min={320}
                    max={3840}
                    disabled={isSubmitting}
                  />
                </FormField>

                <FormField label="Viewport Height" htmlFor="env-height-input">
                  <Input
                    id="env-height-input"
                    type="number"
                    value={viewportHeight}
                    onChange={e => setViewportHeight(Number(e.target.value))}
                    min={240}
                    max={2160}
                    disabled={isSubmitting}
                  />
                </FormField>
              </div>

              {/* Checkboxes & Policies */}
              <div
                style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={headless}
                      onChange={e => setHeadless(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    Headless Execution
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ignoreHttpsErrors}
                      onChange={e => setIgnoreHttpsErrors(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    Trust Self-Signed Certificates (Ignore HTTPS Errors)
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={e => setIsEnabled(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    Environment Enabled
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      color: 'var(--color-danger)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isProduction}
                      onChange={e => setIsProduction(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    Production Environment
                  </label>
                </div>

                {isProduction && (
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid var(--color-danger)',
                      borderRadius: '4px',
                      marginTop: '4px',
                    }}
                  >
                    <FormField
                      label="Production Safety Policy"
                      htmlFor="env-safety-policy"
                      required
                      description="Safeguard policy for tests executing against production."
                    >
                      <Select
                        id="env-safety-policy"
                        value={safetyPolicy}
                        onChange={e => setSafetyPolicy(e.target.value as ProductionSafetyPolicy)}
                        disabled={isSubmitting}
                      >
                        {PRODUCTION_SAFETY_POLICIES.map(p => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '12px' }}>
                <FormField label="Notes / Description" htmlFor="env-notes-input">
                  <Input
                    id="env-notes-input"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Optional notes regarding this test target."
                    disabled={isSubmitting}
                  />
                </FormField>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '16px',
                }}
              >
                <Button variant="ghost" size="sm" onClick={resetForm} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  {editingEnvId ? 'Save Changes' : 'Create Environment'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Environments Table */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
            <Spinner size="md" />
          </div>
        ) : details?.environments.length === 0 ? (
          <EmptyState
            title="No Environments Configured"
            description="Add an environment such as Local Dev or Staging to configure target test URLs."
            action={
              !isAdding && !editingEnvId ? (
                <Button variant="primary" size="sm" onClick={handleStartAdd}>
                  Add First Environment
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Base URL</th>
                <th>Browser / Runtime</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {details?.environments.map(env => {
                const reachability = preflightResults[env.id];
                return (
                  <tr key={env.id} style={{ opacity: env.isEnabled ? 1 : 0.5 }}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{env.name}</div>
                      {env.isDefault && (
                        <Badge variant="success" style={{ marginTop: '2px', fontSize: '10px' }}>
                          Default Target
                        </Badge>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <Badge
                          variant={
                            env.isProduction || env.type === 'PRODUCTION' ? 'danger' : 'neutral'
                          }
                        >
                          {env.type}
                        </Badge>
                        {env.isProduction && (
                          <span style={{ fontSize: '10px', color: 'var(--color-danger)' }}>
                            PROD ({env.productionSafetyPolicy})
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div
                        style={{
                          color: env.baseUrl
                            ? 'var(--color-text-primary)'
                            : 'var(--color-text-muted)',
                        }}
                      >
                        {env.baseUrl || '—'}
                      </div>
                      {reachability && (
                        <div style={{ fontSize: '11px', marginTop: '2px' }}>
                          <Badge
                            variant={
                              reachability.status === 'REACHABLE'
                                ? 'success'
                                : reachability.status === 'AUTHENTICATION_REQUIRED'
                                  ? 'warning'
                                  : 'danger'
                            }
                          >
                            {reachability.status}{' '}
                            {reachability.statusCode ? `(${reachability.statusCode})` : ''}
                          </Badge>
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      <div>
                        {env.browserEngine || 'chromium'} • {env.viewportWidth || 1280}×
                        {env.viewportHeight || 720}
                      </div>
                      <div>{env.headless ? 'Headless' : 'Headed'}</div>
                    </td>
                    <td>
                      <Badge variant={env.isEnabled ? 'neutral' : 'warning'}>
                        {env.isEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        {env.baseUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleCheckReachability(env.id, env.baseUrl ?? undefined)
                            }
                            loading={checkingReachabilityId === env.id}
                            title="Verify target reachability"
                          >
                            Ping
                          </Button>
                        )}
                        {!env.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefault(env.id)}
                            title="Set this environment as the project default"
                          >
                            Make Default
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(env)}
                          disabled={isAdding || Boolean(editingEnvId)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeletingEnv(env)}
                          disabled={isAdding || Boolean(editingEnvId)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Dialog>

      {/* Delete Environment Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingEnv)}
        onClose={() => setDeletingEnv(null)}
        title="Delete Environment?"
        description={`Are you sure you want to delete environment "${deletingEnv?.name ?? ''}"?`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="ghost" onClick={() => setDeletingEnv(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirm}
              loading={isDeleting}
              disabled={isDeleting}
            >
              Delete Environment
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          This will remove the environment from the project. If this was the default environment,
          the project will temporarily have no default environment until another is selected.
        </p>
      </Dialog>

      {/* Authentication Profiles Modal */}
      {project?.id && (
        <AuthProfilesModal
          projectId={project.id}
          environments={details?.environments ?? []}
          isOpen={isAuthProfilesOpen}
          onClose={() => setIsAuthProfilesOpen(false)}
          defaultEnvironmentId={details?.environments.find(e => e.isDefault)?.id}
        />
      )}
    </>
  );
}
