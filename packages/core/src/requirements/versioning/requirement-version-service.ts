/**
 * @file packages/core/src/requirements/versioning/requirement-version-service.ts
 * Domain service for managing Requirement Versions, optimistic concurrency, and history tracking.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import { ProjectService } from '../../projects/project-service.js';
import { getLogger } from '../../logging/index.js';
import {
  RequirementNotFoundError,
  RequirementVersionNotFoundError,
  RequirementVersionConflictError,
  InvalidVersionComparisonError,
} from '../requirement-errors.js';
import { RequirementVersionRepository } from './requirement-version-repository.js';
import { RequirementDiffEngine } from './requirement-diff-engine.js';
import { RequirementImpactService } from '../impact/requirement-impact-service.js';
import { RequirementRepository } from '../requirement-repository.js';
import type {
  GetRequirementHistoryInput,
  RequirementHistoryDto,
  GetRequirementVersionInput,
  RequirementVersionDto,
  CompareRequirementVersionsInput,
  RequirementDiffDto,
  UpdateRequirementVersionedInput,
  RestoreRequirementVersionInput,
  RequirementDto,
  RequirementChangeKind,
  RequirementType,
  RequirementPriority,
  RequirementStatus,
} from '@ai-quality/contracts';
import { DEFAULT_HISTORY_PAGE_SIZE, MAX_HISTORY_PAGE_SIZE } from './versioning-types.js';

export class RequirementVersionService {
  private readonly versionRepo: RequirementVersionRepository;
  private readonly requirementRepo: RequirementRepository;
  private readonly impactService: RequirementImpactService;
  private readonly projectService: ProjectService;

  constructor(
    versionRepo = new RequirementVersionRepository(),
    requirementRepo = new RequirementRepository(),
    impactService = new RequirementImpactService(),
    projectService = new ProjectService(),
  ) {
    this.versionRepo = versionRepo;
    this.requirementRepo = requirementRepo;
    this.impactService = impactService;
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
   * Retrieves the full or paginated version history for a requirement.
   */
  async getRequirementHistory(input: GetRequirementHistoryInput): Promise<RequirementHistoryDto> {
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

    // Auto-create baseline version 1 if no history exists yet
    await this.versionRepo.ensureBaselineVersion(requirement);

    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? DEFAULT_HISTORY_PAGE_SIZE, MAX_HISTORY_PAGE_SIZE);

    const { versions, total } = await this.versionRepo.listVersions(
      input.requirementId,
      page,
      pageSize,
    );

    const latest = versions[0];
    const currentVersionNumber = latest ? latest.versionNumber : 1;

    return {
      requirementId: requirement.id,
      requirementKey: requirement.requirementKey,
      currentVersionNumber,
      totalVersions: total,
      versions: versions.map(v => this.versionRepo.toDto(v)),
    };
  }

  /**
   * Retrieves a single historical version.
   */
  async getRequirementVersion(
    input: GetRequirementVersionInput,
  ): Promise<RequirementVersionDto | null> {
    await this.projectService.getProject(input.projectId);

    const version = await this.versionRepo.findVersionByNumber(
      input.requirementId,
      input.versionNumber,
    );

    if (!version || version.projectId !== input.projectId) {
      return null;
    }

    return this.versionRepo.toDto(version);
  }

  /**
   * Deterministically compares two versions of the same requirement.
   */
  async compareVersions(input: CompareRequirementVersionsInput): Promise<RequirementDiffDto> {
    await this.projectService.getProject(input.projectId);

    const [sourceVersion, targetVersion] = await Promise.all([
      this.versionRepo.findVersionByNumber(input.requirementId, input.sourceVersionNumber),
      this.versionRepo.findVersionByNumber(input.requirementId, input.targetVersionNumber),
    ]);

    if (!sourceVersion || sourceVersion.projectId !== input.projectId) {
      throw new RequirementVersionNotFoundError(
        `Source version ${input.sourceVersionNumber} not found for requirement ${input.requirementId}`,
      );
    }

    if (!targetVersion || targetVersion.projectId !== input.projectId) {
      throw new RequirementVersionNotFoundError(
        `Target version ${input.targetVersionNumber} not found for requirement ${input.requirementId}`,
      );
    }

    if (sourceVersion.requirementId !== targetVersion.requirementId) {
      throw new InvalidVersionComparisonError(
        'Cannot compare versions from different requirements.',
      );
    }

    const sourceDto = this.versionRepo.toDto(sourceVersion);
    const targetDto = this.versionRepo.toDto(targetVersion);

    return RequirementDiffEngine.computeRequirementDiff(
      sourceDto,
      targetDto,
      input.sourceVersionNumber,
      input.targetVersionNumber,
    );
  }

  /**
   * Performs an atomic requirement update wrapped in optimistic concurrency validation
   * and immutable version creation.
   */
  async updateRequirementVersioned(
    input: UpdateRequirementVersionedInput,
  ): Promise<{ requirement: RequirementDto; version: RequirementVersionDto }> {
    const startTime = Date.now();
    await this.projectService.getProject(input.projectId);

    return await this.getPrisma().$transaction(async tx => {
      const requirement = await tx.requirement.findFirst({
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

      // Ensure baseline Version 1 exists
      await this.versionRepo.ensureBaselineVersion(requirement, tx);

      // Fetch latest version
      const latestVersion = await this.versionRepo.findLatestVersion(requirement.id, tx);
      if (!latestVersion) {
        throw new RequirementVersionNotFoundError(
          `Could not determine latest version for requirement ${requirement.id}`,
        );
      }

      // Optimistic concurrency check
      if (
        input.expectedVersionNumber !== undefined &&
        input.expectedVersionNumber !== latestVersion.versionNumber
      ) {
        throw new RequirementVersionConflictError(
          `Requirement was modified by another operation (expected version ${input.expectedVersionNumber}, current is ${latestVersion.versionNumber}).`,
        );
      }

      // Target field values
      const newTitle = input.title !== undefined ? input.title.trim() : requirement.title;
      const newOriginalText =
        input.originalText !== undefined ? input.originalText.trim() : requirement.originalText;
      const newType = input.type ?? (requirement.type as unknown as RequirementType);
      const newPriority =
        input.priority ?? (requirement.priority as unknown as RequirementPriority);
      const newStatus = input.status ?? (requirement.status as unknown as RequirementStatus);

      // Deterministic canonical hash
      const newContentSha256 = RequirementDiffEngine.computeCanonicalContentHash({
        title: newTitle,
        originalText: newOriginalText,
        type: newType,
        priority: newPriority,
        status: newStatus,
      });

      // No-op detection
      if (newContentSha256 === latestVersion.sourceRequirementTextSha256) {
        getLogger().info('requirement.update_noop', {
          projectId: input.projectId,
          requirementId: requirement.id,
          versionNumber: latestVersion.versionNumber,
        });

        return {
          requirement: this.requirementRepo.toDto(requirement),
          version: this.versionRepo.toDto(latestVersion),
        };
      }

      // Determine changed fields and change kinds
      const changedFields: string[] = [];
      const changeKinds: RequirementChangeKind[] = [];

      if (newTitle !== requirement.title) {
        changedFields.push('title');
        changeKinds.push('TITLE_CHANGED');
      }
      if (newOriginalText !== requirement.originalText) {
        changedFields.push('originalText');
        changeKinds.push('TEXT_CHANGED');
      }
      if (newType !== requirement.type) {
        changedFields.push('type');
        changeKinds.push('TYPE_CHANGED');
      }
      if (newPriority !== requirement.priority) {
        changedFields.push('priority');
        changeKinds.push('PRIORITY_CHANGED');
      }
      if (newStatus !== requirement.status) {
        changedFields.push('status');
        changeKinds.push('STATUS_CHANGED');
      }

      const changeKind: RequirementChangeKind =
        changeKinds.length > 1 ? 'MULTIPLE_FIELDS_CHANGED' : (changeKinds[0] ?? 'TEXT_CHANGED');

      // 1. Update the mutable Requirement row
      const updatedRequirement = await tx.requirement.update({
        where: { id: requirement.id },
        data: {
          title: newTitle,
          originalText: newOriginalText,
          type: newType,
          priority: newPriority,
          status: newStatus,
        },
      });

      // 2. Create the immutable RequirementVersion N+1
      const newVersionNumber = latestVersion.versionNumber + 1;
      const createdVersion = await this.versionRepo.createVersion(
        {
          projectId: requirement.projectId,
          requirementId: requirement.id,
          versionNumber: newVersionNumber,
          requirementKeySnapshot: requirement.requirementKey,
          title: newTitle,
          originalText: newOriginalText,
          type: newType,
          priority: newPriority,
          status: newStatus,
          sourceRequirementTextSha256: newContentSha256,
          changeKind,
          changeReason: input.changeReason ?? null,
          changedFields,
          createdByActorId: input.actorId ?? null,
        },
        tx,
      );

      // 3. Mark derived intelligence as STALE
      await this.invalidateDerivedIntelligence(requirement.id, newVersionNumber, tx);

      // 4. Generate change impact candidates for the new version
      await this.impactService.generateImpactsForVersion(
        {
          projectId: requirement.projectId,
          requirementId: requirement.id,
          requirementVersionId: createdVersion.id,
        },
        tx,
      );

      getLogger().info('requirement.version_created', {
        projectId: input.projectId,
        requirementId: requirement.id,
        versionNumber: newVersionNumber,
        changeKind,
        changedFields,
        durationMs: Date.now() - startTime,
      });

      return {
        requirement: this.requirementRepo.toDto(updatedRequirement),
        version: this.versionRepo.toDto(createdVersion),
      };
    });
  }

  /**
   * Restores an older requirement version by creating a brand-new immutable version
   * with the historical content (never mutating history).
   */
  async restoreRequirementVersion(
    input: RestoreRequirementVersionInput,
  ): Promise<{ requirement: RequirementDto; newVersion: RequirementVersionDto }> {
    await this.projectService.getProject(input.projectId);

    return await this.getPrisma().$transaction(async tx => {
      const requirement = await tx.requirement.findFirst({
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

      // Target version to restore
      const targetVersion = await this.versionRepo.findVersionByNumber(
        requirement.id,
        input.versionNumberToRestore,
        tx,
      );

      if (!targetVersion || targetVersion.projectId !== input.projectId) {
        throw new RequirementVersionNotFoundError(
          `Version ${input.versionNumberToRestore} not found for requirement ${requirement.id}`,
        );
      }

      // Fetch current latest version
      const latestVersion = await this.versionRepo.findLatestVersion(requirement.id, tx);
      if (!latestVersion) {
        throw new RequirementVersionNotFoundError(
          `Could not determine latest version for requirement ${requirement.id}`,
        );
      }

      // Concurrency check on current latest
      if (
        input.expectedCurrentVersionNumber !== undefined &&
        input.expectedCurrentVersionNumber !== latestVersion.versionNumber
      ) {
        throw new RequirementVersionConflictError(
          `Requirement was modified by another operation (expected version ${input.expectedCurrentVersionNumber}, current is ${latestVersion.versionNumber}).`,
        );
      }

      const restoreReason =
        input.restoreReason ?? `Restored from version ${targetVersion.versionNumber}`;

      // Update Requirement row with target version's content
      const updatedRequirement = await tx.requirement.update({
        where: { id: requirement.id },
        data: {
          title: targetVersion.title,
          originalText: targetVersion.originalText,
          type: targetVersion.type,
          priority: targetVersion.priority,
          status: targetVersion.status,
        },
      });

      // Create new Version N+1
      const newVersionNumber = latestVersion.versionNumber + 1;
      const createdVersion = await this.versionRepo.createVersion(
        {
          projectId: requirement.projectId,
          requirementId: requirement.id,
          versionNumber: newVersionNumber,
          requirementKeySnapshot: requirement.requirementKey,
          title: targetVersion.title,
          originalText: targetVersion.originalText,
          type: targetVersion.type as unknown as RequirementType,
          priority: targetVersion.priority as unknown as RequirementPriority,
          status: targetVersion.status as unknown as RequirementStatus,
          sourceRequirementTextSha256: targetVersion.sourceRequirementTextSha256,
          changeKind: 'RESTORED_VERSION',
          changeReason: restoreReason,
          changedFields: ['title', 'originalText', 'type', 'priority', 'status'],
          createdByActorId: input.actorId ?? null,
        },
        tx,
      );

      // Invalidate derived caches & generate impact
      await this.invalidateDerivedIntelligence(requirement.id, newVersionNumber, tx);
      await this.impactService.generateImpactsForVersion(
        {
          projectId: requirement.projectId,
          requirementId: requirement.id,
          requirementVersionId: createdVersion.id,
        },
        tx,
      );

      getLogger().info('requirement.version_restored', {
        projectId: input.projectId,
        requirementId: requirement.id,
        fromVersion: targetVersion.versionNumber,
        newVersionNumber,
      });

      return {
        requirement: this.requirementRepo.toDto(updatedRequirement),
        newVersion: this.versionRepo.toDto(createdVersion),
      };
    });
  }

  /**
   * Helper to invalidate derived caches and traces for a requirement when its version advances.
   */
  private async invalidateDerivedIntelligence(
    requirementId: string,
    newVersionNumber: number,
    tx: Parameters<Parameters<ReturnType<typeof this.getPrisma>['$transaction']>[0]>[0],
  ): Promise<void> {
    // 1. Mark Phase 37 representation STALE
    await tx.requirementRepresentation.updateMany({
      where: { requirementId },
      data: { normalizationStatus: 'STALE' },
    });

    // 2. Mark Phase 54 Requirement Test Traces STALE
    await tx.requirementTestTrace.updateMany({
      where: {
        requirementId,
        requirementVersionNumber: { lt: newVersionNumber },
      },
      data: {
        status: 'STALE',
        staleReason: 'REQUIREMENT_VERSION_ADVANCED',
      },
    });
  }
}
