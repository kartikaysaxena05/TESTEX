# V9 Phase 130 — Local Model Chat & Generation Runtime

## 1. Overview & Objective

Phase 130 establishes the production-grade local AI generation runtime for the V9 architecture, connecting V8 Project Context through the V9 AI Provider abstraction (`IAiProvider`), Ollama local provider (`OllamaProviderAdapter`), and installed local models discovered and selected in Phases 128–129 to produce normalized, deterministic AI responses.

### Key Goals Achieved
- **Single Source of Truth**: Reuses existing `IAiProvider`, `OllamaProviderAdapter`, `OllamaDiscoveryService`, and `ModelSelectionService`. No duplicate Ollama clients or secondary provider stacks created.
- **Robust Pipeline**: `V8 Project Context` → `V9 AI Provider` → `Ollama` → `Selected Local Model` → `Normalized AI Response`.
- **Cooperative Cancellation**: `AbortController` propagation cancels active in-flight requests at both runtime and HTTP transport layers.
- **Bounded Project Context**: Strict context hygiene (max 20,000 chars per section, 50,000 chars total budget) with tenant isolation checks.
- **Deterministic Lifecycle Tracking**: Explicit transitions (`IDLE` → `RUNNING` → `COMPLETED` / `CANCELLED` / `TIMEOUT` / `PROVIDER_ERROR` / `INVALID_RESPONSE`).
- **Standardized Error Hierarchy**: Clear mapping to typed gateway errors with sanitized error messages.
- **Desktop Verification UI**: Playground card with model selector, parameters, status badges, response viewer, and cancel button.

> **Scope Boundary Compliance**:
> Phase 130 strictly implements single-turn prompt generation. It does **not** implement autonomous agents, multi-step planning loops, terminal agents, autonomous coding, patch repair, or tool calling loops. Those capabilities belong strictly to V10.

---

## 2. Architecture & Service Flow

```text
                  ┌──────────────────────────────────────────────┐
                  │          Renderer / Application UI           │
                  │        (LocalGenerationPlaygroundCard)       │
                  └──────────────────────┬───────────────────────┘
                                         │ window.desktopBridge.aiGeneration
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │       Desktop Main IPC & Security Gate       │
                  │  (isTrustedIpcSender, assertAuthenticated)   │
                  └──────────────────────┬───────────────────────┘
                                         │ handleLocalGenerate / handleCancelGeneration
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │         AiProviderService (facade)           │
                  │           generateLocal() / cancel()         │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │        LocalGenerationRuntimeService         │
                  │   - Multi-tenant Project Verification        │
                  │   - Context Formatting & Size Guardrails     │
                  │   - Provider Operational Readiness Check     │
                  │   - Model Verification & Auto-Resolution     │
                  │   - Lifecycle State Management (Active Map)  │
                  │   - AbortController & Timeout Race           │
                  │   - Secret Redaction & Token Normalization   │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │            OllamaProviderAdapter             │
                  │         (IAiProvider.generate)               │
                  └──────────────────────┬───────────────────────┘
                                         │ HTTP POST /api/generate (with signal)
                                         ▼
                              Ollama Local Daemon
                            (http://127.0.0.1:11434)
```

---

## 3. Core Components & Implementations

### 3.1 Contracts & Schemas (`packages/contracts`)
- **IPC Channels**:
  - `desktop:ai:generation:generate` (`DESKTOP_CHANNELS.AI_GENERATION_GENERATE`)
  - `desktop:ai:generation:cancel` (`DESKTOP_CHANNELS.AI_GENERATION_CANCEL`)
  - `desktop:ai:generation:get-status` (`DESKTOP_CHANNELS.AI_GENERATION_GET_STATUS`)
- **Zod Schemas & DTOs**:
  - `localGenerationRequestSchema` / `LocalGenerationRequestInputDto`:
    - `requestId`: UUID format
    - `projectId`: Optional UUID
    - `model`: Optional string (empty or omitted triggers auto-resolution)
    - `systemPrompt`: Optional string (max 8,000 chars)
    - `prompt`: Required string (1 to 32,000 chars)
    - `context`: Optional `aiProjectContextSchema` (max 20,000 chars each for summary, files, conventions, metadata)
    - `parameters`: Optional temperature (0.0–2.0), topP (0.0–1.0), maxTokens (1–32,768), stop sequences
    - `timeoutMs`: Optional integer (50ms–600,000ms, default 60,000ms)
  - `localGenerationResultSchema` / `LocalGenerationResultDto`:
    - `requestId`, `providerId`, `model`, `lifecycleState`, `text`, `finishReason`, `usage`, `durationMs`, `metadata`
  - `localGenerationStatusSchema` / `LocalGenerationStatusDto`:
    - State tracking with timestamps, duration, and error details

