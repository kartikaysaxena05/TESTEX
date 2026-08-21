/**
 * @file packages/core/src/test-review/test-review-types.ts
 * Type definitions, bounds, and constants for Phase 56 Test Review, Approval, Regeneration & Versioning.
 */

export const TEST_REVIEW_BOUNDS = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MAX_TITLE_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_CHANGE_REASON_LENGTH: 500,
  MAX_REVIEW_COMMENT_LENGTH: 2000,
  MAX_REGENERATION_INSTRUCTIONS_LENGTH: 2000,
} as const;

export interface TestReviewServiceDependencies {
  readonly prisma: import('@prisma/client').PrismaClient;
  readonly logger?: import('../logging/index.js').ILogger;
  readonly aiProviderGateway?: import('../ai/index.js').AiProviderGateway;
  readonly aiPromptExecutionService?: import('../ai/index.js').AiPromptExecutionService;
  readonly testCaseGenerationService?: any;
  readonly testValidationService?: any;
  readonly testCaseService?: any;
}
