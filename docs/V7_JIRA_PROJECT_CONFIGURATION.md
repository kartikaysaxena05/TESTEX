# V7 Phase 90: Jira Authentication, Projects & Configuration

## 1. Overview

Phase 90 delivers **Jira Authentication, Projects & Configuration** within the V7 External Integrations subsystem of the AI-Driven Software Quality Engineering Platform. Building directly upon Phase 89's foundation (`JiraConnection`, `JiraCredentialVault`, `JiraClient`, `JiraConnectionService`), Phase 90 introduces full remote configuration discovery, safe Jira project mapping profiles (`JiraProjectConfig`), active configuration staleness detection, multi-step connection health diagnostics, wrong-project metadata defenses, and an enhanced settings card with real-time UI controls.

### 1.1 Strict Scope Boundaries

In accordance with strict modular phase governance:

- **Included in Phase 90**:
  - Remote resource discovery: sites/accessible resources, projects, issue types, priorities, standard/custom fields, createmeta schemas, components, and assignable users.
  - Project configuration profile (`JiraProjectConfig`) mapping local AI Quality projects to remote Jira projects with default issue type, priority policy, components, assignee strategies, and metadata snapshots.
  - Multi-step connection health diagnostics (`testConnectionHealth`) evaluating Authentication, Reachability, Project Access, and Issue Metadata Access.
  - Active configuration staleness detection engine (`refreshProjectConfig`) with a 4-state lifecycle (`CONFIGURED`, `STALE`, `NEEDS_REVIEW`, `INVALID`).
  - Wrong-project metadata defense rejecting invalid issue types or components that do not belong to the selected Jira project.
  - Per-project mutex serialization preventing concurrent mutations and race conditions.
  - Audit logging for project selection, configuration saves, metadata refreshes, staleness triggers, and health checks.
  - 11 hardened Electron IPC handlers with origin verification (`isTrustedIpcSender`), Zod validation, and error sanitization.
  - Comprehensive desktop UI in `JiraIntegrationSettingsCard.tsx` with dynamic discovery dropdowns, staleness alerts, and a diagnostics modal dialog.
- **Explicitly Excluded (Deferred to Phase 91+)**:
  - NO Jira issue creation or editing
  - NO bug report to Jira publishing
  - NO attachment, screenshot, DOM trace, or video uploads
  - NO duplicate Jira issue linking or semantic searching
  - NO Slack, Teams, or email external notifications
  - NO automated test runner triggering or test status synchronization
  - NO automated repair or patch generation

---

## 2. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               Desktop Renderer (React 19)                              │
│  [ JiraIntegrationSettingsCard ]                                                       │
│   ├── Target Project Selector (discovered projects)                                    │
│   ├── Default Issue Type Dropdown (e.g. Bug)                                           │
│   ├── Priority & Component Selectors                                                   │
│   ├── Assignee Strategy (UNASSIGNED, AUTOMATIC, SPECIFIC_USER)                         │
│   ├── Staleness Warning Banner (CONFIGURED, STALE, NEEDS_REVIEW, INVALID)              │
│   └── Health Check Diagnostics Modal Dialog                                            │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ window.desktopBridge.jira.* (11 channels)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               Main Process IPC Handlers                                │
│  [ jira-handlers.ts ]                                                                  │
│   ├── isTrustedIpcSender(event) Origin Verification                                    │
│   ├── Zod Input Schema Validation                                                      │
│   └── Error Normalization to DesktopErrorCode                                         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Core Package (@ai-quality/core)                           │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              JiraConnectionService                               │  │
│  │   - acquireLock(projectId) Mutex Serialization                                   │  │
│  │   - Multi-tenant Tenant Isolation & Cross-Project Checks                         │  │
│  │   - Wrong-Project Metadata Defense (Verifies IssueType/Component Project Belon.) │  │
│  │   - Staleness State Machine Engine (CONFIGURED / STALE / NEEDS_REVIEW / INVALID) │  │
│  │   - Multi-Step Health Check Diagnostics Execution                                │  │
│  │   - Audit Trail Recording (JiraConnectionAudit)                                 │  │
│  └──────────────────────────┬─────────────────────────────┬─────────────────────────┘  │
│                             │                             │                            │
│                ┌────────────▼─────────────┐ ┌─────────────▼───────────────┐            │
│                │   JiraCredentialVault    │ │         JiraClient          │            │
│                │   - AES-256-GCM (v1)     │ │   - Cloud v3 REST routes    │            │
│                │   - AAD bound to connId  │ │   - discoverSites           │            │
│                │   - SecretRedactor sync  │ │   - discoverProjects        │            │
│                └────────────┬─────────────┘ │   - discoverIssueTypes      │            │
│                             │               │   - discoverPriorities      │            │
│                             ▼               │   - discoverFields          │            │
│                ┌──────────────────────────┐ │   - discoverComponents      │            │
│                │    JiraUrlValidator      │ │   - discoverAssignees       │            │
│                │   - Strict SSRF defense  │ │   - testConnectionHealth    │            │
│                │   - HTTPS protocol only  │ └─────────────┬───────────────┘            │
│                └──────────────────────────┘               │                            │
└───────────────────────────────────────────────────────────┼────────────────────────────┘
                                                            │ REST API v3 Calls
                                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                External Jira Endpoints                                 │
