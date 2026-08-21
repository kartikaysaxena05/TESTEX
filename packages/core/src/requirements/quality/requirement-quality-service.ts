/**
 * @file packages/core/src/requirements/quality/requirement-quality-service.ts
 * Domain service orchestrating requirement quality analysis, testability assessment,
 * ambiguity detection, finding review management, staleness detection, and batch processing.
 */

import crypto from 'node:crypto';
import {
  RequirementQualityRepository,
  type QualityAnalysisWithRelations,
} from './requirement-quality-repository.js';
import { RequirementRepository } from '../requirement-repository.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { RequirementRepresentationRepository } from '../normalization/requirement-representation-repository.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../../projects/project-errors.js';
import { RequirementNotFoundError, QualityFindingNotFoundError } from '../requirement-errors.js';
import { RequirementQualityAnalyzer } from './requirement-quality-analyzer.js';
import { ANALYZER_VERSION, QUALITY_LIMITS } from './quality-types.js';
import type {
  RequirementQualityAnalysisDto,
  RequirementQualityFindingDto,
  ReviewRequirementQualityFindingInput,
  BatchAnalyzeQualityResultDto,
  BatchAnalyzeQualityItemResultDto,
  QualityFindingCategory,
  QualityFindingSeverity,
  QualityFindingReviewStatus,
  QualityFindingCode,
  QualityAnalysisMethod,
  RequirementTestabilityStatus,
} from '@ai-quality/contracts';

export class RequirementQualityService {
  constructor(
    private readonly qualityRepo = new RequirementQualityRepository(),
    private readonly requirementRepo = new RequirementRepository(),
    private readonly projectRepo = new ProjectRepository(),
    private readonly representationRepo = new RequirementRepresentationRepository(),
  ) {}

  /**
   * Analyzes a requirement's quality and persists findings.
   */
  public async analyzeQuality(
    projectId: string,
    requirementId: string,
    options?: { force?: boolean },
  ): Promise<RequirementQualityAnalysisDto> {
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot analyze requirements in an archived project.');
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

    // 1. Check existing analysis
    const existing = await this.qualityRepo.findByRequirementId(projectId, requirementId);
    if (
      existing &&
      existing.sourceRequirementTextSha256 === currentSha256 &&
      existing.analyzerVersion === ANALYZER_VERSION &&
      !options?.force
    ) {
      return this.mapToDto(existing, currentSha256);
    }

    // 2. Fetch structured representation if available
    const representation = await this.representationRepo.findByRequirementId(
      projectId,
      requirementId,
    );

    // 3. Run pure deterministic analyzer
    const draft = RequirementQualityAnalyzer.analyze({
      originalText: requirement.originalText,
      normalizedText: representation?.normalizedText,
      actor: representation?.actor,
      action: representation?.action,
      object: representation?.object,
      conditions: (representation?.conditions as unknown[]) ?? [],
      constraints: (representation?.constraints as unknown[]) ?? [],
      quantitativeValues: (representation?.quantitativeValues as unknown[]) ?? [],
      expectedOutcome: representation?.expectedOutcome,
    });

    // 4. Save analysis and preserve previous review decisions
    const saved = await this.qualityRepo.saveAnalysis(
      projectId,
      requirementId,
      currentSha256,
      draft,
      { preserveReviews: true },
    );

    return this.mapToDto(saved, currentSha256);
  }

  /**
   * Retrieves quality analysis for a requirement with live staleness calculation.
   */
  public async getQualityAnalysis(
    projectId: string,
    requirementId: string,
  ): Promise<RequirementQualityAnalysisDto | null> {
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

    const analysis = await this.qualityRepo.findByRequirementId(projectId, requirementId);
    if (!analysis) {
      return null;
    }

    const currentSha256 = crypto
      .createHash('sha256')
      .update(requirement.originalText)
      .digest('hex');

    return this.mapToDto(analysis, currentSha256);
  }

  /**
   * Reviews or dismisses a quality finding with optional rationale and clarification response.
   */
  public async reviewQualityFinding(
    input: ReviewRequirementQualityFindingInput,
  ): Promise<RequirementQualityFindingDto> {
    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${input.projectId}' was not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError(
        'Cannot update quality finding reviews in an archived project.',
      );
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

