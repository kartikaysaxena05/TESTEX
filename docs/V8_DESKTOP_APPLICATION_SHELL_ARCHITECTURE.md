# V8 PHASE 111 — DESKTOP APPLICATION SHELL & FINAL PRODUCT ARCHITECTURE

```text
VERSION: V8 — Desktop Application Shell & Final Product Architecture
PHASE: 111 (Desktop Application Shell & Codex Workspace Composition)
STATUS: COMPLETE & CERTIFIED
CERTIFICATION VERDICT: PASS
DATE: 2026-09-12
```

---

## 1. Executive Summary & Purpose

Phase 111 transitions the **AI-Driven Software Quality Engineering Platform** from isolated feature screens into a unified, high-density, professional **Codex-style desktop product application**.

Rather than navigating a traditional disparate web app layout, the platform delivers an integrated 3-column + bottom composer desktop layout modeled after modern AI development environments (e.g. OpenAI Operator / Codex / Cursor / Claude Desktop):
1. **Top Project Header Bar**: Authoritative active project switcher, environment indicator badge, layout toggle buttons, system bridge status, and user avatar.
2. **Left Collapsible Sidebar**: Fast project switcher, "New Project" call-to-action, recent testing sessions, and categorized links to certified quality modules (V1 through V7).
3. **Center Main Agent Workspace**: Dynamic workspace displaying active testing sessions, test activity heroes, live test runners, and nested routed screens wrapped in error boundaries.
4. **Right Context & Evidence Panel**: Collapsible and resizable inspector featuring 5 specialized tabs (`Run`, `Evidence`, `Test`, `Failure`, `Source`) showing real telemetry, screenshots, traces, logs, and localization artifacts.
5. **Bottom Command Composer**: Natural language command prompt with contextual suggestion chips, active project pill, submit action, and safe architectural placeholder for downstream agent orchestration.
6. **Bottom Status Bar**: Window diagnostics, active environment, bridge connection state, active session, and version telemetry.

---

## 2. Core Architectural Components & File Structure

```text
apps/desktop/src/
├── main/
│   ├── ipc/
│   │   ├── workspace-session-handlers.ts       # Validated IPC handlers for workspace sessions and shell layout
│   │   ├── register-ipc.ts                     # Handler registration with createSafeIpcHandler
│   │   └── allowed-error-codes.ts              # Registered WORKSPACE_SESSION_* error codes
│   ├── security.ts                             # Sandbox, contextIsolation, and navigation lockdown
│   └── v8-phase111-shell-certification.test.tsx# Authoritative 17-test certification suite
├── preload/
│   └── index.ts                                # Strongly-typed contextBridge exposing workspaceSessions & shellLayout
└── renderer/
    ├── context/
    │   ├── AuthContext.tsx                     # Deterministic auth boundary (no mock login)
    │   ├── ProjectContext.tsx                  # Project context + race condition prevention
    │   └── WorkspaceContext.tsx                # Workspace sessions, panel states, active context tabs
    ├── features/shell/
    │   ├── CodexShell.tsx                      # Master 3-column + bottom bar container
    │   ├── ProjectHeaderBar.tsx                # Top header bar with project/env badges & layout toggles
    │   ├── CodexSidebar.tsx                    # Collapsible sidebar with navigation & recent sessions
    │   ├── MainAgentWorkspace.tsx              # Flexible central agent & test activity workspace
    │   ├── ContextEvidencePanel.tsx            # Multi-tab collapsible context inspector
    │   ├── CommandComposer.tsx                 # Command prompt & suggestion chips
    │   └── ShellEmptyStates.tsx                # Canonical empty states (NoProject, NoSessions, NoContext)
    ├── navigation/
    │   ├── AppRouter.tsx                       # Integrated router supporting /workspace, /project/:id, /session/:id
    │   └── ProjectRouteGuard.tsx               # Deep link safety & cross-project route protection
    └── styles/
        └── layout.css                          # Responsive CSS grid/flexbox layouts and breakpoints
```

---

## 3. Detailed Architectural Principles

### 3.1 Codex-Style Master Shell Composition
The layout is implemented in `CodexShell.tsx` using semantic HTML5 landmarks (`<header>`, `<aside>`, `<main>`, `<footer>`) and CSS Grid / Flexbox geometry:
- The shell responds dynamically to user layout toggles stored locally and synchronized across IPC.
- Supports collapsible left sidebar (width collapses to 48px mini-rail or expands to 260px).
- Supports collapsible right context inspector (width toggles between 0px hidden and 340px-480px).
- Fully responsive across desktop viewports: 1024x700 (minimum), 1280x720 (standard laptop), 1440x900 (MacBook Pro), and 1920x1080 (HD desktop display).

