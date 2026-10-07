# V6 Phase 81 — Failure Evidence Correlation & Technical Cause Localization Architecture

## 1. Executive Summary

Phase 81 introduces the **Failure Evidence Correlation & Technical Cause Localization Subsystem** to the AI-Driven Software Quality Engineering Platform.

Building upon Phase 74 (Failure Intelligence Domain), Phase 75 (Evidence Ingestion & Normalization), Phase 76 (Controlled Reproduction), Phase 77 (Deterministic Classification), Phase 78 (Decision Integrity & Arbitration), Phase 79 (Flakiness Intelligence), Phase 80 (Domain Separation), and V2 Indexed Repository Intelligence, Phase 81 establishes:

1. **Deterministic Technical Layer Localization & Target Mapping**:
   - Accurately identifies **where** the failure manifested across the software stack without speculative root-cause inference.
   - Localizes to an authoritative primary technical layer and identifies primary and secondary targets with associated source evidence keys.
2. **Authoritative Technical Layer Taxonomy**:
   - `FRONTEND_UI`: Visual rendering, CSS layout, DOM structure, component visibility.
   - `FRONTEND_STATE`: Client state management, data binding, reactive state errors, uncaught JavaScript runtime exceptions.
   - `FRONTEND_NETWORK_CLIENT`: Network client fetch/XHR failures, client-side aborts, timeout configurations.
   - `BACKEND_API`: HTTP 5xx responses, endpoint contract violations, malformed request payloads.
   - `BACKEND_SERVICE`: Internal backend service failures, microservice gateway errors, business logic exceptions.
   - `DATABASE`: SQL syntax errors, database connection pool exhaustion, transaction deadlocks, constraint violations.
   - `AUTHENTICATION`: HTTP 401 Unauthorized, token expiration, session invalidation.
   - `AUTHORIZATION`: HTTP 403 Forbidden, RBAC permission denial, scope mismatch.
   - `EXTERNAL_SERVICE`: Third-party API failures, payment gateway errors, webhook connection timeouts.
   - `BROWSER_AUTOMATION`: Playwright driver crashes, invalid selector syntax, automation timeout exceeded.
   - `TEST_INFRASTRUCTURE`: Worker crash, test runner failure, test grid communication error.
   - `TEST_DATA`: Missing seed fixtures, locked test accounts, data precondition mismatches.
   - `ENVIRONMENT`: DNS resolution failures, port connection refused (`ECONNREFUSED`), host unreachable.
   - `UNKNOWN`: Insufficient evidence or conflicting telemetry.
   - `MULTI_LAYER`: Multiple co-occurring faults across disparate architectural layers.
3. **Multi-Target Granularity**:
   - Supported Target Types: `TEST_STEP`, `ASSERTION`, `DOM_ELEMENT`, `FRONTEND_ROUTE`, `FRONTEND_COMPONENT`, `FRONTEND_EVENT_HANDLER`, `NETWORK_REQUEST`, `API_ENDPOINT`, `BACKEND_ROUTE`, `BACKEND_CONTROLLER`, `BACKEND_SERVICE`, `REPOSITORY_FILE`, `REPOSITORY_SYMBOL`, `DATABASE_OPERATION`, `EXTERNAL_SERVICE`, `ENVIRONMENT_DEPENDENCY`, `BROWSER_SUBSYSTEM`.
4. **Deterministic Event Timeline Merging**:
   - Constructs a unified, strictly chronological timeline by merging:
     - Test step executions ($t_{\text{start}}, t_{\text{end}}$).
     - Network requests and responses with status codes and timing.
     - Browser console logs and uncaught runtime exceptions.
     - DOM mutation events and user interaction targets.
     - Assertion checks and evaluation outcomes.
5. **Step-Network Correlation Engine**:
   - Correlates network failures directly to the active test step interval.
   - Explicitly distinguishes between direct step network failures and unsolicited background errors (e.g., background telemetry HTTP 500 while a UI assertion failed).
