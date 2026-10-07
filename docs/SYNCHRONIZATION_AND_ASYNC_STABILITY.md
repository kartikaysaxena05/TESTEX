# V5 Phase 66 — Navigation, Waiting, Synchronization & Async Stability

## 1. Executive Overview

The **Navigation, Waiting, Synchronization & Async Stability Engine** ensures that autonomous browser execution across modern asynchronous web applications is deterministic, state-driven, resilient, and independent of arbitrary fixed timing assumptions.

```text
Validated Executable Step
        ↓
Browser Action Engine (Phase 65)
        ↓
Synchronization Coordinator (Phase 66)
        ├── Pre-Action Element Readiness (attached, visible, enabled, editable, stable)
        ├── Race-Safe Event Pre-Registration (navigation, popups, targeted responses)
        ├── Deterministic Playwright Interaction (Actionability enforced, force: false)
        ├── Post-Action Application State Observation (URL, routes, loading indicators)
        └── Bounded Step Time Budgeting & Cancellation Support
        ↓
Structured Synchronization Result
        ↓
Step Continues
```

---

## 2. Core Principles & Architectural Invariants

1. **State, Not Time**:
   - Synchronization strictly awaits explicit application states (e.g. URL match, locator visibility/enabledness, matching API response receipt, spinner disappearance) rather than arbitrary timing assumptions (`page.waitForTimeout` / `setTimeout`).
2. **Race-Condition Free Pre-Registration**:
   - Event listeners for navigation, popups/new tabs, and targeted API responses are registered _prior_ to executing the triggering user interaction, ensuring that even sub-millisecond responses or fast redirects are reliably captured.
3. **No Universal NetworkIdle**:
   - Blanket `networkidle` waits are strictly avoided so that applications using WebSockets, Server-Sent Events, background analytics, or long-polling do not cause platform execution to hang.
4. **Zero Arbitrary JavaScript / Eval**:
   - Custom synchronization conditions use a strictly bounded, allowlisted typed vocabulary (`0 eval / Function / page.evaluate(userInput)`).
5. **Budgeted Monotonic Deadlines**:
   - Nested waits (pre-action check + action + post-action synchronization) are bound by `TimeoutBudgetTracker` to prevent multi-phase timeouts from compounding linearly beyond the enclosing step budget.
6. **Cooperative Cancellation**:
   - Cancellation signals (`AbortSignal`) are checked before and throughout all asynchronous polling loops and event listeners.
7. **Secret Redaction**:
   - Credentials, tokens, and sensitive query parameters are masked (`[REDACTED]`) from logs, error messages, and URL patterns.

---

## 3. Supported Synchronization Strategies

| Strategy                   | Component                    | Description                                                                                                                 |
| -------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `AUTO`                     | `SynchronizationCoordinator` | Infers the optimal strategy based on provided target, URL pattern, response matcher, or load state.                         |
| `ELEMENT`                  | `ElementReadinessEvaluator`  | Awaits element readiness: `ATTACHED`, `DETACHED`, `VISIBLE`, `HIDDEN`, `ENABLED`, `DISABLED`, `EDITABLE`, `STABLE`.         |
| `NAVIGATION` / `PAGE_LOAD` | `NavigationMonitor`          | Awaits document navigation to reach `load`, `domcontentloaded`, or `commit` state.                                          |
| `URL`                      | `NavigationMonitor`          | Awaits matching URL (exact, glob `**/*`, pathname, or regex) for SPA route transitions or redirects.                        |
| `NETWORK` / `RESPONSE`     | `NetworkObserver`            | Awaits targeted HTTP request/response matching method, URL pattern, and HTTP status code.                                   |
| `LOADING_STATE`            | `LoadingStateObserver`       | Awaits disappearance of loading spinners, skeletons, progress bars, or `[aria-busy="true"]`.                                |
| `POPUP` / `NEW_PAGE`       | `PopupObserver`              | Captures newly opened popup windows or tabs and binds them to the execution context.                                        |
| `CUSTOM_CONDITION`         | `SynchronizationCoordinator` | Dispatches bounded safe conditions (`LOCATOR_STATE`, `URL_MATCH`, `TEXT_APPEARS`, `RESPONSE_OCCURS`, `LOADING_DISAPPEARS`). |

---

## 4. Timeout Hierarchy & Precedence

1. **Step-Level Override**: `step.timeoutMs` or `options.timeoutMs`.
2. **Strategy/Action Specific Override**: `responseMatcher.timeoutMs` or `customCondition.timeoutMs`.
3. **Environment Policy**: `policyConfig.actionTimeoutMs`, `policyConfig.navigationTimeoutMs`.
4. **Platform Bounded Defaults**:
   - Default Action / Element Timeout: `15,000ms`
   - Default Navigation Timeout: `30,000ms`
   - Default Popup Timeout: `15,000ms`
   - Default Response Timeout: `20,000ms`
   - Default Loading State Timeout: `15,000ms`
   - Minimum Bound: `100ms`
   - Maximum Bound: `120,000ms`

---

## 5. Security & Isolation Controls

- **Project Ownership Verification**: Session project ID must strictly match requested project ID (`CrossRunExecutionError`).
- **Sender Validation**: IPC invocations require top-level frame origin (`isTrustedIpcSender`).
- **Secret Redaction**: URLs, error messages, and request patterns pass through `SecretRedactor`.
- **Zero Raw Playwright Objects in Renderer**: All IPC interfaces return typed DTOs (`SynchronizationResultDto`).
