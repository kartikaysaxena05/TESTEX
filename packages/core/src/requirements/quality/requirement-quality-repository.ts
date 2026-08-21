/**
 * @file packages/core/src/requirements/quality/requirement-quality-repository.ts
 * Prisma repository for RequirementQualityAnalysis and RequirementQualityFinding records.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { RequirementQualityAnalysis, RequirementQualityFinding, Prisma } from '@prisma/client';
import type { QualityAnalysisMethod, QualityFindingReviewStatus } from '@ai-quality/contracts';
import type { QualityAnalysisDraft } from './quality-types.js';

export type QualityAnalysisWithRelations = RequirementQualityAnalysis & {
  readonly requirement: {
    readonly id: string;
    readonly requirementKey: string;
    readonly originalText: string;
  };
  readonly findings: RequirementQualityFinding[];
};

export class RequirementQualityRepository {
  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new DatabaseError('Database client is not available.', 'DATABASE_UNAVAILABLE');
    }
    return prisma;
  }

  /**
   * Finds quality analysis by requirement ID within a project.
   */
  public async findByRequirementId(
    projectId: string,
    requirementId: string,
  ): Promise<QualityAnalysisWithRelations | null> {
    try {
      const analysis = await this.getPrisma().requirementQualityAnalysis.findFirst({
        where: {
          projectId,
          requirementId,
        },
        include: {
          requirement: {
            select: {
              id: true,
              requirementKey: true,
              originalText: true,
            },
          },
          findings: {
            orderBy: [{ startOffset: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });

      return (analysis as QualityAnalysisWithRelations) ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError('Failed to query requirement quality analysis.', 'QUERY_FAILED');
    }
  }

  /**
   * Finds a single quality finding by ID within a project.
   */
  public async findFindingById(
    projectId: string,
    findingId: string,
  ): Promise<RequirementQualityFinding | null> {
    try {
      const finding = await this.getPrisma().requirementQualityFinding.findFirst({
        where: {
          id: findingId,
          projectId,
        },
      });

      return finding;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError('Failed to query quality finding.', 'QUERY_FAILED');
    }
  }

  /**
   * Creates or replaces a quality analysis atomically within a transaction,
   * preserving review status and rationale for existing acknowledged/dismissed findings.
   */
  public async saveAnalysis(
    projectId: string,
    requirementId: string,
    sourceSha256: string,
    draft: QualityAnalysisDraft,
    options?: { preserveReviews?: boolean },
  ): Promise<QualityAnalysisWithRelations> {
    const prisma = this.getPrisma();

    try {
      return await prisma.$transaction(async tx => {
        // 1. Fetch existing analysis if present
        const existing = await tx.requirementQualityAnalysis.findFirst({
          where: { projectId, requirementId },
          include: { findings: true },
        });

        // 2. Map existing reviews if preservation is requested (default: true)
        const reviewMap = new Map<
          string,
          {
            reviewStatus: QualityFindingReviewStatus;
            reviewRationale: string | null;
            clarificationResponse: string | null;
          }
        >();

        if (options?.preserveReviews !== false && existing?.findings) {
          for (const f of existing.findings) {
            if (f.reviewStatus !== 'OPEN') {
              const key = `${f.code}:${f.startOffset ?? -1}:${f.evidenceText ?? ''}`;
              reviewMap.set(key, {
                reviewStatus: f.reviewStatus as QualityFindingReviewStatus,
                reviewRationale: f.reviewRationale,
                clarificationResponse: f.clarificationResponse,
              });
            }
          }
        }

        // 3. Delete existing analysis (cascades to findings)
        if (existing) {
          await tx.requirementQualityAnalysis.delete({
            where: { id: existing.id },
          });
        }

        // 4. Calculate open findings count
        let openCount = 0;
        const findingsToCreate = draft.findings.map(f => {
          const key = `${f.code}:${f.startOffset ?? -1}:${f.evidenceText ?? ''}`;
          const existingReview = reviewMap.get(key);

          const reviewStatus: QualityFindingReviewStatus = existingReview?.reviewStatus ?? 'OPEN';
          if (reviewStatus === 'OPEN') {
            openCount++;
          }

          return {
            projectId,
            requirementId,
            code: f.code,
            category: f.category,
            severity: f.severity,
            message: f.message,
            evidenceText: f.evidenceText,
            startOffset: f.startOffset,
            endOffset: f.endOffset,
            suggestedClarification: f.suggestedClarification,
            reviewStatus,
            reviewRationale: existingReview?.reviewRationale ?? null,
            clarificationResponse: existingReview?.clarificationResponse ?? null,
          };
        });

        // 5. Determine analysis method
        const hasReviewedFindings = findingsToCreate.some(f => f.reviewStatus !== 'OPEN');
        const analysisMethod: QualityAnalysisMethod = hasReviewedFindings
          ? 'DETERMINISTIC_REVIEWED'
          : 'DETERMINISTIC';

        // 6. Create new analysis with child findings
        const created = await tx.requirementQualityAnalysis.create({
          data: {
            projectId,
            requirementId,
            sourceRequirementTextSha256: sourceSha256,
            analyzerVersion: draft.analyzerVersion,
            testabilityStatus: draft.testabilityStatus,
            qualityScore: draft.qualityScore,
            analysisMethod,
            findingsCount: draft.findings.length,
            openFindingsCount: openCount,
            clarificationQuestions:
              draft.clarificationQuestions as unknown as Prisma.InputJsonValue,
            findings: {
              create: findingsToCreate,
            },
          },
          include: {
            requirement: {
              select: {
                id: true,
                requirementKey: true,
                originalText: true,
              },
            },
            findings: {
              orderBy: [{ startOffset: 'asc' }, { createdAt: 'asc' }],
            },
          },
        });

        return created as QualityAnalysisWithRelations;
      });
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError(
        `Failed to save requirement quality analysis: ${err instanceof Error ? err.message : String(err)}`,
        'WRITE_FAILED',
      );
    }
  }

  /**
   * Updates review state of a single quality finding.
   */
  public async updateFindingReview(
    projectId: string,
    findingId: string,
    data: {
      reviewStatus: QualityFindingReviewStatus;
      reviewRationale?: string | null;
      clarificationResponse?: string | null;
    },
  ): Promise<RequirementQualityFinding> {
    const prisma = this.getPrisma();

    try {
      return await prisma.$transaction(async tx => {
        const finding = await tx.requirementQualityFinding.findFirst({
          where: { id: findingId, projectId },
        });

        if (!finding) {
          throw new DatabaseError(`Finding '${findingId}' not found.`, 'NOT_FOUND');
        }

        const updatedFinding = await tx.requirementQualityFinding.update({
          where: { id: findingId },
          data: {
            reviewStatus: data.reviewStatus,
            reviewRationale:
              data.reviewRationale !== undefined ? data.reviewRationale : finding.reviewRationale,
            clarificationResponse:
              data.clarificationResponse !== undefined
                ? data.clarificationResponse
                : finding.clarificationResponse,
          },
        });

        // Recalculate open findings count on analysis
        const openCount = await tx.requirementQualityFinding.count({
          where: {
            analysisId: finding.analysisId,
            reviewStatus: 'OPEN',
          },
        });

        await tx.requirementQualityAnalysis.update({
          where: { id: finding.analysisId },
          data: {
            openFindingsCount: openCount,
            analysisMethod: 'DETERMINISTIC_REVIEWED',
          },
        });

        return updatedFinding;
      });
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError('Failed to update quality finding review.', 'WRITE_FAILED');
    }
  }

  /**
   * Deletes quality analysis for a requirement.
   */
  public async deleteByRequirementId(projectId: string, requirementId: string): Promise<boolean> {
    try {
      const res = await this.getPrisma().requirementQualityAnalysis.deleteMany({
        where: { projectId, requirementId },
      });
      return res.count > 0;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError('Failed to delete quality analysis.', 'DELETE_FAILED');
    }
  }
}
