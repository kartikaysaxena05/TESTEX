/**
 * @file packages/core/src/requirements/candidate-detection/requirement-candidate-service.ts
 * Domain service for requirement candidate detection, review lifecycle, and atomic transactional import.
 */

import { getLogger } from '../../logging/index.js';
import { getPrismaClient } from '../../database/client.js';
import type { Prisma } from '@prisma/client';
import { ProjectRepository } from '../../projects/project-repository.js';
import { RequirementDocumentRepository } from '../requirement-document-repository.js';
import { RequirementDocumentExtractionRepository } from '../extraction/requirement-document-extraction-repository.js';
import { RequirementCandidateRepository } from './requirement-candidate-repository.js';
import { RequirementCandidateDetector } from './requirement-candidate-detector.js';
import { RequirementDiffEngine } from '../versioning/requirement-diff-engine.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../../projects/project-errors.js';
import {
  DocumentNotFoundError,
  ExtractionNotFoundError,
  CandidateNotFoundError,
  NoApprovedCandidatesError,
  CandidateAlreadyImportedError,
} from '../requirement-errors.js';
import type {
  RequirementCandidateDto,
  RequirementCandidateListDto,
  DetectRequirementCandidatesInput,
  ListRequirementCandidatesInput,
  UpdateRequirementCandidateInput,
  SetRequirementCandidateStatusInput,
  ImportApprovedCandidatesInput,
  ImportCandidatesResultDto,
  RequirementType,
  RequirementPriority,
  RequirementStatus,
} from '@ai-quality/contracts';

export class RequirementCandidateService {
  constructor(
    private readonly projectRepo: ProjectRepository = new ProjectRepository(),
    private readonly docRepo: RequirementDocumentRepository = new RequirementDocumentRepository(),
    private readonly extractionRepo: RequirementDocumentExtractionRepository = new RequirementDocumentExtractionRepository(),
    private readonly candidateRepo: RequirementCandidateRepository = new RequirementCandidateRepository(),
    private readonly detector: RequirementCandidateDetector = new RequirementCandidateDetector(),
  ) {}

