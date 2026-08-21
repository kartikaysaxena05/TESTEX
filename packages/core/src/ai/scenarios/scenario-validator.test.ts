import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ScenarioValidator } from './scenario-validator.js';
import type { ScenarioValidationContext } from './scenario-types.js';

describe('ScenarioValidator Unit Tests', () => {
  const context: ScenarioValidationContext = {
    requirementKey: 'REQ-042',
    requirementId: '550e8400-e29b-41d4-a716-446655440000',
    requirementText: 'Only users with the ADMIN role shall access audit logs.',
    validEvidenceRefIds: new Set(['REQ-042', '550e8400-e29b-41d4-a716-446655440000', 'ctx-auth-1']),
  };

  it('sanitizes and strips ungrounded evidence references', () => {
    const rawOutput = {
      scenarios: [
        {
          scenarioKey: 'SCN-001',
          title: 'Verify ADMIN audit log access',
          objective: 'Ensure only ADMIN can view logs',
          rationale: 'Follows from role restriction',
          requirementAspect: 'Authorization',
          sourceEvidenceRefs: ['REQ-042', 'fake-ref-999', 'ctx-auth-1', 'unsupplied-chunk-123'],
          assumptions: [],
        },
      ],
      assumptions: [],
      warnings: [],
    };

    const result = ScenarioValidator.validateAndSanitize(rawOutput, context);
    assert.equal(result.ungroundedEvidenceCount, 2);
    assert.equal(result.sanitizedOutput.scenarios.length, 1);

    const scenario = result.sanitizedOutput.scenarios[0]!;
    assert.deepEqual(scenario.sourceEvidenceRefs, ['REQ-042', 'ctx-auth-1']);
    assert.ok(result.warnings.some(w => w.code === 'UNGROUNDED_EVIDENCE_REF_STRIPPED'));
  });

  it('deduplicates duplicate scenarios with near-identical titles and objectives', () => {
    const rawOutput = {
      scenarios: [
        {
          scenarioKey: 'SCN-001',
          title: 'Verify user can login with valid credentials',
          objective: 'Test valid login credentials',
          rationale: 'Standard auth',
          requirementAspect: 'Login',
          sourceEvidenceRefs: ['REQ-042'],
          assumptions: [],
        },
        {
          scenarioKey: 'SCN-002',
          title: 'Verify user can login with valid credentials.', // punctuation duplicate
          objective: 'Test valid login credentials!',
          rationale: 'Duplicate intent',
          requirementAspect: 'Login',
          sourceEvidenceRefs: ['REQ-042'],
          assumptions: [],
        },
        {
          scenarioKey: 'SCN-003',
          title: 'Verify access rejection for invalid credentials',
          objective: 'Test invalid login credentials rejection',
          rationale: 'Negative auth',
          requirementAspect: 'Login Rejection',
          sourceEvidenceRefs: ['REQ-042'],
          assumptions: [],
        },
      ],
      assumptions: [],
      warnings: [],
    };

    const result = ScenarioValidator.validateAndSanitize(rawOutput, context);
    assert.equal(result.duplicateCount, 1);
    assert.equal(result.sanitizedOutput.scenarios.length, 2);
    assert.equal(
      result.sanitizedOutput.scenarios[0]?.title,
      'Verify user can login with valid credentials',
    );
    assert.equal(
      result.sanitizedOutput.scenarios[1]?.title,
      'Verify access rejection for invalid credentials',
    );
  });

  it('bounds scenarios to maximum limit and clamps strings', () => {
    const scenarios = [];
    for (let i = 1; i <= 20; i++) {
      scenarios.push({
        scenarioKey: `SCN-${i}`,
        title: `Scenario candidate number ${i}`,
        objective: `Objective for scenario ${i}`,
        rationale: `Rationale ${i}`,
        requirementAspect: `Aspect ${i}`,
        sourceEvidenceRefs: ['REQ-042'],
        assumptions: [
          'Assumption A',
          'Assumption B',
          'Assumption C',
          'Assumption D',
          'Assumption E',
          'Assumption F',
        ],
      });
    }

    const result = ScenarioValidator.validateAndSanitize(
      { scenarios, assumptions: [], warnings: [] },
      context,
    );

    assert.equal(result.sanitizedOutput.scenarios.length, 12);
    assert.ok(result.warnings.some(w => w.code === 'SCENARIO_COUNT_EXCEEDED'));
    // assumptions clamped to 5
    assert.equal(result.sanitizedOutput.scenarios[0]?.assumptions.length, 5);
  });
});
