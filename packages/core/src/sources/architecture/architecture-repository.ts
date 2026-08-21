/**
 * @file packages/core/src/sources/architecture/architecture-repository.ts
 * Prisma repository for RepositoryArchitectureAnalysis persistence and relational query aggregation.
 */

import { getPrismaClient } from '../../database/client.js';
import { DatabaseError } from '../../database/errors.js';
import type { RepositoryArchitectureAnalysis, Prisma } from '@prisma/client';
import type {
  ApplicationKind,
  ArchitectureConfidence,
  ArchitectureAnalysisStatus,
  RepositoryFileDto,
  IndexStatus,
} from '@ai-quality/contracts';
import type { RawImportEdge } from './module-hub-calculator.js';

export class ArchitectureRepository {
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
   * Retrieves the architecture analysis for a given source ID.
   */
  async getAnalysisBySourceId(sourceId: string): Promise<RepositoryArchitectureAnalysis | null> {
    const prisma = this.getPrisma();
    return await prisma.repositoryArchitectureAnalysis.findUnique({
      where: { sourceId },
      include: {
        indexRun: true,
      },
    });
  }

  /**
   * Saves or updates an architecture analysis record.
   */
  async upsertAnalysis(
    sourceId: string,
    data: {
      indexRunId: string | null;
      status: ArchitectureAnalysisStatus;
      architectureVersion: number;
      primaryKind: ApplicationKind;
      confidence: ArchitectureConfidence;
      applicationKindsJson: Prisma.InputJsonValue;
      applicationUnitsJson: Prisma.InputJsonValue;
      entryCandidatesJson: Prisma.InputJsonValue;
      structuralAreasJson: Prisma.InputJsonValue;
      signalsJson: Prisma.InputJsonValue;
      moduleHubsJson: Prisma.InputJsonValue;
      warnings: string[];
    },
  ): Promise<RepositoryArchitectureAnalysis> {
    const prisma = this.getPrisma();
    return await prisma.repositoryArchitectureAnalysis.upsert({
      where: { sourceId },
      create: {
        sourceId,
        indexRunId: data.indexRunId,
        status: data.status,
        architectureVersion: data.architectureVersion,
        primaryKind: data.primaryKind,
        confidence: data.confidence,
        applicationKindsJson: data.applicationKindsJson,
        applicationUnitsJson: data.applicationUnitsJson,
        entryCandidatesJson: data.entryCandidatesJson,
        structuralAreasJson: data.structuralAreasJson,
        signalsJson: data.signalsJson,
        moduleHubsJson: data.moduleHubsJson,
        warnings: data.warnings,
        analyzedAt: new Date(),
      },
      update: {
        indexRunId: data.indexRunId,
        status: data.status,
        architectureVersion: data.architectureVersion,
        primaryKind: data.primaryKind,
        confidence: data.confidence,
        applicationKindsJson: data.applicationKindsJson,
        applicationUnitsJson: data.applicationUnitsJson,
        entryCandidatesJson: data.entryCandidatesJson,
        structuralAreasJson: data.structuralAreasJson,
        signalsJson: data.signalsJson,
        moduleHubsJson: data.moduleHubsJson,
        warnings: data.warnings,
        analyzedAt: new Date(),
      },
    });
  }

  /**
   * Retrieves all indexed files and raw import edges for architecture analysis.
   */
  async getIndexedDataForSource(sourceId: string): Promise<{
    files: readonly RepositoryFileDto[];
    importEdges: readonly RawImportEdge[];
  }> {
    const prisma = this.getPrisma();

    const [filesRecords, importRecords] = await Promise.all([
      prisma.repositoryFile.findMany({
        where: { sourceId },
        include: {
          _count: {
            select: { symbols: true, imports: true },
          },
        },
        orderBy: { relativePath: 'asc' },
      }),
      prisma.repositoryImport.findMany({
        where: {
          repositoryFile: { sourceId },
        },
        select: {
          resolvedRelativePath: true,
          repositoryFile: {
            select: { relativePath: true },
          },
        },
      }),
    ]);

    const files: RepositoryFileDto[] = filesRecords.map(r => ({
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

    const importEdges: RawImportEdge[] = importRecords.map(i => ({
      fromRelativePath: i.repositoryFile.relativePath,
      resolvedRelativePath: i.resolvedRelativePath,
    }));

    return { files, importEdges };
  }
}
