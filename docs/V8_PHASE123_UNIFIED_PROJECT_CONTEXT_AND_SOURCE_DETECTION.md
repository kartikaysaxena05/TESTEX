# V8 Phase 123 — Unified Project Context & Source Detection

## 1. Overview & Objective

Phase 123 delivers the authoritative **Unified Project Context** layer for the AI-Driven Software Quality Engineering Platform. It aggregates and unifies all project sources and execution targets into a single, cohesive, provenance-preserving context:

- **Website URLs** (`WebsiteTarget`)
- **Git Repositories** (`RepositoryConnection`)
- **Local Project Folders** (`ProjectSource`)
- **Browser Targets & Runtimes** (`ProjectEnvironment`)
- **Environment Configurations** (`ProjectEnvironment`)
- **Authentication Profiles** (`AuthenticationProfile`)
- **Existing Project Metadata & Quality Engineering Artifacts** (Requirements, Test Cases, Executions, Failures)

The Unified Project Context serves as the single source of truth for downstream consumers:

- **V1–V7 Autonomous Web QA Engine**
- **V8 Desktop Application Shell**
- **V9 AI Generation & Context Window Runtime**
- **V10 Autonomous Quality Engineering Agent**

Strict security boundaries are enforced: repository contents and external URLs are treated as untrusted data, zero repository scripts or binaries are executed during detection, and passwords/credentials are never leaked.

---

## 2. Architecture & Ecosystem

```text
                                Unified Project Context
                                           │
         ┌─────────────────────────┬───────┴────────┬─────────────────────────┐
         │                         │                │                         │
   Sources Layer             Target Layer      Quality Layer             Audit Layer
   ├── Website Target        ├── Browser       ├── Requirements          └── AuthAuditAction
   ├── Git Repository        ├── Base URL      ├── Test Cases                (REFRESHED,
   └── Local Folder          └── Environment   ├── Executions                 INVALIDATED)
                                               └── Failures
                                           │
                                           ▼
                                 ProjectContextService
                            (Authoritative Domain Service)
                           ┌───────────────┴───────────────┐
                           ▼                               ▼
                     SourceDetector                 ContextAssembler
                 (Safe Read-Only Detection)    (Controlled Tailored Views)
                           │                               │
                           │                     ┌─────────┴─────────┐
                           │                     │                   │
                           ▼                     ▼                   ▼
                     Desktop UI             V1–V7 QA Engine     V9 AI Runtime
                 (ProjectContextCard)     (Execution Target)  (AiProjectContextDto)
                                                                     │
                                                                     ▼
                                                                V10 Agent
```

### Core Services & Components

1. **`ProjectContextService`** (`packages/core/src/project-context/project-context-service.ts`):
   - Single authoritative orchestrator managing context loading, caching, freshness evaluation, manual and automated refreshes, and invalidation.
   - Enforces multi-tenant project authorization (`assertProjectAccess`), ensuring users can only interact with their own projects.
   - Maintains an in-memory cached representation (`ProjectContextDto`) with a 60-second TTL to maximize performance while ensuring real-time consistency.

2. **`SourceDetector`** (`packages/core/src/project-context/source-detector.ts`):
   - Safe, non-intrusive detector that inspects local directories, Git repositories, and web targets.
   - Inspects static configuration files (`package.json`, `tsconfig.json`, `pom.xml`, `requirements.txt`, `.git/HEAD`, etc.) to discover programming languages, frameworks, package managers, entry points, and test directories.
   - Probes website targets for reachability, protocol safety (HTTPS/HTTP), response time, and status codes using `WebsiteTargetConnectivityChecker`.
   - **Guaranteed Safe**: Never executes `npm`, `node`, `pip`, or any repository scripts/binaries.

3. **`ContextAssembler`** (`packages/core/src/project-context/context-assembler.ts`):
   - Implements the principle of least privilege by projecting the unified context into purpose-built DTOs:
     - `assembleQaEngineContext`: Base URL, environment type, browser engine, viewport, and sanitized auth state for V1–V7 execution.
     - `assembleDesktopContext`: View model with status badges, counts, and summaries for the V8 shell.
     - `assembleV9AiContext`: Standardized `AiProjectContextDto` for model prompting without context bloat.
     - `assembleV10AgentContext`: Safe workspace root, language/framework summary, entry points, and test paths for autonomous agents.

4. **Desktop IPC Handlers** (`apps/desktop/src/main/ipc/project-context-handlers.ts`):
   - Secure IPC gateway backed by `createSafeIpcHandler` and `isTrustedIpcSender`.
   - Channels:
     - `desktop:project-context:get`
     - `desktop:project-context:detect`
     - `desktop:project-context:refresh`
     - `desktop:project-context:invalidate`
     - `desktop:project-context:status`

5. **Desktop UI Components** (`apps/desktop/src/renderer/features/project-context/`):
   - `ProjectContextCard`: Codex-style dashboard card showing connection status, detected stack, target, auth state, and actions (Refresh, Run Detection, Invalidate, View Details).
   - `useProjectContext`: Typed React hook for state management, refreshing, and detecting sources.

---

## 3. Database Schema Extensions

