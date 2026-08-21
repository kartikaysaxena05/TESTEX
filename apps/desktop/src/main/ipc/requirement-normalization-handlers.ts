/**
 * @file apps/desktop/src/main/ipc/requirement-normalization-handlers.ts
 * IPC handlers for requirement structured representation and normalization lifecycle.
 */

import { RequirementNormalizationService } from '@ai-quality/core';
import {
  normalizeRequirementSchema,
  getRequirementRepresentationSchema,
  updateRequirementRepresentationSchema,
  regenerateRequirementRepresentationSchema,
  batchNormalizeRequirementsSchema,
  type RequirementRepresentationDto,
  type BatchNormalizeRequirementsResultDto,
} from '@ai-quality/contracts';

let normalizationServiceInstance: RequirementNormalizationService | null = null;

function getNormalizationService(): RequirementNormalizationService {
  if (!normalizationServiceInstance) {
    normalizationServiceInstance = new RequirementNormalizationService();
  }
  return normalizationServiceInstance;
}

export async function handleNormalizeRequirement(
  payload: unknown,
  service: RequirementNormalizationService = getNormalizationService(),
): Promise<RequirementRepresentationDto> {
  const parsed = normalizeRequirementSchema.parse(payload);
  return await service.normalizeRequirement(parsed);
}

export async function handleGetRequirementRepresentation(
  payload: unknown,
  service: RequirementNormalizationService = getNormalizationService(),
): Promise<RequirementRepresentationDto | null> {
  const parsed = getRequirementRepresentationSchema.parse(payload);
  return await service.getRepresentation(parsed);
}

export async function handleUpdateRequirementRepresentation(
  payload: unknown,
  service: RequirementNormalizationService = getNormalizationService(),
): Promise<RequirementRepresentationDto> {
  const parsed = updateRequirementRepresentationSchema.parse(payload);
  return await service.updateRepresentation(parsed);
}

export async function handleRegenerateRequirementRepresentation(
  payload: unknown,
  service: RequirementNormalizationService = getNormalizationService(),
): Promise<RequirementRepresentationDto> {
  const parsed = regenerateRequirementRepresentationSchema.parse(payload);
  return await service.regenerateRepresentation(parsed);
}

export async function handleBatchNormalizeRequirements(
  payload: unknown,
  service: RequirementNormalizationService = getNormalizationService(),
): Promise<BatchNormalizeRequirementsResultDto> {
  const parsed = batchNormalizeRequirementsSchema.parse(payload);
  return await service.batchNormalizeRequirements(parsed);
}
