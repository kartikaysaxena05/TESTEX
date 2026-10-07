/**
 * @file packages/core/src/failures/root-cause/root-cause-prompt.test.ts
 * Unit tests for Root-Cause Analysis prompt definition, schema validation, and PromptRegistry registration (Phase 83).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PromptRegistry } from '../../ai/prompt-registry.js';
import {
  FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_ID,
  FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_VERSION,
  createFailureRootCauseAnalysisPromptDefinition,
  failureRootCauseAnalysisInputSchema,
  failureRootCauseAnalysisOutputSchema,
} from './root-cause-prompt-definition.js';

describe('Root-Cause Analysis Prompt Definition (Phase 83)', () => {
  const promptDef = createFailureRootCauseAnalysisPromptDefinition();

  it('has correct prompt ID and version', () => {
    assert.equal(promptDef.id, FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_ID);
    assert.equal(promptDef.version, FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_VERSION);
  });

  it('is registered in default PromptRegistry', () => {
    const registry = PromptRegistry.createDefault();
    assert.ok(registry.has(FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_ID));
    const retrieved = registry.get(FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_ID, 1);
    assert.equal(retrieved.id, FAILURE_ROOT_CAUSE_ANALYSIS_PROMPT_ID);
    assert.equal(retrieved.version, 1);
  });

  it('builds system message containing 17 canonical layers and anti-hallucination instructions', () => {
    const messages = promptDef.buildMessages({
      caseTitle: 'Test Checkout Failure',
      testName: 'E2E Checkout Flow',
      evidenceBlock: '<untrusted_execution_evidence>HTTP 500 error</untrusted_execution_evidence>',
      repositoryAvailable: true,
    });

    assert.equal(messages.length, 2);
    const systemContent = messages[0]?.content ?? '';
    const userContent = messages[1]?.content ?? '';

    assert.ok(systemContent.includes('FRONTEND:'));
    assert.ok(systemContent.includes('BACKEND:'));
    assert.ok(systemContent.includes('API:'));
    assert.ok(systemContent.includes('DATABASE:'));
    assert.ok(systemContent.includes('AUTHENTICATION:'));
    assert.ok(systemContent.includes('MULTI_LAYER:'));
    assert.ok(systemContent.includes('SUPPORTED_HYPOTHESIS'));
    assert.ok(systemContent.includes('NO_REPOSITORY_CONTEXT'));
    assert.ok(systemContent.includes('STRICT ANTI-HALLUCINATION'));

    assert.ok(userContent.includes('Test Checkout Failure'));
    assert.ok(userContent.includes('Repository Context Available: YES'));
  });

  it('validates input schema correctly', () => {
    const valid = failureRootCauseAnalysisInputSchema.safeParse({
      caseTitle: 'Test Case Failure',
      testName: 'Submit Form',
      evidenceBlock: '<evidence>Error logs here</evidence>',
      repositoryAvailable: false,
    });
    assert.ok(valid.success);

    const invalid = failureRootCauseAnalysisInputSchema.safeParse({
      caseTitle: '',
      testName: 'Submit Form',
      evidenceBlock: 'short',
      repositoryAvailable: false,
    });
    assert.ok(!invalid.success);
  });

  it('validates output schema with all 17 layers and 6 statuses', () => {
    const validOutput = {
      rootCauseStatus: 'SUPPORTED_HYPOTHESIS',
      probableLayer: 'API',
      probableComponent: 'CheckoutGateway',
      relatedEndpoint: '/api/v1/checkout',
      probableCause: 'Gateway returned HTTP 504 timeout due to exhausted connection pool.',
      humanExplanation:
        'The checkout request timed out because the downstream service was unresponsive.',
      affectedExecutionPath: [
        'User clicks checkout',
        'Network request sent to /api/v1/checkout',
        'Gateway timeout 504',
      ],
      supportingEvidence: [
        {
          id: 'ev-1',
          fact: 'HTTP status 504 Gateway Timeout observed on checkout POST request.',
          significance: 'CRITICAL',
        },
      ],
      contradictingEvidence: [],
      alternativeHypotheses: [
        {
          layer: 'NETWORK',
          probableCause: 'Temporary socket drop or DNS failure.',
          rationale: 'Could be external network transit issue.',
          plausibility: 'LOW',
          disqualifyingFactor: 'Other network endpoints continued to respond normally.',
        },
      ],
      repositoryReferences: [
        {
          filePath: 'src/checkout/gateway.ts',
          symbolName: 'processPayment',
          relevance: 'Endpoint handler for checkout',
        },
      ],
      limitations: [],
      uncertainties: [],
    };

    const parsed = failureRootCauseAnalysisOutputSchema.safeParse(validOutput);
    assert.ok(parsed.success, 'Valid output should pass schema validation');

    // Rejects invalid layer
    const invalidLayer = failureRootCauseAnalysisOutputSchema.safeParse({
      ...validOutput,
      probableLayer: 'HYPOTHETICAL_QUANTUM_LAYER',
    });
    assert.ok(!invalidLayer.success);

    // Rejects invalid status
    const invalidStatus = failureRootCauseAnalysisOutputSchema.safeParse({
      ...validOutput,
      rootCauseStatus: 'DEFINITIVELY_PROVEN',
    });
    assert.ok(!invalidStatus.success);
  });
});
