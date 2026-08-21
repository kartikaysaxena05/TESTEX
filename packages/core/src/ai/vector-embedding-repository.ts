/**
 * @file packages/core/src/ai/vector-embedding-repository.ts
 * Parameterized PostgreSQL repository for Vector Embedding persistence and project-isolated pgvector similarity search.
 */

import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type {
  VectorSubjectType,
  VectorEmbeddingStatus,
  VectorRecordDto,
  VectorMatchDto,
  EmbeddingIndexStatusDto,
  AiProviderId,
} from '@ai-quality/contracts';
import { getPrismaClient, DatabaseError } from '../database/index.js';
import { AiVectorSearchProjectMismatchError } from './ai-errors.js';
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_EMBEDDING_DIMENSIONS } from './ai-types.js';

export interface SaveVectorEmbeddingInput {
  readonly id?: string;
  readonly projectId: string;
  readonly subjectType: VectorSubjectType;
  readonly subjectId: string;
  readonly sourceVersionId?: string | null;
  readonly providerId: string;
  readonly model: string;
  readonly dimensions: number;
  readonly canonicalizationVersion: number;
  readonly inputSha256: string;
  readonly vector: readonly number[];
  readonly status?: VectorEmbeddingStatus;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SearchSimilarVectorsOptions {
  readonly projectId: string;
  readonly queryVector: readonly number[];
  readonly profile: {
    readonly providerId: string;
    readonly model: string;
    readonly dimensions: number;
  };
  readonly subjectTypes?: readonly VectorSubjectType[];
  readonly topK: number;
  readonly minimumSimilarity?: number;
}

export class VectorEmbeddingRepository {
  private readonly customPrisma?: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.customPrisma = prisma;
  }

  private getPrisma(): PrismaClient {
    const client = this.customPrisma ?? getPrismaClient();
    if (!client) {
      throw new DatabaseError('Database client is not available.', 'UNAVAILABLE');
    }
    return client;
  }

  /**
   * Formats a numeric array into pgvector literal format: '[0.1, 0.2, ...]'
   */
  public static formatVectorLiteral(vector: readonly number[]): string {
    return `[${vector.join(',')}]`;
  }

  /**
   * Persists a vector embedding record atomically with pgvector type conversion.
   */
  public async saveEmbedding(input: SaveVectorEmbeddingInput): Promise<VectorRecordDto> {
    const id = input.id ?? crypto.randomUUID();
    const status = input.status ?? 'CURRENT';
    const metadataJson = JSON.stringify(input.metadata ?? {});
    const vectorLiteral = VectorEmbeddingRepository.formatVectorLiteral(input.vector);

    await this.getPrisma().$executeRaw`
      INSERT INTO vector_embeddings (
        id,
        project_id,
        subject_type,
        subject_id,
        source_version_id,
        provider_id,
        model,
        dimensions,
        canonicalization_version,
        input_sha256,
        vector,
        status,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        ${id}::uuid,
        ${input.projectId}::uuid,
        ${input.subjectType}::"VectorSubjectType",
        ${input.subjectId}::uuid,
        ${input.sourceVersionId ? input.sourceVersionId : null}::uuid,
        ${input.providerId},
        ${input.model},
        ${input.dimensions},
        ${input.canonicalizationVersion},
        ${input.inputSha256},
        ${vectorLiteral}::vector,
        ${status}::"VectorEmbeddingStatus",
        ${metadataJson}::jsonb,
        NOW(),
        NOW()
      );
    `;

    return {
      id,
      projectId: input.projectId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      sourceVersionId: input.sourceVersionId ?? null,
      providerId: input.providerId,
      model: input.model,
      dimensions: input.dimensions,
      canonicalizationVersion: input.canonicalizationVersion,
      inputSha256: input.inputSha256,
      status,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      staleAt: null,
    };
  }

  /**
   * Finds an active CURRENT embedding for a given subject and profile in a project.
   */
  public async findCurrentEmbedding(
    projectId: string,
    subjectType: VectorSubjectType,
    subjectId: string,
    profile: {
      providerId: string;
      model: string;
      dimensions: number;
      canonicalizationVersion: number;
    },
  ): Promise<VectorRecordDto | null> {
    const rows = await this.getPrisma().$queryRaw<
      Array<{
        id: string;
        projectId: string;
        subjectType: VectorSubjectType;
        subjectId: string;
        sourceVersionId: string | null;
        providerId: string;
        model: string;
        dimensions: number;
        canonicalizationVersion: number;
        inputSha256: string;
        status: VectorEmbeddingStatus;
        metadata: unknown;
        createdAt: Date;
        updatedAt: Date;
        staleAt: Date | null;
      }>
    >`
      SELECT 
        id,
        project_id AS "projectId",
        subject_type AS "subjectType",
        subject_id AS "subjectId",
        source_version_id AS "sourceVersionId",
        provider_id AS "providerId",
        model,
        dimensions,
        canonicalization_version AS "canonicalizationVersion",
        input_sha256 AS "inputSha256",
        status,
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        stale_at AS "staleAt"
      FROM vector_embeddings
      WHERE project_id = ${projectId}::uuid
        AND subject_type = ${subjectType}::"VectorSubjectType"
        AND subject_id = ${subjectId}::uuid
        AND provider_id = ${profile.providerId}
        AND model = ${profile.model}
        AND dimensions = ${profile.dimensions}
        AND canonicalization_version = ${profile.canonicalizationVersion}
        AND status = 'CURRENT'
      LIMIT 1;
    `;

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      projectId: row.projectId,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      sourceVersionId: row.sourceVersionId,
      providerId: row.providerId,
      model: row.model,
      dimensions: row.dimensions,
      canonicalizationVersion: row.canonicalizationVersion,
      inputSha256: row.inputSha256,
      status: row.status,
      metadata:
        typeof row.metadata === 'object' && row.metadata !== null
          ? (row.metadata as Record<string, unknown>)
          : {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      staleAt: row.staleAt ? row.staleAt.toISOString() : null,
    };
  }

