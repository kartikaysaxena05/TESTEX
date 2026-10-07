/**
 * @file packages/core/src/retest/change-snapshot-builder.ts
 * Builds immutable, reproducible ChangeSnapshot records across all supported change source types.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import type { CreateChangeSnapshotInputDto } from '@ai-quality/contracts';
import { PatchParser } from '../patch/diff/patch-parser.js';
import {
  RetestPatchNotFoundError,
  RetestProjectMismatchError,
  RetestRequirementNotFoundError,
  RetestValidationError,
} from './retest-errors.js';
import {
  API_CHANGE_KEYWORDS,
  DATABASE_CHANGE_KEYWORDS,
  RETEST_BOUNDS,
  type ChangedApiInfo,
  type ChangedSymbolInfo,
} from './retest-types.js';

export class ChangeSnapshotBuilder {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Constructs normalized change snapshot data from the input specification.
   */
  async buildSnapshotData(
    input: CreateChangeSnapshotInputDto,
  ): Promise<Prisma.ChangeSnapshotCreateInput> {
    const { projectId, sourceType } = input;

    if (!projectId) {
      throw new RetestValidationError('Project ID is required.');
    }
    if (!sourceType) {
      throw new RetestValidationError('Source type is required.');
    }

    const changedFilesSet = new Set<string>(input.changedFiles ?? []);
    const changedRequirementsSet = new Set<string>(input.changedRequirements ?? []);
    const changedSymbols: ChangedSymbolInfo[] =
      (input.changedSymbolsJson as unknown as ChangedSymbolInfo[]) ?? [];
    const changedApis: ChangedApiInfo[] =
      (input.changedApisJson as unknown as ChangedApiInfo[]) ?? [];
    let changedConfiguration: Record<string, unknown> =
      (input.changedConfiguration as Record<string, unknown>) ?? {};
    let diffText = input.diffText ?? null;
    let baseRevision = input.baseRevision ?? null;
    let targetRevision = input.targetRevision ?? null;

    if (diffText && diffText.length > RETEST_BOUNDS.MAX_DIFF_BYTES) {
      throw new RetestValidationError(
        `Diff size (${diffText.length} bytes) exceeds limit of ${RETEST_BOUNDS.MAX_DIFF_BYTES} bytes.`,
      );
    }

    // 1. If APPROVED_PATCH, extract authoritative patch diff & affected files
    if (sourceType === 'APPROVED_PATCH' && input.sourceEntityId) {
      const approval = await this.prisma.defectPatchApproval.findUnique({
        where: { id: input.sourceEntityId },
        include: {
          patchProposal: true,
        },
      });

      if (!approval) {
        throw new RetestPatchNotFoundError(`Patch approval ${input.sourceEntityId} not found.`);
      }
      if (approval.projectId !== projectId) {
        throw new RetestProjectMismatchError(
          `Patch approval ${input.sourceEntityId} does not belong to project ${projectId}.`,
        );
      }

      baseRevision = baseRevision ?? approval.baseRevision;
      targetRevision = targetRevision ?? approval.appliedRevision ?? 'HEAD';
      diffText = diffText ?? approval.appliedUnifiedDiff ?? approval.patchProposal.unifiedDiff;

      for (const file of approval.affectedFiles) {
        changedFilesSet.add(file);
      }
      if (approval.patchProposal.primaryFilePath) {
        changedFilesSet.add(approval.patchProposal.primaryFilePath);
      }
      if (approval.patchProposal.primarySymbolName && approval.patchProposal.primaryFilePath) {
        changedSymbols.push({
          name: approval.patchProposal.primarySymbolName,
          kind: 'FUNCTION',
          filePath: approval.patchProposal.primaryFilePath,
          startLine: approval.patchProposal.startLine ?? undefined,
          endLine: approval.patchProposal.endLine ?? undefined,
        });
      }
    }

    // 2. If REQUIREMENT_CHANGE, verify requirement and resolve latest versions
    if (sourceType === 'REQUIREMENT_CHANGE' && input.sourceEntityId) {
      const req = await this.prisma.requirement.findUnique({
        where: { id: input.sourceEntityId },
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 2,
          },
          repositoryEvidence: true,
        },
      });

      if (!req) {
        throw new RetestRequirementNotFoundError(`Requirement ${input.sourceEntityId} not found.`);
      }
      if (req.projectId !== projectId) {
        throw new RetestProjectMismatchError(
          `Requirement ${input.sourceEntityId} does not belong to project ${projectId}.`,
        );
      }

      changedRequirementsSet.add(req.id);

      for (const ev of req.repositoryEvidence) {
        if (ev.filePath) {
          changedFilesSet.add(ev.filePath);
        }
        if (ev.symbolName && ev.filePath) {
          changedSymbols.push({
            name: ev.symbolName,
            kind: 'SYMBOL',
            filePath: ev.filePath,
            startLine: ev.lineStart ?? undefined,
            endLine: ev.lineEnd ?? undefined,
          });
        }
      }
    }

    // 3. Parse unified diff if provided
    if (diffText && diffText.trim()) {
      try {
        const parsed = PatchParser.parseUnifiedDiff(diffText);
        for (const file of parsed.files) {
          const normalPath = file.filePath.replace(/^[ab]\//, '');
          changedFilesSet.add(normalPath);

          // Check for API endpoints
          if (API_CHANGE_KEYWORDS.some(k => normalPath.toLowerCase().includes(k))) {
            changedApis.push({
              endpoint: normalPath,
              filePath: normalPath,
            });
          }

          // Check for database schema/migrations
          if (DATABASE_CHANGE_KEYWORDS.some(k => normalPath.toLowerCase().includes(k))) {
            changedConfiguration = {
              ...changedConfiguration,
              databaseChanged: true,
              databaseFile: normalPath,
            };
          }
        }
      } catch (err) {
        // If diff is non-fatal malformed, we keep whatever files were manually provided
        // but if empty or corrupted, we rethrow if no changedFiles exist
        if (changedFilesSet.size === 0 && changedRequirementsSet.size === 0) {
          throw new RetestValidationError(`Failed to parse diff: ${(err as Error).message}`);
        }
      }
    }

    const changedFiles = Array.from(changedFilesSet);
    const changedRequirements = Array.from(changedRequirementsSet);

    if (changedFiles.length > RETEST_BOUNDS.MAX_CHANGED_FILES) {
      throw new RetestValidationError(
        `Changed files count (${changedFiles.length}) exceeds limit of ${RETEST_BOUNDS.MAX_CHANGED_FILES}.`,
      );
    }

    return {
      project: { connect: { id: projectId } },
      sourceType,
      sourceEntityId: input.sourceEntityId ?? null,
      baseRevision,
      targetRevision,
      title: input.title,
      description: input.description ?? null,
      changedFiles,
      changedSymbolsJson: changedSymbols as unknown as Prisma.InputJsonValue,
      changedRequirements,
      changedApisJson: changedApis as unknown as Prisma.InputJsonValue,
      changedConfiguration: changedConfiguration as Prisma.InputJsonValue,
      diffText,
      metadataJson: (input.metadataJson ?? {}) as Prisma.InputJsonValue,
    };
  }
}