6. **V2 Indexed Repository Route Linking**:
   - Resolves failing API endpoints (e.g. `/api/v1/checkout/process`) directly to indexed repository files (`checkout.controller.ts`) and symbols (`processPayment`).
   - Resolves UI component selectors (e.g. `#login-form`) to component source files (`LoginForm.tsx`) and component symbols (`LoginForm`).
7. **Domain Boundary Constraints (Phase 80 Inheritance)**:
   - Respects boundaries established by Phase 80 domain separation.
   - `AUTOMATION_FAILURE` restricts localization strictly to `BROWSER_AUTOMATION` or `TEST_INFRASTRUCTURE`.
   - `ENVIRONMENT_FAILURE` restricts localization strictly to `ENVIRONMENT` or `EXTERNAL_SERVICE`.
   - `TEST_DATA_FAILURE` restricts localization strictly to `TEST_DATA`.
8. **Conflicting Signals Detection**:
   - Flags multi-layer anomalies and conflicting evidence (such as a 500 error on an unrelated background poll when the test failed on a button locator).
9. **Invariant Cryptographic Fingerprinting**:
   - Generates a deterministic 64-character SHA-256 fingerprint over canonically ordered localization facts.
   - Sanitizes bearer tokens, passwords, cookies, and database connection strings prior to digest computation.
10. **Strict Immutability & Audit Tracking**:
    - Execution $E_1$ and prior failure analysis artifacts are 100% immutable.
    - Operator re-localization creates a new authoritative record, demoting previous records while maintaining complete historical auditability (`relocalizationCount`, `relocalizationReason`).
    - Dynamic staleness detection on read marks localization stale if upstream artifacts (evidence, classification, or domain separation) are newer than the localization timestamp.

---

## 2. Formal Architecture & Signal Correlation Theory

### 2.1 Formal Model

Let $F$ be an authoritative failure case associated with execution $E_1$, evidence set $\mathcal{E}$, and Phase 80 domain separation $\mathcal{D}_0$.

Let $\mathcal{T}$ denote the chronological event timeline:
$$\mathcal{T} = \text{MergeSort}(\text{Steps} \cup \text{NetworkEvents} \cup \text{ConsoleEvents} \cup \text{Assertions})$$

Let $\mathcal{S}$ denote the set of extracted correlation signals:
$$\mathcal{S} = \{ s_1, s_2, \dots, s_n \}, \quad s_i = \langle \text{type}, \text{layer}, \text{target}, \text{strength}, \text{evidenceKey} \rangle$$
where $\text{strength} \in \{ \text{DIRECT}, \text{SUPPORTING}, \text{INDIRECT}, \text{CORRELATED} \}$.

### 2.2 Correlation & Disambiguation Rules

1. **Domain Boundary Filter**:
   $$\text{Layer}(F) \subseteq \text{AllowedLayers}(\mathcal{D}_0)$$
2. **HTTP Server Error (5xx)**:
   If a network request within the failing step window failed with HTTP 5xx:
   $$\text{Layer}(F) = \text{BACKEND\_API}, \quad \text{TargetType}(F) = \text{API\_ENDPOINT}$$
   Repository route linking maps the HTTP route to a `RepositoryFile` and `RepositorySymbol`.
3. **Authentication / Authorization (401 / 403)**:
   - HTTP 401 $\implies \text{Layer}(F) = \text{AUTHENTICATION}, \quad \text{TargetType}(F) = \text{API\_ENDPOINT}$
   - HTTP 403 $\implies \text{Layer}(F) = \text{AUTHORIZATION}, \quad \text{TargetType}(F) = \text{API\_ENDPOINT}$
