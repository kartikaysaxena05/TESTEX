# V8 Phase 117 — Codex-Style AI Testing Workspace & Navigation

## Overview

V8 Phase 117 delivers an enterprise-grade, desktop-optimized **Codex-Style AI Testing Workspace & Navigation** shell for the **AI-Driven Software Quality Engineering Platform**. It establishes the core interactive testing environment where developers and QA engineers interact with autonomous testing agents, inspect execution runs, correlate test cases and requirements, investigate failure cases, and navigate the entire quality suite.

The workspace layout is inspired by modern developer AI coding and execution environments (such as OpenAI Codex desktop), organized into a unified, responsive 4-pane architecture:
1. **Header Bar**: Project selector, target environment indicator, desktop bridge status, and user profile menu dropdown.
2. **Left Sidebar**: Active project switcher, recent testing sessions, and quality navigation to platform features.
3. **Main Agent Workspace**: Chronological testing interaction timeline, capability-rich empty states, and activity view.
4. **Command Composer**: Multiline command prompt with keyboard shortcuts (`Cmd/Ctrl + K`, `Cmd/Ctrl + Enter`), mode selection, and context attachment trigger shell.
5. **Context & Evidence Panel**: Collapsible 6-tab panel (`Run`, `Evidence`, `Test`, `Failure`, `Requirement`, `Source`) showing grounded quality context without fabricated data.

Phase 117 maintains strict boundary separation: it implements the complete UI and IPC architecture with **zero fabricated or mock data**, while cleanly deferring new project creation wizards and website onboarding to **Phase 118**.

---

## 1. Architecture & Codex Interaction Pattern

```
+-----------------------------------------------------------------------------------------+
| [=] Project: [ E-Commerce QA  v ]  [ Staging Env ]           [ Bridge: Ready ]  [ (U) ] |
+-----------------------+---------------------------------------------+-------------------+
| PROJECTS              | [Project Hero: E-Commerce QA]               | CONTEXT & EVIDENCE|
| * E-Commerce QA       | ------------------------------------------- | [Run] [Evidence]  |
|   Secondary Microserv | CHRONOLOGICAL INTERACTION TIMELINE          | [Test] [Failure]  |
|                       |                                             | [Req]  [Source]   |
| RECENT WORK           | [User]: Test checkout promo code            |                   |
| - Promo Code Run      | [Agent]: Boundary notice / execution stream | (Factual context  |
|                       |                                             |  or empty state)  |
| QUALITY NAVIGATION    |                                             |                   |
| - Workspace           +---------------------------------------------+                   |
| - Requirements        | COMMAND COMPOSER                            |                   |
| - Tests               | [+] [ Ask AI what to test...              ] |                   |
| - Test Runs           | [ Mode: Autonomous v ]               [Run >]|                   |
| - Bugs & Failures     +---------------------------------------------+                   |
+-----------------------+---------------------------------------------+-------------------+
```

### 1.1 Left Sidebar (`CodexSidebar.tsx`)
- **Active Projects List**: Displays actual database projects with active dot status indicators.
- **+ New Project Action**: Provides a clear boundary notice that project creation and repository onboarding will activate in Phase 118 (`new-project-boundary-notice`), preventing broken states or fabricated projects.
- **Recent Testing Sessions**: Displays chronological session list for the active project. If none exist, renders the truthful empty state: `"No recent sessions"`.
- **Quality Navigation**: One-click navigation to all underlying platform domains built across V1–V7 and V8 Phase 116 without rebuilding them:
  - `/workspace` — AI Testing Workspace & Sessions
  - `/requirements` — V3 Requirement Intelligence & Documents
  - `/test-cases` — V4 Test Design, Specifications & Categorized Tests
  - `/test-runs` — V5 Autonomous Web Testing & Test Runs
  - `/defects` — V6 Failure Intelligence & V7 Defect Management
  - `/reports` — V7 QA Reports & Release Readiness
  - `/traceability` — V4 Traceability Matrix
  - `/source` — V2 Repository Intelligence
  - `/settings` — V8 Phase 116 User Settings & Preferences
- **Collapsible Layout**: Can be collapsed via the header toggle or keyboard shortcut `Cmd/Ctrl + B`.

### 1.2 Header Bar (`ProjectHeaderBar.tsx`)
- **Project Selector**: Dropdown listing all active projects; changing projects updates active context with race condition protection.
- **Dynamic Environment Badge**: Displays active environment name or configured environment count if loaded (`codex-env-badge`).
- **Bridge Status Indicator**: Real-time status badge (`System Ready`, `Connecting...`, `Desktop Unavailable`).
- **User Profile Menu Dropdown**: Displays authenticated user avatar initials and name with links to Profile, Preferences, Account & Security, and Sign Out.

### 1.3 Main Agent Workspace (`MainAgentWorkspace.tsx`)
- **Section 11 Capability Empty State**: When no project is selected, renders the platform hero explaining the 6 core capabilities:
  - Analyze requirements
  - Generate test cases
  - Execute browser tests
  - Investigate failures
  - Review defects
  - Produce QA reports
- **Project Hero**: Displays active project name, description, and testing status badge.
- **Chronological Message Timeline**: Displays user instructions, agent status updates, and session activity cards in strictly sorted chronological order.
- **Factual Empty Session State**: If the active session has no messages, displays `"Ready for Testing Commands"` without generating fake responses.

