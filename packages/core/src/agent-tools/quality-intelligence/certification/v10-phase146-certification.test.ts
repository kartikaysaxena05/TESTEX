/**
 * @file packages/core/src/agent-tools/quality-intelligence/certification/v10-phase146-certification.test.ts
 * Comprehensive certification test suite for V10 Phase 146:
 * Requirement & Test Intelligence Tools.
 *
 * Covers:
 * 1. Tool registration & definition compliance in ToolRegistryService
 * 2. Permission level verification (all 8 tools evaluated as READ_ONLY)
 * 3. requirements.list: pagination, status/type/priority filtering, truncation flag
 * 4. requirements.get: lookup by UUID and human key, version/provenance/tag extraction, not found error
 * 5. requirements.search: query search, contextual snippet extraction, safe truncation
 * 6. tests.list: pagination, filters, step counting, safe summary bounds
 * 7. tests.get: lookup by UUID and human key, steps, preconditions, requirement linkage, not found error
 * 8. tests.search: search across title/objective/description, snippet generation
 * 9. tests.forRequirement: lookup by requirement ID or key, traced test retrieval, not found error
 * 10. traceability.get: RTM matrix rows, coverage metrics, filtering by requirement
 * 11. Strict tenant isolation: cross-project access rejection (AiCrossProjectAccessError)
 * 12. Input validation: missing required fields, malformed schemas rejected
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import {
  QualityIntelligenceService,
  QualityIntelligenceRequirementNotFoundError,
  QualityIntelligenceTestCaseNotFoundError,
  QualityIntelligenceValidationError,
  createQualityIntelligenceToolDefinitions,
} from '../index.js';
import {
  ToolRegistryService,
} from '../../agent-tool-registry.js';
import { AgentPermissionService } from '../../../agent-permissions/agent-permission-service.js';
import {
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from '../../../ai-provider/ai-provider-errors.js';

describe('V10 Phase 146: Requirement & Test Intelligence Tools Certification', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-owner-1111';
  const intruderUserId = 'user-intruder-9999';

  const req1Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const req2Id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const test1Id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const test2Id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  // In-memory data store for mock prisma
  let projectStore: any[];
  let requirementStore: any[];
  let testCaseStore: any[];
  let traceStore: any[];
  let mockPrisma: PrismaClient;
  let service: QualityIntelligenceService;
  let registry: ToolRegistryService;
  let permissionService: AgentPermissionService;

  beforeEach(() => {
    projectStore = [
      {
        id: testProjectId,
        name: 'Quality Platform Project',
        userId: testUserId,
        deletedAt: null,
      },
      {
        id: otherProjectId,
        name: 'Restricted Project',
        userId: 'other-owner',
        deletedAt: null,
      },
    ];

    requirementStore = [
      {
        id: req1Id,
        projectId: testProjectId,
        requirementKey: 'REQ-AUTH-001',
        title: 'User Authentication via OAuth2',
        originalText:
          'The system must authenticate users using Google and Apple OAuth2 protocols securely.',
        status: 'ACTIVE',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
        createdAt: new Date('2026-09-01T10:00:00Z'),
        updatedAt: new Date('2026-09-01T12:00:00Z'),
        requirementSource: {
          id: 'src-1111-1111',
          name: 'Architecture Spec',
          sourceType: 'DOCUMENT',
          document: { originalFileName: 'auth-spec.pdf' },
        },
        versions: [{ versionNumber: 2 }],
        metadata: { tags: ['auth', 'security', 'oauth'] },
        _count: { testTraces: 2 },
      },
      {
        id: req2Id,
        projectId: testProjectId,
        requirementKey: 'REQ-PAY-002',
        title: 'Payment Processing Checkout',
        originalText:
          'The platform must support credit card checkout transactions with 3D Secure verification.',
        status: 'DRAFT',
        type: 'FUNCTIONAL',
        priority: 'CRITICAL',
        createdAt: new Date('2026-09-02T10:00:00Z'),
        updatedAt: new Date('2026-09-02T12:00:00Z'),
        requirementSource: null,
        versions: [{ versionNumber: 1 }],
        metadata: { tags: ['checkout', 'payment'] },
        _count: { testTraces: 0 },
      },
    ];

    testCaseStore = [
      {
        id: test1Id,
        projectId: testProjectId,
        testCaseKey: 'TC-AUTH-101',
        title: 'Verify Google OAuth Successful Login',
        objective: 'Ensure user can authenticate with Google credentials.',
        description: 'Navigates to login page, clicks Google sign in, and verifies session.',
        status: 'GENERATED',
        type: 'POSITIVE',
        priority: 'HIGH',
        sourceRequirementId: req1Id,
        sourceRequirement: {
          id: req1Id,
          requirementKey: 'REQ-AUTH-001',
          title: 'User Authentication via OAuth2',
          status: 'ACTIVE',
        },
        preconditions: [
          { sequenceOrder: 1, description: 'Google OAuth client configured' },
          { sequenceOrder: 2, description: 'User account exists in directory' },
        ],
        steps: [
          {
            stepNumber: 1,
            action: 'Click Google Sign-in button',
            expectedResult: 'OAuth dialog opens',
            testDataSummary: 'user@example.com',
          },
          {
            stepNumber: 2,
            action: 'Submit valid credentials and consent',
            expectedResult: 'Redirected to dashboard',
            testDataSummary: null,
          },
        ],
        _count: { steps: 2 },
        createdAt: new Date('2026-09-05T09:00:00Z'),
        updatedAt: new Date('2026-09-05T09:30:00Z'),
      },
      {
        id: test2Id,
        projectId: testProjectId,
        testCaseKey: 'TC-AUTH-102',
        title: 'Verify Google OAuth Invalid Token Rejection',
        objective: 'Ensure expired or invalid OAuth tokens return 401 Unauthorized.',
        description: 'Attempts token exchange with expired JWT.',
        status: 'GENERATED',
        type: 'NEGATIVE',
        priority: 'HIGH',
        sourceRequirementId: req1Id,
        sourceRequirement: {
          id: req1Id,
          requirementKey: 'REQ-AUTH-001',
          title: 'User Authentication via OAuth2',
          status: 'ACTIVE',
        },
        preconditions: [{ sequenceOrder: 1, description: 'Invalid token generated' }],
        steps: [
          {
            stepNumber: 1,
            action: 'Send POST /api/auth/token with expired token',
            expectedResult: 'HTTP 401 returned',
            testDataSummary: 'jwt=expired',
          },
        ],
        _count: { steps: 1 },
        createdAt: new Date('2026-09-05T10:00:00Z'),
        updatedAt: new Date('2026-09-05T10:15:00Z'),
      },
    ];

    traceStore = [
      {
        id: 'trace-1111',
        projectId: testProjectId,
        requirementId: req1Id,
        testCaseId: test1Id,
        testCase: testCaseStore[0],
        status: 'CURRENT',
        createdAt: new Date('2026-09-05T09:00:00Z'),
      },
      {
        id: 'trace-2222',
        projectId: testProjectId,
        requirementId: req1Id,
        testCaseId: test2Id,
        testCase: testCaseStore[1],
        status: 'CURRENT',
        createdAt: new Date('2026-09-05T10:00:00Z'),
      },
    ];

    mockPrisma = {
      project: {
        findUnique: async ({ where }: any) => {
          return projectStore.find(p => p.id === where.id) ?? null;
        },
      },
      requirement: {
        count: async ({ where }: any) => {
          let items = requirementStore.filter(r => r.projectId === where.projectId);
          if (where.status) items = items.filter(r => r.status === where.status);
          if (where.type) items = items.filter(r => r.type === where.type);
          if (where.priority) items = items.filter(r => r.priority === where.priority);
          if (where.OR) {
            const q = where.OR[0].requirementKey.contains.toLowerCase();
            items = items.filter(
              r =>
                r.requirementKey.toLowerCase().includes(q) ||
                r.title.toLowerCase().includes(q) ||
                r.originalText.toLowerCase().includes(q),
            );
          }
          return items.length;
        },
        findMany: async ({ where, skip = 0, take = 50 }: any) => {
          let items = requirementStore.filter(r => r.projectId === where.projectId);
          if (where.status) items = items.filter(r => r.status === where.status);
          if (where.type) items = items.filter(r => r.type === where.type);
          if (where.priority) items = items.filter(r => r.priority === where.priority);
          if (where.OR) {
            const q = where.OR[0].requirementKey.contains.toLowerCase();
            items = items.filter(
              r =>
                r.requirementKey.toLowerCase().includes(q) ||
                r.title.toLowerCase().includes(q) ||
                r.originalText.toLowerCase().includes(q),
            );
          }
          return items.slice(skip, skip + take);
        },
        findFirst: async ({ where }: any) => {
          return (
            requirementStore.find(r => {
              if (r.projectId !== where.projectId) return false;
              if (where.OR) {
                return where.OR.some(
                  (cond: any) =>
                    (cond.id !== undefined && cond.id === r.id) ||
                    (cond.requirementKey !== undefined && cond.requirementKey === r.requirementKey),
                );
              }
              if (where.id) return r.id === where.id;
              if (where.requirementKey) return r.requirementKey === where.requirementKey;
              return false;
            }) ?? null
          );
        },
      },
      testCase: {
        count: async ({ where }: any) => {
          let items = testCaseStore.filter(t => t.projectId === where.projectId);
          if (where.status) items = items.filter(t => t.status === where.status);
          if (where.type) items = items.filter(t => t.type === where.type);
          if (where.priority) items = items.filter(t => t.priority === where.priority);
          if (where.OR) {
            const q = where.OR[0].testCaseKey.contains.toLowerCase();
            items = items.filter(
              t =>
                t.testCaseKey.toLowerCase().includes(q) ||
                t.title.toLowerCase().includes(q) ||
                (t.objective && t.objective.toLowerCase().includes(q)) ||
                (t.description && t.description.toLowerCase().includes(q)),
            );
          }
          return items.length;
        },
        findMany: async ({ where, skip = 0, take = 50 }: any) => {
          let items = testCaseStore.filter(t => t.projectId === where.projectId);
          if (where.status) items = items.filter(t => t.status === where.status);
          if (where.type) items = items.filter(t => t.type === where.type);
          if (where.priority) items = items.filter(t => t.priority === where.priority);
          if (where.OR) {
            const q = where.OR[0].testCaseKey.contains.toLowerCase();
            items = items.filter(
              t =>
                t.testCaseKey.toLowerCase().includes(q) ||
                t.title.toLowerCase().includes(q) ||
                (t.objective && t.objective.toLowerCase().includes(q)) ||
                (t.description && t.description.toLowerCase().includes(q)),
            );
          }
          return items.slice(skip, skip + take);
        },
        findFirst: async ({ where }: any) => {
          return (
            testCaseStore.find(t => {
              if (t.projectId !== where.projectId) return false;
              if (where.OR) {
                return where.OR.some(
                  (cond: any) =>
                    (cond.id !== undefined && cond.id === t.id) ||
                    (cond.testCaseKey !== undefined && cond.testCaseKey === t.testCaseKey),
                );
              }
              if (where.id) return t.id === where.id;
              if (where.testCaseKey) return t.testCaseKey === where.testCaseKey;
              return false;
            }) ?? null
          );
        },
      },
      requirementTestTrace: {
        count: async ({ where }: any) => {
          return traceStore.filter(
            tr => tr.projectId === where.projectId && tr.requirementId === where.requirementId,
          ).length;
        },
        findMany: async ({ where, skip = 0, take = 50 }: any) => {
          return traceStore
            .filter(tr => tr.projectId === where.projectId && tr.requirementId === where.requirementId)
            .slice(skip, skip + take);
        },
      },
    } as unknown as PrismaClient;

    // Mock CoverageAnalysisService to avoid heavy DB aggregations in unit tests
    const mockCoverageService = {
      getTraceabilityMatrix: async ({ projectId }: any) => {
        return {
          rows: [
            {
              requirementId: req1Id,
              requirementKey: 'REQ-AUTH-001',
              requirementTitle: 'User Authentication via OAuth2',
              requirementLifecycle: 'ACTIVE',
              requirementPriority: 'HIGH',
              coverageStatus: 'COVERED',
              coveragePercentage: 100,
              totalLinkedTestCount: 2,
              linkedTests: [
                {
                  testCaseId: test1Id,
                  testCaseKey: 'TC-AUTH-101',
                  testCaseTitle: 'Verify Google OAuth Successful Login',
                  testCaseStatus: 'GENERATED',
                  isStale: false,
                },
                {
                  testCaseId: test2Id,
                  testCaseKey: 'TC-AUTH-102',
                  testCaseTitle: 'Verify Google OAuth Invalid Token Rejection',
                  testCaseStatus: 'GENERATED',
                  isStale: false,
                },
              ],
            },
            {
              requirementId: req2Id,
              requirementKey: 'REQ-PAY-002',
              requirementTitle: 'Payment Processing Checkout',
              requirementLifecycle: 'DRAFT',
              requirementPriority: 'CRITICAL',
              coverageStatus: 'UNCOVERED',
              coveragePercentage: 0,
              totalLinkedTestCount: 0,
              linkedTests: [],
            },
          ],
          total: 2,
          summary: {
            coveredCount: 1,
            uncoveredCount: 1,
            overallCoveragePercentage: 50,
          },
        };
      },
    } as any;

    service = new QualityIntelligenceService({
      prisma: mockPrisma,
      coverageService: mockCoverageService,
    });

    permissionService = new AgentPermissionService({ prisma: mockPrisma });
    registry = new ToolRegistryService({
      prisma: mockPrisma,
      permissionService,
    });
  });

  // ============================================================================
  // Test 1: Registry Registration & Permission Mapping
  // ============================================================================
  it('should register all 8 tools and evaluate them strictly as READ_ONLY', () => {
    const definitions = createQualityIntelligenceToolDefinitions(service);
    assert.equal(definitions.length, 8);

    const expectedToolIds = [
      'requirements.list',
      'requirements.get',
      'requirements.search',
      'tests.list',
      'tests.get',
      'tests.search',
      'tests.forRequirement',
      'traceability.get',
    ];

    for (const toolId of expectedToolIds) {
      const def = definitions.find(d => d.toolId === toolId);
      assert.ok(def, `Tool ${toolId} must be defined`);
      assert.equal(def?.permissionLevel, 'READ');

      // Verify permission resolver maps to READ_ONLY
      const level = permissionService.resolveToolPermissionLevel(toolId, def?.permissionLevel);
      assert.equal(level, 'READ_ONLY', `${toolId} must resolve to READ_ONLY`);
    }

    // Register all tools into ToolRegistryService
    registry.registerTools(definitions);

    for (const toolId of expectedToolIds) {
      assert.ok(registry.hasTool(toolId));
      const registered = registry.getRegisteredTool(toolId);
      assert.ok(registered?.enabled);
    }
  });

  // ============================================================================
  // Test 2: requirements.list
  // ============================================================================
  it('requirements.list: should list requirements with pagination and status filters', async () => {
    const result = await service.listRequirements(
      {
        projectId: testProjectId,
        limit: 10,
        offset: 0,
      },
      testUserId,
    );

    assert.equal(result.total, 2);
    assert.equal(result.items.length, 2);
    assert.equal(result.truncated, false);
    assert.equal(result.items[0]?.requirementKey, 'REQ-AUTH-001');
    assert.equal(result.items[0]?.latestVersion, 2);
    assert.equal(result.items[0]?.sourceType, 'DOCUMENT');

    // Filter by status DRAFT
    const filtered = await service.listRequirements(
      {
        projectId: testProjectId,
        status: 'DRAFT',
      },
      testUserId,
    );
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0]?.requirementKey, 'REQ-PAY-002');
  });

  // ============================================================================
  // Test 3: requirements.get
  // ============================================================================
  it('requirements.get: should fetch by UUID and by human key, with versions and tags', async () => {
    // 1. Fetch by UUID
    const byId = await service.getRequirement(
      { projectId: testProjectId, requirementId: req1Id },
      testUserId,
    );
    assert.equal(byId.id, req1Id);
    assert.equal(byId.requirementKey, 'REQ-AUTH-001');
    assert.equal(byId.versionNumber, 2);
    assert.deepEqual(byId.tags, ['auth', 'security', 'oauth']);
    assert.equal(byId.tracedTestCount, 2);
    assert.ok(byId.source);
    assert.equal(byId.source?.sourceType, 'DOCUMENT');

    // 2. Fetch by human key
    const byKey = await service.getRequirement(
      { projectId: testProjectId, requirementId: 'REQ-AUTH-001' },
      testUserId,
    );
    assert.equal(byKey.id, req1Id);

    // 3. Not found throws
    await assert.rejects(
      async () =>
        service.getRequirement(
          { projectId: testProjectId, requirementId: 'NON-EXISTENT-REQ' },
          testUserId,
        ),
      QualityIntelligenceRequirementNotFoundError,
    );
  });

  // ============================================================================
  // Test 4: requirements.search
  // ============================================================================
  it('requirements.search: should match query and generate surrounding text snippet', async () => {
    const searchRes = await service.searchRequirements(
      { projectId: testProjectId, query: 'OAuth2' },
      testUserId,
    );

    assert.equal(searchRes.total, 1);
    assert.equal(searchRes.items[0]?.requirementKey, 'REQ-AUTH-001');
    assert.ok(searchRes.items[0]?.snippet.toLowerCase().includes('oauth2'));

    // No match
    const emptySearch = await service.searchRequirements(
      { projectId: testProjectId, query: 'blockchain' },
      testUserId,
    );
    assert.equal(emptySearch.total, 0);
    assert.equal(emptySearch.items.length, 0);
  });

  // ============================================================================
  // Test 5: tests.list
  // ============================================================================
  it('tests.list: should list test cases with step count and pagination', async () => {
    const listRes = await service.listTests(
      { projectId: testProjectId, limit: 10, offset: 0 },
      testUserId,
    );

    assert.equal(listRes.total, 2);
    assert.equal(listRes.items.length, 2);
    assert.equal(listRes.items[0]?.testKey, 'TC-AUTH-101');
    assert.equal(listRes.items[0]?.stepCount, 2);
    assert.equal(listRes.items[0]?.requirementId, req1Id);

    // Filter by type NEGATIVE
    const filtered = await service.listTests(
      { projectId: testProjectId, type: 'NEGATIVE' },
      testUserId,
    );
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0]?.testKey, 'TC-AUTH-102');
  });

  // ============================================================================
  // Test 6: tests.get
  // ============================================================================
  it('tests.get: should fetch test case by ID and Key with full steps and requirement linkage', async () => {
    // 1. By ID
    const testCase = await service.getTest(
      { projectId: testProjectId, testCaseId: test1Id },
      testUserId,
    );

    assert.equal(testCase.id, test1Id);
    assert.equal(testCase.testKey, 'TC-AUTH-101');
    assert.equal(testCase.steps.length, 2);
    assert.equal(testCase.preconditions.length, 2);
    assert.equal(testCase.sourceRequirement?.requirementKey, 'REQ-AUTH-001');

    // 2. By Key
    const byKey = await service.getTest(
      { projectId: testProjectId, testCaseId: 'TC-AUTH-102' },
      testUserId,
    );
    assert.equal(byKey.id, test2Id);
    assert.equal(byKey.type, 'NEGATIVE');

    // 3. Not found throws
    await assert.rejects(
      async () =>
        service.getTest({ projectId: testProjectId, testCaseId: 'TC-UNKNOWN' }, testUserId),
      QualityIntelligenceTestCaseNotFoundError,
    );
  });

  // ============================================================================
  // Test 7: tests.search
  // ============================================================================
  it('tests.search: should search test cases and produce contextual snippets', async () => {
    const searchRes = await service.searchTests(
      { projectId: testProjectId, query: 'token' },
      testUserId,
    );

    assert.equal(searchRes.total, 1);
    assert.equal(searchRes.items[0]?.testKey, 'TC-AUTH-102');
    assert.ok(searchRes.items[0]?.snippet.toLowerCase().includes('token'));
  });

  // ============================================================================
  // Test 8: tests.forRequirement
  // ============================================================================
  it('tests.forRequirement: should return traced test cases for requirement', async () => {
    // 1. By requirement UUID
    const res = await service.getTestsForRequirement(
      { projectId: testProjectId, requirementId: req1Id },
      testUserId,
    );

    assert.equal(res.requirementKey, 'REQ-AUTH-001');
    assert.equal(res.total, 2);
    assert.equal(res.items.length, 2);
    assert.equal(res.items[0]?.testKey, 'TC-AUTH-101');

    // 2. By human key
    const byKey = await service.getTestsForRequirement(
      { projectId: testProjectId, requirementId: 'REQ-AUTH-001' },
      testUserId,
    );
    assert.equal(byKey.total, 2);

    // 3. Invalid requirement throws
    await assert.rejects(
      async () =>
        service.getTestsForRequirement(
          { projectId: testProjectId, requirementId: 'REQ-NON-EXISTENT' },
          testUserId,
        ),
      QualityIntelligenceRequirementNotFoundError,
    );
  });

  // ============================================================================
  // Test 9: traceability.get
  // ============================================================================
  it('traceability.get: should return RTM matrix rows and coverage statistics', async () => {
    const res = await service.getTraceability(
      { projectId: testProjectId },
      testUserId,
    );

    assert.equal(res.projectId, testProjectId);
    assert.equal(res.total, 2);
    assert.equal(res.coveredCount, 1);
    assert.equal(res.uncoveredCount, 1);
    assert.equal(res.overallCoveragePercentage, 50);

    const authRow = res.items.find(r => r.requirementKey === 'REQ-AUTH-001');
    assert.ok(authRow);
    assert.equal(authRow?.coverageStatus, 'COVERED');
    assert.equal(authRow?.linkedTestCount, 2);
    assert.equal(authRow?.tests.length, 2);
    assert.equal(authRow?.tests[0]?.isCurrent, true);

    // Filter by requirementId
    const singleReqRes = await service.getTraceability(
      { projectId: testProjectId, requirementId: 'REQ-AUTH-001' },
      testUserId,
    );
    assert.equal(singleReqRes.total, 1);
    assert.equal(singleReqRes.items[0]?.requirementKey, 'REQ-AUTH-001');
  });

  // ============================================================================
  // Test 10: Tenant Isolation & Security Boundary
  // ============================================================================
  it('should enforce strict tenant isolation and reject cross-project access', async () => {
    // 1. Intruder user attempting to read testProjectId
    await assert.rejects(
      async () =>
        service.listRequirements(
          { projectId: testProjectId },
          intruderUserId,
        ),
      AiCrossProjectAccessError,
    );

    await assert.rejects(
      async () =>
        service.getRequirement(
          { projectId: testProjectId, requirementId: req1Id },
          intruderUserId,
        ),
      AiCrossProjectAccessError,
    );

    await assert.rejects(
      async () =>
        service.getTraceability(
          { projectId: testProjectId },
          intruderUserId,
        ),
      AiCrossProjectAccessError,
    );

    // 2. Non-existent project
    await assert.rejects(
      async () =>
        service.listRequirements(
          { projectId: '99999999-9999-9999-9999-999999999999' },
          testUserId,
        ),
      AiInvalidRequestError,
    );
  });

  // ============================================================================
  // Test 11: Invocation via ToolRegistryService End-to-End
  // ============================================================================
  it('should successfully execute requirements.list and tests.get through ToolRegistryService invocation', async () => {
    const definitions = createQualityIntelligenceToolDefinitions(service);
    registry.registerTools(definitions);

    // Invoke requirements.list through registry
    const invokeResult = await registry.invoke(
      {
        toolId: 'requirements.list',
        projectId: testProjectId,
        input: { projectId: testProjectId },
      },
      {
        projectId: testProjectId,
        userId: testUserId,
      },
    );

    assert.equal(invokeResult.success, true);
    assert.equal(invokeResult.toolId, 'requirements.list');
    assert.ok(invokeResult.output);
    assert.equal((invokeResult.output as any).total, 2);

    // Invoke tests.get through registry
    const testGetResult = await registry.invoke(
      {
        toolId: 'tests.get',
        projectId: testProjectId,
        input: { projectId: testProjectId, testCaseId: 'TC-AUTH-101' },
      },
      {
        projectId: testProjectId,
        userId: testUserId,
      },
    );

    assert.equal(testGetResult.success, true);
    assert.equal(testGetResult.toolId, 'tests.get');
    assert.equal((testGetResult.output as any).testKey, 'TC-AUTH-101');
  });

  // ============================================================================
  // Test 12: Input Validation Rejection
  // ============================================================================
  it('should reject malformed inputs and invalid UUIDs', async () => {
    // Missing projectId
    await assert.rejects(
      async () =>
        service.listRequirements({ projectId: '' } as any, testUserId),
      QualityIntelligenceValidationError,
    );

    // Invalid UUID format for projectId
    await assert.rejects(
      async () =>
        service.listRequirements({ projectId: 'not-a-uuid' } as any, testUserId),
      QualityIntelligenceValidationError,
    );

    // Empty search query
    await assert.rejects(
      async () =>
        service.searchRequirements(
          { projectId: testProjectId, query: '' },
          testUserId,
        ),
      QualityIntelligenceValidationError,
    );
  });
});
