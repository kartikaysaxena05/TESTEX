/**
 * @file packages/core/src/agent-tools/repair-patch/repair-patch-tool-definitions.ts
 * Tool definitions for V10 Phase 149 Repair / Patch Tool (`repair_patch`).
 */

import type {
  RepairPatchToolInputDto,
  RepairPatchToolOutputDto,
} from '@ai-quality/contracts';
import type { RegisteredToolDefinition, ToolExecutionContext } from '../agent-tool-definition.js';
import type { RepairPatchToolService } from './repair-patch-tool-service.js';

export function createRepairPatchToolDefinitions(
  service: RepairPatchToolService,
): readonly RegisteredToolDefinition<any, any>[] {
  const tool: RegisteredToolDefinition<RepairPatchToolInputDto, RepairPatchToolOutputDto> = {
    toolId: 'repair_patch',
    name: 'repair_patch',
    description:
      'Creates safe, reviewable source-code patch proposals for confirmed failures and defects. Enforces strict containment and sandbox safety bounds. Does NOT directly modify working tree; transitions proposal to WAITING_FOR_APPROVAL.',
    version: '1.0.0',
    category: 'DEFECTS',
    permissionLevel: 'READ',
    enabled: true,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        taskId: { type: 'string', format: 'uuid' },
        failureId: { type: 'string', format: 'uuid' },
        defectId: { type: 'string' },
        targetFiles: { type: 'array', items: { type: 'string' } },
        userGuidance: { type: 'string' },
        proposedChanges: { type: 'string' },
        reason: { type: 'string' },
        forceRegenerate: { type: 'boolean', default: false },
      },
      required: ['projectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        proposalId: { type: 'string', format: 'uuid' },
        projectId: { type: 'string', format: 'uuid' },
        taskId: { type: 'string', format: 'uuid' },
        failureId: { type: 'string', format: 'uuid' },
        defectId: { type: 'string' },
        targetFiles: { type: 'array', items: { type: 'string' } },
        primaryFilePath: { type: 'string' },
        primarySymbolName: { type: 'string' },
        proposedChanges: { type: 'string' },
        patch: { type: 'string' },
        reason: { type: 'string' },
        status: { type: 'string' },
        filesChangedCount: { type: 'integer' },
        linesAddedCount: { type: 'integer' },
        linesRemovedCount: { type: 'integer' },
        totalChangedLinesCount: { type: 'integer' },
        structuredEdits: { type: 'array' },
        isSyntacticallyValid: { type: 'boolean' },
        riskLevel: { type: 'string' },
        approvalId: { type: 'string', format: 'uuid' },
        auditId: { type: 'string' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: [
        'proposalId',
        'projectId',
        'failureId',
        'targetFiles',
        'primaryFilePath',
        'proposedChanges',
        'patch',
        'reason',
        'status',
        'filesChangedCount',
        'linesAddedCount',
        'linesRemovedCount',
        'totalChangedLinesCount',
        'structuredEdits',
        'isSyntacticallyValid',
        'riskLevel',
        'createdAt',
        'updatedAt',
      ],
    },
    handler: async (
      input: RepairPatchToolInputDto,
      context: ToolExecutionContext,
    ): Promise<RepairPatchToolOutputDto> => {
      return service.proposePatch(input, context.userId);
    },
  };

  return [tool];
}
