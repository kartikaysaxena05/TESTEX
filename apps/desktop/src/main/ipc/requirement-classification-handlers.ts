/**
 * @file apps/desktop/src/main/ipc/requirement-classification-handlers.ts
 * IPC handlers for requirement classification and metadata enrichment lifecycle.
 */

import { RequirementClassificationService } from '@ai-quality/core';
import {
  classifyRequirementSchema,
  getRequirementMetadataSchema,
  updateRequirementMetadataSchema,
  regenerateRequirementMetadataSchema,
  batchClassifyRequirementsSchema,
  type RequirementMetadataDto,
  type BatchClassifyRequirementsResultDto,
} from '@ai-quality/contracts';

let classificationServiceInstance: RequirementClassificationService | null = null;

function getClassificationService(): RequirementClassificationService {
  if (!classificationServiceInstance) {
    classificationServiceInstance = new RequirementClassificationService();
  }
  return classificationServiceInstance;
}

export async function handleClassifyRequirement(
  payload: unknown,
  service: RequirementClassificationService = getClassificationService(),
): Promise<RequirementMetadataDto> {
  const parsed = classifyRequirementSchema.parse(payload);
  return await service.classifyRequirement(parsed.projectId, parsed.requirementId);
}

export async function handleGetRequirementMetadata(
  payload: unknown,
  service: RequirementClassificationService = getClassificationService(),
): Promise<RequirementMetadataDto | null> {
  const parsed = getRequirementMetadataSchema.parse(payload);
  return await service.getMetadata(parsed.projectId, parsed.requirementId);
}

export async function handleUpdateRequirementMetadata(
  payload: unknown,
  service: RequirementClassificationService = getClassificationService(),
): Promise<RequirementMetadataDto> {
  const parsed = updateRequirementMetadataSchema.parse(payload);
  return await service.updateMetadata(parsed);
}

export async function handleRegenerateRequirementMetadata(
  payload: unknown,
  service: RequirementClassificationService = getClassificationService(),
): Promise<RequirementMetadataDto> {
  const parsed = regenerateRequirementMetadataSchema.parse(payload);
  return await service.regenerateMetadata(parsed.projectId, parsed.requirementId);
}

export async function handleBatchClassifyRequirements(
  payload: unknown,
  service: RequirementClassificationService = getClassificationService(),
): Promise<BatchClassifyRequirementsResultDto> {
  const parsed = batchClassifyRequirementsSchema.parse(payload);
  return await service.batchClassifyRequirements(parsed.projectId, parsed.requirementIds);
}
