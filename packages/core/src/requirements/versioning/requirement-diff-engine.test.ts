/**
 * @file packages/core/src/requirements/versioning/requirement-diff-engine.test.ts
 * Unit tests for RequirementDiffEngine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequirementDiffEngine } from './requirement-diff-engine.js';
import type { RequirementVersionSnapshotData } from './versioning-types.js';

describe('RequirementDiffEngine', () => {
  describe('computeCanonicalContentHash', () => {
    it('produces identical hash for identical normalized content', () => {
      const dataA: RequirementVersionSnapshotData = {
        title: 'User Login',
        originalText: 'The user shall login with password.',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
        status: 'ACTIVE',
      };
      const dataB: RequirementVersionSnapshotData = {
        title: '  User Login  ',
        originalText: 'The user shall login with password.  ',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
        status: 'ACTIVE',
      };

      const hashA = RequirementDiffEngine.computeCanonicalContentHash(dataA);
      const hashB = RequirementDiffEngine.computeCanonicalContentHash(dataB);

      assert.equal(hashA, hashB);
      assert.equal(hashA.length, 64);
    });

    it('produces distinct hashes when any field changes', () => {
      const base: RequirementVersionSnapshotData = {
        title: 'User Login',
        originalText: 'The user shall login with password.',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
        status: 'ACTIVE',
      };

      const textChanged = RequirementDiffEngine.computeCanonicalContentHash({
        ...base,
        originalText: 'The user shall login with MFA.',
      });
      const priorityChanged = RequirementDiffEngine.computeCanonicalContentHash({
        ...base,
        priority: 'CRITICAL',
      });
      const typeChanged = RequirementDiffEngine.computeCanonicalContentHash({
        ...base,
        type: 'SECURITY',
      });

      const baseHash = RequirementDiffEngine.computeCanonicalContentHash(base);
      assert.notEqual(textChanged, baseHash);
      assert.notEqual(priorityChanged, baseHash);
      assert.notEqual(typeChanged, baseHash);
    });
  });

  describe('computeTextDiff', () => {
    it('returns empty array when both texts are empty', () => {
      const diff = RequirementDiffEngine.computeTextDiff('', '');
      assert.deepEqual(diff, []);
    });

    it('returns UNCHANGED token when texts are identical', () => {
      const diff = RequirementDiffEngine.computeTextDiff(
        'System shall respond in 5s',
        'System shall respond in 5s',
      );
      assert.deepEqual(diff, [{ type: 'UNCHANGED', value: 'System shall respond in 5s' }]);
    });

    it('identifies word-level additions and removals', () => {
      const diff = RequirementDiffEngine.computeTextDiff(
        'System shall respond in 5 seconds',
        'System shall respond in 2 seconds',
      );

      const added = diff.filter(t => t.type === 'ADDED');
      const removed = diff.filter(t => t.type === 'REMOVED');
      const unchanged = diff.filter(t => t.type === 'UNCHANGED');

      assert.ok(removed.some(t => t.value.includes('5')));
      assert.ok(added.some(t => t.value.includes('2')));
      assert.ok(unchanged.some(t => t.value.includes('System shall respond in ')));
    });

    it('handles completely added text', () => {
      const diff = RequirementDiffEngine.computeTextDiff('', 'Brand new requirement');
      assert.deepEqual(diff, [{ type: 'ADDED', value: 'Brand new requirement' }]);
    });

    it('handles completely removed text', () => {
      const diff = RequirementDiffEngine.computeTextDiff('Old requirement', '');
      assert.deepEqual(diff, [{ type: 'REMOVED', value: 'Old requirement' }]);
    });
  });

  describe('computeRequirementDiff', () => {
    it('detects isNoOp true when no fields change', () => {
      const snap: RequirementVersionSnapshotData = {
        title: 'Authentication',
        originalText: 'System shall authenticate users.',
        type: 'FUNCTIONAL',
        priority: 'MEDIUM',
        status: 'ACTIVE',
      };

      const diff = RequirementDiffEngine.computeRequirementDiff(snap, snap, 1, 2);
      assert.equal(diff.isNoOp, true);
      assert.equal(diff.changedFields.length, 0);
      assert.equal(diff.changeKinds.length, 0);
    });

    it('detects single text change and semantic modality shift', () => {
      const oldSnap: RequirementVersionSnapshotData = {
        title: 'Authentication',
        originalText: 'System should authenticate users.',
        type: 'FUNCTIONAL',
        priority: 'MEDIUM',
        status: 'ACTIVE',
      };
      const newSnap: RequirementVersionSnapshotData = {
        title: 'Authentication',
        originalText: 'System shall authenticate users.',
        type: 'FUNCTIONAL',
        priority: 'MEDIUM',
        status: 'ACTIVE',
      };

      const diff = RequirementDiffEngine.computeRequirementDiff(oldSnap, newSnap, 1, 2);
      assert.equal(diff.isNoOp, false);
      assert.deepEqual(diff.changedFields, ['originalText']);
      assert.deepEqual(diff.changeKinds, ['TEXT_CHANGED']);

      const modalityShift = diff.structuredDiff.find(d => d.field === 'semantic:modality');
      assert.ok(modalityShift);
      assert.equal(modalityShift?.oldValue, 'should');
      assert.equal(modalityShift?.newValue, 'shall');
    });

    it('detects quantitative constraint shift', () => {
      const oldSnap: RequirementVersionSnapshotData = {
        title: 'Timeout',
        originalText: 'System shall timeout after 30 seconds.',
        type: 'NON_FUNCTIONAL',
        priority: 'HIGH',
        status: 'ACTIVE',
      };
      const newSnap: RequirementVersionSnapshotData = {
        title: 'Timeout',
        originalText: 'System shall timeout after 10 seconds.',
        type: 'NON_FUNCTIONAL',
        priority: 'HIGH',
        status: 'ACTIVE',
      };

      const diff = RequirementDiffEngine.computeRequirementDiff(oldSnap, newSnap, 1, 2);
      const quantShift = diff.structuredDiff.find(
        d => d.field === 'semantic:quantitativeConstraint',
      );
      assert.ok(quantShift);
      assert.deepEqual(quantShift?.oldValue, ['30']);
      assert.deepEqual(quantShift?.newValue, ['10']);
    });

    it('detects negation polarity shift', () => {
      const oldSnap: RequirementVersionSnapshotData = {
        title: 'Data Access',
        originalText: 'System shall allow direct database access.',
        type: 'SECURITY',
        priority: 'CRITICAL',
        status: 'ACTIVE',
      };
      const newSnap: RequirementVersionSnapshotData = {
        title: 'Data Access',
        originalText: 'System shall not allow direct database access.',
        type: 'SECURITY',
        priority: 'CRITICAL',
        status: 'ACTIVE',
      };

      const diff = RequirementDiffEngine.computeRequirementDiff(oldSnap, newSnap, 1, 2);
      const negationShift = diff.structuredDiff.find(d => d.field === 'semantic:negation');
      assert.ok(negationShift);
      assert.equal(negationShift?.oldValue, false);
      assert.equal(negationShift?.newValue, true);
    });

    it('detects MULTIPLE_FIELDS_CHANGED when several properties are updated', () => {
      const oldSnap: RequirementVersionSnapshotData = {
        title: 'Old Title',
        originalText: 'Old text',
        type: 'FUNCTIONAL',
        priority: 'LOW',
        status: 'DRAFT',
      };
      const newSnap: RequirementVersionSnapshotData = {
        title: 'New Title',
        originalText: 'New text',
        type: 'SECURITY',
        priority: 'CRITICAL',
        status: 'ACTIVE',
      };

      const diff = RequirementDiffEngine.computeRequirementDiff(oldSnap, newSnap, 1, 2);
      assert.equal(diff.isNoOp, false);
      assert.ok(diff.changedFields.includes('title'));
      assert.ok(diff.changedFields.includes('originalText'));
      assert.ok(diff.changedFields.includes('type'));
      assert.ok(diff.changedFields.includes('priority'));
      assert.ok(diff.changedFields.includes('status'));
      assert.equal(diff.changeKinds[0], 'MULTIPLE_FIELDS_CHANGED');
    });
  });
});