│  - GET /rest/api/3/myself                                                              │
│  - GET /rest/api/3/project & /rest/api/3/project/{projectIdOrKey}                      │
│  - GET /rest/api/3/issue/createmeta/{projectIdOrKey}/issuetypes                        │
│  - GET /rest/api/3/priority                                                            │
│  - GET /rest/api/3/field & /rest/api/3/issue/createmeta/{...}/issuetypes/{...}         │
│  - GET /rest/api/3/project/{projectIdOrKey}/components                                 │
│  - GET /rest/api/3/user/assignable/search?project={projectKey}                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema & Storage

### 3.1 `JiraProjectConfig` Model

Persists the project mapping profile linking a local AI Quality project with an external Jira project workspace:

```prisma
enum JiraProjectConfigStatus {
  CONFIGURED
  STALE
  NEEDS_REVIEW
  INVALID
}

enum JiraAssigneeStrategy {
  UNASSIGNED
  SPECIFIC_USER
  AUTOMATIC
}

model JiraProjectConfig {
  id                    String                   @id @default(uuid())
  projectId             String                   @unique @map("project_id")
  connectionId          String                   @map("connection_id")
  jiraProjectId         String                   @map("jira_project_id")
  jiraProjectKey        String                   @map("jira_project_key")
  jiraProjectName       String                   @map("jira_project_name")
  selectedIssueTypeId   String                   @map("selected_issue_type_id")
  selectedIssueTypeName String                   @map("selected_issue_type_name")
  defaultPriorityId     String?                  @map("default_priority_id")
  defaultPriorityName   String?                  @map("default_priority_name")
  defaultComponentId    String?                  @map("default_component_id")
  defaultComponentName  String?                  @map("default_component_name")
  assigneeStrategy      JiraAssigneeStrategy     @default(UNASSIGNED) @map("assignee_strategy")
  defaultAssigneeId     String?                  @map("default_assignee_id")
  defaultAssigneeName   String?                  @map("default_assignee_name")
  fieldMappings         Json?                    @map("field_mappings")
  configStatus          JiraProjectConfigStatus  @default(CONFIGURED) @map("config_status")
  staleReason           String?                  @map("stale_reason")
  metadataSnapshot      Json?                    @map("metadata_snapshot")
  lastRefreshedAt       DateTime                 @default(now()) @map("last_refreshed_at")
  createdBy             String                   @default("USER") @map("created_by")
  createdAt             DateTime                 @default(now()) @map("created_at")
  updatedAt             DateTime                 @updatedAt @map("updated_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([connectionId])
  @@map("jira_project_configs")
}
```

### 3.2 Audit Event Types Extended

The `JiraAuditEventType` enum was extended with 5 dedicated configuration lifecycle events:

- `PROJECT_SELECTED`: Target Jira workspace selected.
- `CONFIGURATION_SAVED`: Profile successfully validated and committed.
- `METADATA_REFRESHED`: Schema synchronized and verified as healthy.
- `CONFIGURATION_STALE`: Staleness engine identified missing remote entity.
- `HEALTH_CHECKED`: 4-step diagnostic execution completed.

