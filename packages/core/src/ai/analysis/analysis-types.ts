/**
 * @file packages/core/src/ai/analysis/analysis-types.ts
 * Constants, prompt IDs, and versions for LLM Requirement Analysis subsystem.
 */

export const REQUIREMENT_ANALYSIS_PROMPT_ID = 'requirement.reasoning.analysis';
export const REQUIREMENT_ANALYSIS_PROMPT_VERSION = 1;
export const REQUIREMENT_ANALYSIS_SCHEMA_VERSION = 1;

export const ANALYSIS_DEFAULT_CONFIG = {
  temperature: 0.1,
  maxTokens: 4000,
  timeoutMs: 60000,
} as const;
