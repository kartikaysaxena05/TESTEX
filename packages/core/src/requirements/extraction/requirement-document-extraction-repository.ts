/**
 * @file packages/core/src/requirements/extraction/requirement-document-extraction-repository.ts
 * PostgreSQL repository for persisting and retrieving requirement document extraction records.
 */

import { getPrismaClient } from '../../database/client.js';
import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  RequirementDocumentExtractionDto,
  ExtractionStatus,
  DocumentBlockDto,
  DocumentPageDto,
  DocumentHeadingDto,
  DocumentSectionDto,
  DocumentTableDto,
  ExtractionWarningDto,
  SupportedDocumentFormat,
} from '@ai-quality/contracts';
import type { ExtractedDocument } from './extraction-types.js';

export class RequirementDocumentExtractionRepository {
  constructor(private readonly prisma?: PrismaClient) {}

  private getPrisma(): PrismaClient {
    if (this.prisma) {
      return this.prisma;
    }
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    return client;
  }

  async findByDocumentId(
    projectId: string,
    requirementDocumentId: string,
  ): Promise<RequirementDocumentExtractionDto | null> {
    const prisma = this.getPrisma();
    const record = await prisma.requirementDocumentExtraction.findFirst({
      where: {
        projectId,
        requirementDocumentId,
      },
    });

    if (!record) return null;
    return this.mapToDto(record);
  }

  async upsertExtraction(
    projectId: string,
    requirementDocumentId: string,
    sourceSha256: string,
    data: ExtractedDocument,
  ): Promise<RequirementDocumentExtractionDto> {
    const prisma = this.getPrisma();
    const blocksJson = data.blocks as unknown as Prisma.InputJsonValue;
    const pagesJson = data.pages as unknown as Prisma.InputJsonValue;
    const headingsJson = data.headings as unknown as Prisma.InputJsonValue;
    const sectionsJson = data.sections as unknown as Prisma.InputJsonValue;
    const tablesJson = data.tables as unknown as Prisma.InputJsonValue;
    const warningsJson = data.warnings as unknown as Prisma.InputJsonValue;

    const record = await prisma.requirementDocumentExtraction.upsert({
      where: {
        requirementDocumentId,
      },
      update: {
        sourceSha256,
        extractorVersion: data.extractorVersion,
        format: data.format,
        plainText: data.plainText,
        characterCount: data.characterCount,
        lineCount: data.lineCount,
        pageCount: data.pageCount,
        blockCount: data.blockCount,
        headingCount: data.headingCount,
        sectionCount: data.sectionCount,
        tableCount: data.tableCount,
        status: data.status,
        warnings: warningsJson,
        blocks: blocksJson,
        pages: pagesJson,
        headings: headingsJson,
        sections: sectionsJson,
        tables: tablesJson,
      },
      create: {
        projectId,
        requirementDocumentId,
        sourceSha256,
        extractorVersion: data.extractorVersion,
        format: data.format,
        plainText: data.plainText,
        characterCount: data.characterCount,
        lineCount: data.lineCount,
        pageCount: data.pageCount,
        blockCount: data.blockCount,
        headingCount: data.headingCount,
        sectionCount: data.sectionCount,
        tableCount: data.tableCount,
        status: data.status,
        warnings: warningsJson,
        blocks: blocksJson,
        pages: pagesJson,
        headings: headingsJson,
        sections: sectionsJson,
        tables: tablesJson,
      },
    });

    return this.mapToDto(record);
  }

  async deleteByDocumentId(projectId: string, requirementDocumentId: string): Promise<boolean> {
    const prisma = this.getPrisma();
    const result = await prisma.requirementDocumentExtraction.deleteMany({
      where: {
        projectId,
        requirementDocumentId,
      },
    });
    return result.count > 0;
  }

  private mapToDto(record: {
    id: string;
    projectId: string;
    requirementDocumentId: string;
    sourceSha256: string;
    extractorVersion: string;
    format: string;
    plainText: string;
    characterCount: number;
    lineCount: number;
    pageCount: number | null;
    blockCount: number;
    headingCount: number;
    sectionCount: number;
    tableCount: number;
    status: string;
    warnings: unknown;
    blocks: unknown;
    pages: unknown;
    headings: unknown;
    sections: unknown;
    tables: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): RequirementDocumentExtractionDto {
    return {
      id: record.id,
      projectId: record.projectId,
      requirementDocumentId: record.requirementDocumentId,
      sourceSha256: record.sourceSha256,
      extractorVersion: record.extractorVersion,
      format: record.format as SupportedDocumentFormat,
      plainText: record.plainText,
      characterCount: record.characterCount,
      lineCount: record.lineCount,
      pageCount: record.pageCount,
      blockCount: record.blockCount,
      headingCount: record.headingCount,
      sectionCount: record.sectionCount,
      tableCount: record.tableCount,
      status: record.status as ExtractionStatus,
      warnings: (record.warnings as ExtractionWarningDto[]) || [],
      blocks: (record.blocks as DocumentBlockDto[]) || [],
      pages: (record.pages as DocumentPageDto[]) || [],
      headings: (record.headings as DocumentHeadingDto[]) || [],
      sections: (record.sections as DocumentSectionDto[]) || [],
      tables: (record.tables as DocumentTableDto[]) || [],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
