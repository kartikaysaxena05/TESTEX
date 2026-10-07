# V6 Phase 86: Confidence Scoring, Explainability & Evidence Attribution

## 1. Overview & Objectives

Phase 86 implements the **Confidence Scoring, Explainability & Evidence Attribution** subsystem within the V6 Failure Intelligence domain of the AI-Driven Software Quality Engineering Platform. It serves as the definitive analytical arbiter, synthesizing diagnostic facts, telemetry, deterministic classifications, and AI inferences across all preceding pipeline stages:

- **Phase 74**: Failure case lifecycle, execution links, and triggering error state
- **Phase 75**: Evidence artifacts (screenshots, console logs, network requests, DOM snapshots, traces) with SHA-256 integrity verification
- **Phase 76**: Controlled reproduction outcomes (`REPRODUCED`, `NOT_REPRODUCED`, environment equivalence, divergence)
- **Phases 77–78**: Deterministic rule classification and decision integrity arbitration
- **Phase 79**: Flakiness analysis, stability state, and reproducibility ratio
- **Phase 80**: Failure domain separation (`APPLICATION_DEFECT_CANDIDATE`, `AUTOMATION_FAILURE`, `TEST_DATA_FAILURE`, `ENVIRONMENT_FAILURE`)
- **Phase 81**: Technical cause localization (source file path, AST symbol, HTTP endpoint, status code)
- **Phase 82**: AI-assisted failure classification reasoning and calibrated model confidence
- **Phase 83**: Root-cause analysis (probable layer, component, verified repository references)
- **Phase 84**: Defect severity, resolution priority, and multi-dimensional impact assessment
- **Phase 85**: Duplicate failure detection, cluster membership, and representative failure tracking

The primary objective of Phase 86 is to provide **statistically grounded, fully auditable confidence scoring** paired with **deterministic, human-readable explanations** where every conclusion is rigorously linked to verified project-owned evidence artifacts through explicit **Evidence Attributions**.

---

## 2. Core Architectural Principles & Invariants

### 2.1 Multi-Domain Confidence Scoring

Confidence is evaluated independently across six distinct operational domains:

1. **Overall Confidence** (`overallConfidence`): Synthesized composite metric representing total diagnostic certainty.
2. **Classification Confidence** (`classificationConfidence`): Certainty in failure categorization and defect domain separation.
3. **Reproducibility Confidence** (`reproducibilityConfidence`): Certainty in deterministic repeatability under controlled execution (`null` when unattempted).
4. **Root-Cause Confidence** (`rootCauseConfidence`): Certainty in code localization, layer, and repository reference grounding (`null` when unanalyzed).
5. **Severity Confidence** (`severityConfidence`): Certainty in defect severity and user impact assessment.
6. **Duplicate Confidence** (`duplicateConfidence`): Certainty in cluster assignment and duplicate relationship (`null` when unclustered).

### 2.2 Semantic Confidence Bands

All confidence scores are mapped to standardized semantic bands:

- `VERY_LOW`: [0.00, 0.19] — Insufficient evidence, major telemetry gaps, or critical contradictions.
- `LOW`: [0.20, 0.39] — Weak evidence, unconfirmed reproduction, or partial artifact integrity.
- `MEDIUM`: [0.40, 0.59] — Adequate evidence, plausible classification, but lacking full corroboration.
- `HIGH`: [0.60, 0.79] — Strong evidence, verified artifacts, consistent classification, and grounded cause.
- `VERY_HIGH`: [0.80, 1.00] — Decisive evidence, confirmed deterministic reproduction, and verified repo linkage.

**Important Boundary Invariant**:

- A confidence score of `0.0` is a calculated mathematical value (e.g. tampered artifacts or severe contradictions).
- An unperformed evaluation is semantically `UNKNOWN` or `NOT_APPLICABLE` (represented as `null`), never coerced to `0.0`.

### 2.3 Component-Based Scoring Hierarchy

Scores are computed through deterministic weighted components:

- **Evidence Integrity** (weight = 0.20): Ratio of verified evidence artifacts with valid SHA-256 digests. Any tampered artifact resets integrity to 0.0.
- **Evidence Completeness** (weight = 0.15): Presence of core telemetry types (screenshot, DOM snapshot, console log, network trace).
- **Reproduction Strength** (weight = 0.20): Ratio of successful reproductions in controlled runs, penalized if flakiness is detected.
- **Classification Consistency** (weight = 0.20): Concordance between deterministic classifier rules and AI inferences.
- **Root-Cause Evidence Support** (weight = 0.15): Grounding of identified files and symbols in verified repository index files.
- **Domain Separation Strength** (weight = 0.10): Definitiveness of separation into defect vs automation/environment.

### 2.4 Epistemic Classification

Every conclusion and evidence attribution is labeled with an explicit epistemic type:

- `FACT`: Directly observed immutable telemetry (e.g. HTTP 500 status code, verified screenshot, DOM snapshot).
- `DETERMINISTIC_INFERENCE`: Rigorous conclusion deduced by algorithmic rules engines (e.g. Phase 77 rule matches, Phase 80 domain separation).
- `AI_INFERENCE`: Probabilistic conclusion generated by LLM reasoning (e.g. Phase 82 classification rationale, Phase 83 root cause).
- `CONTRADICTORY`: Conflicting evidence or divergent conclusions between subsystems.
- `UNKNOWN`: Missing, inconclusive, or unattempted telemetry.

> **Crucial Invariant**: AI inference is **never** presented as fact. AI confidence is calibrated and discounted when lacking factual evidence backing.

### 2.5 Double-Count Protection (Canonical Evidence Keys)

To prevent multiple derivative records from unfairly inflating confidence scores, all evidence references and diagnostic facts are normalized into **Canonical Evidence Keys**:

- `artifact:${artifactType}:${sha256.slice(0, 16)}`
- `repro:${outcome}:${failureSignature}`
- `classification:${category}`
- `code_loc:${filePath}:${symbolName}`
- `cluster:${clusterId}:${memberCount}`

During evidence attribution, deduplication by `(conclusionType, canonicalEvidenceKey)` guarantees that repeating logs or derivative events are counted at most once.

### 2.6 Human-Readable Explanation with Claim-to-Evidence Validation

Explanations are generated deterministically in structured markdown, comprising:

1. **Executive Summary**: Overview of failure, assigned confidence band, and key score.
2. **Domain Confidence Assessment**: Breakdown across all 6 analytical domains.
3. **Component Breakdown**: Mathematical contributions and weights of scoring factors.
4. **Evidence Attribution Matrix**: Table mapping conclusions to evidence citations with epistemic classification.
5. **AI Calibration & Grounding Notice**: Explicit declaration of discounts applied to model self-confidence.
6. **Contradictions & Diagnostic Gaps**: Actionable items requiring human triage or re-execution.

Every claim made in the explanation references a verified canonical evidence key.

---

## 3. Database Schema

Phase 86 introduces two core relational models to PostgreSQL:

```prisma
model ConfidenceAssessment {
  id                         String           @id @default(uuid()) @db.Uuid
  projectId                  String           @map("project_id") @db.Uuid
  failureCaseId              String           @map("failure_case_id") @db.Uuid
  failureAnalysisRunId       String?          @map("failure_analysis_run_id") @db.Uuid
  revision                   Int              @default(1)
  isAuthoritative            Boolean          @default(true) @map("is_authoritative")
  supersedesId               String?          @map("supersedes_id") @db.Uuid
  supersededById             String?          @map("superseded_by_id") @db.Uuid
  overallConfidence          Float            @map("overall_confidence")
  confidenceBand             ConfidenceBand   @map("confidence_band")
  classificationConfidence   Float?           @map("classification_confidence")
  reproducibilityConfidence  Float?           @map("reproducibility_confidence")
  rootCauseConfidence        Float?           @map("root_cause_confidence")
  severityConfidence         Float?           @map("severity_confidence")
  duplicateConfidence        Float?           @map("duplicate_confidence")
  componentBreakdownJson     Json             @default("[]") @map("component_breakdown_json")
  supportingFactors          Json             @default("[]") @map("supporting_factors")
  penalties                  Json             @default("[]") @map("penalties")
  missingFactors             Json             @default("[]") @map("missing_factors")
  contradictions             Json             @default("[]") @map("contradictions")
  deterministicFacts         Json             @default("[]") @map("deterministic_facts")
  aiInferences               Json             @default("[]") @map("ai_inferences")
  humanExplanation           String           @map("human_explanation") @db.Text
  confidenceFingerprint      String           @map("confidence_fingerprint") @db.VarChar(64)
  confidenceEngineVersion    String           @default("1.0.0") @map("confidence_engine_version") @db.VarChar(32)
  scoringPolicyVersion       String           @default("1.0.0") @map("scoring_policy_version") @db.VarChar(32)
  explanationVersion         String           @default("1.0.0") @map("explanation_version") @db.VarChar(32)
  isStale                    Boolean          @default(false) @map("is_stale")
  stalenessReason            String?          @map("staleness_reason") @db.Text
  recalculationReason        String?          @map("recalculation_reason") @db.Text
  assessedAt                 DateTime         @default(now()) @map("assessed_at") @db.Timestamptz(6)
  createdAt                  DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                  DateTime         @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  project                    Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase                FailureCase      @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  failureAnalysisRun         FailureAnalysisRun? @relation(fields: [failureAnalysisRunId], references: [id], onDelete: SetNull)
  supersedes                 ConfidenceAssessment? @relation("ConfidenceAssessmentHierarchy", fields: [supersedesId], references: [id], onDelete: SetNull)
  supersededBy               ConfidenceAssessment[] @relation("ConfidenceAssessmentHierarchy")
  attributions               EvidenceAttribution[]

  @@unique([failureCaseId, revision])
  @@index([projectId])
  @@index([failureCaseId])
  @@index([confidenceBand])
  @@index([isAuthoritative])
  @@index([assessedAt])
  @@map("confidence_assessments")
}

model EvidenceAttribution {
  id                     String                     @id @default(uuid()) @db.Uuid
  confidenceAssessmentId String                     @map("confidence_assessment_id") @db.Uuid
  projectId              String                     @map("project_id") @db.Uuid
  failureCaseId          String                     @map("failure_case_id") @db.Uuid
  conclusionType         ConclusionType             @map("conclusion_type")
  conclusionValue        String                     @map("conclusion_value") @db.VarChar(255)
  evidenceReferenceId    String?                    @map("evidence_reference_id") @db.Uuid
  evidenceType           String                     @map("evidence_type") @db.VarChar(64)
  relationship           AttributionRelationship    @map("relationship")
  supportStrength        AttributionSupportStrength @map("support_strength")
  sourceSubsystem        SourceSubsystem            @map("source_subsystem")
  reason                 String                     @map("reason") @db.Text
  epistemicType          EpistemicType              @map("epistemic_type")
  canonicalEvidenceKey   String                     @map("canonical_evidence_key") @db.VarChar(255)
  createdAt              DateTime                   @default(now()) @map("created_at") @db.Timestamptz(6)

  assessment             ConfidenceAssessment       @relation(fields: [confidenceAssessmentId], references: [id], onDelete: Cascade)
  project                Project                    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase            FailureCase                @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  evidenceReference      FailureEvidenceReference?  @relation(fields: [evidenceReferenceId], references: [id], onDelete: SetNull)

  @@index([confidenceAssessmentId])
  @@index([projectId])
  @@index([failureCaseId])
  @@index([conclusionType])
  @@index([canonicalEvidenceKey])
  @@map("evidence_attributions")
}
```