Applied via Prisma migration `20261005190925_v8_phase123_project_context`:

```prisma
enum AuthAuditAction {
  // Existing actions...
  PROJECT_CONTEXT_REFRESHED
  PROJECT_CONTEXT_INVALIDATED
}
```

Every context refresh and manual invalidation emits an immutable audit event recording the user, project ID, timestamp, and metadata.

---

## 4. Context Lifecycle & State Transitions

The context tracks explicit lifecycle states reflecting the operational integrity of all connected sources:

```text
                  ┌───────────────────┐
                  │      PARTIAL      │
                  └─────────▲─────────┘
                            │ (one or more sources missing/unavailable)
                            │
┌──────────────┐     ┌──────┴──────┐     ┌──────────────┐
│  REFRESHING  ├───► │  CONNECTED  ├───► │    STALE     │
└──────────────┘     └──────┬──────┘     └──────────────┘
                            │                   ▲
                            │ (fatal errors)    │ (manual/external change)
                            ▼                   │
                     ┌─────────────┐            │
                     │    ERROR    │────────────┘
                     └─────────────┘
```

- **`CONNECTED`**: All configured sources (Website, Git, Local Folder) are reachable, healthy, and verified.
- **`PARTIAL`**: At least one primary source is active, but one or more configured sources are temporarily unavailable (e.g., local folder path missing on disk or website unreachable).
- **`REFRESHING`**: Context is actively being recomputed or probed.
- **`STALE`**: Context was marked stale due to external file/git changes or manual user action.
- **`INVALID`**: Missing mandatory configuration or conflicting configuration preventing assembly.
- **`ERROR`**: Failure during detection or context retrieval.

### Fault Tolerance & Non-Destructive Recovery

If a local directory is temporarily disconnected or unmounted, or a remote web target experiences transient downtime, `ProjectContextService` marks the context as `PARTIAL` with actionable warning diagnostics. **It never deletes unrelated project metadata, requirements, or test cases.** When the source is restored, a single `refreshContext()` call automatically recovers the lifecycle state to `CONNECTED`.

---

## 5. Security Guardrails & Tenant Isolation

1. **Strict Multi-Tenant Isolation**:
   - `assertProjectAccess(projectId, userId)` validates that the authenticated user owns the target project.
   - Cross-project access attempts are immediately rejected with `ProjectContextAccessDeniedError` and logged to security audit.

2. **Zero Plaintext Secrets**:
   - Authentication passwords and tokens are never included in context payloads.
   - UI receives masked previews (`••••••••`), and AI runtime contexts receive only metadata flags (`isConfigured: true`, strategy name, username).

3. **Inert Data Treatment for Repositories**:
   - Repository code and specification files are strictly treated as untrusted text.
   - Code execution during source detection is prohibited.
   - Detection relies on bounded, read-only file parsing (reading up to 64KB per manifest).

4. **Path Traversal Protection**:
   - Local directory paths are validated against forbidden root paths (`/`, `/System`, `/etc`, etc.) and verified using `fs.realpathSync`.

---

## 6. Integration With V1–V7, V9, and V10

### V1–V7 Autonomous QA Engine

The QA Engine receives the compiled target execution context via `ContextAssembler.assembleQaEngineContext(context)`:

- Target base URL and environment metadata
- Browser engine selection (Chromium, Firefox, WebKit), viewport size, headless mode
- Sanitized authentication strategy and configuration status

### V9 AI Generation Runtime

The V9 runtime consumes `AiProjectContextDto` produced by `ContextAssembler.assembleV9AiContext(context)`:

- Formatted repository metadata (languages, frameworks, entry points)
- High-level test and requirements summaries
- Controlled token footprint to prevent context-window exhaustion in local models (e.g., Ollama / Llama 3)

### V10 Autonomous Agent

Autonomous agents receive structured workspace boundaries via `ContextAssembler.assembleV10AgentContext(context)`:

- Absolute workspace root directory
- Language and test framework identification
- Verified entry points and test directories
- Strict `safeModeEnabled` flag enforcement

---

## 7. Verification & Certification Results

All Phase 123 certification tests, IPC security suites, and UI component tests pass with 100% green status:

```text
▶ Phase 123 Project Context IPC Handlers & Security Tests (19 tests) - PASS
  - Sender security validation (5/5 pass)
  - Input Zod validation (2/2 pass)
  - Successful IPC operations (5/5 pass)
  - Domain error translations (7/7 pass)

▶ Project Context UI Component Unit Tests (4 tests) - PASS
  - Renders ProjectContextCard with CONNECTED status and all sources
  - Redacts credentials and masks passwords completely
  - Renders STALE badge and reasons upon invalidation
  - Renders PARTIAL badge and warnings upon source unavailability

▶ V8 Phase 123 — Unified Project Context Certification (17 tests) - PASS
  - Safe source detection (local folder, website, missing dir)
  - Loading, caching, invalidation, refresh lifecycle
  - Fault tolerance and temporary source recovery
  - Multi-tenant cross-project isolation and adversarial repo handling
  - Context assembly for QA Engine, Desktop UI, V9 AI Runtime, and V10 Agent

Total: 40/40 Passing (0 failures, 0 regressions)
```
