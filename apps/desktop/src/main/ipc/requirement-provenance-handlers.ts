/**
 * @file apps/desktop/src/main/ipc/requirement-provenance-handlers.ts
 * IPC handlers for requirement source provenance and audit context retrieval.
 */

import { RequirementProvenanceService } from '@ai-quality/core';
import {
  getRequirementProvenanceSchema,
  getRequirementSourceContextSchema,
  type RequirementProvenanceDto,
  type RequirementSourceContextDto,
} from '@ai-quality/contracts';

let provenanceServiceInstance: RequirementProvenanceService | null = null;

function getProvenanceService(): RequirementProvenanceService {
  if (!provenanceServiceInstance) {
    provenanceServiceInstance = new RequirementProvenanceService();
  }
  return provenanceServiceInstance;
}

export async function handleGetRequirementProvenance(
  payload: unknown,
  service: RequirementProvenanceService = getProvenanceService(),
): Promise<RequirementProvenanceDto> {
  const parsed = getRequirementProvenanceSchema.parse(payload);
  return await service.getProvenance(parsed.projectId, parsed.requirementId);
}

export async function handleGetRequirementSourceContext(
  payload: unknown,
  service: RequirementProvenanceService = getProvenanceService(),
): Promise<RequirementSourceContextDto> {
  const parsed = getRequirementSourceContextSchema.parse(payload);
  return await service.getSourceContext(parsed.projectId, parsed.requirementId);
}
