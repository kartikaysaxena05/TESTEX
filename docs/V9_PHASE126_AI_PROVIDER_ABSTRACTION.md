# V9 Phase 126 — AI Provider Abstraction

## 1. Overview & Objective

Phase 126 establishes the provider-independent AI runtime foundation for V9 and future autonomous quality engineering layers. The architecture decouples the application from concrete AI engines (such as Ollama or future local/remote LLM runtimes) through a strict internal abstraction:
- **`IAiProvider` contract**: A unified lifecycle and execution interface (`generate()`, `stream()`, `getCapabilities()`, `healthCheck()`, `cancel()`).
- **Normalized Request/Response DTOs**: Standardized payloads isolating the rest of the application from vendor wire formats, token conventions, or streaming protocols.
- **Provider Registry & Service**: Dynamic provider lookup, multi-tenant database persistence, schema validation, and audit logging.
- **Isolated Ollama Adapter**: Fully self-contained Ollama client supporting NDJSON streams, in-flight abort controllers, and error translation without spreading Ollama dependencies across the codebase.
- **Deterministic Error Hierarchy**: 10 typed error codes inheriting from existing gateway errors.
- **IPC & Security Boundary**: Hardened Electron IPC channels enforcing trusted frame validation, session authentication, SSRF firewalls, and parameter bounds.

> **Scope Boundary Compliance**:
> Phase 126 introduces **zero** autonomous agents, planner loops, tool executions, Playwright agent automations, terminal executions, or active Ollama probes during configuration. All higher-level intelligence belongs strictly to subsequent phases.

---

## 2. Architecture & Service Ecosystem

```text
                  ┌──────────────────────────────────────────────┐
                  │          Renderer / Application UI           │
                  └──────────────────────┬───────────────────────┘
                                         │ window.desktopBridge.aiProvider
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │       Desktop Main IPC & Security Gate       │
                  │  (isTrustedIpcSender, assertAuthenticated)   │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │             AiProviderService                │
                  │   - Multi-tenant Project & User Isolation    │
                  │   - Prisma Persistence & Audit Trails        │
                  │   - Request & Parameter Bounds Validation    │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │           AiRuntimeProviderRegistry          │
                  │   - IAiProvider Interface Compliance         │
                  │   - Dynamic Provider Registration/Lookup     │
                  └──────────┬────────────────────────┬──────────┘
                             │                        │
                             ▼                        ▼
               ┌───────────────────────────┐   ┌───────────────────────────┐
               │   OllamaProviderAdapter   │   │    EmulatedAiProvider     │
               │  - Isolated NDJSON Stream │   │   (Deterministic Suite)   │
               │  - In-flight Cancellation │   │                           │
               │  - Error Translation      │   │                           │
               └─────────────┬─────────────┘   └───────────────────────────┘
                             │
                             ▼
                    Ollama Local Daemon
                  (http://127.0.0.1:11434)
```

### Components

1. **`IAiProvider`** (`packages/core/src/ai-provider/ai-provider-contract.ts`):
   Standard TypeScript interface declaring provider capabilities, execution, streaming, health status, and cancellation methods.
2. **`AiRuntimeProviderRegistry`** (`packages/core/src/ai-provider/ai-provider-registry.ts`):
   Central provider registry managing adapter instances, lookup, dynamic registration, and enumeration. Exported as `AiRuntimeProviderRegistry` to cleanly avoid naming collisions with V4 infrastructure.
3. **`OllamaProviderAdapter`** (`packages/core/src/ai-provider/ollama-provider-adapter.ts`):
   Concrete adapter for Ollama. Normalizes requests into `/api/generate` payloads, consumes NDJSON chunk streams, tracks in-flight requests with `AbortController` maps for deterministic cancellation, and translates Ollama HTTP status codes into typed domain errors.
4. **`EmulatedAiProvider`** (`packages/core/src/ai-provider/emulated-ai-provider.ts`):
   Zero-network mock adapter facilitating reliable, reproducible testing of higher-level V9 workflows.
5. **`AiProviderValidator`** (`packages/core/src/ai-provider/ai-provider-validator.ts`):
   Hardened input validation engine enforcing:
   - Provider ID allowlisting & uppercase normalization (`'OLLAMA'`).
   - Model identifier sanitization (`/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/`).
   - Prompt length constraints (<= 500,000 characters).
   - Generation parameter clamping (`temperature: 0..2`, `topP: 0..1`, `maxTokens > 0`, `stopSequences <= 16`).
   - Cloud metadata SSRF blocking (AWS/GCP/Azure link-local `169.254.0.0/16`, `[fd00:ec2::254]`, `[fe80::]`).
6. **`AiProviderService`** (`packages/core/src/ai-provider/ai-provider-service.ts`):
   Privileged backend service managing multi-tenant database records (`AiProviderConfig`), project ownership verification (`assertProjectAccess`), and audit logging.
7. **IPC Handlers & Bridge** (`apps/desktop/src/main/ipc/ai-provider-handlers.ts`, `apps/desktop/src/preload/index.ts`):
   5 secured IPC channels exposed through the sandboxed Electron preload bridge.

