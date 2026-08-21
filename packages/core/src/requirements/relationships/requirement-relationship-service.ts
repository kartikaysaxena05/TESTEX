/**
 * @file packages/core/src/requirements/relationships/requirement-relationship-service.ts
 * Domain orchestration service for Requirement ↔ Requirement relationships and dependency graphs.
 */

import crypto from 'node:crypto';
import type {
  RequirementRelationshipDto,
  RelationshipGraphDto,
  RelationshipGraphNodeDto,
  RelationshipGraphEdgeDto,
  ProposeRelationshipsInput,
  ProposeRelationshipsResultDto,
  GetRelationshipsInput,
  GetRelationshipGraphInput,
  CreateManualRelationshipInput,
  ReviewRelationshipInput,
  DeleteRelationshipInput,
} from '@ai-quality/contracts';
import { getLogger } from '../../logging/logger.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../../projects/project-errors.js';
import { RequirementRepository } from '../requirement-repository.js';
import {
  RequirementNotFoundError,
  RelationshipNotFoundError,
  RelationshipAlreadyExistsError,
  SelfRelationshipError,
} from '../requirement-errors.js';
import {
  RequirementRelationshipRepository,
  type RelationshipWithRequirements,
} from './requirement-relationship-repository.js';
import { RequirementRelationshipAnalyzer } from './requirement-relationship-analyzer.js';
import type { RelationshipInputRequirement } from './relationship-types.js';

export class RequirementRelationshipService {
  constructor(
    private readonly relationshipRepository: RequirementRelationshipRepository = new RequirementRelationshipRepository(),
    private readonly requirementRepository: RequirementRepository = new RequirementRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
  ) {}

  /**
   * Deterministically proposes relationships for a project (or a specific requirement) and persists them.
   */
  async proposeRelationships(
    input: ProposeRelationshipsInput,
  ): Promise<ProposeRelationshipsResultDto> {
    const startTime = performance.now();
    const { projectId, requirementId } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError();
    }

    if (requirementId) {
      const targetReq = await this.requirementRepository.getRequirementById(
        projectId,
        requirementId,
      );
      if (!targetReq) {
        throw new RequirementNotFoundError(
          `Requirement ${requirementId} not found in project ${projectId}.`,
        );
      }
    }

    getLogger().info('requirement.propose_relationships_started', {
      projectId,
      requirementId: requirementId ?? 'ALL',
    });

    // 1. Fetch all requirements for the project
    const allRequirements = await this.requirementRepository.getRequirementsByProjectId(projectId);

    const inputReqs: RelationshipInputRequirement[] = allRequirements.map(r => {
      const sha256 = crypto.createHash('sha256').update(r.originalText, 'utf8').digest('hex');
      return {
        id: r.id,
        projectId: r.projectId,
        requirementKey: r.requirementKey,
        title: r.title,
        originalText: r.originalText,
        externalKey: r.provenance?.externalRequirementKey ?? null,
        sectionPath: r.provenance?.sectionPath ?? null,
        type: r.type,
        sha256,
      };
    });

    // 2. Run pure deterministic analyzer
    const analysis = RequirementRelationshipAnalyzer.analyzeRelationships(inputReqs, requirementId);

    // 3. Save proposed relationships atomically
    await this.relationshipRepository.saveProposedRelationships(
      projectId,
      analysis.proposedRelationships,
    );

    // 4. Retrieve stored relationships and evaluate cycles
    const storedRelations =
      await this.relationshipRepository.getRelationshipsByProjectId(projectId);

    const keyLookup = new Map<string, string>();
    for (const r of allRequirements) {
      keyLookup.set(r.id, r.requirementKey);
    }

    const cycles = RequirementRelationshipAnalyzer.detectCycles(
      storedRelations.map(rel => ({
        sourceRequirementId: rel.sourceRequirementId,
        targetRequirementId: rel.targetRequirementId,
        relationshipType: rel.relationshipType,
      })),
      keyLookup,
    );

