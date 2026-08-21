import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import { getAppInfo } from './app-handlers.js';
import { getHealthStatus } from './health-handlers.js';
import { createSafeIpcHandler } from './register-ipc.js';

describe('IPC Handlers and Error Sanitization Unit Tests', () => {
  it('should return valid AppInfo metadata DTO', () => {
    const info = getAppInfo();
    assert.strictEqual(typeof info.name, 'string');
    assert.strictEqual(typeof info.version, 'string');
    assert.strictEqual(info.platform, process.platform);
    assert.strictEqual(info.arch, process.arch);
  });

  it('should return valid HealthInfo status ok', () => {
    const health = getHealthStatus();
    assert.deepStrictEqual(health, { status: 'ok' });
  });

  it('should wrap successful handler execution in DesktopResult ok: true', async () => {
    const mockEvent = {
      senderFrame: {
        url: 'app://renderer/index.html',
        parent: null,
      },
    } as unknown as IpcMainInvokeEvent;

    const safeHandler = createSafeIpcHandler(() => ({ message: 'success' }));
    const result = await safeHandler(mockEvent);

    assert.deepStrictEqual(result, {
      ok: true,
      data: { message: 'success' },
    });
  });

  it('should reject unauthorized sender with UNAUTHORIZED_SENDER error code', async () => {
    const untrustedEvent = {
      senderFrame: {
        url: 'https://attacker.com',
        parent: null,
      },
    } as unknown as IpcMainInvokeEvent;

    const safeHandler = createSafeIpcHandler(() => ({ secret: 123 }));
    const result = await safeHandler(untrustedEvent);

    assert.deepStrictEqual(result, {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Unauthorized IPC sender.',
      },
    });
  });

  it('should sanitize internal errors and prevent leaking file paths or stacks', async () => {
    const mockEvent = {
      senderFrame: {
        url: 'app://renderer/index.html',
        parent: null,
      },
    } as unknown as IpcMainInvokeEvent;

    const throwingHandler = createSafeIpcHandler(() => {
      throw new Error('Database connection failed at /Users/admin/secrets/db.key (DB_PASS=xyz)');
    });

    const result = await throwingHandler(mockEvent);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'INTERNAL_ERROR');
      assert.strictEqual(result.error.message, 'The desktop operation failed.');
      // Confirm sensitive details are strictly absent from renderer-visible error
      assert.strictEqual(JSON.stringify(result).includes('/Users/admin/secrets'), false);
      assert.strictEqual(JSON.stringify(result).includes('DB_PASS'), false);
    }
  });
});
