/**
 * @file packages/core/src/test-validation/test-generation-validation-service.test.ts
 * Integration tests for TestGenerationValidationService with PostgreSQL persistence.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../database/index.js';
import { TestCaseService } from '../test-cases/test-case-service.js';
import { TestGenerationValidationService } from './test-generation-validation-service.js';
import {
  TestValidationProjectMismatchError,
  TestValidationTestCaseNotFoundError,
} from './test-validation-errors.js';
import type { GeneratedTestSpecificationDto } from '@ai-quality/contracts';

describe('TestGenerationValidationService Integration', () => {
  const prisma = getPrismaClient()!;
  let validationService: TestGenerationValidationService;
  let testCaseService: TestCaseService;

  let projectIdA: string;
  let projectIdB: string;
  let requirementIdA: string;
  let _requirementIdB: string;
  let testCaseIdA: string;

  const validSpec: GeneratedTestSpecificationDto = {
    id: '11111111-2222-3333-4444-555555555555',
    scenarioId: null,
    scenarioKey: 'SCN-001',
    testDesignId: null,
    title: 'Valid email login',
    category: 'POSITIVE',
    preconditions: [
      {
        id: '22222222-3333-4444-5555-666666666666',
        key: 'PRE-001',
        category: 'ACCOUNT_STATE',
        description: 'User account is registered and active',
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
        assumptions: [],
      },
    ],
    testData: [
      {
        id: '33333333-4444-5555-6666-777777777777',
        key: 'DAT-001',
        name: 'email',
        dataType: 'STRING',
        origin: 'EXPLICIT',
        value: 'user@example.com',
        generator: null,
        constraint: 'valid registered email',
        isSensitive: false,
        unknownReason: null,
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
      },
    ],
    expectedResults: [
      {
        id: '44444444-5555-6666-7777-888888888888',
        key: 'EXP-001',
        category: 'SUCCESS',
        description: 'User dashboard is displayed',
        observable: true,
        httpStatusExpected: 200,
        stateChange: null,
        nonChange: null,
        exactMessageExpected: null,
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
      },
    ],
    confidence: 'HIGH',
    reviewRequired: false,
    reviewReasons: [],
    assumptions: [],
    unknowns: [],
    sourceEvidenceRefs: [],
  };

  before(async () => {
    validationService = new TestGenerationValidationService(prisma);
    testCaseService = new TestCaseService(prisma);

    // 1. Create Project A & B
    const pA = await prisma.project.create({
      data: {
        name: 'Validation Project Alpha',
        description: 'Project for validation integration testing',
      },
    });
    projectIdA = pA.id;

    const pB = await prisma.project.create({
      data: {
        name: 'Validation Project Beta',
        description: 'Project for cross-project isolation testing',
      },
    });
    projectIdB = pB.id;

    // 2. Create Requirements
    const reqA = await prisma.requirement.create({
      data: {
        projectId: projectIdA,
        requirementKey: 'REQ-VAL-001',
        title: 'User Login Authentication',
        originalText:
          'The system shall allow registered users to log in with valid email and password.',
      },
    });
    requirementIdA = reqA.id;

    const reqB = await prisma.requirement.create({
      data: {
        projectId: projectIdB,
        requirementKey: 'REQ-VAL-002',
        title: 'Beta Project Feature',
        originalText: 'Beta project feature specification.',
      },
    });
    _requirementIdB = reqB.id;

    // 3. Persist Test Case in Project A
    const tc = await testCaseService.persistFromGeneration({
      projectId: projectIdA,
      requirementId: requirementIdA,
      requirementVersionNumber: 1,
      specification: validSpec,
    });
    testCaseIdA = tc.id;
  });

  after(async () => {
    // Clean up projects
    if (projectIdA) {
      await prisma.project.deleteMany({ where: { id: projectIdA } });
    }
    if (projectIdB) {
      await prisma.project.deleteMany({ where: { id: projectIdB } });
    }
  });

  it('validates a persisted test case and stores validation record with findings in PostgreSQL', async () => {
    const result = await validationService.validateTestCase({
      projectId: projectIdA,
      testCaseId: testCaseIdA,
    });

    assert.ok(result.id);
    assert.strictEqual(result.projectId, projectIdA);
    assert.strictEqual(result.testCaseId, testCaseIdA);
    assert.strictEqual(result.requirementId, requirementIdA);
    assert.strictEqual(result.status, 'VALID');
    assert.strictEqual(result.isStale, false);
    assert.strictEqual(result.validatorVersion, 'test-validation-v1');
    assert.strictEqual(result.metrics.grounded, true);

    // Verify DB record
    const dbRecord = await prisma.testCaseValidation.findUnique({
      where: { id: result.id },
      include: { findings: true },
    });
    assert.ok(dbRecord);
    assert.strictEqual(dbRecord?.status, 'VALID');
  });

  it('enforces multi-tenant isolation and rejects cross-project validation requests', async () => {
    await assert.rejects(
      async () => {
        await validationService.validateTestCase({
          projectId: projectIdB, // Wrong project!
          testCaseId: testCaseIdA,
        });
      },
      (err: unknown) => err instanceof TestValidationProjectMismatchError,
    );
  });

  it('throws TestValidationTestCaseNotFoundError for non-existent test case ID', async () => {
    await assert.rejects(
      async () => {
        await validationService.validateTestCase({
          projectId: projectIdA,
          testCaseId: '00000000-0000-0000-0000-000000000000',
        });
      },
      (err: unknown) => err instanceof TestValidationTestCaseNotFoundError,
    );
  });

  it('validates an in-memory test specification', async () => {
    const result = await validationService.validateSpecification({
      projectId: projectIdA,
      requirementId: requirementIdA,
      specification: validSpec,
    });

    assert.strictEqual(result.status, 'VALID');
    assert.strictEqual(result.testCaseId, null);
    assert.strictEqual(result.requirementId, requirementIdA);
  });

  it('evaluates real-time staleness when test case content is edited after validation', async () => {
    // 1. Run initial validation
    const val1 = await validationService.validateTestCase({
      projectId: projectIdA,
      testCaseId: testCaseIdA,
    });
    assert.strictEqual(val1.isStale, false);

    // 2. Fetch latest validation -> should be fresh
    const latest1 = await validationService.getLatestValidation({
      projectId: projectIdA,
      testCaseId: testCaseIdA,
    });
    assert.strictEqual(latest1?.isStale, false);

    // 3. Mutate test case step in database
    const firstStep = await prisma.testCaseStep.findFirst({
      where: { testCaseId: testCaseIdA },
    });
    if (firstStep) {
      await prisma.testCaseStep.update({
        where: { id: firstStep.id },
        data: { action: 'Modified step action that was changed by user manually' },
      });
    }

    // 4. Fetch latest validation again -> staleness detector identifies hash change
    const latest2 = await validationService.getLatestValidation({
      projectId: projectIdA,
      testCaseId: testCaseIdA,
    });
    assert.strictEqual(latest2?.isStale, true);
    assert.ok(latest2?.staleReason?.includes('Test case content modified after validation'));
  });

  it('validates batch of test cases and aggregates summary metrics', async () => {
    const batchResult = await validationService.validateBatch({
      projectId: projectIdA,
      testCaseIds: [testCaseIdA],
    });

    assert.strictEqual(batchResult.validations.length, 1);
    assert.strictEqual(batchResult.summary.total, 1);
    assert.strictEqual(batchResult.summary.validCount, 1);
  });

  it('lists validation history for a test case', async () => {
    const history = await validationService.listValidationHistory({
      projectId: projectIdA,
      testCaseId: testCaseIdA,
    });

    assert.ok(history.length > 0);
    assert.strictEqual(history[0]?.projectId, projectIdA);
  });
});
