/**
 * @file apps/desktop/src/main/ipc/requirement-handlers.ts
 * IPC handlers for Requirement Intelligence and Requirement Source operations.
 */

import {
  projectIdSchema,
  listRequirementsSchema,
  getRequirementSchema,
  getRequirementByKeySchema,
  createRequirementSchema,
  updateRequirementSchema,
  activateRequirementSchema,
  deprecateRequirementSchema,
  draftRequirementSchema,
  archiveRequirementSchema,
  restoreRequirementSchema,
  deleteRequirementSchema,
  listRequirementSourcesSchema,
  getRequirementSourceSchema,
  parseBulkRequirementsSchema,
  importBulkRequirementsSchema,
  type RequirementDto,
  type RequirementSummaryDto,
  type RequirementSourceDto,
  type ParseBulkRequirementsResult,
  type ImportBulkRequirementsResult,
  type PaginatedResult,
} from '@ai-quality/contracts';
import { RequirementService, RequirementSourceService } from '@ai-quality/core';

export async function handleListRequirements(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<PaginatedResult<RequirementDto>> {
  const input = listRequirementsSchema.parse(rawInput);
  return await service.listRequirements(input);
}

export async function handleGetRequirement(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<RequirementDto | null> {
  const input = getRequirementSchema.parse(rawInput);
  return await service.getRequirement(input);
}

export async function handleGetRequirementByKey(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<RequirementDto | null> {
  const input = getRequirementByKeySchema.parse(rawInput);
  return await service.getRequirementByKey(input);
}

export async function handleGetRequirementSummary(
  rawProjectId: unknown,
  service: RequirementService = new RequirementService(),
): Promise<RequirementSummaryDto> {
  const projectId = projectIdSchema.parse(rawProjectId);
  return await service.getRequirementSummary(projectId);
}

export async function handleCreateRequirement(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<RequirementDto> {
  const input = createRequirementSchema.parse(rawInput);
  return await service.createRequirement(input);
}

export async function handleUpdateRequirement(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<RequirementDto> {
  const input = updateRequirementSchema.parse(rawInput);
  return await service.updateRequirement(input);
}

export async function handleActivateRequirement(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<RequirementDto> {
  const input = activateRequirementSchema.parse(rawInput);
  return await service.activateRequirement(input);
}

export async function handleDeprecateRequirement(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<RequirementDto> {
  const input = deprecateRequirementSchema.parse(rawInput);
  return await service.deprecateRequirement(input);
}

export async function handleDraftRequirement(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<RequirementDto> {
  const input = draftRequirementSchema.parse(rawInput);
  return await service.draftRequirement(input);
}

export async function handleArchiveRequirement(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<RequirementDto> {
  const input = archiveRequirementSchema.parse(rawInput);
  return await service.archiveRequirement(input);
}

export async function handleRestoreRequirement(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<RequirementDto> {
  const input = restoreRequirementSchema.parse(rawInput);
  return await service.restoreRequirement(input);
}

export async function handleDeleteRequirement(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<{ readonly deleted: true }> {
  const input = deleteRequirementSchema.parse(rawInput);
  return await service.deleteRequirement(input);
}

export async function handleListRequirementSources(
  rawInput: unknown,
  service: RequirementSourceService = new RequirementSourceService(),
): Promise<readonly RequirementSourceDto[]> {
  const input = listRequirementSourcesSchema.parse(rawInput);
  return await service.listSources(input);
}

export async function handleGetRequirementSource(
  rawInput: unknown,
  service: RequirementSourceService = new RequirementSourceService(),
): Promise<RequirementSourceDto | null> {
  const input = getRequirementSourceSchema.parse(rawInput);
  return await service.getSource(input);
}

export async function handleParseBulkRequirements(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<ParseBulkRequirementsResult> {
  const input = parseBulkRequirementsSchema.parse(rawInput);
  return await service.parseBulkRequirements(input);
}

export async function handleImportBulkRequirements(
  rawInput: unknown,
  service: RequirementService = new RequirementService(),
): Promise<ImportBulkRequirementsResult> {
  const input = importBulkRequirementsSchema.parse(rawInput);
  return await service.importBulkRequirements(input);
}
