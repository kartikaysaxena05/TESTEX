# V4 Phase 54 — Requirement-to-Test Traceability Foundation Documentation

## 1. Executive Summary

Phase 54 establishes the first durable, auditable, project-scoped domain relationship between **Requirements** and **Test Cases** within the AI-Driven Software Quality Engineering Platform.

Rather than relying on ephemeral UI labels or a trivial database column, Traceability is implemented as an explicit, first-class relational entity (`RequirementTestTrace`) backed by strict PostgreSQL referential integrity, bidirectional indexing, requirement version snapshot binding, dynamic/persisted staleness tracking, multi-tenant project isolation, and transactional generation persistence.

---

## 2. Core Architectural Components

### 2.1 Database Model (`RequirementTestTrace`)

Located in `/Users/kartikaysaxena/Desktop/collage/prisma/schema.prisma` and deployed via migration `20260822000000_init_requirement_test_traceability`:

- **Entity**: `RequirementTestTrace`
- **Fields**:
  - `id`: UUID (Primary Key)
  - `projectId`: UUID (Foreign Key to `Project`, `onDelete: Cascade`)
  - `requirementId`: UUID (Foreign Key to `Requirement`, `onDelete: Cascade`)
  - `requirementVersionId`: UUID? (Foreign Key to `RequirementVersion`, `onDelete: SetNull`)
  - `requirementVersionNumber`: Int (Immutable snapshot of requirement version active at trace creation)
  - `testCaseId`: UUID (Foreign Key to `TestCase`, `onDelete: Cascade`)
  - `scenarioCandidateId`: UUID? (Foreign Key to `RequirementScenarioCandidate`, `onDelete: SetNull`)
  - `scenarioKey`: VarChar(64)? (Scenario key identifier e.g. `SCN-AUTH-001`)
  - `generationRunId`: UUID? (Correlation ID of the AI generation run)
  - `origin`: Enum (`GENERATED`, `MANUAL`, `DERIVED`, `IMPORTED`)
  - `status`: Enum (`CURRENT`, `STALE`, `REVIEW_REQUIRED`)
  - `staleReason`: VarChar(255)? (`REQUIREMENT_VERSION_ADVANCED`, etc.)
  - `provenanceJson`: JSONB (Model, promptId, promptVersion, inputFingerprint, user metadata)
  - `createdAt`, `updatedAt`: Timestamps
- **Constraints**:
  - `@@unique([requirementId, testCaseId])`: Enforces idempotency and prevents duplicate logical links.
  - `@@index([projectId])`, `@@index([requirementId])`, `@@index([testCaseId])`, `@@index([status])`: High-speed bidirectional querying.

### 2.2 Traceability Service (`RequirementTestTraceService`)

Located in `packages/core/src/traceability/requirement-test-trace-service.ts`:

- `createTrace(input)`: Validates project isolation, enforces version snapshotting, and handles idempotent duplicate calls.
- `deleteTrace(input)`: Safely removes trace links without deleting either the Requirement or TestCase.
- `getTraceById(input)`: Retrieves trace with dynamic staleness evaluation against the requirement's current version.
- `listTracesForRequirement(input)`: Forward lookup (Requirement $\rightarrow$ TestCases).
- `listTracesForTestCase(input)`: Reverse lookup (TestCase $\rightarrow$ Requirements).
- `listProjectTraces(input)`: Bounded, paginated search and filtering across project traces.
- `syncTraceStalenessForRequirement(requirementId, newVersionNumber, tx)`: Synchronizes persisted staleness when requirement versions advance.

### 2.3 Atomic Generation Persistence

Located in `packages/core/src/test-cases/test-case-service.ts`:

- Whenever `persistFromGeneration` or `persistBatchFromGeneration` is invoked, `RequirementTestTrace` is persisted inside the exact same atomic PostgreSQL transaction (`tx`) as the `TestCase` and its child entities (steps, preconditions, test data, expected results).
- The trace captures `requirementVersionId`, `requirementVersionNumber`, `scenarioKey`, `generationRunId`, and AI provenance (`providerId`, `model`, `promptId`, `inputFingerprint`).

### 2.4 Requirement Version Advancement Staleness Hook

Located in `packages/core/src/requirements/versioning/requirement-version-service.ts`:

- When a Requirement version advances ($vN \rightarrow vN+1$) via `updateRequirementVersioned` or `restoreRequirementVersion`, `invalidateDerivedIntelligence` updates all historical traces for that requirement (`requirementVersionNumber < newVersionNumber`) to `status = STALE` with `staleReason = 'REQUIREMENT_VERSION_ADVANCED'`.
- Preserves historical provenance: the trace still references $vN$ so audit logs can prove which version produced the test.

---

## 3. Desktop Preload & IPC Architecture

- **Channels (`DESKTOP_CHANNELS`)**:
  - `traceability:createTrace`
  - `traceability:deleteTrace`
  - `traceability:getById`
  - `traceability:listByRequirement`
  - `traceability:listByTestCase`
  - `traceability:listProjectTraces`
- **Error Codes (`DESKTOP_ERROR_CODES`)**:
  - `TRACEABILITY_PROJECT_MISMATCH`
  - `TRACEABILITY_NOT_FOUND`
  - `TRACEABILITY_REQUIREMENT_NOT_FOUND`
  - `TRACEABILITY_TEST_CASE_NOT_FOUND`
  - `TRACEABILITY_ALREADY_EXISTS`
  - `TRACEABILITY_VALIDATION_FAILED`

---

## 4. UI Components

1. **`RequirementLinkedTracesView.tsx`**:
   - Rendered in `ViewRequirementModal.tsx` under "Linked Test Cases (Forward Traceability)".
   - Displays all test cases traced back to the requirement, origin badges, status badges (`CURRENT` vs `STALE`), bound requirement version vs current version, and manual unlink action.
2. **`TestCaseDetailModal.tsx`**:
   - Includes "Traceability & Linked Requirements" tab (Reverse Traceability).
   - Displays linked requirement keys, titles, origins, staleness badges, and version bindings.

---

## 5. Verification Results

- **Unit & Integration Tests**: 1075 / 1075 tests passed (100% success rate across all 54 phases).
- **Typecheck**: Zero errors (`tsc -b`).
- **ESLint**: Zero errors.
- **Prettier**: Clean formatting.
- **Desktop Build & Smoke Test**: Passed without warnings or exceptions.
