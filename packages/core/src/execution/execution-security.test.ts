/**
 * @file packages/core/src/execution/execution-security.test.ts
 * Security and adversarial injection attack tests for the Execution domain.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlaywrightBrowserProvider } from './browser-provider.js';
import { executionRequestSchema } from '@ai-quality/contracts';
import { ExecutionSecurityViolationError } from './execution-errors.js';

describe('Execution Security & Adversarial Attack Tests', () => {
  const provider = new PlaywrightBrowserProvider();

  describe('Chromium Launch Argument Injection Attacks', () => {
    it('blocks --no-sandbox attack', () => {
      assert.throws(
        () => provider.sanitizeLaunchArgs(['--no-sandbox']),
        (err: unknown) => {
          assert.ok(err instanceof ExecutionSecurityViolationError);
          assert.ok(err.message.includes('prohibited'));
          return true;
        },
      );
    });

    it('blocks --disable-web-security attack', () => {
      assert.throws(
        () => provider.sanitizeLaunchArgs(['--disable-web-security']),
        (err: unknown) => {
          assert.ok(err instanceof ExecutionSecurityViolationError);
          return true;
        },
      );
    });

    it('blocks --remote-debugging-port backdoor attack', () => {
      assert.throws(
        () => provider.sanitizeLaunchArgs(['--remote-debugging-port=9222']),
        (err: unknown) => {
          assert.ok(err instanceof ExecutionSecurityViolationError);
          return true;
        },
      );
    });

    it('blocks --allow-running-insecure-content attack', () => {
      assert.throws(
        () => provider.sanitizeLaunchArgs(['--allow-running-insecure-content']),
        (err: unknown) => {
          assert.ok(err instanceof ExecutionSecurityViolationError);
          return true;
        },
      );
    });

    it('blocks --single-process memory exploitation attack', () => {
      assert.throws(
        () => provider.sanitizeLaunchArgs(['--single-process']),
        (err: unknown) => {
          assert.ok(err instanceof ExecutionSecurityViolationError);
          return true;
        },
      );
    });

    it('blocks --disable-gpu-sandbox attack', () => {
      assert.throws(
        () => provider.sanitizeLaunchArgs(['--disable-gpu-sandbox']),
        (err: unknown) => {
          assert.ok(err instanceof ExecutionSecurityViolationError);
          return true;
        },
      );
    });

    it('blocks --unsafely-treat-insecure-origin-as-secure attack', () => {
      assert.throws(
        () =>
          provider.sanitizeLaunchArgs([
            '--unsafely-treat-insecure-origin-as-secure=http://evil.com',
          ]),
        (err: unknown) => {
          assert.ok(err instanceof ExecutionSecurityViolationError);
          return true;
        },
      );
    });
  });

  describe('Arbitrary Code & Script Injection Rejection', () => {
    it('rejects arbitrary JavaScript payloads injected in execution request schema', () => {
      const maliciousPayload = {
        projectId: '11111111-1111-1111-1111-111111111111',
        testCaseId: '22222222-2222-2222-2222-222222222222',
        script: 'require("child_process").execSync("rm -rf /")',
        eval: 'window.alert(1)',
      };

      const result = executionRequestSchema.safeParse(maliciousPayload);
      assert.equal(result.success, true);
      // Schema strips or ignores unrecognized fields and does NOT expose eval/script
      assert.equal((result as any).data.script, undefined);
      assert.equal((result as any).data.eval, undefined);
    });

    it('rejects shell command strings in browserEngine field', () => {
      const shellPayload = {
        projectId: '11111111-1111-1111-1111-111111111111',
        testCaseId: '22222222-2222-2222-2222-222222222222',
        browserEngine: 'chromium; rm -rf /',
      };

      const result = executionRequestSchema.safeParse(shellPayload);
      assert.equal(result.success, false);
    });

    it('rejects path traversal attempts in browserEngine field', () => {
      const traversalPayload = {
        projectId: '11111111-1111-1111-1111-111111111111',
        testCaseId: '22222222-2222-2222-2222-222222222222',
        browserEngine: '../../../bin/sh',
      };

      const result = executionRequestSchema.safeParse(traversalPayload);
      assert.equal(result.success, false);
    });
  });
});
