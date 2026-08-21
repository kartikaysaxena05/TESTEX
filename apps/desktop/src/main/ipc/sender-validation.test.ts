import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import { isTrustedIpcSender } from './sender-validation.js';

describe('IPC Sender Validation Security Tests', () => {
  it('should allow production app://renderer origin on top-level frame', () => {
    const mockEvent = {
      senderFrame: {
        url: 'app://renderer/index.html',
        parent: null,
      },
    } as unknown as IpcMainInvokeEvent;

    assert.strictEqual(isTrustedIpcSender(mockEvent), true);
  });

  it('should allow development loopback origin when dev URL is set', () => {
    const originalDevUrl = process.env['AI_QUALITY_RENDERER_DEV_URL'];
    process.env['AI_QUALITY_RENDERER_DEV_URL'] = 'http://127.0.0.1:5173';

    try {
      const mockEvent = {
        senderFrame: {
          url: 'http://127.0.0.1:5173/',
          parent: null,
        },
      } as unknown as IpcMainInvokeEvent;

      assert.strictEqual(isTrustedIpcSender(mockEvent), true);
    } finally {
      if (originalDevUrl !== undefined) {
        process.env['AI_QUALITY_RENDERER_DEV_URL'] = originalDevUrl;
      } else {
        delete process.env['AI_QUALITY_RENDERER_DEV_URL'];
      }
    }
  });

  it('should reject nested subframe senders even with valid app:// url', () => {
    const mockEvent = {
      senderFrame: {
        url: 'app://renderer/subframe.html',
        parent: {} as unknown, // Nested inside parent frame
      },
    } as unknown as IpcMainInvokeEvent;

    assert.strictEqual(isTrustedIpcSender(mockEvent), false);
  });

  it('should reject external https origins', () => {
    const mockEvent = {
      senderFrame: {
        url: 'https://evil.com/phishing.html',
        parent: null,
      },
    } as unknown as IpcMainInvokeEvent;

    assert.strictEqual(isTrustedIpcSender(mockEvent), false);
  });

  it('should reject file:// origins', () => {
    const mockEvent = {
      senderFrame: {
        url: 'file:///etc/passwd',
        parent: null,
      },
    } as unknown as IpcMainInvokeEvent;

    assert.strictEqual(isTrustedIpcSender(mockEvent), false);
  });

  it('should reject data: and javascript: origins', () => {
    const mockDataEvent = {
      senderFrame: {
        url: 'data:text/html,<h1>hacked</h1>',
        parent: null,
      },
    } as unknown as IpcMainInvokeEvent;

    const mockJsEvent = {
      senderFrame: {
        url: 'javascript:alert(1)',
        parent: null,
      },
    } as unknown as IpcMainInvokeEvent;

    assert.strictEqual(isTrustedIpcSender(mockDataEvent), false);
    assert.strictEqual(isTrustedIpcSender(mockJsEvent), false);
  });

  it('should reject unauthorized custom protocol hosts', () => {
    const mockEvent = {
      senderFrame: {
        url: 'app://unauthorized-host/index.html',
        parent: null,
      },
    } as unknown as IpcMainInvokeEvent;

    assert.strictEqual(isTrustedIpcSender(mockEvent), false);
  });
});
