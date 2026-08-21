import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createScenarioGenerationPromptDefinition,
  type ScenarioGenerationPromptInput,
} from './scenario-prompt-definition.js';
import { SCENARIO_PROMPT_ID, SCENARIO_PROMPT_VERSION } from './scenario-types.js';

describe('ScenarioPromptDefinition Unit Tests', () => {
  const promptDef = createScenarioGenerationPromptDefinition();

  it('has correct prompt ID and version', () => {
    assert.equal(promptDef.id, SCENARIO_PROMPT_ID);
    assert.equal(promptDef.version, SCENARIO_PROMPT_VERSION);
  });

  it('renders prompt messages with untrusted boundary delimiters', () => {
    const input: ScenarioGenerationPromptInput = {
      requirementKey: 'REQ-AUTH-001',
      title: 'Password Reset',
      statement: 'The user shall be able to reset password with verified email.',
      versionNumber: 1,
      classification: 'FUNCTIONAL',
      testabilityStatus: 'TESTABLE',
      retrievedContextItems: [
        {
          id: 'ctx-1',
          sourceType: 'REPOSITORY',
          title: 'Auth Module',
          text: 'Implements email token verification',
          authorityTier: 6,
        },
      ],
    };

    const messages = promptDef.buildMessages(input);
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, 'SYSTEM');
    assert.equal(messages[1]?.role, 'USER');

    const userContent = messages[1]?.content ?? '';
    assert.ok(userContent.includes('<authoritative_requirement>'));
    assert.ok(userContent.includes('</authoritative_requirement>'));
    assert.ok(userContent.includes('REQ-AUTH-001'));
    assert.ok(userContent.includes('<retrieved_context>'));
    assert.ok(userContent.includes('[ID: ctx-1]'));
  });

  it('validates compliant output payload against schema', () => {
    const validOutput = {
      scenarios: [
        {
          scenarioKey: 'SCN-001',
          title: 'Verify password reset with verified email',
          objective: 'Ensure user can initiate password reset using valid email',
          rationale: 'Follows from REQ-AUTH-001 requirement statement',
          requirementAspect: 'Password Reset Initiation',
          testLevel: 'SYSTEM',
          testIntent: 'FUNCTIONAL',
          applicability: 'APPLICABLE',
          assumptions: [],
          sourceEvidenceRefs: ['REQ-AUTH-001', 'ctx-1'],
        },
      ],
      assumptions: [],
      warnings: [],
    };

    const parseResult = promptDef.outputSchema.safeParse(validOutput);
    assert.ok(parseResult.success);
  });

  it('rejects output missing required title or objective fields', () => {
    const invalidOutput = {
      scenarios: [
        {
          scenarioKey: 'SCN-001',
          // missing title
          objective: 'Test without title',
          rationale: 'Missing title',
          requirementAspect: 'Core',
        },
      ],
    };

    const parseResult = promptDef.outputSchema.safeParse(invalidOutput);
    assert.ok(!parseResult.success);
  });
});
