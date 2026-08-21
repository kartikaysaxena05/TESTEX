/**
 * @file packages/core/src/requirements/classification/requirement-classification-service.ts
 * Domain service for managing requirement classification, metadata enrichment, staleness detection, and human review.
 */

import * as crypto from 'node:crypto';
import { RequirementClassifier } from './requirement-classifier.js';
import {
  RequirementMetadataRepository,
  type MetadataWithRequirement,
} from './requirement-metadata-repository.js';
import { RequirementRepository } from '../requirement-repository.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { RequirementRepresentationRepository } from '../normalization/requirement-representation-repository.js';
import { RequirementProvenanceRepository } from '../provenance/requirement-provenance-repository.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../../projects/project-errors.js';
import { RequirementNotFoundError, MetadataNotFoundError } from '../requirement-errors.js';
import type {
  RequirementMetadataDto,
  RequirementCategory,
  RequirementSubCategory,
  RequirementPriority,
  RequirementRiskLevel,
  RequirementCriticality,
  ClassificationMethod,
  ClassificationReviewStatus,
  ClassificationReasonCode,
  UpdateRequirementMetadataInput,
  BatchClassifyRequirementsResultDto,
  BatchClassifyItemResultDto,
} from '@ai-quality/contracts';
import { CLASSIFICATION_LIMITS } from './classification-types.js';

export class RequirementClassificationService {
  constructor(
    private readonly metadataRepo = new RequirementMetadataRepository(),
    private readonly requirementRepo = new RequirementRepository(),
    private readonly projectRepo = new ProjectRepository(),
    private readonly representationRepo = new RequirementRepresentationRepository(),
    private readonly provenanceRepo = new RequirementProvenanceRepository(),
  ) {}

  /**
   * Deterministically classifies a requirement and persists its metadata.
   */
  public async classifyRequirement(
    projectId: string,
    requirementId: string,
    options?: { force?: boolean },
  ): Promise<RequirementMetadataDto> {
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot classify requirements in an archived project.');
    }

    const requirement = await this.requirementRepo.getRequirementById(projectId, requirementId);
    if (!requirement) {
      throw new RequirementNotFoundError(
        `Requirement '${requirementId}' was not found in project '${projectId}'.`,
      );
    }

    const currentSha256 = crypto
      .createHash('sha256')
      .update(requirement.originalText)
      .digest('hex');

    // Check if metadata already exists and was human-reviewed
    const existing = await this.metadataRepo.findByRequirementId(projectId, requirementId);
    if (existing && existing.reviewStatus === 'REVIEWED' && !options?.force) {
      return this.mapToDto(existing, currentSha256);
    }

    // Load structured representation and provenance for context
    const structuredRep = await this.representationRepo.findByRequirementId(
      projectId,
      requirementId,
    );
    const provenance = await this.provenanceRepo.findByRequirementId(projectId, requirementId);

    // Run deterministic classifier
    const draft = RequirementClassifier.classify({
      originalText: requirement.originalText,
      structuredRepresentation: structuredRep
        ? (structuredRep as unknown as import('@ai-quality/contracts').RequirementRepresentationDto)
        : null,
      provenanceSectionPath: provenance?.sectionPath ?? null,
      existingPriority: (requirement.priority as unknown as RequirementPriority) ?? 'UNSPECIFIED',
    });

    const persisted = await this.metadataRepo.upsertMetadata({
      projectId,
      requirementId,
      category: draft.category,
      subCategory: draft.subCategory,
      domain: draft.domain,
      module: draft.module,
      businessCapability: draft.businessCapability,
      actors: draft.actors,
      securityRelevant: draft.securityRelevant,
      performanceRelevant: draft.performanceRelevant,
      complianceRelevant: draft.complianceRelevant,
      complianceStandards: draft.complianceStandards,
      priority: draft.priority,
      riskLevel: draft.riskLevel,
      criticality: draft.criticality,
      tags: draft.tags,
      classificationMethod: 'DETERMINISTIC',
      classifierVersion: draft.classifierVersion,
      reviewStatus: 'GENERATED',
      reasons: draft.reasons,
      sourceRequirementTextSha256: currentSha256,
    });

