# Structured Test-to-Executable Plan Compiler (V5 Phase 60)

## Overview

The **Structured Test-to-Executable Plan Compiler** serves as the authoritative translation bridge between approved canonical test cases (`TestCase` / `TestCaseVersion`) created in V4 and the target runtime environment configured in Phase 59 (`ProjectEnvironment` / `TargetApplication`).

It translates natural language test steps and expected results into a version-pinned, strongly typed, deterministic **Executable Test Plan** (`ExecutableTestPlan`) ready for downstream orchestration in Phase 61+.

---

## Architectural Guarantees & Safety Boundaries

1. **Deterministic Execution Boundary**:
   - Free-form prose never executes directly against live browsers.
   - 100% deterministic compilation without LLM involvement at compilation time.
   - Identical test case versions and environment contexts yield identical execution plans and SHA-256 fingerprints.

2. **Strongly Typed Action Taxonomy**:
   - Allowed action verbs: `NAVIGATE`, `CLICK`, `FILL`, `CLEAR`, `SELECT`, `CHECK`, `UNCHECK`, `PRESS`, `HOVER`, `SCROLL`, `UPLOAD`, `WAIT_FOR_STATE`, `ASSERT`.
   - Prohibited execution patterns (`eval`, `child_process`, arbitrary shell commands, raw Playwright scripts) are strictly rejected with `PROHIBITED_ACTION` diagnostic errors.

3. **Semantic Target Descriptors**:
   - Targets are captured as semantic accessibility descriptors (`kind`, `role`, `name`, `label`, `placeholder`, `route`, `semanticHint`) rather than fragile CSS selectors or brittle DOM paths.
   - Low-level DOM locator binding is deferred to the runtime locator engine (Phase 64).

4. **Runtime Value & Secret References**:
   - Values are classified into: `LITERAL`, `VARIABLE` (`{{user.email}}`), `SECRET_REFERENCE` (`auth.primary.password`), `GENERATED_VALUE`, and `PREVIOUS_STEP_OUTPUT`.
   - Plaintext secrets and passwords are never written to the plan or persisted in plaintext.

5. **Explicit Assertion Mapping**:
   - Expected results are translated to explicit assertions: `VISIBLE`, `HIDDEN`, `TEXT_EQUALS`, `TEXT_CONTAINS`, `VALUE_EQUALS`, `ENABLED`, `DISABLED`, `CHECKED`, `UNCHECKED`, `URL_EQUALS`, `URL_CONTAINS`, `TITLE_EQUALS`, `COUNT_EQUALS`, `ATTRIBUTE_EQUALS`, `RESPONSE_STATUS`.
   - Vague or qualitative statements (e.g. "page loads fast") trigger `NON_EXECUTABLE_EXPECTATION` diagnostics without hallucinating fake thresholds.

6. **Partial Compilation Policy**:
   - If any step fails parsing or contains unsupported actions, the plan is marked `INVALID` (`isExecutable: false`).
   - Unsupported steps are never dropped or omitted from `stepsJson`.

7. **Version Pinning & Immutability**:
   - Plan is stamped with `compilerVersion: "1.0.0"`, `planSchemaVersion: 1`, `testCaseVersionNumber`, and canonical SHA-256 `planFingerprint`.
   - Source test case definitions and versions remain completely immutable during compilation.

8. **Multi-Tenant Isolation**:
   - Cross-project test cases or environment references are strictly rejected with `CompilerProjectMismatchError` or `TestEnvironmentMismatchError`.

---

## Data Model & Persistence

The `ExecutableTestPlan` model is persisted in PostgreSQL via Prisma:

```prisma
enum PlanCompilationStatus {
  VALID
  INVALID
  STALE
  REVIEW_REQUIRED
}

model ExecutableTestPlan {
  id                    String                @id @default(uuid())
  projectId             String
  testCaseId            String
  testCaseVersionId     String?
  testCaseVersionNumber Int
  environmentId         String?
  targetApplicationId   String?
  compilerVersion       String                @db.VarChar(32)
  planSchemaVersion     Int
  status                PlanCompilationStatus
  planFingerprint       String                @db.VarChar(64)
  sourceRequirementIds  String[]
  sourceRequirementKeys String[]
  summary               String?
  preconditionsJson     Json
  stepsJson             Json
  assertionsJson        Json
  postconditionsJson    Json
  diagnosticsJson       Json
  hasErrors             Boolean               @default(false)
  hasWarnings           Boolean               @default(false)
  isExecutable          Boolean               @default(false)
  compiledAt            DateTime              @default(now())
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt

  project               Project               @relation(fields: [projectId], references: [id], onDelete: Cascade)
  testCase              TestCase              @relation(fields: [testCaseId], references: [id], onDelete: Cascade)
  testCaseVersion       TestCaseVersion?      @relation(fields: [testCaseVersionId], references: [id], onDelete: SetNull)
  environment           ProjectEnvironment?   @relation(fields: [environmentId], references: [id], onDelete: SetNull)
  targetApplication     TargetApplication?    @relation(fields: [targetApplicationId], references: [id], onDelete: SetNull)

  @@unique([testCaseId, testCaseVersionNumber, environmentId, planFingerprint])
  @@index([projectId, status])
  @@index([testCaseId, testCaseVersionNumber])
  @@index([environmentId])
  @@index([planFingerprint])
}
```

---

## Desktop IPC Channels

| Channel                                  | Method              | Description                                                     |
| ---------------------------------------- | ------------------- | --------------------------------------------------------------- |
| `desktop:plan-compiler:compile`          | `compilePlan`       | Compiles and persists an executable test plan atomically        |
| `desktop:plan-compiler:get`              | `getPlan`           | Retrieves plan by plan ID                                       |
| `desktop:plan-compiler:get-by-test-case` | `getPlanByTestCase` | Retrieves the latest plan for a test case                       |
| `desktop:plan-compiler:list`             | `listPlans`         | Lists plans for a project with status filtering                 |
| `desktop:plan-compiler:preview`          | `previewPlan`       | In-memory plan compilation preview without database persistence |

---

## Verification & Test Suites

- `packages/core/src/execution/compiler/step-action-parser.test.ts`: Action verb recognition, semantic target extraction, variable/secret extraction, security checks (prohibited actions, unsafe protocols, path traversal).
- `packages/core/src/execution/compiler/assertion-parser.test.ts`: Expected result assertion parsing, multi-clause splitting, vague expectation detection.
- `packages/core/src/execution/compiler/test-plan-compiler.test.ts`: Complete compiler orchestration, determinism, fingerprinting, version pinning, partial compilation policy.
- `packages/core/src/execution/compiler/executable-plan-service.test.ts`: PostgreSQL integration, transactional persistence, idempotency, gating, retrieval.
- `packages/core/src/execution/compiler/compiler-security.test.ts`: Multi-tenant project isolation, prompt injection immunity, secret redaction, source test immutability.
- `apps/desktop/src/main/ipc/plan-compiler-handlers.test.ts`: IPC frame sender validation, Zod schema validation, domain error handling.
