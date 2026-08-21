# AI Provider Gateway & LLM Foundation Architecture

## Document Purpose

This document provides the authoritative architectural specification and operational guide for the **AI Provider Gateway & LLM Foundation** (V4 Phase 43) within the **AI-Driven Software Quality Engineering Platform**.

The gateway establishes the universal, secure, provider-neutral layer through which all future V4 capabilities (prompt architecture, embeddings, RAG, requirement reasoning, test scenario generation, test case synthesis, and hallucination controls) interface with Large Language Models.

---

## 1. Subsystem Architecture

```
┌────────────────────────────────────────────────────────┐
│               Electron Renderer (React)                │
└───────────────────────────┬────────────────────────────┘
                            │ Strongly typed semantic IPC
                            ▼
┌────────────────────────────────────────────────────────┐
│            Preload & IPC Security Boundary             │
│ (Sender validation, Zod schemas, zero API keys exposed)│
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                 AI Provider Gateway                    │
│   (Validation, Timeout, Abort, Retry, Logging, Usage)  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                  AI Provider Registry                  │
│    (Resolves provider ID, capabilities, error mapping) │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
                ▼                        ▼
     ┌──────────────────────┐ ┌──────────────────────┐
     │  OpenAI Adapter      │ │  Fake / Test Provider │
     │  (Official SDK)      │ │  (Deterministic Test)│
     └──────────┬───────────┘ └──────────────────────┘
                │
                ▼
         OpenAI API
```

### Architectural Principles & Invariants

1. **Strict Provider Encapsulation**: Application code and feature services never import `openai` SDK, invoke external REST endpoints, or manage raw HTTP requests. All AI operations flow strictly through `AiProviderGateway`.
2. **Provider Neutrality**: Upstream consumers program against generic contracts (`AiGenerationRequestDto`, `AiGenerationResultDto`, `AiMessageDto`). No OpenAI-specific constructs leak past the adapter boundary.
3. **Zero Secret Leakage**: `OPENAI_API_KEY` is loaded exclusively in the trusted Node.js backend/main process. It is never transmitted across IPC, never sent to the renderer process, never stored in ordinary database tables, and never printed in logs or error traces.
4. **Deterministic Testing**: `FakeAiProvider` allows 100% of gateway behavior (timeouts, cancellations, transient retries, error classifications, token tracking) to be comprehensively tested without external network access or paid API credentials.
5. **Fail-Safe Offline Operation**: When no API keys are present, the platform starts cleanly, remaining fully functional for all repository intelligence (V2) and requirement intelligence (V3) operations.

---

## 2. Shared Data Contracts (`@ai-quality/contracts`)

### Provider Identifiers & Roles

```typescript
export type AiProviderId = 'OPENAI' | 'FAKE' | (string & {});

export type AiMessageRole = 'SYSTEM' | 'USER' | 'ASSISTANT';

export interface AiMessageDto {
  readonly role: AiMessageRole;
  readonly content: string;
}
```

### Request & Response Models

```typescript
export interface AiGenerationRequestDto {
  readonly requestId?: string;
  readonly providerId: AiProviderId;
  readonly model: string;
  readonly messages: readonly AiMessageDto[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AiTokenUsageDto {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}

export interface AiGenerationResultDto {
  readonly requestId: string;
  readonly providerId: AiProviderId;
  readonly modelRequested: string;
  readonly modelReported: string | null;
  readonly text: string;
  readonly finishReason: string | null;
  readonly usage: AiTokenUsageDto;
  readonly providerRequestId: string | null;
  readonly durationMs: number;
  readonly retryCount: number;
}
```

### Capability & Status Models

```typescript
export interface AiProviderCapabilitiesDto {
  readonly textGeneration: boolean;
  readonly systemMessages: boolean;
  readonly tokenUsageReporting: boolean;
  readonly cancellation: boolean;
  readonly maxContextTokens?: number;
  readonly defaultModel: string;
  readonly supportedModels: readonly string[];
}

export type AiProviderHealthStatus =
  'READY' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'AUTHENTICATION_FAILED';

export interface AiProviderStatusDto {
  readonly providerId: AiProviderId;
  readonly configured: boolean;
  readonly status: AiProviderHealthStatus;
  readonly capabilities: AiProviderCapabilitiesDto;
  readonly verifiedAt?: string;
  readonly message?: string;
}
```

---

## 3. Core Subsystem Components (`@ai-quality/core`)

### 1. `AiProviderGateway`

The central orchestrator responsible for:

- **Request Boundary Validation**: Enforces limits on message count ($\le 100$), single message characters ($\le 100,000$), total prompt characters ($\le 500,000$), temperature ($[0, 2]$), and output tokens ($[1, 32768]$).
- **Correlation ID Tracking**: Preserves caller `requestId` or generates a unique UUID.
- **Bounded Timeout Management**: Wraps provider calls in an `AbortController` bounded between $1,000\text{ms}$ and $300,000\text{ms}$ (default $30,000\text{ms}$).
- **External Cancellation Propagation**: Listens to caller `AbortSignal` and terminates active requests immediately.
- **Conservative Bounded Retries**: Implements exponential backoff ($500\text{ms} \times 2^{\text{attempt}-1}$, max 2 retries) exclusively for transient faults (`NETWORK_ERROR`, `PROVIDER_UNAVAILABLE`, `RATE_LIMITED`). Permanent errors fail immediately.
- **Structured Telemetry & Redaction**: Emits structured log events (`ai.generation.started`, `ai.generation.success`, `ai.generation.retry`, `ai.generation.failed`) with sanitized metadata.

### 2. `AiProviderRegistry`

- Maintains registration of `AiProvider` instances.
- Resolves providers case-insensitively.
- Throws `AiInvalidRequestError` when an unregistered provider is requested.
- Provides concurrent health check aggregation across all registered adapters.

### 3. `OpenAiProviderAdapter`

- Integrates the official `openai` Node.js SDK (`v6.49.0`).
- Translates `AiMessageDto` array to OpenAI `chat.completions.create` parameters.
- Redacts sensitive headers and API keys.
- Normalizes token usage from `response.usage`.
- Translates SDK error exceptions to domain `AiGatewayError` hierarchy.

### 4. `FakeAiProvider`

- Provides deterministic mock behavior for automated testing.
- Supports configurable latency, fixed response text, dynamic failure counts, and injected error types.
- Accurately responds to `AbortSignal` cancellation.

---

## 4. Error Taxonomy

| Error Class                      | Code                        | Transient / Retryable | Description                                                |
| -------------------------------- | --------------------------- | --------------------- | ---------------------------------------------------------- |
| `AiProviderNotConfiguredError`   | `PROVIDER_NOT_CONFIGURED`   | No                    | Required API credentials are missing from the environment. |
| `AiInvalidRequestError`          | `INVALID_REQUEST`           | No                    | Request violates size boundaries or schema constraints.    |
| `AiAuthenticationError`          | `AUTHENTICATION_FAILED`     | No                    | Provider rejected the provided API key (HTTP 401).         |
| `AiPermissionDeniedError`        | `PERMISSION_DENIED`         | No                    | Access forbidden or organization denied (HTTP 403).        |
| `AiRateLimitError`               | `RATE_LIMITED`              | Yes                   | Provider rate limit or quota exceeded (HTTP 429).          |
| `AiTimeoutError`                 | `TIMEOUT`                   | Yes                   | Request exceeded the configured `timeoutMs`.               |
| `AiCancelledError`               | `CANCELLED`                 | No                    | Request was explicitly aborted by caller `AbortSignal`.    |
| `AiProviderUnavailableError`     | `PROVIDER_UNAVAILABLE`      | Yes                   | Provider internal server error or outage (HTTP 5xx).       |
| `AiNetworkError`                 | `NETWORK_ERROR`             | Yes                   | Connection reset, DNS failure, or socket timeout.          |
| `AiInvalidProviderResponseError` | `INVALID_PROVIDER_RESPONSE` | No                    | Provider returned malformed JSON or empty choices.         |

---

## 5. Security & Boundary Controls

### Electron IPC Boundary

```
Renderer Process (window.desktop.ai.*)
       │
       ▼
Preload Bridge (apps/desktop/src/preload/index.ts)
       │  DESKTOP_CHANNELS.AI_*
       ▼
createSafeIpcHandler (apps/desktop/src/main/ipc/register-ipc.ts)
       │  • isTrustedIpcSender validation
       │  • Zod schema validation (aiGenerationRequestSchema, etc.)
       │  • Domain error code translation (DesktopErrorCode)
       ▼
AiProviderGateway (packages/core/src/ai/ai-provider-gateway.ts)
```

1. **Sender Validation**: Every IPC call validates `event.senderFrame` to prevent malicious origin injection.
2. **Schema Sanitization**: Inbound IPC arguments are validated through Zod schemas before reaching domain logic.
3. **No Dynamic Code / Eval**: The gateway only processes text messages; no remote code execution or uncontrolled deserialization occurs.

---

## 6. Verification and Smoke Testing

### Automated Test Suites

1. `packages/core/src/ai/ai-provider-registry.test.ts` (5 tests)
2. `packages/core/src/ai/fake-ai-provider.test.ts` (7 tests)
3. `packages/core/src/ai/openai-provider-adapter.test.ts` (4 tests)
4. `packages/core/src/ai/ai-provider-gateway.test.ts` (11 tests)
5. `packages/core/src/ai/ai-security.test.ts` (4 tests)
6. `packages/core/src/ai/openai-live-smoke.test.ts` (2 tests)
7. `apps/desktop/src/main/ipc/ai-handlers.test.ts` (5 tests)

### Executing Tests

```bash
# Run AI unit and integration suites
npm run test:ai

# Run all platform regression tests
npm test

# Run standalone live smoke script
node scripts/ai-smoke.js
```