---

## 4. IPC Channels & Contracts

The subsystem exposes 5 IPC channels under strict frame origin validation:

| Channel                               | Input DTO                          | Output DTO                           | Description                                                                   |
| ------------------------------------- | ---------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| `FAILURES_ASSESS_CONFIDENCE`          | `AssessConfidenceInputDto`         | `ConfidenceAssessmentDto`            | Computes initial assessment or returns cached authoritative record            |
| `FAILURES_GET_CONFIDENCE`             | `GetConfidenceInputDto`            | `ConfidenceAssessmentDto \| null`    | Fetches authoritative assessment with dynamic staleness evaluation            |
| `FAILURES_REASSESS_CONFIDENCE`        | `ReassessConfidenceInputDto`       | `ConfidenceAssessmentDto`            | Forces recalculation, increments revision, and marks old record as superseded |
| `FAILURES_LIST_CONFIDENCE_HISTORY`    | `ListConfidenceHistoryInputDto`    | `readonly ConfidenceAssessmentDto[]` | Retrieves chronological history of all assessment revisions                   |
| `FAILURES_LIST_EVIDENCE_ATTRIBUTIONS` | `ListEvidenceAttributionsInputDto` | `readonly EvidenceAttributionDto[]`  | Retrieves evidence attributions for a given assessment                        |

---

## 5. Security & Concurrency Architecture

1. **Mutex Serialization per Failure Case**:
   - Sequential write locks ensure that concurrent reassessments for the same failure case execute sequentially without race conditions or dirty reads.
   - Mutex locks clean up automatically when released to prevent memory leaks.
2. **Strict Multi-Tenant Isolation**:
   - All operations require `projectId`.
   - Accessing a failure case belonging to a different project throws `ConfidenceAssessmentCrossProjectError`.
3. **Secret Redaction**:
   - All human explanations and evidence reasons are sanitized using `FailureEvidenceRedactor`.
   - API keys, authorization bearer tokens, passwords, database URLs, and session cookies are replaced with `[REDACTED]` before persistence and rendering.
4. **Append-Only Revision History**:
   - Historical assessments are strictly immutable.
   - New assessments increment `revision`, set `isAuthoritative = true`, and link to the previous record via `supersedesId` and `supersededById`.

---

## 6. Real Playwright Browser Certification

The subsystem is certified using a live Playwright Chromium browser pipeline that drives real DOM interactions and HTTP failure scenarios through three complete journeys:

1. **Journey 1: High Confidence Defect**:
   - Real browser executes simulated checkout with HTTP 500 error response.
   - Captures real PNG screenshot and console logs.
   - Confirms deterministic reproduction (`REPRODUCED`) and verified repository file localization.
   - Assessment verifies score >= 0.80 with `VERY_HIGH` or `HIGH` confidence band.
2. **Journey 2: Intermittent / Conflicted Failure**:
   - Simulates intermittent timeout failure with failed reproduction attempt (`NOT_REPRODUCED`) and confirmed flakiness.
   - Assessment applies flakiness and reproduction penalties, resulting in `MEDIUM` or `LOW` band with explicit contradictions recorded.
3. **Journey 3: Insufficient / Missing Evidence**:
   - Simulates crash without telemetry, missing logs, and unattempted reproduction.
   - Assessment identifies telemetry gaps and yields `LOW` or `VERY_LOW` band with zero ungrounded conclusions.
