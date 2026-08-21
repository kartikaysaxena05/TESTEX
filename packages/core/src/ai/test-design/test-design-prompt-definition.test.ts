/**
 * @file packages/core/src/ai/test-design/test-design-prompt-definition.test.ts
 * Tests for Test Design prompt rendering, delimiters, and structured output schema validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestDesignPromptDefinition,
  type TestDesignPromptInput,
} from './test-design-prompt-definition.js';
import { structuredTestDesignSchema } from '@ai-quality/contracts';

describe('TestDesignPromptDefinition Unit Tests', () => {
  const promptDef = createTestDesignPromptDefinition();

  it('renders prompt messages with untrusted boundary delimiters', () => {
    const input: TestDesignPromptInput = {
      requirementKey: 'REQ-AUTH-001',
      title: 'Failed Login Lockout',
      statement: 'The system shall lock a user account after 5 failed attempts.',
      versionNumber: 1,
      classification: 'SECURITY',
      qualityFindings: ['No ambiguity detected'],
      relationships: ['DEPENDS_ON REQ-AUTH-000'],
      repositoryEvidence: ['[EXACT_FILE] src/auth/login.ts'],
      retrievedContextItems: [
        {
          id: 'ctx-1',
          sourceType: 'DOCUMENT_SECTION',
          title: 'Section 4.1 Security Requirements',
          text: 'Authentication lockout threshold must be 5 attempts.',
          authorityTier: 6,
          similarityScore: 0.88,
        },
      ],
    };

    const messages = promptDef.buildMessages(input);
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, 'SYSTEM');
    assert.equal(messages[1]?.role, 'USER');

    const systemContent = messages[0]?.content ?? '';
    assert.ok(systemContent.includes('NO TEST GENERATION'));
    assert.ok(systemContent.includes('STRICT GROUNDING'));
    assert.ok(systemContent.includes('EXACT CONSTRAINT PRESERVATION'));

    const userContent = messages[1]?.content ?? '';
    assert.ok(userContent.includes('REQ-AUTH-001'));
    assert.ok(userContent.includes('Failed Login Lockout'));
    assert.ok(userContent.includes('ctx-1'));
    assert.ok(userContent.includes('<authoritative_requirement>'));
    assert.ok(userContent.includes('<retrieved_context>'));
  });

  it('validates compliant output payload against structuredTestDesignSchema', () => {
    const validOutput = {
      applicability: 'APPLICABLE',
      applicabilityRationale: 'Requirement has explicit quantifiable thresholds.',
      automationSuitability: 'HIGH',
      automationRationale: 'Deterministic expected outcome with exact bounds.',
      recommendedLevels: [
        {
          level: 'UNIT',
          priority: 'HIGH',
          rationale: 'Fast boundary execution.',
          evidenceRefs: ['REQ-AUTH-001'],
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
      ],
      recommendedTechniques: [
        {
          technique: 'BOUNDARY_VALUE_ANALYSIS',
          priority: 'HIGH',
          rationale: 'Verify boundary of 5 attempts.',
          rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
          evidenceRefs: ['REQ-AUTH-001'],
          confidence: 'HIGH',
        },
      ],
      coverageObjectives: [
        {
          id: 'CO-1',
          category: 'BOUNDARY_LIMITS',
          priority: 'HIGH',
          description: 'Verify lockout occurs at exactly 5 failed attempts.',
          rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
          evidenceRefs: ['REQ-AUTH-001'],
        },
      ],
      riskFocusAreas: [],
      identifiedConstraints: [
        {
          id: 'TC-1',
          constraintType: 'NUMERIC_RANGE',
          parameter: 'Failed attempts',
          value: '5',
          upperBound: '5',
          isInclusive: true,
          evidenceRef: 'REQ-AUTH-001',
        },
      ],
      designQuestions: [],
      rationale: [],
      sourceContext: [],
    };

    const parseResult = structuredTestDesignSchema.safeParse(validOutput);
    assert.ok(parseResult.success);
  });

  it('rejects payload with invalid enum or missing required fields', () => {
    const invalidOutput = {
      applicability: 'INVALID_APPLICABILITY_ENUM',
      recommendedDimensions: [],
    };

    const parseResult = structuredTestDesignSchema.safeParse(invalidOutput);
    assert.equal(parseResult.success, false);
  });
});
