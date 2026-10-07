/**
 * @file packages/core/src/execution/runtime-registry.test.ts
 * Unit tests for ExecutionRuntimeRegistry lifecycle management, lookup, and cleanup idempotency.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionRuntimeRegistry } from './runtime-registry.js';
import type { IExecutionContext } from './execution-types.js';

describe('ExecutionRuntimeRegistry Unit Tests', () => {
  it('registers and retrieves active execution context', () => {
    const registry = new ExecutionRuntimeRegistry();
    let closeCalled = false;

    const mockContext: IExecutionContext = {
      executionId: 'exec-123',
      projectId: 'proj-1',
      testCaseId: 'tc-1',
      browserEngine: 'chromium',
      headless: true,
      createdAt: new Date(),
      browser: {} as any,
      context: {} as any,
      page: {} as any,
      close: async () => {
        closeCalled = true;
      },
    };

    assert.equal(registry.getActiveCount(), 0);
    registry.register(mockContext);
    assert.equal(registry.getActiveCount(), 1);
    assert.equal(registry.get('exec-123'), mockContext);
    assert.equal(registry.list().length, 1);
    assert.equal(closeCalled, false);
  });

  it('performs idempotent cleanup without error when called multiple times', async () => {
    const registry = new ExecutionRuntimeRegistry();
    let closeCount = 0;

    const mockContext: IExecutionContext = {
      executionId: 'exec-456',
      browserEngine: 'chromium',
      headless: true,
      createdAt: new Date(),
      browser: {} as any,
      context: {} as any,
      page: {} as any,
      close: async () => {
        closeCount++;
      },
    };

    registry.register(mockContext);
    assert.equal(registry.getActiveCount(), 1);

    // First cleanup
    await registry.cleanup('exec-456');
    assert.equal(closeCount, 1);
    assert.equal(registry.getActiveCount(), 0);
    assert.equal(registry.get('exec-456'), undefined);

    // Second cleanup (should be a safe no-op)
    await registry.cleanup('exec-456');
    assert.equal(closeCount, 1);
    assert.equal(registry.getActiveCount(), 0);
  });

  it('cleans up all tracked contexts on cleanupAll()', async () => {
    const registry = new ExecutionRuntimeRegistry();
    const closedIds: string[] = [];

    const createMockContext = (id: string): IExecutionContext => ({
      executionId: id,
      browserEngine: 'chromium',
      headless: true,
      createdAt: new Date(),
      browser: {} as any,
      context: {} as any,
      page: {} as any,
      close: async () => {
        closedIds.push(id);
      },
    });

    registry.register(createMockContext('exec-1'));
    registry.register(createMockContext('exec-2'));
    registry.register(createMockContext('exec-3'));
    assert.equal(registry.getActiveCount(), 3);

    await registry.cleanupAll();
    assert.equal(registry.getActiveCount(), 0);
    assert.equal(closedIds.length, 3);
    assert.ok(closedIds.includes('exec-1'));
    assert.ok(closedIds.includes('exec-2'));
    assert.ok(closedIds.includes('exec-3'));
  });
});
