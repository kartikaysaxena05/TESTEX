/**
 * @file apps/desktop/src/renderer/features/projects/EmptyProjectSourceSelection.tsx
 * Truthful empty project onboarding screen showing Section 11 / 28 / 32 source choices.
 *
 * CRITICAL INVARIANTS:
 * 1. Zero fake test statistics, pass rates, or readiness verdicts.
 * 2. In Phase 119, Website target connection is fully activated via AddWebsiteTargetModal.
 * 3. In Phase 120, Repository connection & import is fully activated via ConnectRepositoryModal.
 * 4. Local Folder (121), Browser App (122) maintain strict phase boundaries.
 * 5. Never attempts automated crawling or arbitrary repository cloning outside bounded imports.
 */

import React, { useState } from "react";
import type {
  ProjectDetails,
  WebsiteTargetDetails,
  RepositoryConnectionDetails,
  LocalFolderConnectionDto,
  TargetEnvironmentConfigDto,
} from "@ai-quality/contracts";
import { Badge } from "../../ui/Badge.js";
import { AddWebsiteTargetModal } from "./AddWebsiteTargetModal.js";
import { ConnectRepositoryModal } from "./ConnectRepositoryModal.js";
import { ConnectLocalFolderModal } from "./ConnectLocalFolderModal.js";
import { TargetEnvironmentConfigModal } from "../environments/TargetEnvironmentConfigModal.js";

export interface EmptyProjectSourceSelectionProps {
  readonly project: ProjectDetails;
  readonly onWebsiteAdded?: (target: WebsiteTargetDetails) => void;
  readonly onRepositoryConnected?: (connection: RepositoryConnectionDetails) => void;
  readonly onLocalFolderConnected?: (connection: LocalFolderConnectionDto) => void;
  readonly onTargetEnvironmentConfigured?: (env: TargetEnvironmentConfigDto) => void;
}

interface SourceOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly phaseBadge: string;
  readonly isAvailable: boolean;
  readonly icon: React.ReactNode;
  readonly boundaryNotice?: string;
}

