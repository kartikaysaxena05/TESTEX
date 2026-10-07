# V5 Phase 65 — Browser Action Execution Engine

## 1. Executive Overview

The **Browser Action Execution Engine** provides the authoritative, typed, deterministic, and auditable browser action execution runtime for Version 5. It bridges compiled test plan steps (`ExecutablePlanStepDto` from Phase 60), resolved runtime test data (`ExecutableValueReferenceDto` from Phase 63), and resolved UI element locators (`LocatorResolutionResultDto` from Phase 64) into trusted, real Playwright browser interactions against managed browser sessions (`BrowserExecutionSession` from Phase 62).

```text
Approved V4 Test Case
        ↓
Phase 60 Executable Plan Compiler
        ↓
Phase 61 Test Run Orchestrator
        ↓
Phase 62 Browser Context & Session
        ↓
Phase 63 Test Data & Runtime Variable Resolution
        ↓
Phase 64 UI Element Resolution & Locator Intelligence
        ↓
Phase 65 Browser Action Execution Engine
        ↓
Deterministic Playwright Operation
        ↓
Structured ActionResultDto
```

---

## 2. Core Architectural Invariants

1. **Explicit Allowlisted Action Vocabulary**: All operations are strictly dispatched through typed handlers. Arbitrary code execution (`eval()`, `new Function()`, `child_process`, `page.evaluate(userInput)`) is strictly prohibited.
2. **Strict Disambiguation & Truthful Failure**: The engine consumes Phase 64 locators and never uses silent `.first()` or guesses when targets are ambiguous.
3. **No Silent Force-Click Fallback**: Clicks and interactions enforce realistic browser actionability (`force: false`). Hidden, disabled, or covered elements surface truthfully as execution failures (`TARGET_DISABLED`, `TARGET_NOT_VISIBLE`, `ACTION_TIMEOUT`).
4. **No JavaScript DOM Mutation Fallback**: Form fields are filled via realistic browser events (`locator.fill()` / `locator.pressSequentially()`), never artificial `element.value = ...` script injection.
5. **No Premature Assertions or Retries**: An action succeeding only signifies execution completion. Assertions belong to Phase 67, and flakiness retry belongs to Phase 71.
6. **Zero Secrets in Logs**: Passwords and sensitive test data are masked (`[REDACTED]`) across execution summaries, logs, and error messages.
7. **Multi-Tenant Isolation**: Every action execution verifies database project ownership and in-memory session ownership.

---

## 3. Supported Action Vocabulary

| Action Type                | Handler Class                   | Description & Semantics                                                                                                          | Risk Level  |
| -------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `NAVIGATE`                 | `NavigateActionHandler`         | Navigates to relative path (resolved via base URL) or approved origin. Rejects unsafe schemes (`javascript:`, `file:`, `data:`). | `READ_ONLY` |
| `CLICK`                    | `ClickActionHandler`            | Semantic single click with actionability checks (`force: false`).                                                                | `MUTATING`  |
| `DOUBLE_CLICK`             | `DoubleClickActionHandler`      | Semantic double click with actionability checks (`force: false`).                                                                | `MUTATING`  |
| `FILL`                     | `FillActionHandler`             | Replaces editable control content with secret masking on password fields.                                                        | `MUTATING`  |
| `TYPE`                     | `TypeActionHandler`             | Sequential keyboard character typing with bounded character delay.                                                               | `MUTATING`  |
| `CLEAR`                    | `ClearActionHandler`            | Clears field content via `locator.clear()`.                                                                                      | `MUTATING`  |
| `PRESS`                    | `PressKeyActionHandler`         | Controlled keyboard key press (e.g., `Enter`, `Tab`, `Escape`, `Control+A`) against element or page.                             | `MUTATING`  |
| `SELECT` / `SELECT_OPTION` | `SelectOptionActionHandler`     | Selects option in HTML `<select>` by label, value, or index.                                                                     | `MUTATING`  |
| `CHECK`                    | `CheckActionHandler`            | Checks checkbox/radio button; idempotent if already checked.                                                                     | `MUTATING`  |
| `UNCHECK`                  | `UncheckActionHandler`          | Unchecks checkbox; idempotent if already unchecked.                                                                              | `MUTATING`  |
| `HOVER`                    | `HoverActionHandler`            | Moves mouse pointer over resolved element (`locator.hover()`).                                                                   | `READ_ONLY` |
| `FOCUS`                    | `FocusActionHandler`            | Triggers field focus event (`locator.focus()`).                                                                                  | `MUTATING`  |
| `BLUR`                     | `BlurActionHandler`             | Triggers field blur event (`el.blur()`).                                                                                         | `MUTATING`  |
| `SCROLL`                   | `ScrollActionHandler`           | Bounded viewport or element scroll with delta constraints.                                                                       | `READ_ONLY` |
| `SCROLL_INTO_VIEW`         | `ScrollIntoViewActionHandler`   | Explicitly scrolls target element into viewport (`locator.scrollIntoViewIfNeeded()`).                                            | `READ_ONLY` |
| `UPLOAD` / `UPLOAD_FILE`   | `UploadActionHandler`           | Sets input files on file inputs; validates against path traversal and file size <= 25MB.                                         | `MUTATING`  |
| `DRAG_AND_DROP`            | `DragAndDropActionHandler`      | Drags source element to destination element locator (`sourceLocator.dragTo(targetLocator)`).                                     | `MUTATING`  |
| `GO_BACK`                  | `GoBackActionHandler`           | Targetless browser history navigation backward.                                                                                  | `READ_ONLY` |
| `GO_FORWARD`               | `GoForwardActionHandler`        | Targetless browser history navigation forward.                                                                                   | `READ_ONLY` |
| `RELOAD`                   | `ReloadActionHandler`           | Reloads current active browser page.                                                                                             | `READ_ONLY` |
| `WAIT_FOR_STATE`           | `WaitForStateActionHandler`     | Bounded wait for element state (`visible`, `hidden`, `attached`, `detached`).                                                    | `READ_ONLY` |
| `WAIT_FOR_ELEMENT`         | `WaitForElementActionHandler`   | Bounded wait for element attachment.                                                                                             | `READ_ONLY` |
| `WAIT_FOR_URL`             | `WaitForUrlActionHandler`       | Bounded wait for page URL or pathname matching.                                                                                  | `READ_ONLY` |
| `WAIT_FOR_LOAD_STATE`      | `WaitForLoadStateActionHandler` | Bounded wait for document lifecycle (`load`, `domcontentloaded`, `networkidle`).                                                 | `READ_ONLY` |

