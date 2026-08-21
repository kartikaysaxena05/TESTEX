/**
 * @file apps/desktop/src/main/ipc/requirement-version-handlers.ts
 * IPC handlers for Requirement Versioning, Diff, History, and Change Impact operations.
 */

import { RequirementVersionService, RequirementImpactService } from '@ai-quality/core';
import {
  getRequirementHistorySchema,
  getRequirementVersionSchema,
  compareRequirementVersionsSchema,
  updateRequirementVersionedSchema,
  restoreRequirementVersionSchema,
  getRequirementChangeImpactSchema,
  reviewRequirementImpactSchema,
  type RequirementHistoryDto,
  type RequirementVersionDto,
  type RequirementDiffDto,
  type RequirementDto,
  type RequirementImpactsResultDto,
  type RequirementImpactCandidateDto,
} from '@ai-quality/contracts';

let versionServiceInstance: RequirementVersionService | null = null;
let impactServiceInstance: RequirementImpactService | null = null;

function getVersionService(): RequirementVersionService {
  if (!versionServiceInstance) {
    versionServiceInstance = new RequirementVersionService();
  }
  return versionServiceInstance;
}

function getImpactService(): RequirementImpactService {
  if (!impactServiceInstance) {
    impactServiceInstance = new RequirementImpactService();
  }
  return impactServiceInstance;
}

export async function handleGetRequirementHistory(
  payload: unknown,
  service: RequirementVersionService = getVersionService(),
): Promise<RequirementHistoryDto> {
  const parsed = getRequirementHistorySchema.parse(payload);
  return await service.getRequirementHistory(parsed);
}

export async function handleGetRequirementVersion(
  payload: unknown,
  service: RequirementVersionService = getVersionService(),
): Promise<RequirementVersionDto | null> {
  const parsed = getRequirementVersionSchema.parse(payload);
  return await service.getRequirementVersion(parsed);
}

export async function handleCompareRequirementVersions(
  payload: unknown,
  service: RequirementVersionService = getVersionService(),
): Promise<RequirementDiffDto> {
  const parsed = compareRequirementVersionsSchema.parse(payload);
  return await service.compareVersions(parsed);
}

export async function handleUpdateRequirementVersioned(
  payload: unknown,
  service: RequirementVersionService = getVersionService(),
): Promise<{ readonly requirement: RequirementDto; readonly version: RequirementVersionDto }> {
  const parsed = updateRequirementVersionedSchema.parse(payload);
  return await service.updateRequirementVersioned(parsed);
}

export async function handleRestoreRequirementVersion(
  payload: unknown,
  service: RequirementVersionService = getVersionService(),
): Promise<{ readonly requirement: RequirementDto; readonly newVersion: RequirementVersionDto }> {
  const parsed = restoreRequirementVersionSchema.parse(payload);
  return await service.restoreRequirementVersion(parsed);
}

export async function handleGetRequirementChangeImpact(
  payload: unknown,
  service: RequirementImpactService = getImpactService(),
): Promise<RequirementImpactsResultDto> {
  const parsed = getRequirementChangeImpactSchema.parse(payload);
  return await service.getChangeImpact(parsed);
}

export async function handleReviewRequirementImpact(
  payload: unknown,
  service: RequirementImpactService = getImpactService(),
): Promise<RequirementImpactCandidateDto> {
  const parsed = reviewRequirementImpactSchema.parse(payload);
  return await service.reviewChangeImpact(parsed);
}
