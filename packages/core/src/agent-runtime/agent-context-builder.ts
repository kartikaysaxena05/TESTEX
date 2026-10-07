/**
 * @file packages/core/src/agent-runtime/agent-context-builder.ts
 * Context builder for V10 Phase 141 Agent Runtime.
 * Assembles execution context from available project information, requirement/test data,
 * and conversation history without hallucinating missing data.
 */

import type { PrismaClient } from '@prisma/client';
import type { CreateAgentRuntimeTaskInputDto } from '@ai-quality/contracts';
import type { RequirementTestContextAdapter } from '../ai-provider/requirement-test-context-adapter.js';

export interface AgentContextSnapshot {
  systemPrompt: string;
  assembledPrompt: string;
  projectMetadata: {
    projectId: string;
    projectName?: string;
  };
  requirementCount: number;
  testCaseCount: number;
}

export class AgentContextBuilder {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly requirementTestContextAdapter?: RequirementTestContextAdapter,
  ) {}

  public async buildContext(
    input: CreateAgentRuntimeTaskInputDto,
  ): Promise<AgentContextSnapshot> {
    // 1. Fetch real project record
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, name: true },
    });

    const projectName = project?.name ?? 'Unknown Project';

    // 2. Fetch requirement & test context if adapter is available
    let requirementSummary = '';
    let testSummary = '';
    let reqCount = 0;
    let testCount = 0;

    if (
      this.requirementTestContextAdapter &&
      input.contextPayload &&
      (input.contextPayload.requirementIds?.length || input.contextPayload.testCaseIds?.length)
    ) {
      try {
        const assembled = await this.requirementTestContextAdapter.assembleContext({
          projectId: input.projectId,
          requirementIds: input.contextPayload.requirementIds,
          testCaseIds: input.contextPayload.testCaseIds,
          maxTokens: 2000,
        });
        requirementSummary = assembled.formattedRequirementContext || '';
        testSummary = assembled.formattedTestContext || '';
        reqCount = assembled.requirements.length;
        testCount = assembled.testCases.length;
      } catch {
        // Fallback gracefully without inventing data
      }
    }

    // 3. Assemble System Prompt
    const systemPrompt = [
      'You are the autonomous software quality agent runtime.',
      `Target Project: ${projectName} (${input.projectId}).`,
      'When completing user requests, formulate concise action steps.',
      'If you need to invoke a tool, respond with valid JSON: {"tool": "<tool_name>", "arguments": { ... }} or {"action": "FINISH", "output": "<final answer>"}.',
      'Never attempt arbitrary shell commands or unauthorized modifications.',
    ].join('\n');

    // 4. Assemble User & Context Prompt
    const promptParts: string[] = [];

    if (requirementSummary) {
      promptParts.push(`### Requirements Context:\n${requirementSummary}\n`);
    }
    if (testSummary) {
      promptParts.push(`### Tests Context:\n${testSummary}\n`);
    }
    if (input.contextPayload?.repositoryPath) {
      promptParts.push(`### Repository Target: ${input.contextPayload.repositoryPath}\n`);
    }
    if (input.contextPayload?.priorMessages && input.contextPayload.priorMessages.length > 0) {
      promptParts.push('### Prior Messages:');
      for (const m of input.contextPayload.priorMessages) {
        promptParts.push(`[${m.role.toUpperCase()}]: ${m.content}`);
      }
      promptParts.push('');
    }

    promptParts.push(`### User Request:\n${input.userRequest}`);

    const assembledPrompt = promptParts.join('\n');

    return {
      systemPrompt,
      assembledPrompt,
      projectMetadata: {
        projectId: input.projectId,
        projectName,
      },
      requirementCount: reqCount,
      testCaseCount: testCount,
    };
  }
}
