/**
 * @file packages/core/src/execution/healing/healing-suggestion-service.ts
 * Manages persisted, reviewable LocatorHealingSuggestion records.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  ExecutableTargetDescriptorDto,
  LocatorHealingSuggestionDto,
  HealingReviewStatus,
} from '@ai-quality/contracts';
import type { IHealingSuggestionService } from './healing-types.js';
import type { ILogger } from '../../logging/index.js';

export class HealingSuggestionService implements IHealingSuggestionService {
  private readonly prisma: PrismaClient;
  private readonly logger?: ILogger;

  constructor(prisma: PrismaClient, logger?: ILogger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Records or updates a reviewable healing suggestion.
   * If a suggestion already exists for the same step and selector, updates score and run.
   */
  public async recordSuggestion(params: {
    projectId: string;
    testCaseId: string;
    testCaseVersionNumber: number;
    stepIndex: number;
    originalTarget: ExecutableTargetDescriptorDto;
    suggestedTarget: ExecutableTargetDescriptorDto;
    suggestedSelector: string;
    reason: string;
    score: number;
    discoveredInRunId: string;
  }): Promise<LocatorHealingSuggestionDto> {
    const existing = await this.prisma.locatorHealingSuggestion.findUnique({
      where: {
        testCaseId_stepIndex_suggestedSelector: {
          testCaseId: params.testCaseId,
          stepIndex: params.stepIndex,
          suggestedSelector: params.suggestedSelector,
        },
      },
    });

    if (existing) {
      // If previously REJECTED, do not resurrect to PENDING automatically
      const updated = await this.prisma.locatorHealingSuggestion.update({
        where: { id: existing.id },
        data: {
          score: Math.max(existing.score, params.score),
          discoveredInRunId: params.discoveredInRunId,
          testCaseVersionNumber: params.testCaseVersionNumber,
          reason: params.reason,
        },
      });
      return this.mapToDto(updated);
    }

    const created = await this.prisma.locatorHealingSuggestion.create({
      data: {
        projectId: params.projectId,
        testCaseId: params.testCaseId,
        testCaseVersionNumber: params.testCaseVersionNumber,
        stepIndex: params.stepIndex,
        originalTargetJson: params.originalTarget as any,
        suggestedTargetJson: params.suggestedTarget as any,
        suggestedSelector: params.suggestedSelector,
        reason: params.reason,
        score: params.score,
        reviewStatus: 'PENDING',
        discoveredInRunId: params.discoveredInRunId,
      },
    });

    this.logger?.info('healing_suggestion.created', {
      suggestionId: created.id,
      testCaseId: params.testCaseId,
      stepIndex: params.stepIndex,
      score: params.score,
    });

    return this.mapToDto(created);
  }

  /**
   * Lists healing suggestions with optional project, test case, and status filters.
   */
  public async listSuggestions(params: {
    projectId: string;
    testCaseId?: string;
    reviewStatus?: HealingReviewStatus;
  }): Promise<readonly LocatorHealingSuggestionDto[]> {
    const whereClause: any = {
      projectId: params.projectId,
    };
    if (params.testCaseId) {
      whereClause.testCaseId = params.testCaseId;
    }
    if (params.reviewStatus) {
      whereClause.reviewStatus = params.reviewStatus;
    }

    const items = await this.prisma.locatorHealingSuggestion.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }, { score: 'desc' }],
    });

    return items.map(item => this.mapToDto(item));
  }

  /**
   * Reviews a healing suggestion (ACCEPTED or REJECTED).
   */
  public async reviewSuggestion(params: {
    projectId: string;
    suggestionId: string;
    reviewStatus: 'ACCEPTED' | 'REJECTED';
    rejectionReason?: string;
    reviewerId?: string;
  }): Promise<LocatorHealingSuggestionDto> {
    const now = new Date();
    const updated = await this.prisma.locatorHealingSuggestion.update({
      where: {
        id: params.suggestionId,
      },
      data: {
        reviewStatus: params.reviewStatus,
        reviewedAt: now,
        reviewedBy: params.reviewerId ?? 'SYSTEM_USER',
        rejectionReason: params.reviewStatus === 'REJECTED' ? params.rejectionReason : null,
      },
    });

    this.logger?.info('healing_suggestion.reviewed', {
      suggestionId: updated.id,
      reviewStatus: params.reviewStatus,
      reviewedBy: updated.reviewedBy,
    });

    return this.mapToDto(updated);
  }

  private mapToDto(record: any): LocatorHealingSuggestionDto {
    return {
      id: record.id,
      projectId: record.projectId,
      testCaseId: record.testCaseId,
      testCaseVersionNumber: record.testCaseVersionNumber,
      stepIndex: record.stepIndex,
      originalTarget: record.originalTargetJson as any,
      suggestedTarget: record.suggestedTargetJson as any,
      suggestedSelector: record.suggestedSelector,
      reason: record.reason,
      score: record.score,
      reviewStatus: record.reviewStatus as HealingReviewStatus,
      discoveredInRunId: record.discoveredInRunId,
      reviewedAt: record.reviewedAt ? record.reviewedAt.toISOString() : null,
      reviewedBy: record.reviewedBy,
      rejectionReason: record.rejectionReason,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
