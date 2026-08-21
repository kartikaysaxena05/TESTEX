import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GeneratedTestSpecificationDto } from '@ai-quality/contracts';
import { TestCaseMappingService } from './test-case-mapping-service.js';
import { TestCaseValidationError } from './test-case-errors.js';

describe('TestCaseMappingService', () => {
  const mapper = new TestCaseMappingService();

  const mockSpec: GeneratedTestSpecificationDto = {
    id: '11111111-1111-1111-1111-111111111111',
    scenarioId: '22222222-2222-2222-2222-222222222222',
    scenarioKey: 'SCN-001',
    testDesignId: null,
    title: 'Valid login with registered email and password',
    category: 'POSITIVE',
    preconditions: [
      {
        id: '33333333-3333-3333-3333-333333333333',
        key: 'PRE-001',
        category: 'AUTHENTICATION',
        description: 'User has an active account with verified email',
        confidence: 'HIGH',
        sourceEvidenceRefs: ['src/auth/auth.service.ts'],
        reviewRequired: false,
        assumptions: [],
      },
    ],
    testData: [
      {
        id: '44444444-4444-4444-4444-444444444444',
        key: 'DAT-001',
        name: 'userEmail',
        dataType: 'STRING',
        origin: 'DERIVED',
        value: 'user@example.com',
        generator: null,
        constraint: 'valid email format',
        isSensitive: false,
        unknownReason: null,
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
      },
    ],
    expectedResults: [
      {
        id: '55555555-5555-5555-5555-555555555555',
        key: 'EXP-001',
        category: 'SUCCESS',
        description: 'User is authenticated and redirected to dashboard',
        observable: true,
        stateChange: {
          from: 'UNAUTHENTICATED',
          to: 'AUTHENTICATED',
          entity: 'Session',
        },
        nonChange: null,
        exactMessageExpected: 'Welcome back',
        httpStatusExpected: 200,
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
      },
    ],
    assumptions: ['Database is online'],
    unknowns: [],
    confidence: 'HIGH',
    reviewRequired: false,
    reviewReasons: [],
    sourceEvidenceRefs: ['src/auth/auth.service.ts'],
  };

  it('maps a valid specification into structured test case properties', () => {
    const mapped = mapper.mapSpecificationToTestCase(mockSpec);

    assert.equal(mapped.title, 'Valid login with registered email and password');
    assert.equal(mapped.type, 'POSITIVE');
    assert.equal(mapped.priority, 'MEDIUM');
    assert.equal(mapped.status, 'GENERATED');
    assert.equal(mapped.executionSuitability, 'AUTOMATED');

    assert.equal(mapped.preconditions.length, 1);
    assert.equal(mapped.preconditions[0]?.sequenceOrder, 1);
    assert.equal(mapped.preconditions[0]?.category, 'AUTHENTICATION');
    assert.equal(
      mapped.preconditions[0]?.description,
      'User has an active account with verified email',
    );

    assert.equal(mapped.testData.length, 1);
    assert.equal(mapped.testData[0]?.sequenceOrder, 1);
    assert.equal(mapped.testData[0]?.name, 'userEmail');
    assert.equal(mapped.testData[0]?.value, 'user@example.com');

    assert.ok(mapped.steps.length >= 2);
    assert.equal(mapped.steps[0]?.stepNumber, 1);
    assert.ok(mapped.steps[0]?.action.includes('Verify and establish preconditions'));
  });

  it('correctly maps boundary category and sets review priority', () => {
    const boundarySpec: GeneratedTestSpecificationDto = {
      ...mockSpec,
      category: 'BOUNDARY',
      reviewRequired: true,
      reviewReasons: ['Border value 0 requires clarification.'],
    };

    const mapped = mapper.mapSpecificationToTestCase(boundarySpec);
    assert.equal(mapped.type, 'BOUNDARY');
    assert.equal(mapped.priority, 'HIGH');
    assert.ok(mapped.description?.includes('Border value 0 requires clarification.'));
  });

  it('throws TestCaseValidationError when specification title is empty', () => {
    const invalidSpec: GeneratedTestSpecificationDto = {
      ...mockSpec,
      title: '   ',
    };

    assert.throws(
      () => mapper.mapSpecificationToTestCase(invalidSpec),
      (err: unknown) => err instanceof TestCaseValidationError,
    );
  });
});
