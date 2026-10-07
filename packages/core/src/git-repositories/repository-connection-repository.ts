/**
 * @file packages/core/src/git-repositories/repository-connection-repository.ts
 * Authoritative Prisma database repository for RepositoryConnection and RepositoryImportRecord.
 */

import type {
  PrismaClient,
  RepositoryConnection,
  RepositoryImportRecord,
  GitProviderType,
  Prisma,
} from '@prisma/client';
import { getPrismaClient } from '../database/client.js';

export class RepositoryConnectionRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    const client = prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
  }

  /**
   * Retrieves a connection by ID. Soft-deleted records are filtered out by default.
   */
  async getConnectionById(
    connectionId: string,
    includeDeleted = false,
  ): Promise<RepositoryConnection | null> {
    return this.prisma.repositoryConnection.findFirst({
      where: {
        id: connectionId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });
  }

  /**
   * Retrieves a connection with its parent project to verify ownership.
   */
  async getConnectionWithProject(connectionId: string): Promise<
    | (RepositoryConnection & {
        project: { id: string; userId: string | null; status: string };
      })
    | null
  > {
    return this.prisma.repositoryConnection.findFirst({
      where: {
        id: connectionId,
        deletedAt: null,
      },
      include: {
        project: {
          select: {
            id: true,
            userId: true,
            status: true,
          },
        },
      },
    });
  }

  /**
   * Lists all connections for a project.
   */
  async listConnectionsByProjectId(
    projectId: string,
    includeDeleted = false,
  ): Promise<RepositoryConnection[]> {
    return this.prisma.repositoryConnection.findMany({
      where: {
        projectId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Finds an existing active/non-deleted connection with the same provider & repository identifier in a project.
   */
  async findDuplicate(
    projectId: string,
    provider: GitProviderType,
    repositoryIdentifier: string,
  ): Promise<RepositoryConnection | null> {
    return this.prisma.repositoryConnection.findFirst({
      where: {
        projectId,
        provider,
        repositoryIdentifier,
        deletedAt: null,
      },
    });
  }

  /**
   * Persists a new repository connection.
   */
  async createConnection(
    data: Prisma.RepositoryConnectionUncheckedCreateInput,
  ): Promise<RepositoryConnection> {
    return this.prisma.repositoryConnection.create({
      data,
    });
  }

  /**
   * Updates an existing repository connection.
   */
  async updateConnection(
    connectionId: string,
    data: Prisma.RepositoryConnectionUncheckedUpdateInput,
  ): Promise<RepositoryConnection> {
    return this.prisma.repositoryConnection.update({
      where: { id: connectionId },
      data,
    });
  }

  /**
   * Soft-deletes a connection by setting deletedAt and isActive = false.
   */
  async softDeleteConnection(connectionId: string): Promise<RepositoryConnection> {
    return this.prisma.repositoryConnection.update({
      where: { id: connectionId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }

  /**
   * Transactionally sets a connection as active while deactivating all other connections in the project.
   */
  async setActiveConnection(
    projectId: string,
    connectionId: string,
  ): Promise<RepositoryConnection> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Deactivate all connections in the project
      await tx.repositoryConnection.updateMany({
        where: {
          projectId,
          deletedAt: null,
        },
        data: {
          isActive: false,
        },
      });

      // 2. Activate the designated connection
      return tx.repositoryConnection.update({
        where: { id: connectionId },
        data: {
          isActive: true,
        },
      });
    });
  }

  /**
   * Counts active repository connections in a project.
   */
  async countConnectionsByProjectId(projectId: string): Promise<number> {
    return this.prisma.repositoryConnection.count({
      where: {
        projectId,
        deletedAt: null,
      },
    });
  }

  /**
   * Creates an audit record for an import operation.
   */
  async createImportRecord(
    data: Prisma.RepositoryImportRecordUncheckedCreateInput,
  ): Promise<RepositoryImportRecord> {
    return this.prisma.repositoryImportRecord.create({
      data,
    });
  }

  /**
   * Updates an import record with completion/failure details.
   */
  async updateImportRecord(
    recordId: string,
    data: Prisma.RepositoryImportRecordUncheckedUpdateInput,
  ): Promise<RepositoryImportRecord> {
    return this.prisma.repositoryImportRecord.update({
      where: { id: recordId },
      data,
    });
  }
}
