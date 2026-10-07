/**
 * @file packages/core/src/patch/patch-proposal-service.ts
 * Authoritative orchestrator for V7 Phase 101 Limited AI Patch Generation.
 * Strictly proposal-only: guarantees zero direct working tree writes, zero commits, and zero pushes.
 */

import { PrismaClient, type Prisma } from '@prisma/client';
import type {
  DefectPatchProposalDto,
  GeneratePatchProposalInputDto,
  GetPatchProposalInputDto,
  ListPatchProposalsInputDto,
  WithdrawPatchProposalInputDto,
} from '@ai-quality/contracts';
import { GitCommandRunner } from '../git/git-command-runner.js';
import { getLogger } from '../logging/logger.js';
import {
  PatchProposalConcurrentMutationError,
  PatchProposalCrossProjectError,
  PatchProposalNotFoundError,
  PatchProposalValidationError,
} from './patch-errors.js';
import { PatchContextBuilder } from './context/patch-context-builder.js';
import { PatchGenerator } from './generation/patch-generator.js';
import type { IPatchProposalService } from './patch-types.js';

export interface PatchProposalServiceOptions {
  readonly prisma?: PrismaClient;
  readonly gitRunner?: GitCommandRunner;
  readonly contextBuilder?: PatchContextBuilder;
  readonly generator?: PatchGenerator;
}

export class PatchProposalService implements IPatchProposalService {
  private readonly prisma: PrismaClient;
  private readonly gitRunner: GitCommandRunner;
  private readonly contextBuilder: PatchContextBuilder;
  private readonly generator: PatchGenerator;

  // Mutex per failure case to prevent race conditions & duplicate proposals
  private static readonly activeGenerations = new Set<string>();

  constructor(options: PatchProposalServiceOptions = {}) {
    this.prisma = options.prisma ?? new PrismaClient();
    this.gitRunner = options.gitRunner ?? new GitCommandRunner();
    this.contextBuilder =
      options.contextBuilder ??
      new PatchContextBuilder({
        prisma: this.prisma,
        gitRunner: this.gitRunner,
      });
    this.generator = options.generator ?? new PatchGenerator();
  }