export function EmptyProjectSourceSelection({
  project,
  onWebsiteAdded,
  onRepositoryConnected,
  onLocalFolderConnected,
  onTargetEnvironmentConfigured,
}: EmptyProjectSourceSelectionProps): React.JSX.Element {
  const [activeNotice, setActiveNotice] = useState<string | null>(null);
  const [isAddWebsiteOpen, setIsAddWebsiteOpen] = useState(false);
  const [isConnectRepoOpen, setIsConnectRepoOpen] = useState(false);
  const [isConnectFolderOpen, setIsConnectFolderOpen] = useState(false);
  const [isTargetEnvOpen, setIsTargetEnvOpen] = useState(false);

  const sourceOptions: readonly SourceOption[] = [
    {
      id: "website",
      title: "Website",
      description: "Connect a local development server, staging URL, or live web application.",
      phaseBadge: "Active / Phase 119",
      isAvailable: true,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4 10z" />
        </svg>
      ),
    },
    {
      id: "repository",
      title: "Repository",
      description: "Connect a Git repository for code intelligence, pull requests, and automated test generation.",
      phaseBadge: "Active / Phase 120",
      isAvailable: true,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
      ),
    },
    {
      id: "local-folder",
      title: "Local Folder",
      description: "Target a folder on your local filesystem containing application source code or tests.",
      phaseBadge: "Active / Phase 121",
      isAvailable: true,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: "browser-app",
      title: "Browser / Running App",
      description: "Attach directly to an active browser session or locally running application instance.",
      phaseBadge: "Active / Phase 122",
      isAvailable: true,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="20" height="15" x="2" y="3" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="18" x2="12" y2="21" />
        </svg>
      ),
    },
  ];

  const handleCardClick = (opt: SourceOption) => {
    if (opt.id === "website") {
      setActiveNotice(null);
      setIsAddWebsiteOpen(true);
    } else if (opt.id === "repository") {
      setActiveNotice(null);
      setIsConnectRepoOpen(true);
    } else if (opt.id === "local-folder") {
      setActiveNotice(null);
      setIsConnectFolderOpen(true);
    } else if (opt.id === "browser-app") {
      setActiveNotice(null);
      setIsTargetEnvOpen(true);
    } else if (opt.boundaryNotice) {
      setActiveNotice(opt.boundaryNotice);
    }
  };

  return (
    <div
      className="empty-project-source-selection"
      data-testid="empty-project-source-selection"
      role="region"
      aria-label="Project Source Selection"
      style={{
        padding: "32px 24px",
        maxWidth: "880px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <h2
          style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text-primary, #ffffff)", marginBottom: "8px" }}
          data-testid="empty-project-title"
        >
          No source connected yet
        </h2>
        <p style={{ color: "var(--color-text-secondary, #9ca3af)", fontSize: "0.95rem" }}>
          Connect a test target or code repository to begin autonomous quality engineering for{" "}
          <strong style={{ color: "var(--color-text-primary, #ffffff)" }}>{project.name}</strong>.
        </p>
      </div>

      {activeNotice && (
        <div
          className="source-boundary-notice"
          data-testid="source-boundary-notice"
          role="status"
          style={{
            padding: "12px 16px",
            backgroundColor: "rgba(59, 130, 246, 0.12)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "#93c5fd" }}>{activeNotice}</span>
          <button
            type="button"
            onClick={() => setActiveNotice(null)}
            style={{
              background: "none",
              border: "none",
              color: "#93c5fd",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "0.8rem",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        className="source-cards-grid"
        data-testid="source-cards-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "16px",
        }}
      >
        {sourceOptions.map(opt => (
          <button
            key={opt.id}
            type="button"
            className="source-option-card"
            data-testid={"source-card-" + opt.id}
            onClick={() => handleCardClick(opt)}
            style={{
              padding: "20px",
              borderRadius: "12px",
              backgroundColor: "var(--bg-surface, #161616)",
              border: "1px solid var(--border-default, rgba(255, 255, 255, 0.08))",
              boxShadow: "0 4px 16px -4px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              cursor: "pointer",
              transition: "border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
              e.currentTarget.style.backgroundColor = "var(--bg-surface-raised, #1e1e1e)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--border-default, rgba(255, 255, 255, 0.08))";
              e.currentTarget.style.backgroundColor = "var(--bg-surface, #161616)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "9px",
                  backgroundColor: "#202020",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#60a5fa",
                  flexShrink: 0,
                }}
              >
                {opt.icon}
              </div>
              <Badge variant={opt.isAvailable ? "success" : "neutral"}>{opt.phaseBadge}</Badge>
            </div>
            <div>
              <h3 style={{ fontSize: "1.02rem", fontWeight: 600, color: "var(--text-primary, #ffffff)", marginBottom: "4px" }}>
                {opt.title}
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary, #a1a1aa)", lineHeight: "1.45" }}>
                {opt.description}
              </p>
            </div>
            {opt.isAvailable && (
              <span style={{ fontSize: "0.82rem", color: "#60a5fa", fontWeight: 500, marginTop: "auto" }}>
                {opt.id === "website"
                  ? "+ Add Website Target →"
                  : opt.id === "repository"
                  ? "+ Connect Repository →"
                  : opt.id === "local-folder"
                  ? "+ Connect Local Folder →"
                  : "+ Configure Target & Browser →"}
              </span>
            )}
          </button>
        ))}
      </div>

      <AddWebsiteTargetModal
        isOpen={isAddWebsiteOpen}
        projectId={project.id}
        projectName={project.name}
        onClose={() => setIsAddWebsiteOpen(false)}
        onSuccess={target => {
          setIsAddWebsiteOpen(false);
          onWebsiteAdded?.(target);
        }}
      />

      <ConnectRepositoryModal
        isOpen={isConnectRepoOpen}
        projectId={project.id}
        projectName={project.name}
        onClose={() => setIsConnectRepoOpen(false)}
        onSuccess={conn => {
          setIsConnectRepoOpen(false);
          onRepositoryConnected?.(conn);
        }}
      />

      <ConnectLocalFolderModal
        isOpen={isConnectFolderOpen}
        projectId={project.id}
        projectName={project.name}
        onClose={() => setIsConnectFolderOpen(false)}
        onSuccess={conn => {
          setIsConnectFolderOpen(false);
          onLocalFolderConnected?.(conn);
        }}
      />

      <TargetEnvironmentConfigModal
        isOpen={isTargetEnvOpen}
        projectId={project.id}
        projectName={project.name}
        onClose={() => setIsTargetEnvOpen(false)}
        onSuccess={env => {
          setIsTargetEnvOpen(false);
          onTargetEnvironmentConfigured?.(env);
        }}
      />
    </div>
  );
}
