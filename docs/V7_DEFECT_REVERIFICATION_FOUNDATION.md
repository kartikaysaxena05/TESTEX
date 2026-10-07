# V7 Phase 97 — Defect Reverification Foundation

## 1. Overview and Architecture

The Defect Reverification Foundation provides an authoritative, deterministic, and safe mechanism to determine whether a resolved defect is eligible for reverification, resolve its historical test provenance and fix origin, perform production safety checks, generate an execution-ready reverification plan, and maintain an immutable audit trail.

Reverification acts as the critical bridge between external bug resolution (such as Jira issue transitions to "Resolved"/"Done" or internal status changes) and verified fix confirmation.

### Core Invariants & Strict Phase 97 Scope Boundaries

1. **Deterministic Eligibility & Planning Only**: Phase 97 determines eligibility, verifies safety, resolves historical provenance, and compiles deterministic execution plans. It strictly does **not** launch Playwright browser execution, does **not** auto-run failed tests, does **not** mark defects as `VERIFIED_FIXED`, and does **not** attempt automated code patching. Those capabilities are deferred to Phase 98+.
2. **Historical Provenance Immutability**: The historical test version that originally reproduced the failure case remains the authoritative source of truth. Historical test definitions, step actions, screenshots, traces, and execution records from V5/V6 remain strictly immutable.
3. **Truthful Fix Provenance**: When external commit hashes or pull request references are unknown or omitted, the system truthfully records fix provenance as `UNKNOWN` without fabricating data.
4. **Production Safety Policy**: Any mutating action (POST, PUT, DELETE, mutate keywords, form submissions) targeted against a production environment automatically causes safety evaluation to yield `BLOCKED`.
5. **Multi-Tenant Isolation**: Strict cross-project defenses prevent querying, evaluating, creating, or cancelling reverification records across distinct project tenants.
6. **Per-Defect Mutex Serialization**: Asynchronous locking per `failureCaseId` guarantees serialized status transitions, preventing race conditions or duplicate execution plans.
7. **Request Supersession**: Creating a new reverification request for a failure case cleanly supersedes any existing pending/ready request.

---

## 2. Database Schema ()

### Enums

- **`ReverificationStatus`**: `PENDING`, `READY`, `SUPERSEDED`, `CANCELLED`, `BLOCKED`
- **`ReverificationEligibility`**: `ELIGIBLE`, `NOT_ELIGIBLE`, `BLOCKED`
- **`ReverificationTriggerType`**: `MANUAL_REQUEST`, `JIRA_STATUS_CHANGE`, `INTERNAL_STATUS_CHANGE`, `CI_WEBHOOK`

### Models

- **`DefectReverification`**:
  - `id` (UUID, PK)
  - `projectId` (UUID, FK -> Project)
  - `failureCaseId` (UUID, FK -> FailureCase)
  - `structuredBugReportId` (UUID, optional FK -> StructuredBugReport)
  - `jiraIssueLinkId` (UUID, optional FK -> JiraIssueLink)
  - `targetEnvironmentId` (UUID, FK -> ProjectEnvironment)
  - `status` (`ReverificationStatus`, default `PENDING`)
  - `eligibility` (`ReverificationEligibility`, default `ELIGIBLE`)
  - `eligibilityReasons` (String[])
  - `triggerType` (`ReverificationTriggerType`)
  - `historicalTestCaseVersion` (Int)
  - `selectedTestCaseVersion` (Int)
  - `fixCommitSha` (VarChar(64), optional)
  - `fixBranchName` (VarChar(255), optional)
  - `fixPullRequestUrl` (Text, optional)
  - `fixProvenanceRaw` (Json, optional)
  - `isSafe` (Boolean, default `true`)
  - `safetyReason` (Text, optional)
  - `safetyViolations` (String[])
  - `executionPlanJson` (Json, optional)
  - `reverificationPlanFingerprint` (VarChar(64), optional)
  - `cancellationReason` (Text, optional)
  - `cancelledBy` (VarChar(128), optional)
  - `cancelledAt` (Timestamptz, optional)
  - `supersededByReverificationId` (UUID, optional)
  - `createdAt`, `updatedAt` (Timestamptz)