    const finding = await this.qualityRepo.findFindingById(input.projectId, input.findingId);
    if (!finding || finding.requirementId !== input.requirementId) {
      throw new QualityFindingNotFoundError(
        `Finding '${input.findingId}' was not found for requirement '${input.requirementId}'.`,
      );
    }

    const updated = await this.qualityRepo.updateFindingReview(input.projectId, input.findingId, {
      reviewStatus: input.reviewStatus,
      reviewRationale: input.reviewRationale,
      clarificationResponse: input.clarificationResponse,
    });

    return {
      id: updated.id,
      analysisId: updated.analysisId,
      projectId: updated.projectId,
      requirementId: updated.requirementId,
      code: updated.code as QualityFindingCode,
      category: updated.category as QualityFindingCategory,
      severity: updated.severity as QualityFindingSeverity,
      message: updated.message,
      evidenceText: updated.evidenceText,
      startOffset: updated.startOffset,
      endOffset: updated.endOffset,
      suggestedClarification: updated.suggestedClarification,
      reviewStatus: updated.reviewStatus as QualityFindingReviewStatus,
      reviewRationale: updated.reviewRationale,
      clarificationResponse: updated.clarificationResponse,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Forces re-analysis of requirement quality.
   */
  public async reanalyzeQuality(
    projectId: string,
    requirementId: string,
  ): Promise<RequirementQualityAnalysisDto> {
    return this.analyzeQuality(projectId, requirementId, { force: true });
  }

  /**
   * Bounded batch quality analysis with per-item isolation.
   */
  public async batchAnalyzeQuality(
    projectId: string,
    requirementIds: readonly string[],
  ): Promise<BatchAnalyzeQualityResultDto> {
    const project = await this.projectRepo.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot analyze requirements in an archived project.');
    }

    const boundedIds = requirementIds.slice(0, QUALITY_LIMITS.MAX_BATCH_SIZE);
    const results: BatchAnalyzeQualityItemResultDto[] = [];
    let analyzedCount = 0;
    let failedCount = 0;

    for (const reqId of boundedIds) {
      try {
        const analysis = await this.analyzeQuality(projectId, reqId, { force: true });
        results.push({
          requirementId: reqId,
          requirementKey: analysis.requirementKey,
          success: true,
          analysis,
        });
        analyzedCount++;
      } catch (err) {
        failedCount++;
        results.push({
          requirementId: reqId,
          success: false,
          error: {
            code: 'QUALITY_ANALYSIS_FAILED',
            message:
              err instanceof Error ? err.message : 'Quality analysis failed for requirement.',
          },
        });
      }
    }

    return {
      analyzedCount,
      failedCount,
      results,
    };
  }

  /**
   * Maps Prisma database model to sanitized contract DTO.
   */
  private mapToDto(
    entity: QualityAnalysisWithRelations,
    currentSha256: string,
  ): RequirementQualityAnalysisDto {
    const isStale = entity.sourceRequirementTextSha256 !== currentSha256;

    const findings: RequirementQualityFindingDto[] = (entity.findings ?? []).map(f => ({
      id: f.id,
      analysisId: f.analysisId,
      projectId: f.projectId,
      requirementId: f.requirementId,
      code: f.code as QualityFindingCode,
      category: f.category as QualityFindingCategory,
      severity: f.severity as QualityFindingSeverity,
      message: f.message,
      evidenceText: f.evidenceText,
      startOffset: f.startOffset,
      endOffset: f.endOffset,
      suggestedClarification: f.suggestedClarification,
      reviewStatus: f.reviewStatus as QualityFindingReviewStatus,
      reviewRationale: f.reviewRationale,
      clarificationResponse: f.clarificationResponse,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }));

    return {
      id: entity.id,
      projectId: entity.projectId,
      requirementId: entity.requirementId,
      requirementKey: entity.requirement?.requirementKey ?? '',
      originalRequirementText: entity.requirement?.originalText ?? '',
      sourceRequirementTextSha256: entity.sourceRequirementTextSha256,
      analyzerVersion: entity.analyzerVersion,
      testabilityStatus: entity.testabilityStatus as RequirementTestabilityStatus,
      qualityScore: entity.qualityScore,
      analysisMethod: entity.analysisMethod as QualityAnalysisMethod,
      findingsCount: entity.findingsCount,
      openFindingsCount: entity.openFindingsCount,
      clarificationQuestions: Array.isArray(entity.clarificationQuestions)
        ? (entity.clarificationQuestions as string[])
        : [],
      findings,
      isStale,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
