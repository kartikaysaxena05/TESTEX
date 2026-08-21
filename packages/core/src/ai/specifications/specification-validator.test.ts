/**
 * @file packages/core/src/ai/specifications/specification-validator.test.ts
 * Unit tests for Phase 51 TestSpecificationValidator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestSpecificationValidator } from './specification-validator.js';
import type { TestSpecificationValidationContext } from './specification-types.js';

describe('TestSpecificationValidator', () => {
  const baseContext: TestSpecificationValidationContext = {
    requirementKey: 'REQ-CHECKOUT-001',
    requirementId: '11111111-1111-1111-1111-111111111111',
    requirementText: 'The user must pay with a valid credit card.',
    validEvidenceRefIds: new Set(['REQ-CHECKOUT-001', 'SCN-001', 'ctx-item-1']),
    validScenarioIds: new Set(['scn-uuid-1']),
    isNotTestable: false,
  };

  it('sanitizes valid specifications and computes derived metrics', () => {
    const rawOutput = {
      specifications: [
        {
          scenarioKey: 'SCN-001',
          title: 'Valid Credit Card Payment',
          category: 'POSITIVE' as const,
          preconditions: [
            {
              category: 'AUTHENTICATION' as const,
              description: 'User is authenticated and has an active shopping cart.',
              confidence: 'HIGH' as const,
              sourceEvidenceRefs: ['REQ-CHECKOUT-001'],
            },
          ],
          testData: [
            {
              name: 'cardNumber',
              dataType: 'CREDENTIAL' as const,
              origin: 'EXAMPLE' as const,
              value: '4111222233334444',
              generator: 'SYNTHETIC_VISA_CARD',
              isSensitive: true,
              confidence: 'HIGH' as const,
              sourceEvidenceRefs: ['REQ-CHECKOUT-001'],
            },
          ],
          expectedResults: [
            {
              category: 'SUCCESS' as const,
              description: 'Payment is confirmed and order status updates to PAID.',
              observable: true,
              stateChange: {
                from: 'PENDING_PAYMENT',
                to: 'PAID',
                entity: 'Order',
              },
              confidence: 'HIGH' as const,
              sourceEvidenceRefs: ['REQ-CHECKOUT-001'],
            },
          ],
          assumptions: ['Payment gateway mock is available.'],
          unknowns: [],
          confidence: 'HIGH' as const,
        },
      ],
      warnings: [],
    };

    const result = TestSpecificationValidator.validateAndSanitize(rawOutput, baseContext);
    assert.equal(result.sanitizedSpecifications.length, 1);
    assert.equal(result.metrics.totalSpecifications, 1);
    assert.equal(result.metrics.totalPreconditions, 1);
    assert.equal(result.metrics.totalTestDataItems, 1);
    assert.equal(result.metrics.totalExpectedResults, 1);
    assert.equal(result.metrics.unknownCount, 0);
    assert.equal(result.metrics.reviewRequiredCount, 0);
    assert.equal(result.ungroundedEvidenceCount, 0);
  });

  it('strips ungrounded evidence references and issues warning', () => {
    const rawOutput = {
      specifications: [
        {
          scenarioKey: 'SCN-001',
          title: 'Test Grounding Ref Filtering',
          category: 'NEGATIVE' as const,
          preconditions: [
            {
              category: 'APPLICATION_STATE' as const,
              description: 'System in checkout mode.',
              sourceEvidenceRefs: ['FICTIONAL-REF-999'], // invalid
            },
          ],
          testData: [],
          expectedResults: [
            {
              category: 'REQUEST_REJECTED' as const,
              description: 'Payment fails.',
              sourceEvidenceRefs: ['ctx-item-1', 'ANOTHER-FAKE-REF'],
            },
          ],
        },
      ],
      warnings: [],
    };

    const result = TestSpecificationValidator.validateAndSanitize(rawOutput, baseContext);
    assert.ok(result.ungroundedEvidenceCount >= 2);
    const spec = result.sanitizedSpecifications[0];
    assert.ok(spec);
    // Ungrounded single ref is replaced by requirementKey
    assert.deepEqual(spec.preconditions[0]?.sourceEvidenceRefs, ['REQ-CHECKOUT-001']);
    // Partially grounded ref is filtered to keep only valid ones
    assert.deepEqual(spec.expectedResults[0]?.sourceEvidenceRefs, ['ctx-item-1']);
  });

  it('handles UNKNOWN data origin by enforcing value=null and marking reviewRequired', () => {
    const rawOutput = {
      specifications: [
        {
          scenarioKey: 'SCN-001',
          title: 'Unknown Rate Limit Test',
          category: 'BOUNDARY' as const,
          preconditions: [],
          testData: [
            {
              name: 'maxDailyAttempts',
              dataType: 'NUMBER' as const,
              origin: 'UNKNOWN' as const,
              value: 100, // should be forced to null
              unknownReason: 'Daily attempt limit not specified in requirement text.',
              sourceEvidenceRefs: ['REQ-CHECKOUT-001'],
            },
          ],
          expectedResults: [
            {
              category: 'BOUNDARY_REJECTED' as const,
              description: 'Attempts exceeding unknown threshold are rejected.',
            },
          ],
          unknowns: [
            {
              name: 'maxDailyAttempts',
              reason: 'Unstated threshold.',
              reviewRequired: true,
            },
          ],
        },
      ],
      warnings: [],
    };

    const result = TestSpecificationValidator.validateAndSanitize(rawOutput, baseContext);
    const spec = result.sanitizedSpecifications[0];
    assert.ok(spec);
    assert.equal(spec.testData[0]?.value, null);
    assert.equal(spec.testData[0]?.origin, 'UNKNOWN');
    assert.equal(spec.testData[0]?.reviewRequired, true);
    assert.equal(spec.reviewRequired, true);
    assert.ok(spec.reviewReasons.length > 0);
    assert.equal(result.metrics.reviewRequiredCount, 1);
    assert.equal(result.metrics.unknownCount, 2); // 1 unknown item + 1 explicit unknown
  });

  it('deduplicates identical preconditions and test data items', () => {
    const rawOutput = {
      specifications: [
        {
          scenarioKey: 'SCN-001',
          title: 'Duplicate Filtering Test',
          category: 'POSITIVE' as const,
          preconditions: [
            { category: 'DATA_STATE' as const, description: 'User account is active.' },
            { category: 'DATA_STATE' as const, description: 'User account is active.' }, // duplicate
          ],
          testData: [
            { name: 'amount', dataType: 'NUMBER' as const, origin: 'EXPLICIT' as const, value: 50 },
            { name: 'amount', dataType: 'NUMBER' as const, origin: 'EXPLICIT' as const, value: 50 }, // duplicate
          ],
          expectedResults: [
            { category: 'SUCCESS' as const, description: 'Transaction completes.' },
            { category: 'SUCCESS' as const, description: 'Transaction completes.' }, // duplicate
          ],
        },
      ],
      warnings: [],
    };

    const result = TestSpecificationValidator.validateAndSanitize(rawOutput, baseContext);
    const spec = result.sanitizedSpecifications[0];
    assert.ok(spec);
    assert.equal(spec.preconditions.length, 1);
    assert.equal(spec.testData.length, 1);
    assert.equal(spec.expectedResults.length, 1);
    assert.equal(result.duplicateCount, 3);
  });
});
