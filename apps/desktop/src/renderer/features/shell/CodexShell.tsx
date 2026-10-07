/**
 * @file apps/desktop/src/renderer/features/shell/CodexShell.tsx
 * Master Codex-Style Product Shell Container for V8 Phase 111.
 * Assembles Header, Sidebar, Main Workspace, Context/Evidence Panel, and Command Composer.
 */

import React from 'react';
import type { AppInfo } from '@ai-quality/contracts';
import type { BridgeConnectionState } from '../../layout/TopBar.js';
import { ProjectHeaderBar } from './ProjectHeaderBar.js';
import { CodexSidebar } from './CodexSidebar.js';
import { MainAgentWorkspace } from './MainAgentWorkspace.js';
import { ContextEvidencePanel } from './ContextEvidencePanel.js';
import { CommandComposer } from './CommandComposer.js';
import { StatusBar } from '../../layout/StatusBar.js';
import { useWorkspace } from '../../context/WorkspaceContext.js';

export interface CodexShellProps {
  readonly bridgeState: BridgeConnectionState;
  readonly appInfo: AppInfo | null;
}

export function CodexShell({ bridgeState, appInfo }: CodexShellProps): React.JSX.Element {
  const { toggleSidebar, setContextPanelCollapsed, focusComposer } = useWorkspace();

  // Section 37: Global keyboard shortcuts (Cmd+K, Cmd+B, Escape)
  React.useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl + K -> Focus command composer
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusComposer();
        return;
      }

      // Cmd/Ctrl + B -> Toggle sidebar collapse
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Escape -> Close context panel or modals
      if (e.key === 'Escape') {
        setContextPanelCollapsed(true);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => {
        window.removeEventListener('keydown', handleGlobalKeyDown);
      };
    }
  }, [toggleSidebar, setContextPanelCollapsed, focusComposer]);

  return (
    <div className="codex-shell" data-testid="codex-shell">
      {/* 1. APP & PROJECT HEADER */}
      <ProjectHeaderBar bridgeState={bridgeState} />

      {/* 2. THREE-COLUMN CODEX WORKSPACE BODY */}
      <div className="codex-shell-body">
        {/* LEFT SIDEBAR */}
        <CodexSidebar />

        {/* MAIN WORKSPACE */}
        <main className="codex-main-workspace" data-testid="codex-main-workspace" tabIndex={-1}>
          <MainAgentWorkspace />
        </main>

        {/* RIGHT CONTEXT / EVIDENCE PANEL */}
        <ContextEvidencePanel />
      </div>

      {/* 3. COMMAND COMPOSER & ACTION BAR */}
      <CommandComposer />

      {/* 4. SYSTEM STATUS BAR */}
      <StatusBar bridgeState={bridgeState} appInfo={appInfo} />
    </div>
  );
}
