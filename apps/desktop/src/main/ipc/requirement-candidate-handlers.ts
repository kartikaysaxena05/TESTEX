/**
 * @file apps/desktop/src/main/ipc/requirement-candidate-handlers.ts
 * IPC handlers for requirement candidate detection, listing, updating, status changes, and atomic import.
 */

import { RequirementCandidateService } from '@ai-quality/core';
import {
  detectRequirementCandidatesSchema,
  listRequirementCandidatesSchema,
  updateRequirementCandidateSchema,
  setRequirementCandidateStatusSchema,
  importApprovedCandidatesSchema,
  type RequirementCandidateDto,
  type RequirementCandidateListDto,
  type ImportCandidatesResultDto,
} from '@ai-quality/contracts';

let candidateServiceInstance: RequirementCandidateService | null = null;

function getCandidateService(): RequirementCandidateService {
  if (!candidateServiceInstance) {
    candidateServiceInstance = new RequirementCandidateService();
  }
  return candidateServiceInstance;
}

export async function handleDetectRequirementCandidates(
  payload: unknown,
  service: RequirementCandidateService = getCandidateService(),
): Promise<readonly RequirementCandidateDto[]> {
  const parsed = detectRequirementCandidatesSchema.parse(payload);
  return await service.detectCandidates(parsed);
}

export async function handleListRequirementCandidates(
  payload: unknown,
  service: RequirementCandidateService = getCandidateService(),
): Promise<RequirementCandidateListDto> {
  const parsed = listRequirementCandidatesSchema.parse(payload);
  return await service.listCandidates(parsed);
}

export async function handleUpdateRequirementCandidate(
  payload: unknown,
  service: RequirementCandidateService = getCandidateService(),
): Promise<RequirementCandidateDto> {
  const parsed = updateRequirementCandidateSchema.parse(payload);
  return await service.updateCandidate(parsed);
}

export async function handleSetRequirementCandidateStatus(
  payload: unknown,
  service: RequirementCandidateService = getCandidateService(),
): Promise<readonly RequirementCandidateDto[]> {
  const parsed = setRequirementCandidateStatusSchema.parse(payload);
  return await service.setCandidateStatus(parsed);
}

export async function handleImportApprovedCandidates(
  payload: unknown,
  service: RequirementCandidateService = getCandidateService(),
): Promise<ImportCandidatesResultDto> {
  const parsed = importApprovedCandidatesSchema.parse(payload);
  return await service.importApprovedCandidates(parsed);
}
