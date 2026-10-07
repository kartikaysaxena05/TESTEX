# V6 Phase 80 — Application Bug vs Automation / Test-Data / Environment Failure Separation Architecture

## 1. Executive Summary

Phase 80 introduces the **Authoritative Failure Domain Separation Subsystem** to the AI-Driven Software Quality Engineering Platform.

Building upon Phase 74 (Failure Intelligence Domain), Phase 75 (Evidence Ingestion & Normalization), Phase 76 (Controlled Reproduction), Phase 77 (Deterministic Classification), Phase 78 (Decision Integrity & Arbitration), and Phase 79 (Flakiness Intelligence), Phase 80 establishes:

1. **Exclusion-First Attribution Architecture**:
   - A failed automated test is **NOT** automatically an application bug.
   - Attributing a failure to `APPLICATION_DEFECT_CANDIDATE` strictly requires that all plausible automation, environment, test-data, and requirement ambiguity causes are conclusively evaluated and **excluded**.
2. **Authoritative Failure Domain Space**:
   - `APPLICATION_DEFECT_CANDIDATE`: Valid test assertions deviated due to application behavior after strictly ruling out external causes.
   - `AUTOMATION_FAILURE`: Failure caused by locator syntax error, ambiguous selector, framework crash, or driver timeout.
   - `TEST_DATA_FAILURE`: Missing fixtures, unseeded test accounts, locked credentials, or unmet data preconditions.
   - `ENVIRONMENT_FAILURE`: Unreachable hosts, connection refused (`ECONNREFUSED`), missing config, or network gateway timeouts.
   - `BLOCKED`: Decision integrity arbitration is blocked or conflicting evidence prevents authoritative triage.
   - `INCONCLUSIVE`: Conflicting signals or insufficient telemetry prevents definitive attribution.
   - `UNKNOWN`: Zero diagnostic telemetry or missing evidence artifacts.
3. **Multi-Modal Signal Disambiguation**:
   - _Locator Separation_: Stale selector syntax, malformed CSS/XPath, or multiple element ambiguity vs genuinely missing element in valid rendered DOM.
   - _Timeout Separation_: Automation worker / Playwright driver freeze vs network DNS / connection refused vs slow application HTTP response.
   - _Test-Data Provenance_: Concrete seed fixtures, fixture missing errors, and database account locks separated from business logic defects.
   - _Environment Drift_: Drift between environments is diagnostic evidence, not an automatic failure reason.
4. **Flakiness Independence (Phase 79 Integration)**:
   - Flakiness is a frequency/reproducibility attribute, not a root-cause domain.
   - An intermittent application race condition remains `APPLICATION_DEFECT_CANDIDATE` with `flakinessState: CONFIRMED_FLAKY`.
   - Flaky tests are **never** collapsed into `AUTOMATION_FAILURE` by default.
5. **Deterministic Cryptographic Digest**:
   - Generates an invariant 64-character SHA-256 fingerprint over canonically sorted domain separation facts.
   - Automatically sanitizes API tokens, bearer authorization headers, database connection strings, and passwords prior to fingerprinting and persistence.
6. **Strict Immutability & Tenant Security**:
   - Historical test execution records ($E_1$), retries, evidence references, reproduction attempts, and classification decisions remain strictly immutable.
   - Multi-tenant project boundary validation rejects any cross-project separation or history read attempt.
   - Top-frame IPC sender validation (`isTrustedIpcSender`) blocks unauthorized or nested subframe invocations.
   - In-memory Promise mutex (`withLock`) serializes concurrent evaluations on the same failure case.

---

## 2. Mathematical Formalization & Decision Theory

### 2.1 Domain Space Formal Model

Let $F$ be a Failure Case in project $P$ associated with test case $T$ at version $V_T$, execution record $E_1$, and evidence set $\mathcal{E}$.

The authoritative failure domain space $\mathcal{D}$ is defined as:
$$\mathcal{D} = \{ \text{APP\_DEFECT}, \text{AUTOMATION}, \text{TEST\_DATA}, \text{ENVIRONMENT}, \text{BLOCKED}, \text{INCONCLUSIVE}, \text{UNKNOWN} \}$$

