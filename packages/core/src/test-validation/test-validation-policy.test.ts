/**
 * @file packages/core/src/test-validation/test-validation-policy.test.ts
 * Unit tests for central validation policy engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestValidationPolicyEngine } from './test-validation-policy.js';
import type { RawValidationFinding } from './test-validation-types.js';

describe('TestValidationPolicyEngine', () => {
  const policyEngine = new TestValidationPolicyEngine();

  it('maps zero or info findings to VALID status', () => {
    const findings: RawValidationFinding[] = [
      {
        code: 'STRUCTURAL_INVALIDITY',
        severity: 'INFO',
        message: 'Boundary derived validly.',
      },
    ];

    const result = policyEngine.evaluateFindings(findings, 15);
    assert.strictEqual(result.status, 'VALID');
    assert.strictEqual(result.metrics.grounded, true);
    assert.strictEqual(result.metrics.totalFindings, 1);
  });

  it('maps warning findings to REVIEW_REQUIRED status', () => {
    const findings: RawValidationFinding[] = [
      {
        code: 'INVENTED_SELECTOR',
        severity: 'WARNING',
        message: 'Selector button#custom without evidence.',
      },
    ];

    const result = policyEngine.evaluateFindings(findings, 20);
    assert.strictEqual(result.status, 'REVIEW_REQUIRED');
    assert.strictEqual(result.metrics.warningCount, 1);
    assert.strictEqual(result.metrics.blockerCount, 0);
    assert.strictEqual(result.metrics.errorCount, 0);
  });

  it('maps error or blocker findings to REJECTED status', () => {
    const findings: RawValidationFinding[] = [
      {
        code: 'CONTRADICTS_REQUIREMENT',
        severity: 'BLOCKER',
        message: 'Contradicts archived user prohibition.',
      },
      {
        code: 'UNSUPPORTED_VALUE',
        severity: 'ERROR',
        message: 'Invented <= 2s SLA on vague requirement.',
      },
    ];

    const result = policyEngine.evaluateFindings(findings, 25);
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.metrics.blockerCount, 1);
    assert.strictEqual(result.metrics.errorCount, 1);
    assert.strictEqual(result.metrics.contradictionCount, 1);
    assert.strictEqual(result.metrics.hallucinationCount, 1);
    assert.strictEqual(result.metrics.grounded, false);
  });
});