    const currentReqMap = new Map<string, RelationshipInputRequirement>(
      inputReqs.map(r => [r.id, r]),
    );

    const resultDtos: RequirementRelationshipDto[] = storedRelations
      .filter(rel => {
        if (!requirementId) return true;
        return (
          rel.sourceRequirementId === requirementId || rel.targetRequirementId === requirementId
        );
      })
      .map(rel => this.mapToDto(rel, currentReqMap));

    const durationMs = Math.round(performance.now() - startTime);
    getLogger().info('requirement.propose_relationships_completed', {
      projectId,
      proposedCount: analysis.proposedRelationships.length,
      cycleCount: cycles.length,
      durationMs,
    });

    return {
      proposedCount: analysis.proposedRelationships.length,
      existingCount: storedRelations.length,
      unresolvedReferences: analysis.unresolvedReferences,
      relationships: resultDtos,
      cycles,
    };
  }

  /**
   * Retrieves relationships for a specific requirement.
   */
  async getRelationships(
    input: GetRelationshipsInput,
  ): Promise<readonly RequirementRelationshipDto[]> {
    const { projectId, requirementId } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!requirementId || typeof requirementId !== 'string') {
      throw new ProjectValidationError('Requirement ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    const requirement = await this.requirementRepository.getRequirementById(
      projectId,
      requirementId,
    );
    if (!requirement) {
      throw new RequirementNotFoundError(
        `Requirement ${requirementId} not found in project ${projectId}.`,
      );
    }

    const allRequirements = await this.requirementRepository.getRequirementsByProjectId(projectId);
    const reqMap = new Map<string, { sha256: string }>();
    for (const r of allRequirements) {
      const sha256 = crypto.createHash('sha256').update(r.originalText, 'utf8').digest('hex');
      reqMap.set(r.id, { sha256 });
    }

    const relations = await this.relationshipRepository.getRelationshipsForRequirement(
      projectId,
      requirementId,
    );

    return relations.map(rel => this.mapToDto(rel, reqMap));
  }

  /**
   * Retrieves full dependency graph for the project or surrounding neighborhood.
   */
  async getRelationshipGraph(input: GetRelationshipGraphInput): Promise<RelationshipGraphDto> {
    const { projectId, requirementId } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    const allRequirements = await this.requirementRepository.getRequirementsByProjectId(projectId);
    const storedRelations =
      await this.relationshipRepository.getRelationshipsByProjectId(projectId);

    const reqMap = new Map<string, { requirement: (typeof allRequirements)[0]; sha256: string }>();
    const keyLookup = new Map<string, string>();

    for (const r of allRequirements) {
      const sha256 = crypto.createHash('sha256').update(r.originalText, 'utf8').digest('hex');
      reqMap.set(r.id, { requirement: r, sha256 });
      keyLookup.set(r.id, r.requirementKey);
    }

    // Filter by neighborhood if requirementId is specified
    let filteredRelations = storedRelations;
    let relevantNodeIds = new Set<string>();

    if (requirementId) {
      relevantNodeIds.add(requirementId);
      for (const rel of storedRelations) {
        if (
          rel.sourceRequirementId === requirementId ||
          rel.targetRequirementId === requirementId
        ) {
          relevantNodeIds.add(rel.sourceRequirementId);
          relevantNodeIds.add(rel.targetRequirementId);
        }
      }
      filteredRelations = storedRelations.filter(
        rel =>
          relevantNodeIds.has(rel.sourceRequirementId) &&
          relevantNodeIds.has(rel.targetRequirementId),
      );
    } else {
      relevantNodeIds = new Set(allRequirements.map(r => r.id));
    }

    const nodes: RelationshipGraphNodeDto[] = Array.from(relevantNodeIds)
      .map(id => reqMap.get(id)?.requirement)
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
      .map(r => ({
        id: r.id,
        requirementKey: r.requirementKey,
        title: r.title,
        type: r.type,
        status: r.status,
      }));

    let confirmedCount = 0;
    let proposedCount = 0;
    let staleCount = 0;

    const edges: RelationshipGraphEdgeDto[] = filteredRelations.map(rel => {
      const sourceInfo = reqMap.get(rel.sourceRequirementId);
      const targetInfo = reqMap.get(rel.targetRequirementId);
      const isStale =
        (sourceInfo && sourceInfo.sha256 !== rel.sourceRequirementTextSha256) ||
        (targetInfo && targetInfo.sha256 !== rel.targetRequirementTextSha256) ||
        false;

      if (rel.status === 'CONFIRMED') confirmedCount++;
      if (rel.status === 'PROPOSED') proposedCount++;
      if (isStale) staleCount++;

      return {
        id: rel.id,
        sourceRequirementId: rel.sourceRequirementId,
        targetRequirementId: rel.targetRequirementId,
        relationshipType: rel.relationshipType,
        status: rel.status,
        detectionMethod: rel.detectionMethod,
        isStale,
      };
    });

    const cycles = RequirementRelationshipAnalyzer.detectCycles(
      storedRelations.map(rel => ({
        sourceRequirementId: rel.sourceRequirementId,
        targetRequirementId: rel.targetRequirementId,
        relationshipType: rel.relationshipType,
      })),
      keyLookup,
    );

    return {
      projectId,
      nodes,
      edges,
      cycles,
      confirmedEdgeCount: confirmedCount,
      proposedEdgeCount: proposedCount,
      staleEdgeCount: staleCount,
    };
  }

  /**
   * Manually creates a confirmed requirement relationship.
   */
  async createManualRelationship(
    input: CreateManualRelationshipInput,
  ): Promise<RequirementRelationshipDto> {
    const {
      projectId,
      sourceRequirementId,
      targetRequirementId,
      relationshipType,
      reviewRationale,
    } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!sourceRequirementId || typeof sourceRequirementId !== 'string') {
      throw new ProjectValidationError('Source Requirement ID is required.');
    }
    if (!targetRequirementId || typeof targetRequirementId !== 'string') {
      throw new ProjectValidationError('Target Requirement ID is required.');
    }

    if (sourceRequirementId === targetRequirementId) {
      throw new SelfRelationshipError();
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError();
    }

    const sourceReq = await this.requirementRepository.getRequirementById(
      projectId,
      sourceRequirementId,
    );
    if (!sourceReq) {
      throw new RequirementNotFoundError(
        `Source requirement ${sourceRequirementId} not found in project ${projectId}.`,
      );
    }

    const targetReq = await this.requirementRepository.getRequirementById(
      projectId,
      targetRequirementId,
    );
    if (!targetReq) {
      throw new RequirementNotFoundError(
        `Target requirement ${targetRequirementId} not found in project ${projectId}.`,
      );
    }

    // Check if relationship already exists
    const existing = await this.relationshipRepository.getRelationshipByEdge(
      sourceRequirementId,
      targetRequirementId,
      relationshipType,
    );
    if (existing) {
      throw new RelationshipAlreadyExistsError();
    }

    const sourceSha = crypto
      .createHash('sha256')
      .update(sourceReq.originalText, 'utf8')
      .digest('hex');
    const targetSha = crypto
      .createHash('sha256')
      .update(targetReq.originalText, 'utf8')
      .digest('hex');

    const created = await this.relationshipRepository.createRelationship({
      projectId,
      sourceRequirementId,
      targetRequirementId,
      relationshipType,
      detectionMethod: 'MANUAL',
      status: 'CONFIRMED',
      reasonCodes: ['MANUALLY_SPECIFIED'],
      evidence: null,
      sourceRequirementTextSha256: sourceSha,
      targetRequirementTextSha256: targetSha,
      reviewRationale: reviewRationale ?? null,
    });

    getLogger().info('requirement.manual_relationship_created', {
      projectId,
      relationshipId: created.id,
      sourceKey: sourceReq.requirementKey,
      targetKey: targetReq.requirementKey,
      relationshipType,
    });

    const currentMap = new Map<string, { sha256: string }>([
      [sourceReq.id, { sha256: sourceSha }],
      [targetReq.id, { sha256: targetSha }],
    ]);

    return this.mapToDto(created, currentMap);
  }

  /**
   * Reviews an existing relationship (confirms or rejects it).
   */
  async reviewRelationship(input: ReviewRelationshipInput): Promise<RequirementRelationshipDto> {
    const { projectId, relationshipId, status, reviewRationale } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!relationshipId || typeof relationshipId !== 'string') {
      throw new ProjectValidationError('Relationship ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError();
    }

    const existing = await this.relationshipRepository.getRelationshipById(relationshipId);
    if (!existing || existing.projectId !== projectId) {
      throw new RelationshipNotFoundError();
    }

    const updated = await this.relationshipRepository.updateRelationshipReview(
      relationshipId,
      status,
      reviewRationale,
    );

    getLogger().info('requirement.relationship_reviewed', {
      projectId,
      relationshipId,
      status,
    });

    const sourceSha = crypto
      .createHash('sha256')
      .update(updated.sourceRequirement.originalText, 'utf8')
      .digest('hex');
    const targetSha = crypto
      .createHash('sha256')
      .update(updated.targetRequirement.originalText, 'utf8')
      .digest('hex');

    const currentMap = new Map<string, { sha256: string }>([
      [updated.sourceRequirementId, { sha256: sourceSha }],
      [updated.targetRequirementId, { sha256: targetSha }],
    ]);

    return this.mapToDto(updated, currentMap);
  }

  /**
   * Deletes a relationship record.
   */
  async deleteRelationship(input: DeleteRelationshipInput): Promise<{ readonly deleted: true }> {
    const { projectId, relationshipId } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!relationshipId || typeof relationshipId !== 'string') {
      throw new ProjectValidationError('Relationship ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError();
    }

    const existing = await this.relationshipRepository.getRelationshipById(relationshipId);
    if (!existing || existing.projectId !== projectId) {
      throw new RelationshipNotFoundError();
    }

    await this.relationshipRepository.deleteRelationship(relationshipId);

    getLogger().info('requirement.relationship_deleted', {
      projectId,
      relationshipId,
    });

    return { deleted: true };
  }

  /**
   * Maps a relationship database record to DTO with live staleness calculation.
   */
  private mapToDto(
    rel: RelationshipWithRequirements,
    reqMap: Map<string, { sha256: string }>,
  ): RequirementRelationshipDto {
    const sourceInfo = reqMap.get(rel.sourceRequirementId);
    const targetInfo = reqMap.get(rel.targetRequirementId);

    const isStale =
      (sourceInfo && sourceInfo.sha256 !== rel.sourceRequirementTextSha256) ||
      (targetInfo && targetInfo.sha256 !== rel.targetRequirementTextSha256) ||
      false;

    return {
      id: rel.id,
      projectId: rel.projectId,
      sourceRequirementId: rel.sourceRequirementId,
      sourceRequirementKey: rel.sourceRequirement.requirementKey,
      sourceRequirementTitle: rel.sourceRequirement.title,
      targetRequirementId: rel.targetRequirementId,
      targetRequirementKey: rel.targetRequirement.requirementKey,
      targetRequirementTitle: rel.targetRequirement.title,
      relationshipType: rel.relationshipType,
      detectionMethod: rel.detectionMethod,
      status: rel.status,
      reasonCodes: (Array.isArray(rel.reasonCodes) ? rel.reasonCodes : []) as string[],
      evidence: rel.evidence,
      sourceRequirementTextSha256: rel.sourceRequirementTextSha256,
      targetRequirementTextSha256: rel.targetRequirementTextSha256,
      analyzerVersion: rel.analyzerVersion,
      reviewRationale: rel.reviewRationale,
      isStale,
      createdAt: rel.createdAt.toISOString(),
      updatedAt: rel.updatedAt.toISOString(),
    };
  }
}
