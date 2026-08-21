/**
 * @file packages/core/src/ai/categorized-tests/categorized-test-validator.test.ts
 * Unit tests for Phase 50 Categorized Test Validator.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StructuredCategorizedTestOutput } from './categorized-test-prompt-definition.js';
import type { CategorizedTestValidationContext } from './categorized-test-types.js';
import { CategorizedTestValidator } from './categorized-test-validator.js';

describe('Phase 50: Categorized Test Validator', () => {
  const baseContext: CategorizedTestValidationContext = {
    requirementKey: 'REQ-100',
    requirementId: '11111111-1111-1111-1111-111111111111',
    requirementText: 'Quantity must be between 10 and 50 inclusive.',
    validEvidenceRefIds: new Set(['REQ-100', '11111111-1111-1111-1111-111111111111', 'ctx-1']),
    validScenarioIds: new Set(['scn-1']),
  };

  it('strips ungrounded evidence references and issues warning', () => {
    const rawOutput: StructuredCategorizedTestOutput = {
      categoryAssessments: [],
      testDesigns: [
        {
          scenarioKey: 'SCN-001',
          category: 'POSITIVE',
          title: 'Accept quantity of 25',
          objective: 'Verify order accepts middle quantity.',
          rationale: 'Valid range.',
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-100', 'invented-doc-id-999'],
        },
      ],
      warnings: [],
    };

    const result = CategorizedTestValidator.validateAndSanitize(rawOutput, baseContext);

    assert.strictEqual(result.sanitizedTestDesigns.length, 1);
    assert.deepStrictEqual(result.sanitizedTestDesigns[0]?.sourceEvidenceRefs, ['REQ-100']);
    assert.strictEqual(result.ungroundedEvidenceCount, 1);
    assert.ok(result.warnings.some(w => w.code === 'UNGROUNDED_EVIDENCE_REF_STRIPPED'));
  });

  it('deduplicates identical or normalized test designs across categories', () => {
    const rawOutput: StructuredCategorizedTestOutput = {
      categoryAssessments: [],
      testDesigns: [
        {
          scenarioKey: 'SCN-001',
          category: 'NEGATIVE',
          title: 'Reject quantity below 10',
          objective: 'Verify quantity 9 is rejected.',
          rationale: 'Below minimum limit.',
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-100'],
        },
        {
          scenarioKey: 'SCN-001',
          category: 'NEGATIVE',
          title: 'Reject Quantity Below 10!', // duplicate title & objective normalized
          objective: 'Verify quantity 9 is rejected.',
          rationale: 'Duplicate attempt.',
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-100'],
        },
      ],
      warnings: [],
    };

    const result = CategorizedTestValidator.validateAndSanitize(rawOutput, baseContext);

    assert.strictEqual(result.sanitizedTestDesigns.length, 1);
    assert.strictEqual(result.duplicateCount, 1);
    assert.ok(result.warnings.some(w => w.code === 'DUPLICATE_TEST_DESIGN_REMOVED'));
  });

  it('normalizes category assessments and updates test counts', () => {
    const rawOutput: StructuredCategorizedTestOutput = {
      categoryAssessments: [
        {
          category: 'POSITIVE',
          applicability: 'APPLICABLE',
          rationale: 'Normal quantities.',
        },
        {
          category: 'BOUNDARY',
          applicability: 'APPLICABLE',
          rationale: 'Limits at 10 and 50.',
        },
      ],
      testDesigns: [
        {
          category: 'POSITIVE',
          title: 'Valid quantity 20',
          objective: 'Accept quantity 20.',
          rationale: 'Mid-range.',
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-100'],
        },
      ],
      warnings: [],
    };

    const result = CategorizedTestValidator.validateAndSanitize(rawOutput, baseContext);

    assert.strictEqual(result.sanitizedAssessments.length, 4);
    const pos = result.sanitizedAssessments.find(a => a.category === 'POSITIVE');
    const bnd = result.sanitizedAssessments.find(a => a.category === 'BOUNDARY');
    const neg = result.sanitizedAssessments.find(a => a.category === 'NEGATIVE');

    assert.strictEqual(pos?.testCount, 1);
    assert.strictEqual(pos?.applicability, 'APPLICABLE');

    // Boundary had 0 tests generated, so applicability was corrected to NOT_APPLICABLE
    assert.strictEqual(bnd?.testCount, 0);
    assert.strictEqual(bnd?.applicability, 'NOT_APPLICABLE');

    assert.strictEqual(neg?.testCount, 0);
    assert.strictEqual(neg?.applicability, 'NOT_APPLICABLE');
  });

  it('clamps test designs to maximum per scenario and total limit', () => {
    const excessiveTests = Array.from({ length: 15 }, (_, i) => ({
      scenarioKey: 'SCN-001',
      category: 'POSITIVE' as const,
      title: `Test design variation #${i + 1}`,
      objective: `Unique objective #${i + 1}`,
      rationale: `Rationale #${i + 1}`,
      confidence: 'HIGH' as const,
      sourceEvidenceRefs: ['REQ-100'],
    }));

    const rawOutput: StructuredCategorizedTestOutput = {
      categoryAssessments: [],
      testDesigns: excessiveTests,
      warnings: [],
    };

    const result = CategorizedTestValidator.validateAndSanitize(rawOutput, baseContext);

    // Clamped to MAX_TESTS_PER_SCENARIO (8)
    assert.ok(result.sanitizedTestDesigns.length <= 8);
    assert.ok(result.warnings.some(w => w.code === 'SCENARIO_TEST_LIMIT_EXCEEDED'));
  });
});