### 2.2 Exclusion-First Theory

Let $\mathcal{S}_{\text{auto}}, \mathcal{S}_{\text{env}}, \mathcal{S}_{\text{data}}, \mathcal{S}_{\text{req}}, \mathcal{S}_{\text{app}}$ denote the sets of extracted diagnostic signals for each layer:

1. **Blocked Check**:
   $$\text{if } \mathcal{I}_{\text{state}} = \text{BLOCKED} \implies \text{Domain}(F) = \text{BLOCKED}$$
2. **Zero Evidence Check**:
   $$\text{if } |\mathcal{E}| = 0 \land \text{Telemetry}(F) = \emptyset \implies \text{Domain}(F) = \text{UNKNOWN}$$
3. **External Layer Precedence**:
   - If $|\mathcal{S}_{\text{auto}}| > 0 \land |\mathcal{S}_{\text{app}}| = 0 \implies \text{AUTOMATION\_FAILURE}$
   - If $|\mathcal{S}_{\text{env}}| > 0 \land |\mathcal{S}_{\text{app}}| = 0 \implies \text{ENVIRONMENT\_FAILURE}$
   - If $|\mathcal{S}_{\text{data}}| > 0 \land |\mathcal{S}_{\text{app}}| = 0 \implies \text{TEST\_DATA\_FAILURE}$
4. **Conflicting Signals Check**:
   $$\text{if } (|\mathcal{S}_{\text{auto}}| > 0 \lor |\mathcal{S}_{\text{env}}| > 0 \lor |\mathcal{S}_{\text{data}}| > 0) \land |\mathcal{S}_{\text{app}}| > 0 \implies \text{INCONCLUSIVE}$$
   _(Except where browser crash or connection refused takes definitive precedence)._
5. **Exclusion-First Application Defect Candidate**:
   $$\text{Domain}(F) = \text{APPLICATION\_DEFECT\_CANDIDATE} \iff |\mathcal{S}_{\text{app}}| > 0 \land |\mathcal{S}_{\text{auto}}| = 0 \land |\mathcal{S}_{\text{env}}| = 0 \land |\mathcal{S}_{\text{data}}| = 0 \land |\mathcal{S}_{\text{req}}| = 0$$

All excluded domains $\mathcal{D} \setminus \{\text{Domain}(F)\}$ must be accompanied by an explicit, evidence-backed exclusion rationale.

---

## 3. Database Schema & Migration

Database migration `20260908133416_v6_phase80_failure_domain_separation` introduces the `FailureDomainSeparation` model and `FailureDomain` enum in PostgreSQL:

```prisma
enum FailureDomain {
  APPLICATION_DEFECT_CANDIDATE
  AUTOMATION_FAILURE
  TEST_DATA_FAILURE
  ENVIRONMENT_FAILURE
  BLOCKED
  INCONCLUSIVE
  UNKNOWN
}

model FailureDomainSeparation {
  id                      String                        @id @default(uuid())
  projectId               String
  failureCaseId           String
  failureAnalysisRunId    String?
  classificationId        String?
  decisionIntegrityId     String?
  flakinessAnalysisId     String?
  testCaseId              String
  testCaseVersionNumber   Int                           @default(1)

  domain                  FailureDomain
  domainSubreason         String?
  separationRulesVersion  String                        @default("1.0.0")
  primaryRationale        String
  decisionExplanation     String
  matchedRuleIds          Json                          @default("[]")
  excludedDomains         Json                          @default("[]")
  exclusionReasons        Json                          @default("{}")
  conflictingSignals      Json                          @default("[]")
  evidenceReferences      Json                          @default("[]")
  reproductionSummary     Json                          @default("{}")
  flakinessSummary        Json                          @default("{}")
  separationFingerprint   String

  isAuthoritative         Boolean                       @default(true)
  isStale                 Boolean                       @default(false)
  stalenessReason         String?

  reevaluationCount       Int                           @default(0)
  lastReevaluatedAt       DateTime?
  reevaluationReason      String?

  evaluatedAt             DateTime                      @default(now())
  createdAt               DateTime                      @default(now())
  updatedAt               DateTime                      @updatedAt

  project                 Project                       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase             FailureCase                   @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  testCase                TestCase                      @relation(fields: [testCaseId], references: [id], onDelete: Cascade)
  failureAnalysisRun      FailureAnalysisRun?           @relation(fields: [failureAnalysisRunId], references: [id], onDelete: SetNull)
  classification          FailureClassification?        @relation(fields: [classificationId], references: [id], onDelete: SetNull)
  decisionIntegrity       ClassificationDecisionIntegrity? @relation(fields: [decisionIntegrityId], references: [id], onDelete: SetNull)
  flakinessAnalysis       FlakinessAnalysis?            @relation(fields: [flakinessAnalysisId], references: [id], onDelete: SetNull)

  @@index([projectId, failureCaseId, isAuthoritative])
  @@index([failureCaseId, createdAt])
  @@index([separationFingerprint])
  @@map("failure_domain_separations")
}
```

