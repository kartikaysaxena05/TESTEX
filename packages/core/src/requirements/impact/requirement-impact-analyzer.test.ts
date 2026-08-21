/**
 * @file packages/core/src/requirements/impact/requirement-impact-analyzer.test.ts
 * Unit tests for RequirementImpactAnalyzer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequirementImpactAnalyzer } from './requirement-impact-analyzer.js';
import type { RequirementRelationship, RequirementRepositoryEvidence } from '@prisma/client';

describe('RequirementImpactAnalyzer', () => {
  const projectId = 'proj-1';
  const requirementId = 'req-a';
  const versionId = 'ver-1';

  it('detects direct dependent requirements (REQ-B depends on REQ-A)', () => {
    const relationships: RequirementRelationship[] = [
      {
        id: 'rel-1',
        projectId,
        sourceRequirementId: 'req-b',
        targetRequirementId: 'req-a',
        relationshipType: 'DEPENDS_ON',
        status: 'PROPOSED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-b',
        targetRequirementTextSha256: 'sha-a',
        analyzerVersion: 'v1',
        reviewRationale: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const candidates = RequirementImpactAnalyzer.analyzeImpact({
      projectId,
      requirementId,
      requirementVersionId: versionId,
      allRelationships: relationships,
      allEvidence: [],
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.impactType, 'DEPENDENT_REQUIREMENT');
    assert.equal(candidates[0]?.targetRequirementId, 'req-b');
    assert.equal(candidates[0]?.depth, 1);
    assert.equal(candidates[0]?.reasonCode, 'DIRECT_DEPENDENCY');
  });

  it('detects direct directional REQUIRED_BY dependencies (REQ-A required by REQ-B)', () => {
    const relationships: RequirementRelationship[] = [
      {
        id: 'rel-1',
        projectId,
        sourceRequirementId: 'req-a',
        targetRequirementId: 'req-b',
        relationshipType: 'REQUIRED_BY',
        status: 'CONFIRMED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-a',
        targetRequirementTextSha256: 'sha-b',
        analyzerVersion: 'v1',
        reviewRationale: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const candidates = RequirementImpactAnalyzer.analyzeImpact({
      projectId,
      requirementId,
      requirementVersionId: versionId,
      allRelationships: relationships,
      allEvidence: [],
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.impactType, 'DEPENDENT_REQUIREMENT');
    assert.equal(candidates[0]?.targetRequirementId, 'req-b');
    assert.equal(candidates[0]?.depth, 1);
  });

  it('detects transitive dependencies up to depth 3 with cycle protection', () => {
    const relationships: RequirementRelationship[] = [
      // req-b depends on req-a (depth 1)
      {
        id: 'rel-1',
        projectId,
        sourceRequirementId: 'req-b',
        targetRequirementId: 'req-a',
        relationshipType: 'DEPENDS_ON',
        status: 'CONFIRMED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-b',
        targetRequirementTextSha256: 'sha-a',
        analyzerVersion: 'v1',
        reviewRationale: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // req-c depends on req-b (depth 2)
      {
        id: 'rel-2',
        projectId,
        sourceRequirementId: 'req-c',
        targetRequirementId: 'req-b',
        relationshipType: 'DEPENDS_ON',
        status: 'CONFIRMED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-c',
        targetRequirementTextSha256: 'sha-b',
        analyzerVersion: 'v1',
        reviewRationale: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // cycle: req-a depends on req-c
      {
        id: 'rel-3',
        projectId,
        sourceRequirementId: 'req-a',
        targetRequirementId: 'req-c',
        relationshipType: 'DEPENDS_ON',
        status: 'CONFIRMED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-a',
        targetRequirementTextSha256: 'sha-c',
        analyzerVersion: 'v1',
        reviewRationale: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const candidates = RequirementImpactAnalyzer.analyzeImpact({
      projectId,
      requirementId,
      requirementVersionId: versionId,
      allRelationships: relationships,
      allEvidence: [],
      maxDepth: 3,
    });

    const bCand = candidates.find(c => c.targetRequirementId === 'req-b');
    const cCand = candidates.find(c => c.targetRequirementId === 'req-c');

    assert.ok(bCand);
    assert.equal(bCand?.depth, 1);
    assert.ok(cCand);
    assert.equal(cCand?.depth, 2);
    // Cycle did not cause infinite loop or duplicate candidate
    assert.equal(candidates.filter(c => c.targetRequirementId === 'req-a').length, 0);
  });

  it('detects structural hierarchy (PARENT_OF and CHILD_OF)', () => {
    const relationships: RequirementRelationship[] = [
      {
        id: 'rel-1',
        projectId,
        sourceRequirementId: 'req-a',
        targetRequirementId: 'req-child',
        relationshipType: 'PARENT_OF',
        status: 'CONFIRMED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-a',
        targetRequirementTextSha256: 'sha-child',
        analyzerVersion: 'v1',
        reviewRationale: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'rel-2',
        projectId,
        sourceRequirementId: 'req-parent',
        targetRequirementId: 'req-a',
        relationshipType: 'PARENT_OF',
        status: 'CONFIRMED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-parent',
        targetRequirementTextSha256: 'sha-a',
        analyzerVersion: 'v1',
        reviewRationale: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const candidates = RequirementImpactAnalyzer.analyzeImpact({
      projectId,
      requirementId,
      requirementVersionId: versionId,
      allRelationships: relationships,
      allEvidence: [],
    });

    const child = candidates.find(c => c.targetRequirementId === 'req-child');
    const parent = candidates.find(c => c.targetRequirementId === 'req-parent');

    assert.equal(child?.impactType, 'CHILD_REQUIREMENT');
    assert.equal(parent?.impactType, 'PARENT_REQUIREMENT');
  });

  it('detects constraints, conflicts, and related relationships', () => {
    const relationships: RequirementRelationship[] = [
      {
        id: 'rel-1',
        projectId,
        sourceRequirementId: 'req-a',
        targetRequirementId: 'req-constrained',
        relationshipType: 'CONSTRAINS',
        status: 'CONFIRMED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-a',
        targetRequirementTextSha256: 'sha-constrained',
        analyzerVersion: 'v1',
        reviewRationale: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'rel-2',
        projectId,
        sourceRequirementId: 'req-a',
        targetRequirementId: 'req-conflict',
        relationshipType: 'CONFLICTS_WITH',
        status: 'PROPOSED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-a',
        targetRequirementTextSha256: 'sha-conflict',
        analyzerVersion: 'v1',
        reviewRationale: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'rel-3',
        projectId,
        sourceRequirementId: 'req-a',
        targetRequirementId: 'req-related',
        relationshipType: 'RELATED_TO',
        status: 'CONFIRMED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-a',
        targetRequirementTextSha256: 'sha-related',
        analyzerVersion: 'v1',
        reviewRationale: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const candidates = RequirementImpactAnalyzer.analyzeImpact({
      projectId,
      requirementId,
      requirementVersionId: versionId,
      allRelationships: relationships,
      allEvidence: [],
    });

    assert.equal(
      candidates.find(c => c.targetRequirementId === 'req-constrained')?.impactType,
      'CONSTRAINED_REQUIREMENT',
    );
    assert.equal(
      candidates.find(c => c.targetRequirementId === 'req-conflict')?.impactType,
      'CONFLICT_REVIEW',
    );
    assert.equal(
      candidates.find(c => c.targetRequirementId === 'req-related')?.impactType,
      'RELATED_REQUIREMENT',
    );
  });

  it('ignores REJECTED relationships entirely', () => {
    const relationships: RequirementRelationship[] = [
      {
        id: 'rel-1',
        projectId,
        sourceRequirementId: 'req-b',
        targetRequirementId: 'req-a',
        relationshipType: 'DEPENDS_ON',
        status: 'REJECTED',
        detectionMethod: 'DETERMINISTIC_RULE',
        reasonCodes: [],
        evidence: null,
        sourceRequirementTextSha256: 'sha-b',
        targetRequirementTextSha256: 'sha-a',
        analyzerVersion: 'v1',
        reviewRationale: 'Invalid dependency',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const candidates = RequirementImpactAnalyzer.analyzeImpact({
      projectId,
      requirementId,
      requirementVersionId: versionId,
      allRelationships: relationships,
      allEvidence: [],
    });

    assert.equal(candidates.length, 0);
  });

  it('includes linked repository evidence as impact candidates', () => {
    const evidence: RequirementRepositoryEvidence[] = [
      {
        id: 'ev-1',
        projectId,
        requirementId,
        projectSourceId: 'src-1',
        repositorySnapshotId: 'snap-1',
        indexedFileId: 'file-1',
        symbolId: 'sym-1',
        filePath: 'src/auth/login.ts',
        symbolName: 'authenticateUser',
        evidenceType: 'SERVICE',
        evidenceScore: 88,
        matchMethod: 'EXACT_SYMBOL',
        reasonCodes: [],
        status: 'CONFIRMED',
        reviewRationale: null,
        matcherVersion: 'requirement-repo-matcher-v1',
        sourceRequirementTextSha256: 'sha-1',
        fileContentHash: 'hash-1',
        lineStart: 1,
        lineEnd: 20,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const candidates = RequirementImpactAnalyzer.analyzeImpact({
      projectId,
      requirementId,
      requirementVersionId: versionId,
      allRelationships: [],
      allEvidence: evidence,
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.impactType, 'REPOSITORY_EVIDENCE');
    assert.equal(candidates[0]?.repositoryEvidenceId, 'ev-1');
    assert.equal(candidates[0]?.depth, 1);
    assert.equal(candidates[0]?.reasonCode, 'CONFIRMED_REPOSITORY_EVIDENCE');
  });
});
