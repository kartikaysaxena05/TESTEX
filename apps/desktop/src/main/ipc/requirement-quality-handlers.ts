/**
 * @file apps/desktop/src/main/ipc/requirement-quality-handlers.ts
 * IPC handlers for requirement quality, testability, ambiguity, and clarification analysis.
 */

import { RequirementQualityService } from '@ai-quality/core';
import {
  analyzeRequirementQualitySchema,
  getRequirementQualityAnalysisSchema,
  reviewRequirementQualityFindingSchema,
  reanalyzeRequirementQualitySchema,
  batchAnalyzeRequirementQualitySchema,
  type RequirementQualityAnalysisDto,
  type RequirementQualityFindingDto,
  type BatchAnalyzeQualityResultDto,
} from '@ai-quality/contracts';

let qualityServiceInstance: RequirementQualityService | null = null;

function getQualityService(): RequirementQualityService {
  if (!qualityServiceInstance) {
    qualityServiceInstance = new RequirementQualityService();
  }
  return qualityServiceInstance;
}

export async function handleAnalyzeQuality(
  payload: unknown,
  service: RequirementQualityService = getQualityService(),
): Promise<RequirementQualityAnalysisDto> {
  const parsed = analyzeRequirementQualitySchema.parse(payload);
  return await service.analyzeQuality(parsed.projectId, parsed.requirementId);
}

export async function handleGetQualityAnalysis(
  payload: unknown,
  service: RequirementQualityService = getQualityService(),
): Promise<RequirementQualityAnalysisDto | null> {
  const parsed = getRequirementQualityAnalysisSchema.parse(payload);
  return await service.getQualityAnalysis(parsed.projectId, parsed.requirementId);
}

export async function handleReviewQualityFinding(
  payload: unknown,
  service: RequirementQualityService = getQualityService(),
): Promise<RequirementQualityFindingDto> {
  const parsed = reviewRequirementQualityFindingSchema.parse(payload);
  return await service.reviewQualityFinding(parsed);
}

export async function handleReanalyzeQuality(
  payload: unknown,
  service: RequirementQualityService = getQualityService(),
): Promise<RequirementQualityAnalysisDto> {
  const parsed = reanalyzeRequirementQualitySchema.parse(payload);
  return await service.reanalyzeQuality(parsed.projectId, parsed.requirementId);
}

export async function handleBatchAnalyzeQuality(
  payload: unknown,
  service: RequirementQualityService = getQualityService(),
): Promise<BatchAnalyzeQualityResultDto> {
  const parsed = batchAnalyzeRequirementQualitySchema.parse(payload);
  return await service.batchAnalyzeQuality(parsed.projectId, parsed.requirementIds);
}
