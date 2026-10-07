/**
 * @file packages/core/src/workflow/workflow-conflict-detector.test.ts
 * Test suite for 3-way merge conflict detection, resolution policies, and status mapping engine.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowConflictDetector } from './workflow-conflict-detector.js';
import { WorkflowStatusMappingEngine } from './workflow-status-mapping-engine.js';
import type { WorkflowStatusMapping } from './workflow-types.js';

describe('WorkflowStatusMappingEngine', () => {
  const customMappings: WorkflowStatusMapping[] = [
    {
      id: 'm1',
      projectId: 'proj-1',
      connectionId: 'conn-1',
      externalSystem: 'JIRA',
      externalStatusId: '10',
      externalStatusName: 'Ready For QA',
      internalStatus: 'RESOLVED',
      direction: 'BIDIRECTIONAL',
      conflictPolicy: 'MANUAL_REVIEW',
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'm2',
      projectId: 'proj-1',
      connectionId: 'conn-1',
      externalSystem: 'JIRA',
      externalStatusId: '11',
      externalStatusName: 'Internal Sync Only',
      internalStatus: 'IN_PROGRESS',
      direction: 'INTERNAL_TO_EXTERNAL',
      conflictPolicy: 'MANUAL_REVIEW',
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'm3',
      projectId: 'proj-1',
      connectionId: 'conn-1',
      externalSystem: 'JIRA',
      externalStatusId: '12',
      externalStatusName: 'Disabled Status',
      internalStatus: 'BLOCKED',
      direction: 'BIDIRECTIONAL',
      conflictPolicy: 'MANUAL_REVIEW',
      isEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  test('maps external status to internal status using custom mappings', () => {
    const internal = WorkflowStatusMappingEngine.mapExternalToInternal(
      'Ready For QA',
      customMappings,
    );
    assert.equal(internal, 'RESOLVED');
  });

  test('maps external status case-insensitively with trimming', () => {
    const internal = WorkflowStatusMappingEngine.mapExternalToInternal(
      '   ready for qa   ',
      customMappings,
    );
    assert.equal(internal, 'RESOLVED');
  });

  test('falls back to standard Jira defaults when allowed', () => {
    const doneInternal = WorkflowStatusMappingEngine.mapExternalToInternal(
      'Done',
      customMappings,
      true,
    );
    assert.equal(doneInternal, 'RESOLVED');

    const inProgressInternal = WorkflowStatusMappingEngine.mapExternalToInternal(
      'In Progress',
      customMappings,
      true,
    );
    assert.equal(inProgressInternal, 'IN_PROGRESS');
  });

  test('rejects unmapped external status without silent fallback (Prompt Section 11 invariant)', () => {
    const unmapped = WorkflowStatusMappingEngine.mapExternalToInternal(
      'Waiting For Vendor',
      customMappings,
      true,
    );
    assert.equal(unmapped, null);
  });

  test('respects mapping direction (INTERNAL_TO_EXTERNAL rejected for incoming external sync)', () => {
    const incoming = WorkflowStatusMappingEngine.mapExternalToInternal(
      'Internal Sync Only',
      customMappings,
      false,
    );
    assert.equal(incoming, null);
  });

  test('ignores disabled mappings', () => {
    const disabled = WorkflowStatusMappingEngine.mapExternalToInternal(
      'Disabled Status',
      customMappings,
      false,
    );
    assert.equal(disabled, null);
  });

  test('maps internal status to external status name', () => {
    const externalName = WorkflowStatusMappingEngine.mapInternalToExternal(
      'RESOLVED',
      customMappings,
    );
    assert.equal(externalName, 'Ready For QA');
  });
});

describe('WorkflowConflictDetector', () => {
  test('detects agreement when mapped external matches internal (no conflict)', () => {
    const result = WorkflowConflictDetector.evaluate({
      currentInternalStatus: 'IN_PROGRESS',
      currentExternalStatus: 'In Progress',
      mappedInternalFromExternal: 'IN_PROGRESS',
      lastSyncedInternalStatus: 'OPEN',
      lastSyncedExternalStatus: 'To Do',
      policy: 'MANUAL_REVIEW',
    });

    assert.equal(result.hasConflict, false);
    assert.equal(result.resolvedWinner, null);
  });

  test('handles clean one-sided internal change (only internal changed)', () => {
    const result = WorkflowConflictDetector.evaluate({
      currentInternalStatus: 'IN_PROGRESS',
      currentExternalStatus: 'To Do',
      mappedInternalFromExternal: 'OPEN',
      lastSyncedInternalStatus: 'OPEN',
      lastSyncedExternalStatus: 'To Do',
      policy: 'MANUAL_REVIEW',
    });

    assert.equal(result.hasConflict, false);
    assert.equal(result.resolvedWinner, 'INTERNAL');
  });

  test('handles clean one-sided external change (only external changed)', () => {
    const result = WorkflowConflictDetector.evaluate({
      currentInternalStatus: 'OPEN',
      currentExternalStatus: 'Done',
      mappedInternalFromExternal: 'RESOLVED',
      lastSyncedInternalStatus: 'OPEN',
      lastSyncedExternalStatus: 'To Do',
      policy: 'MANUAL_REVIEW',
    });

    assert.equal(result.hasConflict, false);
    assert.equal(result.resolvedWinner, 'EXTERNAL');
  });

  test('flags CONFLICT with MANUAL_REVIEW when both sides changed independently', () => {
    const result = WorkflowConflictDetector.evaluate({
      currentInternalStatus: 'IN_PROGRESS',
      currentExternalStatus: 'Done',
      mappedInternalFromExternal: 'RESOLVED',
      lastSyncedInternalStatus: 'OPEN',
      lastSyncedExternalStatus: 'To Do',
      policy: 'MANUAL_REVIEW',
    });

    assert.equal(result.hasConflict, true);
    assert.equal(result.resolvedWinner, null);
    assert.ok(result.suggestedAction);
    assert.match(result.reason, /Both internal .* and external .* statuses changed independently/);
  });

  test('applies INTERNAL_WINS policy on independent changes', () => {
    const result = WorkflowConflictDetector.evaluate({
      currentInternalStatus: 'IN_PROGRESS',
      currentExternalStatus: 'Done',
      mappedInternalFromExternal: 'RESOLVED',
      lastSyncedInternalStatus: 'OPEN',
      lastSyncedExternalStatus: 'To Do',
      policy: 'INTERNAL_WINS',
    });

    assert.equal(result.hasConflict, true);
    assert.equal(result.resolvedWinner, 'INTERNAL');
  });

  test('applies EXTERNAL_WINS policy on independent changes', () => {
    const result = WorkflowConflictDetector.evaluate({
      currentInternalStatus: 'IN_PROGRESS',
      currentExternalStatus: 'Done',
      mappedInternalFromExternal: 'RESOLVED',
      lastSyncedInternalStatus: 'OPEN',
      lastSyncedExternalStatus: 'To Do',
      policy: 'EXTERNAL_WINS',
    });

    assert.equal(result.hasConflict, true);
    assert.equal(result.resolvedWinner, 'EXTERNAL');
  });

  test('applies LATEST_VALID_CHANGE policy comparing timestamps', () => {
    // Case A: internal is newer
    const resA = WorkflowConflictDetector.evaluate({
      currentInternalStatus: 'IN_PROGRESS',
      currentExternalStatus: 'Done',
      mappedInternalFromExternal: 'RESOLVED',
      lastSyncedInternalStatus: 'OPEN',
      lastSyncedExternalStatus: 'To Do',
      internalUpdatedAt: new Date('2026-09-11T10:05:00Z'),
      externalUpdatedAt: new Date('2026-09-11T10:00:00Z'),
      policy: 'LATEST_VALID_CHANGE',
    });
    assert.equal(resA.resolvedWinner, 'INTERNAL');

    // Case B: external is newer
    const resB = WorkflowConflictDetector.evaluate({
      currentInternalStatus: 'IN_PROGRESS',
      currentExternalStatus: 'Done',
      mappedInternalFromExternal: 'RESOLVED',
      lastSyncedInternalStatus: 'OPEN',
      lastSyncedExternalStatus: 'To Do',
      internalUpdatedAt: new Date('2026-09-11T09:50:00Z'),
      externalUpdatedAt: new Date('2026-09-11T10:00:00Z'),
      policy: 'LATEST_VALID_CHANGE',
    });
    assert.equal(resB.resolvedWinner, 'EXTERNAL');
  });
});
