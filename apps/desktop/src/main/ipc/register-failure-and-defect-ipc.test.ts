/**
 * @file apps/desktop/src/main/ipc/register-failure-and-defect-ipc.test.ts
 * Unit tests verifying failure and defect IPC registration and invocation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DESKTOP_CHANNELS, type DesktopResult } from '@ai-quality/contracts';
import {
  FAILURE_AND_DEFECT_CHANNELS_MAP,
  FAILURE_AND_DEFECT_ERROR_CODES,
  registerFailureAndDefectIpc,
  unregisterFailureAndDefectIpc,
} from './register-failure-and-defect-ipc.js';
import { setSharedFailureCaseService } from './failure-handlers.js';
import type { FailureCaseService } from '@ai-quality/core';

describe('Failure and Defect IPC Registration Tests', () => {
  let registeredHandlers: Map<string, (event: any, ...args: any[]) => Promise<any>>;
  let mockIpcMain: any;

  beforeEach(() => {
    registeredHandlers = new Map();
    mockIpcMain = {
      handle: (channel: string, handler: any) => {
        registeredHandlers.set(channel, handler);
      },
      removeHandler: (channel: string) => {
        registeredHandlers.delete(channel);
      },
    };
  });

  it('registers all 178 failure and defect channels including FAILURES_LIST_CASES', () => {
    const mockSafeWrapper = (channel: string, fn: any) => {
      return (event: any, payload: any) => fn(event, payload);
    };

    registerFailureAndDefectIpc(mockIpcMain, mockSafeWrapper as any);

    assert.equal(registeredHandlers.size, 178);
    assert.ok(
      registeredHandlers.has(DESKTOP_CHANNELS.FAILURES_LIST_CASES),
      'FAILURES_LIST_CASES must be registered',
    );
    assert.equal(DESKTOP_CHANNELS.FAILURES_LIST_CASES, 'desktop:failures:list-cases');

    assert.ok(
      registeredHandlers.has(DESKTOP_CHANNELS.FAILURES_CREATE_CASE),
      'FAILURES_CREATE_CASE must be registered',
    );
    assert.ok(
      registeredHandlers.has(DESKTOP_CHANNELS.JIRA_CREATE_CONNECTION),
      'JIRA_CREATE_CONNECTION must be registered',
    );
  });

  it('unregisters all failure and defect channels cleanly', () => {
    const mockSafeWrapper = (channel: string, fn: any) => {
      return (event: any, payload: any) => fn(event, payload);
    };

    registerFailureAndDefectIpc(mockIpcMain, mockSafeWrapper as any);
    assert.equal(registeredHandlers.size, 178);

    unregisterFailureAndDefectIpc(mockIpcMain);
    assert.equal(registeredHandlers.size, 0);
  });

  it('successfully executes registered desktop:failures:list-cases handler', async () => {
    const mockService: Partial<FailureCaseService> = {
      listFailureCases: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 0,
      }),
    };
    setSharedFailureCaseService(mockService as any);

    const mockSafeWrapper = (channel: string, fn: any) => {
      return (event: any, payload: any) => fn(event, payload);
    };

    registerFailureAndDefectIpc(mockIpcMain, mockSafeWrapper as any);

    const handler = registeredHandlers.get(DESKTOP_CHANNELS.FAILURES_LIST_CASES);
    assert.ok(handler);

    const trustedEvent = {
      senderFrame: {
        parent: null,
        url: 'app://renderer/index.html',
      },
    };

    const result: DesktopResult<any> = await handler(trustedEvent, {
      projectId: 'a889ece1-116c-4266-8156-c98462992e76',
      page: 1,
      pageSize: 50,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data.items, []);
      assert.equal(result.data.total, 0);
    }
  });

  it('contains failure domain error codes in FAILURE_AND_DEFECT_ERROR_CODES', () => {
    assert.ok(FAILURE_AND_DEFECT_ERROR_CODES.includes('FAILURE_CASE_NOT_FOUND'));
    assert.ok(FAILURE_AND_DEFECT_ERROR_CODES.includes('JIRA_CONNECTION_FAILED'));
    assert.ok(FAILURE_AND_DEFECT_ERROR_CODES.includes('BUG_REPORT_NOT_FOUND'));
    assert.ok(FAILURE_AND_DEFECT_ERROR_CODES.includes('REVERIFICATION_NOT_FOUND'));
  });
});
