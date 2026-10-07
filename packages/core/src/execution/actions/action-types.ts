/**
 * @file packages/core/src/execution/actions/action-types.ts
 * Type definitions, bounds, action execution context, and result contracts for the Action Execution Engine (V5 Phase 63).
 */

import type { Page, BrowserContext } from 'playwright';
import type {
  ExecutableActionType,
  ExecutablePlanStepDto,
  ExecutableTargetDescriptorDto,
  ExecutableValueReferenceDto,
  ActionExecutionStatus,
  ActionRiskLevel,
  ActionResultDto,
  StepExecutionResultDto,
  ProjectEnvironmentDto,
} from '@ai-quality/contracts';
import type { BrowserExecutionSession } from '../sessions/session-types.js';

export const ACTION_BOUNDS = {
  DEFAULT_ACTION_TIMEOUT_MS: 30000,
  MAX_ACTION_TIMEOUT_MS: 120000,
  MIN_ACTION_TIMEOUT_MS: 100,
  MAX_TYPE_DELAY_MS: 500,
  DEFAULT_TYPE_DELAY_MS: 30,
  MAX_SCROLL_AMOUNT_PX: 10000,
  MAX_UPLOAD_SIZE_BYTES: 25 * 1024 * 1024, // 25 MB max upload file size
} as const;

/**
 * Allowed Playwright keyboard keys for PRESS_KEY / PRESS action.
 */
export const ALLOWED_PLAYWRIGHT_KEYS: readonly string[] = [
  'Enter',
  'Tab',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Backspace',
  'Delete',
  'Space',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'Insert',
  'Control',
  'Alt',
  'Shift',
  'Meta',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
] as const;

/**
 * Runtime execution context supplied to each ActionHandler.
 */
export interface ActionExecutionContext {
  readonly projectId: string;
  readonly testRunId: string;
  readonly testCaseId?: string;
  readonly stepId?: string;
  readonly session: BrowserExecutionSession;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly environment?: ProjectEnvironmentDto | null;
  readonly baseUrl?: string | null;
  readonly abortSignal?: AbortSignal;
  readonly allowDestructive?: boolean;
  readonly secrets?: Record<string, string>;
}

/**
 * Interface implemented by every action handler.
 */
export interface IActionHandler {
  readonly actionType: ExecutableActionType;
  readonly riskLevel: ActionRiskLevel;
  execute(action: ExecutablePlanStepDto, context: ActionExecutionContext): Promise<ActionResultDto>;
}

/**
 * Options for executing a sequence of steps.
 */
export interface StepExecutionSequenceOptions {
  readonly stopOnFailure?: boolean;
  readonly allowDestructive?: boolean;
  readonly abortSignal?: AbortSignal;
}

export {
  type ExecutableActionType,
  type ExecutablePlanStepDto,
  type ExecutableTargetDescriptorDto,
  type ExecutableValueReferenceDto,
  type ActionExecutionStatus,
  type ActionRiskLevel,
  type ActionResultDto,
  type StepExecutionResultDto,
};
