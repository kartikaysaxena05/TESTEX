/**
 * @file packages/core/src/local-folders/local-folder-service.ts
 * Privileged business service for connecting, validating, and managing local project folders (Phase 121).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PrismaClient, Prisma, AuthAuditAction } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import type {
  ConnectLocalFolderInput,
  DisconnectLocalFolderInput,
  ValidateLocalFolderInput,
  LocalFolderConnectionDto,
} from '@ai-quality/contracts';
import { getLogger } from '../logging/logger.js';
import {
  LocalFolderNotFoundError,
  LocalFolderAccessDeniedError,
  LocalFolderNotConfiguredError,
  LocalFolderPermissionDeniedError,
  LocalFolderInvalidPathError,
} from './local-folder-errors.js';
import { toLocalFolderDto } from './local-folder-mappers.js';

export class LocalFolderService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    const client = prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
  }

  /**
   * Connects a real local directory to an existing project with full security validation,
   * tenant isolation, and audit trail logging.
   */
  async connectLocalFolder(
    userId: string,
    input: ConnectLocalFolderInput,
  ): Promise<LocalFolderConnectionDto> {
    if (!input.projectId) {
      throw new LocalFolderInvalidPathError('Project ID is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      include: { source: { include: { gitMetadata: true } } },
    });

    if (!project || project.deletedAt) {
      throw new LocalFolderNotFoundError('Project was not found.');
    }

    // Multi-user tenant verification
    if (project.userId && project.userId !== userId) {
      await this.recordAudit(userId, 'LOCAL_FOLDER_SECURITY_VIOLATION', {
        projectId: input.projectId,
        reason: 'Cross-project unauthorized folder connection attempt',
      });
      throw new LocalFolderAccessDeniedError('Project does not belong to the authenticated user.');
    }

    const rawDirectoryPath = input.directoryPath?.trim();
    if (!rawDirectoryPath) {
      throw new LocalFolderInvalidPathError('Directory path is required.');
    }

    if (!path.isAbsolute(rawDirectoryPath)) {
      throw new LocalFolderInvalidPathError('Directory path must be an absolute path.');
    }

    if (!fs.existsSync(rawDirectoryPath)) {
      throw new LocalFolderNotFoundError(`Local directory does not exist: "${rawDirectoryPath}"`);
    }

    let canonicalPath: string;
    try {
      canonicalPath = fs.realpathSync(rawDirectoryPath);
    } catch (err: unknown) {
      throw new LocalFolderInvalidPathError(
        `Failed to resolve realpath: ${err instanceof Error ? err.message : 'Filesystem error'}`,
      );
    }

    try {
      const stat = fs.statSync(canonicalPath);
      if (!stat.isDirectory()) {
        throw new LocalFolderInvalidPathError(`The selected path is not a directory: "${canonicalPath}"`);
      }
      fs.accessSync(canonicalPath, fs.constants.R_OK);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'EACCES' || code === 'EPERM') {
        throw new LocalFolderPermissionDeniedError(
          `Permission denied reading directory: "${canonicalPath}"`,
        );
      }
      throw err;
    }

    // Inspect Git repository metadata
    const isGit = fs.existsSync(path.join(canonicalPath, '.git'));
    let currentBranch: string | null = null;
    let headCommit: string | null = null;

    if (isGit) {
      try {
        const headFile = path.join(canonicalPath, '.git', 'HEAD');
        if (fs.existsSync(headFile)) {
          const headContent = fs.readFileSync(headFile, 'utf-8').trim();
          if (headContent.startsWith('ref: refs/heads/')) {
            currentBranch = headContent.replace('ref: refs/heads/', '').trim();
            const refFile = path.join(canonicalPath, '.git', 'refs', 'heads', currentBranch);
            if (fs.existsSync(refFile)) {
              headCommit = fs.readFileSync(refFile, 'utf-8').trim();
            }
          } else if (/^[0-9a-fA-F]{40}$/.test(headContent)) {
            headCommit = headContent;
          }
        }
      } catch {
        // Non-fatal Git detection
      }
    }

    let displayName = path.basename(canonicalPath);
    if (!displayName || displayName === '/' || displayName === '\\') {
      displayName = 'root';
    }

    const identityFingerprint = crypto.createHash('sha256').update(canonicalPath).digest('hex');
    const now = new Date();
    const stat = fs.statSync(canonicalPath);

    const updatedSource = await this.prisma.$transaction(async tx => {
      const source = await tx.projectSource.upsert({
        where: { projectId: input.projectId },
        create: {
          projectId: input.projectId,
          kind: 'LOCAL_DIRECTORY',
          displayName,
          rootPath: canonicalPath,
          identityFingerprint,
          filesystemCreatedAt: stat.birthtime,
          filesystemModifiedAt: stat.mtime,
          metadataRefreshedAt: now,
          lastValidatedAt: now,
        },
        update: {
          kind: 'LOCAL_DIRECTORY',
          displayName,
          rootPath: canonicalPath,
          identityFingerprint,
          filesystemCreatedAt: stat.birthtime,
          filesystemModifiedAt: stat.mtime,
          metadataRefreshedAt: now,
          lastValidatedAt: now,
        },
        include: { gitMetadata: true },
      });

      if (isGit) {
        await tx.projectGitMetadata.upsert({
          where: { sourceId: source.id },
          create: {
            sourceId: source.id,
            isGitRepository: true,
            repositoryRoot: canonicalPath,
            currentBranch,
            headCommit,
            isDetachedHead: !currentBranch && !!headCommit,
            lastCheckedAt: now,
          },
          update: {
            isGitRepository: true,
            repositoryRoot: canonicalPath,
            currentBranch,
            headCommit,
            isDetachedHead: !currentBranch && !!headCommit,
            lastCheckedAt: now,
          },
        });
      }

      return tx.projectSource.findUnique({
        where: { id: source.id },
        include: { gitMetadata: true },
      });
    });

    await this.recordAudit(userId, 'LOCAL_FOLDER_CONNECTED', {
      projectId: input.projectId,
      rootPath: canonicalPath,
      displayName,
      isGitRepository: isGit,
      currentBranch,
    });

    getLogger().info('local_folder.connected', {
      projectId: input.projectId,
      userId,
      rootPath: canonicalPath,
      isGit,
    });

    return toLocalFolderDto(updatedSource!, 'AVAILABLE');
  }

  /**
   * Retrieves the currently connected local folder for a project.
   */
  async getLocalFolder(userId: string, projectId: string): Promise<LocalFolderConnectionDto | null> {
    if (!projectId) {
      throw new LocalFolderInvalidPathError('Project ID is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { source: { include: { gitMetadata: true } } },
    });

    if (!project || project.deletedAt) {
      throw new LocalFolderNotFoundError('Project was not found.');
    }

    if (project.userId && project.userId !== userId) {
      await this.recordAudit(userId, 'LOCAL_FOLDER_SECURITY_VIOLATION', {
        projectId,
        reason: 'Cross-project unauthorized folder retrieval attempt',
      });
      throw new LocalFolderAccessDeniedError('Project does not belong to the authenticated user.');
    }

    if (!project.source) {
      return null;
    }

    return toLocalFolderDto(project.source);
  }

  /**
   * Validates accessibility of the connected local folder.
   */
  async validateLocalFolder(
    userId: string,
    input: ValidateLocalFolderInput,
  ): Promise<LocalFolderConnectionDto> {
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      include: { source: { include: { gitMetadata: true } } },
    });

    if (!project || project.deletedAt) {
      throw new LocalFolderNotFoundError('Project was not found.');
    }

    if (project.userId && project.userId !== userId) {
      await this.recordAudit(userId, 'LOCAL_FOLDER_SECURITY_VIOLATION', {
        projectId: input.projectId,
        reason: 'Cross-project unauthorized folder validation attempt',
      });
      throw new LocalFolderAccessDeniedError('Project does not belong to the authenticated user.');
    }

    if (!project.source) {
      throw new LocalFolderNotConfiguredError('No local folder is configured for this project.');
    }

    const now = new Date();
    let isAvailable = false;
    let permDenied = false;

    try {
      if (fs.existsSync(project.source.rootPath) && fs.statSync(project.source.rootPath).isDirectory()) {
        fs.accessSync(project.source.rootPath, fs.constants.R_OK);
        isAvailable = true;
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'EACCES' || code === 'EPERM') {
        permDenied = true;
      }
    }

    await this.prisma.projectSource.update({
      where: { id: project.source.id },
      data: { lastValidatedAt: now },
    });

    await this.recordAudit(userId, 'LOCAL_FOLDER_VALIDATED', {
      projectId: input.projectId,
      available: isAvailable,
      permissionDenied: permDenied,
    });

    return toLocalFolderDto(project.source, isAvailable ? 'AVAILABLE' : 'UNAVAILABLE');
  }

  /**
   * Disconnects the local folder from the project.
   */
  async disconnectLocalFolder(
    userId: string,
    input: DisconnectLocalFolderInput,
  ): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      include: { source: true },
    });

    if (!project || project.deletedAt) {
      throw new LocalFolderNotFoundError('Project was not found.');
    }

    if (project.userId && project.userId !== userId) {
      await this.recordAudit(userId, 'LOCAL_FOLDER_SECURITY_VIOLATION', {
        projectId: input.projectId,
        reason: 'Cross-project unauthorized folder detachment attempt',
      });
      throw new LocalFolderAccessDeniedError('Project does not belong to the authenticated user.');
    }

    if (!project.source) {
      return true;
    }

    await this.prisma.projectSource.delete({
      where: { id: project.source.id },
    });

    await this.recordAudit(userId, 'LOCAL_FOLDER_DISCONNECTED', {
      projectId: input.projectId,
      detachedSourceId: project.source.id,
    });

    getLogger().info('local_folder.disconnected', {
      projectId: input.projectId,
      userId,
    });

    return true;
  }

  private async recordAudit(
    userId: string,
    action: AuthAuditAction,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.authAuditEvent.create({
        data: {
          userId,
          action,
          metadata: details as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      getLogger().warn('local_folder.audit_failed', {
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
