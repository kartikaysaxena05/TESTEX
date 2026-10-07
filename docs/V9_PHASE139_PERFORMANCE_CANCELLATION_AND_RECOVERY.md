# V9 Phase 139 — Performance, Cancellation & Runtime Recovery

## Executive Summary

Phase 139 hardens the V9 AI runtime for reliable local execution with Ollama. It establishes robust lifecycle tracking, deterministic cooperative request cancellation, granular stream inactivity timeouts, bounded concurrency safeguards, and application restart crash recovery without fabricating synthetic responses or violating project boundaries and privacy policies.

---

## Architecture & Core Invariants

### 1. Deterministic Request Lifecycle
Every AI request transitions through a clear lifecycle state machine:
```
QUEUED ──> STARTING ──> RUNNING ──> STREAMING ──> COMPLETED
  │           │           │            │
  └───> CANCELLED / TIMEOUT / PROVIDER_ERROR / MODEL_ERROR / INTERRUPTED
```
- Each request has a unique `requestId` (UUIDv4) persisted in SQLite via `AiGenerationRequest`.
- Final states (`COMPLETED`, `CANCELLED`, `TIMEOUT`, `PROVIDER_ERROR`, `INTERRUPTED`) are immutable.

### 2. Cooperative Cancellation & Isolation
- Each request is allocated a dedicated `AbortController`.
- Cancellation propagates directly to provider HTTP streams and client handles via `abortController.abort()`.
- Cancelling request A has zero impact on concurrent request B or shared Ollama provider health.
- User cancellation is never classified as a provider or model failure.
- Repeated cancellations are safe and idempotent.
- An `AI_REQUEST_CANCELLED` audit log is recorded without plaintext prompt disclosure.

### 3. Granular Timeout Management
Instead of an aggressive global timeout, the engine decomposes timeouts into:
- Startup timeout: Waiting for model initialization or Ollama queue.
- Request timeout: Bounded generation wall-clock time.
- Stream inactivity timeout: Heartbeat timer reset on each token arrival. If chunk arrival stalls past threshold, `AiStreamTimeoutError` trips and aborts the stream.

### 4. Concurrency Guard & Queue Protection
- Configurable bounded concurrency (`maxConcurrentRequests = 5`).
- Saturated attempts immediately fail fast with `AiConcurrencyLimitExceededError` to prevent process deadlock and memory starvation.

### 5. Application Crash & Restart Recovery
- If the application restarts or crashes while generation was active (`QUEUED`, `STARTING`, `RUNNING`, `STREAMING`), the runtime recovery engine transitions orphaned requests to `INTERRUPTED`.
- The engine never fabricates partial or complete text for interrupted generations.

---

## Surface Area Implemented

1. **Prisma & Database Schema:**
   - `enum AiGenerationRequestState`
   - `model AiGenerationRequest`
   - Actions in `AuthAuditAction`: `AI_REQUEST_STARTED`, `AI_REQUEST_CANCELLED`, `AI_REQUEST_TIMED_OUT`, `AI_REQUEST_RECOVERED`.

2. **Core AI Provider Layer (`packages/core`):**
   - `AiLifecycleManager`: Tracks handles, manages inactivity timeouts, enforces concurrency, computes runtime metrics, executes restart recovery.
   - `AiStreamTimeoutError`, `AiRuntimeRecoveryRequiredError`, `AiConcurrencyLimitExceededError`.
   - `LocalGenerationRuntimeService` & `AiProviderService` integration.

3. **Desktop IPC Bridge & UI (`apps/desktop`):**
   - Channels:
     - `desktop:ai:lifecycle:get-active`
     - `desktop:ai:lifecycle:get-metrics`
     - `desktop:ai:lifecycle:recover-interrupted`
   - Exposed on `window.desktop.aiLifecycle`.
   - UI Component: `AiRuntimeRecoveryCard.tsx` with live active request monitoring, cancel triggers, latency metrics, and crash recovery buttons.

---

## Verification & Certification

All 10 Phase 139 certification tests passed in `packages/core/src/ai-provider/certification/v9-phase139-certification.test.ts`:
1. Request Lifecycle State Progression (`QUEUED -> RUNNING -> STREAMING -> COMPLETED`)
2. Real Cancellation Propagation & AbortController Signal
3. Repeated Cancellation Safety (Idempotent, No Errors)
4. Cancellation Isolation Between Concurrent Requests
5. Stream Inactivity Timeout Management
6. Concurrency Guard Bounds Active Requests
7. Startup Crash Recovery Transitions In-Flight Requests to `INTERRUPTED`
8. Accurate Runtime Performance Metrics Computation
9. Multi-Tenant Project Isolation and Active Request Listing
10. Real Ollama Integration with Generation & Cancellation (Verified against local `qwen2.5-coder:7b`)

Regression test suites for Phase 137, Phase 138, and Phase 139 executed concurrently with **27/27 tests passing**.
Preload bridge unit tests verified `window.desktop.aiLifecycle` methods with 100% success.
