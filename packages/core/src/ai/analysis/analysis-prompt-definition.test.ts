/**
 * @file packages/core/src/ai/analysis/analysis-prompt-definition.test.ts
 * Tests for Requirement Analysis prompt definition, rendering, and schema validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRequirementAnalysisPromptDefinition,
  type RequirementAnalysisPromptInput,
} from './analysis-prompt-definition.js';
import { PromptRegistry } from '../prompt-registry.js';
import {
  REQUIREMENT_ANALYSIS_PROMPT_ID,
  REQUIREMENT_ANALYSIS_PROMPT_VERSION,
} from './analysis-types.js';

describe('Requirement Analysis Prompt Definition Unit Tests', () => {
  const promptDef = createRequirementAnalysisPromptDefinition();

  it('has expected metadata and schemas', () => {
    assert.equal(promptDef.id, REQUIREMENT_ANALYSIS_PROMPT_ID);
    assert.equal(promptDef.version, REQUIREMENT_ANALYSIS_PROMPT_VERSION);
    assert.ok(promptDef.inputSchema);
    assert.ok(promptDef.outputSchema);
  });

  it('is registered in default PromptRegistry', () => {
    const registry = PromptRegistry.createDefault();
    const retrieved = registry.get(
      REQUIREMENT_ANALYSIS_PROMPT_ID,
      REQUIREMENT_ANALYSIS_PROMPT_VERSION,
    );

    assert.equal(retrieved.id, REQUIREMENT_ANALYSIS_PROMPT_ID);
    assert.equal(retrieved.version, REQUIREMENT_ANALYSIS_PROMPT_VERSION);
  });

  it('builds messages with untrusted delimiters and security rules', () => {
    const input: RequirementAnalysisPromptInput = {
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

  it('validates compliant output payload against outputSchema', () => {
    const validOutput = {
      summary: 'System locks user account after 5 failed attempts.',
      businessIntent: 'Prevent brute-force authentication.',
      targetBehavior: 'Lock account.',
      primaryActor: 'User',
      secondaryActors: [],
      trigger: '5 failed login attempts',
      preconditions: ['User account exists'],
      conditions: ['5 failed login attempts occur'],
      constraints: ['Must lock account on 5th failure'],
      quantitativeConstraints: [{ value: '5', parameter: 'failed attempts' }],
      businessRules: ['5 failed attempts lock account'],
      inputs: ['credentials'],
      outputs: ['account lock status'],
      expectedOutcome: 'Account locked',
      exceptionsOrAlternativeBehavior: [],
      dependencies: [],
      dataEntities: ['User'],
      externalSystems: [],
      securityConsiderations: ['Rate limiting'],
      performanceConsiderations: [],
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
          evidenceId: 'REQ-AUTH-001',
          confidence: 'HIGH',
        },
      ],
      confidence: 'HIGH',
    };

    const parsed = promptDef.outputSchema.parse(validOutput);
    assert.equal(parsed.summary, validOutput.summary);
    assert.equal(parsed.hasNegation, false);
  });
});
