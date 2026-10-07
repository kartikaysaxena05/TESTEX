/**
 * @file packages/core/src/agent-tools/failure-intelligence/failure-intelligence-tool-definitions.ts
 * Tool definitions for V10 Phase 148: Failure Intelligence Tool (failure_intelligence.analyze).
 *
 * Exposes failure_intelligence.analyze registered in Tool Registry (Phase 143),
 * with category 'DEFECTS' and permission level 'READ' (strictly read-only).
 */

import {
  type FailureIntelligenceAnalyzeInputDto,
  type FailureIntelligenceAnalyzeOutputDto,
} from '@ai-quality/contracts';
import {
  type RegisteredToolDefinition,
  type ToolExecutionContext,
} from '../agent-tool-definition.js';
import { FailureIntelligenceToolService } from './failure-intelligence-tool-service.js';

export function createFailureIntelligenceToolDefinitions(
  service: FailureIntelligenceToolService,
): readonly RegisteredToolDefinition<any, any>[] {
  const analyzeTool: RegisteredToolDefinition<
    FailureIntelligenceAnalyzeInputDto,
    FailureIntelligenceAnalyzeOutputDto
  > = {
    toolId: 'failure_intelligence.analyze',
    name: 'failure_intelligence.analyze',
    description:
      'Performs root-cause analysis and defect triage on a test failure using authoritative V6 failure intelligence.',
    version: '1.0.0',
    category: 'DEFECTS',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        taskId: { type: 'string', format: 'uuid' },
        executionId: { type: 'string', format: 'uuid' },
        failureId: { type: 'string', format: 'uuid' },
        options: {
          type: 'object',
          properties: {
            includeEvidenceDetails: { type: 'boolean', default: true },
            includeReproductionSummary: { type: 'boolean', default: true },
            includeRootCauseHypothesis: { type: 'boolean', default: true },
            includeDefectReport: { type: 'boolean', default: true },
            includeClustering: { type: 'boolean', default: true },
          },
        },
      },
      required: ['projectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        failureCaseId: { type: 'string', format: 'uuid' },
        projectId: { type: 'string', format: 'uuid' },
        executionId: { type: 'string', format: 'uuid' },
        testRunId: { type: 'string' },
        testCaseId: { type: 'string' },
        testCaseKey: { type: 'string' },
        testCaseTitle: { type: 'string' },
        requirementId: { type: 'string' },
        requirementKey: { type: 'string' },
        status: { type: 'string' },
        category: { type: 'string' },
        subcategory: { type: 'string' },
        classificationStatus: { type: 'string' },
        isApplicationDefect: { type: 'boolean' },
        isAutomationFailure: { type: 'boolean' },
        isEnvironmentFailure: { type: 'boolean' },
        isTestDataFailure: { type: 'boolean' },
        isFlaky: { type: 'boolean' },
        confidence: { type: 'number' },
        primaryRuleId: { type: 'string' },
        classificationRationale: { type: 'string' },
        rootCause: { type: 'object' },
        reproduction: { type: 'object' },
        evidence: { type: 'array' },
        defect: { type: 'object' },
        recommendedNextAction: { type: 'string' },
        summary: { type: 'string' },
      },
      required: [
        'failureCaseId',
        'projectId',
        'executionId',
        'status',
        'category',
        'classificationStatus',
        'isApplicationDefect',
        'isAutomationFailure',
        'isEnvironmentFailure',
        'isTestDataFailure',
        'confidence',
        'classificationRationale',
        'evidence',
        'recommendedNextAction',
        'summary',
      ],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: FailureIntelligenceAnalyzeInputDto, ctx: ToolExecutionContext) => {
      return service.analyze(input, ctx.userId);
    },
  };

  return [analyzeTool];
}
