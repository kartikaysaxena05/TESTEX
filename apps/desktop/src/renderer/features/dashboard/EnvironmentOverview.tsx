/**
 * @file apps/desktop/src/renderer/features/dashboard/EnvironmentOverview.tsx
 * Environment overview section displaying target testing configurations and
 * Phase 119 website targets.
 */

import React, { useMemo, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table } from '../../ui/Table.js';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { Card, CardContent } from '../../ui/Card.js';
import type {
  ProjectDetails,
  ProjectEnvironmentDto,
  LocalFolderConnectionDto,
  TargetEnvironmentConfigDto,
} from '@ai-quality/contracts';
import { WebsiteTargetCard } from '../projects/WebsiteTargetCard.js';
import { AddWebsiteTargetModal } from '../projects/AddWebsiteTargetModal.js';
import { RepositoryConnectionCard } from '../projects/RepositoryConnectionCard.js';
import { ConnectRepositoryModal } from '../projects/ConnectRepositoryModal.js';
import { LocalFolderCard } from '../projects/LocalFolderCard.js';
import { ConnectLocalFolderModal } from '../projects/ConnectLocalFolderModal.js';
import { TargetEnvironmentCard, TargetEnvironmentConfigModal } from '../environments/index.js';
import { ProjectContextCard } from '../project-context/index.js';

export interface EnvironmentOverviewProps {
  readonly project: ProjectDetails;
  readonly onRefresh?: () => void;
}