---

## 3. Database Schema Extensions

Applied cleanly via Prisma migration `20261005095901_v9_phase126_ai_provider_abstraction`:

```prisma
enum AuthAuditAction {
  // Existing actions...
  AI_PROVIDER_CONFIG_UPDATED
}

model AiProviderConfig {
  id                String    @id @default(uuid())
  projectId         String?
  userId            String
  providerId        String    @default("OLLAMA")
  enabled           Boolean   @default(true)
  baseUrl           String    @default("http://127.0.0.1:11434")
  defaultModel      String    @default("llama3")
  requestTimeoutMs  Int       @default(60000)
  streamingEnabled  Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  project           Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, providerId])
  @@index([userId, providerId])
  @@map("ai_provider_configs")
}
```

---

## 4. Contracts & Data Transfer Objects

Exported from `@ai-quality/contracts`:

- **`AiProviderDescriptorDto`**: Public provider metadata (`providerId`, `providerName`, `providerType`, `status`, `capabilities`, `configuration`). Strips internal credentials and keys.
- **`AiProviderConfigDto`**: Persistent provider settings per project (`baseUrl`, `defaultModel`, `requestTimeoutMs`, `streamingEnabled`).
- **`NormalizedAiRequestDto`**: Normalized request contract featuring `requestId`, `projectId`, `providerId`, `model`, `prompt`, `systemPrompt`, `parameters` (`temperature`, `topP`, `maxTokens`, `stopSequences`, `timeoutMs`), and `outputFormat` (`'text' | 'json'`).
- **`NormalizedAiResponseDto`**: Standardized response containing `requestId`, `providerId`, `model`, `text`, `finishReason`, `usage` (`inputTokens`, `outputTokens`, `totalTokens`), and `timing` (`durationMs`).
- **`AiStreamChunkDto`**: Incremental chunk yielded during streaming (`requestId`, `deltaText`, `accumulatedText`, `finishReason`, `usage`).

---

## 5. Deterministic Error Hierarchy

All errors derive from `AiGatewayError` and emit safe `DesktopErrorCode` enum values:

| Error Class | Code | Description | Transient |
| :--- | :--- | :--- | :--- |
| `AiProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | Provider daemon or endpoint unreachable | No |
| `AiProviderAuthError` | `PROVIDER_AUTH_ERROR` | Provider credentials/token authentication rejected | No |
| `AiModelUnavailableError` | `MODEL_UNAVAILABLE` | Requested model not installed or pulled | No |
| `AiInvalidRequestError` | `INVALID_REQUEST` | Malformed parameters, empty prompt, or schema violation | No |
| `AiTimeoutError` | `TIMEOUT` | Provider operation exceeded specified timeout | Yes |
| `AiCancelledError` | `CANCELLED` | Execution aborted via cancellation token or signal | No |
| `AiRateLimitError` | `RATE_LIMITED` | Provider rate limit exceeded | Yes |
| `AiInvalidResponseError` | `INVALID_RESPONSE` | Empty, truncated, or non-JSON response payload | No |
| `AiProviderError` | `PROVIDER_ERROR` | 500 error or unexpected internal runtime issue | No |
| `AiUnknownError` | `UNKNOWN` | Unclassified runtime fault | No |
| `AiCrossProjectAccessError`| `AI_CROSS_PROJECT_ACCESS` | Unauthorized access to foreign project configuration | No |
| `AiConfigInvalidError` | `AI_CONFIG_INVALID` | Invalid configuration parameters or SSRF attempt | No |

---

## 6. IPC Interface & Preload Bridge

| Channel | Method | Description |
| :--- | :--- | :--- |
| `desktop:ai:provider:list` | `listProviders(projectId?: string)` | Enumerate registered AI providers and their public status |
| `desktop:ai:provider:get` | `getProvider(providerId: string, projectId?: string)` | Fetch descriptor for a specific provider |
| `desktop:ai:request:validate` | `validateRequest(input: ValidateAiRequestInputDto)` | Validate and sanitize prompt/model parameters |
| `desktop:ai:config:get` | `getConfig(providerId: string, projectId?: string)` | Retrieve active project configuration |
| `desktop:ai:config:update` | `updateConfig(input: UpdateAiProviderConfigInputDto)` | Update provider configuration with audit logging |

---

## 7. Verification & Certification Results

```bash
# Phase 126 Focused Test Suites (Core + IPC)
npm run test:phase126
# Result: 51 tests passed, 0 failed (13 suites, 4.3s)

# Full V8 Regression Suite
npm run test:v8-certification
# Result: 328 tests passed, 0 failed (75 suites, 18.2s)

# Legacy AI Regression Suite
npm run test:ai
# Result: 373 tests passed, 0 failed (103 suites, 19.5s)

# Monorepo Typecheck & Build
npm run typecheck      # Clean (tsc -b, exit code 0)
npm run desktop:build  # Clean (Vite bundle built in 218ms)
```
