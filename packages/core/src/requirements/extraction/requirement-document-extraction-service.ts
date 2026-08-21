/**
 * @file packages/core/src/requirements/extraction/requirement-document-extraction-service.ts
 * Core domain service orchestrating requirement document text and structure extraction.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import type {
  ExtractRequirementDocumentInput,
  GetRequirementDocumentExtractionInput,
  RequirementDocumentExtractionDto,
} from '@ai-quality/contracts';
import { ProjectRepository } from '../../projects/project-repository.js';
import { ProjectNotFoundError, ProjectArchivedError } from '../../projects/project-errors.js';
import { RequirementDocumentRepository } from '../requirement-document-repository.js';
import { DocumentStorage } from '../document-storage.js';
import { RequirementDocumentExtractionRepository } from './requirement-document-extraction-repository.js';
import { ExtractorRegistry } from './extractor-registry.js';
import { EXTRACTOR_VERSION } from './extraction-types.js';
import {
  DocumentNotFoundError,
  DocumentFileMissingError,
  DocumentIntegrityMismatchError,
} from '../requirement-errors.js';
import { getLogger } from '../../logging/logger.js';

export class RequirementDocumentExtractionService {
  private readonly projectRepository: ProjectRepository;
  private readonly documentRepository: RequirementDocumentRepository;
  private readonly extractionRepository: RequirementDocumentExtractionRepository;
  private readonly storage: DocumentStorage;
  private readonly extractorRegistry: ExtractorRegistry;

  constructor(
    projectRepository?: ProjectRepository,
    documentRepository?: RequirementDocumentRepository,
    extractionRepository?: RequirementDocumentExtractionRepository,
    storage?: DocumentStorage,
    extractorRegistry?: ExtractorRegistry,
  ) {
    this.projectRepository = projectRepository ?? new ProjectRepository();
    this.documentRepository = documentRepository ?? new RequirementDocumentRepository();
    this.extractionRepository =
      extractionRepository ?? new RequirementDocumentExtractionRepository();
    this.storage = storage ?? new DocumentStorage();
    this.extractorRegistry = extractorRegistry ?? new ExtractorRegistry();
  }

  async extractDocument(
    input: ExtractRequirementDocumentInput,
  ): Promise<RequirementDocumentExtractionDto> {
    const { projectId, documentId, force } = input;

    // 1. Verify Project
    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }
    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError(projectId);
    }

    // 2. Verify Document Ownership
    const document = await this.documentRepository.getDocument(projectId, documentId);
    if (!document) {
      throw new DocumentNotFoundError(
        `Requirement document '${documentId}' was not found in project '${projectId}'.`,
      );
    }

    // 3. Check for existing current extraction (unless force is requested)
    if (!force) {
      const existing = await this.extractionRepository.findByDocumentId(projectId, documentId);
      if (
        existing &&
        existing.sourceSha256 === document.sha256 &&
        existing.extractorVersion === EXTRACTOR_VERSION
      ) {
        getLogger().info('requirement.document_extraction_reused', {
          projectId,
          documentId,
          status: existing.status,
        });
        return existing;
      }
    }

    // 4. Resolve Managed Storage Path
    const managedPath = this.storage.getManagedFilePath(projectId, document.storageKey);

    // 5. Check File Exists
    if (!fs.existsSync(managedPath)) {
      getLogger().error('requirement.document_file_missing', {
        projectId,
        documentId,
        storageKey: document.storageKey,
      });
      throw new DocumentFileMissingError(
        `Managed document file '${document.storageKey}' is missing from platform storage.`,
      );
    }

    // 6. Read Bytes and Verify SHA-256 Integrity
    const fileBuffer = await fs.promises.readFile(managedPath);
    const actualSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    if (actualSha256 !== document.sha256) {
      getLogger().error('requirement.document_integrity_mismatch', {
        projectId,
        documentId,
        expectedSha256: document.sha256,
        actualSha256,
      });
      throw new DocumentIntegrityMismatchError(
        `Integrity mismatch for document '${document.originalFileName}': expected SHA-256 ${document.sha256}, calculated ${actualSha256}.`,
      );
    }

    // 7. Select Format Extractor
    const extractor = this.extractorRegistry.getExtractor(document.fileExtension);

    getLogger().info('requirement.document_extraction_started', {
      projectId,
      documentId,
      format: document.fileExtension,
      fileSize: fileBuffer.length,
      extractorVersion: EXTRACTOR_VERSION,
    });

    // 8. Execute Extraction
    const extractedData = await extractor.extract({
      filePath: managedPath,
      fileBuffer,
      fileName: document.originalFileName,
      mimeType: document.mimeType,
      documentId,
      projectId,
    });

    // 9. Persist Extracted Representation
    const persisted = await this.extractionRepository.upsertExtraction(
      projectId,
      documentId,
      document.sha256,
      extractedData,
    );

    getLogger().info('requirement.document_extraction_completed', {
      projectId,
      documentId,
      status: persisted.status,
      blocks: persisted.blockCount,
      headings: persisted.headingCount,
      sections: persisted.sectionCount,
      tables: persisted.tableCount,
      pages: persisted.pageCount,
      characterCount: persisted.characterCount,
      lineCount: persisted.lineCount,
      warningsCount: persisted.warnings.length,
    });

    return persisted;
  }

  async getExtraction(
    input: GetRequirementDocumentExtractionInput,
  ): Promise<RequirementDocumentExtractionDto | null> {
    const { projectId, documentId } = input;

    // Verify project exists
    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    // Verify document ownership
    const document = await this.documentRepository.getDocument(projectId, documentId);
    if (!document) {
      return null;
    }

    return await this.extractionRepository.findByDocumentId(projectId, documentId);
  }
}
