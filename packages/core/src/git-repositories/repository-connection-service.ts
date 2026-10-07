/**
 * @file packages/core/src/git-repositories/repository-connection-service.ts
 * Authoritative business service for Git repository connections, authorization, atomic import,
 * multi-user isolation, audit logging, and downstream V2 intelligence synchronization.
 */

import crypto from 'node:crypto';
import type { PrismaClient, RepositoryConnection, Project } from '@prisma/client';
import type {
  CreateRepositoryConnectionInput,
  UpdateRepositoryConnectionInput,
  RepositoryConnectionSummary,
  RepositoryConnectionDetails,
  RepositoryConnectionSnapshot,
  RepositoryImportResultDto,
  RepositoryVerificationResultDto,
  GitProviderAccountDto,
  GitProviderRepositoryDto,
  GitBranchDto,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../database/client.js';
import { ProjectRepository } from '../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../projects/project-errors.js';
import { SourceRepository } from '../sources/source-repository.js';
import { GitRepository } from '../git/git-repository.js';
import { calculateSourceRootIdentity } from '../sources/source-identity.js';
import {
  RepositoryConnectionNotFoundError,
  RepositoryAccessDeniedError,
  RepositoryValidationError,
  DuplicateRepositoryConnectionError,
  RepositoryAlreadyDeletedError,
  RepositoryImportCancelledError,
  RepositoryImportTimeoutError,
} from './git-repository-errors.js';
import {
  RepositoryConnectionRepository,
} from './repository-connection-repository.js';
import {
  GitCredentialVault,
  type IGitCredentialVault,
} from './git-credential-vault.js';
import {
  GitHubProviderClient,
  type IGitProviderClient,
} from './git-provider-client.js';
import { RepositoryImporter } from './repository-importer.js';
import {
  toRepositoryConnectionSummary,
  toRepositoryConnectionDetails,
  toRepositoryConnectionSnapshot,
} from './repository-connection-mappers.js';

export class RepositoryConnectionService {
  private readonly inFlightAbortControllers = new Map<string, AbortController>();
  private readonly repository: RepositoryConnectionRepository;
  private readonly projectRepository: ProjectRepository;
  private readonly sourceRepository: SourceRepository;
  private readonly gitMetadataRepository: GitRepository;
  private readonly vault: IGitCredentialVault;
  private readonly providerClient: IGitProviderClient;
  private readonly importer: RepositoryImporter;
  private readonly prisma: PrismaClient;

  constructor(
    repository?: RepositoryConnectionRepository,
    projectRepository?: ProjectRepository,
    sourceRepository?: SourceRepository,
    gitMetadataRepository?: GitRepository,
    vault?: IGitCredentialVault,
    providerClient?: IGitProviderClient,
    importer?: RepositoryImporter,
    prisma?: PrismaClient,
  ) {
    const client = prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
    this.repository = repository ?? new RepositoryConnectionRepository(this.prisma);
    this.projectRepository = projectRepository ?? new ProjectRepository();
    this.sourceRepository = sourceRepository ?? new SourceRepository();
    this.gitMetadataRepository = gitMetadataRepository ?? new GitRepository();
    this.vault = vault ?? new GitCredentialVault();
    this.providerClient = providerClient ?? new GitHubProviderClient();
    this.importer = importer ?? new RepositoryImporter();
  }

  /**
   * Helper to verify project ownership and access permissions.
   */
  private async checkProjectAccess(projectId: string, userId?: string | null): Promise<Project> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    if (project.deletedAt) {
      throw new ProjectNotFoundError('Project has been deleted.');
    }

    // Verify multi-user isolation
    if (project.userId && userId && project.userId !== userId) {
      throw new RepositoryAccessDeniedError('Access denied: You do not own this project.');
    }

    return project;
  }

  /**
   * Helper to record audit events in AuthAuditEvent.
   */
  private async recordAudit(
    userId: string | null | undefined,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (!userId) return;
      await this.prisma.authAuditEvent.create({
        data: {
          userId,
          action: action as any,
          ipAddress: '127.0.0.1',
          metadata: metadata as any,
        },
      });
    } catch {
      // Audit recording should not break core business operations
    }
  }

  /**
   * Creates a new Git repository connection in a project.
   */
  async createConnection(
    userId: string | null | undefined,
    input: CreateRepositoryConnectionInput,
  ): Promise<RepositoryConnectionDetails> {
    const project = await this.checkProjectAccess(input.projectId, userId);

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot connect repositories to an archived project.');
    }

    const provider = input.provider ?? 'GITHUB';
    const rawIdent = input.repositoryIdentifier.trim();
    if (!rawIdent) {
      throw new RepositoryValidationError('Repository identifier is required.');
    }

    // Parse owner and repo name from identifier if present (e.g. "octocat/Hello-World")
    let owner = input.owner?.trim() ?? '';
    let repoName = input.repositoryName?.trim() ?? '';
    if (!owner || !repoName) {
      const parts = rawIdent.split('/');
      if (parts.length === 2 && parts[0] && parts[1]) {
        owner = owner || parts[0];
        repoName = repoName || parts[1];
      } else {
        owner = owner || 'unknown';
        repoName = repoName || rawIdent;
      }
    }

    // Check for duplicate connection in project
    const duplicate = await this.repository.findDuplicate(input.projectId, provider as any, rawIdent);
    if (duplicate) {
      throw new DuplicateRepositoryConnectionError(
        `Repository '${rawIdent}' is already connected to this project.`,
      );
    }

    const connectionId = crypto.randomUUID();

    // Encrypt credentials if supplied
    let encryptedCreds: string | null = null;
    if (input.credentialsToken && input.credentialsToken.trim().length > 0) {
      encryptedCreds = await this.vault.encrypt(input.credentialsToken.trim(), connectionId);
    }

    const existingCount = await this.repository.countConnectionsByProjectId(input.projectId);
    const shouldBeActive = input.setAsActive ?? (existingCount === 0);

    const displayName = input.displayName?.trim() || `${owner}/${repoName}`;
    const defaultBranch = input.defaultBranch?.trim() || 'main';
    const selectedBranch = input.selectedBranch?.trim() || defaultBranch;

    const created = await this.repository.createConnection({
      id: connectionId,
      projectId: input.projectId,
      provider: provider as any,
      repositoryIdentifier: rawIdent,
      repositoryName: repoName,
      owner,
      repositoryUrl: input.repositoryUrl?.trim() || `https://github.com/${owner}/${repoName}`,
      displayName,
      visibility: (input.visibility as any) ?? 'PUBLIC',
      defaultBranch,
      selectedBranch,
      selectedRevision: input.selectedRevision?.trim() || null,
      connectionStatus: 'CONFIGURED',
      importStatus: 'NOT_IMPORTED',
      isActive: shouldBeActive,
      encryptedCredentials: encryptedCreds,
    });

    if (shouldBeActive && existingCount > 0) {
      await this.repository.setActiveConnection(input.projectId, created.id);
    }

    await this.recordAudit(userId, 'REPOSITORY_CONNECTION_CREATED', {
      connectionId: created.id,
      projectId: input.projectId,
      repositoryIdentifier: rawIdent,
      provider,
    });

    return toRepositoryConnectionDetails(created);
  }

  /**
   * Retrieves detailed connection metadata.
   */
  async getConnection(
    userId: string | null | undefined,
    projectId: string,
    connectionId: string,
  ): Promise<RepositoryConnectionDetails> {
    await this.checkProjectAccess(projectId, userId);

    const conn = await this.repository.getConnectionById(connectionId);
    if (!conn || conn.projectId !== projectId) {
      throw new RepositoryConnectionNotFoundError();
    }

    return toRepositoryConnectionDetails(conn);
  }

  /**
   * Lists all repository connections for a project.
   */
  async listConnections(
    userId: string | null | undefined,
    projectId: string,
    includeDeleted = false,
  ): Promise<readonly RepositoryConnectionSummary[]> {
    await this.checkProjectAccess(projectId, userId);

    const connections = await this.repository.listConnectionsByProjectId(projectId, includeDeleted);
    return connections.map(toRepositoryConnectionSummary);
  }

  /**
   * Updates repository connection metadata or branch/revision targets.
   */
  async updateConnection(
    userId: string | null | undefined,
    input: UpdateRepositoryConnectionInput,
  ): Promise<RepositoryConnectionDetails> {
    const project = await this.checkProjectAccess(input.projectId, userId);

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot update repository connection on an archived project.');
    }

    const conn = await this.repository.getConnectionById(input.connectionId);
    if (!conn || conn.projectId !== input.projectId) {
      throw new RepositoryConnectionNotFoundError();
    }

    const updateData: any = {};

    if (input.displayName && input.displayName.trim().length > 0) {
      updateData.displayName = input.displayName.trim();
    }

    if (input.selectedBranch && input.selectedBranch.trim() !== conn.selectedBranch) {
      updateData.selectedBranch = input.selectedBranch.trim();
      await this.recordAudit(userId, 'REPOSITORY_BRANCH_CHANGED', {
        connectionId: conn.id,
        projectId: input.projectId,
        oldBranch: conn.selectedBranch,
        newBranch: input.selectedBranch.trim(),
      });
    }

    if (input.selectedRevision !== undefined && input.selectedRevision !== conn.selectedRevision) {
      updateData.selectedRevision = input.selectedRevision ? input.selectedRevision.trim() : null;
      await this.recordAudit(userId, 'REPOSITORY_REVISION_CHANGED', {
        connectionId: conn.id,
        projectId: input.projectId,
        oldRevision: conn.selectedRevision,
        newRevision: updateData.selectedRevision,
      });
    }

    if (input.credentialsToken !== undefined) {
      if (input.credentialsToken && input.credentialsToken.trim().length > 0) {
        updateData.encryptedCredentials = await this.vault.encrypt(
          input.credentialsToken.trim(),
          conn.id,
        );
      } else {
        updateData.encryptedCredentials = null;
      }
    }

    const updated = await this.repository.updateConnection(conn.id, updateData);

    await this.recordAudit(userId, 'REPOSITORY_CONNECTION_UPDATED', {
      connectionId: conn.id,
      projectId: input.projectId,
    });

    return toRepositoryConnectionDetails(updated);
  }

  /**
   * Soft-deletes a repository connection, preserving historical records.
   */
  async deleteConnection(
    userId: string | null | undefined,
    projectId: string,
    connectionId: string,
  ): Promise<{ readonly deleted: true; readonly connectionId: string }> {
    await this.checkProjectAccess(projectId, userId);

    const conn = await this.repository.getConnectionById(connectionId, true);
    if (!conn || conn.projectId !== projectId) {
      throw new RepositoryConnectionNotFoundError();
    }

    if (conn.deletedAt) {
      throw new RepositoryAlreadyDeletedError();
    }

    await this.repository.softDeleteConnection(connectionId);

    // If deleted connection was active, select next available connection
    if (conn.isActive) {
      const remaining = await this.repository.listConnectionsByProjectId(projectId, false);
      if (remaining.length > 0 && remaining[0]) {
        await this.repository.setActiveConnection(projectId, remaining[0].id);
      }
    }

    await this.recordAudit(userId, 'REPOSITORY_DISCONNECTED', {
      connectionId,
      projectId,
      repositoryIdentifier: conn.repositoryIdentifier,
    });

    return { deleted: true, connectionId };
  }

  /**
   * Atomically switches the active repository connection.
   */
  async setActiveConnection(
    userId: string | null | undefined,
    projectId: string,
    connectionId: string,
  ): Promise<RepositoryConnectionDetails> {
    const project = await this.checkProjectAccess(projectId, userId);

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot change active repository on an archived project.');
    }

    const conn = await this.repository.getConnectionById(connectionId);
    if (!conn || conn.projectId !== projectId) {
      throw new RepositoryConnectionNotFoundError();
    }

    const updated = await this.repository.setActiveConnection(projectId, connectionId);

    // If this repository was already imported to disk, synchronize downstream V2 ProjectSource
    if (updated.localPath && updated.importStatus === 'IMPORTED') {
      await this.syncDownstreamProjectSource(project.id, updated);
    }

    await this.recordAudit(userId, 'REPOSITORY_ACTIVATED', {
      connectionId,
      projectId,
      repositoryIdentifier: updated.repositoryIdentifier,
    });

    return toRepositoryConnectionDetails(updated);
  }

  /**
   * Verifies repository reachability, permissions, and branch existence with the provider.
   */
  async verifyConnection(
    userId: string | null | undefined,
    projectId: string,
    connectionId: string,
  ): Promise<RepositoryVerificationResultDto> {
    await this.checkProjectAccess(projectId, userId);

    const conn = await this.repository.getConnectionById(connectionId);
    if (!conn || conn.projectId !== projectId) {
      throw new RepositoryConnectionNotFoundError();
    }

    let token: string | null = null;
    if (conn.encryptedCredentials) {
      token = await this.vault.decrypt(conn.encryptedCredentials, conn.id);
    }

    try {
      // 1. Verify repository access
      const repoInfo = await this.providerClient.getRepository(conn.owner, conn.repositoryName, token);

      // 2. Verify selected branch existence
      const branchInfo = await this.providerClient.getBranch(
        conn.owner,
        conn.repositoryName,
        conn.selectedBranch,
        token,
      );

      const verifiedAt = new Date().toISOString();

      await this.repository.updateConnection(conn.id, {
        connectionStatus: 'ACCESSIBLE',
        defaultBranch: repoInfo.defaultBranch,
        lastVerifiedAt: new Date(verifiedAt),
        lastFailureReason: null,
      });

      await this.recordAudit(userId, 'REPOSITORY_VERIFIED', {
        connectionId: conn.id,
        projectId,
        resolvedBranch: branchInfo.name,
        resolvedRevision: branchInfo.commitSha,
      });

      return {
        connectionId: conn.id,
        accessible: true,
        status: 'ACCESSIBLE',
        resolvedBranch: branchInfo.name,
        resolvedRevision: branchInfo.commitSha,
        errorMessage: null,
        verifiedAt,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to verify repository access.';

      await this.repository.updateConnection(conn.id, {
        connectionStatus: 'UNREACHABLE',
        lastFailureReason: errorMsg,
      });

      return {
        connectionId: conn.id,
        accessible: false,
        status: 'UNREACHABLE',
        resolvedBranch: conn.selectedBranch,
        resolvedRevision: conn.selectedRevision ?? 'unknown',
        errorMessage: errorMsg,
        verifiedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Performs an actual repository source import, writing files to the local workspace and syncing V2 intelligence.
   */
  async importRepository(
    userId: string | null | undefined,
    projectId: string,
    connectionId: string,
    options?: { branch?: string; revision?: string },
  ): Promise<RepositoryImportResultDto> {
    const project = await this.checkProjectAccess(projectId, userId);

    if (project.status === 'ARCHIVED') {
      throw new ProjectArchivedError('Cannot import repository on an archived project.');
    }

    const conn = await this.repository.getConnectionById(connectionId);
    if (!conn || conn.projectId !== projectId) {
      throw new RepositoryConnectionNotFoundError();
    }

    const targetBranch = options?.branch?.trim() || conn.selectedBranch;
    let targetRevision = options?.revision?.trim() || conn.selectedRevision;

    // Create abort controller for cancellation support
    const abortController = new AbortController();
    this.inFlightAbortControllers.set(connectionId, abortController);

    // Mark connection status as IMPORTING
    await this.repository.updateConnection(conn.id, {
      connectionStatus: 'IMPORTING',
      importStatus: 'IMPORTING',
      lastFailureReason: null,
    });

    const importRecord = await this.repository.createImportRecord({
      repositoryConnectionId: conn.id,
      projectId,
      branch: targetBranch,
      revision: targetRevision ?? 'PENDING',
      status: 'IMPORTING',
    });

    await this.recordAudit(userId, 'REPOSITORY_IMPORT_STARTED', {
      connectionId: conn.id,
      projectId,
      branch: targetBranch,
    });

    let token: string | null = null;
    if (conn.encryptedCredentials) {
      token = await this.vault.decrypt(conn.encryptedCredentials, conn.id);
    }

    try {
      // 1. Resolve commit revision if not specified
      if (!targetRevision) {
        const branchInfo = await this.providerClient.getBranch(
          conn.owner,
          conn.repositoryName,
          targetBranch,
          token,
          abortController.signal,
        );
        targetRevision = branchInfo.commitSha;
      }

      // 2. Fetch repository source files from provider
      const downloadedFiles = await this.providerClient.fetchRepositoryFiles({
        owner: conn.owner,
        repo: conn.repositoryName,
        ref: targetRevision,
        token,
        signal: abortController.signal,
      });

      // 3. Atomically import files into the local workspace storage directory
      const importResult = await this.importer.importFiles({
        projectId,
        connectionId: conn.id,
        branch: targetBranch,
        revision: targetRevision,
        files: downloadedFiles,
        signal: abortController.signal,
      });

      // 4. Update import record with success
      await this.repository.updateImportRecord(importRecord.id, {
        status: 'IMPORTED',
        revision: targetRevision,
        fileCount: importResult.fileCount,
        totalSizeBytes: BigInt(importResult.totalSizeBytes),
        storagePath: importResult.localPath,
        completedAt: new Date(),
        durationMs: importResult.durationMs,
      });

      // 5. Update connection with imported metadata
      const updatedConn = await this.repository.updateConnection(conn.id, {
        connectionStatus: 'CONNECTED',
        importStatus: 'IMPORTED',
        selectedBranch: targetBranch,
        importedRevision: targetRevision,
        localPath: importResult.localPath,
        fileCount: importResult.fileCount,
        totalSizeBytes: BigInt(importResult.totalSizeBytes),
        lastImportedAt: new Date(),
        lastFailureReason: null,
      });

      // 6. Seamlessly synchronize with V2 ProjectSource if active
      if (updatedConn.isActive) {
        await this.syncDownstreamProjectSource(projectId, updatedConn);
      }

      await this.recordAudit(userId, 'REPOSITORY_IMPORT_COMPLETED', {
        connectionId: conn.id,
        projectId,
        branch: targetBranch,
        revision: targetRevision,
        fileCount: importResult.fileCount,
        totalSizeBytes: importResult.totalSizeBytes,
      });

      return importResult;
    } catch (err: unknown) {
      const isCancelled =
        err instanceof RepositoryImportCancelledError ||
        abortController.signal.aborted;

      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error during repository import.';

      const finalStatus = isCancelled ? 'CANCELLED' : 'FAILED';

      await this.repository.updateImportRecord(importRecord.id, {
        status: finalStatus as any,
        errorMessage,
        completedAt: new Date(),
      });

      await this.repository.updateConnection(conn.id, {
        connectionStatus: isCancelled ? 'CONFIGURED' : 'FAILED',
        importStatus: finalStatus as any,
        lastFailureReason: errorMessage,
      });

      const auditAction = isCancelled
        ? 'REPOSITORY_IMPORT_CANCELLED'
        : 'REPOSITORY_IMPORT_FAILED';

      await this.recordAudit(userId, auditAction, {
        connectionId: conn.id,
        projectId,
        error: errorMessage,
      });

      throw err;
    } finally {
      this.inFlightAbortControllers.delete(connectionId);
    }
  }

  /**
   * Cancels an ongoing repository import.
   */
  async cancelImport(
    userId: string | null | undefined,
    projectId: string,
    connectionId: string,
  ): Promise<{ readonly cancelled: true }> {
    await this.checkProjectAccess(projectId, userId);

    const controller = this.inFlightAbortControllers.get(connectionId);
    if (controller) {
      controller.abort();
      this.inFlightAbortControllers.delete(connectionId);
    }

    return { cancelled: true };
  }

  /**
   * Resolves an immutable execution snapshot of the active (or requested) repository connection.
   */
  async resolveRepositorySnapshot(
    userId: string | null | undefined,
    projectId: string,
    connectionId?: string,
  ): Promise<RepositoryConnectionSnapshot> {
    await this.checkProjectAccess(projectId, userId);

    let targetConn: RepositoryConnection | null = null;

    if (connectionId) {
      targetConn = await this.repository.getConnectionById(connectionId);
    } else {
      const connections = await this.repository.listConnectionsByProjectId(projectId, false);
      targetConn = connections.find((c) => c.isActive) ?? connections[0] ?? null;
    }

    if (!targetConn || targetConn.projectId !== projectId) {
      throw new RepositoryConnectionNotFoundError('No eligible repository connection found.');
    }

    return toRepositoryConnectionSnapshot(targetConn);
  }

  /**
   * Verifies Git provider credentials directly.
   */
  async verifyProviderAuth(
    _userId: string | null | undefined,
    token: string,
  ): Promise<GitProviderAccountDto> {
    return this.providerClient.verifyAuth(token);
  }

  /**
   * Lists repositories accessible to the user on the Git provider.
   */
  async listProviderRepositories(
    _userId: string | null | undefined,
    token?: string | null,
    search?: string,
  ): Promise<readonly GitProviderRepositoryDto[]> {
    return this.providerClient.listRepositories(token, search);
  }

  /**
   * Lists branches for a repository from the Git provider.
   */
  async listProviderBranches(
    _userId: string | null | undefined,
    repositoryIdentifier: string,
    token?: string | null,
  ): Promise<readonly GitBranchDto[]> {
    const parts = repositoryIdentifier.trim().split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new RepositoryValidationError(
        'Repository identifier must be in the format "owner/repo".',
      );
    }
    return this.providerClient.listBranches(parts[0], parts[1], token);
  }

  /**
   * Synchronizes active repository connection to V2 ProjectSource and ProjectGitMetadata.
   * This bridges the imported source directly to V2 indexing, V3 requirements, V4 RAG, and V7 repair.
   */
  private async syncDownstreamProjectSource(
    projectId: string,
    conn: RepositoryConnection,
  ): Promise<void> {
    if (!conn.localPath) return;

    try {
      const identity = calculateSourceRootIdentity(conn.localPath, 'LOCAL_DIRECTORY');

      const source = await this.sourceRepository.upsertSource(projectId, {
        kind: 'LOCAL_DIRECTORY',
        displayName: conn.displayName,
        rootPath: conn.localPath,
        identityFingerprint: identity.identityFingerprint,
        filesystemCreatedAt: identity.filesystemCreatedAt,
        filesystemModifiedAt: identity.filesystemModifiedAt,
        metadataRefreshedAt: identity.metadataRefreshedAt,
        lastValidatedAt: identity.metadataRefreshedAt,
      });

      await this.gitMetadataRepository.upsertGitMetadata(source.id, {
        isGitRepository: true,
        repositoryRoot: conn.localPath,
        sourceRelationToRepository: 'ROOT',
        currentBranch: conn.selectedBranch,
        headCommit: conn.importedRevision ?? conn.selectedRevision ?? null,
        isDetachedHead: false,
        lastCheckedAt: new Date(),
      });
    } catch {
      // Don't fail repository activation if source sync fails
    }
  }
}
