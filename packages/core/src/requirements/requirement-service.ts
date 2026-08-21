/**
 * @file packages/core/src/requirements/requirement-service.ts
 * Domain service managing Requirement operations, business rules, lifecycle transitions, and project isolation.
 */

import type {
  RequirementDto,
  RequirementSummaryDto,
  RequirementStatus,
  ListRequirementsInput,
  GetRequirementInput,
  GetRequirementByKeyInput,
  CreateRequirementInput,
  UpdateRequirementInput,
  ActivateRequirementInput,
  DeprecateRequirementInput,
  DraftRequirementInput,
  ArchiveRequirementInput,
  RestoreRequirementInput,
  DeleteRequirementInput,
  ParseBulkRequirementsInput,
  ParseBulkRequirementsResult,
  ImportBulkRequirementsInput,
  ImportBulkRequirementsResult,
  PaginatedResult,
} from '@ai-quality/contracts';
import { getLogger } from '../logging/logger.js';
import { ProjectRepository } from '../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../projects/project-errors.js';
import { RequirementRepository, type RequirementWithSource } from './requirement-repository.js';
import { RequirementSourceRepository } from './requirement-source-repository.js';
import {
  RequirementNotFoundError,
  RequirementSourceNotFoundError,
  InvalidRequirementTransitionError,
} from './requirement-errors.js';
import { parseBulkRequirementsText } from './bulk-requirement-parser.js';

const ALLOWED_TRANSITIONS: Record<RequirementStatus, readonly RequirementStatus[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['DEPRECATED', 'ARCHIVED', 'DRAFT'],
  DEPRECATED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE', 'DRAFT'],
};

export class RequirementService {
  constructor(
    private readonly requirementRepo: RequirementRepository = new RequirementRepository(),
    private readonly sourceRepo: RequirementSourceRepository = new RequirementSourceRepository(),
    private readonly projectRepo: ProjectRepository = new ProjectRepository(),
  ) {}

