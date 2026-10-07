/**
 * @file packages/core/src/index.ts
 * Application domain and service orchestration layer.
 *
 * CRITICAL ARCHITECTURAL RULE:
 * This package orchestrates privileged domain operations (repository intelligence,
 * requirement processing, test planning, failure triage) and sits strictly behind
 * the Electron main process / secure IPC boundary.
 *
 * It must NEVER import React or UI components.
 */

import { CONTRACT_VERSION, type PlatformMetadata } from '@ai-quality/contracts';

/**
 * Core application runtime status descriptor.
 */
export interface CoreRuntimeInfo {
  readonly name: string;
  readonly version: string;
  readonly contractVersion: string;
  readonly isInitialized: boolean;
}

/**
 * Inspect core subsystem runtime status without performing uninitialized domain operations.
 */
export function getCoreRuntimeInfo(): CoreRuntimeInfo {
  return {
    name: 'ai-quality-core',
    version: '0.1.0',
    contractVersion: CONTRACT_VERSION,
    isInitialized: true,
  };
}

/**
 * Core metadata builder conforming to shared contracts.
 */
export function createPlatformStatus(): PlatformMetadata {
  return {
    platformName: 'AI-Driven Software Quality Engineering Platform',
    phase: 'V3 - Phase 31: Requirement Identity, Keys & Lifecycle',
    status: 'initialized',
    timestamp: new Date().toISOString(),
  };
}

export * from './database/index.js';
export * from './projects/index.js';
export * from './sources/index.js';
export * from './git/index.js';
export * from './requirements/index.js';
export * from './ai/index.js';
export * from './test-cases/index.js';
export * from './test-validation/index.js';
export * from './traceability/index.js';
export * from './coverage/index.js';
export * from './test-review/index.js';
export * from './execution/index.js';
export * from './environments/index.js';
export * from './logging/index.js';
export * from './failures/index.js';
export * from './jira/index.js';
export * from './email/index.js';
export * from './workflow/index.js';
export * from './reverification/index.js';
export * from './verification/index.js';
export * from './quick-fix/index.js';
export * from './localization/index.js';
export * from './patch/index.js';
export * from './retest/index.js';
export * from './post-fix/index.js';
export * from './audit/index.js';
export * from './qa-report/index.js';
export * from './auth/index.js';
export * from './settings/index.js';
export * from './website-targets/index.js';
export * from './git-repositories/index.js';
export * from './local-folders/index.js';
export * from './target-environments/index.js';
export * from './ai-provider/ai-provider-contract.js';
export * from './ai-provider/ai-provider-validator.js';
export * from './ai-provider/ollama-provider-adapter.js';
export * from './ai-provider/ollama-health-service.js';
export * from './ai-provider/ollama-installation-detector.js';
export * from './ai-provider/model-discovery-service.js';
export * from './ai-provider/capability-detection-service.js';
export * from './ai-provider/model-selection-service.js';
export * from './ai-provider/emulated-ai-provider.js';
export * from './ai-provider/local-generation-runtime.js';
export * from './ai-provider/ai-provider-service.js';
export {
  AiProviderAuthError,
  AiModelUnavailableError,
  AiInvalidResponseError,
  AiProviderError,
  AiUnknownError,
  AiCrossProjectAccessError,
  AiConfigInvalidError,
  AiConfigNotFoundError,
  AiModelNotFoundError,
  AiNoCompatibleModelError,
  AiCapabilityUnsupportedError,
  AiCapabilityUnknownError,
  AiCapabilityProbeTimeoutError,
  AiCapabilityProbeFailedError,
  AiSelectionInvalidError,
  AiConnectionError,
  AiGenerationError,
  AiStructuredSchemaInvalidError,
  AiStructuredParseError,
  AiStructuredValidationError,
  AiStructuredMaxRetriesExceededError,
  AiStructuredSecurityViolationError,
  AiToolNotFoundError,
  AiToolDuplicateError,
  AiToolSchemaInvalidError,
  AiToolArgumentsInvalidError,
  AiToolCallParseError,
  AiToolExecutionProhibitedError,
  AiContextTooLargeError,
  AiOutputReservationExceededError,
  AiTokenBudgetExceededError,
  AiRemoteProviderBlockedError,
  AiPrivacyViolationError,
  AiSecretDetectedError,
  AiFallbackExhaustedError,
  AiFallbackPolicyBlockedError,
  AiStreamTimeoutError,
  AiRuntimeRecoveryRequiredError,
  AiConcurrencyLimitExceededError,
} from './ai-provider/ai-provider-errors.js';
export * from './ai-provider/structured-output-registry.js';
export * from './ai-provider/structured-output-parser.js';
export * from './ai-provider/structured-output-service.js';
export * from './ai-provider/tool-registry.js';
export * from './ai-provider/tool-call-parser.js';
export * from './ai-provider/tool-calling-service.js';
export * from './ai-provider/token-estimator.js';
export * from './ai-provider/context-window-manager.js';
export * from './ai-provider/ai-privacy-service.js';
export * from './ai-provider/ai-provider-router-service.js';
export * from './ai-provider/ai-lifecycle-manager.js';
export { AiProviderRegistry as AiRuntimeProviderRegistry } from './ai-provider/ai-provider-registry.js';
export * from './project-context/index.js';
export * from './conversational-agent/index.js';
export * from './agent-runtime/index.js';
export * from './agent-threads/index.js';
export * from './agent-tools/index.js';
export * from './agent-permissions/index.js';
export * from './git-review/index.js';
export * from './terminal-gateway/index.js';
export * from './agent-planning/index.js';
export * from './agent-loop/index.js';
export * from './agent-activity/index.js';
export * from './agent-approval/index.js';
export * from './file-review/index.js';
export * from './agent-workflow/index.js';

