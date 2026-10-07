/**
 * @file apps/desktop/src/main/ipc/environment-handlers.ts
 * IPC handlers for Target Application & Test Environment Configuration (V5 Phase 59).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type TargetApplicationDto,
  type UpdateTargetApplicationInputDto,
  type ProjectEnvironmentDto,
  type CreateEnvironmentInput,
  type UpdateEnvironmentInput,
  type DeleteEnvironmentInput,
  type SetDefaultEnvironmentInput,
  type GetEnvironmentInputDto,
  type ListEnvironmentsInputDto,
  type CheckEnvironmentReachabilityInputDto,
  type EnvironmentReachabilityResultDto,
  type ResolveEnvironmentSnapshotInputDto,
  type ExecutionEnvironmentSnapshotDto,
  updateTargetApplicationSchema,
  createEnvironmentSchema,
  updateEnvironmentSchema,
  deleteEnvironmentSchema,
  setDefaultEnvironmentSchema,
  getEnvironmentInputSchema,
  listEnvironmentsInputSchema,
  checkEnvironmentReachabilitySchema,
  resolveEnvironmentSnapshotSchema,
} from '@ai-quality/contracts';
import {
  getTargetApplicationService,
  getEnvironmentConfigurationService,
  EnvironmentDomainError,
  TargetApplicationService,
  EnvironmentConfigurationService,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let testTargetAppService: TargetApplicationService | null = null;
let testEnvConfigService: EnvironmentConfigurationService | null = null;

export function setTargetAppServiceForTest(service: TargetApplicationService | null): void {
  testTargetAppService = service;
}

export function setEnvironmentServiceForTest(
  service: EnvironmentConfigurationService | null,
): void {
  testEnvConfigService = service;
}

function getTargetApp(): TargetApplicationService {
  return testTargetAppService ?? getTargetApplicationService();
}

function getEnvConfig(): EnvironmentConfigurationService {
  return testEnvConfigService ?? getEnvironmentConfigurationService();
}

function sanitizeErrorMessage(err: unknown): { code: any; message: string } {
  if (err instanceof EnvironmentDomainError) {
    return {
      code: err.code,
      message: err.message.replace(/\/[\w.-]+/g, '[path]').slice(0, 300),
    };
  }
  const message = err instanceof Error ? err.message : 'Unknown environment operation failure';
  return {
    code: 'INTERNAL_ERROR',
    message: message.replace(/\/[\w.-]+/g, '[path]').slice(0, 300),
  };
}

/**
 * IPC handler for getting target application for a project.
 */
export async function handleGetTargetApplication(
  event: IpcMainInvokeEvent,
  projectId: string,
): Promise<DesktopResult<TargetApplicationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  try {
    const service = getTargetApp();
    const result = await service.getTargetApplication(projectId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeErrorMessage(err) };
  }
}

/**
 * IPC handler for updating target application metadata for a project.
 */
export async function handleUpdateTargetApplication(
  event: IpcMainInvokeEvent,
  input: UpdateTargetApplicationInputDto,
): Promise<DesktopResult<TargetApplicationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parsed = updateTargetApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      },
    };
  }

  try {
    const service = getTargetApp();
    const result = await service.updateTargetApplication(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeErrorMessage(err) };
  }
}

/**
 * IPC handler for listing environments for a project.
 */
export async function handleListEnvironments(
  event: IpcMainInvokeEvent,
  input: ListEnvironmentsInputDto,
): Promise<DesktopResult<readonly ProjectEnvironmentDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parsed = listEnvironmentsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      },
    };
  }

  try {
    const service = getEnvConfig();
    const result = await service.listEnvironments(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeErrorMessage(err) };
  }
}

/**
 * IPC handler for getting an environment by ID.
 */
export async function handleGetEnvironment(
  event: IpcMainInvokeEvent,
  input: GetEnvironmentInputDto,
): Promise<DesktopResult<ProjectEnvironmentDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parsed = getEnvironmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      },
    };
  }

  try {
    const service = getEnvConfig();
    const result = await service.getEnvironment(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeErrorMessage(err) };
  }
}

/**
 * IPC handler for creating an environment.
 */
export async function handleCreateEnvironment(
  event: IpcMainInvokeEvent,
  input: CreateEnvironmentInput,
): Promise<DesktopResult<ProjectEnvironmentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parsed = createEnvironmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      },
    };
  }

  try {
    const service = getEnvConfig();
    const result = await service.createEnvironment(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeErrorMessage(err) };
  }
}

/**
 * IPC handler for updating an environment.
 */
export async function handleUpdateEnvironment(
  event: IpcMainInvokeEvent,
  input: UpdateEnvironmentInput,
): Promise<DesktopResult<ProjectEnvironmentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parsed = updateEnvironmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      },
    };
  }

  try {
    const service = getEnvConfig();
    const result = await service.updateEnvironment(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeErrorMessage(err) };
  }
}

/**
 * IPC handler for deleting an environment.
 */
export async function handleDeleteEnvironment(
  event: IpcMainInvokeEvent,
  input: DeleteEnvironmentInput,
): Promise<DesktopResult<{ readonly deleted: true }>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parsed = deleteEnvironmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      },
    };
  }

  try {
    const service = getEnvConfig();
    const result = await service.deleteEnvironment(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeErrorMessage(err) };
  }
}

/**
 * IPC handler for setting default environment.
 */
export async function handleSetDefaultEnvironment(
  event: IpcMainInvokeEvent,
  input: SetDefaultEnvironmentInput,
): Promise<DesktopResult<ProjectEnvironmentDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parsed = setDefaultEnvironmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      },
    };
  }

  try {
    const service = getEnvConfig();
    const result = await service.setDefaultEnvironment(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeErrorMessage(err) };
  }
}

/**
 * IPC handler for preflight reachability verification.
 */
export async function handleCheckEnvironmentReachability(
  event: IpcMainInvokeEvent,
  input: CheckEnvironmentReachabilityInputDto,
): Promise<DesktopResult<EnvironmentReachabilityResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parsed = checkEnvironmentReachabilitySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      },
    };
  }

  try {
    const service = getEnvConfig();
    const result = await service.checkReachability(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeErrorMessage(err) };
  }
}

/**
 * IPC handler for resolving immutable execution environment snapshot.
 */
export async function handleResolveEnvironmentSnapshot(
  event: IpcMainInvokeEvent,
  input: ResolveEnvironmentSnapshotInputDto,
): Promise<DesktopResult<ExecutionEnvironmentSnapshotDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parsed = resolveEnvironmentSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      },
    };
  }

  try {
    const service = getEnvConfig();
    const result = await service.resolveSnapshot(parsed.data);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: sanitizeErrorMessage(err) };
  }
}
