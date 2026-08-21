# V4 Phase 52 — Structured Test Case Model & Persistence

## Overview

Phase 52 establishes the canonical, durable, relational **Test Case Domain** in the AI-Driven Software Quality Engineering Platform. It transitions transient LLM test generation outputs into first-class product entities stored in PostgreSQL with strict relational models, atomic transactional guarantees, multi-tenant isolation, sequential concurrency-safe key allocation (`TC-001`), and comprehensive desktop IPC and UI integration.

---

## Architecture & Relational Data Model

Rather than storing LLM responses as opaque JSON blobs, Phase 52 introduces a normalized relational schema:

```text
┌────────────────────────────────────────────────────────┐
│                        Project                         │
└──────────────────────────┬─────────────────────────────┘
                           │ 1:N
                           ▼
┌────────────────────────────────────────────────────────┐
│                       TestCase                         │
│  - id: UUID (PK)                                       │
│  - projectId: UUID (FK)                                │
│  - testCaseKey: String (e.g. TC-001)                   │
│  - title: String (Indexed)                             │
│  - objective: Text                                     │
│  - description: Text?                                  │
│  - type: TestCaseType (Enum)                           │
│  - priority: TestCasePriority (Enum)                   │
│  - status: TestCaseStatus (Enum)                       │
│  - executionSuitability: TestCaseExecutionSuitability  │
│  - sourceRequirementId: UUID? (FK, OnDelete: SetNull)  │
│  - sourceRequirementKey: String?                       │
│  - sourceRequirementVersionNumber: Int?                │
│  - sourceScenarioCandidateId: UUID?                    │
│  - sourceScenarioKey: String?                          │
│  - inputFingerprint: String?                           │
│  - providerId / model / promptId / promptVersion       │
│  - overallExpectedResult: Text?                        │
│  - assumptions: String[]                               │
│  - unknowns: JSON[]                                    │
│  - tags: String[]                                      │
└──────┬───────────────────┬───────────────────┬─────────┘
       │ 1:N               │ 1:N               │ 1:N
       ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌─────────────────┐
│ TestCaseStep │    │ TestCase-    │    │ TestCase-       │
│              │    │ Precondition │    │ TestDataItem    │
│ - stepNumber │    │ - sequence-  │    │ - sequenceOrder │
│ - action     │    │   Order      │    │ - name          │
│ - expected-  │    │ - category   │    │ - dataType      │
│   Result     │    │ - description│    │ - origin        │
│ - testData-  │    │ - isEnforced │    │ - value (JSON)  │
│   Summary    │    │ - confidence │    │ - constraint    │
│ - state-     │    │ - review-    │    │ - isSensitive   │
│   Transitions│    │   Required   │    │ - confidence    │
└──────────────┘    └──────────────┘    └─────────────────┘
```

### Key Allocation Strategy

- `ProjectTestCaseSequence` table maintains per-project atomic sequences.
- Atomic PostgreSQL `INSERT ... ON CONFLICT ("project_id") DO UPDATE SET "next_value" = ... RETURNING "next_value" - 1` allocates unique `TC-001`, `TC-002` sequential keys without collisions under high concurrency.

### Relational Integrity & Cascade Rules

- `onDelete: Cascade` on `testCaseId` for all child tables (`TestCaseStep`, `TestCasePrecondition`, `TestCaseTestDataItem`).
- `onDelete: SetNull` on `Requirement` references to preserve historical test cases even if the source requirement is archived or deleted.

---

## Contracts & Protocol

Exported from `@ai-quality/contracts`:

- **Channels**: `TEST_CASES_CREATE`, `TEST_CASES_GET_BY_ID`, `TEST_CASES_LIST`, `TEST_CASES_PERSIST_FROM_GENERATION`, `TEST_CASES_PERSIST_BATCH`, `TEST_CASES_DELETE`.
- **DTOs**: `TestCaseDto`, `TestCaseDetailDto`, `TestCaseStepDto`, `TestCasePreconditionDto`, `TestCaseTestDataItemDto`, `CreateTestCaseInputDto`, `PersistGeneratedTestCaseInputDto`, `PersistGeneratedTestCasesBatchInputDto`, `ListTestCasesInputDto`, `GetTestCaseByIdInputDto`, `DeleteTestCaseInputDto`, `TestCaseListResultDto`, `BatchPersistTestCasesResultDto`.
- **Zod Validation Schemas**: Runtime parsing and validation for all inputs and DTOs.
- **DesktopBridge**: Strongly typed `desktop.testCases` methods exposed via preload contextBridge.

---

## Core Domain Services

- **`TestCaseKeyAllocator`**: Atomic sequence allocator ensuring zero duplicate keys.
- **`TestCaseMappingService`**: Deterministically synthesizes ordered steps, preconditions, structured data items, and state changes from `GeneratedTestSpecificationDto`.
- **`TestCaseService`**: Transactional management (`persistFromGeneration`, `persistBatchFromGeneration`, `createTestCase`, `getTestCaseById`, `listTestCases`, `deleteTestCase`).

---

## User Interface & Desktop Integration

- **`TestCasesScreen` & `TestCasesListView`**: Project-scoped test case management table with search, category filtering (Positive, Negative, Boundary, Validation, Security, etc.), priority filtering, and pagination.
- **`TestCaseDetailModal`**: Full inspection modal for viewing structured steps, preconditions, data items, and provenance metadata.
- **`RequirementTestSpecificationsView`**: "Persist All as Test Cases" and per-specification "Persist as TC" buttons for immediate transition from generated specification to durable canonical test case.

---

## Verification & Test Results

- **Unit Tests**: 23/23 tests passing in `packages/core/src/test-cases/` and `apps/desktop/src/main/ipc/`.
- **Concurrency Test**: 15 concurrent creations allocating unique `TC-001` through `TC-015` with 0 duplicate key errors.
- **Full Suite**: 1029/1029 tests passing across 278 suites.
- **Build**: Electron desktop build and smoke test passed cleanly.
