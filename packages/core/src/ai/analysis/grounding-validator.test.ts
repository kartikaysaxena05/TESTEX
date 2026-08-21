/**
 * @file packages/core/src/ai/analysis/grounding-validator.test.ts
 * Unit tests for GroundingValidator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GroundingValidator } from './grounding-validator.js';
import type { RequirementInterpretationDto } from '@ai-quality/contracts';

describe('GroundingValidator Unit Tests', () => {
  const baseInterpretation: RequirementInterpretationDto = {
    summary:
      'The system shall lock a user account after 5 consecutive failed attempts within 10 minutes.',
    businessIntent: 'Prevent brute-force authentication attacks.',
    targetBehavior: 'Lock account on threshold breach.',
    primaryActor: 'User',
    secondaryActors: [],
    trigger: '5th consecutive failed login',
    preconditions: ['User account exists'],
    conditions: ['5 failed attempts within 10 minutes'],
    constraints: ['Must lock account', 'Threshold: 5 attempts in 10 minutes'],
    quantitativeConstraints: [
      { value: '5', parameter: 'failed attempts' },
      { value: '10', unit: 'minutes', parameter: 'evaluation window' },
    ],
    businessRules: ['Lock account on 5 failed attempts within 10m'],
    inputs: ['username', 'password'],
    outputs: ['account locked status'],
    expectedOutcome: 'User account is locked',
    exceptionsOrAlternativeBehavior: ['Successful login resets failed attempt counter'],
    dependencies: [],
    dataEntities: ['UserAccount', 'LoginAttempt'],
    externalSystems: [],
    securityConsiderations: ['Authentication rate limiting'],
    performanceConsiderations: ['Fast attempt count lookup'],
    complianceConsiderations: [],
    ambiguities: [],
    missingInformation: [],
    unsafeAssumptions: [],
    clarificationNeeds: [],
    hasNegation: false,
    modality: 'shall',
    citations: [
      {
        claimKey: 'lockout_rule',
        supportType: 'DIRECT_REQUIREMENT',
        evidenceId: 'req-001-id',
        confidence: 'HIGH',
      },
      {
        claimKey: 'context_rule',
        supportType: 'DOCUMENT_CONTEXT',
        evidenceId: 'ctx-doc-123',
        confidence: 'MEDIUM',
      },
    ],
    confidence: 'HIGH',
  };

  it('validates compliant citations when all evidence IDs exist in valid set', () => {
    const validEvidenceIds = new Set<string>(['req-001-id', 'ctx-doc-123']);
    const result = GroundingValidator.validate(
      baseInterpretation,
      'The system shall lock a user account after 5 consecutive failed attempts within 10 minutes.',
      validEvidenceIds,
    );

    assert.equal(result.groundingSummary.validCitations, 2);
    assert.equal(result.groundingSummary.invalidCitations, 0);
    assert.equal(result.groundingSummary.groundedClaims, 2);
    assert.equal(result.groundingSummary.unsupportedClaims, 0);
    assert.equal(result.warnings.length, 0);
  });

  it('detects and sanitizes invented/ungrounded evidence IDs', () => {
    const validEvidenceIds = new Set<string>(['req-001-id']); // 'ctx-doc-123' missing
    const result = GroundingValidator.validate(
      baseInterpretation,
      'The system shall lock a user account after 5 consecutive failed attempts within 10 minutes.',
      validEvidenceIds,
    );

    assert.equal(result.groundingSummary.validCitations, 1);
    assert.equal(result.groundingSummary.invalidCitations, 1);
    assert.equal(result.groundingSummary.unsupportedClaims, 1);
    assert.equal(result.validatedAnalysis.citations[1]?.evidenceId, null);
    assert.equal(result.validatedAnalysis.citations[1]?.supportType, 'UNSUPPORTED');
    assert.equal(result.validatedAnalysis.citations[1]?.confidence, 'LOW');
    assert.ok(result.warnings.some(w => w.includes('ctx-doc-123')));
  });

  it('enforces negation consistency when statement contains negative keywords', () => {
    const validEvidenceIds = new Set<string>(['req-001-id', 'ctx-doc-123']);
    const negatedInterpretation: RequirementInterpretationDto = {
      ...baseInterpretation,
      hasNegation: false, // Model forgot to set negation
    };

    const result = GroundingValidator.validate(
      negatedInterpretation,
      'The system shall not allow archived users to log in.',
      validEvidenceIds,
    );

    assert.equal(result.validatedAnalysis.hasNegation, true);
    assert.ok(result.warnings.some(w => w.includes('negation')));
  });

  it('flags warning when quantitative numbers from source text are missing in output', () => {
    const validEvidenceIds = new Set<string>(['req-001-id']);
    const alteredInterpretation: RequirementInterpretationDto = {
      ...baseInterpretation,
      summary: 'The system shall lock a user account after multiple failed attempts.',
      trigger: 'failed login',
      conditions: ['failed attempts occur within evaluation window'],
      constraints: [],
      quantitativeConstraints: [],
      businessRules: [],
    };

    const result = GroundingValidator.validate(
      alteredInterpretation,
      'The system shall lock a user account after 5 consecutive failed attempts within 10 minutes.',
      validEvidenceIds,
    );

    assert.ok(result.warnings.some(w => w.includes('"5"')));
    assert.ok(result.warnings.some(w => w.includes('"10"')));
  });
});
