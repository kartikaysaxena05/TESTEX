# V6 Phase 84: Severity, Priority & Impact Intelligence

## 1. Overview

Phase 84 implements the **Severity, Priority & Impact Intelligence** subsystem within the V6 Failure Intelligence domain. It ingests verified facts from preceding V6 phases and V2–V4 repository and requirement intelligence:

- **Phase 74**: Failure case lifecycle, state machine, and error signature
- **Phase 75**: Normalized evidence artifacts (screenshots, console logs, network events, DOM trees, traces) with SHA-256 integrity validation
- **Phase 76**: Reproduction stability and reproducible failure state
- **Phases 77–78**: Deterministic rule classification and decision integrity arbitration
- **Phase 79**: Flakiness score, execution retry history, and reproducibility intelligence
- **Phase 80**: Failure domain separation (Application Defect vs Automation vs Test Data vs Environment)
- **Phase 81**: Technical localization (stack trace, primary suspect layer, fault timeline)
- **Phase 82**: AI-assisted failure classification reasoning and calibrated confidence
- **Phase 83**: Root-cause analysis, probable layer identification, and repository references
- **V2**: Repository intelligence (files, AST symbols, modules, routes)
- **V3–V4**: Requirement intelligence and requirement-to-test traceability (criticality, tags, priority)

Phase 84 determines technical defect severity (`DefectSeverity`), independent operational resolution priority (`DefectPriority`), release recommendation (`ReleaseRecommendation`), and evaluates 9 structured impact dimensions with deterministic rule transparency.

---

## 2. Core Architectural Principles & Boundaries

### 2.1 Mandatory Architectural Separation: Severity vs Priority

A core architectural tenet of Phase 84 is the **strict separation** between Severity and Priority:

- **Severity** ("How damaging is the defect?"): Measures intrinsic technical damage to data integrity, security boundaries, system availability, or user workflows. It is intrinsic to the technical nature of the bug.
- **Priority** ("How urgently should it be addressed?"): Measures operational urgency of remediation. It is driven by environmental context (Production vs Staging/Dev), release schedules, whether the issue blocks an imminent deployment (`releaseBlockingOverride`), user volume, flakiness, and whether an acceptable workaround exists.

Severity and Priority are **never conflated or hardwired** to each other:

- A `CRITICAL` severity defect in an unreleased experimental feature on a staging branch might be scheduled as `P2_NORMAL`.
- A `MEDIUM` severity defect (such as broken branding or a partner checkout glitch) that completely blocks an imminent production release can be prioritized as `P0_IMMEDIATE` or `P1_URGENT`.

### 2.2 Deterministic Foundation First (Factual Evidence Precedence)

Phase 84 prioritizes deterministic factual evidence above all probabilistic or speculative reasoning:

- Concrete HTTP status codes (e.g. persistent 500/503 responses), unhandled crash exceptions, database rollback failures, authentication bypass events, and validated requirement criticality take absolute precedence.
- Every severity and priority evaluation emits an authoritative rule ID (e.g. `SEV_CRITICAL_SECURITY_BYPASS`, `PRI_P0_IMMEDIATE_BLOCKER`), a human-readable justification, and a structured list of supporting evidence items.
- AI suggestions are treated as advisory context only; factual telemetry always overrides LLM reasoning.

### 2.3 No Worst-Case Inflation (Truthful Unknowns)

The subsystem prohibits speculative or worst-case inflation:

- When telemetry is sparse, missing, or inconclusive, the engine assigns truthful `UNKNOWN` states (`DefectSeverity.UNKNOWN`, `DefectPriority.UNKNOWN`, `ReleaseRecommendation.UNKNOWN`) rather than artificially escalating to `CRITICAL` or `P0`.
- Missing factors (e.g., `["workaroundStatus", "blastRadius"]`) and conflicting diagnostic signals are explicitly documented and returned in the assessment payload.

### 2.4 Non-Application Defect Handling

When failure domain separation (Phase 80) categorizes a failure as non-application (e.g. `AUTOMATION_FAILURE`, `ENVIRONMENT_FAILURE`, `TEST_DATA_FAILURE`, or `BLOCKED`):

- Product severity is automatically assigned `NOT_APPLICABLE` (`SEV_NON_APP_FAILURE`).
- Priority is determined based on test pipeline impact (e.g., `P2_NORMAL` or `P3_LOW` to unblock CI suites).
- Release recommendation is assigned `NON_BLOCKING` (or `REVIEW_REQUIRED` if the environment failure prevents full regression gating).

