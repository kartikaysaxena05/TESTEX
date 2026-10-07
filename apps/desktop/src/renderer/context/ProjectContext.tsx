/**
 * @file apps/desktop/src/renderer/context/ProjectContext.tsx
 * Authoritative project selection, lifecycle operations, active project state,
 * and Phase 119 website target management provider.
 *
 * CRITICAL INVARIANTS:
 * 1. Single authoritative project context across all UI panels.
 * 2. Project Switch Race Condition Protection: Monotonic sequence tokens ensure
 *    late-arriving asynchronous responses from Project A are strictly discarded
 *    and cannot overwrite Project B.
 * 3. Multi-User Isolation: Active project context and project caches are strictly purged
 *    on user logout or user switching.
 * 4. Truthful Source State: Unconnected projects expose neutral NOT_CONFIGURED state;
 *    projects with website targets report WEBSITE_CONFIGURED.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type {
  ProjectSummary,
  ProjectDetails,
  ProjectEnvironmentDto,
  CreateProjectInput,
  UpdateProjectInput,
  WebsiteTargetSummary,
  WebsiteTargetDetails,
  CreateWebsiteTargetInput,
  UpdateWebsiteTargetInput,
  TestWebsiteTargetConnectionInput,
  ConfirmWebsiteTargetAuthInput,
  ConnectivityCheckResultDto,
  RepositoryConnectionSummary,
  RepositoryConnectionDetails,
  CreateRepositoryConnectionInput,
  UpdateRepositoryConnectionInput,
  RepositoryVerificationResultDto,
  RepositoryImportResultDto,
  LocalFolderConnectionDto,
  ConnectLocalFolderInput,
  TargetEnvironmentConfigDto,
} from "@ai-quality/contracts";
import { AuthContext } from "./AuthContext.js";

export type ProjectSourceType = "WEBSITE" | "REPOSITORY" | "LOCAL_FOLDER" | "RUNNING_APP" | null;

export interface ProjectContextValue {
  readonly projects: readonly ProjectSummary[];
  readonly activeProjects: readonly ProjectSummary[];
  readonly recentProjects: readonly ProjectSummary[];
  readonly archivedProjects: readonly ProjectSummary[];
  readonly favoriteProjects: readonly ProjectSummary[];
  readonly selectedProjectId: string | null;
  readonly selectedProject: ProjectSummary | null;
  readonly selectedProjectDetails: ProjectDetails | null;
  readonly activeEnvironment: ProjectEnvironmentDto | null;
  readonly sourceType: ProjectSourceType;
  readonly isLoading: boolean;
  readonly isLoadingDetails: boolean;
  readonly error: string | null;
  readonly searchQuery: string;
  readonly sortBy: "recent" | "created" | "name";
  readonly filterStatus: "ACTIVE" | "ARCHIVED" | "ALL";

  // Actions
  readonly setSearchQuery: (query: string) => void;
  readonly setSortBy: (sort: "recent" | "created" | "name") => void;
  readonly setFilterStatus: (status: "ACTIVE" | "ARCHIVED" | "ALL") => void;
  readonly refreshProjects: () => Promise<void>;
  readonly setSelectedProjectId: (id: string | null) => void;
  readonly setActiveEnvironment: (env: ProjectEnvironmentDto | null) => void;
  readonly selectProjectOnCreate: (project: ProjectDetails) => void;

  // Phase 118 Lifecycle Operations
  readonly createProject: (input: CreateProjectInput) => Promise<ProjectDetails>;
  readonly updateProject: (input: UpdateProjectInput) => Promise<ProjectDetails>;
  readonly renameProject: (projectId: string, name: string) => Promise<ProjectDetails>;
  readonly archiveProject: (projectId: string) => Promise<ProjectDetails>;
  readonly restoreProject: (projectId: string) => Promise<ProjectDetails>;
  readonly deleteProject: (projectId: string) => Promise<{ readonly deleted: true }>;
  readonly markOpened: (projectId: string) => Promise<void>;

  // Phase 119 Website Target Operations
  readonly websiteTargets: readonly WebsiteTargetSummary[];
  readonly activeWebsiteTarget: WebsiteTargetSummary | null;
  readonly createWebsiteTarget: (input: CreateWebsiteTargetInput) => Promise<WebsiteTargetDetails>;
  readonly updateWebsiteTarget: (input: UpdateWebsiteTargetInput) => Promise<WebsiteTargetDetails>;
  readonly deleteWebsiteTarget: (targetId: string) => Promise<{ readonly deleted: true }>;
  readonly setActiveWebsiteTarget: (targetId: string) => Promise<WebsiteTargetDetails>;
  readonly testWebsiteTargetConnection: (input: TestWebsiteTargetConnectionInput) => Promise<ConnectivityCheckResultDto>;
  readonly confirmWebsiteTargetAuth: (input: ConfirmWebsiteTargetAuthInput) => Promise<WebsiteTargetDetails>;
  readonly refreshWebsiteTargets: () => Promise<void>;

  // Phase 120 Repository Connection Operations
  readonly repositoryConnections: readonly RepositoryConnectionSummary[];
  readonly activeRepositoryConnection: RepositoryConnectionSummary | null;
  readonly createRepositoryConnection: (input: CreateRepositoryConnectionInput) => Promise<RepositoryConnectionDetails>;
  readonly updateRepositoryConnection: (input: UpdateRepositoryConnectionInput) => Promise<RepositoryConnectionDetails>;
  readonly deleteRepositoryConnection: (connectionId: string) => Promise<{ readonly deleted: true }>;
  readonly setActiveRepositoryConnection: (connectionId: string) => Promise<RepositoryConnectionDetails>;
  readonly verifyRepositoryConnection: (connectionId: string) => Promise<RepositoryVerificationResultDto>;
  readonly importRepository: (connectionId: string, branch?: string, revision?: string) => Promise<RepositoryImportResultDto>;
  readonly cancelRepositoryImport: (connectionId: string) => Promise<{ readonly cancelled: true }>;
  readonly refreshRepositoryConnections: () => Promise<void>;

  // Phase 121 Local Folder Operations
  readonly localFolder: LocalFolderConnectionDto | null;
  readonly connectLocalFolder: (input: ConnectLocalFolderInput) => Promise<LocalFolderConnectionDto>;
  readonly disconnectLocalFolder: (projectId: string) => Promise<{ readonly disconnected: true }>;
  readonly validateLocalFolder: (projectId: string) => Promise<LocalFolderConnectionDto>;

  // Phase 122 Target Environment Operations
  readonly targetEnvironments: readonly TargetEnvironmentConfigDto[];
  readonly activeTargetEnvironment: TargetEnvironmentConfigDto | null;
  readonly refreshTargetEnvironments: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export interface ProjectProviderProps {
  readonly children: React.ReactNode;
  readonly initialProjects?: readonly ProjectSummary[];
  readonly initialSelectedProjectId?: string | null;
}

export function ProjectProvider({
  children,
  initialProjects,
  initialSelectedProjectId,
}: ProjectProviderProps): React.JSX.Element {
  const auth = useContext(AuthContext);
  const currentUserId = auth?.user?.id ?? null;
  const isAuthenticated = auth?.isAuthenticated ?? false;

  const [projects, setProjects] = useState<readonly ProjectSummary[]>(initialProjects ?? []);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialSelectedProjectId !== undefined
      ? initialSelectedProjectId
      : (initialProjects?.[0]?.id ?? null),
  );
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<ProjectDetails | null>(null);
  const [activeEnvironment, setActiveEnvironment] = useState<ProjectEnvironmentDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(initialProjects ? false : true);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"recent" | "created" | "name">("recent");
  const [filterStatus, setFilterStatus] = useState<"ACTIVE" | "ARCHIVED" | "ALL">("ACTIVE");

  // Monotonic token to prevent out-of-order / race condition async resolution
  const requestTokenRef = useRef<number>(0);
  const prevUserIdRef = useRef<string | null>(currentUserId);

  // Clear workspace state on user logout or user change
  useEffect(() => {
    if (!isAuthenticated || currentUserId !== prevUserIdRef.current) {
      setProjects([]);
      setSelectedProjectId(null);
      setSelectedProjectDetails(null);
      setActiveEnvironment(null);
      setError(null);
      prevUserIdRef.current = currentUserId;
    }
  }, [isAuthenticated, currentUserId]);

  const refreshProjects = useCallback(async () => {
    if (!window.desktop?.projects?.list) {
      setIsLoading(false);
      return;
    }

    try {
      const result = await window.desktop.projects.list({ status: "ALL" });
      if (result.ok) {
        setProjects(result.data);
        setError(null);

        // If the selected project was archived or deleted, reset selection
        if (selectedProjectId) {
          const matchingActive = result.data.find(
            p => p.id === selectedProjectId && p.status === "ACTIVE",
          );
          if (!matchingActive) {
            setSelectedProjectId(null);
            setSelectedProjectDetails(null);
            setActiveEnvironment(null);
          }
        }
      } else {
        setError(result.error.message);
      }
    } catch {
      setError("Failed to fetch projects.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (isAuthenticated) {
      void refreshProjects();
    }
  }, [isAuthenticated, refreshProjects]);

  const refreshSelectedProjectDetails = useCallback(async () => {
    if (!selectedProjectId || !window.desktop?.projects?.get) {
      return;
    }

    try {
      const result = await window.desktop.projects.get(selectedProjectId);
      if (result.ok && result.data) {
        setSelectedProjectDetails(result.data);
        const defaultEnv =
          result.data.environments?.find(e => e.isDefault) ??
          result.data.environments?.[0] ??
          null;
        setActiveEnvironment(defaultEnv);
      }
    } catch {
      // Ignore background refresh errors
    }
  }, [selectedProjectId]);

  // Handle project selection and race condition prevention
  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedProjectDetails(null);
      setActiveEnvironment(null);
      setIsLoadingDetails(false);
      return;
    }

    // Immediately clear previous project details to prevent stale bleed
    setSelectedProjectDetails(null);
    setActiveEnvironment(null);
    setIsLoadingDetails(true);

    const token = ++requestTokenRef.current;
    let isCancelled = false;

    // Asynchronously record project open recency timestamp
    if (window.desktop?.projects?.markOpened) {
      window.desktop.projects.markOpened({ projectId: selectedProjectId }).catch(() => {});
    }

    async function fetchProjectDetails() {
      if (!window.desktop?.projects?.get) {
        setIsLoadingDetails(false);
        return;
      }

      try {
        const result = await window.desktop.projects.get(selectedProjectId!);
        // Discard if user switched to another project while this was in-flight
        if (isCancelled || token !== requestTokenRef.current) {
          return;
        }

        if (result.ok && result.data) {
          setSelectedProjectDetails(result.data);
          // Set default environment if available
          const defaultEnv =
            result.data.environments?.find(e => e.isDefault) ??
            result.data.environments?.[0] ??
            null;
          setActiveEnvironment(defaultEnv);
        } else if (!result.ok) {
          setError(result.error.message);
        }
      } catch {
        // Discard on error if cancelled
      } finally {
        if (!isCancelled && token === requestTokenRef.current) {
          setIsLoadingDetails(false);
        }
      }
    }

    void fetchProjectDetails();

    return () => {
      isCancelled = true;
    };
  }, [selectedProjectId]);

  // Sorting & Filtering logic
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // Status filter
    if (filterStatus === "ACTIVE") {
      result = result.filter(p => p.status === "ACTIVE");
    } else if (filterStatus === "ARCHIVED") {
      result = result.filter(p => p.status === "ARCHIVED");
    }

    // Search query
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      );
    }

    // Sort order: Favorites always pin to top
    result.sort((a, b) => {
      const favA = a.isFavorite ? 1 : 0;
      const favB = b.isFavorite ? 1 : 0;
      if (favA !== favB) return favB - favA;

      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "created") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else {
        // "recent": lastOpenedAt nulls last, then updatedAt desc
        const openA = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : 0;
        const openB = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : 0;
        if (openA !== openB) return openB - openA;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return result;
  }, [projects, filterStatus, searchQuery, sortBy]);

  const activeProjects = useMemo(() => {
    return filteredProjects.filter(p => p.status === "ACTIVE");
  }, [filteredProjects]);

  const archivedProjects = useMemo(() => {
    return projects.filter(p => p.status === "ARCHIVED");
  }, [projects]);

  const favoriteProjects = useMemo(() => {
    return projects.filter(p => p.isFavorite && p.status === "ACTIVE");
  }, [projects]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .filter(p => p.status === "ACTIVE")
      .sort((a, b) => {
        const timeA = a.lastOpenedAt
          ? new Date(a.lastOpenedAt).getTime()
          : new Date(a.updatedAt).getTime();
        const timeB = b.lastOpenedAt
          ? new Date(b.lastOpenedAt).getTime()
          : new Date(b.updatedAt).getTime();
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [projects]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return projects.find(p => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const sourceType = useMemo<ProjectSourceType>(() => {
    if (!selectedProjectDetails) return null;
    if (
      selectedProjectDetails.sourceState === "WEBSITE_CONFIGURED" ||
      (selectedProjectDetails.websiteTargets && selectedProjectDetails.websiteTargets.length > 0)
    ) {
      return "WEBSITE";
    }
    if (
      selectedProjectDetails.sourceState === "REPOSITORY_CONFIGURED" ||
      selectedProjectDetails.sourceState === "BOTH_CONFIGURED" ||
      (selectedProjectDetails.repositoryConnections && selectedProjectDetails.repositoryConnections.length > 0)
    ) {
      return "REPOSITORY";
    }
    if (
      selectedProjectDetails.sourceState === "LOCAL_FOLDER_CONFIGURED" ||
      selectedProjectDetails.localFolder
    ) {
      return "LOCAL_FOLDER";
    }
    return null;
  }, [selectedProjectDetails]);

  const localFolder = useMemo<LocalFolderConnectionDto | null>(() => {
    return selectedProjectDetails?.localFolder ?? null;
  }, [selectedProjectDetails]);

  const websiteTargets = useMemo<readonly WebsiteTargetSummary[]>(() => {
    return selectedProjectDetails?.websiteTargets ?? [];
  }, [selectedProjectDetails]);

  const activeWebsiteTarget = useMemo<WebsiteTargetSummary | null>(() => {
    return selectedProjectDetails?.activeWebsiteTarget ?? null;
  }, [selectedProjectDetails]);

  const repositoryConnections = useMemo<readonly RepositoryConnectionSummary[]>(() => {
    return selectedProjectDetails?.repositoryConnections ?? [];
  }, [selectedProjectDetails]);

  const activeRepositoryConnection = useMemo<RepositoryConnectionSummary | null>(() => {
    return selectedProjectDetails?.activeRepositoryConnection ?? null;
  }, [selectedProjectDetails]);

  const selectProjectOnCreate = useCallback((project: ProjectDetails) => {
    setSelectedProjectId(project.id);
  }, []);

  // Phase 118 Lifecycle Operations
  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<ProjectDetails> => {
      if (!window.desktop?.projects?.create) {
        throw new Error("Project creation IPC is unavailable.");
      }
      const res = await window.desktop.projects.create(input);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      return res.data;
    },
    [refreshProjects],
  );

  const updateProject = useCallback(
    async (input: UpdateProjectInput): Promise<ProjectDetails> => {
      if (!window.desktop?.projects?.update) {
        throw new Error("Project update IPC is unavailable.");
      }
      const res = await window.desktop.projects.update(input);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      if (selectedProjectId === input.projectId) {
        setSelectedProjectDetails(res.data);
      }
      return res.data;
    },
    [refreshProjects, selectedProjectId],
  );

  const renameProject = useCallback(
    async (projectId: string, name: string): Promise<ProjectDetails> => {
      return updateProject({ projectId, name });
    },
    [updateProject],
  );

  const archiveProject = useCallback(
    async (projectId: string): Promise<ProjectDetails> => {
      if (!window.desktop?.projects?.archive) {
        throw new Error("Project archive IPC is unavailable.");
      }
      const res = await window.desktop.projects.archive(projectId);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      if (selectedProjectId === projectId) {
        setSelectedProjectDetails(res.data);
      }
      return res.data;
    },
    [refreshProjects, selectedProjectId],
  );

  const restoreProject = useCallback(
    async (projectId: string): Promise<ProjectDetails> => {
      if (!window.desktop?.projects?.restore) {
        throw new Error("Project restore IPC is unavailable.");
      }
      const res = await window.desktop.projects.restore(projectId);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      if (selectedProjectId === projectId) {
        setSelectedProjectDetails(res.data);
      }
      return res.data;
    },
    [refreshProjects, selectedProjectId],
  );

  const deleteProject = useCallback(
    async (projectId: string): Promise<{ readonly deleted: true }> => {
      if (!window.desktop?.projects?.delete) {
        throw new Error("Project delete IPC is unavailable.");
      }
      const res = await window.desktop.projects.delete(projectId);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
        setSelectedProjectDetails(null);
        setActiveEnvironment(null);
      }
      await refreshProjects();
      return res.data;
    },
    [refreshProjects, selectedProjectId],
  );

  const markOpened = useCallback(async (projectId: string): Promise<void> => {
    if (window.desktop?.projects?.markOpened) {
      await window.desktop.projects.markOpened({ projectId });
    }
  }, []);

  // Phase 119 Website Target Operations
  const createWebsiteTarget = useCallback(
    async (input: CreateWebsiteTargetInput): Promise<WebsiteTargetDetails> => {
      if (!window.desktop?.websiteTargets?.create) {
        throw new Error("Website target creation IPC is unavailable.");
      }
      const res = await window.desktop.websiteTargets.create(input);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      if (selectedProjectId === input.projectId) {
        await refreshSelectedProjectDetails();
      }
      return res.data;
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  const updateWebsiteTarget = useCallback(
    async (input: UpdateWebsiteTargetInput): Promise<WebsiteTargetDetails> => {
      if (!window.desktop?.websiteTargets?.update) {
        throw new Error("Website target update IPC is unavailable.");
      }
      const res = await window.desktop.websiteTargets.update(input);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      if (selectedProjectId) {
        await refreshSelectedProjectDetails();
      }
      return res.data;
    },
    [selectedProjectId, refreshSelectedProjectDetails],
  );

  const deleteWebsiteTarget = useCallback(
    async (targetId: string): Promise<{ readonly deleted: true }> => {
      if (!window.desktop?.websiteTargets?.delete) {
        throw new Error("Website target delete IPC is unavailable.");
      }
      if (!selectedProjectId) {
        throw new Error("No active project selected.");
      }
      const res = await window.desktop.websiteTargets.delete({
        projectId: selectedProjectId,
        targetId,
      });
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      await refreshSelectedProjectDetails();
      return res.data;
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  const setActiveWebsiteTarget = useCallback(
    async (targetId: string): Promise<WebsiteTargetDetails> => {
      if (!window.desktop?.websiteTargets?.setActive) {
        throw new Error("Website target setActive IPC is unavailable.");
      }
      if (!selectedProjectId) {
        throw new Error("No active project selected.");
      }
      const res = await window.desktop.websiteTargets.setActive({
        projectId: selectedProjectId,
        targetId,
      });
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      await refreshSelectedProjectDetails();
      return res.data;
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  const testWebsiteTargetConnection = useCallback(
    async (input: TestWebsiteTargetConnectionInput): Promise<ConnectivityCheckResultDto> => {
      if (!window.desktop?.websiteTargets?.testConnection) {
        throw new Error("Website target connectivity test IPC is unavailable.");
      }
      const res = await window.desktop.websiteTargets.testConnection(input);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    [],
  );

  const confirmWebsiteTargetAuth = useCallback(
    async (input: ConfirmWebsiteTargetAuthInput): Promise<WebsiteTargetDetails> => {
      if (!window.desktop?.websiteTargets?.confirmAuth) {
        throw new Error("Website target confirmAuth IPC is unavailable.");
      }
      const res = await window.desktop.websiteTargets.confirmAuth(input);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      if (selectedProjectId) {
        await refreshSelectedProjectDetails();
      }
      return res.data;
    },
    [selectedProjectId, refreshSelectedProjectDetails],
  );

  const refreshWebsiteTargets = useCallback(async (): Promise<void> => {
    if (selectedProjectId) {
      await refreshSelectedProjectDetails();
    }
  }, [selectedProjectId, refreshSelectedProjectDetails]);

  // Phase 120 Repository Connection Operations
  const createRepositoryConnection = useCallback(
    async (input: CreateRepositoryConnectionInput): Promise<RepositoryConnectionDetails> => {
      if (!window.desktop?.repositoryConnections?.create) {
        throw new Error("Repository connection create IPC is unavailable.");
      }
      const res = await window.desktop.repositoryConnections.create(input);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      if (selectedProjectId === input.projectId) {
        await refreshSelectedProjectDetails();
      }
      return res.data;
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  const updateRepositoryConnection = useCallback(
    async (input: UpdateRepositoryConnectionInput): Promise<RepositoryConnectionDetails> => {
      if (!window.desktop?.repositoryConnections?.update) {
        throw new Error("Repository connection update IPC is unavailable.");
      }
      const res = await window.desktop.repositoryConnections.update(input);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      if (selectedProjectId === input.projectId) {
        await refreshSelectedProjectDetails();
      }
      return res.data;
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  const deleteRepositoryConnection = useCallback(
    async (connectionId: string): Promise<{ readonly deleted: true }> => {
      if (!window.desktop?.repositoryConnections?.delete) {
        throw new Error("Repository connection delete IPC is unavailable.");
      }
      if (!selectedProjectId) {
        throw new Error("No active project selected.");
      }
      const res = await window.desktop.repositoryConnections.delete({
        projectId: selectedProjectId,
        connectionId,
      });
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      await refreshSelectedProjectDetails();
      return res.data;
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  const setActiveRepositoryConnection = useCallback(
    async (connectionId: string): Promise<RepositoryConnectionDetails> => {
      if (!window.desktop?.repositoryConnections?.setActive) {
        throw new Error("Repository connection setActive IPC is unavailable.");
      }
      if (!selectedProjectId) {
        throw new Error("No active project selected.");
      }
      const res = await window.desktop.repositoryConnections.setActive({
        projectId: selectedProjectId,
        connectionId,
      });
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      await refreshSelectedProjectDetails();
      return res.data;
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  const verifyRepositoryConnection = useCallback(
    async (connectionId: string): Promise<RepositoryVerificationResultDto> => {
      if (!window.desktop?.repositoryConnections?.verify) {
        throw new Error("Repository connection verify IPC is unavailable.");
      }
      if (!selectedProjectId) {
        throw new Error("No active project selected.");
      }
      const res = await window.desktop.repositoryConnections.verify({
        projectId: selectedProjectId,
        connectionId,
      });
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    [selectedProjectId],
  );

  const importRepository = useCallback(
    async (connectionId: string, branch?: string, revision?: string): Promise<RepositoryImportResultDto> => {
      if (!window.desktop?.repositoryConnections?.import) {
        throw new Error("Repository import IPC is unavailable.");
      }
      if (!selectedProjectId) {
        throw new Error("No active project selected.");
      }
      const res = await window.desktop.repositoryConnections.import({
        projectId: selectedProjectId,
        connectionId,
        branch,
        revision,
      });
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      await refreshSelectedProjectDetails();
      return res.data;
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  const cancelRepositoryImport = useCallback(
    async (connectionId: string): Promise<{ readonly cancelled: true }> => {
      if (!window.desktop?.repositoryConnections?.cancelImport) {
        throw new Error("Repository cancelImport IPC is unavailable.");
      }
      if (!selectedProjectId) {
        throw new Error("No active project selected.");
      }
      const res = await window.desktop.repositoryConnections.cancelImport({
        projectId: selectedProjectId,
        connectionId,
      });
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    [selectedProjectId],
  );

  const refreshRepositoryConnections = useCallback(async (): Promise<void> => {
    if (selectedProjectId) {
      await refreshSelectedProjectDetails();
    }
  }, [selectedProjectId, refreshSelectedProjectDetails]);

  // Phase 121 Local Folder Operations
  const connectLocalFolder = useCallback(
    async (input: ConnectLocalFolderInput): Promise<LocalFolderConnectionDto> => {
      if (!window.desktop?.localFolder?.connect) {
        throw new Error("Local folder connect IPC is unavailable.");
      }
      const res = await window.desktop.localFolder.connect(input);
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      if (selectedProjectId === input.projectId) {
        await refreshSelectedProjectDetails();
      }
      return res.data;
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  const disconnectLocalFolder = useCallback(
    async (projectId: string): Promise<{ readonly disconnected: true }> => {
      if (!window.desktop?.localFolder?.disconnect) {
        throw new Error("Local folder disconnect IPC is unavailable.");
      }
      const res = await window.desktop.localFolder.disconnect({ projectId });
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      if (selectedProjectId === projectId) {
        await refreshSelectedProjectDetails();
      }
      return { disconnected: true };
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  const validateLocalFolder = useCallback(
    async (projectId: string): Promise<LocalFolderConnectionDto> => {
      if (!window.desktop?.localFolder?.validate) {
        throw new Error("Local folder validate IPC is unavailable.");
      }
      const res = await window.desktop.localFolder.validate({ projectId });
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      await refreshProjects();
      if (selectedProjectId === projectId) {
        await refreshSelectedProjectDetails();
      }
      return res.data;
    },
    [refreshProjects, selectedProjectId, refreshSelectedProjectDetails],
  );

  // Phase 122 Target Environment Operations
  const [targetEnvironments, setTargetEnvironments] = useState<readonly TargetEnvironmentConfigDto[]>([]);

  const refreshTargetEnvironments = useCallback(async (): Promise<void> => {
    if (!selectedProjectId || !window.desktop?.targetEnvironment?.list) {
      setTargetEnvironments([]);
      return;
    }
    try {
      const res = await window.desktop.targetEnvironment.list({ projectId: selectedProjectId });
      if (res.ok) {
        setTargetEnvironments(res.data);
      }
    } catch (err) {
      console.error("Failed to load target environments:", err);
    }
  }, [selectedProjectId]);

  const activeTargetEnvironment = useMemo<TargetEnvironmentConfigDto | null>(() => {
    return targetEnvironments.find(e => e.isDefault) ?? targetEnvironments[0] ?? null;
  }, [targetEnvironments]);

  useEffect(() => {
    void refreshTargetEnvironments();
  }, [refreshTargetEnvironments]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      activeProjects,
      recentProjects,
      archivedProjects,
      favoriteProjects,
      selectedProjectId,
      selectedProject,
      selectedProjectDetails,
      activeEnvironment,
      sourceType,
      isLoading,
      isLoadingDetails,
      error,
      searchQuery,
      sortBy,
      filterStatus,
      setSearchQuery,
      setSortBy,
      setFilterStatus,
      refreshProjects,
      setSelectedProjectId,
      setActiveEnvironment,
      selectProjectOnCreate,
      createProject,
      updateProject,
      renameProject,
      archiveProject,
      restoreProject,
      deleteProject,
      markOpened,
      websiteTargets,
      activeWebsiteTarget,
      createWebsiteTarget,
      updateWebsiteTarget,
      deleteWebsiteTarget,
      setActiveWebsiteTarget,
      testWebsiteTargetConnection,
      confirmWebsiteTargetAuth,
      refreshWebsiteTargets,
      repositoryConnections,
      activeRepositoryConnection,
      createRepositoryConnection,
      updateRepositoryConnection,
      deleteRepositoryConnection,
      setActiveRepositoryConnection,
      verifyRepositoryConnection,
      importRepository,
      cancelRepositoryImport,
      refreshRepositoryConnections,
      localFolder,
      connectLocalFolder,
      disconnectLocalFolder,
      validateLocalFolder,
      targetEnvironments,
      activeTargetEnvironment,
      refreshTargetEnvironments,
    }),
    [
      projects,
      activeProjects,
      recentProjects,
      archivedProjects,
      favoriteProjects,
      selectedProjectId,
      selectedProject,
      selectedProjectDetails,
      activeEnvironment,
      sourceType,
      isLoading,
      isLoadingDetails,
      error,
      searchQuery,
      sortBy,
      filterStatus,
      refreshProjects,
      selectProjectOnCreate,
      createProject,
      updateProject,
      renameProject,
      archiveProject,
      restoreProject,
      deleteProject,
      markOpened,
      websiteTargets,
      activeWebsiteTarget,
      createWebsiteTarget,
      updateWebsiteTarget,
      deleteWebsiteTarget,
      setActiveWebsiteTarget,
      testWebsiteTargetConnection,
      confirmWebsiteTargetAuth,
      refreshWebsiteTargets,
      repositoryConnections,
      activeRepositoryConnection,
      createRepositoryConnection,
      updateRepositoryConnection,
      deleteRepositoryConnection,
      setActiveRepositoryConnection,
      verifyRepositoryConnection,
      importRepository,
      cancelRepositoryImport,
      refreshRepositoryConnections,
      localFolder,
      connectLocalFolder,
      disconnectLocalFolder,
      validateLocalFolder,
      targetEnvironments,
      activeTargetEnvironment,
      refreshTargetEnvironments,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}
