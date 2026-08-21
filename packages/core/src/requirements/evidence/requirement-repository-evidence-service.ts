/**
 * @file packages/core/src/requirements/evidence/requirement-repository-evidence-service.ts
 * Domain orchestration service for Requirement ↔ Repository Evidence mapping and bounded preview.
 */

import crypto from 'node:crypto';
import type {
  RequirementRepositoryEvidenceDto,
  MatchRepositoryEvidenceInput,
  MatchRepositoryEvidenceResultDto,
  GetRepositoryEvidenceInput,
  ReviewRepositoryEvidenceInput,
  CreateManualRepositoryEvidenceInput,
  DeleteRepositoryEvidenceInput,
  PreviewRepositoryEvidenceInput,
  EvidencePreviewDto,
} from '@ai-quality/contracts';
import { getLogger } from '../../logging/logger.js';
import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../../projects/project-errors.js';
import { SourceRepository } from '../../sources/source-repository.js';
import { SnapshotRepository } from '../../sources/snapshots/snapshot-repository.js';
import { SourceContentService } from '../../sources/content/source-content-service.js';
import { RequirementRepository } from '../requirement-repository.js';
import {
  RequirementNotFoundError,
  RepositoryEvidenceNotFoundError,
  RepositoryEvidenceNotAuthorizedError,
} from '../requirement-errors.js';
import {
  RequirementRepositoryEvidenceRepository,
  type EvidenceWithRelations,
} from './requirement-repository-evidence-repository.js';
import { RequirementRepositoryMatcher } from './requirement-repository-matcher.js';
import {
  MAX_PREVIEW_LINES,
  MAX_PREVIEW_CHARS,
  type IndexedEntityForMatching,
  type MatcherRequirementInput,
} from './evidence-types.js';

export class RequirementRepositoryEvidenceService {
  constructor(
    private readonly evidenceRepository: RequirementRepositoryEvidenceRepository = new RequirementRepositoryEvidenceRepository(),
    private readonly requirementRepository: RequirementRepository = new RequirementRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly sourceRepository: SourceRepository = new SourceRepository(),
    private readonly snapshotRepository: SnapshotRepository = new SnapshotRepository(),
    private readonly contentService: SourceContentService = new SourceContentService(),
  ) {}

