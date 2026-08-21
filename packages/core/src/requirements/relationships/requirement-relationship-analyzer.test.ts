/**
 * @file packages/core/src/requirements/relationships/requirement-relationship-analyzer.test.ts
 * Unit tests for RequirementRelationshipAnalyzer and cycle detection algorithms.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequirementRelationshipAnalyzer } from './requirement-relationship-analyzer.js';
import type { RelationshipInputRequirement } from './relationship-types.js';

describe('RequirementRelationshipAnalyzer', () => {
  const req1: RelationshipInputRequirement = {
    id: '11111111-1111-1111-1111-111111111111',
    projectId: 'proj-1',
    requirementKey: 'REQ-001',
    title: 'User Authentication',
    originalText: 'The system shall authenticate users with email and password.',
    externalKey: 'AUTH-1',
    sha256: 'sha-req-1',
  };

  const req2: RelationshipInputRequirement = {
    id: '22222222-2222-2222-2222-222222222222',
    projectId: 'proj-1',
    requirementKey: 'REQ-002',
    title: 'Password Reset',
    originalText: 'The password reset flow depends on REQ-001 for user verification.',
    externalKey: 'AUTH-1.1',
    sha256: 'sha-req-2',
  };

  const req3: RelationshipInputRequirement = {
    id: '33333333-3333-3333-3333-333333333333',
    projectId: 'proj-1',
    requirementKey: 'REQ-003',
    title: 'Session Timeout',
    originalText: 'Session timeout constrains AUTH-1 and limits session duration to 15 minutes.',
    externalKey: 'AUTH-2',
    sha256: 'sha-req-3',
  };

  const req4: RelationshipInputRequirement = {
    id: '44444444-4444-4444-4444-444444444444',
    projectId: 'proj-1',
    requirementKey: 'REQ-004',
    title: 'Multi-Factor Authentication',
    originalText:
      'MFA refines REQ-001 by requiring a TOTP code during login. Also see REQ-999 for legacy SMS.',
    externalKey: 'AUTH-1.2',
    sha256: 'sha-req-4',
  };

  const reqSelf: RelationshipInputRequirement = {
    id: '55555555-5555-5555-5555-555555555555',
    projectId: 'proj-1',
    requirementKey: 'REQ-005',
    title: 'Self Referencing Flow',
    originalText: 'This requirement requires REQ-005 to function properly.',
    externalKey: 'MISC-1',
    sha256: 'sha-req-5',
  };

  it('detects explicit reference with DEPENDS_ON relationship', () => {
    const result = RequirementRelationshipAnalyzer.analyzeRelationships([req1, req2]);
    const depends = result.proposedRelationships.find(
      r => r.sourceRequirementId === req2.id && r.targetRequirementId === req1.id,
    );

    assert.ok(depends);
    assert.strictEqual(depends?.relationshipType, 'DEPENDS_ON');
    assert.strictEqual(depends?.detectionMethod, 'EXPLICIT_REFERENCE');
    assert.strictEqual(depends?.status, 'PROPOSED');
  });

  it('detects external key reference and CONSTRAINS relationship', () => {
    const result = RequirementRelationshipAnalyzer.analyzeRelationships([req1, req3]);
    const constrains = result.proposedRelationships.find(
      r => r.sourceRequirementId === req3.id && r.targetRequirementId === req1.id,
    );

    assert.ok(constrains);
    assert.strictEqual(constrains?.relationshipType, 'CONSTRAINS');
    assert.strictEqual(constrains?.detectionMethod, 'EXPLICIT_REFERENCE');
  });

  it('detects REFINES relationship and tracks unresolved references', () => {
    const result = RequirementRelationshipAnalyzer.analyzeRelationships([req1, req4]);
    const refines = result.proposedRelationships.find(
      r => r.sourceRequirementId === req4.id && r.targetRequirementId === req1.id,
    );

    assert.ok(refines);
    assert.strictEqual(refines?.relationshipType, 'REFINES');

    // Unresolved reference REQ-999
    assert.ok(result.unresolvedReferences.includes('REQ-999'));
  });

  it('infers parent/child relationship from hierarchical external keys', () => {
    const result = RequirementRelationshipAnalyzer.analyzeRelationships([req1, req2, req4]);
    // AUTH-1 is parent of AUTH-1.1 (req2) and AUTH-1.2 (req4)
    const parentRel1 = result.proposedRelationships.find(
      r =>
        r.sourceRequirementId === req1.id &&
        r.targetRequirementId === req2.id &&
        r.relationshipType === 'PARENT_OF',
    );
    const parentRel2 = result.proposedRelationships.find(
      r =>
        r.sourceRequirementId === req1.id &&
        r.targetRequirementId === req4.id &&
        r.relationshipType === 'PARENT_OF',
    );

    assert.ok(parentRel1);
    assert.strictEqual(parentRel1?.detectionMethod, 'SOURCE_HIERARCHY');
    assert.ok(parentRel2);
    assert.strictEqual(parentRel2?.detectionMethod, 'SOURCE_HIERARCHY');
  });

  it('rejects self-relationships strictly', () => {
    const result = RequirementRelationshipAnalyzer.analyzeRelationships([reqSelf]);
    const selfRel = result.proposedRelationships.find(
      r => r.sourceRequirementId === reqSelf.id && r.targetRequirementId === reqSelf.id,
    );
    assert.strictEqual(selfRel, undefined);
  });

  it('detects directed dependency cycles deterministically without throwing', () => {
    const edges = [
      {
        sourceRequirementId: 'req-a',
        targetRequirementId: 'req-b',
        relationshipType: 'DEPENDS_ON' as const,
      },
      {
        sourceRequirementId: 'req-b',
        targetRequirementId: 'req-c',
        relationshipType: 'DEPENDS_ON' as const,
      },
      {
        sourceRequirementId: 'req-c',
        targetRequirementId: 'req-a',
        relationshipType: 'DEPENDS_ON' as const,
      },
      {
        sourceRequirementId: 'req-c',
        targetRequirementId: 'req-d',
        relationshipType: 'DEPENDS_ON' as const,
      },
    ];

    const keyLookup = new Map<string, string>([
      ['req-a', 'REQ-001'],
      ['req-b', 'REQ-002'],
      ['req-c', 'REQ-003'],
      ['req-d', 'REQ-004'],
    ]);

    const cycles = RequirementRelationshipAnalyzer.detectCycles(edges, keyLookup);
    assert.strictEqual(cycles.length, 1);
    assert.ok(cycles[0]?.pathDescription.includes('REQ-001'));
    assert.ok(cycles[0]?.pathDescription.includes('REQ-002'));
    assert.ok(cycles[0]?.pathDescription.includes('REQ-003'));
  });

  it('guarantees 100% determinism across shuffled input ordering', () => {
    const listA = [req1, req2, req3, req4];
    const listB = [req4, req2, req1, req3];

    const resultA = RequirementRelationshipAnalyzer.analyzeRelationships(listA);
    const resultB = RequirementRelationshipAnalyzer.analyzeRelationships(listB);

    assert.deepEqual(resultA.proposedRelationships, resultB.proposedRelationships);
    assert.deepEqual(resultA.unresolvedReferences, resultB.unresolvedReferences);
  });
});
