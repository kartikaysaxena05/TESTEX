# Autonomous Web Testing & Execution Domain

## Version 5 Architecture & Playwright Runtime Foundation

```text
+-----------------------------------------------------------------------------------+
|                            RENDERER PROCESS (REACT UI)                            |
|  - Strictly sandboxed, zero Node integration, context isolation enabled           |
|  - Interacts exclusively via strongly typed window.desktop.execution bridge       |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | Typed IPC Invocation (Validated Frame)
                                          v
+-----------------------------------------------------------------------------------+
|                         ELECTRON MAIN PROCESS / SECURE IPC                        |
|  - isTrustedIpcSender() frame & origin enforcement                                |
|  - Zod payload validation (schema conformance & parameter bounds)                 |
|  - Error sanitization & correlation tracking                                      |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | Privileged Domain Method Call
                                          v
+-----------------------------------------------------------------------------------+
|                       CORE EXECUTION DOMAIN (@ai-quality/core)                     |
|                                                                                   |
|  1. TestEligibilityValidator                                                      |
|     - Multi-tenant project boundary checking                                      |
|     - V4 review governance gating (reviewStatus === 'APPROVED')                   |
|     - Execution suitability filtering (AUTOMATED vs MANUAL)                       |
|     - Requirement version staleness verification (sourceVersion vs currentVersion)|
|                                                                                   |
|  2. ExecutionRuntimeRegistry                                                      |
|     - Active execution tracking by UUID                                           |
|     - Idempotent cleanup guarantees                                               |
|     - Process beforeExit & uncaughtException safety hooks                         |
|                                                                                   |
|  3. PlaywrightBrowserProvider (IBrowserRuntimeProvider)                           |
|     - Programmatic Chromium launch via official Playwright SDK                    |
|     - Security flag sanitizer (blocks --no-sandbox, --disable-web-security, etc.)  |
|     - Ephemeral, isolated BrowserContext & Page creation per test run             |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | Controlled Process Lifecycle
                                          v
+-----------------------------------------------------------------------------------+
|                      PLAYWRIGHT CHROMIUM BROWSER INSTANCE                         |
|  - Headless/Headed Chromium (Chrome for Testing 151.0.7922.34)                   |
|  - Deterministic DOM manipulation, local HTML fixture evaluation                  |
|  - Precise millisecond timing metrics                                             |
+-----------------------------------------------------------------------------------+
```

---

## 1. Executive Purpose & Governance Model

Phase 58 establishes the fundamental execution domain architecture and Playwright browser runtime foundation for Version 5.

While Version 4 answers **"What tests should exist?"** through AI generation, RAG grounding, and human review governance, Version 5 answers:

> **"How do approved tests execute deterministically against real browsers without hallucination or security compromise?"**

### Strict Governance Rules:

1. **Approved Tests Only**: Tests in `DRAFT`, `IN_REVIEW`, `REJECTED`, or `MANUAL` suitability states are strictly prohibited from autonomous execution.
2. **Staleness Gating**: If a requirement evolves to version $N+1$ while a test case remains pinned to version $N$, the test is marked `STALE` and barred from execution until reconciled.
3. **No Direct LLM Prose Execution**: The platform never passes natural language prompts directly to a browser to "click whatever it thinks." All executions require structured, approved test definitions compiled into deterministic steps.
4. **Tenant Isolation**: Cross-project test execution attempts are rejected immediately at the domain validator boundary with `ExecutionProjectMismatchError`.

---

## 2. Playwright Runtime Architecture

### Runtime Placement

The browser execution runtime is housed entirely in the privileged `@ai-quality/core` domain behind Electron's secure IPC boundary. The renderer has zero direct access to Playwright, Node processes, or child processes.

### Package & Binary Specifications

- **Engine**: Official `playwright` (`1.62.1`) programmatic driver.
- **Browser**: Chromium (`Chrome for Testing 151.0.7922.34`).
- **Isolation Model**: Each test run creates an isolated `BrowserContext` with independent cookies, cache, and local storage, followed by a dedicated `Page`.
- **Zero Network Dependency**: Deterministic runtime smoke tests execute locally against in-memory HTML fixtures without external internet dependencies.

---

## 3. Resource Management & Idempotent Cleanup

To prevent orphaned Chromium processes and memory leaks in long-running desktop sessions:

