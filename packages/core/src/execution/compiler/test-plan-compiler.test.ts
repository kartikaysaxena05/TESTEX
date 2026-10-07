/**
 * @file packages/core/src/execution/compiler/test-plan-compiler.test.ts
 * Unit tests for TestPlanCompiler: orchestration, step ordering, version pinning, determinism, and partial compilation policy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestPlanCompiler } from './test-plan-compiler.js';
import type { TestCaseDetailDto, TestCaseStepDto } from '@ai-quality/contracts';
import type { CompilationContext } from './compiler-types.js';

const mockContext: CompilationContext = {
  projectId: 'a0000000-0000-0000-0000-000000000001',
  testCaseId: 'b0000000-0000-0000-0000-000000000001',
  testCaseKey: 'TC-001',
  testCaseTitle: 'Valid Login Test',
  testCaseVersionNumber: 2,
  testCaseVersionId: 'c0000000-0000-0000-0000-000000000002',
  environmentId: 'd0000000-0000-0000-0000-000000000001',
  environmentBaseUrl: 'https://staging.example.com',
};

const createMockTestCase = (_reviewStatus: any = 'APPROVED'): TestCaseDetailDto => ({
  id: mockContext.testCaseId,
  projectId: mockContext.projectId,
  testCaseKey: 'TC-001',
  title: 'Valid Login Test',
  objective: 'Verify that an approved user can log into the platform with valid credentials.',
  description: 'Happy path authentication test.',
  type: 'POSITIVE',
  priority: 'HIGH',
  status: 'ACTIVE',
  executionSuitability: 'AUTOMATED',
  sourceRequirementId: 'e0000000-0000-0000-0000-000000000001',
  sourceRequirementKey: 'REQ-001',
  sourceRequirementVersionNumber: 1,
  preconditionCount: 1,
  stepCount: 4,
  testDataCount: 2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  preconditions: [
    {
      id: 'p1',
      testCaseId: mockContext.testCaseId,
      sequenceOrder: 1,
      category: 'DATA_STATE',
      description: 'User account exists with verified email.',
      isEnforced: true,
      confidence: 'HIGH',
      sourceEvidenceRefs: [],
      reviewRequired: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  steps: [
    {
      id: 's1',
      testCaseId: mockContext.testCaseId,
      stepNumber: 1,
      action: 'Open the login page',
      expectedResult: 'Login form is displayed',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 's2',
      testCaseId: mockContext.testCaseId,
      stepNumber: 2,
      action: "Enter user's email",
      testDataSummary: '{{user.email}}',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 's3',
      testCaseId: mockContext.testCaseId,
      stepNumber: 3,
      action: 'Enter password into Password field',
      testDataSummary: 'SecretPass123',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 's4',
      testCaseId: mockContext.testCaseId,
      stepNumber: 4,
      action: 'Click Login button',
      expectedResult: 'User is redirected to /dashboard and Welcome message is displayed',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  testData: [],
  assumptions: [],
  unknowns: [],
  tags: ['auth', 'smoke'],
});

describe('TestPlanCompiler', () => {
  const compiler = new TestPlanCompiler();

  it('compiles an approved test case into an executable plan with valid status and deterministic fingerprint', () => {
    const testCase = createMockTestCase('APPROVED');
    (testCase as any).reviewStatus = 'APPROVED';

    const plan = compiler.compile({
      testCase,
      context: mockContext,
    });

    assert.equal(plan.status, 'VALID');
    assert.equal(plan.isExecutable, true);
    assert.equal(plan.compilerVersion, '1.0.0');
    assert.equal(plan.planSchemaVersion, 1);
    assert.equal(plan.testCaseVersionNumber, 2);
    assert.equal(plan.environmentId, mockContext.environmentId);
    assert.equal(plan.steps.length, 4);

    // Verify step sequence order preservation
    assert.deepEqual(
      plan.steps.map(s => s.sequence),
      [1, 2, 3, 4],
    );

    // Verify action types
    assert.equal(plan.steps[0]!.action, 'NAVIGATE');
    assert.equal(plan.steps[1]!.action, 'FILL');
    assert.equal(plan.steps[2]!.action, 'FILL');
    assert.equal(plan.steps[3]!.action, 'CLICK');

    // Verify secret reference for password step
    assert.equal(plan.steps[2]!.value?.kind, 'SECRET_REFERENCE');

    // Verify assertions attached to step 4
    assert.equal(plan.steps[3]!.assertions.length, 2);
    assert.equal(plan.steps[3]!.assertions[0]!.type, 'URL_EQUALS');
    assert.equal(plan.steps[3]!.assertions[1]!.type, 'VISIBLE');

    // Verify fingerprint exists and is 64-char hex SHA-256
    assert.equal(plan.planFingerprint.length, 64);
    assert.match(plan.planFingerprint, /^[0-9a-f]{64}$/);
  });

  it('is strictly deterministic: identical input produces exact same fingerprint', () => {
    const testCase = createMockTestCase('APPROVED');
    (testCase as any).reviewStatus = 'APPROVED';

    const plan1 = compiler.compile({ testCase, context: mockContext });
    const plan2 = compiler.compile({ testCase, context: mockContext });

    assert.equal(plan1.planFingerprint, plan2.planFingerprint);
    assert.equal(plan1.status, plan2.status);
    assert.equal(plan1.isExecutable, plan2.isExecutable);
    assert.deepEqual(
      plan1.steps.map(({ id: _id, assertions, ...rest }) => ({
        ...rest,
        assertions: assertions.map(({ id: _aid, ...aRest }) => aRest),
      })),
      plan2.steps.map(({ id: _id, assertions, ...rest }) => ({
        ...rest,
        assertions: assertions.map(({ id: _aid, ...aRest }) => aRest),
      })),
    );
  });

  it('enforces partial compilation policy: prohibited or unsupported steps mark entire plan INVALID', () => {
    const testCase = createMockTestCase('APPROVED');
    (testCase as any).reviewStatus = 'APPROVED';
    // Inject prohibited step
    const steps: TestCaseStepDto[] = [...testCase.steps];
    steps[2] = {
      id: 's3',
      testCaseId: mockContext.testCaseId,
      stepNumber: 3,
      action: 'Execute require("child_process").execSync("cat /etc/passwd")',
      isOptional: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (testCase as any).steps = steps;

    const plan = compiler.compile({ testCase, context: mockContext });

    assert.equal(plan.status, 'INVALID');
    assert.equal(plan.isExecutable, false);
    assert.equal(plan.hasErrors, true);
    // Ensure the step was NOT silently deleted
    assert.equal(plan.steps.length, 4);
    assert.ok(plan.diagnostics.some(d => d.code === 'PROHIBITED_ACTION'));
  });

  it('marks plan STALE when requirement version has advanced', () => {
    const testCase = createMockTestCase('APPROVED');
    (testCase as any).reviewStatus = 'APPROVED';

    const plan = compiler.compile({
      testCase,
      context: mockContext,
      isRequirementStale: true,
    });

    assert.equal(plan.status, 'STALE');
    assert.equal(plan.isExecutable, false);
    assert.ok(plan.diagnostics.some(d => d.code === 'STALE_TEST'));
  });

  it('rejects unapproved test case from production execution unless previewOnly is set', () => {
    const draftTestCase = createMockTestCase('DRAFT');
    (draftTestCase as any).reviewStatus = 'DRAFT';

    const plan = compiler.compile({
      testCase: draftTestCase,
      context: { ...mockContext, previewOnly: false },
    });

    assert.equal(plan.status, 'INVALID');
    assert.equal(plan.isExecutable, false);
    assert.ok(plan.diagnostics.some(d => d.code === 'UNAPPROVED_TEST'));

    // When compiling as preview
    const previewPlan = compiler.compile({
      testCase: draftTestCase,
      context: { ...mockContext, previewOnly: true },
    });

    assert.equal(previewPlan.status, 'REVIEW_REQUIRED');
    assert.equal(previewPlan.isExecutable, false);
    assert.ok(
      previewPlan.diagnostics.some(d => d.code === 'UNAPPROVED_TEST' && d.severity === 'WARNING'),
    );
  });

  it('preserves multi-requirement traceability relationships', () => {
    const testCase = createMockTestCase('APPROVED');
    (testCase as any).reviewStatus = 'APPROVED';

    const reqIds = ['e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002'];
    const reqKeys = ['REQ-001', 'REQ-002'];

    const plan = compiler.compile({
      testCase,
      context: mockContext,
      sourceRequirementIds: reqIds,
      sourceRequirementKeys: reqKeys,
    });

    assert.deepEqual(plan.sourceRequirementIds, reqIds);
    assert.deepEqual(plan.sourceRequirementKeys, reqKeys);
  });
});
