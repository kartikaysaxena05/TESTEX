import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../database/index.js';
import { TestCaseService } from './test-case-service.js';
import { TestCaseProjectMismatchError } from './test-case-errors.js';
import type { GeneratedTestSpecificationDto } from '@ai-quality/contracts';

describe('TestCaseService Integration', () => {
  const prisma = getPrismaClient()!;
  let service: TestCaseService;
  let projectIdA: string;
  let projectIdB: string;
  let requirementIdA: string;
  let requirementIdB: string;

  const sampleSpec1: GeneratedTestSpecificationDto = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    scenarioId: null,
    scenarioKey: 'SCN-001',
    testDesignId: null,
    title: 'Valid checkout with credit card',
    category: 'POSITIVE',
    preconditions: [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        key: 'PRE-001',
        category: 'DATA_STATE',
        description: 'User has at least 1 item in cart',
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
        assumptions: [],
      },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        key: 'PRE-002',
        category: 'AUTHENTICATION',
        description: 'User is logged in',
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
        assumptions: [],
      },
    ],
    testData: [
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        key: 'DAT-001',
        name: 'cartItemId',
        dataType: 'STRING',
        origin: 'EXPLICIT',
        value: 'item-123',
        generator: null,
        constraint: 'valid cart item',
        isSensitive: false,
        unknownReason: null,
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
      },
    ],
    expectedResults: [
      {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        key: 'EXP-001',
        category: 'SUCCESS',
        description: 'Order is created and confirmation number returned',
        observable: true,
        stateChange: {
          from: 'PENDING',
          to: 'COMPLETED',
          entity: 'Order',
        },
        nonChange: null,
        exactMessageExpected: 'Order placed successfully',
        httpStatusExpected: 201,
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
      },
    ],
    assumptions: ['Payment gateway responds within 2000ms'],
    unknowns: [],
    confidence: 'HIGH',
    reviewRequired: false,
    reviewReasons: [],
    sourceEvidenceRefs: ['src/checkout/checkout.ts'],
  };

  const sampleSpec2: GeneratedTestSpecificationDto = {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    scenarioId: null,
    scenarioKey: 'SCN-002',
    testDesignId: null,
    title: 'Checkout with empty cart rejected',
    category: 'NEGATIVE',
    preconditions: [],
    testData: [],
    expectedResults: [
      {
        id: '12121212-1212-1212-1212-121212121212',
        key: 'EXP-002',
        category: 'VALIDATION_ERROR',
        description: 'Error displayed indicating cart cannot be empty',
        observable: true,
        confidence: 'HIGH',
        sourceEvidenceRefs: [],
        reviewRequired: false,
      },
    ],
    assumptions: [],
    unknowns: [],
    confidence: 'HIGH',
    reviewRequired: false,
    reviewReasons: [],
    sourceEvidenceRefs: [],
  };

  before(async () => {
    service = new TestCaseService(prisma);

    // Setup project A
    const projA = await prisma.project.create({
      data: {
        name: `TC Service Test Proj A ${Date.now()}`,
      },
    });
    projectIdA = projA.id;

    // Setup requirement A
    const reqA = await prisma.requirement.create({
      data: {
        projectId: projectIdA,
        requirementKey: 'REQ-001',
        title: 'Checkout flow requirement',
        originalText: 'Users must be able to checkout items from their cart.',
      },
    });
    requirementIdA = reqA.id;

    // Setup project B for multi-tenant isolation tests
    const projB = await prisma.project.create({
      data: {
        name: `TC Service Test Proj B ${Date.now()}`,
      },
    });
    projectIdB = projB.id;

    // Setup requirement B
    const reqB = await prisma.requirement.create({
      data: {
        projectId: projectIdB,
        requirementKey: 'REQ-001',
        title: 'Project B requirement',
        originalText: 'Separate project requirement.',
      },
    });
    requirementIdB = reqB.id;
  });

  after(async () => {
    // Cascade delete test projects
    await prisma.project.deleteMany({
      where: {
        id: { in: [projectIdA, projectIdB] },
      },
    });
  });

  it('persists a test case from generated specification with all child entities', async () => {
    const detail = await service.persistFromGeneration({
      projectId: projectIdA,
      requirementId: requirementIdA,
      specification: sampleSpec1,
      generationProvenance: {
        inputFingerprint: 'fingerprint-spec-1',
        providerId: 'fake-ai',
        model: 'fake-model-1',
        promptId: 'prompt-enrichment',
        promptVersion: 1,
      },
    });

    assert.ok(detail.id);
    assert.equal(detail.projectId, projectIdA);
    assert.equal(detail.testCaseKey, 'TC-001');
    assert.equal(detail.title, 'Valid checkout with credit card');
    assert.equal(detail.type, 'POSITIVE');
    assert.equal(detail.sourceRequirementId, requirementIdA);
    assert.equal(detail.sourceRequirementKey, 'REQ-001');

    // Preconditions verification
    assert.equal(detail.preconditions.length, 2);
    assert.equal(detail.preconditions[0]?.sequenceOrder, 1);
    assert.equal(detail.preconditions[0]?.category, 'DATA_STATE');
    assert.equal(detail.preconditions[1]?.sequenceOrder, 2);
    assert.equal(detail.preconditions[1]?.category, 'AUTHENTICATION');

    // Steps verification
    assert.ok(detail.steps.length >= 2);
    assert.equal(detail.steps[0]?.stepNumber, 1);
    assert.equal(detail.steps[1]?.stepNumber, 2);

    // Test data verification
    assert.equal(detail.testData.length, 1);
    assert.equal(detail.testData[0]?.sequenceOrder, 1);
    assert.equal(detail.testData[0]?.name, 'cartItemId');
    assert.equal(detail.testData[0]?.value, 'item-123');
  });

  it('returns existing test case when re-persisted with same fingerprint (idempotency)', async () => {
    const detailFirst = await service.persistFromGeneration({
      projectId: projectIdA,
      requirementId: requirementIdA,
      specification: sampleSpec1,
      generationProvenance: {
        inputFingerprint: 'fingerprint-spec-1',
      },
    });

    const detailSecond = await service.persistFromGeneration({
      projectId: projectIdA,
      requirementId: requirementIdA,
      specification: sampleSpec1,
      generationProvenance: {
        inputFingerprint: 'fingerprint-spec-1',
      },
    });

    assert.equal(detailFirst.id, detailSecond.id);
    assert.equal(detailFirst.testCaseKey, detailSecond.testCaseKey);
  });

  it('persists a batch of test specifications', async () => {
    const result = await service.persistBatchFromGeneration({
      projectId: projectIdA,
      requirementId: requirementIdA,
      specifications: [sampleSpec1, sampleSpec2],
      generationProvenance: {
        inputFingerprint: 'fingerprint-batch-1',
      },
    });

    assert.equal(result.testCases.length, 2);
    assert.ok(result.testCases.some(tc => tc.type === 'POSITIVE'));
    assert.ok(result.testCases.some(tc => tc.type === 'NEGATIVE'));
  });

  it('directly creates a manual test case with custom steps and test data', async () => {
    const created = await service.createTestCase({
      projectId: projectIdA,
      title: 'Manual payment edge case test',
      objective: 'Verify payment gateway timeout handling.',
      type: 'BOUNDARY',
      priority: 'HIGH',
      steps: [
        {
          action: 'Initiate payment with simulated 30s delay',
          expectedResult: 'Gateway timeout message returned after 10s',
        },
      ],
      testData: [
        {
          name: 'simulatedLatencyMs',
          dataType: 'NUMBER',
          value: 30000,
        },
      ],
    });

    assert.ok(created.id);
    assert.equal(created.type, 'BOUNDARY');
    assert.equal(created.priority, 'HIGH');
    assert.equal(created.steps.length, 1);
    assert.equal(created.testData.length, 1);
  });

  it('retrieves test case by ID with full relational details', async () => {
    const listRes = await service.listTestCases({ projectId: projectIdA });
    assert.ok(listRes.items.length > 0);

    const firstItem = listRes.items[0]!;
    const fetched = await service.getTestCaseById({
      projectId: projectIdA,
      testCaseId: firstItem.id,
    });

    assert.ok(fetched);
    assert.equal(fetched.id, firstItem.id);
    assert.equal(fetched.testCaseKey, firstItem.testCaseKey);
  });

  it('lists test cases with filtering by type and priority', async () => {
    const positiveCases = await service.listTestCases({
      projectId: projectIdA,
      type: 'POSITIVE',
    });
    assert.ok(positiveCases.items.every(tc => tc.type === 'POSITIVE'));

    const negativeCases = await service.listTestCases({
      projectId: projectIdA,
      type: 'NEGATIVE',
    });
    assert.ok(negativeCases.items.every(tc => tc.type === 'NEGATIVE'));
  });

  it('enforces multi-tenant project boundaries', async () => {
    // Cross-project requirement persistence must fail
    await assert.rejects(
      () =>
        service.persistFromGeneration({
          projectId: projectIdA,
          requirementId: requirementIdB, // Belongs to Project B!
          specification: sampleSpec1,
        }),
      (err: unknown) => err instanceof TestCaseProjectMismatchError,
    );

    // Cross-project test case retrieval must fail
    const listRes = await service.listTestCases({ projectId: projectIdA });
    const tcId = listRes.items[0]!.id;

    await assert.rejects(
      () =>
        service.getTestCaseById({
          projectId: projectIdB, // Requesting Project A's test case from Project B
          testCaseId: tcId,
        }),
      (err: unknown) => err instanceof TestCaseProjectMismatchError,
    );
  });

  it('deletes a test case and cascades to child steps and preconditions', async () => {
    const created = await service.createTestCase({
      projectId: projectIdA,
      title: 'Temporary test case for deletion',
      objective: 'Verify clean cascade deletion.',
      steps: [{ action: 'Temp step' }],
      preconditions: [{ category: 'OTHER', description: 'Temp precondition' }],
      testData: [{ name: 'tempData' }],
    });

    const res = await service.deleteTestCase({
      projectId: projectIdA,
      testCaseId: created.id,
    });
    assert.equal(res.deleted, true);

    const fetchedAfter = await service.getTestCaseById({
      projectId: projectIdA,
      testCaseId: created.id,
    });
    assert.equal(fetchedAfter, null);

    // Verify child steps are deleted
    const remainingSteps = await prisma.testCaseStep.findMany({
      where: { testCaseId: created.id },
    });
    assert.equal(remainingSteps.length, 0);
  });
});
