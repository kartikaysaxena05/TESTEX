/**
 * @file apps/desktop/src/renderer/features/jira/JiraIntegrationSettingsCard.tsx
 * Jira Integration Foundation & Configuration settings panel for configuring connections,
 * discovering project metadata, mapping project profiles, detecting staleness, and verifying health.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  JiraConnectionDto,
  JiraValidationResultDto,
  JiraConnectionAuditDto,
  JiraConnectionStatus,
  JiraProjectConfigDto,
  JiraProjectConfigStatus,
  JiraAssigneeStrategy,
  JiraDiscoveredProjectDto,
  JiraDiscoveredIssueTypeDto,
  JiraDiscoveredPriorityDto,
  JiraDiscoveredComponentDto,
  JiraDiscoveredAssigneeDto,
  JiraDiscoveredFieldDto,
  JiraHealthCheckResultDto,
} from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  FormField,
  Alert,
  Spinner,
  Dialog,
  Separator,
} from '../../ui/index.js';

export interface JiraIntegrationSettingsCardProps {
  readonly projectId: string | null;
}

export function JiraIntegrationSettingsCard({ projectId }: JiraIntegrationSettingsCardProps) {
  const [connection, setConnection] = useState<JiraConnectionDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [displayName, setDisplayName] = useState<string>('Jira Cloud Integration');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [accountIdentifier, setAccountIdentifier] = useState<string>('');
  const [apiToken, setApiToken] = useState<string>('');

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<readonly JiraConnectionAuditDto[]>([]);
  const [showAuditDialog, setShowAuditDialog] = useState<boolean>(false);

  // Phase 90: Project Configuration states
  const [projectConfig, setProjectConfig] = useState<JiraProjectConfigDto | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [isRefreshingConfig, setIsRefreshingConfig] = useState<boolean>(false);
  const [configErrorMessage, setConfigErrorMessage] = useState<string | null>(null);
  const [configSuccessMessage, setConfigSuccessMessage] = useState<string | null>(null);

  // Discovery options
  const [discoveredProjects, setDiscoveredProjects] = useState<readonly JiraDiscoveredProjectDto[]>(
    [],
  );
  const [discoveredIssueTypes, setDiscoveredIssueTypes] = useState<
    readonly JiraDiscoveredIssueTypeDto[]
  >([]);
  const [discoveredPriorities, setDiscoveredPriorities] = useState<
    readonly JiraDiscoveredPriorityDto[]
  >([]);
  const [discoveredComponents, setDiscoveredComponents] = useState<
    readonly JiraDiscoveredComponentDto[]
  >([]);
  const [discoveredAssignees, setDiscoveredAssignees] = useState<
    readonly JiraDiscoveredAssigneeDto[]
  >([]);
  const [discoveredFields, setDiscoveredFields] = useState<readonly JiraDiscoveredFieldDto[]>([]);
  const [isLoadingDiscovery, setIsLoadingDiscovery] = useState<boolean>(false);

  // Project configuration form fields
  const [selectedJiraProjectId, setSelectedJiraProjectId] = useState<string>('');
  const [selectedJiraProjectKey, setSelectedJiraProjectKey] = useState<string>('');
  const [selectedJiraProjectName, setSelectedJiraProjectName] = useState<string>('');
  const [selectedIssueTypeId, setSelectedIssueTypeId] = useState<string>('');
  const [selectedIssueTypeName, setSelectedIssueTypeName] = useState<string>('');
  const [defaultPriorityId, setDefaultPriorityId] = useState<string>('');
  const [defaultPriorityName, setDefaultPriorityName] = useState<string>('');
  const [defaultComponentId, setDefaultComponentId] = useState<string>('');
  const [defaultComponentName, setDefaultComponentName] = useState<string>('');
  const [assigneeStrategy, setAssigneeStrategy] = useState<JiraAssigneeStrategy>('UNASSIGNED');
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string>('');
  const [defaultAssigneeName, setDefaultAssigneeName] = useState<string>('');

  // Health check states
  const [isTestingHealth, setIsTestingHealth] = useState<boolean>(false);
  const [healthCheckResult, setHealthCheckResult] = useState<JiraHealthCheckResultDto | null>(null);
  const [showHealthDialog, setShowHealthDialog] = useState<boolean>(false);

  // Race condition guard ref
  const currentProjectIdRef = useRef<string | null>(projectId);
  currentProjectIdRef.current = projectId;

  // Load project configuration
  const loadProjectConfig = useCallback(async (targetProjectId: string) => {
    if (!window.desktop?.jira?.getProjectConfig) return;
    setIsConfigLoading(true);
    try {
      const res = await window.desktop.jira.getProjectConfig({ projectId: targetProjectId });
      if (currentProjectIdRef.current !== targetProjectId) return;
      if (res.ok) {
        setProjectConfig(res.data);
        if (res.data) {
          setSelectedJiraProjectId(res.data.jiraProjectId);
          setSelectedJiraProjectKey(res.data.jiraProjectKey);
          setSelectedJiraProjectName(res.data.jiraProjectName);
          setSelectedIssueTypeId(res.data.selectedIssueTypeId);
          setSelectedIssueTypeName(res.data.selectedIssueTypeName);
          setDefaultPriorityId(res.data.defaultPriorityId ?? '');
          setDefaultPriorityName(res.data.defaultPriorityName ?? '');
          setDefaultComponentId(res.data.defaultComponentId ?? '');
          setDefaultComponentName(res.data.defaultComponentName ?? '');
          setAssigneeStrategy(res.data.assigneeStrategy);
          setDefaultAssigneeId(res.data.defaultAssigneeId ?? '');
          setDefaultAssigneeName(res.data.defaultAssigneeName ?? '');
        }
      }
    } catch {
      // Non-fatal
    } finally {
      if (currentProjectIdRef.current === targetProjectId) {
        setIsConfigLoading(false);
      }
    }
  }, []);

  // Load project-scoped discovery items (issue types, components, assignees)
  const loadProjectScopedDiscovery = useCallback(
    async (targetProjectId: string, jiraProjectIdOrKey: string, jiraKey?: string) => {
      if (!window.desktop?.jira) return;
      setIsLoadingDiscovery(true);
      try {
        const [itRes, compRes] = await Promise.all([
          window.desktop.jira.discoverIssueTypes({
            projectId: targetProjectId,
            jiraProjectIdOrKey,
          }),
          window.desktop.jira.discoverComponents({
            projectId: targetProjectId,
            jiraProjectIdOrKey,
          }),
        ]);

        if (currentProjectIdRef.current !== targetProjectId) return;

        if (itRes.ok) {
          setDiscoveredIssueTypes(itRes.data);
          if (!selectedIssueTypeId && itRes.data.length > 0 && itRes.data[0]) {
            setSelectedIssueTypeId(itRes.data[0].id);
            setSelectedIssueTypeName(itRes.data[0].name);
          }
        }
        if (compRes.ok) {
          setDiscoveredComponents(compRes.data);
        }

        const projectKeyToUse = jiraKey || jiraProjectIdOrKey;
        const assigneesRes = await window.desktop.jira.discoverAssignees({
          projectId: targetProjectId,
          jiraProjectKey: projectKeyToUse,
        });

        if (currentProjectIdRef.current !== targetProjectId) return;
        if (assigneesRes.ok) {
          setDiscoveredAssignees(assigneesRes.data);
        }
      } catch {
        // Handled silently
      } finally {
        if (currentProjectIdRef.current === targetProjectId) {
          setIsLoadingDiscovery(false);
        }
      }
    },
    [selectedIssueTypeId],
  );

  // Load global discovery items (projects, priorities, fields)
  const loadGlobalDiscovery = useCallback(async (targetProjectId: string) => {
    if (!window.desktop?.jira) return;
    try {
      const [projRes, prioRes, fieldsRes] = await Promise.all([
        window.desktop.jira.discoverProjects({ projectId: targetProjectId }),
        window.desktop.jira.discoverPriorities({ projectId: targetProjectId }),
        window.desktop.jira.discoverFields({ projectId: targetProjectId }),
      ]);

      if (currentProjectIdRef.current !== targetProjectId) return;

      if (projRes.ok) {
        setDiscoveredProjects(projRes.data);
      }
      if (prioRes.ok) {
        setDiscoveredPriorities(prioRes.data);
      }
      if (fieldsRes.ok) {
        setDiscoveredFields(fieldsRes.data);
      }
    } catch {
      // Ignore
    }
  }, []);

  const loadConnection = useCallback(
    async (targetProjectId: string) => {
      if (!window.desktop?.jira?.getConnection) return;

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const res = await window.desktop.jira.getConnection({ projectId: targetProjectId });
        if (currentProjectIdRef.current !== targetProjectId) return;

        if (res.ok) {
          setConnection(res.data);
          if (res.data) {
            setDisplayName(res.data.displayName);
            setBaseUrl(res.data.baseUrl);
            setAccountIdentifier(res.data.accountIdentifier);
            setApiToken(''); // NEVER repopulate plaintext token

            if (res.data.connectionStatus === 'CONNECTED') {
              void loadGlobalDiscovery(targetProjectId);
              void loadProjectConfig(targetProjectId);
            }
          } else {
            setDisplayName('Jira Cloud Integration');
            setBaseUrl('');
            setAccountIdentifier('');
            setApiToken('');
            setProjectConfig(null);
          }
        } else {
          setErrorMessage(res.error.message);
        }
      } catch (err) {
        if (currentProjectIdRef.current !== targetProjectId) return;
        setErrorMessage(err instanceof Error ? err.message : String(err));
      } finally {
        if (currentProjectIdRef.current === targetProjectId) {
          setIsLoading(false);
        }
      }
    },
    [loadGlobalDiscovery, loadProjectConfig],
  );

  useEffect(() => {
    if (projectId) {
      void loadConnection(projectId);
    } else {
      setConnection(null);
      setProjectConfig(null);
    }
  }, [projectId, loadConnection]);

  // Load project-scoped discovery when a project is selected
  useEffect(() => {
    if (projectId && selectedJiraProjectId) {
      void loadProjectScopedDiscovery(projectId, selectedJiraProjectId, selectedJiraProjectKey);
    }
  }, [projectId, selectedJiraProjectId, selectedJiraProjectKey, loadProjectScopedDiscovery]);

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !window.desktop?.jira) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (connection) {
        const res = await window.desktop.jira.updateConnection({
          projectId,
          connectionId: connection.id,
          displayName: displayName.trim(),
          baseUrl: baseUrl.trim(),
          accountIdentifier: accountIdentifier.trim(),
          apiToken: apiToken.trim() ? apiToken.trim() : undefined,
        });

        if (currentProjectIdRef.current !== projectId) return;

        if (res.ok) {
          setConnection(res.data);
          setApiToken('');
          setSuccessMessage('Jira connection updated successfully.');
        } else {
          setErrorMessage(res.error.message);
        }
      } else {
        if (!apiToken.trim()) {
          setErrorMessage('API token is required for new Jira connections.');
          setIsSaving(false);
          return;
        }

        const res = await window.desktop.jira.createConnection({
          projectId,
          displayName: displayName.trim() || 'Jira Cloud Integration',
          baseUrl: baseUrl.trim(),
          accountIdentifier: accountIdentifier.trim(),
          apiToken: apiToken.trim(),
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
        });

        if (currentProjectIdRef.current !== projectId) return;

        if (res.ok) {
          setConnection(res.data);
          setApiToken('');
          setSuccessMessage('Jira connection created successfully.');
        } else {
          setErrorMessage(res.error.message);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidateConnection = async () => {
    if (!projectId || !connection || !window.desktop?.jira) return;

    setIsValidating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await window.desktop.jira.validateConnection({
        projectId,
        connectionId: connection.id,
      });

      if (currentProjectIdRef.current !== projectId) return;

      if (res.ok) {
        const result: JiraValidationResultDto = res.data;
        if (result.status === 'CONNECTED') {
          setSuccessMessage(
            `Connection verified! Authenticated as ${result.accountIdentity?.displayName || result.accountIdentity?.emailAddress || 'Jira User'} (${result.durationMs}ms).`,
          );
          void loadGlobalDiscovery(projectId);
        } else {
          setErrorMessage(
            `Validation failed (${result.status}): ${result.errorMessage || result.errorCode || 'Unknown issue.'}`,
          );
        }
        await loadConnection(projectId);
      } else {
        setErrorMessage(res.error.message);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsValidating(false);
    }
  };

  const handleDeleteConnection = async () => {
    if (!projectId || !connection || !window.desktop?.jira) return;

    setIsDeleting(true);
    try {
      const res = await window.desktop.jira.deleteConnection({
        projectId,
        connectionId: connection.id,
      });

      if (currentProjectIdRef.current !== projectId) return;

      if (res.ok) {
        setConnection(null);
        setProjectConfig(null);
        setBaseUrl('');
        setAccountIdentifier('');
        setApiToken('');
        setShowDeleteConfirm(false);
        setSuccessMessage('Jira integration disconnected.');
      } else {
        setErrorMessage(res.error.message);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveProjectConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !connection || !window.desktop?.jira) return;

    if (!selectedJiraProjectId || !selectedIssueTypeId) {
      setConfigErrorMessage('Please select a Jira Project and Issue Type.');
      return;
    }

    setIsSavingConfig(true);
    setConfigErrorMessage(null);
    setConfigSuccessMessage(null);

    try {
      const res = await window.desktop.jira.saveProjectConfig({
        projectId,
        connectionId: connection.id,
        jiraProjectId: selectedJiraProjectId,
        jiraProjectKey: selectedJiraProjectKey,
        jiraProjectName: selectedJiraProjectName,
        selectedIssueTypeId,
        selectedIssueTypeName:
          discoveredIssueTypes.find(it => it.id === selectedIssueTypeId)?.name ??
          selectedIssueTypeName,
        defaultPriorityId: defaultPriorityId || null,
        defaultPriorityName:
          discoveredPriorities.find(p => p.id === defaultPriorityId)?.name ??
          defaultPriorityName ??
          null,
        defaultComponentId: defaultComponentId || null,
        defaultComponentName:
          discoveredComponents.find(c => c.id === defaultComponentId)?.name ??
          defaultComponentName ??
          null,
        assigneeStrategy,
        defaultAssigneeId: defaultAssigneeId || null,
        defaultAssigneeName:
          discoveredAssignees.find(a => a.accountId === defaultAssigneeId)?.displayName ??
          defaultAssigneeName ??
          null,
      });

      if (currentProjectIdRef.current !== projectId) return;

      if (res.ok) {
        setProjectConfig(res.data);
        setConfigSuccessMessage('Jira project configuration saved successfully.');
      } else {
        setConfigErrorMessage(res.error.message);
      }
    } catch (err) {
      setConfigErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleRefreshProjectConfig = async () => {
    if (!projectId || !window.desktop?.jira) return;

    setIsRefreshingConfig(true);
    setConfigErrorMessage(null);
    setConfigSuccessMessage(null);

    try {
      const res = await window.desktop.jira.refreshProjectConfig({ projectId });
      if (currentProjectIdRef.current !== projectId) return;

      if (res.ok) {
        setProjectConfig(res.data);
        if (res.data.configStatus === 'CONFIGURED') {
          setConfigSuccessMessage('Project configuration metadata refreshed successfully.');
        } else {
          setConfigErrorMessage(`Configuration ${res.data.configStatus}: ${res.data.staleReason}`);
        }
      } else {
        setConfigErrorMessage(res.error.message);
      }
    } catch (err) {
      setConfigErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRefreshingConfig(false);
    }
  };

  const handleTestHealthCheck = async () => {
    if (!projectId || !connection || !window.desktop?.jira) return;

    setIsTestingHealth(true);
    try {
      const res = await window.desktop.jira.testConnectionHealth({
        projectId,
        connectionId: connection.id,
        jiraProjectIdOrKey: selectedJiraProjectId || undefined,
        issueTypeId: selectedIssueTypeId || undefined,
      });

      if (res.ok) {
        setHealthCheckResult(res.data);
        setShowHealthDialog(true);
      } else {
        setConfigErrorMessage(res.error.message);
      }
    } catch (err) {
      setConfigErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsTestingHealth(false);
    }
  };

  const handleViewAuditLog = async () => {
    if (!projectId || !window.desktop?.jira?.listAuditLog) return;
    try {
      const res = await window.desktop.jira.listAuditLog({
        projectId,
        connectionId: connection?.id,
        limit: 25,
      });
      if (res.ok) {
        setAuditLogs(res.data);
        setShowAuditDialog(true);
      }
    } catch {
      // Ignore
    }
  };

  const getStatusBadge = (status?: JiraConnectionStatus) => {
    if (!connection) {
      return <Badge variant="neutral">Not Configured</Badge>;
    }

    switch (status) {
      case 'CONNECTED':
        return (
          <Badge variant="success" dot={true}>
            Connected
          </Badge>
        );
      case 'AUTHENTICATION_FAILED':
        return <Badge variant="danger">Auth Failed</Badge>;
      case 'PERMISSION_DENIED':
        return <Badge variant="danger">Permission Denied</Badge>;
      case 'RATE_LIMITED':
        return <Badge variant="warning">Rate Limited</Badge>;
      case 'TIMEOUT':
        return <Badge variant="warning">Timeout</Badge>;
      case 'UNREACHABLE':
        return <Badge variant="danger">Unreachable</Badge>;
      case 'INVALID_CONFIGURATION':
        return <Badge variant="danger">Invalid Config</Badge>;
      case 'DISCONNECTED':
        return <Badge variant="neutral">Disconnected</Badge>;
      case 'UNVALIDATED':
      default:
        return <Badge variant="warning">Unvalidated</Badge>;
    }
  };

  const getConfigStatusBadge = (status?: JiraProjectConfigStatus) => {
    if (!projectConfig) {
      return <Badge variant="neutral">Not Configured</Badge>;
    }

    switch (status) {
      case 'CONFIGURED':
        return <Badge variant="success">Configured</Badge>;
      case 'STALE':
        return <Badge variant="warning">Stale</Badge>;
      case 'NEEDS_REVIEW':
        return <Badge variant="warning">Needs Review</Badge>;
      case 'INVALID':
        return <Badge variant="danger">Invalid</Badge>;
      default:
        return <Badge variant="neutral">{status ?? 'Unknown'}</Badge>;
    }
  };

  if (!projectId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle level={2}>Jira Integration Foundation & Configuration</CardTitle>
          <CardDescription>Select a project to view or configure Jira integration.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <CardTitle level={2}>Jira Integration Foundation & Configuration</CardTitle>
            <CardDescription>
              Secure enterprise Jira connection adapter, project profile mapping, and configuration
              staleness detection.
            </CardDescription>
          </div>
          {getStatusBadge(connection?.connectionStatus)}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Spinner size="md" />
          </div>
        ) : (
          <form
            onSubmit={handleSaveConnection}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}
            {successMessage && <Alert variant="success">{successMessage}</Alert>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Integration Name" htmlFor="jira-display-name" required={true}>
                <Input
                  id="jira-display-name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Jira Cloud Integration"
                  disabled={isSaving || isValidating}
                />
              </FormField>

              <FormField label="Deployment Type" htmlFor="jira-deployment-type">
                <Input
                  id="jira-deployment-type"
                  value={connection?.deploymentType ?? 'JIRA_CLOUD'}
                  disabled={true}
                />
              </FormField>
            </div>

            <FormField
              label="Jira Base URL"
              htmlFor="jira-base-url"
              description="Must start with https:// (e.g. https://your-org.atlassian.net)"
              required={true}
            >
              <Input
                id="jira-base-url"
                type="url"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://company.atlassian.net"
                disabled={isSaving || isValidating}
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField
                label="Account Email / Username"
                htmlFor="jira-account-id"
                description="Atlassian account email address"
                required={true}
              >
                <Input
                  id="jira-account-id"
                  value={accountIdentifier}
                  onChange={e => setAccountIdentifier(e.target.value)}
                  placeholder="developer@company.com"
                  disabled={isSaving || isValidating}
                />
              </FormField>

              <FormField
                label="API Token / Personal Access Token"
                htmlFor="jira-api-token"
                description={
                  connection?.credentialConfigured
                    ? 'Configured (leave blank to keep existing token)'
                    : 'Enter Atlassian API token'
                }
                required={!connection?.credentialConfigured}
              >
                <Input
                  id="jira-api-token"
                  type="password"
                  value={apiToken}
                  onChange={e => setApiToken(e.target.value)}
                  placeholder={
                    connection?.credentialConfigured ? '••••••••••••••••' : 'Enter API token'
                  }
                  disabled={isSaving || isValidating}
                  autoComplete="new-password"
                />
              </FormField>
            </div>

            {connection?.lastValidatedAt && (
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-subtle)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Last Validated: {new Date(connection.lastValidatedAt).toLocaleString()}</span>
                {connection.lastValidationResult?.accountIdentity?.displayName && (
                  <span>User: {connection.lastValidationResult.accountIdentity.displayName}</span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button type="submit" variant="primary" disabled={isSaving || isValidating}>
                  {isSaving ? 'Saving...' : connection ? 'Update Connection' : 'Save Connection'}
                </Button>

                {connection && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleValidateConnection}
                    disabled={isValidating || isSaving}
                  >
                    {isValidating ? 'Validating...' : 'Validate Connection'}
                  </Button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {connection && (
                  <>
                    <Button type="button" variant="ghost" onClick={handleViewAuditLog}>
                      Audit Trail
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isSaving || isValidating}
                    >
                      Disconnect
                    </Button>
                  </>
                )}
              </div>
            </div>
          </form>
        )}

        {/* Phase 90: Project Configuration Section (Active when connection is CONNECTED) */}
        {connection?.connectionStatus === 'CONNECTED' && (
          <div style={{ marginTop: '2rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <Separator />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                  Project Mapping & Configuration Profile
                </h3>
                <p
                  style={{
                    margin: '0.25rem 0 0 0',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Map this AI Quality project to a Jira project and specify default defect
                  attributes.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {getConfigStatusBadge(projectConfig?.configStatus)}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRefreshProjectConfig}
                  disabled={isRefreshingConfig || !projectConfig}
                >
                  {isRefreshingConfig ? 'Refreshing...' : 'Refresh Metadata'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTestHealthCheck}
                  disabled={isTestingHealth}
                >
                  {isTestingHealth ? 'Checking...' : 'Health Check'}
                </Button>
              </div>
            </div>

            {configErrorMessage && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert variant="danger">{configErrorMessage}</Alert>
              </div>
            )}
            {configSuccessMessage && (
              <div style={{ marginBottom: '1rem' }}>
                <Alert variant="success">{configSuccessMessage}</Alert>
              </div>
            )}

            {/* Staleness Warning Banner */}
            {projectConfig &&
              projectConfig.configStatus !== 'CONFIGURED' &&
              projectConfig.staleReason && (
                <div style={{ marginBottom: '1rem' }}>
                  <Alert variant={projectConfig.configStatus === 'INVALID' ? 'danger' : 'warning'}>
                    <strong>Configuration {projectConfig.configStatus}:</strong>{' '}
                    {projectConfig.staleReason}
                  </Alert>
                </div>
              )}

            {isConfigLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
                <Spinner size="sm" />
              </div>
            ) : (
              <form
                onSubmit={handleSaveProjectConfig}
                style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
              >
                {/* Jira Project Selector */}
                <FormField
                  label="Target Jira Project"
                  htmlFor="jira-target-project"
                  description="Select the Jira project where defects will be managed"
                  required={true}
                >
                  <Select
                    id="jira-target-project"
                    value={selectedJiraProjectId}
                    onChange={e => {
                      const projId = e.target.value;
                      setSelectedJiraProjectId(projId);
                      const p = discoveredProjects.find(item => item.id === projId);
                      if (p) {
                        setSelectedJiraProjectKey(p.key);
                        setSelectedJiraProjectName(p.name);
                      }
                    }}
                    disabled={isSavingConfig || isRefreshingConfig}
                  >
                    <option value="">-- Select a Jira Project --</option>
                    {discoveredProjects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.key})
                      </option>
                    ))}
                  </Select>
                </FormField>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Issue Type Selector */}
                  <FormField
                    label="Default Issue Type"
                    htmlFor="jira-issue-type"
                    description="Issue type for defect tracking (e.g. Bug)"
                    required={true}
                  >
                    <Select
                      id="jira-issue-type"
                      value={selectedIssueTypeId}
                      onChange={e => {
                        const itId = e.target.value;
                        setSelectedIssueTypeId(itId);
                        const it = discoveredIssueTypes.find(item => item.id === itId);
                        if (it) setSelectedIssueTypeName(it.name);
                      }}
                      disabled={isSavingConfig || isLoadingDiscovery || !selectedJiraProjectId}
                    >
                      <option value="">-- Select Issue Type --</option>
                      {discoveredIssueTypes.map(it => (
                        <option key={it.id} value={it.id}>
                          {it.name} {it.subtask ? '(Subtask)' : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  {/* Priority Selector */}
                  <FormField
                    label="Default Priority (Optional)"
                    htmlFor="jira-default-priority"
                    description="Default priority for published issues"
                  >
                    <Select
                      id="jira-default-priority"
                      value={defaultPriorityId}
                      onChange={e => {
                        const prioId = e.target.value;
                        setDefaultPriorityId(prioId);
                        const prio = discoveredPriorities.find(p => p.id === prioId);
                        setDefaultPriorityName(prio ? prio.name : '');
                      }}
                      disabled={isSavingConfig}
                    >
                      <option value="">-- None / Default --</option>
                      {discoveredPriorities.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Component Selector */}
                  <FormField
                    label="Default Component (Optional)"
                    htmlFor="jira-default-component"
                    description="Project component to assign issues to"
                  >
                    <Select
                      id="jira-default-component"
                      value={defaultComponentId}
                      onChange={e => {
                        const cId = e.target.value;
                        setDefaultComponentId(cId);
                        const comp = discoveredComponents.find(c => c.id === cId);
                        setDefaultComponentName(comp ? comp.name : '');
                      }}
                      disabled={isSavingConfig || isLoadingDiscovery || !selectedJiraProjectId}
                    >
                      <option value="">-- No Component --</option>
                      {discoveredComponents.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  {/* Assignee Strategy */}
                  <FormField
                    label="Assignee Strategy"
                    htmlFor="jira-assignee-strategy"
                    description="How assignees are assigned to issues"
                  >
                    <Select
                      id="jira-assignee-strategy"
                      value={assigneeStrategy}
                      onChange={e => setAssigneeStrategy(e.target.value as JiraAssigneeStrategy)}
                      disabled={isSavingConfig}
                    >
                      <option value="UNASSIGNED">Unassigned</option>
                      <option value="AUTOMATIC">Project Default (Automatic)</option>
                      <option value="SPECIFIC_USER">Specific Assignee</option>
                    </Select>
                  </FormField>
                </div>

                {/* Specific Assignee User Selector */}
                {assigneeStrategy === 'SPECIFIC_USER' && (
                  <FormField
                    label="Specific Assignee User"
                    htmlFor="jira-specific-assignee"
                    description="Select the default user to assign"
                  >
                    <Select
                      id="jira-specific-assignee"
                      value={defaultAssigneeId}
                      onChange={e => {
                        const accId = e.target.value;
                        setDefaultAssigneeId(accId);
                        const user = discoveredAssignees.find(a => a.accountId === accId);
                        setDefaultAssigneeName(user ? user.displayName : '');
                      }}
                      disabled={isSavingConfig || isLoadingDiscovery || !selectedJiraProjectId}
                    >
                      <option value="">-- Select Assignee --</option>
                      {discoveredAssignees.map(a => (
                        <option key={a.accountId} value={a.accountId}>
                          {a.displayName} {a.emailAddress ? `(${a.emailAddress})` : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}

                {/* Detected Fields Indicator */}
                {discoveredFields.length > 0 && (
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--bg-subtle)',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '4px',
                    }}
                  >
                    <span>
                      Detected {discoveredFields.length} Jira fields (
                      {discoveredFields.filter(f => f.custom).length} custom fields) available for
                      configuration.
                    </span>
                  </div>
                )}

                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSavingConfig || isConfigLoading || !selectedJiraProjectId}
                  >
                    {isSavingConfig ? 'Saving Profile...' : 'Save Project Mapping'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </CardContent>

      {/* Disconnect Confirmation Dialog */}
      <Dialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Disconnect Jira Integration"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Are you sure you want to disconnect Jira for this project? This will remove the local
            connection configuration, delete mapped project configurations, and revoke local
            credential references. Existing Jira tickets will not be affected.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConnection} disabled={isDeleting}>
              {isDeleting ? 'Disconnecting...' : 'Confirm Disconnect'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Health Check Results Dialog */}
      <Dialog
        open={showHealthDialog}
        onClose={() => setShowHealthDialog(false)}
        title="Jira Connection Health Check"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {healthCheckResult && (
            <>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontWeight: 600 }}>Overall Status:</span>
                <Badge variant={healthCheckResult.healthy ? 'success' : 'danger'}>
                  {healthCheckResult.healthy ? 'HEALTHY' : 'UNHEALTHY'} (
                  {healthCheckResult.durationMs}ms)
                </Badge>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  fontSize: '0.85rem',
                }}
              >
                <div
                  style={{
                    padding: '0.5rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>1. Authentication:</span>
                  <span
                    style={{
                      color: healthCheckResult.checks.authentication.passed
                        ? 'var(--color-success)'
                        : 'var(--color-danger)',
                    }}
                  >
                    {healthCheckResult.checks.authentication.message}
                  </span>
                </div>

                <div
                  style={{
                    padding: '0.5rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>2. Reachability:</span>
                  <span
                    style={{
                      color: healthCheckResult.checks.reachability.passed
                        ? 'var(--color-success)'
                        : 'var(--color-danger)',
                    }}
                  >
                    {healthCheckResult.checks.reachability.message}
                  </span>
                </div>

                <div
                  style={{
                    padding: '0.5rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>3. Project Access:</span>
                  <span
                    style={{
                      color: healthCheckResult.checks.projectAccess.passed
                        ? 'var(--color-success)'
                        : 'var(--color-danger)',
                    }}
                  >
                    {healthCheckResult.checks.projectAccess.message}
                  </span>
                </div>

                <div
                  style={{
                    padding: '0.5rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>4. Issue Metadata Access:</span>
                  <span
                    style={{
                      color: healthCheckResult.checks.issueMetadataAccess.passed
                        ? 'var(--color-success)'
                        : 'var(--color-danger)',
                    }}
                  >
                    {healthCheckResult.checks.issueMetadataAccess.message}
                  </span>
                </div>
              </div>

              {healthCheckResult.errorMessage && (
                <Alert variant="danger">
                  Error: {healthCheckResult.errorMessage} ({healthCheckResult.errorCode})
                </Alert>
              )}
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowHealthDialog(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Audit Log Dialog */}
      <Dialog
        open={showAuditDialog}
        onClose={() => setShowAuditDialog(false)}
        title="Jira Integration Audit History"
      >
        <div style={{ maxHeight: '350px', overflowY: 'auto', fontSize: '0.85rem' }}>
          {auditLogs.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No audit history available.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {auditLogs.map(log => (
                <div
                  key={log.id}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                  }}
                >
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}
                  >
                    <span>{log.eventType}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {log.newStatus && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Status: {log.previousStatus ?? 'NONE'} &rarr; {log.newStatus}
                    </div>
                  )}
                  {log.details && (
                    <pre
                      style={{
                        margin: '0.25rem 0 0 0',
                        fontSize: '0.75rem',
                        backgroundColor: 'var(--bg-subtle)',
                        padding: '0.25rem',
                        borderRadius: '2px',
                      }}
                    >
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </Card>
  );
}
