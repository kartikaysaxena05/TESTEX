/**
 * @file apps/desktop/src/main/ipc/traceability-handlers.test.ts
 * Unit tests for Traceability IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import type { RequirementTestTraceDto } from '@ai-quality/contracts';
import {
  handleCreateTrace,
  handleDeleteTrace,
  handleGetTraceById,
  handleListProjectTraces,
  handleListTracesByRequirement,
  handleListTracesByTestCase,
  setTraceServiceForTesting,
} from './traceability-handlers.js';
import type { RequirementTestTraceService } from '@ai-quality/core';
import { TraceProjectMismatchError } from '@ai-quality/core';

const fakeEvent = {} as IpcMainInvokeEvent;

const sampleTrace: RequirementTestTraceDto = {
  id: '11111111-2222-3333-4444-555555555555',
  projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  requirementId: '22222222-3333-4444-5555-666666666666',
  requirementKey: 'REQ-001',
  requirementTitle: 'Authentication',
  requirementVersionId: '33333333-4444-5555-6666-777777777777',
  requirementVersionNumber: 1,
  currentRequirementVersionNumber: 1,
  testCaseId: '44444444-5555-6666-7777-888888888888',
  testCaseKey: 'TC-0001',
  testCaseTitle: 'Valid Login',
  testCaseType: 'POSITIVE',
  testCasePriority: 'HIGH',
  testCaseStatus: 'GENERATED',
  scenarioCandidateId: null,
  scenarioKey: 'SCN-001',
  generationRunId: null,
  origin: 'GENERATED',
  status: 'CURRENT',
  isStale: false,
  staleReason: null,
  provenance: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Traceability IPC Handlers', () => {
  it('returns validation error for invalid create payload', async () => {
    const res = await handleCreateTrace(fakeEvent, { projectId: 'not-a-uuid' });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'TRACEABILITY_VALIDATION_FAILED');
    }
  });

  it('handles create trace delegation successfully', async () => {
    const mockService = {
      createTrace: async () => sampleTrace,
    } as unknown as RequirementTestTraceService;
    setTraceServiceForTesting(mockService);

    const res = await handleCreateTrace(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      requirementId: '22222222-3333-4444-5555-666666666666',
      testCaseId: '44444444-5555-6666-7777-888888888888',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, sampleTrace.id);
    }
  });

  it('maps TraceProjectMismatchError to TRACEABILITY_PROJECT_MISMATCH', async () => {
    const mockService = {
      createTrace: async () => {
        throw new TraceProjectMismatchError('Cross-project linking rejected.');
      },
    } as unknown as RequirementTestTraceService;
    setTraceServiceForTesting(mockService);

    const res = await handleCreateTrace(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      requirementId: '22222222-3333-4444-5555-666666666666',
      testCaseId: '44444444-5555-6666-7777-888888888888',
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'TRACEABILITY_PROJECT_MISMATCH');
    }
  });

  it('handles getTraceById, listByRequirement, listByTestCase, and listProjectTraces', async () => {
    const mockService = {
      getTraceById: async () => sampleTrace,
      listTracesForRequirement: async () => ({
        traces: [sampleTrace],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
      listTracesForTestCase: async () => ({
        traces: [sampleTrace],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
      listProjectTraces: async () => ({
        traces: [sampleTrace],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
      deleteTrace: async () => ({ deleted: true }),
    } as unknown as RequirementTestTraceService;
    setTraceServiceForTesting(mockService);

    const getRes = await handleGetTraceById(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      traceId: '11111111-2222-3333-4444-555555555555',
    });
    assert.equal(getRes.ok, true);

    const reqRes = await handleListTracesByRequirement(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      requirementId: '22222222-3333-4444-5555-666666666666',
    });
    assert.equal(reqRes.ok, true);

    const tcRes = await handleListTracesByTestCase(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      testCaseId: '44444444-5555-6666-7777-888888888888',
    });
    assert.equal(tcRes.ok, true);

    const projRes = await handleListProjectTraces(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(projRes.ok, true);

    const delRes = await handleDeleteTrace(fakeEvent, {
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      traceId: '11111111-2222-3333-4444-555555555555',
    });
    assert.equal(delRes.ok, true);
  });
});