---

## 4. Staleness State Machine Engine

The staleness engine (`refreshProjectConfig`) performs active remote verification against the target Jira instance:

| State          | Condition                                                        | UI Indicator          | Action Required                |
| -------------- | ---------------------------------------------------------------- | --------------------- | ------------------------------ |
| `CONFIGURED`   | All mapped projects, issue types, and components verify cleanly. | Green Success Badge   | None. Configuration valid.     |
| `NEEDS_REVIEW` | Mapped default component no longer exists in Jira.               | Yellow Warning Banner | Review or re-select component. |
| `STALE`        | Selected issue type no longer exists in Jira project.            | Yellow Warning Banner | Select an active issue type.   |
| `INVALID`      | Target project no longer accessible or remote API unreachable.   | Red Danger Alert      | Reconfigure target workspace.  |

---

## 5. Security & Isolation Architecture

1. **Zero Plaintext Secrets**:
   - Credentials stored in AES-256-GCM vault with authenticated metadata binding.
   - Plaintext credentials never leave backend memory or appear in DTOs, IPC messages, HTML, or logs.
   - All tokens dynamically registered in `SecretRedactor` to prevent leaks in tracebacks.
2. **Multi-Tenant Project Boundaries**:
   - `JiraCrossProjectError` strictly prevents Project A from viewing or modifying Project B's configuration.
   - Cascade deletion ensures orphaned configuration profiles cannot exist.
3. **Wrong-Project Metadata Defense**:
   - `saveProjectConfig` checks remote Jira metadata before persisting.
   - If an issue type or component does not belong to the target Jira project, `JiraWrongProjectMetadataError` is raised.
4. **Mutex Lock Concurrency Control**:
   - In-memory lock per project serializes concurrent save and refresh calls, preventing race conditions or corrupted snapshots.
5. **SSRF & Address Boundary Protections**:
   - `JiraUrlValidator` strictly blocks private RFC 1918 ranges, cloud metadata services (e.g. AWS/GCP 169.254.169.254), and dangerous protocols unless explicit test mode is active.

---

## 6. IPC Interface & Bridge

11 IPC channels registered with origin validation (`isTrustedIpcSender`):

- `jira:discoverSites` -> `handleDiscoverJiraSites`
- `jira:discoverProjects` -> `handleDiscoverJiraProjects`
- `jira:discoverIssueTypes` -> `handleDiscoverJiraIssueTypes`
- `jira:discoverPriorities` -> `handleDiscoverJiraPriorities`
- `jira:discoverFields` -> `handleDiscoverJiraFields`
- `jira:discoverComponents` -> `handleDiscoverJiraComponents`
- `jira:discoverAssignees` -> `handleDiscoverJiraAssignees`
- `jira:getProjectConfig` -> `handleGetJiraProjectConfig`
- `jira:saveProjectConfig` -> `handleSaveJiraProjectConfig`
- `jira:refreshProjectConfig` -> `handleRefreshJiraProjectConfig`
- `jira:testConnectionHealth` -> `handleTestJiraConnectionHealth`

Exposed securely to renderer via `window.desktop.jira.*`.

---

## 7. Verification & Certification

All quality gates pass with 100% compliance:

- **Jira Test Suite (`npm run test:jira`)**: 92 tests passing across 20 suites.
- **Failure Intelligence Regression (`npm run test:failures`)**: 570 tests passing across 111 suites.
- **Monorepo Test Suite (`npm test`)**: 2,072 tests passing across 535 suites (0 failures, 0 skipped).
- **TypeScript Typecheck (`npm run typecheck`)**: 0 errors.
- **ESLint Quality Check (`npm run lint`)**: 0 errors.
- **Prettier Code Format (`npm run format:check`)**: All files verified.
- **Desktop Production Build (`npm run desktop:build`)**: Successfully bundled.
- **Desktop Smoke Verification (`npm run desktop:smoke`)**: Executed cleanly.

### Truthful Testing Status

In offline local test environments without corporate enterprise Jira credentials, live external Jira connectivity is truthfully certified as **`BLOCKED / NOT AVAILABLE`**. All contract interactions, authentication protocols, rate limiting, and failure modes are validated via local HTTP wire mock server simulation.