  /**
   * Detects requirement candidates from a document's structured Phase-34 extraction.
   */
  async detectCandidates(
    input: DetectRequirementCandidatesInput,
  ): Promise<RequirementCandidateDto[]> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.documentId || typeof input.documentId !== 'string') {
      throw new ProjectValidationError('Document ID is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${input.projectId}' not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError(
        'Cannot detect requirement candidates in an archived project.',
      );
    }

    const document = await this.docRepo.getDocument(input.projectId, input.documentId);
    if (!document) {
      throw new DocumentNotFoundError(`Document '${input.documentId}' not found in this project.`);
    }

    const extraction = await this.extractionRepo.findByDocumentId(
      input.projectId,
      input.documentId,
    );
    if (!extraction) {
      throw new ExtractionNotFoundError(
        'Document has not been extracted yet. Please extract text and structure first.',
      );
    }

    getLogger().info('requirement.candidate_detection_started', {
      projectId: input.projectId,
      documentId: input.documentId,
      format: extraction.format,
      detectorVersion: this.detector.version,
    });

    const detectionResult = this.detector.detectCandidates(extraction);

    const saved = await this.candidateRepo.saveDetectedCandidates(
      input.projectId,
      input.documentId,
      extraction.id,
      extraction.sourceSha256,
      this.detector.version,
      detectionResult.candidates,
      input.force ?? false,
    );

    getLogger().info('requirement.candidate_detection_completed', {
      projectId: input.projectId,
      documentId: input.documentId,
      detectedCount: saved.length,
      detectorVersion: this.detector.version,
    });

    return saved;
  }

  /**
   * Lists requirement candidates for a document with optional status filter and text search.
   */
  async listCandidates(
    input: ListRequirementCandidatesInput,
  ): Promise<RequirementCandidateListDto> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.documentId || typeof input.documentId !== 'string') {
      throw new ProjectValidationError('Document ID is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${input.projectId}' not found.`);
    }

    const document = await this.docRepo.getDocument(input.projectId, input.documentId);
    if (!document) {
      throw new DocumentNotFoundError(`Document '${input.documentId}' not found in this project.`);
    }

    const [candidates, counts] = await Promise.all([
      this.candidateRepo.listByDocument(
        input.projectId,
        input.documentId,
        input.status,
        input.search,
      ),
      this.candidateRepo.countByStatus(input.projectId, input.documentId),
    ]);

    return {
      candidates,
      totalCount: counts.totalCount,
      pendingCount: counts.pendingCount,
      approvedCount: counts.approvedCount,
      rejectedCount: counts.rejectedCount,
      importedCount: counts.importedCount,
    };
  }

  /**
   * Updates reviewed text for a provisional candidate while preserving immutable source text.
   */
  async updateCandidate(input: UpdateRequirementCandidateInput): Promise<RequirementCandidateDto> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.candidateId || typeof input.candidateId !== 'string') {
      throw new ProjectValidationError('Candidate ID is required.');
    }

    const text = input.reviewedText?.trim();
    if (!text) {
      throw new ProjectValidationError('Reviewed text cannot be empty.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${input.projectId}' not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot edit candidates in an archived project.');
    }

    const candidate = await this.candidateRepo.findById(input.projectId, input.candidateId);
    if (!candidate) {
      throw new CandidateNotFoundError(
        `Candidate '${input.candidateId}' not found in this project.`,
      );
    }

    if (candidate.reviewStatus === 'IMPORTED') {
      throw new CandidateAlreadyImportedError('Cannot edit an already imported candidate.');
    }

    const updated = await this.candidateRepo.updateReviewedText(
      input.projectId,
      input.candidateId,
      text,
    );

    if (!updated) {
      throw new CandidateNotFoundError(`Candidate '${input.candidateId}' not found.`);
    }

    return updated;
  }

  /**
   * Updates review status (PENDING, APPROVED, REJECTED) for a batch of candidates.
   */
  async setCandidateStatus(
    input: SetRequirementCandidateStatusInput,
  ): Promise<RequirementCandidateDto[]> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (
      !input.candidateIds ||
      !Array.isArray(input.candidateIds) ||
      input.candidateIds.length === 0
    ) {
      throw new ProjectValidationError('At least one candidate ID is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${input.projectId}' not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot update candidate status in an archived project.');
    }

    // Verify all candidates belong to project and none are already imported
    for (const cid of input.candidateIds) {
      const cand = await this.candidateRepo.findById(input.projectId, cid);
      if (!cand) {
        throw new CandidateNotFoundError(`Candidate '${cid}' not found in this project.`);
      }
      if (cand.reviewStatus === 'IMPORTED') {
        throw new CandidateAlreadyImportedError(`Candidate '${cid}' has already been imported.`);
      }
    }

    return await this.candidateRepo.updateStatusBatch(
      input.projectId,
      [...input.candidateIds],
      input.status,
    );
  }

  /**
   * Atomically imports approved candidates into real DRAFT Requirement records.
   */
  async importApprovedCandidates(
    input: ImportApprovedCandidatesInput,
  ): Promise<ImportCandidatesResultDto> {
    if (!input.projectId || typeof input.projectId !== 'string') {
      throw new ProjectValidationError('Project ID is required.');
    }
    if (!input.documentId || typeof input.documentId !== 'string') {
      throw new ProjectValidationError('Document ID is required.');
    }

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project '${input.projectId}' not found.`);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot import candidates into an archived project.');
    }

    const document = await this.docRepo.getDocument(input.projectId, input.documentId);
    if (!document) {
      throw new DocumentNotFoundError(`Document '${input.documentId}' not found in this project.`);
    }

    // Fetch candidate records
    let eligibleCandidates = await this.candidateRepo.listByDocument(
      input.projectId,
      input.documentId,
      'APPROVED',
    );

    if (input.candidateIds && input.candidateIds.length > 0) {
      const allowedSet = new Set(input.candidateIds);
      eligibleCandidates = eligibleCandidates.filter(c => allowedSet.has(c.id));
    }

    if (eligibleCandidates.length === 0) {
      throw new NoApprovedCandidatesError('No approved requirement candidates found to import.');
    }

    // Check for any candidate already imported
    for (const cand of eligibleCandidates) {
      if (cand.importedRequirementId) {
        throw new CandidateAlreadyImportedError(
          `Candidate '${cand.id}' has already been imported into requirement '${cand.importedRequirementId}'.`,
        );
      }
    }

    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }

    const countToImport = eligibleCandidates.length;

    // Run atomic transactional import
    const result = await prisma.$transaction(async tx => {
      // 1. Initialize or update sequence atomically
      let sequence = await tx.projectRequirementSequence.findUnique({
        where: { projectId: input.projectId },
      });

      if (!sequence) {
        const existingReqs = await tx.requirement.findMany({
          where: { projectId: input.projectId },
          select: { requirementKey: true },
        });

        let maxIndex = 0;
        for (const req of existingReqs) {
          const match = /^REQ-(\d+)$/i.exec(req.requirementKey);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (num > maxIndex) maxIndex = num;
          }
        }

        try {
          sequence = await tx.projectRequirementSequence.create({
            data: {
              projectId: input.projectId,
              nextValue: maxIndex + 1,
            },
          });
        } catch {
          sequence = await tx.projectRequirementSequence.findUnique({
            where: { projectId: input.projectId },
          });
        }
      }

      const updatedSeq = await tx.projectRequirementSequence.update({
        where: { projectId: input.projectId },
        data: { nextValue: { increment: countToImport } },
      });

      const baseSeqNum = updatedSeq.nextValue - countToImport;
      const createdList: { id: string; requirementKey: string; title: string }[] = [];

      for (let i = 0; i < eligibleCandidates.length; i++) {
        const cand = eligibleCandidates[i]!;
        const allocatedNum = baseSeqNum + i;
        const requirementKey = `REQ-${String(allocatedNum).padStart(3, '0')}`;
        const candidateText = (cand.reviewedText || cand.sourceText).trim();

        let title = candidateText.slice(0, 80).trim();
        if (cand.externalKey) {
          title = `[${cand.externalKey}] ${title}`.slice(0, 80).trim();
        }

        const createdReq = await tx.requirement.create({
          data: {
            projectId: input.projectId,
            requirementSourceId: document.requirementSourceId,
            requirementKey,
            title,
            originalText: candidateText,
            status: 'DRAFT',
            type: 'UNKNOWN',
            priority: 'UNSPECIFIED',
          },
        });

        let locationKind: 'NONE' | 'DOCUMENT_BLOCK' | 'TABLE_ROW' | 'PDF_PAGE' = 'NONE';
        if (cand.sourceTableId) locationKind = 'TABLE_ROW';
        else if (cand.sourceBlockId) locationKind = 'DOCUMENT_BLOCK';
        else if (cand.pageNumber) locationKind = 'PDF_PAGE';

        await tx.requirementProvenance.create({
          data: {
            projectId: input.projectId,
            requirementId: createdReq.id,
            requirementSourceId: document.requirementSourceId,
            sourceKind: 'DOCUMENT',
            locationKind,
            candidateId: cand.id,
            documentId: document.id,
            extractionId: cand.extractionId,
            sourceBlockId: cand.sourceBlockId,
            sourceTableId: cand.sourceTableId,
            sourceRowIndex: cand.sourceRowIndex,
            sectionId: cand.sectionId,
            sectionPath: cand.sectionPath,
            pageNumber: cand.pageNumber,
            lineStart: cand.lineStart,
            lineEnd: cand.lineEnd,
            startOffset: cand.startOffset,
            endOffset: cand.endOffset,
            sourceText: cand.sourceText,
            reviewedText: cand.reviewedText,
            externalRequirementKey: cand.externalKey,
            sourceSha256: cand.sourceSha256,
            detectorVersion: cand.detectorVersion,
            detectionReasons: (cand.detectionReasons as unknown as Prisma.InputJsonValue) ?? [],
            detectionScore: cand.detectionScore,
            completeness: 'COMPLETE',
          },
        });

        await tx.requirementCandidate.update({
          where: { id: cand.id },
          data: {
            reviewStatus: 'IMPORTED',
            importedRequirementId: createdReq.id,
          },
        });

        // Atomically create baseline RequirementVersion 1
        const sha256 = RequirementDiffEngine.computeCanonicalContentHash({
          title: createdReq.title,
          originalText: createdReq.originalText,
          type: createdReq.type as RequirementType,
          priority: createdReq.priority as RequirementPriority,
          status: createdReq.status as RequirementStatus,
        });

        await tx.requirementVersion.create({
          data: {
            projectId: createdReq.projectId,
            requirementId: createdReq.id,
            versionNumber: 1,
            requirementKeySnapshot: createdReq.requirementKey,
            title: createdReq.title,
            originalText: createdReq.originalText,
            type: createdReq.type,
            priority: createdReq.priority,
            status: createdReq.status,
            sourceRequirementTextSha256: sha256,
            changeKind: 'CREATED',
            changeReason: 'Imported from SRS candidate extraction',
            changedFields: [],
            createdByActorId: null,
          },
        });

        createdList.push({
          id: createdReq.id,
          requirementKey: createdReq.requirementKey,
          title: createdReq.title,
        });
      }

      return {
        importedCount: createdList.length,
        createdRequirements: createdList,
      };
    });

    getLogger().info('requirement.candidates_imported', {
      projectId: input.projectId,
      documentId: input.documentId,
      importedCount: result.importedCount,
    });

    return result;
  }
}
