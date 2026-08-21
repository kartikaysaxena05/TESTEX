/**
 * @file packages/core/src/requirements/normalization/requirement-normalization-service.ts
 * Domain service orchestrating structured requirement representation, normalization lifecycle,
 * human review, staleness detection, and bounded batch processing.
 */

import { createHash } from 'node:crypto';
import { getLogger } from '../../logging/index.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../../projects/project-errors.js';
import { RequirementRepository } from '../requirement-repository.js';
import { RequirementNotFoundError, RepresentationNotFoundError } from '../requirement-errors.js';
import {
  RequirementRepresentationRepository,
  type RepresentationWithRequirement,
} from './requirement-representation-repository.js';
import { RequirementNormalizer } from './requirement-normalizer.js';
import { NORMALIZATION_LIMITS } from './normalization-types.js';
import type {
  RequirementRepresentationDto,
  NormalizeRequirementInput,
  GetRequirementRepresentationInput,
  UpdateRequirementRepresentationInput,
  RegenerateRequirementRepresentationInput,
  BatchNormalizeRequirementsInput,
  BatchNormalizeRequirementsResultDto,
  BatchNormalizeItemResultDto,
  RequirementConditionDto,
  RequirementConstraintDto,
  RequirementQuantitativeValueDto,
  NormalizationWarningCode,
  RequirementModality,
  NormalizationStatus,
  NormalizationMethod,
  RepresentationReviewStatus,
} from '@ai-quality/contracts';

export class RequirementNormalizationService {
  private readonly projectRepo: ProjectRepository;
  private readonly requirementRepo: RequirementRepository;
  private readonly representationRepo: RequirementRepresentationRepository;

  constructor(
    projectRepo = new ProjectRepository(),
    requirementRepo = new RequirementRepository(),
    representationRepo = new RequirementRepresentationRepository(),
  ) {
    this.projectRepo = projectRepo;
    this.requirementRepo = requirementRepo;
    this.representationRepo = representationRepo;
  }

  /**
   * Normalizes a single requirement, creating or updating its structured representation.
   */
  public async normalizeRequirement(
    input: NormalizeRequirementInput,
    options: { force?: boolean } = {},
  ): Promise<RequirementRepresentationDto> {
    const { projectId, requirementId } = input;
    const logger = getLogger();

    // 1. Verify project exists and is active
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError(`Project '${projectId}' is archived.`);
    }

    // 2. Verify requirement exists and belongs to project
    const requirement = await this.requirementRepo.getRequirementById(projectId, requirementId);
    if (!requirement) {
      throw new RequirementNotFoundError(
        `Requirement '${requirementId}' was not found in project '${projectId}'.`,
      );
    }

    // 3. Check for existing representation & review protection
    const existing = await this.representationRepo.findByRequirementId(projectId, requirementId);

    if (existing && existing.reviewStatus === 'REVIEWED' && !options.force) {
      // Return existing reviewed representation without silent overwrite
      const currentSha256 = this.calculateSha256(requirement.originalText);
      return this.mapToDto(existing, currentSha256);
    }

    // 4. Run deterministic normalizer
    const startTime = Date.now();
    const draft = RequirementNormalizer.normalize(requirement.originalText);
    const sourceSha256 = this.calculateSha256(requirement.originalText);

    // 5. Persist representation atomically
    const representation = await this.representationRepo.upsertRepresentation({
      projectId,
      requirementId,
      normalizedText: draft.normalizedText,
      actor: draft.actor,
      modality: draft.modality,
      negated: draft.negated,
      action: draft.action,
      object: draft.object,
      conditions: draft.conditions,
      constraints: draft.constraints,
      quantitativeValues: draft.quantitativeValues,
      expectedOutcome: draft.expectedOutcome,
      sourceRequirementTextSha256: sourceSha256,
      normalizationStatus: 'NORMALIZED',
      normalizationMethod: 'DETERMINISTIC',
      normalizerVersion: draft.normalizerVersion,
      reviewStatus: 'GENERATED',
      warnings: draft.warnings,
    });

    const durationMs = Date.now() - startTime;
    logger.info('requirement.normalization_completed', {
      projectId,
      requirementId,
      normalizerVersion: draft.normalizerVersion,
      warningCount: draft.warnings.length,
      durationMs,
    });

