/**
 * @file packages/core/src/agent-tools/quality-intelligence/quality-intelligence-definitions.ts
 * RegisteredToolDefinitions for V10 Phase 146: Requirement & Test Intelligence Tools.
 *
 * Tools:
 * - requirements.list
 * - requirements.get
 * - requirements.search
 * - tests.list
 * - tests.get
 * - tests.search
 * - tests.forRequirement
 * - traceability.get
 *
 * All tools are read-only (permissionLevel: 'READ').
 */

import {
  type ReqListRequirementsInputDto,
  type ReqListRequirementsOutputDto,
  type ReqGetRequirementInputDto,
  type ReqGetRequirementOutputDto,
  type ReqSearchRequirementsInputDto,
  type ReqSearchRequirementsOutputDto,
  type TestListTestsInputDto,
  type TestListTestsOutputDto,
  type TestGetTestInputDto,
  type TestGetTestOutputDto,
  type TestSearchTestsInputDto,
  type TestSearchTestsOutputDto,
  type TestForRequirementInputDto,
  type TestForRequirementOutputDto,
  type TraceabilityGetInputDto,
  type TraceabilityGetOutputDto,
} from '@ai-quality/contracts';
import {
  type RegisteredToolDefinition,
  type ToolExecutionContext,
} from '../agent-tool-definition.js';
import { QualityIntelligenceService } from './quality-intelligence-service.js';

