# V5 Phase 70 — Screenshot, Console, Network, DOM & Playwright Trace Collection

## Architectural Specification & Technical Report

**Platform**: AI-Driven Software Quality Engineering Platform  
**Phase**: V5 Phase 70 — Screenshot, Console, Network, DOM & Playwright Trace Collection  
**Date**: August 2026  
**Status**: COMPLETE / CERTIFIED / FROZEN

---

## 1. Executive Summary & Architectural Invariant

Phase 70 implements the concrete browser evidence collection subsystem for the Autonomous Web Testing & Execution platform. Building directly on top of the durable Phase 69 Evidence Foundation, Phase 70 captures real Playwright browser context data during step and assertion failures.

### The Fundamental Execution Invariant

$$\text{Evidence collection is a SUPPORTING subsystem — it NEVER decides or mutates the test execution outcome.}$$

- If an action or assertion fails $\rightarrow$ Test execution is authoritative `FAILED`.
- If screenshot, console, network, DOM, or trace collection subsequently fails (or times out) $\rightarrow$ The evidence bundle is truthfully recorded as `PARTIAL` or `FAILED`, but the test execution status remains `FAILED`.
- Successfully capturing evidence never converts a failed test into `PASSED`.

```
+---------------------------------------------------------------------------------------------------------+
|                                    TEST EXECUTION FAILURE PIPELINE                                      |
+---------------------------------------------------------------------------------------------------------+
|  Action / Assertion Failure (ActionExecutionService / AssertionEngine)                                  |
|         |                                                                                               |
|         v                                                                                               |
|  EvidenceCaptureCoordinator.captureFailureEvidence(...)                                                 |
|         |                                                                                               |
|         +---> ScreenshotCollector     ---> PNG Buffer (Sensitive Inputs Masked)                         |
|         +---> ConsoleCollector        ---> Bounded Ring Buffer JSON / Text (Logs + Page Errors)        |
|         +---> NetworkCollector        ---> Bounded HTTP Requests / Responses (Auth & Queries Redacted) |
|         +---> DomCollector            ---> Sanitized HTML Snapshot (Passwords Masked, Bounded Size)     |
|         +---> TraceCollector          ---> Playwright Zip Trace (Failure Staged & Promoted)            |
|         |                                                                                               |
|         v                                                                                               |
|  ExecutionEvidenceService                                                                               |
|         |                                                                                               |
|         +---> EvidenceStorageService  ---> Managed Read-Only (0o444) Artifacts Stored Under SHA-256     |
|         +---> PostgreSQL Database     ---> ExecutionEvidenceBundle (COMPLETE/PARTIAL) + Artifact Rows   |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Concrete Evidence Collectors

### 2.1. Screenshot Collector (`ScreenshotCollector`)

- **API**: `IScreenshotCollector` (`captureFailureScreenshot`, `captureStepScreenshot`).
- **Defensive Masking**: Temporarily injects an evidence-only `<style id="__ai_quality_evidence_mask_style__">` applying `filter: blur(10px) !important; color: transparent !important;` to sensitive selectors (`input[type="password"]`, `[data-sensitive="true"]`, etc.) before capturing the screenshot, and guarantees cleanup in a `finally` block.
- **Safety**: Wrapped with timeout protection (default 5,000ms) and handles closed/crashed pages gracefully by returning `{ success: false, errorMessage: ... }` without throwing unhandled exceptions.

### 2.2. Console Collector (`ConsoleCollector`)

- **API**: `IConsoleCollector` (`attach`, `attachContext`, `detach`, `getEvents`, `getPageErrors`, `serialize`).
- **Categorization**: Distinguishes standard console messages (`log`, `info`, `warn`, `error`, `debug`, `trace`) from uncaught page exceptions (`pageerror`).
- **Bounded FIFO Ring Buffer**: Enforces strict memory caps (default 500 events, max 100 page errors) and flags `isTruncated = true` when oldest events are evicted.
- **Secret Redaction**: Redacts sensitive keywords, passwords, tokens, Bearer auth headers, and query strings in log text and stack traces.

### 2.3. Network Collector (`NetworkCollector`)

- **API**: `INetworkCollector` (`attach`, `attachContext`, `detach`, `getEvents`, `serialize`).
- **Request & Response Tracking**: Records HTTP method, URL, status code, timing/duration, resource type, and failure reasons (DNS, connection reset, aborted, timeout).
- **Header & Query Redaction**: Redacts `Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`, `api_key`, `token`, `secret`, and sensitive URL query parameters to `***`.
- **Bounded Body Policy**: Optional text/JSON payload capture strictly capped at 64KB with `isBodyTruncated` indicator.
- **Bounded FIFO Ring Buffer**: Evicts oldest events after 500 events to prevent memory leakage.

### 2.4. DOM Snapshot Collector (`DomCollector`)

- **API**: `IDomCollector` (`captureDomSnapshot`).
- **Page State & Element Context**: Captures document title, URL, viewport dimensions, active element details, and failed locator / target context.
- **DOM Sanitization**: Masks `input[type="password"]` values to `***`, masks sensitive autocomplete and data attributes (`data-token`, `data-secret`, `data-auth`, `data-key`).
- **Size Bounds**: Strictly bounds serialized HTML (default 512KB) and appends `<!-- [TRUNCATED DUE TO SIZE LIMIT] -->` when exceeded.

### 2.5. Playwright Trace Collector (`TraceCollector`)

- **API**: `ITraceCollector` (`startTracing`, `stopAndPersistTrace`, `discardTrace`).
- **Trace Modes**:
  - `OFF`: Tracing disabled.
  - `FAILURE_ONLY` (default): Starts tracing; if test passes, trace is discarded with zero disk footprint; if test fails, trace is stopped, read into buffer, and promoted to managed evidence storage.
  - `ALWAYS`: Retains and persists trace for both passing and failing runs.
- **Staging Cleanup**: Automatically removes temporary staging files from disk upon completion or failure.

---

## 3. Evidence Capture Coordinator (`EvidenceCaptureCoordinator`)

- **Session Initialization**: Attaches console and network listeners to `BrowserContext` and `Page`, and starts Playwright tracing if configured.
- **Concurrent Collection on Failure**: Executes screenshot, console serialization, network serialization, DOM capture, and trace capture in parallel using `Promise.allSettled`.
- **Status Determination**: Marks the bundle `COMPLETE` if all requested collectors succeed; marks `PARTIAL` if any non-critical collector encounters an issue; marks `FAILED` if critical storage errors occur.
- **Lifecycle Cleanliness**: `dispose()` unhooks all event listeners and clears in-memory buffers.

---

## 4. Integration into Browser Execution Lifecycle

1. **`BrowserSessionManager`**: Instantiates and attaches `EvidenceCaptureCoordinator` to `BrowserExecutionSession` during `createSession`, initializing trace and listeners immediately on context creation, and disposing listeners on `closeSession`.
2. **`ActionExecutionService`**: On step action or assertion failure in `executeStep`, automatically invokes `session.evidenceCoordinator.captureFailureEvidence(...)` to bundle failure artifacts bound to the step and execution.

---

## 5. Desktop IPC & Preload Bridge

A secure desktop bridge method allows the renderer UI to inspect evidence artifact content safely:

- **Channel**: `desktop:evidence:get-artifact-content` (`DESKTOP_CHANNELS.EVIDENCE_GET_ARTIFACT_CONTENT`)
- **Input Schema**: `getEvidenceArtifactContentInputSchema` (`{ projectId: string, artifactId: string }`)
- **Output DTO**: `EvidenceArtifactContentDto` (`{ id, projectId, artifactType, mimeType, byteSize, sha256, content, isBase64 }`)
- **Preload API**: `window.desktop.evidence.getArtifactContent({ projectId, artifactId })`
- **Security**: Strict origin validation (`isTrustedIpcSender`), multi-tenant project isolation, and binary-to-base64 encoding for safe IPC transmission.

---

## 6. Verification Results & Quality Metrics

```text
================================================================================
VERIFICATION SUMMARY — V5 PHASE 70
================================================================================
1. Dedicated Evidence Collectors Tests (npm run test:evidence-collectors):
   - 7 test suites, 25 tests, 0 failures (100% passing)

2. Complete Evidence Subsystem Tests (npm run test:evidence):
   - 10 test suites, 59 tests, 0 failures (100% passing)

3. Monorepo Regression Test Suite (npm test):
   - 236 test suites, 1,528 tests, 0 failures (100% passing)

4. TypeScript Static Typecheck (npm run typecheck):
   - 0 errors (100% clean)

5. ESLint Static Analysis (npm run lint):
   - 0 errors (100% clean)

6. Code Formatting (npm run format:check):
   - 100% compliant with Prettier style

7. Desktop Smoke Test (npm run desktop:smoke):
   - PASSED

8. Desktop Production Build (npm run desktop:build):
   - PASSED (Preload bundled to dist/preload/index.cjs, 312.9kb)
================================================================================
```
