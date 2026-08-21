# ADR 0001: Initial Repository Architecture and Technology Selection

- **Status:** Accepted
- **Date:** 2026-08-20
- **Authors:** Core Engineering Team
- **Context:** Initial foundation for AI-Driven Software Quality Engineering Platform

---

## 1. Context

The project aims to build an AI-Driven Software Quality Engineering Platform offering requirement-to-test traceability, autonomous web test generation and execution, intelligent failure classification, and bug triage.

Building this system requires a foundation that can inspect local user projects, execute automated browser tests, interact securely with AI providers, and provide an interactive desktop experience without compromising security or maintainability.

---

## 2. Decision

We establish the core repository architecture based on:

1. **Desktop Shell:** Electron for native cross-platform desktop integration and local process management.
2. **Frontend UI:** React + TypeScript (unprivileged renderer).
3. **Domain / Core Layer:** Node.js + TypeScript (privileged application layer).
4. **Monorepo Management:** Native `npm` workspaces (`apps/*`, `packages/*`).
5. **Architectural Separation:**
   - `packages/contracts`: Platform-neutral shared types and IPC definitions.
   - `packages/core`: Privileged application services and domain logic.
   - `apps/desktop`: Electron wrapper with isolated main, preload, and renderer layers.
6. **Future Extensibility:** Incremental introduction of specialized engines (Repository Intelligence, Requirement Analysis, Playwright Runner, Bug Classifier, Jira Integrations, PostgreSQL) in subsequent phases without introducing heavy multi-language runtime dependencies.

---

## 3. Rationale

- **Single Language Ecosystem (TypeScript / Node.js):** Consolidating both desktop UI and domain logic on TypeScript eliminates cross-language serialization overhead, shares strict type definitions across IPC boundaries, and simplifies developer tooling.
- **npm Workspaces:** Avoids third-party monorepo complexity (such as Turborepo or Nx) for Phase 1 while providing native dependency linking and low overhead.
- **Strict IPC & Sandbox Security:** Context isolation and sandboxed renderer execution prevent unauthorized direct access to user filesystems, processes, and credentials.
- **Incremental Engine Delivery:** Postponing heavy dependencies (e.g. database connections, Playwright automation binaries, external LLM SDKs) guarantees a lean, clean base that builds and checks rapidly.

---

## 4. Consequences

### Positive

- Unified TypeScript build and lint pipeline across all workspaces.
- Strict compile-time safety and zero circular dependencies.
- Clear mental model for privileged vs. unprivileged operations.
- Smooth path for adding domain packages in subsequent phases.

### Negative / Trade-offs

- Electron requires careful IPC boundary governance to maintain security invariants.
- Shared contracts must be strictly curated to avoid accidental bundling of backend dependencies into frontend builds.

---

## 5. Alternatives Rejected

| Alternative                           | Reason for Rejection                                                                                                                                         |
| :------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Python / FastAPI Backend**          | Unnecessary dual-runtime complexity for desktop distribution; increases packaging size and startup latency. Domain logic can run efficiently within Node.js. |
| **Turborepo / Nx**                    | Premature tooling overhead for the initial multi-package layout; standard npm workspaces are sufficient and maintain zero external lock-in.                  |
| **Direct Renderer Node Integration**  | Major security hazard; exposes user filesystem and shell to untrusted renderer execution.                                                                    |
| **Monolithic Single-Package App**     | Violates layer separation and risks leaking privileged system code into frontend UI bundles.                                                                 |
| **Immediate Database / Docker Setup** | Premature in Phase 1; storage requirements will be refined alongside specific domain models in future phases.                                                |
