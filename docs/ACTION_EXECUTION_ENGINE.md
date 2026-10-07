# Action Execution Engine (V5 Phase 63)

## 1. Overview & Core Philosophy

The **Action Execution Engine** is the authoritative runtime system responsible for executing deterministic browser interactions against real Playwright browser sessions (`BrowserExecutionSession`). It translates validated executable plan steps (`ExecutablePlanStepDto`) from Phase 60 into real browser events, enforcing security invariants, strict disambiguation, secret redaction, and stop-on-failure execution policies.

### Strict Architectural Boundaries

- **0 Arbitrary Code Execution**: The engine **never** accepts, interprets, or evaluates AI-generated JavaScript/TypeScript strings via `eval`, `Function()`, `vm`, `child_process`, or dynamic script injection. Every interaction is mapped through structured, strongly-typed action handlers.
- **Strict Disambiguation**: The engine never randomly selects an element when multiple DOM nodes match a locator. If `locator.count() > 1`, it immediately throws `TargetAmbiguousError` with the exact count.
- **Actionability Over Force**: The engine respects Playwright's native actionability checks (visible, stable, enabled, editable). It **never** applies `force: true` automatically.
- **No Assertions / Verdicts**: Phase 63 only executes actions and records low-level operational outcomes. Expected-vs-actual verification and test verdicts belong strictly to Phase 64.

---

## 2. Action Taxonomy & Handlers

The engine provides dedicated handlers implementing the `IActionHandler` interface for each action type in `ExecutableActionType`:

| Action Type                           | Handler Class                                 | Risk Level  | Description                                                                                                                                            |
| :------------------------------------ | :-------------------------------------------- | :---------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NAVIGATE`                            | `NavigateActionHandler`                       | `READ_ONLY` | Navigates to relative path or authorized target URL. Enforces base URL origin boundaries and rejects unsafe schemes (`javascript:`, `file:`, `data:`). |
| `CLICK`                               | `ClickActionHandler`                          | `MUTATING`  | Performs a single click with strict locator resolution and actionability checks.                                                                       |
| `DOUBLE_CLICK`                        | `DoubleClickActionHandler`                    | `MUTATING`  | Performs a double click on target control.                                                                                                             |
| `FILL`                                | `FillActionHandler`                           | `MUTATING`  | Replaces field value deterministically with secret masking.                                                                                            |
| `TYPE`                                | `TypeActionHandler`                           | `MUTATING`  | Types characters sequentially with bounded keystroke delays.                                                                                           |
| `CLEAR`                               | `ClearActionHandler`                          | `MUTATING`  | Clears target input/textarea.                                                                                                                          |
| `PRESS` / `PRESS_KEY`                 | `PressKeyActionHandler`                       | `MUTATING`  | Dispatches validated keyboard keys (`Enter`, `Tab`, `Escape`, modifier chords). Rejects arbitrary script identifiers.                                  |
| `SELECT` / `SELECT_OPTION`            | `SelectOptionActionHandler`                   | `MUTATING`  | Selects option in native `<select>` controls by label or value.                                                                                        |
| `CHECK` / `UNCHECK`                   | `CheckActionHandler` / `UncheckActionHandler` | `MUTATING`  | Toggles checkbox or radio button states.                                                                                                               |
| `HOVER`                               | `HoverActionHandler`                          | `READ_ONLY` | Moves cursor over target element.                                                                                                                      |
| `FOCUS` / `BLUR`                      | `FocusActionHandler` / `BlurActionHandler`    | `MUTATING`  | Dispatches focus and blur field events.                                                                                                                |
| `SCROLL`                              | `ScrollActionHandler`                         | `READ_ONLY` | Scrolls target element into viewport or performs bounded wheel scrolling.                                                                              |
| `WAIT_FOR_STATE` / `WAIT_FOR_ELEMENT` | `WaitForStateActionHandler`                   | `READ_ONLY` | Waits for element DOM state (`visible`, `hidden`, `attached`, `detached`).                                                                             |
| `WAIT_FOR_URL`                        | `WaitForUrlActionHandler`                     | `READ_ONLY` | Waits for navigation or SPA route transition matching expected URL/path.                                                                               |
| `WAIT_FOR_LOAD_STATE`                 | `WaitForLoadStateActionHandler`               | `READ_ONLY` | Waits for page load state (`domcontentloaded`, `load`, `networkidle`).                                                                                 |
| `UPLOAD`                              | `UploadActionHandler`                         | `MUTATING`  | Sets file on file input with path traversal protection and 25MB file size limit.                                                                       |

---

## 3. Locator Resolution Hierarchy

The `LocatorResolver` deterministically builds Playwright `Locator` instances from `ExecutableTargetDescriptorDto` using the following hierarchy:

1. **`testId`**: `page.getByTestId(target.testId)`
2. **`locatorHints`**: Direct CSS / XPath selector `page.locator(hint)`
3. **`role`**: `page.getByRole(role, { name, exact: true })`
4. **`label`**: `page.getByLabel(label, { exact: true })`
5. **`placeholder`**: `page.getByPlaceholder(placeholder, { exact: true })`
6. **`FIELD` name**: `page.locator('input[name="..."], textarea[name="..."], select[name="..."]')`
7. **`CONTROL` name**: `page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true }))...`
8. **`name` / `semanticHint`**: `page.getByText(name, { exact: true })`

### Strict Mode Disambiguation

When resolving locators, the resolver queries `locator.count()`. If `count > 1`, a typed `TargetAmbiguousError` is raised, detailing the target descriptor and match count.

---

## 4. Multi-Tenant Project Isolation & Security

1. **Database & Session Ownership Verification**:
   - `ActionExecutionService` checks `testRun.projectId === input.projectId` in SQLite/PostgreSQL.
   - `ActionExecutionService` checks `session.projectId === input.projectId` in the active session registry.
   - Any cross-project access attempt throws `CrossRunExecutionError` (`CROSS_RUN_EXECUTION_ERROR`).
2. **IPC Sender Validation**:
   - Desktop IPC channels (`EXECUTION_EXECUTE_ACTION`, `EXECUTION_EXECUTE_STEP`) verify `isTrustedIpcSender(event)`. Calls from untrusted frames or third-party origins are rejected with `UNAUTHORIZED_SENDER`.
3. **Secret Redaction**:
   - Passwords and secret references (`SECRET_REFERENCE`) are registered with `SecretRedactor`.
   - Execution outputs mask sensitive credentials to `[REDACTED]` in `valueSummary`, logs, and IPC payloads.
4. **Production Safety Policy**:
   - If an environment has `isProduction: true`, destructive actions (`riskLevel: 'DESTRUCTIVE'`) are blocked with `DestructiveActionProhibitedError` unless `allowDestructive: true` is explicitly passed.

---

## 5. Execution Lifecycle & Stop-on-Failure

When running a sequential plan (`executePlanSteps`):

1. **Order Guarantee**: Steps are sorted strictly by `sequence` ascending (1 -> 2 -> 3).
2. **Cooperative Cancellation**: An `AbortSignal` is checked prior to and during action execution. If cancelled, the step status is set to `CANCELLED` and remaining steps are halted.
3. **Stop on Failure**: If a required step fails (`status: 'FAILED'` and `!step.isOptional`), dependent step execution halts immediately.