  /**
   * Marks existing CURRENT embeddings for a given subject as STALE.
   */
  public async markSubjectEmbeddingsStale(
    projectId: string,
    subjectType: VectorSubjectType,
    subjectId: string,
  ): Promise<number> {
    const result = await this.getPrisma().$executeRaw`
      UPDATE vector_embeddings
      SET 
        status = 'STALE'::"VectorEmbeddingStatus",
        stale_at = NOW(),
        updated_at = NOW()
      WHERE project_id = ${projectId}::uuid
        AND subject_type = ${subjectType}::"VectorSubjectType"
        AND subject_id = ${subjectId}::uuid
        AND status = 'CURRENT'::"VectorEmbeddingStatus";
    `;

    return result;
  }

  /**
   * Performs project-isolated vector similarity search using pgvector cosine distance operator (<=>).
   */
  public async searchSimilar(
    options: SearchSimilarVectorsOptions,
  ): Promise<readonly VectorMatchDto[]> {
    if (!options.projectId) {
      throw new AiVectorSearchProjectMismatchError(
        'Target Project ID is required for similarity search.',
      );
    }

    const vectorLiteral = VectorEmbeddingRepository.formatVectorLiteral(options.queryVector);
    const minSim = options.minimumSimilarity !== undefined ? options.minimumSimilarity : null;
    const topK = options.topK;

    const subjectTypesFilter =
      options.subjectTypes && options.subjectTypes.length > 0
        ? options.subjectTypes.map(st => st.toString())
        : null;

    const rows = await this.getPrisma().$queryRaw<
      Array<{
        id: string;
        projectId: string;
        subjectType: VectorSubjectType;
        subjectId: string;
        sourceVersionId: string | null;
        inputSha256: string;
        metadata: unknown;
        similarity: number;
        distance: number;
      }>
    >`
      SELECT 
        id,
        project_id AS "projectId",
        subject_type AS "subjectType",
        subject_id AS "subjectId",
        source_version_id AS "sourceVersionId",
        input_sha256 AS "inputSha256",
        metadata,
        (1 - (vector <=> ${vectorLiteral}::vector))::float8 AS similarity,
        (vector <=> ${vectorLiteral}::vector)::float8 AS distance
      FROM vector_embeddings
      WHERE project_id = ${options.projectId}::uuid
        AND status = 'CURRENT'::"VectorEmbeddingStatus"
        AND provider_id = ${options.profile.providerId}
        AND model = ${options.profile.model}
        AND dimensions = ${options.profile.dimensions}
        AND (${subjectTypesFilter}::text[] IS NULL OR subject_type::text = ANY(${subjectTypesFilter}::text[]))
        AND (${minSim}::float8 IS NULL OR (1 - (vector <=> ${vectorLiteral}::vector)) >= ${minSim})
      ORDER BY (vector <=> ${vectorLiteral}::vector) ASC
      LIMIT ${topK};
    `;

    return rows.map(r => {
      // Enforce strict project isolation validation on returned records
      if (r.projectId !== options.projectId) {
        throw new AiVectorSearchProjectMismatchError(
          `Security violation: cross-project vector match detected (expected ${options.projectId}, got ${r.projectId})`,
        );
      }

      return {
        subjectId: r.subjectId,
        subjectType: r.subjectType,
        similarity: Number(r.similarity.toFixed(6)),
        distance: Number(r.distance.toFixed(6)),
        embeddingId: r.id,
        sourceVersionId: r.sourceVersionId,
        inputSha256: r.inputSha256,
        metadata:
          typeof r.metadata === 'object' && r.metadata !== null
            ? (r.metadata as Record<string, unknown>)
            : {},
      };
    });
  }

  /**
   * Retrieves summary embedding index statistics for a project.
   */
  public async getIndexStatus(
    projectId: string,
    profile?: {
      providerId?: string;
      model?: string;
      dimensions?: number;
    },
  ): Promise<EmbeddingIndexStatusDto> {
    const providerId = profile?.providerId ?? 'OPENAI';
    const model = profile?.model ?? DEFAULT_EMBEDDING_MODEL;
    const dimensions = profile?.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;

    const stats = await this.getPrisma().$queryRaw<
      Array<{
        totalIndexed: bigint;
        totalStale: bigint;
        totalInvalidated: bigint;
        lastIndexedAt: Date | null;
      }>
    >`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'CURRENT') AS "totalIndexed",
        COUNT(*) FILTER (WHERE status = 'STALE') AS "totalStale",
        COUNT(*) FILTER (WHERE status = 'INVALIDATED') AS "totalInvalidated",
        MAX(created_at) AS "lastIndexedAt"
      FROM vector_embeddings
      WHERE project_id = ${projectId}::uuid;
    `;

    const s = stats[0];

    return {
      projectId,
      providerId: providerId as AiProviderId,
      model,
      dimensions,
      totalIndexed: s ? Number(s.totalIndexed) : 0,
      totalStale: s ? Number(s.totalStale) : 0,
      totalFailed: s ? Number(s.totalInvalidated) : 0,
      lastIndexedAt: s?.lastIndexedAt ? s.lastIndexedAt.toISOString() : null,
    };
  }
}