### 3.2 Project Switching & Race Condition Protection
When users rapidly switch between projects in the UI:
1. `ProjectContext.tsx` maintains a monotonic request sequence token (`requestTokenRef`).
2. When switching from Project A to Project B, previous project details and environment states are immediately cleared to prevent UI bleed.
3. If Project A's async fetch completes after Project B was already selected, Project A's late-arriving response is strictly ignored:
   ```ts
   const requestToken = ++requestTokenRef.current;
   // ... async IPC fetch ...
   if (requestToken !== requestTokenRef.current || isCancelled) {
     return; // Discard late response
   }
   ```
4. Certified empirically in Subtest 7 with delayed async resolution.

### 3.3 Deep Link Safety & Project Route Guard
When deep links such as `/project/:projectId` or `/project/:projectId/session/:sessionId` are loaded:
1. `ProjectRouteGuard.tsx` evaluates whether the deep-linked `projectId` exists within the authorized active project list.
2. If the project identifier is invalid, cross-tenant, or unauthorized, access is immediately blocked with `Project Not Accessible` empty state.
3. No secrets, credentials, or cross-tenant project data are leaked.

### 3.4 Context & Evidence Panel
The right panel provides immediate drill-down into active execution state across 5 distinct tabs:
- **`run`**: Current run ID, test count, execution status badge, started timestamp, and elapsed duration.
- **`evidence`**: Screenshots, DOM snapshots, network HAR, and console logs.
- **`test`**: Active test title, file path, step counter, and test description.
- **`failure`**: Root-cause summary, failure category, error message, and stack snippet.
- **`source`**: Repository root, file path, and line location.

When no context item is selected, the panel renders an honest `NoActiveContextEmptyState`.

### 3.5 Command Composer Shell
The bottom composer provides an intuitive natural language interface:
- Includes prompt textarea with keyboard shortcut support (`Enter` to submit, `Shift+Enter` for newline).
- Displays contextual prompt suggestion chips based on active project state:
  - *"Run all regression tests"*
  - *"Analyze latest failure root cause"*
  - *"Generate test for checkout requirement"*
  - *"Verify bug fix patch in sandbox"*
- Safe Architectural Mode: displays prompt instructions without executing uncontrolled arbitrary code, perfectly preserving Phase 111 boundaries until Phase 112+ conversational engines are scheduled.

---

## 4. Electron Desktop Security Configuration

In compliance with strict platform security guidelines:
1. **WebPreferences Lockdown**:
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - `sandbox: true`
   - `webSecurity: true`
   - `allowRunningInsecureContent: false`
   - `webviewTag: false`
2. **Navigation Lockdown**:
   - `isAllowedNavigation`: All external URL navigations (`https://*`, `http://*`, `file://*`, `javascript:*`) are strictly denied.
   - Only `app://renderer/index.html` (production) or the local Vite dev server (development) is permitted.
3. **IPC Input Validation**:
   - All IPC calls (`WORKSPACE_SESSIONS_*`, `SHELL_LAYOUT_*`) validate incoming parameters using deterministic type checks.
   - Cross-project session access is strictly blocked and returns `WorkspaceSessionProjectMismatchError`.
   - Error messages are sanitized and mapped into `DesktopErrorCode` enum (`WORKSPACE_SESSION_NOT_FOUND`, `WORKSPACE_SESSION_PROJECT_MISMATCH`, `WORKSPACE_SESSION_VALIDATION_ERROR`).

---

## 5. Scope & Boundary Certification

- **Phase 111 Scope Strictly Honored**: Zero Phase 112 onboarding wizards, zero Google/Apple OAuth, zero live site connect workflows, and zero mock auth domain data.
- **V1–V7 Engines Preserved**: All 110 prior phases remain untouched and fully certified. The shell acts as the unified presentation container for existing engines.

---

## 6. Verification Results Matrix

| Test Suite / Check | Command | Result | Tests / Details |
| :--- | :--- | :--- | :--- |
| **V8 Phase 111 Certification Suite** | `npm run test:v8-certification` | **PASS** | 17/17 subtests passing across 10 test areas (100%) |
| **TypeScript Typecheck** | `npm run typecheck` | **PASS** | 0 compilation errors across entire monorepo (`tsc -b`) |
| **Desktop Preload & Vite Build** | `npm run desktop:build` | **PASS** | Preload esbuild bundled (560.1kb), Vite client built |
| **Desktop Smoke Test** | `npm run desktop:smoke` | **PASS** | Electron launches, loads preload, closes cleanly |
| **Renderer Component Unit Tests** | `npm run test:renderer` | **PASS** | 90/90 tests passing across 51 test suites |
| **V7 Freeze Regression Suite** | `npm run test:v7-certification` | **PASS** | 17/17 tests passing across UI, Security & Closed-Loop |
| **ESLint Static Code Quality** | `npx eslint ...` | **PASS** | 0 errors, 0 warnings across all Phase 111 files |
| **Prettier Formatting** | `npx prettier --check ...` | **PASS** | 100% compliant code style |