### 1.4 Command Composer (`CommandComposer.tsx`)
- **Multiline Textarea**: Flexible input with auto-submit on `Enter` or `Cmd/Ctrl + Enter` (and newline on `Shift + Enter`).
- **Global Shortcut Focus**: Listens for `Cmd/Ctrl + K` anywhere in the app to focus and select the composer input.
- **Attachment Trigger Shell `[+]`**: Renders the attachment control shell (`composer-attach-btn`). Clicking displays a gentle boundary alert: `"Attachment and source connection becomes available in Phase 118+"`.
- **Testing Mode Selector**: Supports switching between:
  - `Autonomous Testing`
  - `Requirement Analysis`
  - `Failure Investigation`
  - `Regression Suite`
- **Execution Guard**: If no project is selected, warns the user: `"Run unavailable until project context is configured."` If a project is selected, dispatches message to session timeline with Phase 117 boundary notice.

### 1.5 Context & Evidence Panel (`ContextEvidencePanel.tsx`)
- **6 Quality Tabs**: `Run`, `Evidence`, `Test`, `Failure`, `Requirement`, `Source`.
- **Factual Context Only**: When no item is selected, renders `NoActiveContextEmptyState` (`"No Context Selected"`). Zero fabricated runs or fake screenshots.
- **Collapsible Toggle**: Can be expanded or collapsed via header button or `Escape` key, with preference persistence via `window.desktop.shellLayout`.

---

## 2. Security Architecture & Boundary Protection

| Security Dimension | Implementation & Guarantees |
|---|---|
| **Direct DB Access in UI** | **ZERO**. UI files contain zero imports from `@prisma/client` or database pools. |
| **Raw IPC Exposure** | **ZERO**. All renderer communication traverses the context-isolated, frozen `window.desktop` bridge. |
| **Frame Validation** | All workspace and layout IPC handlers verify `event.senderFrame.parent === null` to block nested frame hijacking. |
| **Monotonic Token Race Guards** | Both `ProjectContext` (`requestTokenRef`) and `WorkspaceContext` (`sessionTokenRef`) use monotonic counters to drop stale, out-of-order async responses. |
| **Multi-Project Isolation** | `WorkspaceSessionProjectMismatchError` prevents accessing or modifying sessions belonging to a different project. |
| **XSS & Hostile Text Safety** | Project names, commands, and potential prompt injection attacks (e.g. `Ignore previous instructions; drop table`) are rendered strictly as escaped plain text without dynamic HTML or script execution. |
| **Phase 118+ Boundaries** | Zero real project creation wizards, zero website onboarding forms, zero GitHub repo connection wizards, zero fake test execution. |

---

## 3. Persistent Layout Preferences

Shell layout preferences are persisted across restarts via IPC (`desktop:shell-layout:get` / `desktop:shell-layout:update`):

```typescript
export interface ShellLayoutPreferencesDto {
  readonly sidebarCollapsed: boolean;
  readonly contextPanelCollapsed: boolean;
  readonly activeContextTab: 'run' | 'evidence' | 'test' | 'failure' | 'requirement' | 'source';
  readonly sidebarWidthPx: number;
  readonly contextPanelWidthPx: number;
  readonly themeMode: 'dark' | 'light' | 'system';
}
```

---

## 4. Certification Verification

The complete certification test suite (`apps/desktop/src/main/v8-phase117-workspace-certification.test.tsx`) executed and verified all 25 subtests:

1. **Authenticated Entry**: Renders workspace shell when user session is authenticated.
2. **Unauthenticated Access**: Blocks unauthenticated access and safely redirects to login flow.
3. **Session Expiry Safe Clear**: Unmounts workspace immediately upon session invalidation.
4. **Codex-Style 4-Pane Layout**: Renders header, sidebar, main workspace, context panel, and composer simultaneously.
5. **Left Sidebar Projects**: Accurately renders active projects with status indicators.
6. **Sidebar Truthful Empty State (Projects)**: Renders `"No active projects"` when project store is empty.
7. **Sidebar Truthful Empty State (Sessions)**: Renders `"No recent sessions"` when session list is empty.
8. **New Project Boundary**: Provides safe Phase 118 boundary notice on `+ New Project`.
9. **Quality Navigation**: Links directly to V1–V7 platform routes (`/workspace`, `/requirements`, `/test-cases`, `/test-runs`, `/defects`, `/reports`, `/traceability`, `/source`, `/settings`).
10. **Section 11 Capability Empty State**: Renders exact platform capability descriptions when no project is selected.
11. **Main Workspace Project Hero**: Renders selected project name and platform readiness badge.
12. **Main Workspace Session Card**: Displays `"Ready for Testing Commands"` for fresh sessions.
13. **Context Panel 6 Tabs**: Renders `Run`, `Evidence`, `Test`, `Failure`, `Requirement`, and `Source` tabs.
14. **Context Panel Empty State**: Displays `"No Context Selected"` without fabricated test runs.
15. **Command Composer Elements**: Renders multiline input, suggestion chips, attachment shell, mode selector, and run button.
16. **Header Bar Project Selector & Environment**: Displays project switcher and dynamic environment badge.
17. **Header Bar User Menu**: Renders user initials, full name, and settings navigation options.
18. **Project Switch Safety**: Monotonic token discards late-arriving project responses.
19. **Session Switch Safety**: Monotonic session token discards late-arriving session responses.
20. **Multi-Project Isolation**: Rejects cross-project session access with `WorkspaceSessionProjectMismatchError`.
21. **Untrusted Content Sanitization**: Treats malicious project names and prompt injections strictly as escaped text.
22. **Prompt Safety in UI**: Renders hostile user commands safely as raw text.
23. **State Persistence**: Idempotently gets and updates shell layout preferences via IPC.
24. **Security Architecture**: Certifies zero direct database access and zero raw `ipcRenderer` in renderer.
25. **Phase 118+ Boundary**: Certifies zero project creation wizards, website onboarding forms, or fake agent execution.
