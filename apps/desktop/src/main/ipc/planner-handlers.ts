/**
 * @file apps/desktop/src/main/ipc/planner-handlers.ts
 * Privileged IPC handlers for V10 Phase 152: Multi-Step Planning.
 *
 * Exposes strictly typed boundary handlers for:
 * 1. createPlan
 * 2. getPlan
 * 3. listPlans
 * 4. getActivePlan
 * 5. addStep
 * 6. removeStep
 * 7. reorderSteps
 * 8. modifyStep
 * 9. setStepStatus
 * 10. setPlanStatus
 *
 * Validates every input at the IPC boundary and enforces sender origin verification.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type AgentPlanExecutionDto,
  type DesktopError,
  type DesktopResult,
  createAgentPlanInputSchema,
  getAgentPlanInputSchema,
  listAgentPlansInputSchema,
  getActiveAgentPlanInputSchema,
  addAgentPlanStepInputSchema,
  removeAgentPlanStepInputSchema,
  reorderAgentPlanStepsInputSchema,
  modifyAgentPlanStepInputSchema,
  setAgentPlanStepStatusInputSchema,
  setAgentPlanStatusInputSchema,
} from '@ai-quality/contracts';
import {
  AgentPlanService,
  AgentPlanError,
  AgentPlanNotFoundError,
  AgentPlanStepNotFoundError,
  AgentPlanStepDuplicateError,
  AgentPlanValidationError,
  AgentPlanCircularDependencyError,
  AgentPlanVersionConflictError,
  AgentPlanInvalidStateError,
  AgentPlanCrossProjectAccessError,
  UnauthorizedError,
  getPrismaClient,
} from '@ai-quality/core';
import { ZodError } from 'zod';
import { isTrustedIpcSender } from './sender-validation.js';
import { assertAuthenticated } from './auth-handlers.js';

let defaultAgentPlanService: AgentPlanService | null = null;

export function resolveAgentPlanService(): AgentPlanService {
  if (!defaultAgentPlanService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available for AgentPlanService.');
    }
    defaultAgentPlanService = new AgentPlanService({ prisma });
  }
  return defaultAgentPlanService;
}

export function setAgentPlanServiceForTest(service: AgentPlanService | null): void {
  defaultAgentPlanService = service;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string> {
  if (!event) {
    throw new UnauthorizedError('Authentication required.');
  }
  const user = await assertAuthenticated(event);
  return user.userId;
}

function sanitizeError(err: unknown): DesktopError {
  if (err instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: `IPC validation failed: ${err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
    };
  }

  if (err instanceof AgentPlanNotFoundError) {
    return { code: 'AGENT_PLAN_NOT_FOUND', message: err.message };
  }
  if (err instanceof AgentPlanStepNotFoundError) {
    return { code: 'AGENT_PLAN_STEP_NOT_FOUND', message: err.message };
  }
  if (err instanceof AgentPlanStepDuplicateError) {
    return { code: 'AGENT_PLAN_STEP_DUPLICATE', message: err.message };
  }
  if (err instanceof AgentPlanCircularDependencyError) {
    return { code: 'AGENT_PLAN_CIRCULAR_DEPENDENCY', message: err.message };
  }
  if (err instanceof AgentPlanValidationError) {
    return { code: 'AGENT_PLAN_VALIDATION_ERROR', message: err.message };
  }
  if (err instanceof AgentPlanVersionConflictError) {
    return { code: 'AGENT_PLAN_VERSION_CONFLICT', message: err.message };
  }
  if (err instanceof AgentPlanInvalidStateError) {
    return { code: 'AGENT_PLAN_INVALID_STATE', message: err.message };
  }
  if (err instanceof AgentPlanCrossProjectAccessError) {
    return { code: 'AGENT_PLAN_CROSS_PROJECT_ACCESS', message: err.message };
  }
  if (err instanceof UnauthorizedError) {
    return { code: 'AUTHENTICATION_FAILED', message: err.message };
  }
  if (err instanceof AgentPlanError) {
    return {
      code: (err.code as DesktopError['code']) || 'INTERNAL_ERROR',
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message,
  };
}

export async function handlePlannerCreatePlan(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentPlanExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = createAgentPlanInputSchema.parse(input);
    const service = resolveAgentPlanService();
    const result = await service.createPlan(validated, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handlePlannerGetPlan(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentPlanExecutionDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = getAgentPlanInputSchema.parse(input);
    const service = resolveAgentPlanService();
    const result = await service.getPlan(validated, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handlePlannerListPlans(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly AgentPlanExecutionDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = listAgentPlansInputSchema.parse(input);
    const service = resolveAgentPlanService();
    const result = await service.listPlans(validated, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handlePlannerGetActivePlan(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentPlanExecutionDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = getActiveAgentPlanInputSchema.parse(input);
    const service = resolveAgentPlanService();
    const result = await service.getActivePlan(validated, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handlePlannerAddStep(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentPlanExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = addAgentPlanStepInputSchema.parse(input);
    const service = resolveAgentPlanService();
    const result = await service.addStep(validated, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handlePlannerRemoveStep(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentPlanExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = removeAgentPlanStepInputSchema.parse(input);
    const service = resolveAgentPlanService();
    const result = await service.removeStep(validated, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handlePlannerReorderSteps(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentPlanExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = reorderAgentPlanStepsInputSchema.parse(input);
    const service = resolveAgentPlanService();
    const result = await service.reorderSteps(validated, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handlePlannerModifyStep(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentPlanExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = modifyAgentPlanStepInputSchema.parse(input);
    const service = resolveAgentPlanService();
    const result = await service.modifyStep(validated, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handlePlannerSetStepStatus(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentPlanExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = setAgentPlanStepStatusInputSchema.parse(input);
    const service = resolveAgentPlanService();
    const result = await service.setStepStatus(validated, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handlePlannerSetPlanStatus(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<AgentPlanExecutionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC invocation origin.' },
    };
  }
  try {
    const userId = await extractUser(event);
    const validated = setAgentPlanStatusInputSchema.parse(input);
    const service = resolveAgentPlanService();
    const result = await service.setPlanStatus(validated, userId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}
