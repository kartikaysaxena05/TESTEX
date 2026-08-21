/**
 * @file packages/core/src/ai/categorized-tests/categorized-test-types.ts
 * V4 Phase 50: Categorized Test Generation Constants and Internal Types.
 */

export const CATEGORIZED_TESTS_PROMPT_ID = 'requirement.categorized-test-generation';
export const CATEGORIZED_TESTS_PROMPT_VERSION = 1;

export const CATEGORIZED_TEST_LIMITS = {
  MAX_TESTS_PER_SCENARIO: 8,
  MAX_TOTAL_TESTS: 30,
  MAX_TITLE_LENGTH: 255,
  MAX_OBJECTIVE_LENGTH: 2000,
  MAX_RATIONALE_LENGTH: 2000,
  MAX_WARNINGS: 20,
} as const;

export interface CategorizedTestPromptVariables {
  readonly requirementKey: string;
  readonly requirementTitle: string;
  readonly requirementText: string;
  readonly requirementType: string;
  readonly requirementPriority: string;
  readonly testabilityStatus: string;
  readonly scenariosJson: string;
  readonly aiRequirementAnalysisJson: string;
  readonly testDesignIntelligenceJson: string;
  readonly retrievedContextJson: string;
}

export interface CategorizedTestValidationContext {
  readonly requirementKey: string;
  readonly requirementId: string;
  readonly requirementText: string;
  readonly validEvidenceRefIds: ReadonlySet<string>;
  readonly validScenarioIds: ReadonlySet<string>;
}
