/**
 * @file packages/core/src/requirements/requirement-document-repository.ts
 * PostgreSQL repository for RequirementDocument entities and transactional link to RequirementSource.
 */

import { getPrismaClient } from '../database/client.js';
import type { RequirementDocumentDto } from '@ai-quality/contracts';

export interface CreateRequirementDocumentRecordInput {
  readonly id: string;
  readonly projectId: string;
  readonly originalFileName: string;
  readonly storageKey: string;
  readonly fileExtension: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly sha256: string;
  readonly sourceName?: string;
}

export class RequirementDocumentRepository {
  /**
   * Transactionally creates a RequirementSource (DOCUMENT) and RequirementDocument record.
   */
  async createDocument(
    input: CreateRequirementDocumentRecordInput,
  ): Promise<RequirementDocumentDto> {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }

    return await prisma.$transaction(async tx => {
      // Create parent RequirementSource record
      const source = await tx.requirementSource.create({
        data: {
          projectId: input.projectId,
          name: input.sourceName || input.originalFileName,
          sourceType: 'DOCUMENT',
          status: 'ACTIVE',
          description: `Ingested document: ${input.originalFileName} (${input.fileExtension.toUpperCase()})`,
          metadata: {
            originalFileName: input.originalFileName,
            fileSize: input.fileSize,
            sha256: input.sha256,
          },
        },
      });

      // Create RequirementDocument record
      const doc = await tx.requirementDocument.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          requirementSourceId: source.id,
          originalFileName: input.originalFileName,
          storageKey: input.storageKey,
          fileExtension: input.fileExtension,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          sha256: input.sha256,
        },
      });

      return {
        id: doc.id,
        projectId: doc.projectId,
        requirementSourceId: doc.requirementSourceId,
        originalFileName: doc.originalFileName,
        storageKey: doc.storageKey,
        fileExtension: doc.fileExtension,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        sha256: doc.sha256,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Lists all requirement documents for a project ordered by creation time descending.
   */
  async listDocuments(projectId: string): Promise<readonly RequirementDocumentDto[]> {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }

    const docs = await prisma.requirementDocument.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return docs.map(doc => ({
      id: doc.id,
      projectId: doc.projectId,
      requirementSourceId: doc.requirementSourceId,
      originalFileName: doc.originalFileName,
      storageKey: doc.storageKey,
      fileExtension: doc.fileExtension,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      sha256: doc.sha256,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }));
  }

  /**
   * Gets a requirement document by ID within a project.
   */
  async getDocument(projectId: string, documentId: string): Promise<RequirementDocumentDto | null> {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }

    const doc = await prisma.requirementDocument.findFirst({
      where: { id: documentId, projectId },
    });

    if (!doc) {
      return null;
    }

    return {
      id: doc.id,
      projectId: doc.projectId,
      requirementSourceId: doc.requirementSourceId,
      originalFileName: doc.originalFileName,
      storageKey: doc.storageKey,
      fileExtension: doc.fileExtension,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      sha256: doc.sha256,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  /**
   * Gets a requirement document by project and SHA-256 hash for duplicate detection.
   */
  async getDocumentBySha256(
    projectId: string,
    sha256: string,
  ): Promise<RequirementDocumentDto | null> {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }

    const doc = await prisma.requirementDocument.findFirst({
      where: { projectId, sha256 },
    });

    if (!doc) {
      return null;
    }

    return {
      id: doc.id,
      projectId: doc.projectId,
      requirementSourceId: doc.requirementSourceId,
      originalFileName: doc.originalFileName,
      storageKey: doc.storageKey,
      fileExtension: doc.fileExtension,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      sha256: doc.sha256,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  /**
   * Deletes a requirement document and its associated RequirementSource record.
   */
  async deleteDocument(
    projectId: string,
    documentId: string,
  ): Promise<{ readonly deleted: true; readonly storageKey: string } | null> {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }

    return await prisma.$transaction(async tx => {
      const doc = await tx.requirementDocument.findFirst({
        where: { id: documentId, projectId },
      });

      if (!doc) {
        return null;
      }

      // Delete requirement document
      await tx.requirementDocument.delete({
        where: { id: doc.id },
      });

      // Delete associated requirement source
      await tx.requirementSource
        .delete({
          where: { id: doc.requirementSourceId },
        })
        .catch(() => {});

      return {
        deleted: true,
        storageKey: doc.storageKey,
      };
    });
  }
}