### 3.2 Core Runtime Service (`packages/core`)
- Located in `packages/core/src/ai-provider/local-generation-runtime.ts`.
- **`LocalGenerationRuntimeService`**:
  1. **Validation & Authorization**: Validates incoming payload using Zod. Ensures that if `projectId` is specified, multi-tenant project lookup validates user access.
  2. **Context Formatting & Limits**: Enforces 50,000 characters total context ceiling. Formats repository summary, file excerpts, and conventions deterministically.
  3. **Readiness Check Sequence**: Runs `checkProviderReadiness` before model resolution. If Ollama is offline or daemon is stopped, returns `AiProviderUnavailableError` without misclassifying it as a model error.
  4. **Model Verification & Resolution**: If a model is explicitly provided, checks installed status via `OllamaDiscoveryService`. If not specified, leverages `ModelSelectionService.selectModelForTask('CHAT')` to automatically select the optimal installed model.
  5. **In-Flight Tracking & Cancellation**: Manages an internal `activeOperations` map with `AbortController`. Cancellations immediately call `controller.abort()` and transition the request to `CANCELLED`.
  6. **Error Classification**: Maps low-level network and HTTP errors into typed domain errors:
     - `AiProviderUnavailableError` (offline daemon / 503)
     - `AiModelUnavailableError` (uninstalled model)
     - `AiTimeoutError` (request deadline exceeded)
     - `AiCancelledError` (user or client aborted)
     - `AiInvalidResponseError` (malformed Ollama response)
     - `AiGenerationError` (provider 500 runtime fault)
  7. **Metadata Sanitization**: Redacts sensitive values (`Authorization`, token fields) before exposing metadata to renderer or audit logs.

### 3.3 Main IPC & Bridge Handlers (`apps/desktop`)
- `apps/desktop/src/main/ipc/generation-handlers.ts`:
  - Enforces `isTrustedIpcSender` on all calls.
  - Validates active user session using `assertAuthenticated`.
  - Safely maps caught errors to `DesktopErrorCode`.
- `apps/desktop/src/preload/index.ts`:
  - Exposes `window.desktopBridge.aiGeneration` with typed methods `generate`, `cancel`, `getStatus`.

### 3.4 Verification UI (`apps/desktop/src/renderer`)
- `apps/desktop/src/renderer/features/ai/LocalGenerationPlaygroundCard.tsx`:
  - Real-time Ollama status indicator (`ONLINE` / `OFFLINE`).
  - Model dropdown dynamically populated via `window.desktop.aiModels.list()`.
  - Prompt input textarea with parameter tuning (temperature, maxTokens).
  - Status badge reflecting current lifecycle state (`IDLE`, `RUNNING`, `COMPLETED`, `CANCELLED`, `PROVIDER_ERROR`).
  - Generation trigger and cooperative cancellation button.
  - Response panel displaying response text, elapsed duration, and token usage metrics.
  - Accessible via the Settings Screen under the Infrastructure tab.

---

## 4. Certification & Test Coverage

### Automated Test Suites
1. **Core Certification Suite** (`packages/core/src/ai-provider/certification/v9-phase130-certification.test.ts`):
   - **Section 1**: Request validation, empty prompt rejection, parameter ranges, oversized context rejection, formatted bounded context.
   - **Section 2**: Model resolution, explicit model verification, uninstalled model rejection, automated model resolution via Phase 129, zero models rejection.
   - **Section 3**: Cooperative cancellation, request isolation (cancelling request A leaves request B unaffected), timeout enforcement.
   - **Section 4**: Error classification, offline daemon detection, 500 server error translation, metadata secret redaction.
   - **Section 5**: End-to-end service integration and multi-tenant project isolation.
   - *Result*: 16/16 tests passing (100%).
2. **IPC Handlers Suite** (`apps/desktop/src/main/ipc/generation-handlers.test.ts`):
   - Trusted sender verification, session authentication, payload schema validation, cancellation propagation, and status retrieval.
   - *Result*: 13/13 tests passing (100%).
3. **Renderer UI Suite** (`apps/desktop/src/main/local-generation-ui.test.tsx`):
   - Status checks, model selection, prompt entry, generation completion, and cancellation trigger.
   - *Result*: 5/5 tests passing (100%).
4. **V9 Full Regression**:
   - All 91 V9 certification tests across Phases 126–130 passing (100%).
5. **Desktop Suite Regression**:
   - All 123 unit/integration tests passing (100%).
