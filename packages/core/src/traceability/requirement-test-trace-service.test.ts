/**
 * @file packages/core/src/traceability/requirement-test-trace-service.test.ts
 * Integration tests for RequirementTestTraceService and Phase 54 traceability foundation.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GeneratedTestSpecificationDto } from '@ai-quality/contracts';
import { getPrismaClient } from '../database/index.js';
import { RequirementTestTraceService } from './requirement-test-trace-service.js';
import {
  TraceProjectMismatchError,
  TraceRequirementNotFoundError,
  TraceTestCaseNotFoundError,
  TraceValidationError,
} from './traceability-errors.js';
import { TestCaseService } from '../test-cases/test-case-service.js';
import { RequirementVersionService } from '../requirements/versioning/requirement-version-service.js';

describe('RequirementTestTraceService Integration', () => {
  const prisma = getPrismaClient()!;
  let traceService: RequirementTestTraceService;
  let testCaseService: TestCaseService;
  let versionService: RequirementVersionService;

  let projectIdA: string;
  let projectIdB: string;
  let requirementIdA1: string;
  let requirementIdA2: string;
  let testCaseIdA1: string;
  let testCaseIdA2: string;
  let testCaseIdB1: string;

  const validSpec: GeneratedTestSpecificationDto = {
    id: '11111111-2222-3333-4444-555555555555',
    scenarioId: null,
    scenarioKey: 'SCN-AUTH-001',
    testDesignId: null,
    title: 'Valid authentication with email and password',
    category: 'POSITIVE',
    preconditions: [
      {
        id: 'aaaaaaaa-1111-2222-3333-444444444444',
        key: 'PRE-001',
        category: 'DATA_STATE',
        description: 'User account is active',
        confidence: 'HIGH',
        sourceEvidenceRefs: ['src/auth/service.ts'],
        reviewRequired: false,
        assumptions: [],
      },
    ],
    testData: [
      {
        id: 'dddddddd-1111-2222-3333-444444444444',
        key: 'DAT-001',
        name: 'email',
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
        id: 'eeeeeeee-1111-2222-3333-444444444444',
        key: 'EXP-001',
        category: 'SUCCESS',
        description: 'User logged in successfully and dashboard rendered',
        observable: true,
        stateChange: {
          from: 'ANONYMOUS',
          to: 'AUTHENTICATED',
          entity: 'Session',
        },
        nonChange: null,
        exactMessageExpected: 'Login successful',
        httpStatusExpected: 200,
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
    sourceEvidenceRefs: ['src/auth/service.ts'],
  };

  beforeEach(async () => {
    traceService = new RequirementTestTraceService(prisma);
    testCaseService = new TestCaseService(prisma);
    versionService = new RequirementVersionService();

    // 1. Create Projects
    const projectA = await prisma.project.create({
      data: {
        name: `Trace Test Project A ${Date.now()}`,
        description: 'Project A for traceability testing',
      },
    });
    projectIdA = projectA.id;

    const projectB = await prisma.project.create({
      data: {
        name: `Trace Test Project B ${Date.now()}`,
        description: 'Project B for project isolation testing',
      },
    });
    projectIdB = projectB.id;

    // 2. Create Requirements in Project A
    const reqA1 = await prisma.requirement.create({
      data: {
        projectId: projectIdA,
        requirementKey: 'REQ-TRC-001',
        title: 'User Authentication Requirement',
        originalText: 'The system shall allow users to log in with email and password.',
      },
    });
    requirementIdA1 = reqA1.id;

    const reqA2 = await prisma.requirement.create({
      data: {
        projectId: projectIdA,
        requirementKey: 'REQ-TRC-002',
        title: 'Account Lockout Requirement',
        originalText: 'The system shall lock account after 5 failed login attempts.',
      },
    });
    requirementIdA2 = reqA2.id;

    // 3. Create Manual Test Cases in Project A
    const tcA1 = await testCaseService.createTestCase({
      projectId: projectIdA,
      title: 'Manual Login Test Case',
      objective: 'Verify manual login execution',
      type: 'POSITIVE',
      priority: 'HIGH',
      steps: [
        {
          action: 'Navigate to login',
          expectedResult: 'Login page displayed',
        },
      ],
    });
    testCaseIdA1 = tcA1.id;

    const tcA2 = await testCaseService.createTestCase({
      projectId: projectIdA,
      title: 'Manual Lockout Test Case',
      objective: 'Verify manual lockout execution',
      type: 'NEGATIVE',
      priority: 'HIGH',
      steps: [
        {
          action: 'Fail login 5 times',
          expectedResult: 'Account locked message displayed',
        },
      ],
    });
    testCaseIdA2 = tcA2.id;

    // 4. Create Manual Test Case in Project B
    const tcB1 = await testCaseService.createTestCase({
      projectId: projectIdB,
      title: 'Project B Test Case',
      objective: 'Verify project B isolation',
      type: 'POSITIVE',
      priority: 'MEDIUM',
      steps: [
        {
          action: 'Perform project B action',
          expectedResult: 'Project B action completed',
        },
      ],
    });
    testCaseIdB1 = tcB1.id;
  });

  afterEach(async () => {
    if (projectIdA) {
      await prisma.project.delete({ where: { id: projectIdA } }).catch(() => {});
    }
    if (projectIdB) {
      await prisma.project.delete({ where: { id: projectIdB } }).catch(() => {});
    }
  });

  it('creates a manual trace link with requirement version binding', async () => {
    const trace = await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      testCaseId: testCaseIdA1,
      origin: 'MANUAL',
      provenance: { creator: 'QA Engineer' },
    });

    assert.ok(trace.id);
    assert.equal(trace.projectId, projectIdA);
    assert.equal(trace.requirementId, requirementIdA1);
    assert.equal(trace.requirementKey, 'REQ-TRC-001');
    assert.equal(trace.testCaseId, testCaseIdA1);
    assert.equal(trace.testCaseKey, 'TC-001');
    assert.equal(trace.origin, 'MANUAL');
    assert.equal(trace.status, 'CURRENT');
    assert.equal(trace.isStale, false);
    assert.equal(trace.requirementVersionNumber, 1);
  });

  it('idempotently handles duplicate trace creation without error', async () => {
    const trace1 = await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      testCaseId: testCaseIdA1,
      origin: 'MANUAL',
    });

    const trace2 = await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      testCaseId: testCaseIdA1,
      origin: 'MANUAL',
    });

    assert.equal(trace1.id, trace2.id);

    const count = await prisma.requirementTestTrace.count({
      where: {
        requirementId: requirementIdA1,
        testCaseId: testCaseIdA1,
      },
    });
    assert.equal(count, 1);
  });

  it('supports many test cases traced to one requirement (Forward Lookup)', async () => {
    await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      testCaseId: testCaseIdA1,
    });
    await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      testCaseId: testCaseIdA2,
    });

    const result = await traceService.listTracesForRequirement({
      projectId: projectIdA,
      requirementId: requirementIdA1,
    });

    assert.equal(result.total, 2);
    assert.equal(result.traces.length, 2);
    const testCaseIds = result.traces.map(t => t.testCaseId);
    assert.ok(testCaseIds.includes(testCaseIdA1));
    assert.ok(testCaseIds.includes(testCaseIdA2));
  });

  it('supports multiple requirements traced to one test case (Reverse Lookup)', async () => {
    await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      testCaseId: testCaseIdA1,
    });
    await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA2,
      testCaseId: testCaseIdA1,
    });

    const result = await traceService.listTracesForTestCase({
      projectId: projectIdA,
      testCaseId: testCaseIdA1,
    });

    assert.equal(result.total, 2);
    assert.equal(result.traces.length, 2);
    const reqIds = result.traces.map(t => t.requirementId);
    assert.ok(reqIds.includes(requirementIdA1));
    assert.ok(reqIds.includes(requirementIdA2));
  });

  it('enforces strict multi-tenant project isolation and rejects cross-project linking', async () => {
    // Attempt to link Project A requirement to Project B test case
    await assert.rejects(
      async () => {
        await traceService.createTrace({
          projectId: projectIdA,
          requirementId: requirementIdA1,
          testCaseId: testCaseIdB1,
        });
      },
      (err: Error) => {
        assert.ok(err instanceof TraceProjectMismatchError);
        return true;
      },
    );

    // Attempt to query Project A requirement under Project B
    await assert.rejects(
      async () => {
        await traceService.listTracesForRequirement({
          projectId: projectIdB,
          requirementId: requirementIdA1,
        });
      },
      (err: Error) => {
        assert.ok(err instanceof TraceProjectMismatchError);
        return true;
      },
    );
  });

  it('automatically and atomically creates RequirementTestTrace during AI test generation persistence', async () => {
    const generatedTestCase = await testCaseService.persistFromGeneration({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      specification: validSpec,
      generationProvenance: {
        generationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        providerId: 'google-genai',
        model: 'gemini-1.5-pro',
        promptId: 'test-prompt-v1',
        promptVersion: 1,
        inputFingerprint: 'fingerprint-trace-001',
      },
    });

    assert.ok(generatedTestCase.id);

    const traces = await traceService.listTracesForTestCase({
      projectId: projectIdA,
      testCaseId: generatedTestCase.id,
    });

    assert.equal(traces.total, 1);
    const trace = traces.traces[0]!;
    assert.equal(trace.requirementId, requirementIdA1);
    assert.equal(trace.testCaseId, generatedTestCase.id);
    assert.equal(trace.origin, 'GENERATED');
    assert.equal(trace.status, 'CURRENT');
    assert.equal(trace.scenarioKey, 'SCN-AUTH-001');
    assert.equal(trace.generationRunId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    assert.equal(trace.requirementVersionNumber, 1);
  });

  it('marks trace STALE with REQUIREMENT_VERSION_ADVANCED when Requirement version advances', async () => {
    // 1. Create trace at Requirement Version 1
    const generatedTestCase = await testCaseService.persistFromGeneration({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      specification: validSpec,
      generationProvenance: {
        inputFingerprint: 'fingerprint-trace-002',
      },
    });

    let trace = (
      await traceService.listTracesForTestCase({
        projectId: projectIdA,
        testCaseId: generatedTestCase.id,
      })
    ).traces[0]!;
    assert.equal(trace.status, 'CURRENT');
    assert.equal(trace.isStale, false);
    assert.equal(trace.requirementVersionNumber, 1);

    // 2. Advance Requirement version to Version 2
    await versionService.updateRequirementVersioned({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      originalText:
        'The system shall allow users to log in with email, password, and mandatory TOTP 2FA.',
      changeReason: 'Added mandatory 2FA requirement',
    });

    // 3. Query trace again
    trace = (
      await traceService.listTracesForTestCase({
        projectId: projectIdA,
        testCaseId: generatedTestCase.id,
      })
    ).traces[0]!;

    assert.equal(trace.status, 'STALE');
    assert.equal(trace.isStale, true);
    assert.equal(trace.staleReason, 'REQUIREMENT_VERSION_ADVANCED');
    assert.equal(trace.requirementVersionNumber, 1); // Preserves historical v1 origin!
    assert.equal(trace.currentRequirementVersionNumber, 2);
  });

  it('does not mark trace stale when identical requirement content is saved (no-op)', async () => {
    const trace = await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      testCaseId: testCaseIdA1,
    });
    assert.equal(trace.status, 'CURRENT');

    // Perform no-op save
    const currentReq = await prisma.requirement.findUniqueOrThrow({
      where: { id: requirementIdA1 },
    });
    await versionService.updateRequirementVersioned({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      title: currentReq.title,
      originalText: currentReq.originalText,
    });

    const refreshedTrace = await traceService.getTraceById({
      projectId: projectIdA,
      traceId: trace.id,
    });
    assert.ok(refreshedTrace);
    assert.equal(refreshedTrace.status, 'CURRENT');
    assert.equal(refreshedTrace.isStale, false);
  });

  it('deletes manual trace safely without affecting requirement or test case entities', async () => {
    const trace = await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      testCaseId: testCaseIdA1,
    });

    const deleteRes = await traceService.deleteTrace({
      projectId: projectIdA,
      traceId: trace.id,
    });
    assert.equal(deleteRes.deleted, true);

    const check = await traceService.getTraceById({
      projectId: projectIdA,
      traceId: trace.id,
    });
    assert.equal(check, null);

    // Verify Requirement and TestCase still exist
    const reqExists = await prisma.requirement.findUnique({ where: { id: requirementIdA1 } });
    const tcExists = await prisma.testCase.findUnique({ where: { id: testCaseIdA1 } });
    assert.ok(reqExists);
    assert.ok(tcExists);
  });

  it('supports project-wide trace listing with search, filtering, and pagination', async () => {
    await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA1,
      testCaseId: testCaseIdA1,
      origin: 'MANUAL',
    });
    await traceService.createTrace({
      projectId: projectIdA,
      requirementId: requirementIdA2,
      testCaseId: testCaseIdA2,
      origin: 'GENERATED',
    });

    const allTraces = await traceService.listProjectTraces({
      projectId: projectIdA,
      page: 1,
      pageSize: 10,
    });
    assert.equal(allTraces.total, 2);

    const manualOnly = await traceService.listProjectTraces({
      projectId: projectIdA,
      origin: 'MANUAL',
    });
    assert.equal(manualOnly.total, 1);
    assert.equal(manualOnly.traces[0]?.testCaseId, testCaseIdA1);

    const searchMatch = await traceService.listProjectTraces({
      projectId: projectIdA,
      search: 'Lockout',
    });
    assert.equal(searchMatch.total, 1);
    assert.equal(searchMatch.traces[0]?.requirementKey, 'REQ-TRC-002');
  });

  it('throws validation error when invalid inputs are provided', async () => {
    await assert.rejects(
      async () => {
        await traceService.createTrace({
          projectId: '',
          requirementId: requirementIdA1,
          testCaseId: testCaseIdA1,
        });
      },
      (err: Error) => err instanceof TraceValidationError,
    );

    await assert.rejects(
      async () => {
        await traceService.createTrace({
          projectId: projectIdA,
          requirementId: '00000000-0000-0000-0000-000000000000',
          testCaseId: testCaseIdA1,
        });
      },
      (err: Error) => err instanceof TraceRequirementNotFoundError,
    );

    await assert.rejects(
      async () => {
        await traceService.createTrace({
          projectId: projectIdA,
          requirementId: requirementIdA1,
          testCaseId: '00000000-0000-0000-0000-000000000000',
        });
      },
      (err: Error) => err instanceof TraceTestCaseNotFoundError,
    );
  });
});