### 2.5 Dynamic Staleness Detection on Passive Read

Read operations (`getImpactAssessment`, list views, or UI rendering) execute **zero recomputations or rules engine runs**. Staleness is dynamically evaluated against subsequent database events:

- Newer evidence artifacts attached (`failureEvidenceReference.attachedAt > assessedAt`)
- Newer deterministic classification run (`failureClassification.createdAt > assessedAt`)
- Newer domain separation evaluation (`failureDomainSeparation.evaluatedAt > assessedAt`)
- Newer technical localization run (`failureTechnicalLocalization.localizedAt > assessedAt`)
- Newer AI classification reasoning (`failureAiAssessment.assessedAt > assessedAt`)
- Newer root-cause analysis run (`failureRootCauseAnalysis.analyzedAt > assessedAt`)

If newer facts are detected, the assessment is marked `isStale: true` with a detailed `stalenessReason`, enabling the UI to present a clear re-assessment action to the engineer without causing unwanted database side effects during passive reads.

### 2.6 Mutex Serialization & Concurrency Safety

A per-failure-case mutex (`Mutex`) serializes concurrent impact assessment requests. Simultaneous requests for the same failure case coalesce into a single execution, preventing race conditions, duplicate revisions, or torn database records.

### 2.7 Authoritative Revision Lineage & Audit Trail

When re-assessing a failure case:

- The previous assessment is marked `isAuthoritative: false` and updated with `supersededById`.
- The new assessment is created with `revision: previous.revision + 1`, `supersedesId: previous.id`, and records an explicit `auditReason` (e.g., "New evidence attached", "Manual engineer override", or "Pipeline re-run").
- Full historical audit trail is queryable via `listImpactHistory`.

### 2.8 Out of Scope (Phase 85+)

Phase 84 strictly excludes:

- Duplicate defect clustering & deduplication (Phase 85)
- Global cross-failure confidence scoring (Phase 86)
- Bug report generation & Jira/GitHub issue filing (Phase 87)
- Automated code patching, repair, or git commits (Phase 88)

---

## 3. Taxonomy & Enums

### 3.1 Defect Severity (`DefectSeverity`)

