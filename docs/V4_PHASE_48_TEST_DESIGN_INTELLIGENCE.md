# V4 Phase 48 — Test Design Intelligence Foundation

## Executive Summary

Phase 48 establishes the **Test Design Intelligence Foundation** within the AI-Driven Software Quality Engineering Platform. It answers the foundational question:

> **"Given an Authoritative Requirement + V3 Requirement Intelligence + Phase 47 Grounded AI Analysis + Retrieved Multi-Source Context, WHAT testing strategy, dimensions, techniques, coverage objectives, test levels, and risk priorities should be applied?"**

Phase 48 produces rigorous **test design guidance** (the structural blueprint of testing), **NOT** finished test scenarios (Phase 49) or concrete executable test cases (Phase 50).

---

## Key Architecture & Core Principles

### 1. Hybrid Deterministic + Controlled AI Architecture

- **Deterministic Baseline (`test-design-rules-v1`)**:
  - Automatically identifies numerical boundaries, equivalence partitions, role/permission access controls, decision tables, state machines, latency thresholds, and negative prohibitions directly from requirement text and V3 metadata.
- **Controlled LLM Synthesis (`test.design.intelligence:1`)**:
  - Enriches, groups, and maps high-level strategy and coverage objectives.
  - LLM synthesis strictly preserves the deterministic baseline without dropping valid evidence-backed recommendations.

### 2. Evidence Grounding & Citation Validation

- All recommended dimensions, techniques, and coverage objectives must cite authoritative evidence IDs (`requirementKey`, `requirementId`, or retrieved RAG context item IDs).
- The `TestDesignValidator` strips and flags ungrounded, fabricated, or hallucinated evidence references.

### 3. Quantitative & Modality Preservation

- Numeric constraints (e.g., `500 ms`, `18 to 60 inclusive`, `5 attempts`, `₹10,000`, `10%`) are extracted and preserved with zero unit loss or number mutation.
- Prohibitions and negative modalities (`shall not`, `must not`, `never`) explicitly trigger the `NEGATIVE` dimension, `NEGATIVE_TESTING` technique, and security authorization coverage objectives.

### 4. Concurrency & Staleness Protection

- An input fingerprint (`SHA-256`) guarantees cache reuse when requirement statements, V3 intelligence, and retrieved context remain unchanged.
- Concurrency detection checks `Requirement.updatedAt`: if a requirement is edited while an AI call is in-flight, the resulting test design is automatically persisted as `STALE` with `staleAt` populated, preventing stale recommendations from becoming `CURRENT`.

### 5. Strict Non-Generative Boundary

- Phase 48 **NEVER** generates concrete `TestCase` records, executable Playwright scripts, test steps, or traceability matrix links.

---

## Database Model (`RequirementTestDesign`)

```prisma
enum TestDesignStatus {
  CURRENT
  STALE
  FAILED
  REQUIRES_REVIEW
  INSUFFICIENT_INFORMATION
}

enum TestDesignApplicability {
  APPLICABLE
  PARTIALLY_APPLICABLE
  REQUIRES_CLARIFICATION
  INSUFFICIENT_INFORMATION
  NOT_TESTABLE
}

enum AutomationSuitability {
  HIGH
  MEDIUM
  LOW
  UNKNOWN
}

model RequirementTestDesign {
  id                        String                   @id @default(uuid())
  projectId                 String                   @map("project_id")
  requirementId             String                   @map("requirement_id")
  requirementVersionId      String?                  @map("requirement_version_id")
  requirementVersionNumber  Int                      @map("requirement_version_number")
  status                    TestDesignStatus         @default(CURRENT)
  applicability             TestDesignApplicability  @default(APPLICABLE)
  automationSuitability     AutomationSuitability    @default(UNKNOWN) @map("automation_suitability")
  inputFingerprint          String                   @map("input_fingerprint")
  engineVersion             String                   @map("engine_version")
  promptTemplateVersion     Int                      @map("prompt_template_version")
  providerId                String                   @map("provider_id")
  model                     String                   @map("model")
  structuredDesignJson      Json                     @map("structured_design_json")
  usageJson                 Json                     @map("usage_json")
  durationMs                Int                      @map("duration_ms")
  errorMessage              String?                  @map("error_message")
  createdAt                 DateTime                 @default(now()) @map("created_at")
  updatedAt                 DateTime                 @updatedAt @map("updated_at")
  staleAt                   DateTime?                @map("stale_at")

  project                   Project                  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  requirement               Requirement              @relation(fields: [requirementId], references: [id], onDelete: Cascade)
  requirementVersion        RequirementVersion?      @relation(fields: [requirementVersionId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([requirementId, status])
  @@index([inputFingerprint])
  @@map("requirement_test_designs")
}
```

---

## IPC Channels & Desktop Integration

| Channel                 | Input DTO                      | Output DTO                     | Description                                     |
| ----------------------- | ------------------------------ | ------------------------------ | ----------------------------------------------- |
| `testDesign:analyze`    | `AnalyzeTestDesignInputDto`    | `TestDesignPlanDto`            | Generates or retrieves cached test design plan  |
| `testDesign:getCurrent` | `GetTestDesignInputDto`        | `TestDesignPlanDto \| null`    | Fetches current test design plan                |
| `testDesign:getHistory` | `GetTestDesignHistoryInputDto` | `readonly TestDesignPlanDto[]` | Lists historical test design plans              |
| `testDesign:regenerate` | `RegenerateTestDesignInputDto` | `TestDesignPlanDto`            | Forces regeneration, marking prior plan `STALE` |

---

## Verification & Test Results

- **Unit & Integration Test Suites**:
  - `deterministic-rules-engine.test.ts`: Range rules, role restrictions, latency bounds, decision tables, state machines, negations, ambiguities, and brief statements.
  - `test-design-prompt-definition.test.ts`: Untrusted data delimiters and Zod schema validation.
  - `test-design-validator.test.ts`: Grounding citation validation, ungrounded ID stripping, and deduplication.
  - `test-design-service.test.ts`: End-to-end service execution with PostgreSQL and FakeAiProvider, verifying cache hits, regeneration, history, and zero test case generation.
  - `test-design-security.test.ts`: Multi-tenant isolation, archived project protection, prompt injection defense, and mid-flight concurrent race protection.
  - `test-design-handlers.test.ts`: Desktop IPC handler validation and error mapping.
- **Monorepo Suite Summary**:
  - Total Tests: **943 passing / 0 failing** across **149 test files** and **257 test suites**.
  - TypeScript Typecheck: Clean (`0 errors`).
  - ESLint: Clean (`0 errors`).
  - Prettier Formatting: Clean (`0 errors`).
  - Desktop Production Build: Built successfully with Vite & esbuild sandboxed preload.
  - Desktop Smoke Test: Successfully launched and verified.
