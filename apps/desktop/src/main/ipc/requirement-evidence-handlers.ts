/**
 * @file apps/desktop/src/main/ipc/requirement-evidence-handlers.ts
 * IPC handlers for repository evidence mapping, review, and preview operations.
 */

import { RequirementRepositoryEvidenceService } from '@ai-quality/core';
import {
  matchRepositoryEvidenceSchema,
  getRepositoryEvidenceSchema,
  reviewRepositoryEvidenceSchema,
  createManualRepositoryEvidenceSchema,
  deleteRepositoryEvidenceSchema,
  previewRepositoryEvidenceSchema,
  type MatchRepositoryEvidenceResultDto,
  type RequirementRepositoryEvidenceDto,
  type EvidencePreviewDto,
} from '@ai-quality/contracts';

let evidenceServiceInstance: RequirementRepositoryEvidenceService | null = null;

function getEvidenceService(): RequirementRepositoryEvidenceService {
  if (!evidenceServiceInstance) {
    evidenceServiceInstance = new RequirementRepositoryEvidenceService();
  }
  return evidenceServiceInstance;
}

export async function handleMatchRepositoryEvidence(
  payload: unknown,
  service: RequirementRepositoryEvidenceService = getEvidenceService(),
): Promise<MatchRepositoryEvidenceResultDto> {
  const parsed = matchRepositoryEvidenceSchema.parse(payload);
  return await service.matchRepositoryEvidence(parsed);
}

export async function handleGetRepositoryEvidence(
  payload: unknown,
  service: RequirementRepositoryEvidenceService = getEvidenceService(),
): Promise<readonly RequirementRepositoryEvidenceDto[]> {
  const parsed = getRepositoryEvidenceSchema.parse(payload);
  return await service.getRepositoryEvidence(parsed);
}

export async function handleReviewRepositoryEvidence(
  payload: unknown,
  service: RequirementRepositoryEvidenceService = getEvidenceService(),
): Promise<RequirementRepositoryEvidenceDto> {
  const parsed = reviewRepositoryEvidenceSchema.parse(payload);
  return await service.reviewRepositoryEvidence(parsed);
}

export async function handleCreateManualRepositoryEvidence(
  payload: unknown,
  service: RequirementRepositoryEvidenceService = getEvidenceService(),
): Promise<RequirementRepositoryEvidenceDto> {
  const parsed = createManualRepositoryEvidenceSchema.parse(payload);
  return await service.createManualRepositoryEvidence(parsed);
}

export async function handleDeleteRepositoryEvidence(
  payload: unknown,
  service: RequirementRepositoryEvidenceService = getEvidenceService(),
): Promise<{ readonly deleted: true }> {
  const parsed = deleteRepositoryEvidenceSchema.parse(payload);
  return await service.deleteRepositoryEvidence(parsed);
}

export async function handlePreviewRepositoryEvidence(
  payload: unknown,
  service: RequirementRepositoryEvidenceService = getEvidenceService(),
): Promise<EvidencePreviewDto> {
  const parsed = previewRepositoryEvidenceSchema.parse(payload);
  return await service.previewRepositoryEvidence(parsed);
}
