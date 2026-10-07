/**
 * @file packages/core/src/local-folders/secure-file-access-service.ts
 * Privileged business service providing secure, bounded, read-only file access within connected project roots (Phase 121).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient, AuthAuditAction } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import type {
  ListProjectDirectoryInput,
  ProjectDirectoryListingDto,
  ProjectFileEntryDto,
  ReadProjectFileInput,
  ProjectFileContentDto,
  SearchProjectFilesInput,
  ProjectFileSearchResultDto,
  ProjectFileSearchMatchDto,
  CheckProjectFileExistsInput,
  ProjectFileExistsResultDto,
  GetProjectFileMetadataInput,
  ProjectFileMetadataDto,
  DetectProjectGitInput,
  ProjectGitDetectionDto,
} from '@ai-quality/contracts';
import { getLogger } from '../logging/logger.js';
import {
  LocalFolderNotFoundError,
  LocalFolderAccessDeniedError,
  LocalFolderNotConfiguredError,
  LocalFolderFileNotFoundError,
  LocalFolderFileTooLargeError,
  LocalFolderInvalidPathError,
  LocalFolderPathTraversalError,
  LocalFolderSymlinkEscapeError,
} from './local-folder-errors.js';
import { SecureProjectRootGuard } from './secure-project-root-guard.js';
import { SourceContentPolicy } from '../sources/content/source-content-policy.js';

const DEFAULT_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'coverage',
  '.cache',
]);

export class SecureFileAccessService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    const client = prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
  }

  /**
   * Lists entries within an authorized project directory.
   */
  async listDirectory(
    userId: string,
    input: ListProjectDirectoryInput,
  ): Promise<ProjectDirectoryListingDto> {
    const guard = await this.getAuthorizedProjectRoot(userId, input.projectId);

    let resolution;
    try {
      resolution = guard.resolveSecurePath(input.relativeDirectoryPath || '.');
    } catch (err: unknown) {
      await this.handleSecurityException(userId, input.projectId, err);
      throw err;
    }

    if (!resolution.exists) {
      throw new LocalFolderFileNotFoundError(`Directory "${resolution.relativePath}" does not exist.`);
    }

    const stat = fs.statSync(resolution.resolvedPath);
    if (!stat.isDirectory()) {
      throw new LocalFolderInvalidPathError(`Target "${resolution.relativePath}" is not a directory.`);
    }

    const maxEntries = Math.min(input.maxEntries ?? 1000, 10000);
    const maxDepth = Math.min(input.maxDepth ?? 5, 20);
    const recursive = input.recursive ?? false;

    const entries: ProjectFileEntryDto[] = [];
    let truncated = false;

    interface WalkItem {
      readonly currentDir: string;
      readonly currentDepth: number;
    }

    const queue: WalkItem[] = [{ currentDir: resolution.resolvedPath, currentDepth: 0 }];

    while (queue.length > 0) {
      const item = queue.shift()!;
      let dirEntries: fs.Dirent[] = [];
      try {
        dirEntries = fs.readdirSync(item.currentDir, { withFileTypes: true });
      } catch (err: unknown) {
        getLogger().warn('local_folder.readdir_error', {
          dir: item.currentDir,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      for (const dirent of dirEntries) {
        if (entries.length >= maxEntries) {
          truncated = true;
          break;
        }

        const entryPath = path.join(item.currentDir, dirent.name);
        let relFromRoot: string;
        try {
          const entryResolution = guard.resolveSecurePath(
            path.relative(guard.canonicalRoot, entryPath),
          );
          relFromRoot = entryResolution.relativePath;
        } catch {
          // Skip symlinks or paths that escape
          continue;
        }

        const isDir = dirent.isDirectory();
        const isSymlink = dirent.isSymbolicLink();
        const ext = isDir ? '' : path.extname(dirent.name).toLowerCase();
        let sizeBytes = 0;
        let modifiedAt = new Date().toISOString();

        try {
          const entryStat = fs.statSync(entryPath);
          sizeBytes = entryStat.size;
          modifiedAt = entryStat.mtime.toISOString();
        } catch {
          // Non-fatal stat error
        }

        const isBinary = !isDir && SourceContentPolicy.isBinaryExtension(ext);

        entries.push({
          name: dirent.name,
          relativePath: relFromRoot,
          kind: isDir ? 'directory' : isSymlink ? 'symlink' : 'file',
          sizeBytes,
          modifiedAt,
          isBinary,
          extension: ext,
        });

        if (recursive && isDir && item.currentDepth < maxDepth) {
          if (!DEFAULT_IGNORE_DIRS.has(dirent.name)) {
            queue.push({
              currentDir: entryPath,
              currentDepth: item.currentDepth + 1,
            });
          }
        }
      }

      if (truncated) break;
    }

    const isGit = fs.existsSync(path.join(guard.canonicalRoot, '.git'));

    return {
      relativeDirectoryPath: resolution.relativePath,
      entries,
      totalEntries: entries.length,
      truncated,
      isGitRepository: isGit,
    };
  }

  /**
   * Securely reads a file's content within the project root.
   */
  async readFile(
    userId: string,
    input: ReadProjectFileInput,
  ): Promise<ProjectFileContentDto> {
    const guard = await this.getAuthorizedProjectRoot(userId, input.projectId);

    let resolution;
    try {
      resolution = guard.resolveSecurePath(input.relativePath);
    } catch (err: unknown) {
      await this.handleSecurityException(userId, input.projectId, err);
      throw err;
    }

    if (!resolution.exists) {
      throw new LocalFolderFileNotFoundError(`File "${input.relativePath}" does not exist.`);
    }

    const stat = fs.statSync(resolution.resolvedPath);
    if (stat.isDirectory()) {
      throw new LocalFolderInvalidPathError(`Path "${input.relativePath}" is a directory, not a file.`);
    }

    const maxSizeBytes = Math.min(input.maxSizeBytes ?? 10 * 1024 * 1024, 50 * 1024 * 1024);
    if (stat.size > maxSizeBytes) {
      throw new LocalFolderFileTooLargeError(
        `File size (${stat.size} bytes) exceeds maximum permitted limit of ${maxSizeBytes} bytes.`,
      );
    }

    const ext = path.extname(resolution.resolvedPath).toLowerCase();
    let isBinary = SourceContentPolicy.isBinaryExtension(ext);

    // If extension is not known binary, inspect sample buffer for NUL bytes
    if (!isBinary && stat.size > 0) {
      const sampleSize = Math.min(stat.size, 512);
      const sampleBuf = Buffer.alloc(sampleSize);
      const fd = fs.openSync(resolution.resolvedPath, 'r');
      try {
        fs.readSync(fd, sampleBuf, 0, sampleSize, 0);
        isBinary = SourceContentPolicy.containsBinaryNullBytes(sampleBuf);
      } finally {
        fs.closeSync(fd);
      }
    }

    if (isBinary) {
      const buffer = fs.readFileSync(resolution.resolvedPath);
      return {
        relativePath: resolution.relativePath,
        content: buffer.toString('base64'),
        encoding: 'base64',
        sizeBytes: stat.size,
        isBinary: true,
        isTruncated: false,
        lineCount: 0,
        modifiedAt: stat.mtime.toISOString(),
      };
    }

    const text = fs.readFileSync(resolution.resolvedPath, 'utf-8');
    const lineCount = text.length === 0 ? 0 : text.split('\n').length;

    return {
      relativePath: resolution.relativePath,
      content: text,
      encoding: 'utf-8',
      sizeBytes: stat.size,
      isBinary: false,
      isTruncated: false,
      lineCount,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  /**
   * Bounded search across filenames and content within the project root.
   */
  async search(
    userId: string,
    input: SearchProjectFilesInput,
  ): Promise<ProjectFileSearchResultDto> {
    const startTime = performance.now();
    const guard = await this.getAuthorizedProjectRoot(userId, input.projectId);

    const query = input.query.trim();
    if (!query) {
      return {
        query: '',
        matches: [],
        totalMatches: 0,
        durationMs: 0,
        truncated: false,
      };
    }

    const searchType = input.searchType ?? 'both';
    const caseSensitive = input.caseSensitive ?? false;
    const maxResults = Math.min(input.maxResults ?? 100, 500);
    const targetQuery = caseSensitive ? query : query.toLowerCase();

    const matches: ProjectFileSearchMatchDto[] = [];
    let truncated = false;
    let filesScanned = 0;
    const MAX_FILES_SCANNED = 1000;
    const TIMEOUT_MS = 10000;

    const queue: string[] = [guard.canonicalRoot];

    while (queue.length > 0) {
      if (matches.length >= maxResults || filesScanned >= MAX_FILES_SCANNED) {
        truncated = true;
        break;
      }

      if (performance.now() - startTime > TIMEOUT_MS) {
        truncated = true;
        break;
      }

      const currentDir = queue.shift()!;
      let dirEntries: fs.Dirent[] = [];
      try {
        dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const dirent of dirEntries) {
        if (matches.length >= maxResults) {
          truncated = true;
          break;
        }

        const fullPath = path.join(currentDir, dirent.name);
        let relPath: string;
        try {
          const res = guard.resolveSecurePath(path.relative(guard.canonicalRoot, fullPath));
          relPath = res.relativePath;
        } catch {
          continue;
        }

        if (dirent.isDirectory()) {
          if (!DEFAULT_IGNORE_DIRS.has(dirent.name)) {
            queue.push(fullPath);
          }
          continue;
        }

        filesScanned++;

        // 1. Filename matching
        if (searchType === 'filename' || searchType === 'both') {
          const filenameToTest = caseSensitive ? dirent.name : dirent.name.toLowerCase();
          if (filenameToTest.includes(targetQuery)) {
            matches.push({
              relativePath: relPath,
              matchType: 'filename',
              previewSnippet: dirent.name,
            });
          }
        }

        // 2. Content matching (text files only, <= 1MB)
        if ((searchType === 'content' || searchType === 'both') && matches.length < maxResults) {
          const ext = path.extname(dirent.name).toLowerCase();
          if (!SourceContentPolicy.isBinaryExtension(ext)) {
            try {
              const stat = fs.statSync(fullPath);
              if (stat.size <= 1024 * 1024) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const contentToTest = caseSensitive ? content : content.toLowerCase();

                if (contentToTest.includes(targetQuery)) {
                  const lines = content.split('\n');
                  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                    const line = lines[lineIdx];
                    if (typeof line !== 'string') continue;
                    const lineToTest = caseSensitive ? line : line.toLowerCase();
                    if (lineToTest.includes(targetQuery)) {
                      matches.push({
                        relativePath: relPath,
                        matchType: 'content',
                        lineNumber: lineIdx + 1,
                        lineContent: line.trim().substring(0, 200),
                        previewSnippet: line.trim().substring(0, 100),
                      });
                      if (matches.length >= maxResults) {
                        truncated = true;
                        break;
                      }
                    }
                  }
                }
              }
            } catch {
              // Skip read errors
            }
          }
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime);

    return {
      query,
      matches,
      totalMatches: matches.length,
      durationMs,
      truncated,
    };
  }

  /**
   * Checks whether a file or folder exists within the project root.
   */
  async checkExists(
    userId: string,
    input: CheckProjectFileExistsInput,
  ): Promise<ProjectFileExistsResultDto> {
    const guard = await this.getAuthorizedProjectRoot(userId, input.projectId);

    let resolution;
    try {
      resolution = guard.resolveSecurePath(input.relativePath);
    } catch (err: unknown) {
      await this.handleSecurityException(userId, input.projectId, err);
      throw err;
    }

    if (!resolution.exists) {
      return { exists: false };
    }

    try {
      const stat = fs.statSync(resolution.resolvedPath);
      return {
        exists: true,
        kind: stat.isDirectory() ? 'directory' : 'file',
        sizeBytes: stat.size,
      };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Retrieves basic filesystem metadata for a path.
   */
  async getMetadata(
    userId: string,
    input: GetProjectFileMetadataInput,
  ): Promise<ProjectFileMetadataDto> {
    const guard = await this.getAuthorizedProjectRoot(userId, input.projectId);

    let resolution;
    try {
      resolution = guard.resolveSecurePath(input.relativePath);
    } catch (err: unknown) {
      await this.handleSecurityException(userId, input.projectId, err);
      throw err;
    }

    if (!resolution.exists) {
      throw new LocalFolderFileNotFoundError(`Path "${input.relativePath}" does not exist.`);
    }

    const stat = fs.statSync(resolution.resolvedPath);
    const isDir = stat.isDirectory();
    const ext = isDir ? '' : path.extname(resolution.resolvedPath).toLowerCase();
    const isBinary = !isDir && SourceContentPolicy.isBinaryExtension(ext);
    const isGit = fs.existsSync(path.join(guard.canonicalRoot, '.git'));

    return {
      name: path.basename(resolution.resolvedPath),
      relativePath: resolution.relativePath,
      kind: isDir ? 'directory' : 'file',
      sizeBytes: stat.size,
      createdAt: stat.birthtime.toISOString(),
      modifiedAt: stat.mtime.toISOString(),
      isBinary,
      extension: ext,
      isGitRepository: isGit,
    };
  }

  /**
   * Detects Git repository state within the connected project root.
   */
  async detectGit(
    userId: string,
    input: DetectProjectGitInput,
  ): Promise<ProjectGitDetectionDto> {
    const guard = await this.getAuthorizedProjectRoot(userId, input.projectId);
    const gitDir = path.join(guard.canonicalRoot, '.git');

    if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
      return {
        isGitRepository: false,
        currentBranch: null,
        headCommit: null,
        isDetachedHead: false,
        repositoryRoot: null,
      };
    }

    let currentBranch: string | null = null;
    let headCommit: string | null = null;
    let isDetachedHead = false;

    try {
      const headFile = path.join(gitDir, 'HEAD');
      if (fs.existsSync(headFile)) {
        const headContent = fs.readFileSync(headFile, 'utf-8').trim();
        if (headContent.startsWith('ref: refs/heads/')) {
          currentBranch = headContent.replace('ref: refs/heads/', '').trim();
          const refFile = path.join(gitDir, 'refs', 'heads', currentBranch);
          if (fs.existsSync(refFile)) {
            headCommit = fs.readFileSync(refFile, 'utf-8').trim();
          }
        } else if (/^[0-9a-fA-F]{40}$/.test(headContent)) {
          headCommit = headContent;
          isDetachedHead = true;
        }
      }
    } catch {
      // Non-fatal Git parsing error
    }

    return {
      isGitRepository: true,
      currentBranch,
      headCommit,
      isDetachedHead,
      repositoryRoot: guard.canonicalRoot,
    };
  }

  private async getAuthorizedProjectRoot(
    userId: string,
    projectId: string,
  ): Promise<SecureProjectRootGuard> {
    if (!projectId) {
      throw new LocalFolderInvalidPathError('Project ID is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { source: true },
    });

    if (!project || project.deletedAt) {
      throw new LocalFolderNotFoundError('Project was not found.');
    }

    if (project.userId && project.userId !== userId) {
      await this.recordSecurityAudit(
        userId,
        projectId,
        'Cross-project unauthorized filesystem access attempt',
      );
      throw new LocalFolderAccessDeniedError('Project does not belong to the authenticated user.');
    }

    if (!project.source || !project.source.rootPath) {
      throw new LocalFolderNotConfiguredError('No local folder is configured for this project.');
    }

    return new SecureProjectRootGuard(project.source.rootPath);
  }

  private async handleSecurityException(
    userId: string,
    projectId: string,
    err: unknown,
  ): Promise<void> {
    if (
      err instanceof LocalFolderPathTraversalError ||
      err instanceof LocalFolderSymlinkEscapeError
    ) {
      await this.recordSecurityAudit(userId, projectId, err.message);
    }
  }

  private async recordSecurityAudit(
    userId: string,
    projectId: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.prisma.authAuditEvent.create({
        data: {
          userId,
          action: 'LOCAL_FOLDER_SECURITY_VIOLATION' as AuthAuditAction,
          metadata: {
            projectId,
            reason,
          },
        },
      });
    } catch (auditErr) {
      getLogger().warn('local_folder.security_audit_failed', {
        reason,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }
  }
}
