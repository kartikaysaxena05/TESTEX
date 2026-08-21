/**
 * @file packages/core/src/ai/test-design/deterministic-rules-engine.test.ts
 * Unit tests for pure deterministic Test Design Rule Engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicRulesEngine } from './deterministic-rules-engine.js';

describe('DeterministicRulesEngine Unit Tests', () => {
  it('identifies boundary and range rules for numeric range constraints (1 to 100 inclusive)', () => {
    const result = DeterministicRulesEngine.evaluate({
      requirementId: 'req-range-1',
      requirementKey: 'REQ-RANGE-001',
      title: 'Quantity Input Range',
      statement: 'The quantity field shall accept values from 1 to 100 inclusive.',
      type: 'FUNCTIONAL',
      priority: 'HIGH',
      category: 'DATA_VALIDATION',
    });

    assert.equal(result.applicability, 'APPLICABLE');
    assert.equal(result.automationSuitability, 'HIGH');

    // Dimensions
    const dimensions = result.recommendedDimensions.map(d => d.dimension);
    assert.ok(dimensions.includes('BOUNDARY'));
    assert.ok(dimensions.includes('VALIDATION'));
    assert.ok(dimensions.includes('NEGATIVE'));
    assert.ok(dimensions.includes('FUNCTIONAL'));

    // Techniques
    const techniques = result.recommendedTechniques.map(t => t.technique);
    assert.ok(techniques.includes('BOUNDARY_VALUE_ANALYSIS'));
    assert.ok(techniques.includes('EQUIVALENCE_PARTITIONING'));
    assert.ok(techniques.includes('INPUT_VALIDATION'));

    // Constraints
    assert.ok(result.identifiedConstraints.length > 0);
    const rangeConstraint = result.identifiedConstraints.find(
      c => c.constraintType === 'NUMERIC_RANGE',
    );
    assert.ok(rangeConstraint);
    assert.equal(rangeConstraint.lowerBound, '1');
    assert.equal(rangeConstraint.upperBound, '100');
    assert.equal(rangeConstraint.isInclusive, true);

    // Levels
    const levels = result.recommendedLevels.map(l => l.level);
    assert.ok(levels.includes('UNIT'));
    assert.ok(levels.includes('COMPONENT'));
  });

  it('identifies role and permission authorization testing for restricted access requirements', () => {
    const result = DeterministicRulesEngine.evaluate({
      requirementId: 'req-auth-1',
      requirementKey: 'REQ-AUTH-001',
      title: 'Admin User Deletion',
      statement: 'Only administrators shall be permitted to delete users.',
      type: 'SECURITY',
      priority: 'HIGH',
      category: 'SECURITY',
    });

    assert.equal(result.applicability, 'APPLICABLE');

    // Dimensions
    const dimensions = result.recommendedDimensions.map(d => d.dimension);
    assert.ok(dimensions.includes('AUTHORIZATION'));
    assert.ok(dimensions.includes('SECURITY'));

    // Techniques
    const techniques = result.recommendedTechniques.map(t => t.technique);
    assert.ok(techniques.includes('ROLE_PERMISSION_TESTING'));

    // Coverage Objectives
    const objCategories = result.coverageObjectives.map(o => o.category);
    assert.ok(objCategories.includes('SECURITY_AUTHORIZATION'));

    // Risk Focus
    assert.ok(result.riskFocusAreas.some(r => r.area.includes('Authorization')));
  });

  it('identifies latency thresholds and performance testing rules (500 ms)', () => {
    const result = DeterministicRulesEngine.evaluate({
      requirementId: 'req-perf-1',
      requirementKey: 'REQ-PERF-001',
      title: 'Search API Latency',
      statement: 'The search API shall respond within 500 ms for 95% of requests.',
      type: 'PERFORMANCE',
      priority: 'CRITICAL',
      category: 'PERFORMANCE',
    });

    assert.equal(result.applicability, 'APPLICABLE');

    // Dimensions
    const dimensions = result.recommendedDimensions.map(d => d.dimension);
    assert.ok(dimensions.includes('PERFORMANCE'));

    // Techniques
    const techniques = result.recommendedTechniques.map(t => t.technique);
    assert.ok(techniques.includes('PERFORMANCE_TESTING'));

    // Constraint Preservation
    const timeConstraint = result.identifiedConstraints.find(
      c => c.constraintType === 'TIME_LIMIT',
    );
    assert.ok(timeConstraint);
    assert.equal(timeConstraint.value, '500');
    assert.equal(timeConstraint.unit, 'ms');

    // Levels
    const levels = result.recommendedLevels.map(l => l.level);
    assert.ok(levels.includes('API'));
    assert.ok(levels.includes('SYSTEM'));
  });

  it('identifies multi-condition decision rules (premium customer discount)', () => {
    const result = DeterministicRulesEngine.evaluate({
      requirementId: 'req-biz-1',
      requirementKey: 'REQ-BIZ-001',
      title: 'Premium Discount Calculation',
      statement:
        'If customer is premium and order value exceeds ₹10,000, a 10% discount shall apply.',
      type: 'BUSINESS_RULE',
      priority: 'MEDIUM',
      category: 'BUSINESS_LOGIC',
    });

    assert.equal(result.applicability, 'APPLICABLE');

    // Dimensions
    const dimensions = result.recommendedDimensions.map(d => d.dimension);
    assert.ok(dimensions.includes('BUSINESS_RULE'));

    // Techniques
    const techniques = result.recommendedTechniques.map(t => t.technique);
    assert.ok(techniques.includes('DECISION_TABLE'));
  });

  it('identifies state transition lifecycle testing rules', () => {
    const result = DeterministicRulesEngine.evaluate({
      requirementId: 'req-st-1',
      requirementKey: 'REQ-ST-001',
      title: 'Invoice Status Lifecycle',
      statement:
        'An APPROVED invoice may transition to CANCELLED state only before payment is recorded.',
      type: 'FUNCTIONAL',
      priority: 'HIGH',
    });

    assert.equal(result.applicability, 'APPLICABLE');

    // Dimensions
    const dimensions = result.recommendedDimensions.map(d => d.dimension);
    assert.ok(dimensions.includes('STATE_TRANSITION'));

    // Techniques
    const techniques = result.recommendedTechniques.map(t => t.technique);
    assert.ok(techniques.includes('STATE_TRANSITION'));
  });

  it('identifies negative prohibition constraints (shall not)', () => {
    const result = DeterministicRulesEngine.evaluate({
      requirementId: 'req-neg-1',
      requirementKey: 'REQ-NEG-001',
      title: 'Tenant Isolation',
      statement: 'Users shall not access records belonging to another tenant.',
      type: 'SECURITY',
      priority: 'CRITICAL',
    });

    assert.equal(result.applicability, 'APPLICABLE');

    // Dimensions
    const dimensions = result.recommendedDimensions.map(d => d.dimension);
    assert.ok(dimensions.includes('NEGATIVE'));
    assert.ok(dimensions.includes('SECURITY'));

    // Techniques
    const techniques = result.recommendedTechniques.map(t => t.technique);
    assert.ok(techniques.includes('NEGATIVE_TESTING'));
  });

  it('flags ambiguous requirement as REQUIRES_CLARIFICATION without fabricating numbers', () => {
    const result = DeterministicRulesEngine.evaluate({
      requirementId: 'req-ambig-1',
      requirementKey: 'REQ-AMBIG-001',
      title: 'Fast Dashboard',
      statement: 'The dashboard should load quickly and provide a good user experience.',
      type: 'PERFORMANCE',
      priority: 'MEDIUM',
      qualityFindings: ['[AMBIGUITY/HIGH] UNDEFINED_TIME_CONSTRAINT: subjective wording "quickly"'],
    });

    assert.equal(result.applicability, 'REQUIRES_CLARIFICATION');
    assert.equal(result.automationSuitability, 'UNKNOWN');
    assert.ok(result.designQuestions.length > 0);
    assert.ok(result.designQuestions.some(q => q.category === 'PERFORMANCE_CRITERIA'));

    // Must NOT fabricate an arbitrary 2 second limit
    assert.equal(result.identifiedConstraints.length, 0);
  });

  it('flags insufficient information for overly brief statement', () => {
    const result = DeterministicRulesEngine.evaluate({
      requirementId: 'req-brief-1',
      requirementKey: 'REQ-BRIEF-001',
      title: 'Vague Requirement',
      statement: 'It shall work.',
      type: 'FUNCTIONAL',
      priority: 'LOW',
    });

    assert.equal(result.applicability, 'INSUFFICIENT_INFORMATION');
    assert.equal(result.automationSuitability, 'UNKNOWN');
    assert.ok(result.designQuestions.length > 0);
  });
});