---

## 4. Cryptographic Analysis Fingerprint & Secret Redaction

The canonical separation fingerprint is generated through a deterministic SHA-256 pipeline:

1. Extract core canonical facts: `failureCaseId`, `testCaseId`, `testCaseVersionNumber`, `domain`, `domainSubreason`, `separationRulesVersion`, `matchedRuleIds` (sorted), `excludedDomains` (sorted), `exclusionReasons` (sorted by key), and `evidenceReferences` (sorted).
2. Deep secret redaction via `FailureEvidenceRedactor`:
   - Bearer tokens: `Bearer sk-[a-zA-Z0-9_\-\.]{16,}` $\to$ `Bearer [REDACTED]`
   - Connection strings: `postgres://user:pass@host:5432/db` $\to$ `postgres://user:[REDACTED]@host:5432/db`
   - Passwords, access keys, private certificates.
3. Canonical deterministic JSON serialization (lexicographically ordered keys, no whitespace).
4. Compute SHA-256 digest returning a 64-character lowercase hex string.

---

## 5. Desktop Main IPC & Preload API

Exposed to Electron renderer via `window.desktop.failures`:

| Channel                                   | Method                          | Input DTO                             | Return DTO                                             |
| :---------------------------------------- | :------------------------------ | :------------------------------------ | :----------------------------------------------------- |
| `failures:separate-domain`                | `separateFailureDomain()`       | `SeparateFailureDomainInputDto`       | `DesktopResult<FailureDomainSeparationDto>`            |
| `failures:get-domain-separation`          | `getDomainSeparation()`         | `GetDomainSeparationInputDto`         | `DesktopResult<FailureDomainSeparationDto \| null>`    |
| `failures:reevaluate-domain-separation`   | `reevaluateDomainSeparation()`  | `ReevaluateDomainSeparationInputDto`  | `DesktopResult<FailureDomainSeparationDto>`            |
| `failures:list-domain-separation-history` | `listDomainSeparationHistory()` | `ListDomainSeparationHistoryInputDto` | `DesktopResult<readonly FailureDomainSeparationDto[]>` |

---

## 6. Renderer UI: Domain Separation Inspection Panel

Located at `apps/desktop/src/renderer/features/failures/DomainSeparationInspectionPanel.tsx`:

- **Authoritative Domain Badge**: Visual distinction using domain-specific icons and color styling.
- **Why This Domain**: Formatted explanation with bulleted evidence points.
- **Excluded Alternative Domains Matrix**: Clear table detailing every excluded layer, why it was excluded, and what evidence would be required to falsify that exclusion.
- **Conflicting Signals Alert**: Highlighted warning banner whenever conflicting telemetry is present.
- **Real-Time Staleness Warning**: Automatically alerts the operator if new test executions or reproduction attempts have been ingested since the last separation.
- **Operator Re-Evaluation Modal**: Requires an explicit justification before triggering a re-analysis.
- **Audit History Drawer**: Complete historical list of all evaluations for compliance.
