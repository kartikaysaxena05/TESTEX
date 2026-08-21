# Development Guide

## AI-Driven Software Quality Engineering Platform

---

## 1. Prerequisites & Environment Setup

- **Node.js:** Node.js 24 LTS is the preferred development runtime. Node.js 20+ LTS is supported for local development. Check your version with:
  ```bash
  node -v
  ```
  If using `nvm` or `fnm`:
  ```bash
  nvm use
  ```
- **npm:** Version `10.0.0` or higher.
- **PostgreSQL:** PostgreSQL 16.x (recommended), 15.x, or 14.x.
- **Git:** Standard Git 2.30+ installation.
- **Electron:** Managed locally via `apps/desktop` devDependencies (`v43.4.1`).

---

## 2. PostgreSQL & Prisma Setup

1. **Start PostgreSQL server** on your local machine.
2. **Create local database:**
   ```bash
   psql -d postgres -c "CREATE DATABASE ai_quality_platform;"
   ```
3. **Configure environment:**
   Copy `.env.example` to `.env` and set `DATABASE_URL`:
   ```bash
   DATABASE_URL=postgresql://localhost:5432/ai_quality_platform
   ```
4. **Apply migrations & generate client:**
   ```bash
   npm run db:migrate:dev
   npm run db:generate
   ```
5. **Verify connection:**
   ```bash
   npm run db:check
   ```

---

## 3. Monorepo Structure & Workspaces

The repository is managed via standard npm workspaces configured in the root `package.json`:

```
├── apps/
│   └── desktop/         # @ai-quality/desktop (Electron main, preload bundle, React renderer)
├── packages/
│   ├── contracts/       # @ai-quality/contracts (Platform-neutral DTOs, Zod schemas, interfaces)
│   └── core/            # @ai-quality/core (Privileged domain orchestration & Prisma client)
├── prisma/
│   ├── schema.prisma    # Canonical Prisma schema
│   └── migrations/      # Version-controlled SQL migrations
└── docs/                # Architectural & domain documentation
```

---

## 4. Available Workspace Commands

All maintenance, build, and validation commands run from the repository root:

| Command                             | Purpose                                                                                                                                  |
| :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`                       | Install all dependencies across all workspaces and link workspace packages                                                               |
| `npm run db:schema:validate`        | Validate syntax and datasource of `prisma/schema.prisma`                                                                                 |
| `npm run db:schema:format`          | Auto-format Prisma schema                                                                                                                |
| `npm run db:generate`               | Generate typed `@prisma/client` artifacts                                                                                                |
| `npm run db:migrate:status`         | Inspect migration status against target database                                                                                         |
| `npm run db:migrate:dev`            | Apply pending development migrations                                                                                                     |
| `npm run db:migrate:deploy`         | Non-interactive deployment migration flow for CI/production                                                                              |
| `npm run db:check`                  | Standalone PostgreSQL connectivity & health check CLI tool                                                                               |
| `npm run test:projects:integration` | Standalone project management integration tests against PostgreSQL                                                                       |
| `npm run desktop:dev`               | Start Vite dev server with React HMR on `127.0.0.1:5173`, bundle preload, and launch Electron                                            |
| `npm run desktop:build`             | Compile TypeScript (`tsc -b`), bundle preload via esbuild, and bundle React renderer via Vite to `dist/`                                 |
| `npm run desktop:start`             | Launch production-mode Electron loading the React bundle via `app://renderer`                                                            |
| `npm run desktop:smoke`             | Run deterministic automated Electron smoke test verifying route transitions and IPC bridge                                               |
| `npm test`                          | Run automated security policy, custom protocol, sender validation, navigation, preload, UI, logging, and database unit/integration tests |
| `npm run typecheck`                 | Run strict TypeScript validation (`tsc -b`) across all packages and apps                                                                 |
| `npm run lint`                      | Run ESLint across all source files                                                                                                       |
| `npm run format`                    | Auto-format source files using Prettier                                                                                                  |
| `npm run format:check`              | Check code formatting compliance without modifying files                                                                                 |
| `npm run check`                     | Run full static quality suite (`typecheck` + `lint` + `format:check` + `test`)                                                           |

---

## 5. Diagnostics & Logging Verification

1. **Log Location:** Electron writes production logs to the platform application logs directory (accessible via `electron.app.getPath('logs')`).
2. **Log Format:** Structured JSONL records with event, timestamp, level, requestId, and sanitized data.
3. **Log Level Override:** Set `AI_QUALITY_LOG_LEVEL=debug` (or `info`, `warn`, `error`) in environment variables to configure logging verbosity.
4. **Error Boundary Verification:** If an unhandled React rendering exception occurs:
   - Root crashes trigger `AppErrorBoundary` with an option to `[Try Again]` or `[Reload Window]`.
   - Screen-level crashes trigger `ScreenErrorBoundary` with an option to `[Try Again]` or `[Return to Overview]`.
   - Zero raw stack traces are rendered to users; diagnostics are reported safely over `desktop:logging:report-renderer-error`.
