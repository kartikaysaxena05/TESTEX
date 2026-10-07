/**
 * @file apps/desktop/src/main/ipc/execution-handlers.ts
 * IPC handlers for Autonomous Test Execution & Playwright Runtime Foundation.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  runtimeSmokeInputSchema,
  validateTestEligibilityInputSchema,
  type DesktopResult,
  type ExecutionCapabilitiesDto,
  type RuntimeSmokeInputDto,
  type RuntimeSmokeResultDto,
  type TestEligibilityDto,
  type ValidateTestEligibilityInputDto,
} from '@ai-quality/contracts';
import {
  getPrismaClient,
  getLogger,
  TestExecutionService,
  ExecutionDomainError,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let serviceInstance: TestExecutionService | null = null;

export function getExecutionService(): TestExecutionService {
  if (serviceInstance) return serviceInstance;

  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Database client is not initialized.');
  }

  const logger = getLogger();
  serviceInstance = new TestExecutionService({ prisma, logger });
  return serviceInstance;
}

export function setExecutionServiceForTest(service: TestExecutionService | null): void {
  serviceInstance = service;
}

/**
 * IPC handler for querying execution runtime capabilities.
 */
export async function handleGetExecutionCapabilities(
  event: IpcMainInvokeEvent,
): Promise<DesktopResult<ExecutionCapabilitiesDto>> {
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
    const service = getExecutionService();
    const capabilities = await service.getCapabilities();
    return { ok: true, data: capabilities };
  } catch (err) {
    if (err instanceof ExecutionDomainError) {
      return { ok: false, error: err.toDesktopError() };
    }
    const message = err instanceof Error ? err.message : 'Failed to query execution capabilities';
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: message.replace(/\/[\w.-]+/g, '[path]').slice(0, 300),
      },
    };
  }
}

/**
 * IPC handler for executing a deterministic local Playwright runtime smoke verification.
 */
export async function handleRunRuntimeSmoke(
  event: IpcMainInvokeEvent,
  input?: RuntimeSmokeInputDto,
): Promise<DesktopResult<RuntimeSmokeResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const validated = runtimeSmokeInputSchema.safeParse(input ?? {});
  if (!validated.success) {
    return {
      ok: false,
      error: {
        code: 'EXECUTION_REQUEST_INVALID',
        message: 'Invalid runtime smoke parameters provided',
      },
    };
  }

  try {
    const service = getExecutionService();
    const result = await service.runRuntimeSmoke(validated.data);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof ExecutionDomainError) {
      return { ok: false, error: err.toDesktopError() };
    }
    const message = err instanceof Error ? err.message : 'Runtime smoke verification failed';
    return {
      ok: false,
      error: {
        code: 'BROWSER_RUNTIME_ERROR',
        message: message.replace(/\/[\w.-]+/g, '[path]').slice(0, 300),
      },
    };
  }
}

/**
 * IPC handler for validating test case eligibility against V4 lifecycle and staleness rules.
 */
export async function handleValidateTestEligibility(
  event: IpcMainInvokeEvent,
  input: ValidateTestEligibilityInputDto,
): Promise<DesktopResult<TestEligibilityDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const validated = validateTestEligibilityInputSchema.safeParse(input);
  if (!validated.success) {
    return {
      ok: false,
      error: {
        code: 'EXECUTION_REQUEST_INVALID',
        message: 'Invalid test eligibility validation input',
      },
    };
  }

  try {
    const service = getExecutionService();
    const eligibility = await service.validateTestEligibility(validated.data);
    return { ok: true, data: eligibility };
  } catch (err) {
    if (err instanceof ExecutionDomainError) {
      return { ok: false, error: err.toDesktopError() };
    }
    const message = err instanceof Error ? err.message : 'Test eligibility validation failed';
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: message.replace(/\/[\w.-]+/g, '[path]').slice(0, 300),
      },
    };
  }
}