    return this.mapToDto(representation, sourceSha256);
  }

  /**
   * Retrieves the structured representation for a requirement with staleness detection.
   */
  public async getRepresentation(
    input: GetRequirementRepresentationInput,
  ): Promise<RequirementRepresentationDto | null> {
    const { projectId, requirementId } = input;

    // Verify project exists
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    }

    const rep = await this.representationRepo.findByRequirementId(projectId, requirementId);
    if (!rep) {
      return null;
    }

    const currentRequirement = await this.requirementRepo.getRequirementById(
      projectId,
      requirementId,
    );
    if (!currentRequirement) {
      throw new RequirementNotFoundError(`Requirement '${requirementId}' was not found.`);
    }

    const currentSha256 = this.calculateSha256(currentRequirement.originalText);
    return this.mapToDto(rep, currentSha256);
  }

  /**
   * Manually updates specific fields in a structured representation.
   */
  public async updateRepresentation(
    input: UpdateRequirementRepresentationInput,
  ): Promise<RequirementRepresentationDto> {
    const { projectId, requirementId } = input;

    // Verify project exists and is active
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError(`Project '${projectId}' is archived.`);
    }

    const existing = await this.representationRepo.findByRequirementId(projectId, requirementId);
    if (!existing) {
      throw new RepresentationNotFoundError(
        `Representation for requirement '${requirementId}' was not found.`,
      );
    }

    const requirement = await this.requirementRepo.getRequirementById(projectId, requirementId);
    if (!requirement) {
      throw new RequirementNotFoundError(`Requirement '${requirementId}' was not found.`);
    }

    // Prepare updates
    const updates: {
      normalizedText?: string;
      actor?: string | null;
      modality?: RequirementModality;
      negated?: boolean;
      action?: string | null;
      object?: string | null;
      conditions?: readonly RequirementConditionDto[];
      constraints?: readonly RequirementConstraintDto[];
      quantitativeValues?: readonly RequirementQuantitativeValueDto[];
      expectedOutcome?: string | null;
      normalizationStatus?: NormalizationStatus;
      normalizationMethod?: NormalizationMethod;
      reviewStatus?: RepresentationReviewStatus;
    } = {
      normalizationStatus: 'REVIEWED',
      normalizationMethod: 'DETERMINISTIC_REVIEWED',
      reviewStatus: 'REVIEWED',
    };

    if (input.normalizedText !== undefined) updates.normalizedText = input.normalizedText;
    if (input.actor !== undefined) updates.actor = input.actor;
    if (input.modality !== undefined) updates.modality = input.modality;
    if (input.negated !== undefined) updates.negated = input.negated;
    if (input.action !== undefined) updates.action = input.action;
    if (input.object !== undefined) updates.object = input.object;
    if (input.conditions !== undefined) updates.conditions = input.conditions;
    if (input.constraints !== undefined) updates.constraints = input.constraints;
    if (input.quantitativeValues !== undefined)
      updates.quantitativeValues = input.quantitativeValues;
    if (input.expectedOutcome !== undefined) updates.expectedOutcome = input.expectedOutcome;

    const updated = await this.representationRepo.updateRepresentation(
      projectId,
      requirementId,
      updates,
    );

    const currentSha256 = this.calculateSha256(requirement.originalText);
    return this.mapToDto(updated, currentSha256);
  }

  /**
   * Regenerates structured representation deterministically, overriding manual reviews.
   */
  public async regenerateRepresentation(
    input: RegenerateRequirementRepresentationInput,
  ): Promise<RequirementRepresentationDto> {
    return this.normalizeRequirement(input, { force: true });
  }

  /**
   * Normalizes a bounded batch of requirements with per-item error isolation.
   */
  public async batchNormalizeRequirements(
    input: BatchNormalizeRequirementsInput,
  ): Promise<BatchNormalizeRequirementsResultDto> {
    const { projectId, requirementIds } = input;

    if (requirementIds.length > NORMALIZATION_LIMITS.MAX_BATCH_SIZE) {
      throw new Error(
        `Batch size exceeds maximum limit of ${NORMALIZATION_LIMITS.MAX_BATCH_SIZE}.`,
      );
    }

    const results: BatchNormalizeItemResultDto[] = [];
    let normalizedCount = 0;
    let failedCount = 0;

    for (const reqId of requirementIds) {
      try {
        const rep = await this.normalizeRequirement({
          projectId,
          requirementId: reqId,
        });
        results.push({
          requirementId: reqId,
          requirementKey: rep.requirementKey,
          success: true,
          representation: rep,
        });
        normalizedCount++;
      } catch (err) {
        results.push({
          requirementId: reqId,
          success: false,
          error: err instanceof Error ? err.message : 'Normalization failed.',
        });
        failedCount++;
      }
    }

    return {
      normalizedCount,
      failedCount,
      results,
    };
  }

  /**
   * Computes SHA-256 hash of requirement original text.
   */
  private calculateSha256(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  /**
   * Maps database representation entity to sanitized DTO with computed staleness.
   */
  private mapToDto(
    rep: RepresentationWithRequirement,
    currentSha256: string,
  ): RequirementRepresentationDto {
    const isStale = rep.sourceRequirementTextSha256 !== currentSha256;
    const normalizationStatus: NormalizationStatus = isStale
      ? 'STALE'
      : (rep.normalizationStatus as NormalizationStatus);

    return {
      id: rep.id,
      projectId: rep.projectId,
      requirementId: rep.requirementId,
      requirementKey: rep.requirement.requirementKey,
      originalRequirementText: rep.requirement.originalText,
      normalizedText: rep.normalizedText,
      actor: rep.actor,
      modality: rep.modality as RequirementModality,
      negated: rep.negated,
      action: rep.action,
      object: rep.object,
      conditions: (rep.conditions as unknown as RequirementConditionDto[]) || [],
      constraints: (rep.constraints as unknown as RequirementConstraintDto[]) || [],
      quantitativeValues:
        (rep.quantitativeValues as unknown as RequirementQuantitativeValueDto[]) || [],
      expectedOutcome: rep.expectedOutcome,
      sourceRequirementTextSha256: rep.sourceRequirementTextSha256,
      normalizationStatus,
      normalizationMethod: rep.normalizationMethod as NormalizationMethod,
      normalizerVersion: rep.normalizerVersion,
      reviewStatus: rep.reviewStatus as RepresentationReviewStatus,
      warnings: (rep.warnings as unknown as NormalizationWarningCode[]) || [],
      isStale,
      createdAt: rep.createdAt.toISOString(),
      updatedAt: rep.updatedAt.toISOString(),
    };
  }
}
