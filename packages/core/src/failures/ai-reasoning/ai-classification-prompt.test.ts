/**
 * @file packages/core/src/failures/ai-reasoning/ai-classification-prompt.test.ts
 * Unit tests for AI Classification prompt definition and structured schemas (Phase 82).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFailureAiClassificationPromptDefinition,
  FAILURE_AI_CLASSIFICATION_PROMPT_ID,
  FAILURE_AI_CLASSIFICATION_PROMPT_VERSION,
  failureAiClassificationInputSchema,
  failureAiClassificationOutputSchema,
} from './ai-classification-prompt-definition.js';

describe('AiClassificationPromptDefinition (Phase 82)', () => {
  const promptDef = createFailureAiClassificationPromptDefinition();

  it('declares correct prompt identifier, version, and defaults', () => {
    assert.equal(promptDef.id, FAILURE_AI_CLASSIFICATION_PROMPT_ID);
    assert.equal(promptDef.version, FAILURE_AI_CLASSIFICATION_PROMPT_VERSION);
    assert.equal(promptDef.defaultConfig?.temperature, 0.1);
    assert.ok((promptDef.defaultConfig?.maxOutputTokens ?? 0) >= 2000);
  });

  it('validates valid prompt input and rejects invalid inputs', () => {
    const valid = failureAiClassificationInputSchema.safeParse({
      caseTitle: 'Assertion Error on Dashboard',
      testName: 'Dashboard Loading Test',
      evidenceBlock: '<untrusted_execution_evidence>Status: 500</untrusted_execution_evidence>',
      deterministicBaseline: 'APPLICATION_FAILURE',
    });
    assert.ok(valid.success);

    const invalid = failureAiClassificationInputSchema.safeParse({
      caseTitle: '', // empty title
      testName: 'Test',
      evidenceBlock: 'short', // less than 10 chars
    });
    assert.ok(!invalid.success);
  });

  it('validates structured AI output conforming to strict taxonomy and reject hallucinations', () => {
    const validOutput = failureAiClassificationOutputSchema.safeParse({
      aiCategory: 'APPLICATION_FAILURE',
      aiSubcategory: 'HTTP_ERROR_RESPONSE',
      confidenceScore: 0.91,
      primaryReasoning: 'API returned 500 internal server error consistently during execution.',
      humanExplanation: 'The backend application crashed when handling the user login request.',
      supportingEvidence: [
        {
          id: 'ev-1',
          fact: 'Network request to /api/login responded with status 500',
          significance: 'CRITICAL',
          evidenceType: 'NETWORK_LOG',
        },
      ],
      contradictingEvidence: [],
      alternativeHypotheses: [
        {
          category: 'ENVIRONMENT_FAILURE',
          rationale: 'Could be network blip',
          plausibility: 'LOW',
          disqualifyingFactor: 'Server responded with formatted JSON error body',
        },
      ],
      uncertainties: ['Database log not directly inspected'],
      recommendations: ['Check backend error log for stack trace'],
    });

    assert.ok(validOutput.success);

    // Reject hallucinated invalid category
    const invalidOutput = failureAiClassificationOutputSchema.safeParse({
      aiCategory: 'RANDOM_USER_ERROR', // invalid category!
      confidenceScore: 0.9,
      primaryReasoning: 'Random reasoning text',
      humanExplanation: 'Explanation',
      supportingEvidence: [],
      contradictingEvidence: [],
      alternativeHypotheses: [],
      uncertainties: [],
    });
    assert.ok(!invalidOutput.success);
  });

  it('builds system instruction containing governance rules and prompt-injection defense', () => {
    const messages = promptDef.buildMessages({
      caseTitle: 'Test Case',
      testName: 'Flow 1',
      evidenceBlock: '<untrusted_evidence>Some evidence</untrusted_evidence>',
      deterministicBaseline: 'APPLICATION_FAILURE',
    });

    assert.equal(messages.length, 2);
    const systemMsg = messages[0]?.content ?? '';
    assert.ok(systemMsg.includes('TAXONOMY RESTRICTION'));
    assert.ok(systemMsg.includes('APPLICATION_FAILURE'));
    assert.ok(systemMsg.includes('PROMPT INJECTION DEFENSE'));
    assert.ok(systemMsg.includes('DO NOT suggest code repairs'));
  });
});