4. **Client-Side JavaScript Exception**:
   If an uncaught console error (`Error`, `TypeError`, `SyntaxError`) occurred:
   $$\text{Layer}(F) = \text{FRONTEND\_STATE}, \quad \text{TargetType}(F) = \text{FRONTEND\_COMPONENT}$$
   Repository linker links component name or route to indexed source files.
5. **UI Content / Assertion Mismatch**:
   If step action is `ASSERT` and failed with no direct network error:
   $$\text{Layer}(F) = \text{FRONTEND\_UI}, \quad \text{TargetType}(F) = \text{ASSERTION}$$
   Any concurrent background 5xx request is flagged as a **conflicting signal** (`UNSOLICITED_BACKGROUND_HTTP_ERROR`), preventing misattribution.
6. **Automation Selector / Timeout**:
   If $\mathcal{D}_0 = \text{AUTOMATION\_FAILURE}$ or locator syntax error:
   $$\text{Layer}(F) = \text{BROWSER\_AUTOMATION}, \quad \text{TargetType}(F) = \text{DOM\_ELEMENT} \lor \text{TEST\_STEP}$$

---

## 3. Database Schema

Phase 81 introduces the `FailureTechnicalLocalization` model and supporting enums in Prisma / PostgreSQL:

```prisma
enum TechnicalLayer {
  FRONTEND_UI
  FRONTEND_STATE
  FRONTEND_NETWORK_CLIENT
  BACKEND_API
  BACKEND_SERVICE
  DATABASE
  AUTHENTICATION
  AUTHORIZATION
  EXTERNAL_SERVICE
  BROWSER_AUTOMATION
  TEST_INFRASTRUCTURE
  TEST_DATA
  ENVIRONMENT
  UNKNOWN
  MULTI_LAYER
}

enum LocalizationTargetType {
  TEST_STEP
  ASSERTION
  DOM_ELEMENT
  FRONTEND_ROUTE
  FRONTEND_COMPONENT
  FRONTEND_EVENT_HANDLER
  NETWORK_REQUEST
  API_ENDPOINT
  BACKEND_ROUTE
  BACKEND_CONTROLLER
  BACKEND_SERVICE
  REPOSITORY_FILE
  REPOSITORY_SYMBOL
  DATABASE_OPERATION
  EXTERNAL_SERVICE
  ENVIRONMENT_DEPENDENCY
  BROWSER_SUBSYSTEM
}

enum SignalStrength {
  DIRECT
  SUPPORTING
  INDIRECT
  CORRELATED
}

model FailureTechnicalLocalization {
  id                          String                 @id @default(uuid()) @db.Uuid
  projectId                   String                 @map("project_id") @db.Uuid
  failureCaseId               String                 @map("failure_case_id") @db.Uuid
  failureAnalysisRunId        String?                @map("failure_analysis_run_id") @db.Uuid
  domainSeparationId          String?                @map("domain_separation_id") @db.Uuid
  testCaseId                  String                 @map("test_case_id") @db.Uuid
  testCaseVersionNumber       Int                    @default(1) @map("test_case_version_number")

  primaryLayer                TechnicalLayer         @map("primary_layer")
  secondaryLayers             TechnicalLayer[]       @map("secondary_layers")
  primaryTargetType           LocalizationTargetType @map("primary_target_type")
  primaryTargetIdentifier     String                 @map("primary_target_identifier") @db.VarChar(512)
  secondaryTargetsJson        Json                   @default("[]") @map("secondary_targets_json")

  matchedFileId               String?                @map("matched_file_id") @db.Uuid
  matchedFilePath             String?                @map("matched_file_path") @db.VarChar(1024)
  matchedSymbolId             String?                @map("matched_symbol_id") @db.Uuid
  matchedSymbolName           String?                @map("matched_symbol_name") @db.VarChar(255)

  httpEndpoint                String?                @map("http_endpoint") @db.VarChar(1024)
  httpMethod                  String?                @map("http_method") @db.VarChar(16)
  httpStatusCode              Int?                   @map("http_status_code")
  domSelector                 String?                @map("dom_selector") @db.VarChar(512)
  uiComponentName             String?                @map("ui_component_name") @db.VarChar(255)
  routePath                   String?                @map("route_path") @db.VarChar(1024)

  correlationSignalsJson      Json                   @default("[]") @map("correlation_signals_json")
  conflictingSignalsJson      Json                   @default("[]") @map("conflicting_signals_json")
  timelineEventsJson          Json                   @default("[]") @map("timeline_events_json")
  evidenceReferencesJson      Json                   @default("[]") @map("evidence_references_json")

  confidence                  Float                  @default(1.0)
  localizationRulesVersion    String                 @default("1.0.0") @map("localization_rules_version") @db.VarChar(32)
  technicalRationale          String                 @map("technical_rationale") @db.Text
  localizationFingerprint     String                 @map("localization_fingerprint") @db.VarChar(64)

  isAuthoritative             Boolean                @default(true) @map("is_authoritative")
  isStale                     Boolean                @default(false) @map("is_stale")
  stalenessReason             String?                @map("staleness_reason") @db.Text
  relocalizationCount         Int                    @default(0) @map("relocalization_count")
  relocalizationReason        String?                @map("relocalization_reason") @db.Text

  localizedAt                 DateTime               @default(now()) @map("localized_at") @db.Timestamptz(6)
  createdAt                   DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                   DateTime               @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  project                     Project                @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase                 FailureCase            @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  domainSeparation            FailureDomainSeparation? @relation(fields: [domainSeparationId], references: [id], onDelete: SetNull)
  matchedFile                 RepositoryFile?        @relation(fields: [matchedFileId], references: [id], onDelete: SetNull)
  matchedSymbol               RepositorySymbol?      @relation(fields: [matchedSymbolId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([failureCaseId])
  @@index([domainSeparationId])
  @@index([primaryLayer])
  @@index([isAuthoritative])
  @@map("failure_technical_localizations")
}
```

