# V7 Phase 91: Automated Jira Issue Creation

## 1. Overview

Phase 91 delivers **Automated Jira Issue Creation** within the V7 External Integrations subsystem of the AI-Driven Software Quality Engineering Platform. Operating as the primary operational bridge between internal V6 defect intelligence and enterprise issue tracking systems, Phase 91 takes authoritative, audited `StructuredBugReport` entities and exports them into remote Jira issues using the authenticated connections (`JiraConnection`) and project configuration profiles (`JiraProjectConfig`) established in Phases 89–90.

### 1.1 Strict Scope Boundaries

In accordance with strict modular phase governance:

- **Included in Phase 91**:
  - Deterministic defect eligibility gate: strictly restricts Jira issue creation to `CONFIRMED_APPLICATION_DEFECT` and `SUPPORTED_APPLICATION_DEFECT` where `isApplicationDefect === true`. Strictly blocks all automation failures, environment failures, test data errors, inconclusive runs, and flaky/unstable failures.
  - Safe, epistemic Jira payload generator (`JiraIssuePayloadBuilder`):
    - Generates Atlassian Document Format (ADF v1) for Jira Cloud.
    - Generates standard Wiki markup / Plain Text for Jira Server and Jira Data Center.
    - Enforces epistemic demarcation with explicit labels: `[FACT]`, `[DETERMINISTIC CLASSIFICATION]`, `[AI INFERENCE]`, and `[UNKNOWN]`.
    - Includes mandatory italicized/emphasized disclaimer on AI root cause hypotheses.
    - Bounded summary length (<= 254 chars) with safe sanitization and newline removal.
    - Secret and credential redaction (Bearer tokens, basic auth, passwords, secrets, private keys).
  - Strict idempotency and concurrency protection:
    - SHA-256 deterministic request fingerprinting (`requestFingerprint`).
    - Duplicate request detection returning existing `JiraExternalIssue` without calling remote APIs.
    - In-memory async mutex queue serializing concurrent creation calls per failure case.
  - Authoritative persistence:
    - PostgreSQL model `JiraExternalIssue` tracking remote Jira issue keys, IDs, URLs, creation status, and metadata snapshots.
    - Comprehensive audit logging (`ISSUE_CREATION_ATTEMPTED`, `ISSUE_CREATED`, `ISSUE_CREATION_FAILED`).
  - Desktop integration:
    - Electron IPC handlers (`JIRA_CREATE_ISSUE`, `JIRA_GET_ISSUE`) with origin validation and Zod contract parsing.
    - Interactive UI card inside `StructuredBugReportPanel.tsx` with eligibility badges, Jira issue links, and creation dialog modal.
- **Strictly Excluded (Non-Goals)**:
  - NO binary artifact uploads (screenshots, traces, DOM dumps, videos) — **strictly Phase 92**.
  - NO semantic duplicate issue detection or issue linking — **strictly Phase 93**.
  - NO developer assignment, sprint planning, or status transition automation.
  - NO bidirectional sync or webhook listener.
  - NO automated code repair or patch generation.

---

## 2. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               Desktop Renderer (React 19)                              │
│  [ StructuredBugReportPanel ]                                                          │
│   ├── Defect Eligibility Evaluation (CONFIRMED_APPLICATION_DEFECT check)               │
│   ├── Jira Issue Integration Card                                                      │
│   │    ├── "Create Jira Issue" Button (disabled with warning if ineligible)            │
│   │    └── Authoritative Jira Issue Badge (Key, Summary, Status, Direct Link)          │
│   └── Confirmation & Creation Modal Dialog                                             │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ window.desktop.jira.createIssue()
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Desktop Main IPC (Electron)                               │
│  [ jira-handlers.ts ]                                                                  │
│   ├── isTrustedIpcSender() (Origin & Frame Security Check)                             │
│   └── createJiraIssueInputSchema.parse()                                               │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       Core Service Layer (@ai-quality/core)                            │
│  [ JiraIssueCreationService ]                                                          │
│   ├── 1. Async Mutex Queue Acquisition (per failureCaseId)                             │
│   ├── 2. Multi-Tenant Project Isolation Check                                          │
│   ├── 3. Deterministic Defect Eligibility Gate                                         │
│   │      (isApplicationDefect === true && CONFIRMED/SUPPORTED_APPLICATION_DEFECT)     │
│   ├── 4. Active Connection & Valid Configuration Verification                          │
│   ├── 5. Idempotency Check (Existing JiraExternalIssue by failureCaseId)                │
│   ├── 6. JiraIssuePayloadBuilder                                                       │
│   │      ├── Summary Sanitization (<= 254 chars, clean prefixes)                       │
│   │      ├── Secret Redactor (Tokens, Passwords, Keys)                                 │
│   │      └── Epistemic Demarcation (ADF v1 or Plain Text)                              │
│   ├── 7. JiraCredentialVault.decrypt() -> Plain Token                                  │
│   ├── 8. Audit Logging: ISSUE_CREATION_ATTEMPTED                                       │
│   ├── 9. JiraClient.createIssue() (HTTP POST /rest/api/3/issue or /2/issue)            │
│   ├── 10. PostgreSQL Persistence: prisma.jiraExternalIssue.create()                    │
│   └── 11. Audit Logging: ISSUE_CREATED (or ISSUE_CREATION_FAILED)                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Epistemic Demarcation & Payload Generation

A fundamental principle of the AI-Driven Software Quality Platform is epistemic clarity: human engineers receiving Jira issues must never confuse proven telemetry facts with AI-inferred hypotheses.

`JiraIssuePayloadBuilder` guarantees strict separation across all description sections:

