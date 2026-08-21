/**
 * Test Case Subsystem Bounds, Types & Interfaces.
 */

export const TEST_CASE_BOUNDS = {
  MAX_TITLE_LENGTH: 255,
  MAX_OBJECTIVE_LENGTH: 10000,
  MAX_DESCRIPTION_LENGTH: 10000,
  MAX_EXPECTED_RESULT_LENGTH: 10000,
  MAX_PRECONDITIONS: 50,
  MAX_PRECONDITION_DESCRIPTION_LENGTH: 2000,
  MAX_STEPS: 100,
  MAX_STEP_ACTION_LENGTH: 2000,
  MAX_STEP_EXPECTED_RESULT_LENGTH: 2000,
  MAX_TEST_DATA_ITEMS: 100,
  MAX_TEST_DATA_NAME_LENGTH: 256,
  MAX_TEST_DATA_CONSTRAINT_LENGTH: 1000,
  MAX_ASSUMPTIONS: 50,
  MAX_ASSUMPTION_LENGTH: 1000,
  MAX_UNKNOWNS: 50,
  MAX_TAGS: 20,
  MAX_TAG_LENGTH: 64,
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
} as const;

export interface TestCaseProvenanceInput {
  readonly generationId?: string | null;
  readonly inputFingerprint?: string | null;
  readonly providerId?: string | null;
  readonly model?: string | null;
  readonly promptId?: string | null;
  readonly promptVersion?: number | null;
}