---

## 4. Architecture & Handlers Hierarchy

```text
packages/core/src/execution/actions/
├── action-types.ts                      # Context, bounds, interfaces
├── action-errors.ts                     # Strongly typed domain error classes
├── locator-resolver.ts                  # Integrates Phase 64 TargetValidator, ScopeResolver & StrategyResolver
├── action-handler-registry.ts           # Registry mapping ActionType -> IActionHandler
├── action-execution-service.ts          # Central authoritative dispatcher & sequence runner
├── index.ts                             # Public exports & getActionExecutionService factory
└── action-handlers/
    ├── base-action-handler.ts           # State checks, timeout resolution, timing, error mapping, redaction
    ├── navigate-action-handler.ts       # NAVIGATE
    ├── click-action-handler.ts          # CLICK, DOUBLE_CLICK
    ├── fill-action-handler.ts           # FILL, TYPE, CLEAR
    ├── press-key-action-handler.ts      # PRESS
    ├── select-option-action-handler.ts  # SELECT, SELECT_OPTION
    ├── check-action-handler.ts          # CHECK, UNCHECK
    ├── hover-action-handler.ts          # HOVER
    ├── focus-blur-action-handler.ts     # FOCUS, BLUR
    ├── scroll-action-handler.ts         # SCROLL
    ├── scroll-into-view-action-handler.ts # SCROLL_INTO_VIEW
    ├── upload-action-handler.ts         # UPLOAD, UPLOAD_FILE
    ├── drag-and-drop-action-handler.ts  # DRAG_AND_DROP
    ├── history-action-handler.ts        # GO_BACK, GO_FORWARD, RELOAD
    └── wait-action-handler.ts           # WAIT_FOR_STATE, WAIT_FOR_ELEMENT, WAIT_FOR_URL, WAIT_FOR_LOAD_STATE
```

---

## 5. Security & Safety Controls

1. **Path Traversal Protection**:
   - File uploads reject `..`, `../`, `..\`, `/etc/passwd`, `C:\Windows\...`, and enforce `MAX_UPLOAD_SIZE_BYTES = 25MB`.
2. **Navigation Policy**:
   - Rejects `javascript:`, `file:`, `data:`. Enforces environment base URL origin matching for absolute URLs.
3. **Password & Secret Redaction**:
   - Any field flagged as `SECRET_REFERENCE` or matching password patterns is redacted to `[REDACTED]` in summaries and logs.
4. **Cooperative Cancellation**:
   - Checked before and between step executions via `AbortSignal`.
5. **IPC Security Boundary**:
   - Main process validates `isTrustedIpcSender`, top-level frame origin, and Zod schemas before service dispatch.

---

## 6. IPC Channels & Preload Contract

- `DESKTOP_CHANNELS.EXECUTION_EXECUTE_ACTION` (`desktop:execution:execute-action`)
- `DESKTOP_CHANNELS.EXECUTION_EXECUTE_STEP` (`desktop:execution:execute-step`)

Exposed in `window.desktop.actions`:

- `executeAction(input: ExecuteActionInputDto): Promise<DesktopResult<ActionResultDto>>`
- `executeStep(input: ExecuteStepInputDto): Promise<DesktopResult<StepExecutionResultDto>>`
