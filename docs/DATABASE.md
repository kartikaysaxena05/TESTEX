# Database & ORM Infrastructure (PostgreSQL + Prisma)

## AI-Driven Software Quality Engineering Platform

---

## 1. Overview & Objectives

The platform uses **PostgreSQL** as its foundational database with **Prisma ORM** (`v6.19.x`) as the unified data access and migration system.

Phase 10 establishes the relational core data models:

- `Project`: Root QA project entity.
- `ProjectSettings`: Dedicated 1-to-1 extension container.
- `ProjectEnvironment`: Testable deployment environment entities with PostgreSQL partial index enforcement.

See [PROJECT_MODEL.md](file:///Users/kartikaysaxena/Desktop/collage/docs/PROJECT_MODEL.md) for full ER diagrams and column specifications.

---

## 2. Environment Configuration

Database connectivity is managed exclusively through environment variables.

### Environment Template (`.env.example`)

```bash
# PostgreSQL Database Configuration
# Format: postgresql://[username]:[password]@[host]:[port]/[database_name]
DATABASE_URL=postgresql://username:password@127.0.0.1:5432/ai_quality_platform
```

### Local Setup Instructions:

1. **Verify PostgreSQL Installation:**
   Ensure PostgreSQL is running locally:
   ```bash
   psql --version
   ```
2. **Create Local Development Database:**
   ```bash
   psql -d postgres -c "CREATE DATABASE ai_quality_platform;"
   ```
3. **Configure Environment:**
   Copy `.env.example` to `.env` (git-ignored) and populate `DATABASE_URL`:
   ```bash
   DATABASE_URL=postgresql://localhost:5432/ai_quality_platform
   ```
4. **Apply Migrations & Generate Client:**
   ```bash
   npm run db:migrate:dev
   npm run db:generate
   ```
5. **Verify Connectivity:**
   ```bash
   npm run db:check
   ```

---

## 3. Database & ORM Architecture

```text
┌────────────────────────────────────────────────────────┐
│                   UNPRIVILEGED UI                      │
│             apps/desktop/src/renderer                  │
│       ├── SettingsScreen (Status inspection & Badge)   │
│       └── window.desktop.database.getStatus()          │
└──────────────────────────┬─────────────────────────────┘
                           │ (Read-only sanitized status DTO)
                           ▼
┌────────────────────────────────────────────────────────┐
│                 SANDBOXED PRELOAD                      │
│             apps/desktop/dist/preload/index.cjs        │
│          └── database: { getStatus() }                 │
└──────────────────────────┬─────────────────────────────┘
                           │ DESKTOP_CHANNELS.DATABASE_GET_STATUS
                           ▼
┌────────────────────────────────────────────────────────┐
│               PRIVILEGED ELECTRON MAIN                 │
│                 apps/desktop/src/main                  │
│  ├── isTrustedIpcSender (Top-level frame check)        │
│  └── createSafeIpcHandler (Error sanitization)         │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│              APPLICATION / DOMAIN CORE                 │
│                    packages/core                       │
│  ├── DatabaseManager (Lifecycle Orchestrator)          │
│  ├── getPrismaClient() (Singleton PrismaClient)        │
│  ├── checkDatabaseHealth ($queryRaw`SELECT 1 AS ok`)   │
│  ├── mapPrismaError (Sanitized Domain Error Mapping)   │
│  └── maskDatabaseUrl (Zero Credential Exposure)        │
└──────────────────────────┬─────────────────────────────┘
                           │ Prisma Engine (TCP/IP)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   POSTGRESQL SERVER                    │
│             (PostgreSQL 16.x / 15.x / 14.x)            │
└────────────────────────────────────────────────────────┘
```

---

## 4. Prisma Client Lifecycle & Singleton Pattern

- **Singleton Ownership:** `packages/core/src/database/client.ts` owns the single `PrismaClient` instance created with `datasourceUrl` loaded from validated environment settings.
- **Lazy Initialization:** `PrismaClient` is constructed on first request.
- **Clean Shutdown:** Electron's `before-quit` event invokes `await closeDatabaseManager()`, which safely calls `prisma.$disconnect()`.
- **Idempotency:** Calling `close()` or `$disconnect()` repeatedly is safe and never throws.

---

## 5. Security & Isolation Rules

1. **Credentials Privileged:** `DATABASE_URL` is never exposed across the IPC bridge.
2. **Zero SQL in Renderer:** The renderer has no database drivers or query execution functions.
3. **No Unsafe Raw Queries:** Zero usage of `$queryRawUnsafe` or `$executeRawUnsafe`.
4. **Sanitized Error Envelopes:** Raw Prisma error messages and stack traces are trapped in the main process and converted into clean application states (`connected`, `unavailable`, `not-configured`).
5. **No Competing Dual Pools:** Direct `pg` connection pools are retired; Prisma manages all connections.

---

## 6. Available Database CLI Scripts

| Command                      | Purpose                                                  |
| :--------------------------- | :------------------------------------------------------- |
| `npm run db:schema:validate` | Validate syntax and datasource of `prisma/schema.prisma` |
| `npm run db:schema:format`   | Auto-format Prisma schema file                           |
| `npm run db:generate`        | Generate typed `@prisma/client` artifacts                |
| `npm run db:migrate:status`  | Inspect migration status against target database         |
| `npm run db:migrate:dev`     | Apply pending development migrations                     |
| `npm run db:migrate:deploy`  | Non-interactive migration deployment for CI/production   |
| `npm run db:check`           | Standalone CLI connectivity and health verification      |