| Section                         | Epistemic Level                  | Description                                                                                                                                                                                            |
| :------------------------------ | :------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Defect Summary**           | Context                          | Standardized, sanitized summary derived from the verified bug report title.                                                                                                                            |
| **2. Traceability & Context**   | `[FACT]`                         | Immutable linkage to internal Report ID, Revision, Test Case Key, and Source Requirement Key.                                                                                                          |
| **3. Observed Test Behavior**   | `[FACT]`                         | Ground-truth execution failure point, failing step index, expected result, actual result, and reproduction sequence.                                                                                   |
| **4. Reproduction Telemetry**   | `[FACT]`                         | Deterministic reproduction state, attempt count, success ratio, browser, and OS telemetry.                                                                                                             |
| **5. Failure Classification**   | `[DETERMINISTIC CLASSIFICATION]` | Rules-based classification category, severity, priority, and application defect state.                                                                                                                 |
| **6. Root Cause Analysis**      | `[AI INFERENCE]`                 | Inferred probable layer, component, and hypothesis. Accompanied by mandatory disclaimer: `DISCLAIMER: The root cause summary above is an AI inference based on execution telemetry and is not proven.` |
| **7. Confidence & Calibration** | Metric                           | Calibrated confidence score and confidence band derived in V6 Phase 86.                                                                                                                                |
| **8. Evidence References**      | Reference                        | Pointers to recorded evidence items (screenshots, traces, DOM dumps) without attaching binary payloads.                                                                                                |
| **9. Limitations & Unknowns**   | `[UNKNOWN]`                      | Explicit enumeration of test execution limitations, unobserved boundaries, or telemetry gaps.                                                                                                          |

---

## 4. Deterministic Defect Eligibility Enforcement

To maintain trust with engineering teams and prevent noise in issue tracking systems, automated issue creation is protected by strict eligibility gating:

- **Permitted States**:
  - `CONFIRMED_APPLICATION_DEFECT` (when `isApplicationDefect === true`)
  - `SUPPORTED_APPLICATION_DEFECT` (when `isApplicationDefect === true`)
- **Strictly Blocked States** (throws `JiraIssueIneligibleError`):
  - `AUTOMATION_FAILURE`
  - `TEST_DATA_FAILURE`
  - `ENVIRONMENT_FAILURE`
  - `BLOCKED`
  - `UNKNOWN`
  - `INCONCLUSIVE`
  - `FLAKY_UNSTABLE_FAILURE`
  - Any failure case where `isApplicationDefect === false`
  - Superseded bug reports (`status === 'SUPERSEDED'`)

Ineligible failure cases are blocked both in the backend core service and in the desktop UI, where creation buttons are disabled with warning banners explaining the classification restriction.

---

## 5. Security & Multi-Tenant Isolation

1. **Cross-Project Isolation**:
   Every creation request validates that the target `projectId`, `failureCase.projectId`, `bugReport.projectId`, `connection.projectId`, and `projectConfig.projectId` strictly match. Mismatches throw `JiraCrossProjectError` or `JiraBugReportNotFoundError`.
2. **SSRF and Insecure Scheme Defense**:
   Inherited from Phase 89, URL validation blocks loopback addresses, link-local IPs, cloud metadata endpoints (e.g. AWS `169.254.169.254`), and dangerous protocols in production.
3. **Secret Redaction**:
   All text fields passed to Jira are sanitized through `SecretRedactor` and pattern regexes, masking Bearer tokens, passwords (`password=***`), connection strings (`postgresql://user:***@host`), and private keys (`-----BEGIN PRIVATE KEY-----`).
4. **Credential Isolation**:
   Decrypted API tokens exist strictly in volatile local memory during the active HTTP request and are never written to disk, logs, or external metadata snapshots.

---

## 6. Verification & Test Metrics

Phase 91 has been verified across the platform's multi-tiered automated test suite:

- **Phase 91 Specific Tests**:
  - `packages/core/src/jira/jira-issue-payload-builder.test.ts`: **12/12 pass** (ADF format, markdown, length limits, secret redaction, label synthesis, epistemic demarcation).
  - `packages/core/src/jira/jira-issue-creation.test.ts`: **10/10 pass** (Deterministic eligibility, idempotency, mutex serialization, cross-project isolation, audit logging).
  - `packages/core/src/jira/jira-phase91-contract.test.ts`: **8/8 pass** (HTTP wire simulation, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 429 Rate Limited, SSRF protection).
  - `apps/desktop/src/main/ipc/jira-phase91-handlers.test.ts`: **9/9 pass** (IPC origin security, UUID validation, error code mapping).
  - `apps/desktop/src/main/jira-phase91-ui.test.tsx`: **3/3 pass** (Jira integration card rendering, eligibility warnings).
- **Subsystem & Regression Suites**:
  - `npm run test:jira`: **134/134 pass** across 16 test files (Phase 89, 90, 91).
  - `npm run test:failures`: **570/570 pass** across 104 test files (V6 failure intelligence regression).
  - `npm test`: **2,114/2,114 pass** across 332 test files across the entire monorepo.
  - `npm run typecheck`: **0 errors** (`tsc -b`).
  - `npm run lint` (`eslint --quiet`): **0 errors**.
  - `npm run format:check`: **All files formatted with Prettier**.
  - `npm run desktop:build` & `npm run desktop:smoke`: **Builds and passes smoke validation in headless Electron**.

---

## 7. External Connectivity Status

In accordance with platform testing standards:

- All automated unit, integration, and wire contract tests run against local HTTP simulation servers and PostgreSQL 16.
- Direct connectivity to live Atlassian Cloud / Data Center environments without enterprise credentials is accurately and truthfully designated as:
  **`BLOCKED / NOT AVAILABLE` (Enterprise Credentials Required for Live Production Dispatch)**.
