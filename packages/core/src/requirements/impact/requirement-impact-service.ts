/**
 * @file packages/core/src/requirements/impact/requirement-impact-service.ts
 * Domain service for managing and analyzing Requirement Change Impact candidates.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import { ProjectService } from '../../projects/project-service.js';
import { getLogger } from '../../logging/index.js';
import {
  RequirementNotFoundError,
  RequirementImpactNotFoundError,
  RequirementVersionNotFoundError,
} from '../requirement-errors.js';
import { RequirementImpactRepository } from './requirement-impact-repository.js';
import { RequirementImpactAnalyzer } from './requirement-impact-analyzer.js';
import type {
  GetRequirementChangeImpactInput,
  RequirementImpactsResultDto,
  ReviewRequirementImpactInput,
  RequirementImpactCandidateDto,
} from '@ai-quality/contracts';
import type { Prisma } from '@prisma/client';

export class RequirementImpactService {
  private readonly impactRepo: RequirementImpactRepository;
  private readonly projectService: ProjectService;

  constructor(
    impactRepo = new RequirementImpactRepository(),
    projectService = new ProjectService(),
  ) {
    this.impactRepo = impactRepo;
    this.projectService = projectService;
  }

  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new DatabaseError('Database client is not available.', 'UNAVAILABLE');
    }
    return prisma;
  }

  /**
   * Automatically generates and persists impact candidate records for a newly created version.
   */
  async generateImpactsForVersion(
    input: {
      projectId: string;
      requirementId: string;
      requirementVersionId: string;
      maxDepth?: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<RequirementImpactCandidateDto[]> {
    const startTime = Date.now();
    const client = tx ?? this.getPrisma();

    getLogger().info('requirement.impact_analysis_started', {
      projectId: input.projectId,
      requirementId: input.requirementId,
      requirementVersionId: input.requirementVersionId,
    });

    // Fetch all project relationships and linked repository evidence
    const [allRelationships, allEvidence] = await Promise.all([
      client.requirementRelationship.findMany({
        where: { projectId: input.projectId },
      }),
      client.requirementRepositoryEvidence.findMany({
        where: {
          projectId: input.projectId,
          requirementId: input.requirementId,
        },
      }),
    ]);

    // Deterministically compute candidates
    const drafts = RequirementImpactAnalyzer.analyzeImpact({
      projectId: input.projectId,
      requirementId: input.requirementId,
      requirementVersionId: input.requirementVersionId,
      allRelationships,
      allEvidence,
      maxDepth: input.maxDepth,
    });

    // Persist candidates
    await this.impactRepo.createImpacts(drafts, tx);

    // Reload with relations for DTO
    const persisted = await this.impactRepo.findImpactsByVersion(input.requirementVersionId);
    const dtos = persisted.map(item => this.impactRepo.toDto(item));

    getLogger().info('requirement.impact_analysis_completed', {
      projectId: input.projectId,
      requirementId: input.requirementId,
      requirementVersionId: input.requirementVersionId,
      candidateCount: dtos.length,
      durationMs: Date.now() - startTime,
    });

    return dtos;
  }

  /**
   * Retrieves change impact candidates for a requirement (defaulting to latest version).
   */
  async getChangeImpact(
    input: GetRequirementChangeImpactInput,
  ): Promise<RequirementImpactsResultDto> {
    await this.projectService.getProject(input.projectId);

    const requirement = await this.getPrisma().requirement.findFirst({
      where: {
        id: input.requirementId,
        projectId: input.projectId,
      },
    });

    if (!requirement) {
      throw new RequirementNotFoundError(
        `Requirement ${input.requirementId} not found in project ${input.projectId}`,
      );
    }

    // Find requested version or latest version
    const version = input.versionNumber
      ? await this.getPrisma().requirementVersion.findUnique({
          where: {
            requirementId_versionNumber: {
              requirementId: input.requirementId,
              versionNumber: input.versionNumber,
            },
          },
        })
      : await this.getPrisma().requirementVersion.findFirst({
          where: { requirementId: input.requirementId },
          orderBy: { versionNumber: 'desc' },
        });

    if (!version) {
      throw new RequirementVersionNotFoundError(
        `Requirement version not found for requirement ${input.requirementId}`,
      );
    }

    // Check if impact records already exist for this version; if not, generate them
    let impacts = await this.impactRepo.findImpactsByVersion(version.id);
    if (impacts.length === 0) {
      await this.generateImpactsForVersion({
        projectId: input.projectId,
        requirementId: input.requirementId,
        requirementVersionId: version.id,
        maxDepth: input.maxDepth,
      });
      impacts = await this.impactRepo.findImpactsByVersion(version.id);
    }

    const candidates = impacts.map(item => this.impactRepo.toDto(item));
    const openCount = candidates.filter(c => c.status === 'OPEN').length;

    return {
      requirementId: requirement.id,
      requirementVersionId: version.id,
      versionNumber: version.versionNumber,
      totalCandidates: candidates.length,
      openCount,
      candidates,
    };
  }

  /**
   * Updates human review decision on an impact candidate.
   */
  async reviewChangeImpact(
    input: ReviewRequirementImpactInput,
  ): Promise<RequirementImpactCandidateDto> {
    await this.projectService.getProject(input.projectId);

    const existing = await this.impactRepo.findImpactById(input.impactId);
    if (!existing || existing.projectId !== input.projectId) {
      throw new RequirementImpactNotFoundError(
        `Impact candidate ${input.impactId} not found in project ${input.projectId}`,
      );
    }

    const updated = await this.impactRepo.updateImpactReview(
      input.impactId,
      input.status,
      input.reviewRationale,
    );

    getLogger().info('requirement.impact_review_updated', {
      projectId: input.projectId,
      impactId: input.impactId,
      status: input.status,
    });

    return this.impactRepo.toDto(updated);
  }
}