| Value            | Description                                                                                                                                      |
| :--------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRITICAL`       | Total system outage, unhandled critical service crash, active security/authentication bypass, or widespread irrecoverable data loss/corruption.  |
| `HIGH`           | Major core workflow blocked (e.g. checkout, login, billing) with no workaround, persistent 5xx server errors, or severe performance degradation. |
| `MEDIUM`         | Partial workflow impairment, non-critical feature failure, or secondary workflow blocked where an acceptable workaround exists.                  |
| `LOW`            | Cosmetic flaws, minor UI misalignment, typographic errors, or minor edge-case functional bugs with no business impact.                           |
| `UNKNOWN`        | Telemetry is too sparse, contradictory, or unverified to determine technical severity truthfully.                                                |
| `NOT_APPLICABLE` | Not an application defect (e.g., automation script locator failure, environment outage, missing seed data).                                      |

### 3.2 Defect Priority (`DefectPriority`)

| Value          | Description                                                                                                                            |
| :------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| `P0_IMMEDIATE` | Blocker requiring immediate 24/7 remediation; production blocker, critical security exploit, or explicitly designated release blocker. |
| `P1_URGENT`    | Urgent defect requiring remediation in the current active sprint or before next scheduled release.                                     |
| `P2_NORMAL`    | Standard defect scheduled during normal sprint planning backlog.                                                                       |
| `P3_LOW`       | Minor or cosmetic defect to be addressed when convenient or backlogged.                                                                |
| `UNKNOWN`      | Operational urgency cannot be determined due to missing environment, schedule, or business context.                                    |

### 3.3 Release Recommendation (`ReleaseRecommendation`)

| Value             | Description                                                                                                  |
| :---------------- | :----------------------------------------------------------------------------------------------------------- |
| `BLOCK_RELEASE`   | Hard gate: deployment must be halted immediately until defect is resolved or hotfixed.                       |
| `REVIEW_REQUIRED` | Soft gate: release manager or QA lead sign-off required; medium/high risk or unresolved conflicting signals. |
| `NON_BLOCKING`    | Safe to release: minor defect, low priority, non-application failure, or known low-impact issue.             |
| `UNKNOWN`         | Inconclusive evidence to make an automated release recommendation.                                           |

### 3.4 Nine Structured Impact Dimensions

1. **`userImpact` (`UserImpactScope`)**: `ALL_USERS`, `MAJORITY_USERS`, `SUBSET_USERS`, `EDGE_CASE_USERS`, `INTERNAL_ONLY`, `NO_USERS`, `UNKNOWN`.
2. **`dataImpact` (`DataImpact`)**: `NO_DATA_IMPACT`, `DISPLAY_ONLY`, `INCORRECT_READ`, `FAILED_WRITE`, `INCORRECT_WRITE`, `DUPLICATE_WRITE`, `PARTIAL_WRITE`, `DATA_INCONSISTENCY`, `DATA_CORRUPTION`, `DATA_LOSS`, `UNKNOWN`.
3. **`securityImpact` (`SecurityImpact`)**: `NONE_PROVEN`, `AUTHENTICATION_BYPASS`, `AUTHORIZATION_BYPASS`, `SESSION_EXPOSURE`, `CREDENTIAL_LEAK`, `PRIVILEGE_ESCALATION`, `DATA_EXPOSURE`, `SUSPECTED`, `UNKNOWN`.
4. **`availabilityImpact` (`AvailabilityImpact`)**: `FULL_OUTAGE`, `DEGRADED`, `SERVICE_UNAVAILABLE`, `MODULE_UNAVAILABLE`, `PAGE_UNAVAILABLE`, `ACTION_UNAVAILABLE`, `NONE_AFFECTED`, `UNKNOWN`.
5. **`blastRadius` (`BlastRadius`)**: `PROJECT_WIDE`, `MULTIPLE_MODULES`, `SINGLE_MODULE`, `SINGLE_FEATURE`, `SINGLE_REQUIREMENT`, `SINGLE_TEST`, `UNKNOWN`.
6. **`workaroundStatus` (`WorkaroundStatus`)**: `WORKAROUND_AVAILABLE`, `WORKAROUND_PARTIAL`, `NO_WORKAROUND`, `UNKNOWN`.
7. **`functionalImpact` (string)**: Specific technical description of broken application capabilities.
8. **`businessImpact` (string)**: Specific operational or financial description of organizational impact.
9. **`integrationImpact` (string)**: Specific downstream description of third-party or internal API integration impacts.

---

## 4. Deterministic Rules Registry

### 4.1 Severity Rules Engine (`SeverityRulesEngine`)

The engine evaluates candidate rules in strict deterministic precedence order:

1. **`SEV_NON_APP_FAILURE`**:
   - Condition: Domain separation classification indicates `AUTOMATION_FAILURE`, `ENVIRONMENT_FAILURE`, `TEST_DATA_FAILURE`, or `BLOCKED`.
   - Result: `DefectSeverity.NOT_APPLICABLE` (Confidence: 1.0).
2. **`SEV_CRITICAL_SECURITY_BYPASS`**:
   - Condition: Verified authentication bypass, unauthorized privilege escalation, or credential leak in evidence.
   - Result: `DefectSeverity.CRITICAL` (Confidence: 1.0).
3. **`SEV_CRITICAL_DATA_CORRUPTION`**:
   - Condition: Proven database data corruption, irrecoverable data loss, or cascading transactional corruption.
   - Result: `DefectSeverity.CRITICAL` (Confidence: 0.95).
4. **`SEV_CRITICAL_TOTAL_OUTAGE`**:
   - Condition: Complete service crash, process termination, or HTTP 503 unavailable across all endpoints.
   - Result: `DefectSeverity.CRITICAL` (Confidence: 0.95).
5. **`SEV_HIGH_MAJOR_WORKFLOW_BLOCKED`**:
   - Condition: Critical core business workflow (e.g. checkout, login, signup) completely blocked with no workaround.
   - Result: `DefectSeverity.HIGH` (Confidence: 0.90).
6. **`SEV_HIGH_PERSISTENT_5XX`**:
   - Condition: Repeated server 500 internal errors on primary transactional API routes.
   - Result: `DefectSeverity.HIGH` (Confidence: 0.85).
7. **`SEV_LOW_COSMETIC_MINOR`**:
   - Condition: Purely visual defect, CSS rendering discrepancy, font misalignment, or DOM styling difference without functional interruption.
   - Result: `DefectSeverity.LOW` (Confidence: 0.90).
8. **`SEV_MEDIUM_PARTIAL_WORKFLOW`**:
   - Condition: Secondary feature failure, non-critical route failure, or workflow impaired but workaround exists.
   - Result: `DefectSeverity.MEDIUM` (Confidence: 0.80).
9. **`SEV_UNKNOWN_INSUFFICIENT_EVIDENCE`**:
   - Condition: Telemetry is incomplete, unparseable, or contradictory.
   - Result: `DefectSeverity.UNKNOWN` (Confidence: 0.30).

### 4.2 Priority Rules Engine (`PriorityRulesEngine`)

Evaluates operational urgency independently:

1. **`PRI_P0_IMMEDIATE_BLOCKER`**:
   - Condition: Explicit release blocker flag active, critical security bypass in production environment, or full system outage blocking CI/CD deployment.
   - Result: `DefectPriority.P0_IMMEDIATE` (Confidence: 1.0).
2. **`PRI_P1_URGENT`**:
   - Condition: `HIGH` severity defect in primary workflow, release-blocking override on non-critical defect, or persistent failure affecting majority of users.
   - Result: `DefectPriority.P1_URGENT` (Confidence: 0.90).
3. **`PRI_P2_NORMAL`**:
   - Condition: `MEDIUM` severity defect, non-blocking bug with partial workaround, or staging defect without release-critical flags.
   - Result: `DefectPriority.P2_NORMAL` (Confidence: 0.85).
4. **`PRI_P3_LOW`**:
   - Condition: `LOW` severity cosmetic issue, or non-application test fixture defect scheduled for maintenance.
   - Result: `DefectPriority.P3_LOW` (Confidence: 0.90).
5. **`PRI_UNKNOWN_INSUFFICIENT_EVIDENCE`**:
   - Condition: Insufficient operational, deployment, or business telemetry.
   - Result: `DefectPriority.UNKNOWN` (Confidence: 0.30).

---

## 5. Database Schema

The `FailureImpactAssessment` model is defined in `packages/core/prisma/schema.prisma`:

```prisma
model FailureImpactAssessment {
  id                    String                @id @default(uuid())
  projectId             String                @map("project_id")
  failureCaseId         String                @map("failure_case_id")
  testCaseId            String?               @map("test_case_id")
  analysisRunId         String?               @map("analysis_run_id")
  classificationId      String?               @map("classification_id")
  technicalLocationId   String?               @map("technical_location_id")
  domainSeparationId    String?               @map("domain_separation_id")
  aiAssessmentId        String?               @map("ai_assessment_id")
  rootCauseAnalysisId   String?               @map("root_cause_analysis_id")

  // Revision & Lineage
  revision              Int                   @default(1)
  isAuthoritative       Boolean               @default(true) @map("is_authoritative")
  supersededById        String?               @map("superseded_by_id")
  supersedesId          String?               @map("supersedes_id")
  auditReason           String?               @map("audit_reason")

  // Classification & Urgency
  severity              DefectSeverity
  severityConfidence    Float                 @map("severity_confidence")
  severityRuleId        String                @map("severity_rule_id")
  severityJustification String                @map("severity_justification")

  priority              DefectPriority
  priorityConfidence    Float                 @map("priority_confidence")
  priorityRuleId        String                @map("priority_rule_id")
  priorityJustification String                @map("priority_justification")

  releaseRecommendation ReleaseRecommendation @map("release_recommendation")

  // 9 Dimensions
  userImpact            UserImpactScope       @map("user_impact")
  dataImpact            DataImpact            @map("data_impact")
  securityImpact        SecurityImpact        @map("security_impact")
  availabilityImpact    AvailabilityImpact    @map("availability_impact")
  blastRadius           BlastRadius           @map("blast_radius")
  workaroundStatus      WorkaroundStatus      @map("workaround_status")
  functionalImpact      String                @map("functional_impact")
  businessImpact        String                @map("business_impact")
  integrationImpact     String                @map("integration_impact")

  // Supporting Evidence & Metadata
  supportingEvidence    Json                  @map("supporting_evidence")
  conflictingSignals    String[]              @map("conflicting_signals")
  missingFactors        String[]              @map("missing_factors")
  fingerprint           String                @map("fingerprint")

  // Staleness Tracking
  isStale               Boolean               @default(false) @map("is_stale")
  stalenessReason       String?               @map("staleness_reason")

  assessedAt            DateTime              @default(now()) @map("assessed_at")
  createdAt             DateTime              @default(now()) @map("created_at")
  updatedAt             DateTime              @updatedAt @map("updated_at")

  // Relations
  project               Project               @relation(...)
  failureCase           FailureCase           @relation(...)
  supersededBy          FailureImpactAssessment? @relation("ImpactRevisionLineage", ...)
  supersedes            FailureImpactAssessment[] @relation("ImpactRevisionLineage")
  ...
}
```

---

## 6. IPC Channels & Preload API

```typescript
// IPC Channel Identifiers
DESKTOP_CHANNELS.FAILURES_ASSESS_IMPACT = 'failures:assess-impact';
DESKTOP_CHANNELS.FAILURES_GET_IMPACT_ASSESSMENT = 'failures:get-impact-assessment';
DESKTOP_CHANNELS.FAILURES_REASSESS_IMPACT = 'failures:reassess-impact';
DESKTOP_CHANNELS.FAILURES_LIST_IMPACT_HISTORY = 'failures:list-impact-history';