export function createQualityIntelligenceToolDefinitions(
  service: QualityIntelligenceService,
): readonly RegisteredToolDefinition<any, any>[] {
  // 1. requirements.list
  const requirementsListTool: RegisteredToolDefinition<
    ReqListRequirementsInputDto,
    ReqListRequirementsOutputDto
  > = {
    toolId: 'requirements.list',
    name: 'requirements.list',
    description:
      'Lists functional and non-functional requirements for the authorized project with safe bounds and status filters.',
    version: '1.0.0',
    category: 'REQUIREMENTS',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        limit: { type: 'number', default: 20, minimum: 1, maximum: 100 },
        offset: { type: 'number', default: 0, minimum: 0 },
        status: { type: 'string' },
        type: { type: 'string' },
        priority: { type: 'string' },
      },
      required: ['projectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array' },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        truncated: { type: 'boolean' },
      },
      required: ['items', 'total', 'limit', 'offset', 'truncated'],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: ReqListRequirementsInputDto, ctx: ToolExecutionContext) => {
      return service.listRequirements(input, ctx.userId);
    },
  };

  // 2. requirements.get
  const requirementsGetTool: RegisteredToolDefinition<
    ReqGetRequirementInputDto,
    ReqGetRequirementOutputDto
  > = {
    toolId: 'requirements.get',
    name: 'requirements.get',
    description:
      'Retrieves complete requirement details, versions, source document provenance, and traced test count by ID or Key.',
    version: '1.0.0',
    category: 'REQUIREMENTS',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        requirementId: { type: 'string' },
      },
      required: ['projectId', 'requirementId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        requirementKey: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        type: { type: 'string' },
        priority: { type: 'string' },
        versionNumber: { type: 'number' },
        source: { type: 'object' },
        tags: { type: 'array' },
        tracedTestCount: { type: 'number' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: [
        'id',
        'requirementKey',
        'title',
        'description',
        'status',
        'type',
        'priority',
        'versionNumber',
        'tags',
        'tracedTestCount',
        'createdAt',
        'updatedAt',
      ],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: ReqGetRequirementInputDto, ctx: ToolExecutionContext) => {
      return service.getRequirement(input, ctx.userId);
    },
  };

  // 3. requirements.search
  const requirementsSearchTool: RegisteredToolDefinition<
    ReqSearchRequirementsInputDto,
    ReqSearchRequirementsOutputDto
  > = {
    toolId: 'requirements.search',
    name: 'requirements.search',
    description:
      'Performs text search across project requirements and returns matching snippets with surrounding context.',
    version: '1.0.0',
    category: 'REQUIREMENTS',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        query: { type: 'string', minLength: 1, maxLength: 500 },
        limit: { type: 'number', default: 10, minimum: 1, maximum: 50 },
        offset: { type: 'number', default: 0, minimum: 0 },
      },
      required: ['projectId', 'query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        items: { type: 'array' },
        total: { type: 'number' },
        truncated: { type: 'boolean' },
      },
      required: ['query', 'items', 'total', 'truncated'],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: ReqSearchRequirementsInputDto, ctx: ToolExecutionContext) => {
      return service.searchRequirements(input, ctx.userId);
    },
  };

  // 4. tests.list
  const testsListTool: RegisteredToolDefinition<
    TestListTestsInputDto,
    TestListTestsOutputDto
  > = {
    toolId: 'tests.list',
    name: 'tests.list',
    description:
      'Lists generated and approved test cases for the authorized project with safe pagination and filters.',
    version: '1.0.0',
    category: 'TESTS',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        limit: { type: 'number', default: 20, minimum: 1, maximum: 100 },
        offset: { type: 'number', default: 0, minimum: 0 },
        status: { type: 'string' },
        type: { type: 'string' },
        priority: { type: 'string' },
      },
      required: ['projectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array' },
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        truncated: { type: 'boolean' },
      },
      required: ['items', 'total', 'limit', 'offset', 'truncated'],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: TestListTestsInputDto, ctx: ToolExecutionContext) => {
      return service.listTests(input, ctx.userId);
    },
  };

  // 5. tests.get
  const testsGetTool: RegisteredToolDefinition<
    TestGetTestInputDto,
    TestGetTestOutputDto
  > = {
    toolId: 'tests.get',
    name: 'tests.get',
    description:
      'Retrieves a complete test case including steps, expected results, preconditions, and source requirement link by ID or Key.',
    version: '1.0.0',
    category: 'TESTS',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        testCaseId: { type: 'string' },
      },
      required: ['projectId', 'testCaseId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        testKey: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        type: { type: 'string' },
        priority: { type: 'string' },
        preconditions: { type: 'array' },
        steps: { type: 'array' },
        sourceRequirement: { type: 'object' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: [
        'id',
        'testKey',
        'title',
        'status',
        'type',
        'priority',
        'preconditions',
        'steps',
        'createdAt',
        'updatedAt',
      ],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: TestGetTestInputDto, ctx: ToolExecutionContext) => {
      return service.getTest(input, ctx.userId);
    },
  };

  // 6. tests.search
  const testsSearchTool: RegisteredToolDefinition<
    TestSearchTestsInputDto,
    TestSearchTestsOutputDto
  > = {
    toolId: 'tests.search',
    name: 'tests.search',
    description:
      'Performs text search across test cases (title, objective, description) and returns matching snippets.',
    version: '1.0.0',
    category: 'TESTS',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        query: { type: 'string', minLength: 1, maxLength: 500 },
        limit: { type: 'number', default: 10, minimum: 1, maximum: 50 },
        offset: { type: 'number', default: 0, minimum: 0 },
      },
      required: ['projectId', 'query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        items: { type: 'array' },
        total: { type: 'number' },
        truncated: { type: 'boolean' },
      },
      required: ['query', 'items', 'total', 'truncated'],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: TestSearchTestsInputDto, ctx: ToolExecutionContext) => {
      return service.searchTests(input, ctx.userId);
    },
  };

  // 7. tests.forRequirement
  const testsForRequirementTool: RegisteredToolDefinition<
    TestForRequirementInputDto,
    TestForRequirementOutputDto
  > = {
    toolId: 'tests.forRequirement',
    name: 'tests.forRequirement',
    description:
      'Retrieves all test cases traced to a specific requirement by requirement ID or Key.',
    version: '1.0.0',
    category: 'TESTS',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        requirementId: { type: 'string' },
        limit: { type: 'number', default: 20, minimum: 1, maximum: 50 },
        offset: { type: 'number', default: 0, minimum: 0 },
      },
      required: ['projectId', 'requirementId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        requirementId: { type: 'string' },
        requirementKey: { type: 'string' },
        requirementTitle: { type: 'string' },
        items: { type: 'array' },
        total: { type: 'number' },
        truncated: { type: 'boolean' },
      },
      required: [
        'requirementId',
        'requirementKey',
        'requirementTitle',
        'items',
        'total',
        'truncated',
      ],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: TestForRequirementInputDto, ctx: ToolExecutionContext) => {
      return service.getTestsForRequirement(input, ctx.userId);
    },
  };

  // 8. traceability.get
  const traceabilityGetTool: RegisteredToolDefinition<
    TraceabilityGetInputDto,
    TraceabilityGetOutputDto
  > = {
    toolId: 'traceability.get',
    name: 'traceability.get',
    description:
      'Retrieves requirement-to-test traceability matrix with coverage analysis, linked tests, and overall metrics.',
    version: '1.0.0',
    category: 'ANALYSIS',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        requirementId: { type: 'string' },
        limit: { type: 'number', default: 20, minimum: 1, maximum: 50 },
        offset: { type: 'number', default: 0, minimum: 0 },
      },
      required: ['projectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        items: { type: 'array' },
        total: { type: 'number' },
        coveredCount: { type: 'number' },
        uncoveredCount: { type: 'number' },
        overallCoveragePercentage: { type: 'number' },
        truncated: { type: 'boolean' },
      },
      required: [
        'projectId',
        'items',
        'total',
        'coveredCount',
        'uncoveredCount',
        'overallCoveragePercentage',
        'truncated',
      ],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: TraceabilityGetInputDto, ctx: ToolExecutionContext) => {
      return service.getTraceability(input, ctx.userId);
    },
  };

  return [
    requirementsListTool,
    requirementsGetTool,
    requirementsSearchTool,
    testsListTool,
    testsGetTool,
    testsSearchTool,
    testsForRequirementTool,
    traceabilityGetTool,
  ];
}
