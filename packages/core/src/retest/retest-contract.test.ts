/**
 * @file packages/core/src/retest/retest-contract.test.ts
 * Contract, schema, and error hierarchy validation for V7 Phase 106.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_CHANNELS,
  changeSourceTypeSchema,
  testSelectionStateSchema,
  impactCategorySchema,
  impactConfidenceSchema,
  retestPlanStatusSchema,
  changeSnapshotDtoSchema,
  createChangeSnapshotInputSchema,
  retestImpactNodeDtoSchema,
  retestImpactEdgeDtoSchema,
  retestImpactGraphDtoSchema,
  retestSelectedTestDtoSchema,
  retestPlanDtoSchema,
  planRetestInputSchema,
  getRetestPlanInputSchema,
  listRetestPlansInputSchema,
  explainTestSelectionInputSchema,
  explainTestSelectionResultDtoSchema,
} from '@ai-quality/contracts';
import {
  RetestError,
  RetestPlanNotFoundError,
  RetestSnapshotNotFoundError,
  RetestProjectMismatchError,
  RetestValidationError,
  RetestPatchNotFoundError,
  RetestRequirementNotFoundError,
  RetestConcurrentAnalysisError,
  RetestUnboundedScopeError,
} from './retest-errors.js';
import {
  SELECTION_POLICY_VERSION,
  RISK_POLICY_VERSION,
  IMPACT_ENGINE_VERSION,
  SECURITY_CRITICAL_KEYWORDS,
} from './retest-types.js';

describe('V7 Phase 106 Retest Contracts & Schemas', () => {
  it('validates DESKTOP_CHANNELS for retest', () => {
    assert.equal(DESKTOP_CHANNELS.RETEST_CREATE_SNAPSHOT, 'desktop:retest:create-snapshot');
    assert.equal(DESKTOP_CHANNELS.RETEST_PLAN, 'desktop:retest:plan');
    assert.equal(DESKTOP_CHANNELS.RETEST_GET_PLAN, 'desktop:retest:get-plan');
    assert.equal(DESKTOP_CHANNELS.RETEST_LIST_PLANS, 'desktop:retest:list-plans');
    assert.equal(DESKTOP_CHANNELS.RETEST_EXPLAIN_TEST, 'desktop:retest:explain-test');
  });

  it('validates changeSourceTypeSchema values', () => {
    const valid = [
      'REQUIREMENT_CHANGE',
      'SOURCE_CODE_CHANGE',
      'APPROVED_PATCH',
      'MANUAL_FILE_CHANGE',
      'COMMIT_DIFF',
      'BRANCH_DIFF',
      'CONFIGURATION_CHANGE',
      'API_CONTRACT_CHANGE',
    ];
    for (const val of valid) {
      assert.equal(changeSourceTypeSchema.parse(val), val);
    }
    assert.throws(() => changeSourceTypeSchema.parse('INVALID_SOURCE'));
  });

  it('validates testSelectionStateSchema values', () => {
    const valid = ['MANDATORY', 'RECOMMENDED', 'OPTIONAL', 'NOT_IMPACTED', 'UNKNOWN', 'EXCLUDED'];
    for (const val of valid) {
      assert.equal(testSelectionStateSchema.parse(val), val);
    }
    assert.throws(() => testSelectionStateSchema.parse('INVALID_STATE'));
  });

  it('validates impactCategorySchema and impactConfidenceSchema', () => {
    assert.equal(impactCategorySchema.parse('DIRECT'), 'DIRECT');
    assert.equal(impactCategorySchema.parse('INDIRECT'), 'INDIRECT');
    assert.equal(impactCategorySchema.parse('TRANSITIVE'), 'TRANSITIVE');
    assert.equal(impactCategorySchema.parse('UNKNOWN'), 'UNKNOWN');

    assert.equal(impactConfidenceSchema.parse('HIGH'), 'HIGH');
    assert.equal(impactConfidenceSchema.parse('MEDIUM'), 'MEDIUM');
    assert.equal(impactConfidenceSchema.parse('LOW'), 'LOW');
    assert.equal(impactConfidenceSchema.parse('UNKNOWN'), 'UNKNOWN');
  });

  it('validates changeSnapshotDtoSchema', () => {
    const snapshot = {
      id: '11111111-1111-1111-1111-111111111111',
      projectId: '22222222-2222-2222-2222-222222222222',
      sourceType: 'SOURCE_CODE_CHANGE',
      title: 'Auth fix',
      changedFiles: ['src/auth.ts'],
      changedSymbolsJson: [{ name: 'login', kind: 'FUNCTION', filePath: 'src/auth.ts' }],
      changedRequirements: ['REQ-001'],
      changedApisJson: [{ endpoint: '/api/login', filePath: 'src/auth.ts' }],
      changedConfiguration: {},
      diffText: '--- a/src/auth.ts\n+++ b/src/auth.ts',
      metadataJson: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsed = changeSnapshotDtoSchema.parse(snapshot);
    assert.equal(parsed.id, snapshot.id);
    assert.equal(parsed.title, 'Auth fix');
  });

  it('validates retestImpactGraphDtoSchema', () => {
    const graph = {
      nodes: [
        { id: 'file:src/auth.ts', type: 'SourceFile', label: 'src/auth.ts' },
        { id: 'req:req-1', type: 'Requirement', label: 'REQ-01' },
      ],
      edges: [{ from: 'file:src/auth.ts', to: 'req:req-1', type: 'IMPLEMENTS' }],
    };
    const parsed = retestImpactGraphDtoSchema.parse(graph);
    assert.equal(parsed.nodes.length, 2);
    assert.equal(parsed.edges.length, 1);
  });

  it('validates retestPlanDtoSchema', () => {
    const plan = {
      id: '33333333-3333-3333-3333-333333333333',
      projectId: '22222222-2222-2222-2222-222222222222',
      changeSnapshotId: '11111111-1111-1111-1111-111111111111',
      status: 'COMPLETED',
      selectionPolicyVersion: SELECTION_POLICY_VERSION,
      riskPolicyVersion: RISK_POLICY_VERSION,
      impactEngineVersion: IMPACT_ENGINE_VERSION,
      fullRegressionRequired: false,
      totalTestsCount: 10,
      mandatoryCount: 2,
      recommendedCount: 3,
      optionalCount: 0,
      unknownCount: 1,
      excludedCount: 4,
      impactGraph: { nodes: [], edges: [] },
      selectedTests: [],
      auditTrail: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsed = retestPlanDtoSchema.parse(plan);
    assert.equal(parsed.id, plan.id);
    assert.equal(parsed.mandatoryCount, 2);
  });

  it('validates explainTestSelectionResultDtoSchema', () => {
    const explanation = {
      testCaseId: '44444444-4444-4444-4444-444444444444',
      testCaseKey: 'TC-AUTH-001',
      testCaseTitle: 'Verify user login with valid credentials',
      selectionState: 'MANDATORY',
      impactCategory: 'DIRECT',
      confidence: 'HIGH',
      selectionReason: 'Directly traces to modified requirement REQ-AUTH-001.',
      dependencyPath: ['src/auth/auth-service.ts', 'src/auth/login.ts'],
      riskSignals: ['SECURITY_CRITICAL_PATH'],
      evidenceReferences: ['Requirement:REQ-AUTH-001'],
      historicalFailureSignal: true,
      changedRequirement: 'REQ-AUTH-001',
      affectedCodeOrApi: 'src/auth/login.ts',
      tracePath: ['Requirement: REQ-AUTH-001', 'Test: TC-AUTH-001'],
    };
    const parsed = explainTestSelectionResultDtoSchema.parse(explanation);
    assert.equal(parsed.testCaseKey, 'TC-AUTH-001');
    assert.equal(parsed.selectionState, 'MANDATORY');
  });

  it('validates remaining retest input and graph schemas', () => {
    assert.equal(retestPlanStatusSchema.parse('COMPLETED'), 'COMPLETED');
    assert.equal(retestPlanStatusSchema.parse('DRAFT'), 'DRAFT');

    const inputSnapshot = createChangeSnapshotInputSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      sourceType: 'REQUIREMENT_CHANGE',
      title: 'Snapshot input',
    });
    assert.equal(inputSnapshot.title, 'Snapshot input');

    const node = retestImpactNodeDtoSchema.parse({
      id: 'req:1',
      type: 'Requirement',
      label: 'Login Req',
    });
    assert.equal(node.id, 'req:1');

    const edge = retestImpactEdgeDtoSchema.parse({
      from: 'req:1',
      to: 'tc:1',
      type: 'VALIDATES',
    });
    assert.equal(edge.type, 'VALIDATES');

    const selectedTest = retestSelectedTestDtoSchema.parse({
      testCaseId: '11111111-1111-1111-1111-111111111111',
      testCaseKey: 'TC-01',
      testCaseTitle: 'Test 1',
      selectionState: 'MANDATORY',
      impactCategory: 'DIRECT',
      confidence: 'HIGH',
      selectionReason: 'Direct link',
    });
    assert.equal(selectedTest.testCaseKey, 'TC-01');

    const planInput = planRetestInputSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      changeSnapshotId: '22222222-2222-2222-2222-222222222222',
    });
    assert.equal(planInput.projectId, '11111111-1111-1111-1111-111111111111');

    const getPlanInput = getRetestPlanInputSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      planId: '33333333-3333-3333-3333-333333333333',
    });
    assert.equal(getPlanInput.planId, '33333333-3333-3333-3333-333333333333');

    const listInput = listRetestPlansInputSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
    });
    assert.equal(listInput.projectId, '11111111-1111-1111-1111-111111111111');

    const explainInput = explainTestSelectionInputSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      planId: '33333333-3333-3333-3333-333333333333',
      testCaseId: '44444444-4444-4444-4444-444444444444',
    });
    assert.equal(explainInput.testCaseId, '44444444-4444-4444-4444-444444444444');
  });

  it('verifies error hierarchy and codes', () => {
    const notFound = new RetestPlanNotFoundError('Retest plan not found.');
    assert.ok(notFound instanceof RetestError);
    assert.equal(notFound.code, 'RETEST_PLAN_NOT_FOUND');

    const snapNotFound = new RetestSnapshotNotFoundError();
    assert.equal(snapNotFound.code, 'RETEST_SNAPSHOT_NOT_FOUND');

    const mismatch = new RetestProjectMismatchError();
    assert.equal(mismatch.code, 'RETEST_PROJECT_MISMATCH');

    const validation = new RetestValidationError();
    assert.equal(validation.code, 'RETEST_VALIDATION_ERROR');

    const patchNotFound = new RetestPatchNotFoundError();
    assert.equal(patchNotFound.code, 'RETEST_PATCH_NOT_FOUND');

    const reqNotFound = new RetestRequirementNotFoundError();
    assert.equal(reqNotFound.code, 'RETEST_REQUIREMENT_NOT_FOUND');

    const concurrent = new RetestConcurrentAnalysisError();
    assert.equal(concurrent.code, 'RETEST_CONCURRENT_ANALYSIS_ERROR');

    const unbounded = new RetestUnboundedScopeError();
    assert.equal(unbounded.code, 'RETEST_UNBOUNDED_SCOPE_ERROR');
  });

  it('validates policy versions and security keywords', () => {
    assert.equal(SELECTION_POLICY_VERSION, '1.0.0');
    assert.equal(RISK_POLICY_VERSION, '1.0.0');
    assert.equal(IMPACT_ENGINE_VERSION, '1.0.0');
    assert.ok(SECURITY_CRITICAL_KEYWORDS.includes('auth'));
    assert.ok(SECURITY_CRITICAL_KEYWORDS.includes('password'));
    assert.ok(SECURITY_CRITICAL_KEYWORDS.includes('tenant'));
  });
});