  /**
   * Lists requirements with pagination, filtering, and search for an active project.
   */
  async listRequirements(input: ListRequirementsInput): Promise<PaginatedResult<RequirementDto>> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) throw new ProjectNotFoundError();

    const result = await this.requirementRepo.listRequirements(input.projectId, {
      page: input.page,
      pageSize: input.pageSize,
      status: input.status,
      type: input.type,
      priority: input.priority,
      searchQuery: input.searchQuery,
      requirementSourceId: input.requirementSourceId,
    });

    return {
      items: result.items.map(r => this.mapRequirementToDto(r)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  }

  /**
   * Retrieves a single requirement scoped strictly to the given project ID.
   */
  async getRequirement(input: GetRequirementInput): Promise<RequirementDto | null> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.requirementId || typeof input.requirementId !== 'string') {
      throw new ProjectValidationError('Requirement ID is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) throw new ProjectNotFoundError();

    const requirement = await this.requirementRepo.getRequirementById(
      input.projectId,
      input.requirementId,
    );
    if (!requirement) return null;

    return this.mapRequirementToDto(requirement);
  }

  /**
   * Retrieves a requirement by human key scoped strictly to a project.
   */
  async getRequirementByKey(input: GetRequirementByKeyInput): Promise<RequirementDto | null> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.requirementKey || typeof input.requirementKey !== 'string') {
      throw new ProjectValidationError('Requirement key is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) throw new ProjectNotFoundError();

    const requirement = await this.requirementRepo.getRequirementByKey(
      input.projectId,
      input.requirementKey,
    );
    if (!requirement) return null;

    return this.mapRequirementToDto(requirement);
  }

  /**
   * Computes requirement status, type, and priority aggregation summary for a project.
   */
  async getRequirementSummary(projectId: string): Promise<RequirementSummaryDto> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    return this.requirementRepo.getRequirementSummary(projectId);
  }

  /**
   * Creates a new requirement record within a project.
   */
  async createRequirement(input: CreateRequirementInput): Promise<RequirementDto> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.title || !input.title.trim()) {
      throw new ProjectValidationError('Requirement title is required.');
    }
    if (!input.originalText || !input.originalText.trim()) {
      throw new ProjectValidationError('Original requirement text is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) throw new ProjectNotFoundError();

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot create requirement in an archived project.');
    }

    let sourceId: string | null = input.requirementSourceId ?? null;
    if (sourceId) {
      const source = await this.sourceRepo.getSourceById(input.projectId, sourceId);
      if (!source) {
        throw new RequirementSourceNotFoundError(
          'Requirement source not found or belongs to a different project.',
        );
      }
    } else {
      // Auto-associate with the project's idempotent manual requirement source
      const manualSource = await this.sourceRepo.getOrCreateManualSource(input.projectId);
      sourceId = manualSource.id;
    }

    const requirement = await this.requirementRepo.createRequirement({
      projectId: input.projectId,
      requirementKey: input.requirementKey?.trim(),
      title: input.title.trim(),
      originalText: input.originalText.trim(),
      requirementSourceId: sourceId,
      type: input.type ?? 'UNKNOWN',
      priority: input.priority ?? 'UNSPECIFIED',
      status: input.status ?? 'DRAFT',
    });

    getLogger().info('requirement.created', {
      projectId: input.projectId,
      requirementId: requirement.id,
      requirementKey: requirement.requirementKey,
      type: requirement.type,
    });

    return this.mapRequirementToDto(requirement);
  }

  /**
   * Updates an existing requirement with mass-assignment protection.
   */
  async updateRequirement(input: UpdateRequirementInput): Promise<RequirementDto> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.requirementId || typeof input.requirementId !== 'string') {
      throw new ProjectValidationError('Requirement ID is required.');
    }
    if (input.title !== undefined && !input.title.trim()) {
      throw new ProjectValidationError('Requirement title cannot be blank.');
    }
    if (input.originalText !== undefined && !input.originalText.trim()) {
      throw new ProjectValidationError('Original requirement text cannot be blank.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) throw new ProjectNotFoundError();

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot update requirement in an archived project.');
    }

    const existing = await this.requirementRepo.getRequirementById(
      input.projectId,
      input.requirementId,
    );
    if (!existing) {
      throw new RequirementNotFoundError(
        'Requirement not found or belongs to a different project.',
      );
    }

    if (input.status && input.status !== existing.status) {
      this.validateTransition(existing.status, input.status);
    }

    const updated = await this.requirementRepo.updateRequirement(
      input.projectId,
      input.requirementId,
      {
        title: input.title,
        originalText: input.originalText,
        type: input.type,
        priority: input.priority,
        status: input.status,
      },
    );

    if (!updated) {
      throw new RequirementNotFoundError(
        'Requirement not found or belongs to a different project.',
      );
    }

    getLogger().info('requirement.updated', {
      projectId: input.projectId,
      requirementId: input.requirementId,
      requirementKey: updated.requirementKey,
    });

    return this.mapRequirementToDto(updated);
  }

  /**
   * Transitions requirement to ACTIVE status.
   */
  async activateRequirement(input: ActivateRequirementInput): Promise<RequirementDto> {
    return await this.transitionStatus(input.projectId, input.requirementId, 'ACTIVE');
  }

  /**
   * Transitions requirement to DEPRECATED status.
   */
  async deprecateRequirement(input: DeprecateRequirementInput): Promise<RequirementDto> {
    return await this.transitionStatus(input.projectId, input.requirementId, 'DEPRECATED');
  }

  /**
   * Transitions requirement to DRAFT status.
   */
  async draftRequirement(input: DraftRequirementInput): Promise<RequirementDto> {
    return await this.transitionStatus(input.projectId, input.requirementId, 'DRAFT');
  }

  /**
   * Archives a requirement.
   */
  async archiveRequirement(input: ArchiveRequirementInput): Promise<RequirementDto> {
    return await this.transitionStatus(input.projectId, input.requirementId, 'ARCHIVED');
  }

  /**
   * Restores an archived requirement to ACTIVE status.
   */
  async restoreRequirement(input: RestoreRequirementInput): Promise<RequirementDto> {
    return await this.transitionStatus(input.projectId, input.requirementId, 'ACTIVE');
  }

  /**
   * Permanently deletes a requirement scoped strictly to a project.
   */
  async deleteRequirement(input: DeleteRequirementInput): Promise<{ readonly deleted: true }> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.requirementId || typeof input.requirementId !== 'string') {
      throw new ProjectValidationError('Requirement ID is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) throw new ProjectNotFoundError();

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot delete requirement in an archived project.');
    }

    const deleted = await this.requirementRepo.deleteRequirement(
      input.projectId,
      input.requirementId,
    );

    if (!deleted) {
      throw new RequirementNotFoundError(
        'Requirement not found or belongs to a different project.',
      );
    }

    getLogger().info('requirement.deleted', {
      projectId: input.projectId,
      requirementId: input.requirementId,
    });

    return { deleted: true };
  }

  private async transitionStatus(
    projectId: string,
    requirementId: string,
    targetStatus: RequirementStatus,
  ): Promise<RequirementDto> {
    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!requirementId || typeof requirementId !== 'string') {
      throw new ProjectValidationError('Requirement ID is required.');
    }

    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) throw new ProjectNotFoundError();

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot modify requirement in an archived project.');
    }

    const requirement = await this.requirementRepo.getRequirementById(projectId, requirementId);
    if (!requirement) {
      throw new RequirementNotFoundError(
        'Requirement not found or belongs to a different project.',
      );
    }

    if (requirement.status === targetStatus) {
      return this.mapRequirementToDto(requirement);
    }

    this.validateTransition(requirement.status, targetStatus);

    const updated = await this.requirementRepo.updateStatus(projectId, requirementId, targetStatus);

    if (!updated) {
      throw new RequirementNotFoundError(
        'Requirement not found or belongs to a different project.',
      );
    }

    getLogger().info('requirement.status_changed', {
      projectId,
      requirementId,
      previousStatus: requirement.status,
      newStatus: targetStatus,
    });

    return this.mapRequirementToDto(updated);
  }

  /**
   * Parses raw pasted text into requirement candidates deterministically without persisting anything.
   */
  async parseBulkRequirements(
    input: ParseBulkRequirementsInput,
  ): Promise<ParseBulkRequirementsResult> {
    return parseBulkRequirementsText(input.rawText);
  }

  /**
   * Atomically imports a batch of approved candidate requirements linked to a new PASTED_TEXT source.
   */
  async importBulkRequirements(
    input: ImportBulkRequirementsInput,
  ): Promise<ImportBulkRequirementsResult> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${input.projectId}' not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot import requirements into an archived project.');
    }

    if (!input.candidates || !Array.isArray(input.candidates) || input.candidates.length === 0) {
      throw new ProjectValidationError('At least one candidate must be provided for bulk import.');
    }

    if (input.candidates.length > 500) {
      throw new ProjectValidationError('Cannot import more than 500 candidates in a single batch.');
    }

    // Validate each candidate
    const items = input.candidates.map((c, index) => {
      const text = c.originalText?.trim();
      if (!text) {
        throw new ProjectValidationError(`Candidate #${index + 1} text cannot be empty.`);
      }
      const title = c.title?.trim() || text.slice(0, 80).trim();
      return {
        title: title.slice(0, 255),
        originalText: text,
        type: c.type ?? 'UNKNOWN',
        priority: c.priority ?? 'UNSPECIFIED',
        status: c.status ?? 'DRAFT',
        detectedExternalKey: c.detectedExternalKey ?? null,
        lineStart: c.lineStart ?? null,
        lineEnd: c.lineEnd ?? null,
      };
    });

    const result = await this.requirementRepo.createBulkRequirements({
      projectId: input.projectId,
      sourceName: input.sourceName,
      items,
    });

    getLogger().info('requirement.bulk_imported', {
      projectId: input.projectId,
      sourceId: result.source.id,
      importedCount: result.requirements.length,
    });

    return {
      requirementSourceId: result.source.id,
      requirementSourceName: result.source.name,
      importedCount: result.requirements.length,
      requirements: result.requirements.map(r => this.mapRequirementToDto(r)),
    };
  }

  private validateTransition(fromStatus: RequirementStatus, toStatus: RequirementStatus): void {
    const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(toStatus)) {
      throw new InvalidRequirementTransitionError(fromStatus, toStatus);
    }
  }

  private mapRequirementToDto(requirement: RequirementWithSource): RequirementDto {
    return {
      id: requirement.id,
      projectId: requirement.projectId,
      requirementSourceId: requirement.requirementSourceId,
      requirementSourceName: requirement.requirementSource?.name ?? null,
      requirementKey: requirement.requirementKey,
      title: requirement.title,
      originalText: requirement.originalText,
      type: requirement.type,
      priority: requirement.priority,
      status: requirement.status,
      createdAt: requirement.createdAt.toISOString(),
      updatedAt: requirement.updatedAt.toISOString(),
    };
  }
}
