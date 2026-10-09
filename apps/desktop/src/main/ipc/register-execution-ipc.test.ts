/**
 * @file apps/desktop/src/main/ipc/register-execution-ipc.test.ts
 * Regression tests for V5 Phase 58 Autonomous Execution IPC Registration and Safe Handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_CHANNELS,
  type RuntimeSmokeInputDto,
  type ValidateTestEligibilityInputDto,
} from '@ai-quality/contracts';
import {
  handleGetExecutionCapabilities,
  handleRunRuntimeSmoke,
  handleValidateTestEligibility,
} from './execution-handlers.js';
import { createSafeIpcHandler } from './register-ipc.js';
import type { IpcMainInvokeEvent } from 'electron';

describe('V5 Phase 58: Execution IPC Registration & Safe Handler Regression Suite', () => {
  const mockTrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const mockUntrustedEvent = {
    senderFrame: {
      parent: {},
      url: 'https://malicious-site.example.com',
    },
  } as unknown as IpcMainInvokeEvent;

  it('verifies EXECUTION channels constants match expected string identifiers', () => {
    assert.strictEqual(
      DESKTOP_CHANNELS.EXECUTION_GET_CAPABILITIES,
      'desktop:execution:get-capabilities',
    );
    assert.strictEqual(
      DESKTOP_CHANNELS.EXECUTION_RUNTIME_SMOKE,
      'desktop:execution:runtime-smoke',
    );
    assert.strictEqual(
      DESKTOP_CHANNELS.EXECUTION_VALIDATE_ELIGIBILITY,
      'desktop:execution:validate-eligibility',
    );
  });

  it('rejects untrusted sender frame on wrapped EXECUTION_GET_CAPABILITIES', async () => {
    const safeHandler = createSafeIpcHandler(
      DESKTOP_CHANNELS.EXECUTION_GET_CAPABILITIES,
      (event: IpcMainInvokeEvent) => handleGetExecutionCapabilities(event),
    );

    const result = await safeHandler(mockUntrustedEvent);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects untrusted sender frame on wrapped EXECUTION_RUNTIME_SMOKE', async () => {
    const safeHandler = createSafeIpcHandler(
      DESKTOP_CHANNELS.EXECUTION_RUNTIME_SMOKE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleRunRuntimeSmoke(event, payload as RuntimeSmokeInputDto | undefined),
    );

    const result = await safeHandler(mockUntrustedEvent, { browserEngine: 'chromium' });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('rejects invalid parameters on wrapped EXECUTION_RUNTIME_SMOKE with trusted sender', async () => {
    const safeHandler = createSafeIpcHandler(
      DESKTOP_CHANNELS.EXECUTION_RUNTIME_SMOKE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleRunRuntimeSmoke(event, payload as RuntimeSmokeInputDto | undefined),
    );

    const result = await safeHandler(mockTrustedEvent, { timeoutMs: -100 });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'EXECUTION_REQUEST_INVALID');
      assert.ok(result.error.message.includes('Invalid runtime smoke parameters'));
    }
  });

  it('rejects malformed non-UUID input on wrapped EXECUTION_VALIDATE_ELIGIBILITY', async () => {
    const safeHandler = createSafeIpcHandler(
      DESKTOP_CHANNELS.EXECUTION_VALIDATE_ELIGIBILITY,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleValidateTestEligibility(event, payload as ValidateTestEligibilityInputDto),
    );

    const result = await safeHandler(mockTrustedEvent, {
      projectId: 'not-a-uuid',
      testCaseId: 'bad-id',
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'EXECUTION_REQUEST_INVALID');
      assert.ok(result.error.message.includes('Invalid test eligibility validation input'));
    }
  });

  it('simulates channel registration and cleanup with mock ipcMain', () => {
    type GenericHandler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown;
    const registeredHandlers = new Map<string, GenericHandler>();
    const mockIpc = {
      handle: (channel: string, fn: GenericHandler) => {
        registeredHandlers.set(channel, fn);
      },
      removeHandler: (channel: string) => {
        registeredHandlers.delete(channel);
      },
    };

    // Register all three Phase 58 channels
    mockIpc.handle(
      DESKTOP_CHANNELS.EXECUTION_GET_CAPABILITIES,
      createSafeIpcHandler(
        DESKTOP_CHANNELS.EXECUTION_GET_CAPABILITIES,
        (event: IpcMainInvokeEvent) => handleGetExecutionCapabilities(event),
      ),
    );
    mockIpc.handle(
      DESKTOP_CHANNELS.EXECUTION_RUNTIME_SMOKE,
      createSafeIpcHandler(
        DESKTOP_CHANNELS.EXECUTION_RUNTIME_SMOKE,
        (event: IpcMainInvokeEvent, payload?: unknown) =>
          handleRunRuntimeSmoke(event, payload as any),
      ),
    );
    mockIpc.handle(
      DESKTOP_CHANNELS.EXECUTION_VALIDATE_ELIGIBILITY,
      createSafeIpcHandler(
        DESKTOP_CHANNELS.EXECUTION_VALIDATE_ELIGIBILITY,
        (event: IpcMainInvokeEvent, payload: unknown) =>
          handleValidateTestEligibility(event, payload as any),
      ),
    );

    assert.strictEqual(registeredHandlers.size, 3);
    assert.ok(registeredHandlers.has('desktop:execution:get-capabilities'));
    assert.ok(registeredHandlers.has('desktop:execution:runtime-smoke'));
    assert.ok(registeredHandlers.has('desktop:execution:validate-eligibility'));

    // Teardown
    mockIpc.removeHandler(DESKTOP_CHANNELS.EXECUTION_GET_CAPABILITIES);
    mockIpc.removeHandler(DESKTOP_CHANNELS.EXECUTION_RUNTIME_SMOKE);
    mockIpc.removeHandler(DESKTOP_CHANNELS.EXECUTION_VALIDATE_ELIGIBILITY);

    assert.strictEqual(registeredHandlers.size, 0);
  });
});
