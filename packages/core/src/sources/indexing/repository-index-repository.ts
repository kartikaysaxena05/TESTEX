/**
 * @file packages/core/src/sources/indexing/repository-index-repository.ts
 * Prisma database repository for RepositoryIndexRun, RepositoryFile, RepositorySymbol, and RepositoryImport.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { RepositoryIndexRun, Prisma } from '@prisma/client';
import type {
  RepositoryFileDto,
  RepositoryFileDetailsDto,
  RepositorySymbolDto,
  RepositoryImportDto,
  SymbolKind,
  ImportKind,
  IndexStatus,
} from '@ai-quality/contracts';
import type { ExtractedSymbol, ExtractedImport } from './source-parser-types.js';

export interface FileToUpsert {
  readonly relativePath: string;
  readonly name: string;
  readonly extension: string | null;
  readonly language: string | null;
  readonly classification: string;
  readonly sizeBytes: number;
  readonly contentHash: string;
  readonly indexStatus: IndexStatus;
  readonly symbols: readonly ExtractedSymbol[];
  readonly imports: readonly (ExtractedImport & { readonly resolvedRelativePath: string | null })[];
}

export class RepositoryIndexRepository {
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
   * Starts a new indexing run record.
   */
  async createIndexRun(
    sourceId: string,
    schemaVersion: number,
    parserVersion: number,
  ): Promise<RepositoryIndexRun> {
    const prisma = this.getPrisma();
    return await prisma.repositoryIndexRun.create({
      data: {
        sourceId,
        status: 'RUNNING',
        schemaVersion,
        parserVersion,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Updates an existing indexing run record.
   */
  async updateIndexRun(
    id: string,
    data: Prisma.RepositoryIndexRunUpdateInput,
  ): Promise<RepositoryIndexRun> {
    const prisma = this.getPrisma();
    return await prisma.repositoryIndexRun.update({
      where: { id },
      data,
    });
  }

  /**
   * Fetches the latest indexing run for a source.
   */
  async getLatestIndexRun(sourceId: string): Promise<RepositoryIndexRun | null> {
    const prisma = this.getPrisma();
    return await prisma.repositoryIndexRun.findFirst({
      where: { sourceId },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Fetches a map of existing indexed file records for a source to support incremental hashing.
   */
  async getExistingFileHashes(
    sourceId: string,
  ): Promise<Map<string, { id: string; contentHash: string | null }>> {
    const prisma = this.getPrisma();
    const files = await prisma.repositoryFile.findMany({
      where: { sourceId },
      select: {
        id: true,
        relativePath: true,
        contentHash: true,
      },
    });

    const map = new Map<string, { id: string; contentHash: string | null }>();
    for (const f of files) {
      map.set(f.relativePath, { id: f.id, contentHash: f.contentHash });
    }
    return map;
  }

  /**
   * Batch upserts file index records with their associated symbols and imports in transactions.
   */
  async batchUpsertFiles(sourceId: string, batch: readonly FileToUpsert[]): Promise<void> {
    if (batch.length === 0) return;
    const prisma = this.getPrisma();

    await prisma.$transaction(async tx => {
      for (const item of batch) {
        // 1. Upsert RepositoryFile
        const file = await tx.repositoryFile.upsert({
          where: {
            sourceId_relativePath: {
              sourceId,
              relativePath: item.relativePath,
            },
          },
          create: {
            sourceId,
            relativePath: item.relativePath,
            name: item.name,
            extension: item.extension,
            language: item.language,
            classification: item.classification,
            sizeBytes: item.sizeBytes,
            contentHash: item.contentHash,
            indexStatus: item.indexStatus,
            indexedAt: new Date(),
          },
          update: {
            name: item.name,
            extension: item.extension,
            language: item.language,
            classification: item.classification,
            sizeBytes: item.sizeBytes,
            contentHash: item.contentHash,
            indexStatus: item.indexStatus,
            indexedAt: new Date(),
          },
        });

        // 2. Delete existing symbols & imports for this file
        await tx.repositorySymbol.deleteMany({
          where: { repositoryFileId: file.id },
        });
        await tx.repositoryImport.deleteMany({
          where: { repositoryFileId: file.id },
        });

        // 3. Create symbols
        if (item.symbols.length > 0) {
          await tx.repositorySymbol.createMany({
            data: item.symbols.map(s => ({
              repositoryFileId: file.id,
              name: s.name,
              kind: s.kind,
              startLine: s.startLine,
              endLine: s.endLine,
              isExported: s.isExported,
            })),
          });
        }

        // 4. Create imports
        if (item.imports.length > 0) {
          await tx.repositoryImport.createMany({
            data: item.imports.map(i => ({
              repositoryFileId: file.id,
              specifier: i.specifier,
              importKind: i.importKind,
              resolvedRelativePath: i.resolvedRelativePath,
              isExternal: i.isExternal,
              lineNumber: i.lineNumber,
            })),
          });
        }
      }
    });
  }

  /**
   * Deletes stale indexed files no longer present in the source repository.
   */
  async deleteStaleFiles(
    sourceId: string,
    relativePathsToDelete: readonly string[],
  ): Promise<number> {
    if (relativePathsToDelete.length === 0) return 0;
    const prisma = this.getPrisma();

    const result = await prisma.repositoryFile.deleteMany({
      where: {
        sourceId,
        relativePath: { in: [...relativePathsToDelete] },
      },
    });

    return result.count;
  }

  /**
   * Lists indexed files with pagination, search query, and filters.
   */
  async listIndexedFiles(
    sourceId: string,
    options: {
      page: number;
      pageSize: number;
      searchQuery?: string;
      language?: string;
      classification?: string;
    },
  ): Promise<{ items: readonly RepositoryFileDto[]; total: number }> {
    const prisma = this.getPrisma();
    const where: Prisma.RepositoryFileWhereInput = {
      sourceId,
    };

    if (options.searchQuery && options.searchQuery.trim().length > 0) {
      where.OR = [
        { relativePath: { contains: options.searchQuery.trim(), mode: 'insensitive' } },
        { name: { contains: options.searchQuery.trim(), mode: 'insensitive' } },
      ];
    }

    if (options.language && options.language !== 'ALL') {
      where.language = options.language;
    }

    if (options.classification && options.classification !== 'ALL') {
      where.classification = options.classification;
    }

    const [total, records] = await Promise.all([
      prisma.repositoryFile.count({ where }),
      prisma.repositoryFile.findMany({
        where,
        include: {
          _count: {
            select: {
              symbols: true,
              imports: true,
            },
          },
        },
        orderBy: { relativePath: 'asc' },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
    ]);

    const items: RepositoryFileDto[] = records.map(r => ({
      id: r.id,
      sourceId: r.sourceId,
      relativePath: r.relativePath,
      name: r.name,
      extension: r.extension,
      language: r.language,
      classification: r.classification,
      sizeBytes: r.sizeBytes,
      contentHash: r.contentHash,
      indexStatus: r.indexStatus as IndexStatus,
      symbolCount: r._count.symbols,
      importCount: r._count.imports,
      indexedAt: r.indexedAt.toISOString(),
    }));

    return { items, total };
  }

  /**
   * Retrieves single file details with full symbols and imports.
   */
  async getFileDetails(
    sourceId: string,
    relativePath: string,
  ): Promise<RepositoryFileDetailsDto | null> {
    const prisma = this.getPrisma();
    const record = await prisma.repositoryFile.findUnique({
      where: {
        sourceId_relativePath: {
          sourceId,
          relativePath,
        },
      },
      include: {
        symbols: {
          orderBy: { startLine: 'asc' },
        },
        imports: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    if (!record) return null;

    const file: RepositoryFileDto = {
      id: record.id,
      sourceId: record.sourceId,
      relativePath: record.relativePath,
      name: record.name,
      extension: record.extension,
      language: record.language,
      classification: record.classification,
      sizeBytes: record.sizeBytes,
      contentHash: record.contentHash,
      indexStatus: record.indexStatus as IndexStatus,
      symbolCount: record.symbols.length,
      importCount: record.imports.length,
      indexedAt: record.indexedAt.toISOString(),
    };

    const symbols: RepositorySymbolDto[] = record.symbols.map(s => ({
      id: s.id,
      name: s.name,
      kind: s.kind as SymbolKind,
      startLine: s.startLine,
      endLine: s.endLine,
      isExported: s.isExported,
    }));

    const imports: RepositoryImportDto[] = record.imports.map(i => ({
      id: i.id,
      specifier: i.specifier,
      importKind: i.importKind as ImportKind,
      resolvedRelativePath: i.resolvedRelativePath,
      isExternal: i.isExternal,
      lineNumber: i.lineNumber,
    }));

    return { file, symbols, imports };
  }

  /**
   * Searches symbols across indexed repository files.
   */
  async searchSymbols(
    sourceId: string,
    query: string,
    kind?: SymbolKind,
    limit: number = 25,
  ): Promise<readonly RepositorySymbolDto[]> {
    const prisma = this.getPrisma();
    const where: Prisma.RepositorySymbolWhereInput = {
      repositoryFile: { sourceId },
      name: { contains: query.trim(), mode: 'insensitive' },
    };

    if (kind) {
      where.kind = kind;
    }

    const records = await prisma.repositorySymbol.findMany({
      where,
      orderBy: { name: 'asc' },
      take: Math.min(limit, 100),
    });

    return records.map(s => ({
      id: s.id,
      name: s.name,
      kind: s.kind as SymbolKind,
      startLine: s.startLine,
      endLine: s.endLine,
      isExported: s.isExported,
    }));
  }
}