---

## 4. Desktop IPC Channels & Contracts

Registered under `DESKTOP_CHANNELS`:

- `FAILURES_LOCALIZE_TECHNICAL_CAUSE` (`failures:localize-technical-cause`): Evaluates evidence, timeline, and repository linkage to produce authoritative localization.
- `FAILURES_GET_TECHNICAL_LOCALIZATION` (`failures:get-technical-localization`): Fetches authoritative localization with dynamic staleness detection.
- `FAILURES_RELOCALIZE_TECHNICAL_CAUSE` (`failures:relocalize-technical-cause`): Re-evaluates localization with an operator audit justification.
- `FAILURES_LIST_LOCALIZATION_HISTORY` (`failures:list-localization-history`): Lists complete historical revision chain for a failure case.

### Desktop Error Codes

- `LOCALIZATION_NOT_FOUND`: Failure case or localization record not found.
- `LOCALIZATION_STALE`: Upstream evidence or analysis modified after localization.
- `LOCALIZATION_INSUFFICIENT_EVIDENCE`: No evidence available to correlate.
- `LOCALIZATION_BLOCKED`: Phase 78 decision integrity blocked.
- `LOCALIZATION_CROSS_PROJECT`: Multi-tenant isolation violation.
- `LOCALIZATION_CONCURRENT_MUTATION`: Mutex contention during mutation.

---

## 5. Security & Verification

1. **Top-Frame IPC Validation**: `isTrustedIpcSender` strictly blocks untrusted senders or nested iframes.
2. **Multi-Tenant Isolation**: Every database query filters by `projectId` and validates resource ownership.
3. **Secret Redaction**: Passwords, API tokens, and credentials stripped before fingerprint generation.
4. **Concurrency**: Mutex lock (`withLock("${projectId}:${failureCaseId}")`) serializes executions per failure case.
5. **Immutability**: Execution $E_1$ and historical analysis records remain strictly immutable.
