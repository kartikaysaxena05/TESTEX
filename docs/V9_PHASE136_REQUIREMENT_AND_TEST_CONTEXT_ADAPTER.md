# V9 Phase 136 — Requirement & Test Context Adapter

## Executive Summary

Phase 136 builds the production-grade, provider-independent **Requirement & Test Context Adapter** for the V9 AI Runtime. This layer enables local models (e.g. Ollama `llama3:8b`) to consume relevant requirement specifications, test cases with steps and preconditions, traceability links, execution history, and failure diagnostic records directly from the established V3–V7 database entities without rebuilding or duplicating existing domain services.

---

## Architecture & Data Flow

```text
[ V3 Requirements (Versions & Provenance) ]
[ V4 Test Cases (Steps & Preconditions)   ]
[ V5 Execution (Runs & Attempts)          ]
[ V6 Failure Intelligence (Defects)       ]
                    │
                    ▼
     RequirementTestContextAdapter
     (Tenant Validation & Deep Redaction)
                    │
                    ▼
          ContextWindowManager (Phase 134)
          (Token Budgeting & Pruning)
                    │
                    ▼
          AiPrivacyService (Phase 137)
          (LOCAL_ONLY Policy Firewall)
                    │
                    ▼
        Local Generation Runtime (Phase 130)
        (Ollama / Local LLM)
```

---

## Key Contracts (`packages/contracts`)

1. **`AiRequirementItemDto` & `aiRequirementItemSchema`**:
   - Normalized requirement item including `requirementKey`, `title`, `description`, `type`, `status`, `priority`, `versionNumber`, `provenance` (sourceKind, sectionPath, pageNumber, lineStart, lineEnd, sourceText).
2. **`AiTestCaseItemDto` & `aiTestCaseItemSchema`**:
   - Normalized test case item including `testCaseKey`, `sourceRequirementKey`, `title`, `objective`, `status`, `reviewStatus`, `preconditions`, `steps` (stepNumber, action, expectedResult), and `expectedResult`.
3. **`AiTraceabilityItemDto` & `aiTraceabilityItemSchema`**:
   - Bi-directional link between requirements and test cases (`requirementKey`, `testCaseKey`, `status`, `origin`).
4. **`AiExecutionSummaryItemDto` & `aiExecutionSummaryItemSchema`**:
   - Recent test execution results (`status`, `durationMs`, `errorMessage`, `terminalReason`).
5. **`AiFailureSummaryItemDto` & `aiFailureSummaryItemSchema`**:
   - Defect details (`failureSummary`, `errorMessage`, `errorCode`, `failureSignature`).
6. **`AssembleRequirementTestContextInputDto`**:
   - Query filters: `projectId`, `requirementIds`, `requirementKeys`, `testCaseIds`, `testCaseKeys`, `includeTraceability`, `includeExecutions`, `includeFailures`, `maxTokens`.
7. **`RequirementTestContextResultDto`**:
   - Structured items and pre-formatted prompt texts (`formattedRequirementContext`, `formattedTestContext`, `formattedUnifiedContext`), token estimation, and truncation flags.

---

## Core Adapter Implementation (`packages/core`)

- **Class**: `RequirementTestContextAdapter` in `packages/core/src/ai-provider/requirement-test-context-adapter.ts`.
- **Tenant Isolation**: Asserts that `projectId` belongs to the requesting `userId`; throws `AiCrossProjectAccessError` upon violation.
- **Deep Redaction**: Employs `AiPrivacyService.sanitizeText` and `SecretRedactor` to strip passwords, bearer tokens, API keys, database URLs, and environment secrets from descriptions, steps, and error logs before token budgeting.
- **Deterministic Token Budgeting**:
  - Uses `TokenEstimatorService.estimateString` (~3.8 chars/token).
  - Prunes non-essential context in priority order when `maxTokens` is constrained:
    1. Executions $\to$ 2. Failures $\to$ 3. Traceability links $\to$ 4. Test cases (from tail) $\to$ 5. Requirements (from tail).
  - Preserves untrusted content boundaries (`### PROJECT REQUIREMENTS (UNTRUSTED DATA SOURCE)`) to mitigate prompt injection.

---

## Desktop Bridge & IPC Integration (`apps/desktop`)

- **IPC Channel**: `desktop:ai:context:assemble-req-test` (`DESKTOP_CHANNELS.AI_CONTEXT_ASSEMBLE_REQ_TEST`).
- **Handler**: `handleAssembleRequirementTestContext` in `apps/desktop/src/main/ipc/generation-handlers.ts`.
- **Preload API**: `window.desktopBridge.aiContext.assembleRequirementTestContext(input)`.

---

## Verification & Certification

All 7 core certification tests pass in `packages/core/src/ai-provider/certification/v9-phase136-certification.test.ts`:
1. `retrieves requirements preserving provenance and metadata`: Verified.
2. `retrieves test cases with numbered steps and execution metadata`: Verified.
3. `traverses full traceability from Requirement to Test, Execution, and Failure`: Verified.
4. `strictly enforces multi-tenant project isolation and denies cross-project access`: Verified.
5. `performs deep secret redaction on sensitive credentials in requirements and tests`: Verified.
6. `deterministic token budgeting prunes non-essential context when budget is restricted`: Verified.
7. `end-to-end integration: feeds assembled context seamlessly into local generation runtime`: Verified.

**Full Regression Metrics**:
- V9 AI Provider & Runtime Certification Suite: **185 / 185 tests passing**.
- Desktop IPC Handlers: **784 / 784 tests passing**.
- Desktop Shell Certification: **17 / 17 tests passing**.
