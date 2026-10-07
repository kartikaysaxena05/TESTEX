/**
 * @file packages/core/src/workflow/workflow-contract.test.ts
 * Phase 96 Contract & Schema Invariants Test Suite.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_CHANNELS,
  internalBugStatusSchema,
  defectVerificationStatusSchema,
  syncDirectionSchema,
  syncConflictPolicySchema,
  syncResultStatusSchema,
  bugWorkflowStateDtoSchema,
  workflowStatusMappingDtoSchema,
  workflowSyncEventDtoSchema,
  getWorkflowStateInputSchema,
  updateInternalStatusInputSchema,
  getWorkflowStatusMappingsInputSchema,
  saveWorkflowStatusMappingInputSchema,
  deleteWorkflowStatusMappingInputSchema,
  syncWorkflowNowInputSchema,
  resolveWorkflowConflictInputSchema,
  listWorkflowSyncEventsInputSchema,
} from '@ai-quality/contracts';
import { DEFAULT_JIRA_STATUS_MAPPINGS } from './workflow-types.js';

describe('Phase 96 Contract & Schema Invariants', () => {
  test('verifies DESKTOP_CHANNELS includes all Phase 96 workflow channels', () => {
    assert.equal(DESKTOP_CHANNELS.WORKFLOW_GET_STATE, 'desktop:workflow:get-state');
    assert.equal(
      DESKTOP_CHANNELS.WORKFLOW_UPDATE_INTERNAL_STATUS,
      'desktop:workflow:update-internal-status',
    );
    assert.equal(
      DESKTOP_CHANNELS.WORKFLOW_GET_STATUS_MAPPINGS,
      'desktop:workflow:get-status-mappings',
    );
    assert.equal(
      DESKTOP_CHANNELS.WORKFLOW_SAVE_STATUS_MAPPING,
      'desktop:workflow:save-status-mapping',
    );
    assert.equal(
      DESKTOP_CHANNELS.WORKFLOW_DELETE_STATUS_MAPPING,
      'desktop:workflow:delete-status-mapping',
    );
    assert.equal(DESKTOP_CHANNELS.WORKFLOW_SYNC_NOW, 'desktop:workflow:sync-now');
    assert.equal(DESKTOP_CHANNELS.WORKFLOW_RESOLVE_CONFLICT, 'desktop:workflow:resolve-conflict');
    assert.equal(DESKTOP_CHANNELS.WORKFLOW_LIST_SYNC_EVENTS, 'desktop:workflow:list-sync-events');
  });

  test('validates internalBugStatusSchema enums', () => {
    const validStatuses = [
      'OPEN',
      'ACKNOWLEDGED',
      'IN_PROGRESS',
      'RESOLVED',
      'REOPENED',
      'CLOSED',
      'BLOCKED',
      'WONT_FIX',
      'DUPLICATE',
    ];

    for (const status of validStatuses) {
      assert.equal(internalBugStatusSchema.parse(status), status);
    }

    assert.throws(() => internalBugStatusSchema.parse('NON_EXISTENT_STATUS'));
  });

  test('validates defectVerificationStatusSchema enums', () => {
    const validStatuses = [
      'NOT_VERIFIED',
      'VERIFICATION_PENDING',
      'VERIFIED_FIXED',
      'REVERIFICATION_FAILED',
    ];

    for (const status of validStatuses) {
      assert.equal(defectVerificationStatusSchema.parse(status), status);
    }

    assert.throws(() => defectVerificationStatusSchema.parse('VERIFIED_TRUE'));
  });

  test('validates syncDirectionSchema and syncConflictPolicySchema enums', () => {
    assert.equal(syncDirectionSchema.parse('INTERNAL_TO_EXTERNAL'), 'INTERNAL_TO_EXTERNAL');
    assert.equal(syncDirectionSchema.parse('EXTERNAL_TO_INTERNAL'), 'EXTERNAL_TO_INTERNAL');
    assert.equal(syncDirectionSchema.parse('BIDIRECTIONAL'), 'BIDIRECTIONAL');
    assert.throws(() => syncDirectionSchema.parse('ONE_WAY'));

    assert.equal(syncConflictPolicySchema.parse('MANUAL_REVIEW'), 'MANUAL_REVIEW');
    assert.equal(syncConflictPolicySchema.parse('INTERNAL_WINS'), 'INTERNAL_WINS');
    assert.equal(syncConflictPolicySchema.parse('EXTERNAL_WINS'), 'EXTERNAL_WINS');
    assert.equal(syncConflictPolicySchema.parse('LATEST_VALID_CHANGE'), 'LATEST_VALID_CHANGE');
    assert.throws(() => syncConflictPolicySchema.parse('SILENT_OVERWRITE'));
  });

  test('validates syncResultStatusSchema enums', () => {
    const validResults = [
      'SYNCED',
      'NO_CHANGE',
      'BLOCKED',
      'CONFLICT',
      'FAILED',
      'UNMAPPED',
      'UNAUTHORIZED',
      'EXTERNAL_NOT_FOUND',
      'RATE_LIMITED',
    ];

    for (const res of validResults) {
      assert.equal(syncResultStatusSchema.parse(res), res);
    }

    assert.throws(() => syncResultStatusSchema.parse('UNKNOWN_OUTCOME'));
  });

  test('validates bugWorkflowStateDtoSchema with full fields', () => {
    const validDto = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      projectId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      failureCaseId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      bugReportId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      currentStatus: 'OPEN',
      verificationStatus: 'NOT_VERIFIED',
      statusReason: 'Initial defect state',
      resolvedAt: null,
      resolutionReason: null,
      reopenedAt: null,
      reopenReason: null,
      closedAt: null,
      lastChangedBy: 'SYSTEM',
      workflowVersion: 1,
      lastExternalStatus: 'To Do',
      lastExternalStatusId: '10001',
      lastSyncedInternalStatus: 'OPEN',
      lastSyncedExternalStatus: 'To Do',
      lastSyncedAt: new Date().toISOString(),
      lastExternalUpdatedAt: new Date().toISOString(),
      syncVersion: 1,
      lastSyncResult: 'SYNCED',
      lastSyncError: null,
      conflictState: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = bugWorkflowStateDtoSchema.parse(validDto);
    assert.equal(parsed.currentStatus, 'OPEN');
    assert.equal(parsed.verificationStatus, 'NOT_VERIFIED');
    assert.equal(parsed.lastSyncResult, 'SYNCED');
  });

  test('validates workflowStatusMappingDtoSchema and DEFAULT_JIRA_STATUS_MAPPINGS', () => {
    assert.ok(DEFAULT_JIRA_STATUS_MAPPINGS.length >= 10);
    const doneDef = DEFAULT_JIRA_STATUS_MAPPINGS.find(m => m.externalStatusName === 'Done');
    assert.ok(doneDef);
    assert.equal(doneDef.internalStatus, 'RESOLVED');

    const validMapping = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      projectId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      connectionId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      externalSystem: 'JIRA',
      externalStatusId: '10001',
      externalStatusName: 'In Progress',
      internalStatus: 'IN_PROGRESS',
      direction: 'BIDIRECTIONAL',
      conflictPolicy: 'MANUAL_REVIEW',
      isEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = workflowStatusMappingDtoSchema.parse(validMapping);
    assert.equal(parsed.externalStatusName, 'In Progress');
    assert.equal(parsed.internalStatus, 'IN_PROGRESS');
  });

  test('validates input schemas and rejects malformed inputs', () => {
    // Valid input
    const validUpdate = updateInternalStatusInputSchema.parse({
      projectId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      failureCaseId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      targetStatus: 'IN_PROGRESS',
      reason: 'Assigned to sprint',
      actor: 'qa_engineer',
      syncExternal: true,
    });
    assert.equal(validUpdate.targetStatus, 'IN_PROGRESS');

    // Invalid non-UUID projectId
    assert.throws(() =>
      updateInternalStatusInputSchema.parse({
        projectId: 'invalid-id',
        failureCaseId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
        targetStatus: 'IN_PROGRESS',
      }),
    );

    // Conflict resolve input validation
    const validConflictResolution = resolveWorkflowConflictInputSchema.parse({
      projectId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      failureCaseId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      chosenWinner: 'INTERNAL',
      resolutionNote: 'Internal testing found defect still repros',
    });
    assert.equal(validConflictResolution.chosenWinner, 'INTERNAL');
  });
});
