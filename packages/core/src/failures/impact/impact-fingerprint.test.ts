/**
 * @file packages/core/src/failures/impact/impact-fingerprint.test.ts
 * Unit tests for cryptographic fingerprinting and secret redaction (Phase 84).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImpactFingerprint, type ImpactFingerprintFacts } from './impact-fingerprint.js';

function createMockFingerprintFacts(
  overrides: Partial<ImpactFingerprintFacts> = {},
): ImpactFingerprintFacts {
  return {
    projectId: '550e8400-e29b-41d4-a716-446655440000',
    failureCaseId: '660e8400-e29b-41d4-a716-446655440000',
    testCaseId: '770e8400-e29b-41d4-a716-446655440000',
    testCaseVersionNumber: 1,
    severity: 'HIGH',
    severityRuleId: 'SEV_HIGH_MAJOR_WORKFLOW_BLOCKED_001',
    priority: 'P1_URGENT',
    priorityRuleId: 'PRI_P1_URGENT_001',
    releaseRecommendation: 'BLOCK_RELEASE',
    userImpact: 'ALL_USERS',
    dataImpact: 'NO_DATA_IMPACT',
    securityImpact: 'NONE_PROVEN',
    availabilityImpact: 'MODULE_UNAVAILABLE',
    blastRadius: 'SINGLE_MODULE',
    workaroundStatus: 'NO_WORKAROUND',
    domain: 'APPLICATION_DEFECT_CANDIDATE',
    technicalLayer: 'BACKEND_API',
    rootCauseStatus: 'SUPPORTED_HYPOTHESIS',
    rootCauseProbableLayer: 'BACKEND',
    evidenceArtifactHashes: ['hash-aaa', 'hash-bbb'],
    severityModelVersion: '1.0.0',
    priorityModelVersion: '1.0.0',
    impactModelVersion: '1.0.0',
    ...overrides,
  };
}

test('ImpactFingerprint: Invariant SHA-256 Digest', async t => {
  await t.test('1. Produces exact 64-character hex string', () => {
    const facts = createMockFingerprintFacts();
    const fp = generateImpactFingerprint(facts);
    assert.equal(fp.length, 64);
    assert.match(fp, /^[0-9a-f]{64}$/);
  });

  await t.test('2. Is deterministic across identical facts', () => {
    const factsA = createMockFingerprintFacts();
    const factsB = createMockFingerprintFacts();
    assert.equal(generateImpactFingerprint(factsA), generateImpactFingerprint(factsB));
  });

  await t.test('3. Produces distinct hashes for different severity or priority', () => {
    const highP1 = createMockFingerprintFacts({ severity: 'HIGH', priority: 'P1_URGENT' });
    const medP1 = createMockFingerprintFacts({ severity: 'MEDIUM', priority: 'P1_URGENT' });
    const highP0 = createMockFingerprintFacts({ severity: 'HIGH', priority: 'P0_IMMEDIATE' });

    assert.notEqual(generateImpactFingerprint(highP1), generateImpactFingerprint(medP1));
    assert.notEqual(generateImpactFingerprint(highP1), generateImpactFingerprint(highP0));
  });

  await t.test('4. Sorts evidence artifact hashes canonicalized regardless of input order', () => {
    const facts1 = createMockFingerprintFacts({
      evidenceArtifactHashes: ['hash-2', 'hash-1', 'hash-3'],
    });
    const facts2 = createMockFingerprintFacts({
      evidenceArtifactHashes: ['hash-1', 'hash-3', 'hash-2'],
    });
    assert.equal(generateImpactFingerprint(facts1), generateImpactFingerprint(facts2));
  });
});
