/**
 * @file packages/core/src/ai/test-design/test-design-validator.test.ts
 * Unit tests for TestDesignValidator: citation checking, ungrounded ID sanitization, deduplication, and bounds clamping.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestDesignValidator } from './test-design-validator.js';
import type { StructuredTestDesignDto } from '@ai-quality/contracts';

describe('TestDesignValidator Unit Tests', () => {
  const validEvidenceIds = new Set(['REQ-AUTH-001', 'ctx-1', 'ctx-2']);

  const sampleDesign: StructuredTestDesignDto = {
    applicability: 'APPLICABLE',
    applicabilityRationale: 'Actionable requirements.',
    automationSuitability: 'HIGH',
    automationRationale: 'Deterministic validation.',
    recommendedLevels: [
      {
        level: 'UNIT',
        priority: 'HIGH',
        rationale: 'Unit tests',
        evidenceRefs: ['REQ-AUTH-001', 'fake-evidence-999'],
      },
      {
        level: 'UNIT', // Duplicate level
        priority: 'MEDIUM',
        rationale: 'Duplicate unit',
        evidenceRefs: ['ctx-1'],
      },
    ],
    recommendedDimensions: [
      {
        dimension: 'BOUNDARY',
        applicable: true,
        priority: 'HIGH',
        rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
        evidenceRefs: ['REQ-AUTH-001'],
        confidence: 'HIGH',
      },
      {
        dimension: 'BOUNDARY', // Duplicate dimension
        applicable: true,
        priority: 'MEDIUM',
        rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
        evidenceRefs: ['ctx-1'],
        confidence: 'HIGH',
      },
    ],
    recommendedTechniques: [
      {
        technique: 'BOUNDARY_VALUE_ANALYSIS',
        priority: 'HIGH',
        rationale: 'Boundary checks',
        rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
        evidenceRefs: ['ctx-1', 'unreal-evidence-id'],
        confidence: 'HIGH',
      },
      {
        technique: 'BOUNDARY_VALUE_ANALYSIS', // Duplicate technique
        priority: 'MEDIUM',
        rationale: 'Duplicate technique',
        rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
        evidenceRefs: ['ctx-2'],
        confidence: 'HIGH',
      },
    ],
    coverageObjectives: [
      {
        id: 'CO-1',
        category: 'BOUNDARY_LIMITS',
        priority: 'HIGH',
        description: 'Verify lockout occurs at 5 attempts',
        rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
        evidenceRefs: ['REQ-AUTH-001'],
      },
      {
        id: 'CO-2',
        category: 'BOUNDARY_LIMITS',
        priority: 'HIGH',
        description: 'Verify lockout occurs at 5 attempts', // Duplicate description
        rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
        evidenceRefs: ['ctx-1'],
      },
    ],
    riskFocusAreas: [],
    identifiedConstraints: [
      {
        id: 'TC-1',
        constraintType: 'NUMERIC_RANGE',
        parameter: 'Lockout threshold',
        value: '5',
        unit: 'attempts',
        evidenceRef: 'REQ-AUTH-001',
      },
      {
        id: 'TC-2',
        constraintType: 'NUMERIC_RANGE',
        parameter: 'Lockout threshold',
        value: '5',
        unit: 'attempts',
        evidenceRef: 'invented-evidence-id',
      },
    ],
    designQuestions: [],
    rationale: [],
    sourceContext: [],
  };

  it('sanitizes and strips ungrounded evidence references and counts invalid refs', () => {
    const result = TestDesignValidator.validateAndSanitize(
      sampleDesign,
      validEvidenceIds,
      'The system shall lock a user account after 5 failed attempts.',
    );

    assert.ok(result.invalidEvidenceRefs >= 2);
    assert.ok(result.warnings.length >= 2);

    // Verify ungrounded ID was removed from UNIT level
    const unitLevel = result.sanitizedDesign.recommendedLevels.find(l => l.level === 'UNIT');
    assert.ok(unitLevel);
    assert.deepEqual(unitLevel.evidenceRefs, ['REQ-AUTH-001']);

    // Verify ungrounded ID was stripped from constraint
    const constraint2 = result.sanitizedDesign.identifiedConstraints.find(c => c.id === 'TC-2');
    assert.ok(constraint2);
    assert.equal(constraint2.evidenceRef, null);
  });

  it('deduplicates duplicate levels, dimensions, techniques, and objectives', () => {
    const result = TestDesignValidator.validateAndSanitize(
      sampleDesign,
      validEvidenceIds,
      'The system shall lock a user account after 5 failed attempts.',
    );

    // Only 1 UNIT level
    assert.equal(result.sanitizedDesign.recommendedLevels.length, 1);

    // Only 1 BOUNDARY dimension
    assert.equal(result.sanitizedDesign.recommendedDimensions.length, 1);

    // Only 1 BOUNDARY_VALUE_ANALYSIS technique
    assert.equal(result.sanitizedDesign.recommendedTechniques.length, 1);

    // Only 1 objective with the same description
    assert.equal(result.sanitizedDesign.coverageObjectives.length, 1);
  });
});