1. **Try/Finally Lifecycle**: Every execution and smoke verification wraps browser allocation in `try / finally` blocks ensuring teardown even under assertion or runtime exceptions.
2. **ExecutionRuntimeRegistry**: Tracks all live `IExecutionContext` references by execution UUID.
3. **Idempotency**: Calling `cleanup()` multiple times on the same execution ID is completely safe and returns without throwing.
4. **Shutdown Hooks**: `process.on('beforeExit')` and `process.on('exit')` hooks ensure any dangling browser processes are terminated when the desktop app closes.

---

## 4. Security & Hardening Measures

### Browser Launch Argument Filtering

Any attempt to pass disallowed or unsafe browser flags is blocked with `ExecutionSecurityViolationError`. Blocked flags include:

- `--no-sandbox`
- `--disable-web-security`
- `--remote-debugging-port`
- `--disable-gpu-sandbox`
- `--allow-running-insecure-content`
- `--single-process`
- `--unsafely-treat-insecure-origin-as-secure`

### Electron IPC Invariants

- **Frame Validation**: `isTrustedIpcSender()` verifies the IPC event originates exclusively from the top-level window frame matching the authorized `app://renderer` origin.
- **Payload Validation**: All IPC payloads are validated against strict Zod schemas (`runtimeSmokeInputSchema`, `validateTestEligibilityInputSchema`, `executionRequestSchema`).
- **Error Sanitization**: File system paths and internal stack traces are scrubbed before returning `DesktopResult<T>` envelopes to the renderer.

---

## 5. Phase 58 Public API & IPC Channels

### IPC Channels

| Channel                         | Input DTO                         | Result DTO                 | Description                                                                  |
| ------------------------------- | --------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `execution:getCapabilities`     | `void`                            | `ExecutionCapabilitiesDto` | Queries installed Playwright runtime version and browser readiness           |
| `execution:runRuntimeSmoke`     | `RuntimeSmokeInputDto?`           | `RuntimeSmokeResultDto`    | Runs a real Chromium smoke test against a local fixture with precise timings |
| `execution:validateEligibility` | `ValidateTestEligibilityInputDto` | `TestEligibilityDto`       | Evaluates V4 approval status, suitability, and staleness rules               |

### Preload Desktop Bridge API (`window.desktop.execution`)

```typescript
interface DesktopBridge {
  readonly execution: {
    readonly getCapabilities: () => Promise<DesktopResult<ExecutionCapabilitiesDto>>;
    readonly runRuntimeSmoke: (
      input?: RuntimeSmokeInputDto,
    ) => Promise<DesktopResult<RuntimeSmokeResultDto>>;
    readonly validateEligibility: (
      input: ValidateTestEligibilityInputDto,
    ) => Promise<DesktopResult<TestEligibilityDto>>;
  };
}
```

---

## 6. Verification Status

| Verification Category           | Suites         | Tests           | Status          |
| ------------------------------- | -------------- | --------------- | --------------- |
| Request Validation & Schemas    | 3 suites       | 12 tests        | PASSED          |
| Domain Errors & Sanitization    | 1 suite        | 14 tests        | PASSED          |
| Runtime Registry & Idempotency  | 1 suite        | 3 tests         | PASSED          |
| Test Eligibility & Governance   | 1 suite        | 6 tests         | PASSED          |
| Real Playwright Browser Smoke   | 1 suite        | 4 tests         | PASSED          |
| Sequential Service Execution    | 1 suite        | 5 tests         | PASSED          |
| Main IPC Security & Handlers    | 1 suite        | 6 tests         | PASSED          |
| Adversarial Injection Attacks   | 2 suites       | 10 tests        | PASSED          |
| **Total Phase 58 Test Suite**   | **13 suites**  | **61 tests**    | **100% PASSED** |
| **Full V1–V5 Regression Suite** | **305 suites** | **1,160 tests** | **100% PASSED** |

---

## 7. Roadmap & Next Phase

- **Phase 58 (Current)**: Test Execution Domain & Playwright Runtime Foundation — **COMPLETE / CERTIFIED**
- **Phase 59 (Next)**: Target Environment Configuration & Dynamic Base URL Resolution
- **Phase 60**: Executable Plan Compiler (V4 Steps to Structured Actions)
- **Phase 61**: Test Execution Queue & Sequential Run Orchestrator
