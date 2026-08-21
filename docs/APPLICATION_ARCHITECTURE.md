# Application Architecture & Entry-Point Discovery Foundation

## Overview

The **Application Architecture & Entry-Point Discovery** subsystem is the eleventh foundation layer of **Version 2 (Repository Intelligence)**. It translates the raw repository index, technology profiles, framework evidence, and file classifications into a deterministic structural map and ranked entry-point candidates for the attached application.

---

## Architectural Principles & Strict Invariants

1. **Zero Source Code Execution:**
   - No `eval()`, `require()`, `import()`, `spawn()`, or code evaluation is ever executed against target application files.
   - Entry points and architectural signals are identified purely through structural path conventions, AST imports, and detected framework metadata.

2. **Zero Full-Filesystem Rescan:**
   - Analysis operates on the existing indexed files and imports in the PostgreSQL database (`RepositoryFile`, `RepositoryImport`, `RepositorySymbol`).
   - No redundant disk directory scans are conducted.

3. **Zero Start Command / Port Claims:**
   - Phase 25 identifies candidate structural entry points (e.g. `app/layout.tsx`, `src/main.ts`, `main.py`).
   - Command selection (e.g. `pnpm dev`) and port / URL configuration belong strictly to Phase 26.

4. **Zero AI / LLM / Vector Search:**
   - All architecture classifications, candidate rankings, and signal detections are 100% deterministic, evidence-backed, and auditable.

5. **Conservative Architecture Labeling:**
   - Structural directory patterns produce conservative signals (e.g. `MVC_LIKE_STRUCTURE`, `LAYERED_STRUCTURE`, `MONOREPO_STRUCTURE`), never speculative claims of "confirmed MVC architecture".

6. **Staleness Tracking:**
   - Architecture analyses are linked to the active `RepositoryIndexRun` and marked `STALE` if the repository index is refreshed or modified.

7. **Relational Cascading Deletion:**
   - Detaching a repository or deleting a QA project cascade-deletes the `RepositoryArchitectureAnalysis` PostgreSQL record while leaving all physical disk files untouched.

---

## Domain Classification Model

### Application Kinds (`ApplicationKind`)

- `WEB_FRONTEND`: Client UI frameworks (React, Vue, Angular, Svelte, Vite) without backend.
- `WEB_BACKEND`: HTTP server backend frameworks (NestJS, Express, FastAPI, Django, Flask, Spring Boot) without frontend.
- `FULL_STACK_WEB`: Unified full-stack framework (Next.js, Nuxt, Remix, SvelteKit) or client + server in a single project.
- `MULTI_APPLICATION`: Monorepo workspaces containing multiple segregated apps (`apps/web` + `apps/api`).
- `CLI`: Command-line interface tooling.
- `LIBRARY`: Reusable package or crate without runnable application entry points.
- `DESKTOP`: Electron or Tauri application.
- `MOBILE`: Flutter or React Native application.
- `SERVICE`: Background worker or microservice.
- `UNKNOWN`: Ambiguous or insufficient architectural evidence.

### Entry-Point Kinds (`EntryPointKind`)

- `CLIENT`: Client-side UI bootstrap (e.g. `src/main.tsx`, `src/main.ts`).
- `SERVER`: Backend HTTP server entry (e.g. `src/main.ts` with NestJS, `server.ts` with Express, `main.py` with FastAPI).
- `FRAMEWORK_ENTRY`: Framework-managed route convention (e.g. Next.js `app/layout.tsx`, `app/page.tsx`, `pages/_app.tsx`).
- `APPLICATION`: General standalone application entry (e.g. Go `main.go`, Rust `src/main.rs`, Java `*Application.java`).
- `LIBRARY`: Library crate or package entry (e.g. Rust `src/lib.rs`).
- `CLI`: Command-line executable entry.
- `UNKNOWN`: Unclassified candidate.

### Conservative Architecture Signals (`ArchitectureSignalKind`)

- `MONOREPO_STRUCTURE`: Multiple workspace packages/units detected under `apps/` or `packages/`.
- `FRONTEND_BACKEND_SPLIT`: Segregated frontend client and backend server directories.
- `LAYERED_STRUCTURE`: Controllers + Services + Repositories/Models layers.
- `MVC_LIKE_STRUCTURE`: Controllers + Models + Views/Components directories.
- `DOMAIN_ORIENTED_STRUCTURE`: Domain + Infrastructure / Application directory layering.
- `FEATURE_BASED_STRUCTURE`: Vertical feature slices under `features/` or `modules/`.
- `FRAMEWORK_CONVENTIONAL_STRUCTURE`: Adherence to official framework structures (e.g. Next.js App Router, NestJS modules).

---

## IPC Interface & Bridge APIs

### IPC Channels

- `desktop:sources:architecture:get`: Retrieves the current architecture analysis for a project.
- `desktop:sources:architecture:refresh`: Triggers deterministic architecture analysis and persists the result.

### Preload Bridge (`window.desktop.sources.architecture`)

```typescript
interface DesktopBridge {
  sources: {
    architecture: {
      get(projectId: string): Promise<DesktopResult<ApplicationArchitectureProfileDto | null>>;
      refresh(projectId: string): Promise<DesktopResult<ApplicationArchitectureProfileDto>>;
    };
  };
}
```
