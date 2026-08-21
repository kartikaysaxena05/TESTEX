import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import { createSafeIpcHandler } from './register-ipc.js';
import { getDatabaseStatus } from './database-handlers.js';

describe('Database IPC Handlers Security and Sanitization Tests', () => {
  it('should execute getDatabaseStatus handler and return valid DatabaseStatus envelope', async () => {
    const handler = createSafeIpcHandler(() => getDatabaseStatus());

    const mockEvent = {
      senderFrame: {
        parent: null,
        url: 'app://renderer/index.html',
      },
    } as unknown as IpcMainInvokeEvent;

    const result = await handler(mockEvent);
    assert.strictEqual(result.ok, true);

    if (result.ok) {
      assert.ok(
        ['connected', 'unavailable', 'not-configured'].includes(result.data.status),
        `Status must be valid state, got: ${result.data.status}`,
      );
    }
  });

  it('should reject database status request from unauthorized sender frame', async () => {
    const handler = createSafeIpcHandler(() => getDatabaseStatus());

    const untrustedEvent = {
      senderFrame: {
        parent: null,
        url: 'https://evil.com/exploit.html',
      },
    } as unknown as IpcMainInvokeEvent;

    const result = await handler(untrustedEvent);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('should sanitize internal database exceptions into safe DesktopResult envelope', async () => {
    const failingHandler = createSafeIpcHandler(() => {
      throw new Error('database connection secret leaked at postgresql://user:pass@secret:5432/db');
    });

    const mockEvent = {
      senderFrame: {
        parent: null,
        url: 'app://renderer/index.html',
      },
    } as unknown as IpcMainInvokeEvent;

    const result = await failingHandler(mockEvent);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
      assert.strictEqual(result.error.message, 'The desktop operation failed.');
      assert.strictEqual(
        result.error.message.includes('secret'),
        false,
        'Error envelope must never leak internal stack traces or connection secrets',
      );
    }
  });
});