- **`ReverificationAuditEvent`**:
  - `id` (UUID, PK)
  - `projectId` (UUID, FK -> Project)
  - `reverificationId` (UUID, FK -> DefectReverification)
  - `action` (VarChar(64): `CREATED`, `SUPERSEDED`, `CANCELLED`, `STATUS_CHANGED`, `PLAN_GENERATED`)
  - `fromStatus` (`ReverificationStatus`, optional)
  - `toStatus` (`ReverificationStatus`)
  - `actor` (VarChar(128))
  - `details` (Json, default `{}`)
  - `createdAt` (Timestamptz)

---

## 3. Component Architecture

### ReverificationEligibilityEngine

Evaluates 11 factual criteria without guessing:

1. Target failure case existence and project tenancy.
2. Internal bug report or failure case status (e.g. not `WONT_FIX`).
3. Historical test case and version availability.
4. Target environment configuration validity and reachability.
5. Target environment enabled status.
6. Target application configuration existence.
7. Absence of active execution locks or concurrent test runs.
8. Historical reproduction evidence integrity.
9. Safety policy compliance for the target environment.
10. Jira issue link status consistency (if linked).
11. Overall state determinism.

### ReverificationSafetyChecker

Inspects the test steps, actions, URL endpoints, and environment type:

- If target environment is disabled -> `BLOCKED`.
- If environment type is `PRODUCTION` and production execution policy is `PROHIBITED` -> `BLOCKED`.
- If environment type is `PRODUCTION` and test steps contain mutating keywords (`DELETE`, `PURGE`, `SUBMIT`, `POST`, `UPDATE`) -> `BLOCKED`.
- If non-production (e.g. `DEVELOPMENT` or `STAGING`), mutating actions are permitted.

### ReverificationProvenanceResolver

Preserves historical test fidelity:

- Resolves the exact `TestCaseVersion` recorded when the defect was captured.
- Ensures the historical step actions are retrieved without mutation.
- Evaluates fix references (`commitSha`, `branchName`, `pullRequestUrl`). If absent, records provenance as `UNKNOWN` without fabricating commit data.

### ReverificationPlanGenerator

Compiles an execution-ready reverification plan:

- Test execution specification including test case key, version number, step actions, assertions, and timeouts.
- Target environment details (URL, headers, auth profile).
- Fix provenance metadata.
- Safety policy evaluation result.
- Computes SHA-256 plan fingerprint for tamper detection.

### DefectReverificationService

Authoritative orchestrator:

- Asynchronous per-defect locking (`AsyncLock`).
- Multi-tenant tenant verification on all entry points.
- Automatically handles supersession of existing requests.
- Transactional persistence via Prisma.
- Immutable audit event trail.

---

## 4. Desktop IPC & User Interface

### IPC Channels & Handlers

Registered via `apps/desktop/src/main/ipc/reverification-handlers.ts`:

- `reverification:getState`: Retrieves reverification record and eligibility for a defect.
- `reverification:evaluateEligibility`: Evaluates eligibility against a specified target environment.
- `reverification:createRequest`: Creates a new reverification request and generates its plan.
- `reverification:generatePlan`: Regenerates or retrieves execution-ready plan.
- `reverification:cancel`: Cancels an active reverification request with actor and reason.
- `reverification:listAuditEvents`: Lists historical audit events for a reverification request.

### Preload Bridge

Exposed via `window.desktopBridge.reverification` with full TypeScript typing.

### UI Renderer Component

`DefectReverificationCard.tsx` rendered inside `StructuredBugReportPanel.tsx`:

- Displays reverification eligibility badge (`ELIGIBLE`, `NOT_ELIGIBLE`, `BLOCKED`).
- Status banner (`READY`, `PENDING`, `BLOCKED`, `CANCELLED`, `SUPERSEDED`).
- Environment selector and safety indicators.
- Historical test version indicator with provenance metadata.
- "Prepare Reverification" button to initiate request and plan generation.
- "Cancel" button with reason modal for active requests.
- Audit event trail accordion.
- Strictly excludes any "Run Reverification" or "Mark Fixed" controls (Phase 98+).

---

## 5. Phase 98 Handoff Contract

Phase 97 concludes when the reverification request is in `READY` status (or `BLOCKED` if safety/eligibility fails) with an execution-ready plan JSON and audit log preserved in PostgreSQL. Phase 98 picks up the verified plan to orchestrate Playwright execution, verify assertion fixes, and handle regression testing.
