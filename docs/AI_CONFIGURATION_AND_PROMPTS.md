# AI Configuration, Prompt Architecture & Structured Output Contracts

## Document Purpose

This document provides the authoritative architectural specification and operational guide for **AI Configuration, Prompt Architecture & Structured Output Contracts** (V4 Phase 44) within the **AI-Driven Software Quality Engineering Platform**.

Phase 44 establishes the centralized, typed, auditable interaction layer that interfaces application features with the Phase-43 AI Provider Gateway. It eliminates scattered strings, unvalidated JSON parsing, and provider lock-in across the codebase.

---

## 1. End-to-End Execution Architecture

````
Application Feature / Service
        │
        ▼ (promptId, optional version, typed input, optional config override)
┌────────────────────────────────────────────────────────┐
│              AiPromptExecutionService                  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ 1. Lookup Prompt Definition
┌────────────────────────────────────────────────────────┐
│                   PromptRegistry                       │
│    (Immutable versioned definitions: id@version)       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ 2. Validate Input Variables (Zod schema)
┌────────────────────────────────────────────────────────┐
│              Prompt Input Schema Validator             │
│        (Rejects missing, oversized, or wrong types)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ 3. Resolve AI Generation Configuration
┌────────────────────────────────────────────────────────┐
│              AiConfigurationResolver                   │
│   Precedence: Call Override → Task Default →           │
│               Project Config → App Default             │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ 4. Deterministic Message Rendering
┌────────────────────────────────────────────────────────┐
│                   PromptRenderer                       │
│  • SYSTEM instructions separated from USER data        │
│  • Untrusted domain data encapsulated in XML tags      │
│  • Zero dynamic code evaluation (No eval / Function)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ 5. Forward to LLM Gateway
┌────────────────────────────────────────────────────────┐
│          Phase-43 AI Provider Gateway                  │
│    (Validation, Timeout, Cancellation, Bounded Retries)│
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ 6. Provider Adapter (OpenAI / Fake)
┌────────────────────────────────────────────────────────┐
│                   Provider Execution                   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ 7. Extract & Validate Structured Output
┌────────────────────────────────────────────────────────┐
│              StructuredOutputParser                    │
│  • Safe JSON extraction (raw or fenced ```json)        │
│  • Prototype pollution defense (__proto__ stripped)   │
│  • Zod schema validation & strict unknown field check  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ 8. Envelope & Provenance Generation
┌────────────────────────────────────────────────────────┐
│            AiStructuredResultDto<T>                    │
│  • data: T (Typed validated domain object)             │
│  • promptId, promptVersion, configSnapshot             │
│  • usage tokens, durationMs, retryCount, requestId     │
└────────────────────────────────────────────────────────┘
````

---

## 2. AI Configuration Architecture

### Configuration Model (`AiGenerationConfigDto`)

```typescript
export interface AiGenerationConfigDto {
  readonly providerId: AiProviderId;
  readonly model: string;
  readonly temperature: number; // 0.0 - 2.0
  readonly topP?: number; // 0.0 - 1.0
  readonly maxOutputTokens: number; // 1 - 32768
  readonly timeoutMs: number; // 1000 - 300000
  readonly structuredOutputMode?: 'NATIVE_JSON' | 'JSON_PROMPT' | 'AUTO';
  readonly providerOptions?: Readonly<Record<string, unknown>>;
}
```

### Deterministic Configuration Precedence

When executing a prompt or task, configuration parameters are resolved deterministically using nullish coalescing (`??`) so that valid `0` values (e.g. `temperature: 0`) are strictly preserved:

1. **Call-time Override** (`ExecutePromptOptions.configOverride`): Highest priority override supplied at invocation.
2. **Task / Prompt Definition Defaults** (`PromptDefinition.defaultConfig`): Static generation parameters defined for the prompt.
3. **Project AI Configuration** (`projectConfig`): Project-specific settings if configured.
4. **Global Application Defaults** (`DEFAULT_AI_CONFIG`): Fallback defaults.
   - `providerId`: `'OPENAI'`
   - `model`: `'gpt-4o-mini'`
   - `temperature`: `0.2`
   - `maxOutputTokens`: `4096`
   - `timeoutMs`: `30000`
   - `structuredOutputMode`: `'AUTO'`

### Configuration Snapshot (`AiConfigSnapshot`)

Every execution captures an immutable snapshot of the effective configuration used. Snapshots contain strictly non-secret generation parameters and never include API keys, auth tokens, or private headers.

---

## 3. Prompt Architecture & Registry

### Prompt Definition Contract (`PromptDefinition<TInput, TOutput>`)

```typescript
export interface PromptDefinition<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly defaultConfig?: Partial<AiGenerationConfigDto>;
  buildMessages(input: TInput): readonly AiMessageDto[];
}
```

### Prompt Immutability Invariant

Once a prompt definition is registered with an ID and version (e.g. `requirement.analysis@1`), its contract and message builder are frozen and immutable. If prompt logic or schema changes in the future, a new version must be registered (e.g. `requirement.analysis@2`).

### System / User Separation & Untrusted Data Boundaries

1. **Role Separation**: Every prompt builds separate `SYSTEM` (instructions) and `USER` (context & data) messages.
2. **Untrusted Data Isolation**: All domain context (user requirement text, repository source code, etc.) is wrapped in XML data tags (`<domain_data>...</domain_data>`) via `PromptRenderer.wrapUntrustedData()` so models treat it strictly as data, not instruction.
3. **No Dynamic Eval**: Template interpolation uses pure regular-expression replacement, forbidding `eval()` and dynamic code execution.

---

## 4. Structured Output Contract Foundation

### Strict Runtime Validation Flow

````
LLM Output Text
      │
      ▼
extractJsonString() ───→ Supports raw JSON and markdown code fences (```json ... ```)
      │
      ▼
safeJsonParse() ───────→ Protects against __proto__, constructor, and prototype pollution
      │
      ▼
schema.safeParse() ────→ Validates against strict Zod schema; rejects missing or hallucinated fields
      │
      ▼
Typed Domain Result (T)
````

### Unknown Fields Policy

Important structured output contracts utilize Zod `.strict()` schema definitions. Hallucinated properties returned by the provider are rejected immediately rather than silently cast into domain entities.

### Error Taxonomy

| Error Class                             | Code                                | Description                                                         |
| --------------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| `AiConfigurationInvalidError`           | `CONFIGURATION_INVALID`             | Configuration parameters violate range limits or syntax boundaries. |
| `AiPromptNotFoundError`                 | `PROMPT_NOT_FOUND`                  | Prompt ID does not exist in registry.                               |
| `AiPromptVersionNotFoundError`          | `PROMPT_VERSION_NOT_FOUND`          | Specified version does not exist for the prompt ID.                 |
| `AiPromptInputInvalidError`             | `PROMPT_INPUT_INVALID`              | Input variables fail Zod validation schema.                         |
| `AiPromptRenderFailedError`             | `PROMPT_RENDER_FAILED`              | Prompt rendering fails bounds or variable interpolation.            |
| `AiStructuredOutputParseError`          | `STRUCTURED_OUTPUT_PARSE_FAILED`    | Model response is empty, not valid JSON, or contains pollution.     |
| `AiStructuredOutputSchemaError`         | `STRUCTURED_OUTPUT_SCHEMA_FAILED`   | Parsed JSON violates the contract Zod schema.                       |
| `AiStructuredOutputRetryExhaustedError` | `STRUCTURED_OUTPUT_RETRY_EXHAUSTED` | Bounded structured retry budget exhausted without valid response.   |

---

## 5. Security & Boundary Invariants

1. **Zero Secret Leakage**: No API keys or credentials exist in prompt definitions, variable schemas, configuration snapshots, IPC envelopes, or error traces.
2. **Prototype Pollution Protection**: Deep assertion prevents `__proto__`, `constructor`, or `prototype` injection in both configuration objects and parsed JSON responses.
3. **Electron IPC Hardening**: Preload script exposes strictly semantic methods (`window.desktop.ai.getConfigDefaults` and `window.desktop.ai.executePrompt`). Sender validation and Zod schema parsing are enforced on every invocation.

---

## 6. Phase 45 Integration Handoff

Phase 44 provides Phase 45 (**Embedding & Vector Retrieval Foundation**) with:

- `AiProviderGateway` and `AiProviderRegistry`
- `AiConfigurationResolver` and validation architecture
- `PromptRegistry` and versioned definitions
- `StructuredOutputParser` and schema enforcement
- `AiPromptExecutionService` for typed, auditable generation pipelines

Phase 45 will introduce embedding models, vector database integration, chunking, and semantic similarity search without rebuilding the prompt or configuration foundation.