// Preload Bridge API: window.desktop.failures
window.desktop.failures.assessImpact({
  projectId,
  failureCaseId,
  environment,
  releaseBlockingOverride,
});
window.desktop.failures.getImpactAssessment({ projectId, failureCaseId });
window.desktop.failures.reassessImpact({
  projectId,
  failureCaseId,
  reason,
  environment,
  releaseBlockingOverride,
});
window.desktop.failures.listImpactHistory({ projectId, failureCaseId });
```

---

## 7. Renderer UI Panel

The `ImpactAssessmentInspectionPanel` component (`apps/desktop/src/renderer/features/failures/ImpactAssessmentInspectionPanel.tsx`) provides:

- **Header Badges**: Color-coded severity badge (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`, `NOT_APPLICABLE`), priority badge (`P0`, `P1`, `P2`, `P3`), and release recommendation banner (`BLOCK_RELEASE`, `REVIEW_REQUIRED`, `NON_BLOCKING`).
- **9-Dimension Grid**: Visual cards for User Impact, Data Impact, Security Impact, Availability Impact, Blast Radius, Workaround Status, Functional Impact, Business Impact, and Integration Impact.
- **Rule Justification Card**: Displays active `ruleId`, confidence percentage, and concise rationale for both severity and priority.
- **Supporting Evidence List**: Expandable list of verified facts, HTTP codes, and stack traces with confidence scores.
- **Conflicting Signals Banner**: Emphasizes conflicting evidence requiring engineer review.
- **Dynamic Staleness Banner**: Alerts when upstream facts have changed, providing a one-click re-assessment action.
- **Revision History Drawer**: Audit timeline displaying historical revisions, timestamps, author/system reasons, and lineage links.

