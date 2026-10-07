# V9 Phase 132 — Structured Output & Schema Validation

## Executive Summary

Phase 132 implements a production-grade structured-output and schema validation layer for the V9 AI Provider Runtime. It enables local models (via Ollama or other providers) to produce verified, machine-readable data instead of fragile unconstrained natural language.

The structured-output pipeline operates as follows:
$$\text{AI Request} \longrightarrow \text{Provider Runtime} \longrightarrow \text{Native or Prompted Generation} \longrightarrow \text{Safe Parsing} \longrightarrow \text{Zod Schema Validation} \longrightarrow \text{Bounded Retries} \longrightarrow \text{Validated Result}$$

The architecture enforces strict security protections (preventing prototype pollution, unbounded payload sizes, recursion DOS attacks, and code execution), guarantees project multi-tenant isolation, supports compatibility with Phase 131 streaming, and strictly maintains boundaries against V10 autonomous agents.

---

## 1. Architectural Architecture & Flow

```text
+---------------------------------------------------------------------------------------------------+
|                                        Desktop Renderer UI                                        |
|  - LocalGenerationPlaygroundCard: Enforce Structured Schema checkbox, target schema select,       |
|    live validation status badge, validation error listings, retry counters.                       |
+---------------------------------------------------------------------------------------------------+
                                                  |
                  desktopBridge.aiGeneration.generateStructured(input)
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                      Electron Preload Bridge                                      |
|  - generateStructured(), validateStructured(), getStructuredCapabilities()                         |
+---------------------------------------------------------------------------------------------------+
                                                  |
                    IPC: 'desktop:ai:structured:generate', 'validate', 'get-capabilities'
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                     Electron Main Process IPC                                     |
|  - isTrustedIpcSender() security boundary                                                         |
|  - assertAuthenticated() session guard                                                            |
|  - Zod request validation                                                                         |
|  - Deterministic DesktopErrorCode mapping                                                          |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                      StructuredOutputService                                      |
|  - Schema resolution & prompt augmentation                                                        |
|  - Native vs Prompted capability routing                                                          |
|  - V9StructuredOutputParser: safe extraction (fences/whitespace/bounds/prototype defense)           |
|  - StructuredOutputRegistry: versioned Zod schemas (TestPlan, BugReportSummary, etc.)               |
|  - Controlled bounded retry loop with targeted error correction prompts                           |
|  - Stream accumulation & terminal validation (streamAndValidate)                                  |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                   LocalGenerationRuntimeService                                   |
|  - Provider readiness verification                                                                |
|  - Multi-tenant project boundary check (assertProjectAccess)                                      |
|  - Cooperative abort signal propagation                                                           |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Core Components

### 2.1 StructuredOutputRegistry (`packages/core`)
Provides explicit, versionable schema registrations powered by Zod.
Built-in canonical schemas include:
1. **`TestPlan` (v1):**
   * `name`: string (1..256 chars)
   * `objective`: string (1..2000 chars)
   * `steps[]`: array of steps (1..100)
     * `action`: string
     * `target`: string
     * `expected`: string
   * `metadata`: optional record
2. **`BugReportSummary` (v1):**
   * `title`: string
   * `severity`: `'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'`
   * `component`: string
   * `summary`: string
   * `reproductionSteps[]`: string array
   * `expectedBehavior`: string
   * `actualBehavior`: string
3. **`ClassificationResult` (v1):**
   * `category`: string
   * `confidence`: number (0..1)
   * `tags[]`: string array
   * `reasoning`: string

### 2.2 V9StructuredOutputParser (`packages/core`)
Safe JSON parsing without code execution:
* Strips markdown fences (````json ... ```` or ```` ... ````).
* Extracts outermost balanced JSON objects or arrays.
* Bounded trailing-comma repair for simple syntax flaws.
* Rejects oversized payloads exceeding configured limits (`STRUCTURED_PAYLOAD_TOO_LARGE`).
* Rejects deeply nested payloads exceeding recursion limits (`STRUCTURED_NESTING_TOO_DEEP`).
* Strips `__proto__`, `constructor`, and `prototype` keys recursively to prevent prototype pollution.

### 2.3 StructuredOutputService (`packages/core`)
* Resolves provider capabilities (`NATIVE`, `PROMPTED`, `UNSUPPORTED`, `UNKNOWN`).
* Injects schema specifications and formatting instructions into model prompts.
* Validates responses against Zod schemas, producing standardized `StructuredValidationStatus` codes:
  * `VALID`: Object passed schema safeParse.
  * `INVALID`: Object parsed as JSON but failed schema constraints.
  * `PARSE_ERROR`: Raw string is not valid JSON.
  * `EMPTY`: Model output is empty or whitespace only.
  * `TRUNCATED`: Output was cut off before closing braces.
  * `UNSUPPORTED`: Provider or capability missing.
* Orchestrates bounded error-correction retries (up to `maxRetries`, default 2):
  * If initial output is `INVALID` or `PARSE_ERROR`, generates a targeted correction prompt citing specific field errors.
  * If retries succeed, returns `VALID` with `retryCount`.
  * If all retries fail, returns `INVALID` with diagnostic error details and preserved raw output without crashing or hanging.
* Compatible with Phase 131 streaming (`streamAndValidate`), safely accumulating chunks and performing terminal validation upon completion.

---

## 3. Data Contracts & IPC (`packages/contracts`)

### New IPC Channels (`DESKTOP_CHANNELS`):
* `AI_STRUCTURED_GENERATE`: `'desktop:ai:structured:generate'`
* `AI_STRUCTURED_VALIDATE`: `'desktop:ai:structured:validate'`
* `AI_STRUCTURED_GET_CAPABILITIES`: `'desktop:ai:structured:get-capabilities'`

### New Desktop Error Codes (`DesktopErrorCode`):
* `STRUCTURED_SCHEMA_INVALID`
* `STRUCTURED_PARSE_ERROR`
* `STRUCTURED_VALIDATION_FAILED`
* `STRUCTURED_MAX_RETRIES_EXCEEDED`
* `STRUCTURED_CAPABILITY_UNSUPPORTED`
* `STRUCTURED_PAYLOAD_TOO_LARGE`
* `STRUCTURED_NESTING_TOO_DEEP`

---

## 4. Test Verification & Certification Results

All 129 tests across all 7 V9 AI Provider certification suites and all 136 desktop tests pass with 100% success rate:

* **Phase 132 Certification Suite (`packages/core/src/ai-provider/certification/v9-phase132-certification.test.ts`):** 24/24 passed
  * Parsing Engine: Clean JSON, markdown fences, whitespace tolerance, malformed JSON recovery, empty output, truncated output detection.
  * Schema Invariants: Compliant TestPlan v1, missing required fields, wrong primitive types, invalid enum values, invalid items in nested step arrays, unregistered schema error.
  * Provider Capabilities: Native detection for Ollama/Emulated, unsupported detection for unregistered providers.
  * Bounded Retries: Valid first attempt, invalid then valid on correction attempt, retries exhausted with diagnostic errors preserved, cooperative cancellation abort.
  * Streaming: Incremental accumulation with terminal structured validation.
  * Security & Isolation: Oversized payload rejection, recursion depth limit enforcement, prototype pollution defense, multi-tenant project isolation.
* **Full V9 AI Provider Suites (Phases 126–132):** 129/129 passed.
* **Desktop Application Test Suite:** 136/136 passed.
* **Desktop Smoke Test:** PASSED cleanly.

---

## 5. Scope Boundaries

* **No Autonomous Agents:** Autonomous planning loops, tool execution loops, terminal agents, and autonomous code patch repair were strictly excluded (reserved for V10).
* **Safe Output Handling:** Model output is strictly parsed and schema-validated data; it is never evaluated or executed as code.
