/**
 * @file packages/core/src/ai/specifications/specification-prompt-definition.test.ts
 * Unit tests for Phase 51 prompt definition and output schema validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestSpecificationPromptDefinition,
  structuredSpecificationOutputSchema,
  type SpecificationPromptInput,
} from './specification-prompt-definition.js';
import {
  TEST_SPECIFICATIONS_PROMPT_ID,
  TEST_SPECIFICATIONS_PROMPT_VERSION,
} from './specification-types.js';

describe('SpecificationPromptDefinition', () => {
  const promptDef = createTestSpecificationPromptDefinition();

  it('has correct prompt ID, version, and default config', () => {
    assert.equal(promptDef.id, TEST_SPECIFICATIONS_PROMPT_ID);
    assert.equal(promptDef.version, TEST_SPECIFICATIONS_PROMPT_VERSION);
    assert.equal(typeof promptDef.description, 'string');
    assert.equal(promptDef.defaultConfig?.temperature, 0.1);
    assert.equal(promptDef.defaultConfig?.maxOutputTokens, 4096);
  });

  it('builds system and user messages with XML boundary tags', () => {
    const input: SpecificationPromptInput = {
      requirementKey: 'REQ-AUTH-001',
      title: 'User Login Authentication',
      statement: 'The system shall allow users to log in using valid email and password.',
      versionNumber: 1,
      classification: 'FUNCTIONAL',
      testabilityStatus: 'TESTABLE',
      qualityFindings: [{ code: 'AMBIGUITY_NONE', message: 'No significant ambiguity detected.' }],
      scenarios: [
        {
          scenarioKey: 'SCN-001',
          title: 'Successful Login with Valid Credentials',
          objective: 'Verify user logs in with valid email and password.',
          rationale: 'Core positive authentication path.',
        },
      ],
      categorizedTestDesigns: [
        {
          category: 'POSITIVE',
          title: 'Happy path login',
          objective: 'Verify login token is issued.',
          rationale: 'Valid user session.',
        },
      ],
      retrievedContextItems: [
        {
          id: 'ctx-1',
          sourceType: 'REQUIREMENT_SOURCE',
          title: 'Security Spec',
          text: 'Sessions expire in 30 minutes.',
          authorityTier: 1,
        },
      ],
    };

    const messages = promptDef.buildMessages(input);
    assert.equal(messages.length, 2);
    const msg0 = messages[0];
    const msg1 = messages[1];
    assert.ok(msg0);
    assert.ok(msg1);
    assert.equal(msg0.role, 'SYSTEM');
    assert.ok(msg0.content.includes('UNKNOWN > INVENTED'));
    assert.ok(msg0.content.includes('PRECONDITIONS (STATE VS ACTION)'));

    assert.equal(msg1.role, 'USER');
    assert.ok(msg1.content.includes('<authoritative_requirement>'));
    assert.ok(msg1.content.includes('KEY: REQ-AUTH-001'));
    assert.ok(msg1.content.includes('<quality_findings>'));
    assert.ok(msg1.content.includes('<candidate_scenarios>'));
    assert.ok(msg1.content.includes('SCN-001'));
    assert.ok(msg1.content.includes('<categorized_test_designs>'));
    assert.ok(msg1.content.includes('<retrieved_context>'));
    assert.ok(msg1.content.includes('Security Spec'));
  });

  it('validates a conformant structured output JSON payload', () => {
    const validPayload = {
      specifications: [
        {
          scenarioKey: 'SCN-001',
          title: 'Successful Login with Valid Credentials',
          category: 'POSITIVE',
          preconditions: [
            {
              key: 'PREC-001',
              category: 'DATA_STATE',
              description: 'Active user account exists with confirmed email.',
              confidence: 'HIGH',
              sourceEvidenceRefs: ['REQ-AUTH-001'],
              reviewRequired: false,
              assumptions: [],
            },
          ],
          testData: [
            {
              key: 'DATA-001',
              name: 'email',
              dataType: 'STRING',
              origin: 'EXAMPLE',
              value: 'user@example.test',
              generator: 'RANDOM_VALID_EMAIL',
              constraint: 'Valid RFC 5322 format',
              isSensitive: false,
              confidence: 'HIGH',
              sourceEvidenceRefs: ['REQ-AUTH-001'],
              reviewRequired: false,
            },
            {
              key: 'DATA-002',
              name: 'password',
              dataType: 'CREDENTIAL',
              origin: 'GENERATED',
              value: 'TestPass#2026',
              isSensitive: true,
              confidence: 'HIGH',
              sourceEvidenceRefs: ['REQ-AUTH-001'],
              reviewRequired: false,
            },
          ],
          expectedResults: [
            {
              key: 'EXP-001',
              category: 'SUCCESS',
              description: 'User receives valid authentication session token.',
              observable: true,
              stateChange: {
                from: 'ANONYMOUS',
                to: 'AUTHENTICATED',
                entity: 'UserSession',
              },
              confidence: 'HIGH',
              sourceEvidenceRefs: ['REQ-AUTH-001'],
              reviewRequired: false,
            },
          ],
          assumptions: ['Authentication service is operational.'],
          unknowns: [],
          confidence: 'HIGH',
          reviewRequired: false,
          reviewReasons: [],
          sourceEvidenceRefs: ['REQ-AUTH-001'],
        },
      ],
      warnings: [],
    };

    const parseResult = structuredSpecificationOutputSchema.safeParse(validPayload);
    assert.ok(
      parseResult.success,
      `Schema validation failed: ${JSON.stringify(parseResult.error)}`,
    );
  });

  it('rejects invalid categories or malformed types', () => {
    const invalidPayload = {
      specifications: [
        {
          scenarioKey: 'SCN-001',
          title: 'Invalid Spec',
          category: 'INVALID_CATEGORY',
          preconditions: [],
          testData: [],
          expectedResults: [],
        },
      ],
    };

    const parseResult = structuredSpecificationOutputSchema.safeParse(invalidPayload);
    assert.equal(parseResult.success, false);
  });
});
