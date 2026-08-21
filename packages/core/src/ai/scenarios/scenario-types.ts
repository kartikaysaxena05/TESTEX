/**
 * V4 Phase 49: Requirement-to-Test Scenario Generation Constants and Internal Types.
 */

export const SCENARIO_PROMPT_ID = 'requirement.test-scenario-generation';
export const SCENARIO_PROMPT_VERSION = 1;

export const SCENARIO_LIMITS = {
  MIN_SCENARIOS: 1,
  MAX_SCENARIOS: 12,
  MAX_TITLE_LENGTH: 200,
  MAX_OBJECTIVE_LENGTH: 1000,
  MAX_RATIONALE_LENGTH: 1000,
  MAX_ASPECT_LENGTH: 500,
  MAX_ASSUMPTIONS: 5,
  MAX_ASSUMPTION_LENGTH: 500,
  MAX_WARNINGS: 20,
} as const;

export interface ScenarioGenerationPromptVariables {
  readonly requirementKey: string;
  readonly requirementTitle: string;
  readonly requirementText: string;
  readonly requirementType: string;
  readonly requirementPriority: string;
  readonly aiRequirementAnalysisJson: string;
  readonly testDesignIntelligenceJson: string;
  readonly retrievedContextJson: string;
  readonly maxScenarios: number;
}

export interface ScenarioValidationContext {
  readonly requirementKey: string;
  readonly requirementId: string;
  readonly requirementText: string;
  readonly validEvidenceRefIds: ReadonlySet<string>;
}
