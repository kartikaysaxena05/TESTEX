/**
 * @file packages/core/src/requirements/requirement-document-service.ts
 * Core domain service for ingesting, validating, storing, and managing SRS requirement documents.
 *
 * SCOPE BOUNDARY (Phase 33):
 * - File validation, size limits, format signatures, streaming SHA-256 calculation.
 * - Application-managed storage with atomic rollback on failure.
 * - Exact duplicate detection by SHA-256 per project.
 * - RequirementSource (DOCUMENT) and RequirementDocument metadata persistence.
 * - ZERO text extraction, ZERO AI, ZERO automatic requirement generation.
 */

import crypto from 'node:crypto';
import { ProjectRepository } from '../projects/project-repository.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../projects/project-errors.js';
import { RequirementDocumentRepository } from './requirement-document-repository.js';
import { DocumentStorage } from './document-storage.js';
import { validateDocumentFile, DocumentValidationError } from './document-validator.js';
import {
  DocumentNotFoundError,
  DocumentDuplicateError,
  DocumentFormatError,
  DocumentTooLargeError,
  DocumentInUseError,
} from './requirement-errors.js';
import { RequirementProvenanceRepository } from './provenance/requirement-provenance-repository.js';
import { getLogger } from '../logging/logger.js';
import type {
  RequirementDocumentDto,
  IngestDocumentDirectInput,
  ListRequirementDocumentsInput,
  GetRequirementDocumentInput,
  DeleteRequirementDocumentInput,
} from '@ai-quality/contracts';

export class RequirementDocumentService {
  private readonly projectRepo: ProjectRepository;
  private readonly documentRepo: RequirementDocumentRepository;
  private readonly documentStorage: DocumentStorage;
  private readonly provenanceRepo: RequirementProvenanceRepository;

  constructor(
    projectRepo?: ProjectRepository,
    documentRepo?: RequirementDocumentRepository,
    documentStorage?: DocumentStorage,
    provenanceRepo?: RequirementProvenanceRepository,
  ) {
    this.projectRepo = projectRepo ?? new ProjectRepository();
    this.documentRepo = documentRepo ?? new RequirementDocumentRepository();
    this.documentStorage = documentStorage ?? new DocumentStorage();
    this.provenanceRepo = provenanceRepo ?? new RequirementProvenanceRepository();
  }

  /**
   * Validates, hashes, stores, and ingests a requirement document file for a project.
   */
  async ingestDocument(input: IngestDocumentDirectInput): Promise<RequirementDocumentDto> {
    return this.ingestDocumentDirect(input);
  }

  /**
   * Ingests a requirement document into application-managed storage and creates DB records.
   * NEVER modifies or deletes the user's original external file.
   */
  async ingestDocumentDirect(input: IngestDocumentDirectInput): Promise<RequirementDocumentDto> {
    const startTime = Date.now();

    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError();
    }

    let header;
    try {
      header = await validateDocumentFile(input.absoluteSourcePath);
    } catch (err: unknown) {
      if (err instanceof DocumentValidationError) {
        if (err.code === 'DOCUMENT_TOO_LARGE') {
          throw new DocumentTooLargeError(err.message);
        }
        if (err.code === 'DOCUMENT_NOT_FOUND') {
          throw new DocumentNotFoundError(err.message);
        }
        throw new DocumentFormatError(err.message);
      }
      throw err;
    }

    const staged = await this.documentStorage.stageAndHashFile(input.absoluteSourcePath);

    try {
      const existing = await this.documentRepo.getDocumentBySha256(input.projectId, staged.sha256);
      if (existing) {
        throw new DocumentDuplicateError(
          `An identical requirement document ('${existing.originalFileName}', SHA-256: ${staged.sha256.slice(0, 8)}...) is already attached to this project.`,
        );
      }

      const documentId = crypto.randomUUID();
      const storageKey = `${documentId}.${header.fileExtension}`;

      await this.documentStorage.commitStagedFile(
        staged.stagingFilePath,
        input.projectId,
        storageKey,
      );

      try {
        const doc = await this.documentRepo.createDocument({
          id: documentId,
          projectId: input.projectId,
          originalFileName: header.originalFileName,
          storageKey,
          fileExtension: header.fileExtension,
          mimeType: header.mimeType,
          fileSize: staged.byteSize,
          sha256: staged.sha256,
          sourceName: input.sourceName,
        });

        getLogger().info('requirement_document.ingested', {
          projectId: input.projectId,
          documentId: doc.id,
          sourceId: doc.requirementSourceId,
          format: doc.fileExtension,
          fileSize: doc.fileSize,
          sha256Prefix: doc.sha256.slice(0, 8),
          durationMs: Date.now() - startTime,
        });

        return doc;
      } catch (dbErr: unknown) {
        await this.documentStorage.deleteManagedFile(input.projectId, storageKey);
        throw dbErr;
      }
    } catch (err: unknown) {
      await this.documentStorage.cleanupStagingFile(staged.stagingFilePath);
      throw err;
    }
  }

  /**
   * Lists all requirement documents attached to a project.
   */
  async listDocuments(
    input: ListRequirementDocumentsInput,
  ): Promise<readonly RequirementDocumentDto[]> {
    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    return await this.documentRepo.listDocuments(input.projectId);
  }

  /**
   * Gets a specific requirement document by ID within a project.
   */
  async getDocument(input: GetRequirementDocumentInput): Promise<RequirementDocumentDto | null> {
    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    return await this.documentRepo.getDocument(input.projectId, input.documentId);
  }

  /**
   * Deletes a requirement document, its parent RequirementSource, and managed storage copy.
   * NEVER touches or deletes the user's original external source file.
   */
  async deleteDocument(input: DeleteRequirementDocumentInput): Promise<{ readonly deleted: true }> {
    const project = await this.projectRepo.getProjectById(input.projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError();
    }

    // Safety check: protect provenance evidence
    const hasDependents = await this.provenanceRepo.hasDependentsOnDocument(input.documentId);
    if (hasDependents) {
      throw new DocumentInUseError(
        `Cannot delete requirement document '${input.documentId}' because one or more active requirements depend on it for audit provenance.`,
      );
    }

    const res = await this.documentRepo.deleteDocument(input.projectId, input.documentId);
    if (!res) {
      throw new DocumentNotFoundError(
        `Requirement document with ID '${input.documentId}' not found.`,
      );
    }

    // Delete managed file copy only
    await this.documentStorage.deleteManagedFile(input.projectId, res.storageKey);

    getLogger().info('requirement_document.deleted', {
      projectId: input.projectId,
      documentId: input.documentId,
    });

    return { deleted: true };
  }

  /**
   * Verifies if managed storage copy is intact on disk.
   */
  async verifyManagedFile(projectId: string, documentId: string): Promise<boolean> {
    const doc = await this.documentRepo.getDocument(projectId, documentId);
    if (!doc) {
      return false;
    }
    return await this.documentStorage.checkManagedFileExists(projectId, doc.storageKey);
  }
}
