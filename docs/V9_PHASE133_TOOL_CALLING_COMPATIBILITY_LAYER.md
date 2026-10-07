# V9 Phase 133 — Tool-Calling Compatibility Layer

## Overview & Architecture

V9 Phase 133 implements a provider-independent tool-calling compatibility layer for the V9 AI Runtime. The layer defines a normalized tool protocol, argument schema validation pipeline, registry management, and capability detection for local models (e.g. Ollama) without executing code or calling tools.

### Invariant & Architectural Boundary

```text
AI Model
   ↓
Provider Adapter
   ↓
V9 Tool-Calling Compatibility Layer
   ↓
Validated ToolCall
   ↓
STOP (Phase 133 Boundary)
```

**Execution Boundary:**
- Phase 133 stops strictly at the validated `ToolCall` boundary.
- No shell execution, file system modification, Playwright interaction, Git alteration, or V1–V8 background job triggers occur in this phase.
- Attempting to execute any tool call in Phase 133 deterministically throws `AiToolExecutionProhibitedError` (`TOOL_EXECUTION_PROHIBITED`).
- Autonomous tool execution, authorization decisions, planning loops, and patch repair are reserved exclusively for V10.

---

## 1. Provider-Independent Tool Schema

Tools are defined deterministically in [`packages/contracts/src/index.ts`](file:///Users/kartikaysaxena/Desktop/collage/packages/contracts/src/index.ts) with strict category, risk level, and JSON schema requirements:

```typescript
export interface AiToolDefinitionDto {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown> | null;
  readonly version: number;
  readonly category: ToolCategory;
  readonly riskLevel: ToolRiskLevel;
  readonly metadata?: Record<string, unknown> | null;
}
```

### Registered Built-In Tools
- `repository.search` (Category: `REPOSITORY`, Risk: `READ_ONLY`)
- `requirements.list` (Category: `REQUIREMENTS`, Risk: `READ_ONLY`)
- `tests.list` (Category: `TESTS`, Risk: `READ_ONLY`)
- `defects.list` (Category: `DEFECTS`, Risk: `READ_ONLY`)

Unrestricted execution tools (such as `execute-any-command`, `read-any-file`, `delete-anything`, `shell.exec`, `sudo`) are explicitly rejected during registry validation (`TOOL_SCHEMA_INVALID`).

---

## 2. Normalized Tool Call & Result Contracts

### Normalized Tool Call (`NormalizedAiToolCallDto`)
```typescript
export interface NormalizedAiToolCallDto {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  readonly schemaVersion: number;
  readonly metadata?: Record<string, unknown> | null;
}
```

### Validated Result (`ValidatedAiToolCallResultDto`)
```typescript
export interface ValidatedAiToolCallResultDto {
  readonly toolCall: NormalizedAiToolCallDto | null;
  readonly status: ToolCallValidationStatus; // 'VALID' | 'INVALID_ARGUMENTS' | 'UNKNOWN_TOOL' | 'PARSE_ERROR' | 'UNSUPPORTED' | 'POLICY_VIOLATION'
  readonly errors: readonly ToolCallValidationErrorDto[];
  readonly toolDefinition?: AiToolDefinitionDto | null;
}
```

### Tool Result (`NormalizedAiToolResultDto`)
```typescript
export interface NormalizedAiToolResultDto {
  readonly toolCallId: string;
  readonly success: boolean;
  readonly output: unknown | null;
  readonly error?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly truncated?: boolean;
}
```

---

## 3. Tool Registry Implementation

[`AiToolRegistry`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/ai-provider/tool-registry.ts) provides scoped registration, removal, lookup, and argument validation:

- `registerTool(definition, validator?, projectId?)`: Enforces Zod schema compliance, duplicate rejection, and dangerous name prevention.
- `unregisterTool(name, projectId?)`: Removes tools from global or project scope.
- `getTool(name, projectId?)`: Resolves project-specific tools with fallback to global.
- `listTools(projectId?, category?)`: Returns registered tools for the given scope.
- `validateArguments(name, args, projectId?)`: Validates tool call parameters against registered Zod schemas or JSON Schema property types.

---

## 4. Parser & Security Pipeline

[`V9ToolCallParser`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/ai-provider/tool-call-parser.ts) safely parses raw model responses into normalized tool calls:

- **Markdown Fences & Non-JSON Tolerance:** Extracts JSON blocks while gracefully ignoring plain text conversational output.
- **Format Normalization:** Normalizes direct `{ tool_calls: [...] }`, `{ toolCall: {...} }`, direct objects, and OpenAI function calling `{ function: { name, arguments } }`.
- **Trailing Comma Cleanup:** Deterministic, bounded regex cleanup for JSON formatting slips.
- **Payload Guard:** Rejects oversized strings exceeding 200,000 characters (`STRUCTURED_PAYLOAD_TOO_LARGE`).
- **Nesting Guard:** Prevents stack-overflow recursion attacks by capping object/array nesting to depth 16 (`STRUCTURED_NESTING_TOO_DEEP`).
- **Prototype Pollution Defense:** Recursively strips `__proto__`, `constructor`, and `prototype` keys from argument payloads.

---

## 5. Model Capability Handling

[`ToolCallingService`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/ai-provider/tool-calling-service.ts) detects provider capabilities via `getToolCapabilities()`:
- **`NATIVE`**: Ollama provider with native tool support.
- **`COMPATIBILITY`**: Emulated and standard generative models (guided by deterministic system prompt formatting with JSON tool calling protocol).
- **`UNSUPPORTED`**: Unregistered or incompatible model providers.

---

## 6. Desktop IPC & Preload Integration

Exposed through Electron IPC channels:
- `desktop:ai:tool:list`
- `desktop:ai:tool:get`
- `desktop:ai:tool:parse-call`
- `desktop:ai:tool:validate-call`
- `desktop:ai:tool:generate-calls`
- `desktop:ai:tool:get-capabilities`

All handlers verify trusted frame origins (`isTrustedIpcSender`), enforce active user session authentication (`assertAuthenticated`), validate schemas with Zod, and enforce multi-tenant isolation (`assertProjectAccess`).

---

## 7. Verification Results

- **All 8 V9 Certification Suites Passing (155/155 tests, 100%):**
  - Phase 126: 16/16 passed
  - Phase 127: 18/18 passed
  - Phase 128: 17/17 passed
  - Phase 129: 18/18 passed
  - Phase 130: 18/18 passed
  - Phase 131: 18/18 passed
  - Phase 132: 24/24 passed
  - Phase 133: 26/26 passed
- **Desktop Unit & IPC Suites:** 142/142 tests passing.
- **Desktop Smoke Verification:** Passed (exit code 0).
