/**
 * @file apps/desktop/src/main/ipc/requirement-relationship-handlers.ts
 * IPC handlers for requirement relationship and dependency graph operations.
 */

import { RequirementRelationshipService } from '@ai-quality/core';
import {
  proposeRelationshipsSchema,
  getRelationshipsSchema,
  getRelationshipGraphSchema,
  createManualRelationshipSchema,
  reviewRelationshipSchema,
  deleteRelationshipSchema,
  type ProposeRelationshipsResultDto,
  type RequirementRelationshipDto,
  type RelationshipGraphDto,
} from '@ai-quality/contracts';

let relationshipServiceInstance: RequirementRelationshipService | null = null;

function getRelationshipService(): RequirementRelationshipService {
  if (!relationshipServiceInstance) {
    relationshipServiceInstance = new RequirementRelationshipService();
  }
  return relationshipServiceInstance;
}

export async function handleProposeRelationships(
  payload: unknown,
  service: RequirementRelationshipService = getRelationshipService(),
): Promise<ProposeRelationshipsResultDto> {
  const parsed = proposeRelationshipsSchema.parse(payload);
  return await service.proposeRelationships(parsed);
}

export async function handleGetRelationships(
  payload: unknown,
  service: RequirementRelationshipService = getRelationshipService(),
): Promise<readonly RequirementRelationshipDto[]> {
  const parsed = getRelationshipsSchema.parse(payload);
  return await service.getRelationships(parsed);
}

export async function handleGetRelationshipGraph(
  payload: unknown,
  service: RequirementRelationshipService = getRelationshipService(),
): Promise<RelationshipGraphDto> {
  const parsed = getRelationshipGraphSchema.parse(payload);
  return await service.getRelationshipGraph(parsed);
}

export async function handleCreateManualRelationship(
  payload: unknown,
  service: RequirementRelationshipService = getRelationshipService(),
): Promise<RequirementRelationshipDto> {
  const parsed = createManualRelationshipSchema.parse(payload);
  return await service.createManualRelationship(parsed);
}

export async function handleReviewRelationship(
  payload: unknown,
  service: RequirementRelationshipService = getRelationshipService(),
): Promise<RequirementRelationshipDto> {
  const parsed = reviewRelationshipSchema.parse(payload);
  return await service.reviewRelationship(parsed);
}

export async function handleDeleteRelationship(
  payload: unknown,
  service: RequirementRelationshipService = getRelationshipService(),
): Promise<{ readonly deleted: true }> {
  const parsed = deleteRelationshipSchema.parse(payload);
  return await service.deleteRelationship(parsed);
}