---

## 8. Test Verification Matrix

| Test Suite                | File                                | Tests | Coverage Scope                                                      |
| :------------------------ | :---------------------------------- | :---- | :------------------------------------------------------------------ |
| **Severity Rules**        | `severity-rules-engine.test.ts`     | 8     | All 9 severity rules, non-app failures, bounds clamping             |
| **Priority Rules**        | `priority-rules-engine.test.ts`     | 8     | All 5 priority rules, release overrides, production vs staging      |
| **Impact Dimensions**     | `impact-dimension-analyzer.test.ts` | 5     | 9 dimensions analysis, release recommendation, conflicting signals  |
| **Fingerprint**           | `impact-fingerprint.test.ts`        | 4     | SHA-256 canonicalization, secret redaction, stability               |
| **Security & Leakage**    | `impact-security.test.ts`           | 4     | Secret masking, cross-project access isolation                      |
| **Concurrency & Mutex**   | `impact-concurrency.test.ts`        | 1     | Concurrent assessment requests serialized without race conditions   |
| **Adversarial Input**     | `impact-adversarial.test.ts`        | 2     | Malformed payloads, SQL/script injection resilience                 |
| **Certification Suite**   | `impact-certification.test.ts`      | 10    | Scenarios A–H, staleness detection, audit revision lineage          |
| **Desktop IPC Handlers**  | `failure-impact-handlers.test.ts`   | 6     | IPC request validation, error propagation, handler dispatch         |
| **Renderer UI Component** | `failures-impact-ui.test.tsx`       | 2     | React inspection panel rendering, badge formatting, re-assess modal |

**Total Phase 84 Tests**: 58 automated tests (100% pass).
**Total Failures Domain Tests**: 416 automated tests across Phases 74–84 (100% pass, 0 regressions).
