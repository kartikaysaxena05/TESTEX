# V4 Phase 51 — Preconditions, Test Data & Expected Result Generation

## Architectural Overview

V4 Phase 51 elevates the scenario generation pipeline (Phases 49–50) into **grounded, executable Test Specifications** by systematically enriching candidate scenarios with:

1. **Preconditions**: Explicit, categorized system state requirements that must hold before test execution (distinguished strictly from test action steps).
2. **Test Data Requirements**: Structured inputs with explicit data origins (`EXPLICIT`, `DERIVED`, `EXAMPLE`, `GENERATED`, `UNKNOWN`), synthetic declarative generator expressions (`RANDOM_VALID_EMAIL`, `SYNTHETIC_VISA_CARD`, etc.), and sensitive placeholder indicators.
3. **Observable Expected Results**: Precise expected state changes (`from -> to` entity transitions), state invariants / non-occurrences, returned values, and un-invented error messages.
4. **Unknowns & Review Gates**: Rigorous enforcement of the core invariant **UNKNOWN > INVENTED**. When thresholds, status codes, or exact messages are unspecified in context, they are preserved as `UNKNOWN` with `value = null` and flagged for human review.

---

## Key Subsystems & Artifacts

### 1. Contracts & Schemas (`packages/contracts`)

- **Precondition Categories**: `AUTHENTICATION`, `AUTHORIZATION`, `APPLICATION_STATE`, `DATA_STATE`, `ACCOUNT_STATE`, `RESOURCE_STATE`, `CONFIGURATION`, `FEATURE_FLAG`, `ENVIRONMENT`, `DEPENDENCY`, `SESSION_STATE`, `WORKFLOW_STATE`, `NONE`, `OTHER`.
- **Test Data Data Types**: `STRING`, `NUMBER`, `BOOLEAN`, `DATE`, `DATETIME`, `ENUM`, `ENTITY`, `CREDENTIAL`, `FILE`, `OTHER`.
- **Test Data Origins**: `EXPLICIT`, `DERIVED`, `EXAMPLE`, `GENERATED`, `UNKNOWN`.
- **Expected Result Categories**: `SUCCESS`, `VALIDATION_ERROR`, `AUTHORIZATION_DENIED`, `AUTHENTICATION_REQUIRED`, `STATE_CHANGE`, `NO_STATE_CHANGE`, `VALUE_RETURNED`, `ENTITY_CREATED`, `ENTITY_UPDATED`, `ENTITY_DELETED`, `NAVIGATION`, `MESSAGE_DISPLAYED`, `REQUEST_REJECTED`, `BOUNDARY_ACCEPTED`, `BOUNDARY_REJECTED`, `OTHER`, `UNKNOWN`.
- **DTOs & Zod Schemas**: `GeneratedPreconditionDto`, `GeneratedTestDataItemDto`, `GeneratedExpectedResultDto`, `GeneratedTestSpecificationDto`, `TestSpecificationEnrichmentMetricsDto`, `TestSpecificationEnrichmentResultDto`, `EnrichTestSpecificationInputDto`, `GetEnrichedTestSpecificationsInputDto`.

### 2. Core Service & Engine (`packages/core/src/ai/specifications/`)

- **`TestSpecificationEnrichmentService`**:
  - Enforces project boundary and active version snapshot resolution.
  - Retrieves bounded RAG context (Tier 1–3) without prompt injection vulnerability.
  - Computes deterministic input fingerprint: `SHA-256([requirement.id, versionNumber, statement, type, candidateIds, contextIds])`.
  - In-memory cache for fast idempotent access.
  - Detects `NOT_TESTABLE` requirements and returns honest review-required results without LLM calls.
  - Concurrency conflict detection against background requirement edits.
- **`TestSpecificationValidator`**:
  - Validates model output against strict bounds (`MAX_SPECS_PER_REQUIREMENT = 12`, `MAX_PRECONDITIONS = 15`, etc.).
  - Strips ungrounded evidence references, falling back to authoritative requirement key.
  - Enforces `UNKNOWN -> value = null` and `reviewRequired = true`.
  - Marks sensitive data placeholders (`isSensitive = true`).
  - Deduplicates identical preconditions and test data items.
- **`PromptDefinition`**:
  - Registered prompt ID `'requirement.test-specification-enrichment'` (version 1).
  - Explicit XML boundary encapsulation (`<authoritative_requirement>`, `<candidate_scenarios>`, `<categorized_test_designs>`, `<retrieved_context>`).

### 3. IPC & Desktop Bridge (`apps/desktop`)

- Channels: `test-specifications:enrich`, `test-specifications:get-current`.
- Handlers: Zod validation, error mapping, and multi-tenant isolation.
- Preload Bridge: `window.desktop.testSpecifications.enrich(...)` and `getCurrent(...)`.

### 4. UI Component (`apps/desktop/src/renderer/features/requirements/RequirementTestSpecificationsView.tsx`)

- Metrics summary cards (Total Specifications, Preconditions, Test Data Items, Expected Results, Review Required, Explicit Unknowns).
- Expandable specification cards with category badges (Positive, Negative, Boundary, Validation).
- Categorized Preconditions view with confidence badges and evidence citations.
- Rich Test Data Table with data type, origin badges, generator expressions, constraints, and sensitive data badges.
- Observable Expected Results with entity state transition visualization (`from -> to`) and invariant non-change tags.
- Explicit Unknowns banner with review requirements.

---

## Anti-Hallucination Invariants

| Dimension                 | Invariant Rule      | Implementation                                                                  |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| **Unspecified Constants** | UNKNOWN > INVENTED  | Marked as `origin: "UNKNOWN"`, `value: null`, `reviewRequired: true`.           |
| **Error Messages**        | No Invented Strings | Preserves `exactMessageExpected = null` unless explicitly confirmed in context. |
| **HTTP Status Codes**     | No Invented Codes   | Preserves `httpStatusExpected = null` unless explicitly grounded.               |
| **Preconditions**         | State vs Action     | Preconditions strictly specify prior state, never test execution steps.         |
| **Sensitive Data**        | Synthetic Only      | Flagged as `isSensitive: true` with synthetic generator syntax.                 |
| **Evidence Grounding**    | Valid IDs Only      | Ungrounded references are stripped and flagged with warning.                    |

---

## Verification & Test Results

- **Unit & Integration AI Suite**: 53 test suites, 288/288 tests passed.
- **Full Platform Suite**: 272 test suites, 1,006/1,006 tests passed.
- **Desktop Bundle & Smoke**: 0 errors, clean electron smoke initialization.
