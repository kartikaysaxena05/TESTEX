# V9 Phase 138 — AI Provider Switching & Fallback Documentation

## Executive Summary
V9 Phase 138 implements a production-grade AI Provider Routing and Fallback architecture for the V9 AI Runtime. It enables seamless provider selection, failure detection, bounded retry loops for transient network interruptions, and safe fallback across eligible local and remote providers, while strictly maintaining project privacy guarantees (`LOCAL_ONLY` mode).

---

## Architecture Overview

```text
                  AI Generation / Streaming Request
                                ↓
                    AiProviderRouterService
                                ↓
        Deterministic Selection (Primary Provider & Model)
                                ↓
                Privacy Guard Policy Verification
         (If LOCAL_ONLY, external cloud targets strictly blocked)
                                ↓
                    Provider Execution Attempt
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
              Success                       Failure
                 │                             │
          Return Response          Classify Error Reason
                                   (Transient vs Fatal vs Policy/User Cancel)
                                               │
                                 ┌─────────────┴─────────────┐
                                 ▼                           ▼
                           Transient Error           Fatal / Provider Down
                          (Bounded Retries)           (Evaluate Fallback)
                                 │                           │
                         Retry Same Provider     Fallback Policy Evaluation:
                                                 - DISABLED: Fail immediately
                                                 - LOCAL_ONLY: Local backup only
                                                 - CONFIGURED: Configured list
                                                 - ANY_ALLOWED: Any compliant
                                                             │
                                                  Route to Backup Provider
                                                  (Preserve Request Continuity)
```

---

## Key Capabilities & Invariants

### 1. Centralized Provider Registry
* Exposes registered provider metadata:
  * `providerId`: Uppercase identifier (e.g., `OLLAMA`, `OPENAI`, `EMULATED`).
  * `displayName`: Human-readable title.
  * `enabled`: Boolean toggle.
  * `available`: Operational health state (`READY`).
  * `isLocal`: Local vs Cloud indicator.
  * `priority`: Integer priority ranking.
  * `capabilities`: Streaming, structured output, system messages, token usage.
  * `models`: Discovered models on the provider.

### 2. Deterministic Provider Selection
* Resolves provider according to:
  1. Explicit user/caller preference.
  2. Health check availability (`READY`).
  3. Required capability satisfaction (e.g., streaming, structured output).
  4. Privacy policy restrictions (`LOCAL_ONLY` vs `REMOTE_ALLOWED`).
  5. Configured provider priority.

### 3. Fallback Policies
* `DISABLED`: Fails immediately on primary provider failure without attempting fallback.
* `LOCAL_ONLY`: Falls back only to other registered local providers (e.g. secondary local Ollama instances or local engines). Cloud providers are rejected even if configured.
* `CONFIGURED_PROVIDERS`: Follows the explicit priority chain specified in `fallbackPriority`.
* `ANY_ALLOWED_PROVIDER`: Attempts any healthy registered provider permitted by the active privacy firewall.

### 4. Failure Classification & Retry Handling
* **Classification**:
  * `PROVIDER_UNAVAILABLE`: Connection refused, network drops.
  * `PROVIDER_TIMEOUT`: Request timeout exceeded.
  * `MODEL_UNAVAILABLE`: Model missing on provider host.
  * `AUTHENTICATION_FAILURE`: 401/403 or invalid credentials.
  * `RATE_LIMITED`: Provider throttle.
  * `CAPABILITY_UNSUPPORTED`: Provider lacks required feature.
  * `INVALID_RESPONSE`: Malformed provider response.
  * `STRUCTURED_OUTPUT_FAILURE`: Schema validation error.
  * `STREAM_INTERRUPTED`: Mid-stream disconnect.
  * `CANCELLED`: User abort signal triggered.
  * `POLICY_BLOCKED`: Privacy violation or disabled fallback.
* **Transient Retries**:
  * Providers with transient failures are retried up to `maxRetries` with linear bounded backoff before triggering a fallback.
* **User Cancellation Integrity**:
  * Cancellations via `AbortSignal` are explicitly classified as `CANCELLED` and **never** trigger provider fallback or count as provider defects.

### 5. Safe Streaming Fallback
* If a failure occurs **before** any token emission, the router switches seamlessly to the next eligible fallback provider.
* If a failure occurs **mid-stream** after partial tokens have reached the user, the stream terminates cleanly with an explicit error event. Tokens from different models are never silently stitched or concatenated together.

### 6. Observability & Audit Trail
* Database schema audit events:
  * `AI_PROVIDER_ROUTED`: Logged upon provider selection.
  * `AI_PROVIDER_FALLBACK_TRIGGERED`: Logged when routing to a backup provider.
  * `AI_PROVIDER_ATTEMPT_FAILED`: Logged when an attempt on a provider fails.
  * `AI_FALLBACK_POLICY_UPDATED`: Logged when fallback configurations change.

---

## Desktop UI & IPC Integration

* **Desktop Bridge & IPC**:
  * Channel: `desktop:ai-fallback:get-policy` (`AI_FALLBACK_GET_POLICY`)
  * Channel: `desktop:ai-fallback:set-policy` (`AI_FALLBACK_SET_POLICY`)
  * Channel: `desktop:ai-providers:list` (`AI_PROVIDERS_LIST`)
  * Channel: `desktop:ai-providers:status` (`AI_PROVIDERS_STATUS`)
  * Channel: `desktop:ai-providers:select` (`AI_PROVIDERS_SELECT`)
* **Renderer Component**:
  * `AiFallbackSettingsCard.tsx` provides live provider health cards, policy selectors, retry bound adjustments, and warnings if remote fallback is selected while `LOCAL_ONLY` privacy mode is active.

---

## Verification & Test Results
* **Certification Suite**: `packages/core/src/ai-provider/certification/v9-phase138-certification.test.ts`
  * 10 out of 10 invariants verified (100% pass).
* **Preload Integration**: `apps/desktop/src/preload/preload.test.ts`
  * Preload bridge methods verified.
* **Total AI Provider Tests**: 195 tests passing across 60 test suites with 0 failures and 0 regressions.
