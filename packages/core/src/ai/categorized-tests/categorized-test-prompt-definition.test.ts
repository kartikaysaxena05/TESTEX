/**
 * @file packages/core/src/ai/categorized-tests/categorized-test-prompt-definition.test.ts
 * Unit tests for Phase 50 Categorized Test Generation Prompt Definition & Schema.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PromptRegistry } from '../prompt-registry.js';
import {
  createCategorizedTestPromptDefinition,
  type CategorizedTestPromptInput,
} from './categorized-test-prompt-definition.js';
import {
  CATEGORIZED_TESTS_PROMPT_ID,
  CATEGORIZED_TESTS_PROMPT_VERSION,
} from './categorized-test-types.js';

describe('Phase 50: Categorized Test Prompt Definition & Schema', () => {
  it('registers in PromptRegistry with expected ID and version', () => {
    const registry = PromptRegistry.createDefault();
    const def = registry.get(CATEGORIZED_TESTS_PROMPT_ID, CATEGORIZED_TESTS_PROMPT_VERSION);

    assert.ok(def);
    assert.strictEqual(def.id, CATEGORIZED_TESTS_PROMPT_ID);
    assert.strictEqual(def.version, CATEGORIZED_TESTS_PROMPT_VERSION);
  });

  it('renders messages wrapping untrusted requirement and context in boundary tags', () => {
    const def = createCategorizedTestPromptDefinition();
    const input: CategorizedTestPromptInput = {
      requirementKey: 'REQ-050',
      title: 'User Login Authentication',
      statement: 'Users shall log in using valid email and password.',
      versionNumber: 1,
      classification: 'FUNCTIONAL',
      testabilityStatus: 'TESTABLE',
      scenarios: [
        {
          scenarioKey: 'SCN-001',
          title: 'Successful Authentication',
          objective: 'Verify user logs in with valid credentials.',
          rationale: 'Core happy path.',
          requirementAspect: 'Authentication',
        },
      ],
      retrievedContextItems: [
        {
          id: 'ctx-1',
          sourceType: 'ARCHITECTURE_OVERVIEW',
          title: 'Auth Module',
          text: 'Tokens expire in 1 hour.',
          authorityTier: 2,
        },
      ],
    };

    const messages = def.buildMessages(input);
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0]?.role, 'SYSTEM');
    assert.strictEqual(messages[1]?.role, 'USER');

    const systemContent = messages[0]?.content ?? '';
    const userContent = messages[1]?.content ?? '';

    // System prompt enforces anti-hallucination & category definitions
    assert.ok(systemContent.includes('POSITIVE'));
    assert.ok(systemContent.includes('NEGATIVE'));
    assert.ok(systemContent.includes('BOUNDARY'));
    assert.ok(systemContent.includes('VALIDATION'));
    assert.ok(systemContent.includes('NO INVENTED BOUNDARIES'));
    assert.ok(systemContent.includes('NO CATEGORY QUOTAS'));

    // User prompt wraps data in tags
    assert.ok(userContent.includes('<authoritative_requirement>'));
    assert.ok(userContent.includes('REQ-050'));
    assert.ok(userContent.includes('<candidate_scenarios>'));
    assert.ok(userContent.includes('SCN-001'));
    assert.ok(userContent.includes('<retrieved_context>'));
    assert.ok(userContent.includes('[ID: ctx-1]'));
  });

  it('validates structured output payload conforming to schema', () => {
    const def = createCategorizedTestPromptDefinition();
    const validOutput = {
      categoryAssessments: [
        {
          category: 'POSITIVE',
          applicability: 'APPLICABLE',
          rationale: 'Valid login supported.',
        },
        {
          category: 'NEGATIVE',
          applicability: 'APPLICABLE',
          rationale: 'Incorrect password rejection.',
        },
        {
          category: 'BOUNDARY',
          applicability: 'NOT_APPLICABLE',
          rationale: 'No quantitative boundaries evidenced.',
        },
        {
          category: 'VALIDATION',
          applicability: 'APPLICABLE',
          rationale: 'Malformed email rejection.',
        },
      ],
      testDesigns: [
        {
          scenarioKey: 'SCN-001',
          category: 'POSITIVE',
          title: 'Successful login with valid credentials',
          objective: 'Verify user logs in with valid email and password.',
          rationale: 'Proves positive requirement condition.',
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-050'],
        },
        {
          scenarioKey: 'SCN-001',
          category: 'NEGATIVE',
          title: 'Reject login with invalid password',
          objective: 'Verify login is rejected when password is wrong.',
          rationale: 'Negative test case for bad credentials.',
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-050'],
        },
      ],
      warnings: [],
    };

    const parseResult = def.outputSchema.safeParse(validOutput);
    assert.strictEqual(parseResult.success, true);
  });

  it('rejects output with invalid test category', () => {
    const def = createCategorizedTestPromptDefinition();
    const invalidOutput = {
      categoryAssessments: [],
      testDesigns: [
        {
          category: 'CHAOS_TESTING', // unknown category
          title: 'Test chaos',
          objective: 'Objective',
          rationale: 'Rationale',
        },
      ],
    };

    const parseResult = def.outputSchema.safeParse(invalidOutput);
    assert.strictEqual(parseResult.success, false);
  });
});