  /**
   * Generates and persists a minimal, validated patch proposal.
   * Guarantees ZERO repository working tree modifications.
   */
  public async generateProposal(
    input: GeneratePatchProposalInputDto,
  ): Promise<DefectPatchProposalDto> {
    if (!input.projectId || !input.failureCaseId) {
      throw new PatchProposalValidationError('projectId and failureCaseId are required.');
    }

    const mutexKey = `${input.projectId}:${input.failureCaseId}`;
    if (PatchProposalService.activeGenerations.has(mutexKey)) {
      throw new PatchProposalConcurrentMutationError(
        `Patch generation is already in progress for failure case ${input.failureCaseId}.`,
      );
    }

    PatchProposalService.activeGenerations.add(mutexKey);

    try {
      // 1. Check for existing authoritative proposal if not force-regenerating
      if (!input.forceRegenerate) {
        const existing = await this.prisma.defectPatchProposal.findFirst({
          where: {
            projectId: input.projectId,
            failureCaseId: input.failureCaseId,
            isAuthoritative: true,
            status: 'PROPOSED',
          },
          orderBy: { proposalVersion: 'desc' },
        });

        if (existing) {
          getLogger().info('patch_proposal.existing_returned', {
            projectId: input.projectId,
            failureCaseId: input.failureCaseId,
            proposalId: existing.id,
          });
          return this.mapToDto(existing);
        }
      }

      // 2. Build grounded context (enforces Phase 99 ELIGIBLE and Phase 100 localization)
      const context = await this.contextBuilder.buildContext(
        input.projectId,
        input.failureCaseId,
        input.userGuidance,
        {
          quickFixAssessmentId: input.quickFixAssessmentId,
          defectLocalizationId: input.defectLocalizationId,
        },
      );

      // 3. Generate structured patch proposal
      const engineResult = await this.generator.generatePatch(context);

      // 4. Determine next proposal version and existing authoritative proposals
      const existingProposals = await this.prisma.defectPatchProposal.findMany({
        where: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
        },
        orderBy: { proposalVersion: 'desc' },
      });

      const nextVersion =
        existingProposals.length > 0 && existingProposals[0]
          ? existingProposals[0].proposalVersion + 1
          : 1;

      // 5. Persist proposal in database transaction
      const targetSnippet = context.snippets.find(s => s.filePath === engineResult.primaryFilePath);

      const createdProposal = await this.prisma.$transaction(async tx => {
        // Mark prior authoritative proposals as superseded
        if (existingProposals.length > 0) {
          await tx.defectPatchProposal.updateMany({
            where: {
              projectId: input.projectId,
              failureCaseId: input.failureCaseId,
              isAuthoritative: true,
            },
            data: {
              isAuthoritative: false,
              status: 'SUPERSEDED',
            },
          });
        }

        return tx.defectPatchProposal.create({
          data: {
            projectId: input.projectId,
            failureCaseId: input.failureCaseId,
            repositoryId: context.repositoryId,
            quickFixAssessmentId: context.quickFixAssessment.id,
            defectLocalizationId: context.defectLocalization.id,
            rootCauseAnalysisId: context.rootCauseAnalysis?.id ?? null,

            repositoryRevision: context.repositoryRevision,
            branchName: context.branchName,
            sourceFileSha256: targetSnippet?.sha256 ?? null,
            isDrifted: context.isDrifted,

            status: 'PROPOSED',
            riskLevel: engineResult.riskLevel,
            proposalVersion: nextVersion,
            isAuthoritative: true,

            targetFiles: [...engineResult.targetFiles],
            primaryFilePath: engineResult.primaryFilePath,
            primarySymbolName: engineResult.primarySymbolName,
            startLine: engineResult.startLine,
            endLine: engineResult.endLine,

            filesChangedCount: engineResult.targetFiles.length,
            linesAddedCount: engineResult.linesAdded,
            linesRemovedCount: engineResult.linesRemoved,
            totalChangedLinesCount: engineResult.totalChangedLines,

            unifiedDiff: engineResult.unifiedDiff,
            structuredEditsJson: engineResult.structuredEdits as any,

            rationale: engineResult.rationale,
            expectedBehaviorChange: engineResult.expectedBehaviorChange,
            assumptions: [...engineResult.assumptions],
            riskFactors: [...engineResult.riskFactors],
            uncertainties: [...engineResult.uncertainties],

            evidenceReferencesJson: engineResult.evidenceReferences as any,
            testReferencesJson: engineResult.testReferences as any,
            traceabilityJson: engineResult.traceabilityJson as any,

            modelProvider: engineResult.modelProvider,
            modelName: engineResult.modelName,
            promptVersion: engineResult.promptVersion,
            patchFingerprint: engineResult.patchFingerprint,
            durationMs: engineResult.durationMs,
          },
        });
      });

      getLogger().info('patch_proposal.created', {
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
        proposalId: createdProposal.id,
        version: createdProposal.proposalVersion,
        riskLevel: createdProposal.riskLevel,
        filesChanged: createdProposal.filesChangedCount,
        totalChangedLines: createdProposal.totalChangedLinesCount,
      });

      return this.mapToDto(createdProposal);
    } finally {
      PatchProposalService.activeGenerations.delete(mutexKey);
    }
  }

  /**
   * Retrieves a patch proposal by ID or latest authoritative proposal for a defect.
   */
  public async getProposal(
    input: GetPatchProposalInputDto,
  ): Promise<DefectPatchProposalDto | null> {
    if (!input.projectId || !input.failureCaseId) {
      throw new PatchProposalValidationError('projectId and failureCaseId are required.');
    }

    let proposal;
    if (input.proposalId) {
      proposal = await this.prisma.defectPatchProposal.findUnique({
        where: { id: input.proposalId },
      });
    } else {
      proposal = await this.prisma.defectPatchProposal.findFirst({
        where: {
          projectId: input.projectId,
          failureCaseId: input.failureCaseId,
          isAuthoritative: true,
        },
        orderBy: { proposalVersion: 'desc' },
      });
    }

    if (!proposal) {
      return null;
    }

    if (proposal.projectId !== input.projectId) {
      throw new PatchProposalCrossProjectError(
        `Cross-project forbidden: Proposal ${proposal.id} does not belong to project ${input.projectId}.`,
      );
    }

    return this.mapToDto(proposal);
  }

  /**
   * Lists all historical patch proposals for a failure case.
   */
  public async listProposals(
    input: ListPatchProposalsInputDto,
  ): Promise<readonly DefectPatchProposalDto[]> {
    if (!input.projectId || !input.failureCaseId) {
      throw new PatchProposalValidationError('projectId and failureCaseId are required.');
    }

    // Verify failure case ownership
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: input.failureCaseId },
      select: { projectId: true },
    });

    if (!failureCase) {
      throw new PatchProposalNotFoundError(`Failure case ${input.failureCaseId} not found.`);
    }

    if (failureCase.projectId !== input.projectId) {
      throw new PatchProposalCrossProjectError(
        `Cross-project forbidden: Failure case ${input.failureCaseId} does not belong to project ${input.projectId}.`,
      );
    }

    const proposals = await this.prisma.defectPatchProposal.findMany({
      where: {
        projectId: input.projectId,
        failureCaseId: input.failureCaseId,
      },
      orderBy: { proposalVersion: 'desc' },
    });

    return proposals.map(p => this.mapToDto(p));
  }

  /**
   * Withdraws a patch proposal.
   */
  public async withdrawProposal(
    input: WithdrawPatchProposalInputDto,
  ): Promise<DefectPatchProposalDto> {
    if (!input.projectId || !input.proposalId) {
      throw new PatchProposalValidationError('projectId and proposalId are required.');
    }

    const proposal = await this.prisma.defectPatchProposal.findUnique({
      where: { id: input.proposalId },
    });

    if (!proposal) {
      throw new PatchProposalNotFoundError(`Proposal ${input.proposalId} not found.`);
    }

    if (proposal.projectId !== input.projectId) {
      throw new PatchProposalCrossProjectError(
        `Cross-project forbidden: Proposal ${proposal.id} does not belong to project ${input.projectId}.`,
      );
    }

    const updated = await this.prisma.defectPatchProposal.update({
      where: { id: input.proposalId },
      data: {
        status: 'WITHDRAWN',
        isAuthoritative: false,
      },
    });

    getLogger().info('patch_proposal.withdrawn', {
      projectId: input.projectId,
      proposalId: input.proposalId,
      reason: input.reason,
    });

    return this.mapToDto(updated);
  }

  private mapToDto(
    record: Prisma.DefectPatchProposalGetPayload<Record<string, never>>,
  ): DefectPatchProposalDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      repositoryId: record.repositoryId,
      quickFixAssessmentId: record.quickFixAssessmentId,
      defectLocalizationId: record.defectLocalizationId,
      rootCauseAnalysisId: record.rootCauseAnalysisId,

      repositoryRevision: record.repositoryRevision,
      branchName: record.branchName,
      sourceFileSha256: record.sourceFileSha256,
      isDrifted: record.isDrifted,
      driftDetails: null,

      status: record.status as any,
      riskLevel: record.riskLevel as any,
      proposalVersion: record.proposalVersion,
      supersededById: record.supersededById,
      generationModel: `${record.modelProvider}/${record.modelName}`,
      generationPromptTokens: null,
      generationCompletionTokens: null,
      generationDurationMs: record.durationMs,

      targetFiles: record.targetFiles,
      linesAdded: record.linesAddedCount,
      linesRemoved: record.linesRemovedCount,
      totalChangedLines: record.totalChangedLinesCount,

      unifiedDiff: record.unifiedDiff,
      structuredEdits: (record.structuredEditsJson as any) ?? [],

      rationale: record.rationale,
      assumptions: record.assumptions,
      uncertainties: record.uncertainties,
      riskFactors: record.riskFactors,
      evidenceReferences: (record.evidenceReferencesJson as any) ?? [],
      testReferences: (record.testReferencesJson as any) ?? [],
      traceabilityJson: record.traceabilityJson,
      metadataJson: undefined,

      isReadOnlyProposal: true,

      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