export function EnvironmentOverview({ project, onRefresh }: EnvironmentOverviewProps): React.JSX.Element {
  const navigate = useNavigate();
  const [isAddTargetOpen, setIsAddTargetOpen] = useState(false);
  const [isConnectRepoOpen, setIsConnectRepoOpen] = useState(false);
  const [isConnectFolderOpen, setIsConnectFolderOpen] = useState(false);
  const [targetEnvironments, setTargetEnvironments] = useState<readonly TargetEnvironmentConfigDto[]>([]);
  const [activeTargetEnv, setActiveTargetEnv] = useState<TargetEnvironmentConfigDto | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalEnvId, setConfigModalEnvId] = useState<string | null>(null);

  const loadTargetEnvironments = React.useCallback(async () => {
    if (!window.desktop?.targetEnvironment?.list) return;
    try {
      const res = await window.desktop.targetEnvironment.list({ projectId: project.id });
      if (res.ok) {
        setTargetEnvironments(res.data);
        const active = res.data.find(e => e.isDefault) ?? res.data[0] ?? null;
        setActiveTargetEnv(active);
      }
    } catch (err) {
      console.error('Failed to load target environments:', err);
    }
  }, [project.id]);

  useEffect(() => {
    void loadTargetEnvironments();
  }, [loadTargetEnvironments]);

  // Deterministic ordering: default environment first, then sorted by name ascending
  const sortedEnvironments = useMemo<readonly ProjectEnvironmentDto[]>(() => {
    return [...project.environments].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [project.environments]);

  const websiteTargets = project.websiteTargets ?? [];
  const activeTargetId = project.activeWebsiteTarget?.id ?? websiteTargets[0]?.id ?? null;

  const repositoryConnections = project.repositoryConnections ?? [];
  const activeRepoId = project.activeRepositoryConnection?.id ?? repositoryConnections[0]?.id ?? null;

  const handleSetActive = async (targetId: string) => {
    if (window.desktop?.websiteTargets?.setActive) {
      await window.desktop.websiteTargets.setActive({ projectId: project.id, targetId });
    }
  };

  const handleTestConnection = async (targetId: string) => {
    if (!window.desktop?.websiteTargets?.testConnection) {
      throw new Error('Connectivity test IPC unavailable');
    }
    const res = await window.desktop.websiteTargets.testConnection({
      projectId: project.id,
      targetId,
    });
    if (!res.ok) {
      throw new Error(res.error.message);
    }
    return res.data;
  };

  const handleDelete = async (targetId: string) => {
    if (window.desktop?.websiteTargets?.delete) {
      await window.desktop.websiteTargets.delete({ projectId: project.id, targetId });
    }
  };

  const handleSetActiveRepo = async (connectionId: string) => {
    if (window.desktop?.repositoryConnections?.setActive) {
      await window.desktop.repositoryConnections.setActive({ projectId: project.id, connectionId });
    }
  };

  const handleVerifyRepo = async (connectionId: string) => {
    if (!window.desktop?.repositoryConnections?.verify) {
      throw new Error('Repository verify IPC unavailable');
    }
    const res = await window.desktop.repositoryConnections.verify({
      projectId: project.id,
      connectionId,
    });
    if (!res.ok) {
      throw new Error(res.error.message);
    }
    return res.data;
  };

  const handleImportRepo = async (connectionId: string) => {
    if (!window.desktop?.repositoryConnections?.import) {
      throw new Error('Repository import IPC unavailable');
    }
    const res = await window.desktop.repositoryConnections.import({
      projectId: project.id,
      connectionId,
    });
    if (!res.ok) {
      throw new Error(res.error.message);
    }
    return res.data;
  };

  const handleDeleteRepo = async (connectionId: string) => {
    if (window.desktop?.repositoryConnections?.delete) {
      await window.desktop.repositoryConnections.delete({ projectId: project.id, connectionId });
    }
  };

  const handleValidateLocalFolder = async () => {
    if (!window.desktop?.localFolder?.validate) {
      throw new Error('Local folder validation IPC unavailable');
    }
    const res = await window.desktop.localFolder.validate({ projectId: project.id });
    if (!res.ok) {
      throw new Error(res.error.message);
    }
    onRefresh?.();
    return res.data;
  };

  const handleDisconnectLocalFolder = async () => {
    if (!window.desktop?.localFolder?.disconnect) {
      throw new Error('Local folder disconnect IPC unavailable');
    }
    const res = await window.desktop.localFolder.disconnect({ projectId: project.id });
    if (!res.ok) {
      throw new Error(res.error.message);
    }
    onRefresh?.();
  };

  return (
    <section aria-labelledby="env-overview-title" className="dashboard-section">
      <div className="dashboard-section-header">
        <div>
          <h3 id="env-overview-title" className="dashboard-section-title">
            Environment Overview
          </h3>
          <span className="dashboard-section-subtitle">
            Deployment targets, website URLs and test execution addresses
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsConnectFolderOpen(true)}
            data-testid="connect-folder-btn"
          >
            {project.localFolder ? 'Change Local Folder' : '+ Connect Local Folder'}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsConnectRepoOpen(true)}
            data-testid="connect-repo-btn"
          >
            + Connect Repository
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setConfigModalEnvId(activeTargetEnv?.id ?? null);
              setIsConfigModalOpen(true);
            }}
            data-testid="configure-target-env-header-btn"
          >
            ⚙ Target & Browser
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsAddTargetOpen(true)}
            data-testid="add-target-btn"
          >
            + Add Target
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/projects')}
            title="Configure environments in Projects screen"
            data-testid="manage-environments-btn"
          >
            Manage Environments →
          </Button>
        </div>
      </div>

      {/* V8 Phase 123 Unified Project Context & Source Detection */}
      <div
        className="project-context-section"
        data-testid="project-context-section"
        style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}
      >
        <ProjectContextCard
          projectId={project.id}
          onContextChanged={() => onRefresh?.()}
        />
      </div>

      {/* Phase 122 Target Environment, Browser & Authentication Configuration */}
      <div
        className="target-environment-section"
        data-testid="target-environment-section"
        style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4
            style={{
              fontSize: '0.95rem',
              fontWeight: 600,
              color: 'var(--color-text-secondary, #9ca3af)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: 0,
            }}
          >
            Active Web Application Target & Browser Runtime (Phase 122)
          </h4>
        </div>

        <TargetEnvironmentCard
          projectId={project.id}
          activeEnvironment={activeTargetEnv}
          environments={targetEnvironments}
          onConfigure={envId => {
            setConfigModalEnvId(envId ?? null);
            setIsConfigModalOpen(true);
          }}
          onEnvironmentSwitched={env => {
            setActiveTargetEnv(env);
            onRefresh?.();
          }}
          onRefresh={() => {
            void loadTargetEnvironments();
            onRefresh?.();
          }}
        />
      </div>

      {/* Phase 121 Connected Local Folder Section */}
      {project.localFolder && (
        <div
          className="local-folder-section"
          data-testid="local-folder-section"
          style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h4
              style={{
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary, #9ca3af)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: 0,
              }}
            >
              Connected Local Project Folder
            </h4>
          </div>

          <LocalFolderCard
            localFolder={project.localFolder}
            onValidate={handleValidateLocalFolder}
            onChangeFolder={() => setIsConnectFolderOpen(true)}
            onDisconnect={handleDisconnectLocalFolder}
          />
        </div>
      )}

      {/* Phase 120 Connected Git Repositories Section */}
      {repositoryConnections.length > 0 && (
        <div
          className="repository-connections-section"
          data-testid="repository-connections-section"
          style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h4
              style={{
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary, #9ca3af)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: 0,
              }}
            >
              Connected Git Repositories ({repositoryConnections.length})
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {repositoryConnections.map(conn => (
              <RepositoryConnectionCard
                key={conn.id}
                connection={conn}
                isActive={conn.id === activeRepoId}
                onSetActive={handleSetActiveRepo}
                onVerify={handleVerifyRepo}
                onImport={handleImportRepo}
                onDelete={handleDeleteRepo}
              />
            ))}
          </div>
        </div>
      )}

      {/* Phase 119 Connected Website Targets Section */}
      {websiteTargets.length > 0 && (
        <div
          className="website-targets-section"
          data-testid="website-targets-section"
          style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h4
              style={{
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary, #9ca3af)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: 0,
              }}
            >
              Connected Website Targets ({websiteTargets.length})
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {websiteTargets.map(target => (
              <WebsiteTargetCard
                key={target.id}
                target={target}
                isActive={target.id === activeTargetId}
                onSetActive={handleSetActive}
                onTestConnection={handleTestConnection}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Deployment Environments Table */}
      {sortedEnvironments.length === 0 ? (
        <Card variant="default">
          <CardContent>
            <div className="env-empty-state">
              <p className="env-empty-desc">No environments configured for this project.</p>
              <Button variant="secondary" size="sm" onClick={() => navigate('/projects')}>
                Configure First Environment
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Environment Name</th>
              <th>Type</th>
              <th>Base URL</th>
              <th style={{ textAlign: 'right' }}>Default Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedEnvironments.map(env => (
              <tr key={env.id} data-testid={`dashboard-env-row-${env.id}`}>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {env.name}
                  </span>
                </td>
                <td>
                  <Badge variant={env.type === 'PRODUCTION' ? 'warning' : 'neutral'}>
                    {env.type}
                  </Badge>
                </td>
                <td>
                  {env.baseUrl ? (
                    <span className="env-url-text" title={env.baseUrl}>
                      {env.baseUrl}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {env.isDefault ? (
                    <Badge variant="success">Default Target</Badge>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <AddWebsiteTargetModal
        isOpen={isAddTargetOpen}
        projectId={project.id}
        projectName={project.name}
        onClose={() => setIsAddTargetOpen(false)}
        onSuccess={() => setIsAddTargetOpen(false)}
      />

      <ConnectRepositoryModal
        isOpen={isConnectRepoOpen}
        projectId={project.id}
        projectName={project.name}
        onClose={() => setIsConnectRepoOpen(false)}
        onSuccess={() => setIsConnectRepoOpen(false)}
      />

      <ConnectLocalFolderModal
        isOpen={isConnectFolderOpen}
        projectId={project.id}
        projectName={project.name}
        initialFolderPath={project.localFolder?.rootPath}
        onClose={() => setIsConnectFolderOpen(false)}
        onSuccess={() => {
          setIsConnectFolderOpen(false);
          onRefresh?.();
        }}
      />

      <TargetEnvironmentConfigModal
        isOpen={isConfigModalOpen}
        projectId={project.id}
        projectName={project.name}
        initialEnvironmentId={configModalEnvId}
        onClose={() => setIsConfigModalOpen(false)}
        onSuccess={() => {
          setIsConfigModalOpen(false);
          void loadTargetEnvironments();
          onRefresh?.();
        }}
      />
    </section>
  );
}
