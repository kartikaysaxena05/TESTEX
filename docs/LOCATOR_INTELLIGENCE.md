# V5 Phase 64 — UI Element Resolution & Locator Intelligence

## Overview & Core Purpose

The **UI Element Resolution & Locator Intelligence Engine** is the authoritative runtime layer responsible for translating structured, deterministic element target descriptors from Phase 60 executable test plans into safe, unambiguous, auditable Playwright locators.

It answers the singular, critical question:

> **"Which UI element does this test step refer to?"**

It strictly decouples locator resolution from action execution, assertions, retry loops, and self-healing heuristics.

---

## Architectural Principles & Invariants

1. **Zero Arbitrary Code Execution**:
   - Resolution is 100% data-driven and strictly validated against Zod contracts and domain boundary rules.
   - Script injection payloads (such as `javascript:`, `<script>`, `document.querySelector`, `page.evaluate`) are rejected immediately before Playwright DOM evaluation.
2. **Strict Disambiguation (No Silent `.first()`)**:
   - The engine never silently selects the first matching element when multiple matches exist.
   - If `matchCount > 1` without an explicit, valid `ordinal`, the service returns `status: 'AMBIGUOUS'` alongside diagnostic metadata for up to 10 matching candidate elements.
3. **Exact Matching by Default**:
   - Semantic text, role name, label, alt text, and title resolutions default to `exact: true` to prevent substring collision and false positives.
4. **Resilient Accessibility-First Strategy Hierarchy**:
   - Automatic fallback cascade:
     1. `TEST_ID` (`getByTestId`)
     2. `ROLE` (`getByRole` with accessible name)
     3. `LABEL` (`getByLabel`)
     4. `PLACEHOLDER` (`getByPlaceholder`)
     5. `TEXT` (`getByText`, exact)
     6. `ALT_TEXT` (`getByAltText`)
     7. `TITLE` (`getByTitle`)
     8. `CSS` (`locator(css)`)
     9. `XPATH` (`locator(xpath)`)
5. **Scoped & Multi-Frame Resolution**:
   - Explicit container isolation: `PAGE`, `FORM`, `DIALOG` / `MODAL`, `TABLE_ROW`, `TABLE`, `REGION` / `SECTION`, `CONTAINER`.
   - Frame and Iframe boundary crossing via `frameLocator` with uniqueness verification.
6. **Multi-Tenant Security & Tenant Isolation**:
   - Every resolution request validates project ownership against the active test run session and database records.
   - Sensitive input fields (e.g., `type="password"`) are sanitized in diagnostics to ensure passwords are never leaked into test logs, traces, or IPC payloads.

---

## Locator Strategy Resolution Hierarchy

```mermaid
flowchart TD
    Target[ExecutableTargetDescriptor] --> ScopeCheck{Enclosing Scope?}
    ScopeCheck -- Frame/Container/Form/Dialog/Table --> BuildScope[Resolve FrameLocator / Scoped Parent]
    ScopeCheck -- None (Page) --> RootPage[Page Root]

    BuildScope --> StrategyCheck
    RootPage --> StrategyCheck

    StrategyCheck{Strategy Defined?}
    StrategyCheck -- Explicit Strategy --> ExecStrategy[Execute Specified Strategy]
    StrategyCheck -- AUTO / Infer --> Cascade[Accessibility-First Cascade]

    Cascade --> S1[1. TEST_ID]
    Cascade --> S2[2. ROLE + Accessible Name]
    Cascade --> S3[3. LABEL]
    Cascade --> S4[4. PLACEHOLDER]
    Cascade --> S5[5. TEXT exact]
    Cascade --> S6[6. ALT_TEXT]
    Cascade --> S7[7. TITLE]
    Cascade --> S8[8. CSS Selector]
    Cascade --> S9[9. XPath Selector]

    ExecStrategy --> FilterCheck{Filter / Predicate?}
    S1 & S2 & S3 & S4 & S5 & S6 & S7 & S8 & S9 --> FilterCheck

    FilterCheck -- hasText / hasNotText --> ApplyFilter[Apply Locator Filter]
    FilterCheck -- None --> CountCheck

    ApplyFilter --> CountCheck{Count Matches}
    CountCheck -- count == 0 --> NotFound[NOT_FOUND]
    CountCheck -- count == 1 --> Resolved[RESOLVED (Diagnostics Extracted)]
    CountCheck -- count > 1 + Valid Ordinal --> ResolvedOrdinal[RESOLVED (.nth(ordinal))]
    CountCheck -- count > 1 (No Ordinal) --> Ambiguous[AMBIGUOUS (Candidate Diagnostics Captured)]
```

---

## Scoped Resolution Matrix

| Scope Type           | Resolution Mechanism                                             | Match Requirements         |
| :------------------- | :--------------------------------------------------------------- | :------------------------- |
| `PAGE`               | Direct page-level root locator                                   | None                       |
| `FORM`               | `page.locator('form')` filtered by accessible name / id / testId | Unambiguous form container |
| `DIALOG` / `MODAL`   | `page.getByRole('dialog')` or `[role="dialog"]`                  | Visible modal container    |
| `TABLE_ROW`          | `table.getByRole('row')` filtered with `hasText` or column match | Specific data row          |
| `TABLE`              | `page.getByRole('table')` or `table` element                     | Distinct table instance    |
| `REGION` / `SECTION` | `page.getByRole('region')` or `<section>`                        | Landmark section           |
| `CONTAINER`          | Explicit container CSS/testId selector                           | Single bounding element    |
| `FRAME` / `IFRAME`   | `page.frameLocator(iframeSelector)`                              | Strict 1-match iframe      |

---

## Desktop IPC Interface & Preload Bridge

### Channel

`EXECUTION_RESOLVE_LOCATOR` (`desktop:execution:resolve-locator`)

### Preload Exposure

```typescript
window.desktop.locators.resolveLocator({
  projectId: string;
  testRunId: string;
  target: ExecutableTargetDescriptorDto;
  timeoutMs?: number;
}): Promise<IpcResponse<LocatorResolutionResultDto>>
```

### Response Schema (`LocatorResolutionResultDto`)

```typescript
{
  status: 'RESOLVED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'INVALID_TARGET' | 'UNSUPPORTED' | 'CANCELLED';
  strategy: 'TEST_ID' | 'ROLE' | 'LABEL' | 'PLACEHOLDER' | 'TEXT' | 'ALT_TEXT' | 'TITLE' | 'CSS' | 'XPATH';
  matchCount: number;
  selectorRecipe: string;
  scopeRecipe?: string;
  durationMs: number;
  elementDiagnostics?: {
    tagName: string;
    role?: string;
    accessibleName?: string;
    testId?: string;
    isVisible: boolean;
    isEnabled: boolean;
    boundingBox?: { x: number; y: number; width: number; height: number };
    inputType?: string;
  };
  candidateDiagnostics?: Array<{
    tagName: string;
    role?: string;
    accessibleName?: string;
    testId?: string;
    snippet?: string;
    ordinalIndex: number;
  }>;
}
```

---

## Test Verification Summary

- **Unit & Security Suite**: `packages/core/src/execution/locators/locator-target-validator.test.ts` (9/9 passed).
- **Playwright Integration Suite**: `packages/core/src/execution/locators/locator-resolution-service.test.ts` (21/21 passed).
- **Desktop IPC Suite**: `apps/desktop/src/main/ipc/locator-handlers.test.ts` (3/3 passed).
- **Total Phase 64 Tests**: 33 tests passing with 0 failures and 0 regressions.
