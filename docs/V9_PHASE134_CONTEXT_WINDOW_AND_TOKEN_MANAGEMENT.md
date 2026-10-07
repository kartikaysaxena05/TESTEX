# V9 Phase 134 — Context Window & Token Management Layer

## 1. Architectural Summary

Phase 134 implements the production-safe **Context Window & Token Management Layer** for the V9 AI Runtime:

```text
Raw Context
   ↓
Normalize
   ↓
Estimate Tokens
   ↓
Rank by Relevance/Priority (P1 → P10)
   ↓
Apply Budget: [Context Window - Reserved Output - Safety Margin]
   ↓
Build Final Context
   ↓
Validate Token Budget
   ↓
AI Provider
```

### Core Invariants Maintained:
1. **Safety Margin & Output Reservation**: Model context windows are never overcommitted. Available input budget is calculated strictly via:
   $$\text{Available Input Budget} = \text{Context Window} - \text{Reserved Output} - \text{Safety Margin}$$
2. **Deterministic Priority Ranking**: Strict priority tiers ensure essential items (P1 User Request, P2 System & Security instructions, P4 Requirements, P5 Test cases) are retained, while bulk items (P7 Repository code, P9 Conversation history) are systematically pruned first.
3. **Security Invariant**: System/security constraints (P2) and User Prompts (P1) are **mandatory** and can **never** be pruned or superseded by repository text or adversarial prompt injections.
4. **Oversized Request Rejection**: If mandatory prompt context exceeds the available input budget, requests are cleanly rejected with structured diagnostic metadata (`CONTEXT_TOO_LARGE`) rather than silent truncation.
5. **Multi-Tenant Isolation**: Cross-project and cross-user context operations are rejected with `AiCrossProjectAccessError` (`PERMISSION_DENIED`).
6. **No Autonomous Loop**: Pure compatibility and budget management layer only — tool loops and agent planning remain reserved for V10.

---

## 2. Contracts & IPC Channels

### Channels
- `DESKTOP_CHANNELS.AI_CONTEXT_ESTIMATE_TOKENS`: `'desktop:ai:context:estimate-tokens'`
- `DESKTOP_CHANNELS.AI_CONTEXT_CALCULATE_BUDGET`: `'desktop:ai:context:calculate-budget'`
- `DESKTOP_CHANNELS.AI_CONTEXT_OPTIMIZE_SELECTION`: `'desktop:ai:context:optimize-selection'`
- `DESKTOP_CHANNELS.AI_CONTEXT_GET_CAPABILITIES`: `'desktop:ai:context:get-capabilities'`

### Error Codes
- `CONTEXT_TOO_LARGE`: Context size exceeds model budget.
- `TOKEN_BUDGET_EXCEEDED`: General budget violation during context preparation.
- `CONTEXT_SELECTION_FAILED`: Optimization pipeline failure.
- `TOKEN_ESTIMATION_FAILED`: Heuristic or tokenizer failure.
- `OUTPUT_RESERVATION_EXCEEDED`: Requested output reservation exceeds model limits.

### Types & Schemas
- `ContextPriorityLevel`: `P1_USER_REQUEST`, `P2_SYSTEM_SECURITY`, `P3_TASK_CONTEXT`, `P4_REQUIREMENT`, `P5_TEST_CASE`, `P6_FAILURE_EVIDENCE`, `P7_REPOSITORY_CODE`, `P8_PROJECT_METADATA`, `P9_CONVERSATION_HISTORY`, `P10_BACKGROUND_INFO`.
- `OutputReservationSize`: `SMALL` (512 tokens), `MEDIUM` (2,048 tokens), `LARGE` (4,096 tokens), `CUSTOM` (configurable).
- `ContextBudgetDto`: Model context window, reserved output, safety margin, and available input budget.
- `OptimizedContextSelectionResultDto`: Assembled prompt, selected items, omitted items, budget breakdown, and reduction indicators.

---

## 3. Core Implementation

### Token Estimator (`packages/core/src/ai-provider/token-estimator.ts`)
- `TokenEstimatorService`: Centralized deterministic estimation using ~3.8 chars/token baseline.
- `estimateString(text)`: Estimates token counts for arbitrary strings.
- `estimateTools(tools)`: Formats and calculates envelope and JSON overhead for tool definitions.
- `estimateProjectContext(context)`: Granular breakdown for unified project context (repo, requirements, tests, environment, metadata).
- `estimateMessages(messages)`: Accounts for role wrappers and message separator overhead.

### Context Window Manager (`packages/core/src/ai-provider/context-window-manager.ts`)
- `ContextWindowManager`: Orchestrates capability resolution, budget calculation, and priority pruning.
- Resolves model capabilities from provider discovery (Ollama `/api/tags`) or documented safe fallbacks (8,192 default, 32,768 for Qwen/Mistral, 128,000 for Llama 3.1/3.3).
- Implements reverse chronological retention for conversation history (P9).
- Formats final assembled prompt with structured Markdown headers (`### REQUIREMENTS`, `### TEST_CASES`, etc.).

---

## 4. Verification & Certification

All tests pass cleanly:
- `v9-phase134-certification.test.ts`: 16/16 tests passing across all 7 verification categories.
- `generation-handlers.test.ts`: 36/36 tests passing (including IPC sender validation, authentication, and error translation).
- `preload.test.ts`: 36/36 tests passing (verifying typed desktop bridge exposure).
- Smoke Launcher: Passed with code 0.
- V9 Certification Suites (Phases 126 through 134): 171/171 tests passing with zero regressions.
