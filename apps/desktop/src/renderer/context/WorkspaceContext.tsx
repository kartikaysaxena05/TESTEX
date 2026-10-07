/**
 * @file apps/desktop/src/renderer/context/WorkspaceContext.tsx
 * Context provider managing Workspace Sessions, Context/Evidence panel state,
 * and Shell Layout preferences.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type {
  WorkspaceSessionSummaryDto,
  WorkspaceSessionDto,
  ContextPanelDataDto,
} from '@ai-quality/contracts';
import { useProject } from './ProjectContext.js';

export type ContextTab = 'run' | 'evidence' | 'test' | 'failure' | 'requirement' | 'source';

export interface WorkspaceMessage {
  readonly id: string;
  readonly role: 'user' | 'agent' | 'tool';
  readonly content: string;
  readonly timestamp: string;
  readonly status?: 'pending' | 'completed' | 'info';
  readonly mode?: string;
}

export interface WorkspaceContextValue {
  readonly sessions: readonly WorkspaceSessionSummaryDto[];
  readonly activeSession: WorkspaceSessionDto | null;
  readonly activeSessionId: string | null;
  readonly isLoadingSessions: boolean;
  readonly isSidebarCollapsed: boolean;
  readonly isContextPanelCollapsed: boolean;
  readonly activeContextTab: ContextTab;
  readonly contextData: ContextPanelDataDto;
  readonly sessionMessages: readonly WorkspaceMessage[];
  readonly setActiveSessionId: (id: string | null) => void;
  readonly createSession: (title: string) => Promise<WorkspaceSessionDto | null>;
  readonly refreshSessions: () => Promise<void>;
  readonly toggleSidebar: () => void;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  readonly toggleContextPanel: () => void;
  readonly setContextPanelCollapsed: (collapsed: boolean) => void;
  readonly setActiveContextTab: (tab: ContextTab) => void;
  readonly setContextData: React.Dispatch<React.SetStateAction<ContextPanelDataDto>>;
  readonly addSessionMessage: (msg: Omit<WorkspaceMessage, 'id' | 'timestamp'>) => void;
  readonly clearSessionMessages: () => void;
  readonly registerComposerFocusHandler: (handler: () => void) => () => void;
  readonly focusComposer: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const DEFAULT_CONTEXT_DATA: ContextPanelDataDto = {
  activeTab: 'run',
};

export interface WorkspaceProviderProps {
  readonly children: React.ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps): React.JSX.Element {
  const { selectedProjectId } = useProject();

  const [sessions, setSessions] = useState<readonly WorkspaceSessionSummaryDto[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<WorkspaceSessionDto | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(false);

  const [isSidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isContextPanelCollapsed, setContextPanelCollapsed] = useState<boolean>(false);
  const [activeContextTab, setActiveContextTab] = useState<ContextTab>('run');
  const [contextData, setContextData] = useState<ContextPanelDataDto>(DEFAULT_CONTEXT_DATA);
  const [sessionMessages, setSessionMessages] = useState<readonly WorkspaceMessage[]>([]);

  // Monotonic token to prevent out-of-order session resolution race conditions
  const sessionTokenRef = React.useRef<number>(0);
  const composerFocusHandlerRef = React.useRef<(() => void) | null>(null);

  // Load layout preferences from bridge upon mount
  useEffect(() => {
    let isMounted = true;
    async function loadLayout() {
      if (!window.desktop?.shellLayout?.get) return;
      try {
        const result = await window.desktop.shellLayout.get();
        if (result.ok && isMounted) {
          setSidebarCollapsed(result.data.sidebarCollapsed);
          setContextPanelCollapsed(result.data.contextPanelCollapsed);
          setActiveContextTab(result.data.activeContextTab);
        }
      } catch {
        // Fallback to default
      }
    }
    void loadLayout();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch sessions whenever selectedProjectId changes
  const refreshSessions = useCallback(async () => {
    if (!selectedProjectId || !window.desktop?.workspaceSessions?.list) {
      setSessions([]);
      setActiveSessionId(null);
      setActiveSession(null);
      setSessionMessages([]);
      return;
    }

    setIsLoadingSessions(true);
    try {
      const result = await window.desktop.workspaceSessions.list({
        projectId: selectedProjectId,
      });
      if (result.ok) {
        setSessions(result.data);
        if (result.data.length > 0 && !activeSessionId) {
          setActiveSessionId(result.data[0]?.id ?? null);
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoadingSessions(false);
    }
  }, [selectedProjectId, activeSessionId]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  // Load active session details with monotonic token race guard
  useEffect(() => {
    if (!selectedProjectId || !activeSessionId || !window.desktop?.workspaceSessions?.get) {
      setActiveSession(null);
      return;
    }

    const token = ++sessionTokenRef.current;
    let isCancelled = false;

    async function loadSession() {
      try {
        const result = await window.desktop!.workspaceSessions.get({
          projectId: selectedProjectId!,
          sessionId: activeSessionId!,
        });
        if (!isCancelled && token === sessionTokenRef.current && result.ok) {
          setActiveSession(result.data);
        }
      } catch {
        if (!isCancelled && token === sessionTokenRef.current) {
          setActiveSession(null);
        }
      }
    }

    void loadSession();
    return () => {
      isCancelled = true;
    };
  }, [selectedProjectId, activeSessionId]);

  const createSession = useCallback(
    async (title: string): Promise<WorkspaceSessionDto | null> => {
      if (!selectedProjectId || !window.desktop?.workspaceSessions?.create) {
        return null;
      }
      try {
        const result = await window.desktop.workspaceSessions.create({
          projectId: selectedProjectId,
          title,
        });
        if (result.ok) {
          setActiveSessionId(result.data.id);
          setActiveSession(result.data);
          void refreshSessions();
          return result.data;
        }
      } catch {
        // Fallback
      }
      return null;
    },
    [selectedProjectId, refreshSessions],
  );

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      if (window.desktop?.shellLayout?.update) {
        void window.desktop.shellLayout.update({ sidebarCollapsed: next });
      }
      return next;
    });
  }, []);

  const toggleContextPanel = useCallback(() => {
    setContextPanelCollapsed(prev => {
      const next = !prev;
      if (window.desktop?.shellLayout?.update) {
        void window.desktop.shellLayout.update({ contextPanelCollapsed: next });
      }
      return next;
    });
  }, []);

  const handleSetTab = useCallback((tab: ContextTab) => {
    setActiveContextTab(tab);
    setContextData(prev => ({ ...prev, activeTab: tab }));
    if (window.desktop?.shellLayout?.update) {
      void window.desktop.shellLayout.update({ activeContextTab: tab });
    }
  }, []);

  const addSessionMessage = useCallback((msg: Omit<WorkspaceMessage, 'id' | 'timestamp'>) => {
    const newMessage: WorkspaceMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    setSessionMessages(prev => [...prev, newMessage]);
  }, []);

  const clearSessionMessages = useCallback(() => {
    setSessionMessages([]);
  }, []);

  const registerComposerFocusHandler = useCallback((handler: () => void) => {
    composerFocusHandlerRef.current = handler;
    return () => {
      if (composerFocusHandlerRef.current === handler) {
        composerFocusHandlerRef.current = null;
      }
    };
  }, []);

  const focusComposer = useCallback(() => {
    if (composerFocusHandlerRef.current) {
      composerFocusHandlerRef.current();
    }
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      sessions,
      activeSession,
      activeSessionId,
      isLoadingSessions,
      isSidebarCollapsed,
      isContextPanelCollapsed,
      activeContextTab,
      contextData,
      sessionMessages,
      setActiveSessionId,
      createSession,
      refreshSessions,
      toggleSidebar,
      setSidebarCollapsed,
      toggleContextPanel,
      setContextPanelCollapsed,
      setActiveContextTab: handleSetTab,
      setContextData,
      addSessionMessage,
      clearSessionMessages,
      registerComposerFocusHandler,
      focusComposer,
    }),
    [
      sessions,
      activeSession,
      activeSessionId,
      isLoadingSessions,
      isSidebarCollapsed,
      isContextPanelCollapsed,
      activeContextTab,
      contextData,
      sessionMessages,
      createSession,
      refreshSessions,
      toggleSidebar,
      toggleContextPanel,
      handleSetTab,
      addSessionMessage,
      clearSessionMessages,
      registerComposerFocusHandler,
      focusComposer,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