    return this.mapToDto(persisted, currentSha256);
  }

  /**
   * Retrieves metadata for a requirement with live staleness calculation.
   */
  public async getMetadata(
    projectId: string,
    requirementId: string,
  ): Promise<RequirementMetadataDto | null> {
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    }

    const requirement = await this.requirementRepo.getRequirementById(projectId, requirementId);
    if (!requirement) {
      throw new RequirementNotFoundError(
        `Requirement '${requirementId}' was not found in project '${projectId}'.`,
      );
    }

    const meta = await this.metadataRepo.findByRequirementId(projectId, requirementId);
    if (!meta) {
      return null;
    }

    const currentSha256 = crypto
      .createHash('sha256')
      .update(requirement.originalText)
      .digest('hex');

    return this.mapToDto(meta, currentSha256);
  }

  /**
   * Updates reviewed metadata fields and sets review status to 'REVIEWED'.
   */
  public async updateMetadata(
    input: UpdateRequirementMetadataInput,
  ): Promise<RequirementMetadataDto> {
    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${input.projectId}' was not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot update requirement metadata in an archived project.');
    }

    const requirement = await this.requirementRepo.getRequirementById(
      input.projectId,
      input.requirementId,
    );
    if (!requirement) {
      throw new RequirementNotFoundError(
        `Requirement '${input.requirementId}' was not found in project '${input.projectId}'.`,
      );
    }

    const existing = await this.metadataRepo.findByRequirementId(
      input.projectId,
      input.requirementId,
    );
    if (!existing) {
      throw new MetadataNotFoundError(
        `Requirement metadata for requirement '${input.requirementId}' was not found. Please classify it first.`,
      );
    }

    const currentSha256 = crypto
      .createHash('sha256')
      .update(requirement.originalText)
      .digest('hex');

    const updated = await this.metadataRepo.updateMetadata(input.projectId, input.requirementId, {
      category: input.category,
      subCategory: input.subCategory,
      domain: input.domain,
      module: input.module,
      businessCapability: input.businessCapability,
      actors: input.actors,
      securityRelevant: input.securityRelevant,
      performanceRelevant: input.performanceRelevant,
      complianceRelevant: input.complianceRelevant,
      complianceStandards: input.complianceStandards,
      priority: input.priority,
      riskLevel: input.riskLevel,
      criticality: input.criticality,
      tags: input.tags,
      classificationMethod: 'DETERMINISTIC_REVIEWED',
      reviewStatus: 'REVIEWED',
    });

    return this.mapToDto(updated, currentSha256);
  }

  /**
   * Forces regeneration of metadata, even if previously reviewed.
   */
  public async regenerateMetadata(
    projectId: string,
    requirementId: string,
  ): Promise<RequirementMetadataDto> {
    return this.classifyRequirement(projectId, requirementId, { force: true });
  }

  /**
   * Bounded batch classification with per-item isolation.
   */
  public async batchClassifyRequirements(
    projectId: string,
    requirementIds: readonly string[],
  ): Promise<BatchClassifyRequirementsResultDto> {
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot classify requirements in an archived project.');
    }

    const boundedIds = requirementIds.slice(0, CLASSIFICATION_LIMITS.MAX_BATCH_SIZE);
    const results: BatchClassifyItemResultDto[] = [];
    let classifiedCount = 0;
    let failedCount = 0;

    for (const reqId of boundedIds) {
      try {
        const metadata = await this.classifyRequirement(projectId, reqId);
        results.push({
          requirementId: reqId,
          requirementKey: metadata.requirementKey,
          success: true,
          metadata,
        });
        classifiedCount++;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown classification failure.';
        results.push({
          requirementId: reqId,
          success: false,
          error: errorMessage,
        });
        failedCount++;
      }
    }

    return {
      classifiedCount,
      failedCount,
      results,
    };
  }

  /**
   * Maps Prisma database entity to external DTO with live staleness calculation.
   */
  private mapToDto(entity: MetadataWithRequirement, currentSha256: string): RequirementMetadataDto {
    const isStale = entity.sourceRequirementTextSha256 !== currentSha256;

    return {
      id: entity.id,
      projectId: entity.projectId,
      requirementId: entity.requirementId,
      requirementKey: entity.requirement.requirementKey,
      originalRequirementText: entity.requirement.originalText,
      category: entity.category as RequirementCategory,
      subCategory: entity.subCategory as RequirementSubCategory | null,
      domain: entity.domain,
      module: entity.module,
      businessCapability: entity.businessCapability,
      actors: (entity.actors as unknown as string[]) ?? [],
      securityRelevant: entity.securityRelevant,
      performanceRelevant: entity.performanceRelevant,
      complianceRelevant: entity.complianceRelevant,
      complianceStandards: (entity.complianceStandards as unknown as string[]) ?? [],
      priority: entity.priority as RequirementPriority,
      riskLevel: entity.riskLevel as RequirementRiskLevel,
      criticality: entity.criticality as RequirementCriticality,
      tags: (entity.tags as unknown as string[]) ?? [],
      classificationMethod: entity.classificationMethod as ClassificationMethod,
      classifierVersion: entity.classifierVersion,
      reviewStatus: entity.reviewStatus as ClassificationReviewStatus,
      reasons: (entity.reasons as unknown as ClassificationReasonCode[]) ?? [],
      sourceRequirementTextSha256: entity.sourceRequirementTextSha256,
      isStale,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
