/**
 * @file apps/desktop/src/renderer/screens/projects/CreateProjectDialog.tsx
 * Dialog modal for creating a new project with flexible testing targets:
 * - Local Folder (directory picker + local codebase)
 * - Website URL (live web testing environment)
 * - Git Repository (remote URL + local clone)
 * - General Project (blank setup)
 */

import React, { useState } from 'react';
import { Dialog } from '../../ui/Dialog.js';
import { FormField } from '../../ui/FormField.js';
import { Input } from '../../ui/Input.js';
import { Textarea } from '../../ui/Textarea.js';
import { Select } from '../../ui/Select.js';
import { Button } from '../../ui/Button.js';
import { Alert } from '../../ui/Alert.js';
import { useProject } from '../../context/ProjectContext.js';
import type { EnvironmentType } from '@ai-quality/contracts';

export type TestingTargetMode = 'folder' | 'website' | 'git' | 'general';

export interface CreateProjectDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onCreated?: () => void;
  readonly initialMode?: TestingTargetMode;
}

function TargetFolderIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 2 2Z" />
    </svg>
  );
}

function TargetWebsiteIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function TargetGitIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function TargetGeneralIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function BrowseFolderIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 2 2Z" />
    </svg>
  );
}

export function CreateProjectDialog({
  isOpen,
  onClose,
  onCreated,
  initialMode = 'folder',
}: CreateProjectDialogProps): React.JSX.Element {
  const { selectProjectOnCreate, refreshProjects } = useProject();

  // Basic project state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  // Testing Target Mode State
  const [targetMode, setTargetMode] = useState<TestingTargetMode>(initialMode);

  // Sync initialMode when dialog opens
  React.useEffect(() => {
    if (isOpen && initialMode) {
      setTargetMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Mode 1: Local Folder State
  const [folderPath, setFolderPath] = useState('');
  const [devServerUrl, setDevServerUrl] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);

  // Mode 2: Website / Web Application State
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [envType, setEnvType] = useState<EnvironmentType>('DEVELOPMENT');
  const [envName, setEnvName] = useState('Web Application');
  const [urlError, setUrlError] = useState<string | null>(null);

  // Mode 3: Git Repository State
  const [gitUrl, setGitUrl] = useState('');
  const [gitLocalPath, setGitLocalPath] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [gitError, setGitError] = useState<string | null>(null);

  // Submission & General Error State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = React.useCallback(() => {
    setName('');
    setDescription('');
    setTargetMode(initialMode || 'folder');
    setFolderPath('');
    setDevServerUrl('');
    setWebsiteUrl('');
    setEnvType('DEVELOPMENT');
    setEnvName('Web Application');
    setGitUrl('');
    setGitLocalPath('');
    setGitBranch('main');
    setNameError(null);
    setFolderError(null);
    setUrlError(null);
    setGitError(null);
    setErrorMessage(null);
  }, [initialMode]);

  const handleClose = React.useCallback(() => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }, [isSubmitting, resetForm, onClose]);

  const handleBrowseFolder = async (isGitClone = false) => {
    try {
      if (!window.desktop?.sources?.pickDirectory) {
        console.warn('[CreateProjectDialog] window.desktop.sources.pickDirectory is not available.');
        const msg = 'Desktop folder picker is not available in this environment.';
        if (isGitClone) setGitError(msg);
        else setFolderError(msg);
        return;
      }
      const result = await window.desktop.sources.pickDirectory();
      if (!result.ok) {
        console.error('[CreateProjectDialog] Error from pickDirectory IPC:', result.error);
        const msg = result.error?.message || 'Failed to open directory picker';
        if (isGitClone) setGitError(msg);
        else setFolderError(msg);
        return;
      }
      if (!result.data.cancelled && result.data.directoryPath) {
        const pickedPath = result.data.directoryPath;
        const pickedName = result.data.folderName;

        if (isGitClone) {
          setGitLocalPath(pickedPath);
          setGitError(null);
        } else {
          setFolderPath(pickedPath);
          setFolderError(null);
        }

        // Auto-populate Project Name if currently empty
        if (!name.trim() && pickedName) {
          setName(pickedName);
          setNameError(null);
        }
      }
    } catch (err) {
      console.error('[CreateProjectDialog] Error picking directory:', err);
      const msg = err instanceof Error ? err.message : 'Failed to open directory picker';
      if (isGitClone) setGitError(msg);
      else setFolderError(msg);
    }
  };

  const handleWebsiteUrlChange = (value: string) => {
    setWebsiteUrl(value);
    if (urlError) setUrlError(null);

    // Auto-suggest project name and environment type from URL if project name is empty
    if (!name.trim() && value.trim()) {
      try {
        const parsed = new URL(value.startsWith('http') ? value : `https://${value}`);
        const hostname = parsed.hostname.replace(/^www\./, '');
        const suggestedName = hostname.split('.')[0] || hostname;
        if (suggestedName && suggestedName !== 'localhost') {
          setName(suggestedName.charAt(0).toUpperCase() + suggestedName.slice(1));
          setNameError(null);
        }
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
          setEnvType('LOCAL');
          setEnvName('Local Dev');
        }
      } catch {
        // In-progress typing
      }
    }
  };

  const handleGitUrlChange = (value: string) => {
    setGitUrl(value);
    if (gitError) setGitError(null);

    // Auto-suggest project name from Git repo URL
    if (!name.trim() && value.trim()) {
      const match = value.match(/\/([^/]+?)(\.git)?$/);
      if (match && match[1]) {
        setName(match[1]);
        setNameError(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Project name is required.');
      return;
    }
    if (trimmedName.length > 120) {
      setNameError('Project name must be 120 characters or fewer.');
      return;
    }
    setNameError(null);
    setErrorMessage(null);

    // Validate mode-specific requirements
    if (targetMode === 'website') {
      const trimmedUrl = websiteUrl.trim();
      if (!trimmedUrl) {
        setUrlError('Website / Target Application URL is required.');
        return;
      }
      try {
        const parsed = new URL(trimmedUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          setUrlError('URL must use http:// or https:// protocol.');
          return;
        }
      } catch {
        setUrlError('Please enter a valid URL (e.g. https://example.com or http://localhost:3000).');
        return;
      }
    }

    if (targetMode === 'folder') {
      if (!folderPath.trim()) {
        setFolderError('Please choose or browse a local project directory.');
        return;
      }
    }

    if (targetMode === 'git') {
      if (!gitUrl.trim() && !gitLocalPath.trim()) {
        setGitError('Please provide a Git repository URL or browse a local clone directory.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (!window.desktop?.projects?.create) {
        throw new Error('Project creation is not supported in this environment.');
      }

      // 1. Create the root Project
      const result = await window.desktop.projects.create({
        name: trimmedName,
        description: description.trim() || null,
      });

      if (!result.ok) {
        setErrorMessage(result.error.message);
        setIsSubmitting(false);
        return;
      }

      const createdProject = result.data;

      // 2. Apply chosen testing target configuration
      if (targetMode === 'folder' && folderPath.trim()) {
        try {
          if (window.desktop?.sources?.attachLocalDirectory) {
            await window.desktop.sources.attachLocalDirectory(createdProject.id, folderPath.trim());
          }
        } catch (attachErr) {
          console.warn('[CreateProjectDialog] Warning attaching folder:', attachErr);
        }

        // Optional local dev server URL
        if (devServerUrl.trim() && window.desktop?.environments?.create) {
          try {
            await window.desktop.environments.create({
              projectId: createdProject.id,
              name: 'Local Dev Server',
              type: 'LOCAL',
              baseUrl: devServerUrl.trim(),
              isDefault: true,
            });
          } catch (envErr) {
            console.warn('[CreateProjectDialog] Warning creating dev environment:', envErr);
          }
        }
      } else if (targetMode === 'website' && websiteUrl.trim()) {
        if (window.desktop?.environments?.create) {
          try {
            await window.desktop.environments.create({
              projectId: createdProject.id,
              name: envName.trim() || 'Web Application',
              type: envType,
              baseUrl: websiteUrl.trim(),
              isDefault: true,
            });
          } catch (envErr) {
            console.warn('[CreateProjectDialog] Warning creating environment:', envErr);
          }
        }
      } else if (targetMode === 'git') {
        if (gitLocalPath.trim() && window.desktop?.sources?.attachLocalDirectory) {
          try {
            await window.desktop.sources.attachLocalDirectory(
              createdProject.id,
              gitLocalPath.trim(),
            );
          } catch (attachErr) {
            console.warn('[CreateProjectDialog] Warning attaching git clone:', attachErr);
          }
        }
        if (gitUrl.trim() && window.desktop?.targetApplications?.update) {
          try {
            const gitNote = `Git Repository: ${gitUrl.trim()}${gitBranch.trim() ? ` (branch: ${gitBranch.trim()})` : ''}`;
            const existingDesc = description.trim();
            await window.desktop.targetApplications.update({
              projectId: createdProject.id,
              description: existingDesc ? `${existingDesc}\n${gitNote}` : gitNote,
            });
          } catch (targetErr) {
            console.warn('[CreateProjectDialog] Warning updating target app:', targetErr);
          }
        }
      }

      // 3. Select project, refresh and close
      selectProjectOnCreate(createdProject);
      await refreshProjects();
      handleClose();
      onCreated?.();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      title="Create New Project"
      description="Initialize a new software testing project and configure how you want to test your application."
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-project-form"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Create Project
          </Button>
        </div>
      }
    >
      <form
        id="create-project-form"
        onSubmit={handleSubmit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        {errorMessage && (
          <Alert variant="danger" title="Error creating project">
            {errorMessage}
          </Alert>
        )}

        {/* 1. Testing Target Mode Selection */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary, #e2e8f0)',
              marginBottom: '8px',
            }}
          >
            How do you want to test your application?
          </label>
          <div className="target-mode-grid">
            <button
              type="button"
              className={`target-mode-card ${targetMode === 'folder' ? 'active' : ''}`}
              onClick={() => setTargetMode('folder')}
            >
              <div className="target-mode-card-header">
                <div className="target-mode-icon-badge folder">
                  <TargetFolderIcon />
                </div>
                {targetMode === 'folder' && <span className="target-mode-check" aria-hidden="true">✓</span>}
              </div>
              <span className="target-mode-card-title">Project Folder</span>
              <span className="target-mode-card-desc">Local codebase on disk</span>
            </button>

            <button
              type="button"
              className={`target-mode-card ${targetMode === 'website' ? 'active' : ''}`}
              onClick={() => setTargetMode('website')}
            >
              <div className="target-mode-card-header">
                <div className="target-mode-icon-badge website">
                  <TargetWebsiteIcon />
                </div>
                {targetMode === 'website' && <span className="target-mode-check" aria-hidden="true">✓</span>}
              </div>
              <span className="target-mode-card-title">Website URL</span>
              <span className="target-mode-card-desc">Live web app or localhost</span>
            </button>

            <button
              type="button"
              className={`target-mode-card ${targetMode === 'git' ? 'active' : ''}`}
              onClick={() => setTargetMode('git')}
            >
              <div className="target-mode-card-header">
                <div className="target-mode-icon-badge git">
                  <TargetGitIcon />
                </div>
                {targetMode === 'git' && <span className="target-mode-check" aria-hidden="true">✓</span>}
              </div>
              <span className="target-mode-card-title">Git Repo</span>
              <span className="target-mode-card-desc">Remote repo or clone</span>
            </button>

            <button
              type="button"
              className={`target-mode-card ${targetMode === 'general' ? 'active' : ''}`}
              onClick={() => setTargetMode('general')}
            >
              <div className="target-mode-card-header">
                <div className="target-mode-icon-badge general">
                  <TargetGeneralIcon />
                </div>
                {targetMode === 'general' && <span className="target-mode-check" aria-hidden="true">✓</span>}
              </div>
              <span className="target-mode-card-title">General</span>
              <span className="target-mode-card-desc">Configure later</span>
            </button>
          </div>
        </div>

        {/* 2. Target Mode Specific Form Controls */}
        {targetMode === 'folder' && (
          <div className="target-mode-config-box">
            <FormField
              label="Local Project Folder"
              htmlFor="create-project-folder"
              required
              description="Choose the application root directory on your machine."
              error={folderError ?? undefined}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input
                  id="create-project-folder"
                  value={folderPath}
                  onChange={e => {
                    setFolderPath(e.target.value);
                    if (folderError) setFolderError(null);
                  }}
                  placeholder="e.g. /Users/name/Projects/my-app"
                  invalid={Boolean(folderError)}
                  disabled={isSubmitting}
                  style={{ flexGrow: 1 }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleBrowseFolder(false)}
                  disabled={isSubmitting}
                  title="Open folder picker"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                >
                  <BrowseFolderIcon />
                  <span>Browse...</span>
                </Button>
              </div>
            </FormField>

            <FormField
              label="Local Dev Server URL (Optional)"
              htmlFor="create-project-dev-url"
              description="If your app runs locally, provide its live URL for browser testing."
            >
              <Input
                id="create-project-dev-url"
                value={devServerUrl}
                onChange={e => setDevServerUrl(e.target.value)}
                placeholder="e.g. http://localhost:3000"
                disabled={isSubmitting}
              />
            </FormField>
          </div>
        )}

        {targetMode === 'website' && (
          <div className="target-mode-config-box">
            <FormField
              label="Target Website URL"
              htmlFor="create-project-website-url"
              required
              description="Enter the live URL or local web server to test."
              error={urlError ?? undefined}
            >
              <Input
                id="create-project-website-url"
                value={websiteUrl}
                onChange={e => handleWebsiteUrlChange(e.target.value)}
                placeholder="e.g. https://my-store.com or http://localhost:3000"
                invalid={Boolean(urlError)}
                disabled={isSubmitting}
              />
            </FormField>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '10px',
              }}
            >
              <FormField label="Environment Name" htmlFor="create-project-env-name">
                <Input
                  id="create-project-env-name"
                  value={envName}
                  onChange={e => setEnvName(e.target.value)}
                  placeholder="e.g. Staging / Production"
                  disabled={isSubmitting}
                />
              </FormField>

              <FormField label="Environment Type" htmlFor="create-project-env-type">
                <Select
                  id="create-project-env-type"
                  value={envType}
                  onChange={e => setEnvType(e.target.value as EnvironmentType)}
                  disabled={isSubmitting}
                >
                  <option value="DEVELOPMENT">Development</option>
                  <option value="LOCAL">Local</option>
                  <option value="STAGING">Staging</option>
                  <option value="PRODUCTION">Production</option>
                  <option value="QA">QA</option>
                  <option value="TEST">Test</option>
                </Select>
              </FormField>
            </div>
          </div>
        )}

        {targetMode === 'git' && (
          <div className="target-mode-config-box">
            <FormField
              label="Git Repository URL"
              htmlFor="create-project-git-url"
              description="HTTPS or SSH repository URL."
              error={gitError ?? undefined}
            >
              <Input
                id="create-project-git-url"
                value={gitUrl}
                onChange={e => handleGitUrlChange(e.target.value)}
                placeholder="e.g. https://github.com/organization/repository.git"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField
              label="Local Clone Directory (Optional)"
              htmlFor="create-project-git-clone"
              description="If already cloned locally, select the folder to track git commits and branch."
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input
                  id="create-project-git-clone"
                  value={gitLocalPath}
                  onChange={e => setGitLocalPath(e.target.value)}
                  placeholder="e.g. /Users/name/Projects/repo-clone"
                  disabled={isSubmitting}
                  style={{ flexGrow: 1 }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleBrowseFolder(true)}
                  disabled={isSubmitting}
                  title="Browse local clone directory"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                >
                  <BrowseFolderIcon />
                  <span>Browse...</span>
                </Button>
              </div>
            </FormField>

            <FormField
              label="Default Branch"
              htmlFor="create-project-git-branch"
              description="Primary branch for tests."
            >
              <Input
                id="create-project-git-branch"
                value={gitBranch}
                onChange={e => setGitBranch(e.target.value)}
                placeholder="e.g. main"
                disabled={isSubmitting}
              />
            </FormField>
          </div>
        )}

        {/* 3. Basic Project Information */}
        <FormField
          label="Project Name"
          htmlFor="create-project-name"
          required
          description="Maximum 120 characters."
          error={nameError ?? undefined}
        >
          <Input
            id="create-project-name"
            autoFocus
            value={name}
            onChange={e => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="e.g. E-Commerce Web App"
            invalid={Boolean(nameError)}
            disabled={isSubmitting}
          />
        </FormField>

        <FormField
          label="Description (Optional)"
          htmlFor="create-project-description"
          description="Summary or notes about this project (max 5000 chars)."
        >
          <Textarea
            id="create-project-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the application, scope, or quality objectives..."
            rows={3}
            disabled={isSubmitting}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