  private getPrisma() {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new DatabaseError(
        'Database connection is not configured or unavailable.',
        'DATABASE_UNAVAILABLE',
      );
    }
    return prisma;
  }

  /**
   * Deterministically matches candidate repository evidence for a single requirement.
   */
  async matchRepositoryEvidence(
    input: MatchRepositoryEvidenceInput,
  ): Promise<MatchRepositoryEvidenceResultDto> {
    const startTime = performance.now();
    const { projectId, requirementId } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!requirementId || typeof requirementId !== 'string') {
      throw new ProjectValidationError('Requirement ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError();
    }

    const requirement = await this.requirementRepository.getRequirementWithDetails(
      projectId,
      requirementId,
    );
    if (!requirement) {
      throw new RequirementNotFoundError(
        `Requirement ${requirementId} not found in project ${projectId}.`,
      );
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      return {
        matchedCount: 0,
        candidateEvidence: [],
        snapshotFingerprint: null,
        isIndexed: false,
      };
    }

    // Check latest snapshot & indexed files
    const snapshots = await this.snapshotRepository.listSnapshotsForSource(source.id);
    const latestSnapshot = snapshots[0] ?? null;

    const prisma = this.getPrisma();
    const indexedFiles = await prisma.repositoryFile.findMany({
      where: { sourceId: source.id },
      include: {
        symbols: {
          select: {
            id: true,
            name: true,
            kind: true,
            startLine: true,
            endLine: true,
            isExported: true,
          },
        },
      },
      orderBy: { relativePath: 'asc' },
    });

    if (indexedFiles.length === 0) {
      return {
        matchedCount: 0,
        candidateEvidence: [],
        snapshotFingerprint: latestSnapshot?.fingerprint ?? null,
        isIndexed: false,
      };
    }

    getLogger().info('requirement.match_repository_evidence_started', {
      projectId,
      requirementId,
      sourceId: source.id,
      fileCount: indexedFiles.length,
    });

    const sha256 = crypto
      .createHash('sha256')
      .update(requirement.originalText, 'utf8')
      .digest('hex');

    const matcherInput: MatcherRequirementInput = {
      id: requirement.id,
      requirementKey: requirement.requirementKey,
      title: requirement.title,
      originalText: requirement.originalText,
      sha256,
      actor: requirement.representation?.actor ?? null,
      action: requirement.representation?.action ?? null,
      object: requirement.representation?.object ?? null,
      domain: requirement.metadata?.domain ?? null,
      module: requirement.metadata?.module ?? null,
      tags: Array.isArray(requirement.metadata?.tags)
        ? (requirement.metadata.tags as string[])
        : [],
    };

    const indexedEntities: IndexedEntityForMatching[] = indexedFiles.map(f => ({
      fileId: f.id,
      relativePath: f.relativePath,
      language: f.language,
      classification: f.classification,
      contentHash: f.contentHash,
      symbols: f.symbols.map(s => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        startLine: s.startLine,
        endLine: s.endLine,
        isExported: s.isExported,
      })),
    }));

    const matchedDrafts = RequirementRepositoryMatcher.matchRequirement(
      matcherInput,
      projectId,
      source.id,
      latestSnapshot?.id ?? null,
      indexedEntities,
    );

    // Save candidate evidence to DB
    await this.evidenceRepository.saveCandidateEvidence(projectId, requirementId, matchedDrafts);

    const storedEvidence = await this.evidenceRepository.getEvidenceForRequirement(
      projectId,
      requirementId,
    );

    const indexedFileMap = new Map<string, (typeof indexedFiles)[0]>(
      indexedFiles.map(f => [f.relativePath, f]),
    );

    const candidateDtos = storedEvidence.map(ev =>
      this.mapToDto(ev, sha256, latestSnapshot?.id ?? null, indexedFileMap),
    );

    const durationMs = Math.round(performance.now() - startTime);
    getLogger().info('requirement.match_repository_evidence_completed', {
      projectId,
      requirementId,
      matchedCount: matchedDrafts.length,
      storedCount: candidateDtos.length,
      durationMs,
    });

    return {
      matchedCount: matchedDrafts.length,
      candidateEvidence: candidateDtos,
      snapshotFingerprint: latestSnapshot?.fingerprint ?? null,
      isIndexed: true,
    };
  }

  /**
   * Retrieves all repository evidence associated with a requirement.
   */
  async getRepositoryEvidence(
    input: GetRepositoryEvidenceInput,
  ): Promise<readonly RequirementRepositoryEvidenceDto[]> {
    const { projectId, requirementId } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!requirementId || typeof requirementId !== 'string') {
      throw new ProjectValidationError('Requirement ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    const requirement = await this.requirementRepository.getRequirementById(
      projectId,
      requirementId,
    );
    if (!requirement) {
      throw new RequirementNotFoundError(
        `Requirement ${requirementId} not found in project ${projectId}.`,
      );
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    let latestSnapshotId: string | null = null;
    const indexedFileMap = new Map<string, { relativePath: string; contentHash: string | null }>();

    if (source) {
      const snapshots = await this.snapshotRepository.listSnapshotsForSource(source.id);
      latestSnapshotId = snapshots[0]?.id ?? null;

      const prisma = this.getPrisma();
      const files = await prisma.repositoryFile.findMany({
        where: { sourceId: source.id },
        select: { relativePath: true, contentHash: true },
      });
      for (const f of files) {
        indexedFileMap.set(f.relativePath, f);
      }
    }

    const sha256 = crypto
      .createHash('sha256')
      .update(requirement.originalText, 'utf8')
      .digest('hex');

    const evidenceList = await this.evidenceRepository.getEvidenceForRequirement(
      projectId,
      requirementId,
    );

    return evidenceList.map(ev => this.mapToDto(ev, sha256, latestSnapshotId, indexedFileMap));
  }

  /**
   * Reviews an evidence candidate (confirms or rejects it).
   */
  async reviewRepositoryEvidence(
    input: ReviewRepositoryEvidenceInput,
  ): Promise<RequirementRepositoryEvidenceDto> {
    const { projectId, evidenceId, status, reviewRationale } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!evidenceId || typeof evidenceId !== 'string') {
      throw new ProjectValidationError('Evidence ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError();
    }

    const existing = await this.evidenceRepository.getEvidenceById(evidenceId);
    if (!existing || existing.projectId !== projectId) {
      throw new RepositoryEvidenceNotFoundError();
    }

    const updated = await this.evidenceRepository.updateEvidenceReview(
      evidenceId,
      status,
      reviewRationale,
    );

    const sha256 = crypto
      .createHash('sha256')
      .update(updated.requirement.originalText, 'utf8')
      .digest('hex');

    return this.mapToDto(updated, sha256, updated.repositorySnapshotId, new Map());
  }

  /**
   * Manually creates and attaches confirmed repository evidence to a requirement.
   */
  async createManualRepositoryEvidence(
    input: CreateManualRepositoryEvidenceInput,
  ): Promise<RequirementRepositoryEvidenceDto> {
    const {
      projectId,
      requirementId,
      projectSourceId,
      indexedFileId,
      symbolId,
      evidenceType,
      reviewRationale,
    } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!requirementId || typeof requirementId !== 'string') {
      throw new ProjectValidationError('Requirement ID is required.');
    }
    if (!projectSourceId || typeof projectSourceId !== 'string') {
      throw new ProjectValidationError('Project Source ID is required.');
    }
    if (!indexedFileId || typeof indexedFileId !== 'string') {
      throw new ProjectValidationError('Indexed File ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError();
    }

    const requirement = await this.requirementRepository.getRequirementById(
      projectId,
      requirementId,
    );
    if (!requirement) {
      throw new RequirementNotFoundError(
        `Requirement ${requirementId} not found in project ${projectId}.`,
      );
    }

    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source || source.id !== projectSourceId) {
      throw new RepositoryEvidenceNotAuthorizedError(
        'Project source does not match active project.',
      );
    }

    const prisma = this.getPrisma();
    const indexedFile = await prisma.repositoryFile.findUnique({
      where: { id: indexedFileId },
      include: { symbols: true },
    });

    if (!indexedFile || indexedFile.sourceId !== projectSourceId) {
      throw new RepositoryEvidenceNotAuthorizedError(
        'Indexed file does not belong to the project source.',
      );
    }

    let targetSymbol: (typeof indexedFile.symbols)[0] | null = null;
    if (symbolId) {
      targetSymbol = indexedFile.symbols.find(s => s.id === symbolId) ?? null;
      if (!targetSymbol) {
        throw new RepositoryEvidenceNotAuthorizedError(
          'Symbol does not belong to the selected indexed file.',
        );
      }
    }

    const snapshots = await this.snapshotRepository.listSnapshotsForSource(source.id);
    const latestSnapshot = snapshots[0] ?? null;

    const sha256 = crypto
      .createHash('sha256')
      .update(requirement.originalText, 'utf8')
      .digest('hex');

    const created = await this.evidenceRepository.createManualEvidence({
      projectId,
      requirementId,
      projectSourceId,
      repositorySnapshotId: latestSnapshot?.id ?? null,
      indexedFileId: indexedFile.id,
      symbolId: targetSymbol?.id ?? null,
      evidenceType,
      filePath: indexedFile.relativePath,
      symbolName: targetSymbol?.name ?? null,
      lineStart: targetSymbol?.startLine ?? null,
      lineEnd: targetSymbol?.endLine ?? null,
      fileContentHash: indexedFile.contentHash,
      sourceRequirementTextSha256: sha256,
      reviewRationale: reviewRationale ?? null,
    });

    return this.mapToDto(created, sha256, latestSnapshot?.id ?? null, new Map());
  }

  /**
   * Deletes an evidence record.
   */
  async deleteRepositoryEvidence(
    input: DeleteRepositoryEvidenceInput,
  ): Promise<{ readonly deleted: true }> {
    const { projectId, evidenceId } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!evidenceId || typeof evidenceId !== 'string') {
      throw new ProjectValidationError('Evidence ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError();
    }

    const existing = await this.evidenceRepository.getEvidenceById(evidenceId);
    if (!existing || existing.projectId !== projectId) {
      throw new RepositoryEvidenceNotFoundError();
    }

    await this.evidenceRepository.deleteEvidence(evidenceId);

    getLogger().info('requirement.evidence_deleted', {
      projectId,
      evidenceId,
    });

    return { deleted: true };
  }

  /**
   * Securely generates a bounded source preview for a linked evidence record.
   */
  async previewRepositoryEvidence(
    input: PreviewRepositoryEvidenceInput,
  ): Promise<EvidencePreviewDto> {
    const { projectId, evidenceId } = input;

    if (!projectId || typeof projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!evidenceId || typeof evidenceId !== 'string') {
      throw new ProjectValidationError('Evidence ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    const evidence = await this.evidenceRepository.getEvidenceById(evidenceId);
    if (!evidence || evidence.projectId !== projectId) {
      throw new RepositoryEvidenceNotFoundError();
    }

    // Read securely through V2 secure content gateway
    const contentResult = await this.contentService.readSourceFile(projectId, evidence.filePath);

    if (contentResult.status !== 'AVAILABLE' || !contentResult.content) {
      return {
        filePath: evidence.filePath,
        content: `// Source file content unavailable (${contentResult.status})`,
        lineStart: 1,
        lineEnd: 1,
        totalLines: 0,
        isTruncated: false,
        language: contentResult.language,
      };
    }

    const allLines = contentResult.content.split(/\r?\n/);
    const totalLines = allLines.length;

    let targetStart = 1;
    let targetEnd = Math.min(totalLines, MAX_PREVIEW_LINES);

    if (evidence.lineStart && evidence.lineStart > 0) {
      const symStart = evidence.lineStart;
      const symEnd = evidence.lineEnd && evidence.lineEnd >= symStart ? evidence.lineEnd : symStart;
      const symSpan = symEnd - symStart + 1;

      if (symSpan <= MAX_PREVIEW_LINES) {
        // Center the symbol with surrounding context
        const padding = Math.floor((MAX_PREVIEW_LINES - symSpan) / 2);
        targetStart = Math.max(1, symStart - padding);
        targetEnd = Math.min(totalLines, targetStart + MAX_PREVIEW_LINES - 1);
      } else {
        targetStart = symStart;
        targetEnd = Math.min(totalLines, symStart + MAX_PREVIEW_LINES - 1);
      }
    }

    const selectedLines = allLines.slice(targetStart - 1, targetEnd);
    let previewText = selectedLines.join('\n');
    let isTruncated = targetStart > 1 || targetEnd < totalLines;

    if (previewText.length > MAX_PREVIEW_CHARS) {
      previewText = previewText.substring(0, MAX_PREVIEW_CHARS) + '\n... [truncated]';
      isTruncated = true;
    }

    return {
      filePath: evidence.filePath,
      content: previewText,
      lineStart: targetStart,
      lineEnd: targetEnd,
      totalLines,
      isTruncated,
      language: contentResult.language,
    };
  }

  /**
   * Maps evidence entity to DTO with live staleness indicators.
   */
  private mapToDto(
    ev: EvidenceWithRelations,
    currentSha256: string,
    currentSnapshotId: string | null,
    indexedFileMap: Map<string, { relativePath: string; contentHash: string | null }>,
  ): RequirementRepositoryEvidenceDto {
    const isMissingInSnapshot = indexedFileMap.size > 0 && !indexedFileMap.has(ev.filePath);

    const indexedFile = indexedFileMap.get(ev.filePath);
    const isStale =
      ev.sourceRequirementTextSha256 !== currentSha256 ||
      (currentSnapshotId !== null && ev.repositorySnapshotId !== currentSnapshotId) ||
      (indexedFile !== undefined && indexedFile.contentHash !== ev.fileContentHash);

    return {
      id: ev.id,
      projectId: ev.projectId,
      requirementId: ev.requirementId,
      requirementKey: ev.requirement.requirementKey,
      projectSourceId: ev.projectSourceId,
      repositorySnapshotId: ev.repositorySnapshotId,
      indexedFileId: ev.indexedFileId,
      symbolId: ev.symbolId,
      evidenceType: ev.evidenceType,
      filePath: ev.filePath,
      symbolName: ev.symbolName,
      lineStart: ev.lineStart,
      lineEnd: ev.lineEnd,
      fileContentHash: ev.fileContentHash,
      evidenceScore: ev.evidenceScore,
      reasonCodes: (Array.isArray(ev.reasonCodes) ? ev.reasonCodes : []) as string[],
      matchMethod: ev.matchMethod,
      status: ev.status,
      sourceRequirementTextSha256: ev.sourceRequirementTextSha256,
      matcherVersion: ev.matcherVersion,
      reviewRationale: ev.reviewRationale,
      isStale,
      isMissingInSnapshot,
      createdAt: ev.createdAt.toISOString(),
      updatedAt: ev.updatedAt.toISOString(),
    };
  }
}
