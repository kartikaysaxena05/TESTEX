/**
 * @file packages/core/src/agent-tools/playwright/playwright-execution-definitions.ts
 * RegisteredToolDefinitions for V10 Phase 147: Playwright Execution Tool.
 *
 * Exposes:
 * - playwright.execute
 * Category: 'TESTS'
 * Permission Level: 'EXECUTE'
 */

import {
  type PlaywrightExecuteInputDto,
  type PlaywrightExecuteOutputDto,
} from '@ai-quality/contracts';
import {
  type RegisteredToolDefinition,
  type ToolExecutionContext,
} from '../agent-tool-definition.js';
import { PlaywrightExecutionService } from './playwright-execution-service.js';

export function createPlaywrightToolDefinitions(
  service: PlaywrightExecutionService,
): readonly RegisteredToolDefinition<any, any>[] {
  const playwrightExecuteTool: RegisteredToolDefinition<
    PlaywrightExecuteInputDto,
    PlaywrightExecuteOutputDto
  > = {
    toolId: 'playwright.execute',
    name: 'playwright.execute',
    description:
      'Executes a real Playwright automated browser test run for an authorized test case in the project. Returns comprehensive execution results, step outcomes, evidence references, and failure classifications.',
    version: '1.0.0',
    category: 'TESTS',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid', description: 'The project UUID.' },
        testCaseId: {
          type: 'string',
          description: 'The test case UUID or test case key (e.g. TC-AUTH-001).',
        },
        taskId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional agent thread task UUID to associate execution lifecycle and progress.',
        },
        stepId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional agent execution step UUID.',
        },
        targetUrl: {
          type: 'string',
          format: 'uri',
          description: 'Optional target base URL for the test execution. Must use http or https.',
        },
        browserEngine: {
          type: 'string',
          enum: ['chromium', 'firefox', 'webkit'],
          default: 'chromium',
          description: 'Browser engine for Playwright execution.',
        },
        headless: {
          type: 'boolean',
          default: true,
          description: 'Whether to run browser in headless mode.',
        },
        timeoutMs: {
          type: 'number',
          default: 30000,
          minimum: 1000,
          maximum: 120000,
          description: 'Timeout in milliseconds for the overall test execution.',
        },
        retryCount: {
          type: 'number',
          default: 0,
          minimum: 0,
          maximum: 3,
          description: 'Number of retries allowed on failure.',
        },
        allowDestructive: {
          type: 'boolean',
          default: false,
          description: 'Whether destructive actions are allowed in non-production environments.',
        },
        environmentId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional project environment configuration UUID.',
        },
      },
      required: ['projectId', 'testCaseId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        executionId: { type: 'string', format: 'uuid' },
        testRunId: { type: 'string', format: 'uuid' },
        taskId: { type: 'string', format: 'uuid' },
        projectId: { type: 'string', format: 'uuid' },
        testCaseId: { type: 'string', format: 'uuid' },
        testCaseKey: { type: 'string' },
        testCaseTitle: { type: 'string' },
        status: { type: 'string', enum: ['PASSED', 'FAILED', 'CANCELLED'] },
        passed: { type: 'boolean' },
        durationMs: { type: 'number' },
        totalSteps: { type: 'number' },
        passedSteps: { type: 'number' },
        failedSteps: { type: 'number' },
        stepResults: { type: 'array' },
        failureClassification: { type: 'object' },
        evidence: { type: 'object' },
        summary: { type: 'string' },
      },
      required: [
        'executionId',
        'testRunId',
        'projectId',
        'testCaseId',
        'testCaseKey',
        'testCaseTitle',
        'status',
        'passed',
        'durationMs',
        'totalSteps',
        'passedSteps',
        'failedSteps',
        'stepResults',
        'evidence',
        'summary',
      ],
    },
    permissionLevel: 'EXECUTE',
    enabled: true,
    handler: async (
      input: PlaywrightExecuteInputDto,
      context: ToolExecutionContext,
    ): Promise<PlaywrightExecuteOutputDto> => {
      return service.execute(
        {
          ...input,
          projectId: context.projectId,
          taskId: context.taskId ?? input.taskId,
          stepId: context.stepId ?? input.stepId,
        },
        context.userId,
        context.signal,
      );
    },
  };

  return [playwrightExecuteTool] as const;
}
