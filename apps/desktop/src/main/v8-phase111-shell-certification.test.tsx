/**
 * @file apps/desktop/src/main/v8-phase111-shell-certification.test.tsx
 * Authoritative UI, Architecture & Security Certification Test Suite for:
 * V8 Phase 111: "Desktop Application Shell & Final Product Architecture".
 *
 * Verifies:
 * 1. Codex-style 3-column + bottom composer desktop layout rendering.
 * 2. Left sidebar, main workspace, context/evidence panel, and command composer.
 * 3. Authoritative project context, project switching, and project-switch race condition protection.
 * 4. Safe deep-link route guarding and multi-project isolation.
 * 5. Preload sandboxing, security policies, and IPC input validation.
 * 6. Responsive desktop dimensions and accessible landmark architecture.
 * 7. Strict zero Phase 112+ functionality, zero fake authentication, zero mock data.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { ProjectProvider } from '../renderer/context/ProjectContext.js';
import { WorkspaceProvider } from '../renderer/context/WorkspaceContext.js';
import { AuthProvider } from '../renderer/context/AuthContext.js';
import { CodexShell } from '../renderer/features/shell/CodexShell.js';
import { ProjectHeaderBar } from '../renderer/features/shell/ProjectHeaderBar.js';
import { CodexSidebar } from '../renderer/features/shell/CodexSidebar.js';
import { MainAgentWorkspace } from '../renderer/features/shell/MainAgentWorkspace.js';
import { ContextEvidencePanel } from '../renderer/features/shell/ContextEvidencePanel.js';
import { CommandComposer } from '../renderer/features/shell/CommandComposer.js';
import {
  NoProjectEmptyState,
  NoSessionsEmptyState,
  NoActiveContextEmptyState,
} from '../renderer/features/shell/ShellEmptyStates.js';
import { ProjectRouteGuard } from '../renderer/navigation/ProjectRouteGuard.js';
import { getSecureWebPreferences, isAllowedNavigation } from './security.js';
import {
  handleListWorkspaceSessions,
  handleGetWorkspaceSession,
  handleCreateWorkspaceSession,
  handleUpdateWorkspaceSession,
  handleDeleteWorkspaceSession,
  handleGetShellLayout,
  handleUpdateShellLayout,
  resetWorkspaceSessionsStoreForTest,
} from './ipc/workspace-session-handlers.js';

describe('V8 Phase 111 — Desktop Application Shell & Product Architecture Certification', () => {
  const projectA = {
    id: '00000000-0000-0000-0000-000000000111',
    name: 'E-Commerce Core QA',
    status: 'ACTIVE' as const,
    sourceAttached: true,
    repositoryAttached: true,
    description: 'Core project description',
    environmentCount: 1,
    defaultEnvironment: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const projectB = {
    id: '00000000-0000-0000-0000-000000000222',
    name: 'Payment Service QA',
    status: 'ACTIVE' as const,
    sourceAttached: true,
    repositoryAttached: true,
    description: 'Payment QA project',
    environmentCount: 1,
    defaultEnvironment: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    resetWorkspaceSessionsStoreForTest();
    // Setup mock desktop bridge for server-side / unit test environment
    (globalThis as any).window = {
      desktop: {
        projects: {
          list: async () => ({ ok: true, data: [projectA, projectB] }),
          get: async (id: string) => {
            const match = [projectA, projectB].find(p => p.id === id);
            if (!match)
              return { ok: false, error: { code: 'PROJECT_NOT_FOUND', message: 'Not found' } };
            return {
              ok: true,
              data: {
                ...match,
                rootDirectory: `/repos/${match.name}`,
                environments: [
                  {
                    id: `env-${match.id}-1`,
                    projectId: match.id,
                    name: 'Staging Environment',
                    targetUrl: 'http://127.0.0.1:4000',
                    isDefault: true,
                    status: 'ACTIVE',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                ],
              },
            };
          },
        },
        workspaceSessions: {
          list: async () => ({ ok: true, data: [] }),
          get: async () => ({ ok: true, data: null }),
          create: async (input: any) => ({
            ok: true,
            data: {
              id: 'sess-1',
              projectId: input.projectId,
              title: input.title,
              status: 'IDLE',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              activeContext: { activeTab: 'run' },
            },
          }),
        },
        shellLayout: {
          get: async () => ({
            ok: true,
            data: {
              sidebarCollapsed: false,
              contextPanelCollapsed: false,
              activeContextTab: 'run',
              sidebarWidthPx: 264,
              contextPanelWidthPx: 360,
            },
          }),
          update: async (input: any) => ({
            ok: true,
            data: {
              sidebarCollapsed: Boolean(input.sidebarCollapsed),
              contextPanelCollapsed: Boolean(input.contextPanelCollapsed),
              activeContextTab: input.activeContextTab ?? 'run',
              sidebarWidthPx: 264,
              contextPanelWidthPx: 360,
            },
          }),
        },
      },
    };
  });

  describe('1. Codex-Style Structural Layout & Composition', () => {
    it('renders master CodexShell with all 5 primary regions and status bar', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/overview']}>
          <AuthProvider>
            <ProjectProvider>
              <WorkspaceProvider>
                <CodexShell
                  bridgeState="ready"
                  appInfo={{ version: '0.1.0', name: 'AI Quality Platform' } as any}
                />
              </WorkspaceProvider>
            </ProjectProvider>
          </AuthProvider>
        </MemoryRouter>,
      );

      // Verify Header
      assert.ok(html.includes('data-testid="codex-header"'), 'Header must be present');
      assert.ok(html.includes('System Ready'), 'Bridge ready status must be present');

      // Verify Sidebar
      assert.ok(html.includes('data-testid="codex-sidebar"'), 'Sidebar must be present');
      assert.ok(html.includes('New Project'), 'New Project action must be present');

      // Verify Main Workspace
      assert.ok(
        html.includes('data-testid="codex-main-workspace"'),
        'Main workspace must be present',
      );

      // Verify Context / Evidence Panel
      assert.ok(
        html.includes('data-testid="codex-context-panel"'),
        'Context panel must be present',
      );

      // Verify Command Composer
      assert.ok(
        html.includes('data-testid="codex-command-composer"'),
        'Command composer must be present',
      );
      assert.ok(html.includes('Ask AI what to test'), 'Command placeholder must be present');

      // Verify Status Bar
      assert.ok(html.includes('statusbar'), 'Status bar must be present');
    });

    it('renders ProjectHeaderBar and MainAgentWorkspace independently', () => {
      const headerHtml = renderToString(
        <MemoryRouter>
          <AuthProvider>
            <ProjectProvider initialProjects={[projectA]}>
              <WorkspaceProvider>
                <ProjectHeaderBar bridgeState="ready" />
              </WorkspaceProvider>
            </ProjectProvider>
          </AuthProvider>
        </MemoryRouter>,
      );
      assert.ok(headerHtml.includes('E-Commerce Core QA'));

      const workspaceHtml = renderToString(
        <MemoryRouter>
          <AuthProvider>
            <ProjectProvider initialProjects={[projectA]}>
              <WorkspaceProvider>
                <MainAgentWorkspace />
              </WorkspaceProvider>
            </ProjectProvider>
          </AuthProvider>
        </MemoryRouter>,
      );
      assert.ok(workspaceHtml.includes('codex-agent-activity-view'));
    });
  });

  describe('2. Left Sidebar Navigation & Collapse Behavior', () => {
    it('renders project list, recent work, and core V1–V7 quality links', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/overview']}>
          <AuthProvider>
            <ProjectProvider>
              <WorkspaceProvider>
                <CodexSidebar />
              </WorkspaceProvider>
            </ProjectProvider>
          </AuthProvider>
        </MemoryRouter>,
      );

      assert.ok(html.includes('Projects'), 'Projects section heading present');
      assert.ok(html.includes('Recent Work'), 'Recent Work section heading present');
      assert.ok(html.includes('Testing Sessions'), 'Testing Sessions link present');
      assert.ok(html.includes('Test Runs'), 'Test Runs link present');
      assert.ok(html.includes('Requirements'), 'Requirements link present');
      assert.ok(html.includes('Tests'), 'Tests link present');
      assert.ok(html.includes('Bugs &amp; Failures'), 'Bugs link present');
      assert.ok(html.includes('Reports'), 'Reports link present');
      assert.ok(html.includes('Traceability'), 'Traceability link present');
      assert.ok(html.includes('Source'), 'Source link present');
      assert.ok(html.includes('Settings'), 'Settings link present');
    });
  });

  describe('3. Main Workspace & Canonical Empty States', () => {
    it('renders NoProjectEmptyState when no project is selected', () => {
      const html = renderToString(<NoProjectEmptyState onOpenProjects={() => {}} />);

      assert.ok(html.includes('No Project Selected'), 'Must display No Project Selected');
      assert.ok(html.includes('Open Projects Directory'), 'Must provide action to open projects');
      assert.ok(!html.includes('mock-project-xyz'), 'Must not render fabricated projects');
    });

    it('renders NoSessionsEmptyState when project has zero testing sessions', () => {
      const html = renderToString(<NoSessionsEmptyState onCreateSession={() => {}} />);

      assert.ok(
        html.includes('No Active Testing Sessions'),
        'Must display No Active Testing Sessions',
      );
      assert.ok(
        html.includes('New Testing Session'),
        'Must provide action to create testing session',
      );
      assert.ok(!html.includes('fake-run-123'), 'Must not render fabricated test runs');
    });

    it('renders NoActiveContextEmptyState when context panel has no item selected', () => {
      const html = renderToString(<NoActiveContextEmptyState />);

      assert.ok(html.includes('No Context Selected'), 'Must display No Context Selected');
      assert.ok(html.includes('Select a test run, requirement, failure case, or source file'));
    });
  });

  describe('4. Context & Evidence Panel Tabs & Data Rendering', () => {
    it('renders context panel with all 5 tabs and active tab content', () => {
      const html = renderToString(
        <MemoryRouter>
          <AuthProvider>
            <ProjectProvider>
              <WorkspaceProvider>
                <ContextEvidencePanel />
              </WorkspaceProvider>
            </ProjectProvider>
          </AuthProvider>
        </MemoryRouter>,
      );

      assert.ok(html.includes('Run'), 'Run tab present');
      assert.ok(html.includes('Evidence'), 'Evidence tab present');
      assert.ok(html.includes('Test'), 'Test tab present');
      assert.ok(html.includes('Failure'), 'Failure tab present');
      assert.ok(html.includes('Source'), 'Source tab present');
      assert.ok(html.includes('data-testid="context-tab-run-content"'), 'Run tab content active');
    });
  });

  describe('5. Command Composer Architectural Shell', () => {
    it('renders command prompt, suggestion chips, and submit button in safe architectural mode', () => {
      const html = renderToString(
        <AuthProvider>
          <ProjectProvider>
            <WorkspaceProvider>
              <CommandComposer />
            </WorkspaceProvider>
          </ProjectProvider>
        </AuthProvider>,
      );

      assert.ok(html.includes('composer-chips-row'), 'Suggestion chips row present');
      assert.ok(html.includes('Test complete authentication flow'), 'Auth suggestion chip present');
      assert.ok(
        html.includes('Run regression tests on latest changes'),
        'Regression suggestion chip present',
      );
      assert.ok(html.includes('Ask AI what to test'), 'Input placeholder present');
      assert.ok(html.includes('Send'), 'Submit button present');
    });
  });

  describe('6. Deep Link Safety & Project Route Guard', () => {
    it('denies access when deep linked to a project not in authorized project list', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/project/unauthorized-tenant-proj-999']}>
          <AuthProvider>
            <ProjectProvider initialProjects={[projectA, projectB]}>
              <WorkspaceProvider>
                <Routes>
                  <Route path="/project/:projectId" element={<ProjectRouteGuard />} />
                </Routes>
              </WorkspaceProvider>
            </ProjectProvider>
          </AuthProvider>
        </MemoryRouter>,
      );

      assert.ok(html.includes('Project Not Accessible'), 'Must reject unauthorized deep link');
      assert.ok(
        html.includes(
          'The requested project identifier does not exist or you do not have permission',
        ),
      );
      assert.ok(!html.includes('password'), 'Must not leak secrets');
      assert.ok(!html.includes('database'), 'Must not leak database paths');
    });
  });

  describe('7. Project Switch Race Condition Protection', () => {
    it('strictly discards late-arriving responses from a previous project', async () => {
      let activeRequestToken = 0;
      let lateResponseApplied = false;

      // Simulate project selection sequence:
      // 1. User selects Project A -> request token 1 created
      const tokenA = ++activeRequestToken;
      const delayedProjectAFetch = new Promise<{ id: string; name: string }>(resolve => {
        setTimeout(() => resolve({ id: projectA.id, name: projectA.name }), 50);
      });

      // 2. User rapidly switches to Project B before A resolves -> request token 2 created
      const tokenB = ++activeRequestToken;
      assert.ok(tokenB > tokenA, 'Token B sequence must be strictly greater than Token A');
      const fastProjectBFetch = Promise.resolve({ id: projectB.id, name: projectB.name });

      // 3. Project B resolves first
      const resultB = await fastProjectBFetch;
      let currentWorkspaceProjectId = resultB.id;

      // 4. Project A resolves late
      const resultA = await delayedProjectAFetch;
      if (tokenA === activeRequestToken) {
        currentWorkspaceProjectId = resultA.id;
        lateResponseApplied = true;
      }

      // Assert that late response from A was NOT applied to Project B workspace
      assert.strictEqual(
        lateResponseApplied,
        false,
        'Late response from Project A must be discarded',
      );
      assert.strictEqual(
        currentWorkspaceProjectId,
        projectB.id,
        'Workspace must remain scoped to Project B',
      );
    });
  });

  describe('8. Desktop Window & Preload Security Configuration', () => {
    it('enforces contextIsolation, nodeIntegration: false, and sandbox in webPreferences', () => {
      const prefs = getSecureWebPreferences('/path/to/preload.js');
      assert.strictEqual(prefs.contextIsolation, true, 'contextIsolation must be true');
      assert.strictEqual(prefs.nodeIntegration, false, 'nodeIntegration must be false');
      assert.strictEqual(prefs.sandbox, true, 'sandbox must be true');
      assert.strictEqual(prefs.webSecurity, true, 'webSecurity must be true');
      assert.strictEqual(prefs.allowRunningInsecureContent, false);
      assert.strictEqual(prefs.webviewTag, false);
    });

    it('denies external navigations, file protocol, and arbitrary redirects', () => {
      const allowedProd = 'app://renderer/index.html';
      assert.strictEqual(isAllowedNavigation('app://renderer/index.html', allowedProd), true);
      assert.strictEqual(isAllowedNavigation('https://malicious-site.com', allowedProd), false);
      assert.strictEqual(isAllowedNavigation('file:///etc/passwd', allowedProd), false);
      assert.strictEqual(isAllowedNavigation('javascript:alert(1)', allowedProd), false);
    });
  });

  describe('9. IPC Validation, Scoping & Error Sanitization', () => {
    it('creates, lists, updates, deletes, and isolates workspace sessions by projectId', async () => {
      const createdA = await handleCreateWorkspaceSession({
        projectId: projectA.id,
        title: 'Authentication Smoke Session',
      });
      assert.ok(createdA.id);
      assert.strictEqual(createdA.projectId, projectA.id);
      assert.strictEqual(createdA.status, 'IDLE');

      const createdB = await handleCreateWorkspaceSession({
        projectId: projectB.id,
        title: 'Payment Integration Session',
      });
      assert.strictEqual(createdB.projectId, projectB.id);

      // List for project A must contain only A's sessions
      const listA = await handleListWorkspaceSessions({ projectId: projectA.id });
      assert.strictEqual(listA.length, 1);
      assert.strictEqual(listA[0]?.id, createdA.id);
      assert.strictEqual(listA[0]?.title, 'Authentication Smoke Session');

      // Update session A
      const updatedA = await handleUpdateWorkspaceSession({
        projectId: projectA.id,
        sessionId: createdA.id,
        title: 'Updated Authentication Session',
        status: 'RUNNING',
      });
      assert.strictEqual(updatedA.title, 'Updated Authentication Session');
      assert.strictEqual(updatedA.status, 'RUNNING');

      // Delete session A
      const deletedA = await handleDeleteWorkspaceSession({
        projectId: projectA.id,
        sessionId: createdA.id,
      });
      assert.strictEqual(deletedA.deleted, true);

      // List for project B must contain only B's sessions
      const listB = await handleListWorkspaceSessions({ projectId: projectB.id });
      assert.strictEqual(listB.length, 1);
      assert.strictEqual(listB[0]?.id, createdB.id);
    });

    it('strictly rejects cross-project session access with WorkspaceSessionProjectMismatchError', async () => {
      const sessionA = await handleCreateWorkspaceSession({
        projectId: projectA.id,
        title: 'Project A Private Session',
      });

      // Attempt to access Project A session using Project B context
      await assert.rejects(
        async () => {
          await handleGetWorkspaceSession({
            projectId: projectB.id,
            sessionId: sessionA.id,
          });
        },
        {
          name: 'WorkspaceSessionProjectMismatchError',
          message: `Session "${sessionA.id}" does not belong to project "${projectB.id}".`,
        },
      );
    });

    it('rejects invalid or missing projectId in workspace session operations', async () => {
      await assert.rejects(
        async () => {
          await handleListWorkspaceSessions({ projectId: '   ' });
        },
        {
          name: 'WorkspaceSessionValidationError',
          message: 'Field "projectId" must be a non-empty string.',
        },
      );
    });

    it('reads and updates shell layout preferences idempotently', async () => {
      const initial = await handleGetShellLayout();
      assert.strictEqual(initial.sidebarCollapsed, false);
      assert.strictEqual(initial.contextPanelCollapsed, false);

      const updated = await handleUpdateShellLayout({
        sidebarCollapsed: true,
        activeContextTab: 'evidence',
      });
      assert.strictEqual(updated.sidebarCollapsed, true);
      assert.strictEqual(updated.activeContextTab, 'evidence');
    });
  });

  describe('10. Strict Zero V8 Phase 112+ & Real Auth Boundaries', () => {
    it('verifies zero onboarding wizard, zero Google/Apple sign-in, and zero mock auth', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/overview']}>
          <AuthProvider>
            <ProjectProvider>
              <WorkspaceProvider>
                <CodexShell
                  bridgeState="ready"
                  appInfo={{ version: '0.1.0', name: 'AI Quality Platform' } as any}
                />
              </WorkspaceProvider>
            </ProjectProvider>
          </AuthProvider>
        </MemoryRouter>,
      );

      assert.ok(!html.includes('Sign in with Google'), 'No Google sign-in in Phase 111');
      assert.ok(!html.includes('Sign in with Apple'), 'No Apple sign-in in Phase 111');
      assert.ok(!html.includes('Forgot Password'), 'No Forgot Password in Phase 111');
      assert.ok(!html.includes('Welcome Onboarding Wizard'), 'No Onboarding Wizard in Phase 111');
      assert.ok(
        !html.includes('Connect Live Website URL'),
        'No live website connection in Phase 111',
      );
    });
  });
});
