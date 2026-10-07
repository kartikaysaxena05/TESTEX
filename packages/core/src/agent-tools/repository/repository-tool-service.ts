/**
 * @file packages/core/src/agent-tools/repository/repository-tool-service.ts
 * Privileged business domain service for V10 Phase 145: Repository Read / Search Tools.
 *
 * Implements:
 * 1. list_files: Bounded, recursive file & directory listing within project root.
 * 2. read_file: Text-only reading with line numbering, file size limits, output truncation.
 * 3. search_files: Text string or regex search with line numbers and surrounding context.
 * 4. find_symbol: AST-based TypeScript/JavaScript symbol locator.
 * 5. get_file_metadata: File metadata (size, extension, modified time, isBinary).
 *
 * Security & Isolation:
 * - Containment enforced via SecureProjectRootGuard.
 * - Sensitive credential & secret files strictly denied via isSensitiveFile.
 * - Binary files strictly rejected.
 * - Strict project tenant isolation through assertProjectAccess.
 * - No file execution or modification allowed.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/client.js';
import { getLogger, type ILogger } from '../../logging/index.js';
import {
  type RepoListFilesInputDto,
  type RepoListFilesOutputDto,
  type RepoFileItemDto,
  type RepoReadFileInputDto,
  type RepoReadFileOutputDto,
  type RepoSearchFilesInputDto,
  type RepoSearchFilesOutputDto,
  type RepoSearchMatchDto,
  type RepoFindSymbolInputDto,
  type RepoFindSymbolOutputDto,
  type RepoSymbolMatchDto,
  type RepoGetFileMetadataInputDto,
  type RepoGetFileMetadataOutputDto,
} from '@ai-quality/contracts';
import {
  RepositoryToolFileNotFoundError,
  RepositoryToolPathTraversalError,
  RepositoryToolBinaryFileError,
  RepositoryToolFileTooLargeError,
  RepositoryToolSensitiveFileError,
  RepositoryToolNotConfiguredError,
} from './repository-tool-errors.js';
import { SecureProjectRootGuard } from '../../local-folders/secure-project-root-guard.js';
import {
  LocalFolderPathTraversalError,
  LocalFolderSymlinkEscapeError,
  LocalFolderInvalidPathError,
} from '../../local-folders/local-folder-errors.js';
import { SourceContentPolicy } from '../../sources/content/source-content-policy.js';
import { isSensitiveFile } from '../../sources/content/sensitive-file-rules.js';
import { TypeScriptSourceParser } from '../../sources/indexing/typescript-source-parser.js';
import {
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from '../../ai-provider/ai-provider-errors.js';

export const REPO_DEFAULT_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'out',
  'coverage',
  '.cache',
  '.idea',
  '.vscode',
]);

export interface RepositoryToolServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
}

export class RepositoryToolService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly tsParser: TypeScriptSourceParser;

  constructor(deps?: RepositoryToolServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
    this.tsParser = new TypeScriptSourceParser();
  }

  // ============================================================================
  // 1. list_files
  // ============================================================================
  public async listFiles(
    input: RepoListFilesInputDto,
    userId: string,
  ): Promise<RepoListFilesOutputDto> {
    const guard = await this.resolveProjectGuard(input.projectId, userId);

    let resolution;
    try {
      resolution = guard.resolveSecurePath(input.relativeDirectory || '.');
    } catch (err: unknown) {
      this.translatePathError(input.relativeDirectory || '.', err);
    }

    if (!resolution.exists) {
      throw new RepositoryToolFileNotFoundError(resolution.relativePath);
    }

    const stat = fs.statSync(resolution.resolvedPath);
    if (!stat.isDirectory()) {
      throw new RepositoryToolPathTraversalError(
        resolution.relativePath,
        'Target path is a file, not a directory.',
      );
    }

    const maxFiles = Math.min(input.maxFiles ?? 1000, 5000);
    const maxDepth = Math.min(input.maxDepth ?? 10, 20);
    const recursive = input.recursive ?? false;

    const items: RepoFileItemDto[] = [];
    let truncated = false;

    interface WalkItem {
      readonly currentDir: string;
      readonly currentDepth: number;
    }

    const queue: WalkItem[] = [{ currentDir: resolution.resolvedPath, currentDepth: 0 }];

    while (queue.length > 0) {
      if (items.length >= maxFiles) {
        truncated = true;
        break;
      }

      const item = queue.shift()!;
      let dirents: fs.Dirent[] = [];
      try {
        dirents = fs.readdirSync(item.currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      // Sort entries for deterministic output
      dirents.sort((a, b) => a.name.localeCompare(b.name));

      for (const dirent of dirents) {
        if (items.length >= maxFiles) {
          truncated = true;
          break;
        }

        const entryPath = path.join(item.currentDir, dirent.name);
        const relFromRoot = path
          .relative(guard.canonicalRoot, entryPath)
          .replace(/\\/g, '/');

        // Do not expose ignored directories unless explicitly targeted
        if (dirent.isDirectory() && REPO_DEFAULT_IGNORE_DIRS.has(dirent.name)) {
          continue;
        }

        // Never list sensitive credential files
        if (isSensitiveFile(dirent.name)) {
          continue;
        }

        let type: 'file' | 'directory' | 'symlink' = 'file';
        let sizeBytes = 0;
        let modifiedAt = new Date().toISOString();

        try {
          const entryStat = fs.lstatSync(entryPath);
          if (entryStat.isDirectory()) {
            type = 'directory';
          } else if (entryStat.isSymbolicLink()) {
            type = 'symlink';
          } else {
            type = 'file';
            sizeBytes = entryStat.size;
          }
          modifiedAt = entryStat.mtime.toISOString();
        } catch {
          // Ignore unreadable entries
          continue;
        }

        items.push({
          relativePath: relFromRoot,
          name: dirent.name,
          type,
          sizeBytes,
          extension: path.extname(dirent.name).toLowerCase(),
          modifiedAt,
        });

        if (recursive && type === 'directory' && item.currentDepth < maxDepth) {
          queue.push({
            currentDir: entryPath,
            currentDepth: item.currentDepth + 1,
          });
        }
      }
    }

    return {
      relativeDirectory: resolution.relativePath,
      items,
      totalCount: items.length,
      truncated,
    };
  }

  // ============================================================================
  // 2. read_file
  // ============================================================================
  public async readFile(
    input: RepoReadFileInputDto,
    userId: string,
  ): Promise<RepoReadFileOutputDto> {
    const guard = await this.resolveProjectGuard(input.projectId, userId);

    let resolution;
    try {
      resolution = guard.resolveSecurePath(input.relativePath);
    } catch (err: unknown) {
      this.translatePathError(input.relativePath, err);
    }

    if (!resolution.exists) {
      throw new RepositoryToolFileNotFoundError(input.relativePath);
    }

    const stat = fs.statSync(resolution.resolvedPath);
    if (stat.isDirectory()) {
      throw new RepositoryToolPathTraversalError(
        resolution.relativePath,
        'Path is a directory, not a file.',
      );
    }

    // 1. Sensitive file check
    const filename = path.basename(resolution.resolvedPath);
    if (isSensitiveFile(filename)) {
      throw new RepositoryToolSensitiveFileError(resolution.relativePath);
    }

    // 2. File size limit
    const maxSizeBytes = Math.min(input.maxSizeBytes ?? 2 * 1024 * 1024, 10 * 1024 * 1024);
    if (stat.size > maxSizeBytes) {
      throw new RepositoryToolFileTooLargeError(
        resolution.relativePath,
        stat.size,
        maxSizeBytes,
      );
    }

    // 3. Binary detection
    const ext = path.extname(resolution.resolvedPath).toLowerCase();
    let isBinary = SourceContentPolicy.isBinaryExtension(ext);
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
      throw new RepositoryToolBinaryFileError(resolution.relativePath);
    }

    // 4. Read text content & handle line numbers
    const rawContent = fs.readFileSync(resolution.resolvedPath, 'utf-8');
    const allLines = rawContent.split(/\r?\n/);
    const totalLines = allLines.length;

    const startLine = Math.max(1, input.startLine ?? 1);
    const endLine = input.endLine ? Math.min(totalLines, input.endLine) : totalLines;

    if (startLine > totalLines) {
      return {
        relativePath: resolution.relativePath,
        content: '',
        lineCount: totalLines,
        startLine,
        endLine,
        sizeBytes: stat.size,
        truncated: false,
        encoding: 'utf-8',
      };
    }

    const selectedLines = allLines.slice(startLine - 1, endLine);
    const numberedLines = selectedLines.map((line, idx) => {
      const currentLineNum = startLine + idx;
      return `${currentLineNum} | ${line}`;
    });

    let joinedContent = numberedLines.join('\n');
    const maxChars = Math.min(input.maxOutputChars ?? 100000, 500000);
    let truncated = false;

    if (joinedContent.length > maxChars) {
      joinedContent = joinedContent.slice(0, maxChars) + '\n... [TRUNCATED]';
      truncated = true;
    }

    return {
      relativePath: resolution.relativePath,
      content: joinedContent,
      lineCount: totalLines,
      startLine,
      endLine,
      sizeBytes: stat.size,
      truncated,
      encoding: 'utf-8',
    };
  }

  // ============================================================================
  // 3. search_files
  // ============================================================================
  public async searchFiles(
    input: RepoSearchFilesInputDto,
    userId: string,
  ): Promise<RepoSearchFilesOutputDto> {
    const guard = await this.resolveProjectGuard(input.projectId, userId);

    let rootResolution;
    try {
      rootResolution = guard.resolveSecurePath(input.relativeDirectory || '.');
    } catch (err: unknown) {
      this.translatePathError(input.relativeDirectory || '.', err);
    }

    if (!rootResolution.exists) {
      throw new RepositoryToolFileNotFoundError(rootResolution.relativePath);
    }

    const query = input.query;
    const isRegex = input.isRegex ?? false;
    const caseSensitive = input.caseSensitive ?? false;
    const maxResults = Math.min(input.maxResults ?? 50, 200);
    const contextLines = Math.min(input.contextLines ?? 1, 5);

    let regex: RegExp;
    if (isRegex) {
      try {
        regex = new RegExp(query, caseSensitive ? 'g' : 'gi');
      } catch (err) {
        throw new AiInvalidRequestError(
          `Invalid search regular expression: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      // Escape for literal text match
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
    }

    const matches: RepoSearchMatchDto[] = [];
    let truncated = false;
    let filesScanned = 0;
    const MAX_FILES_TO_SCAN = 1000;

    const queue: string[] = [rootResolution.resolvedPath];

    while (queue.length > 0) {
      if (matches.length >= maxResults || filesScanned >= MAX_FILES_TO_SCAN) {
        truncated = true;
        break;
      }

      const currentDir = queue.shift()!;
      let dirents: fs.Dirent[] = [];
      try {
        dirents = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      dirents.sort((a, b) => a.name.localeCompare(b.name));

      for (const dirent of dirents) {
        if (matches.length >= maxResults) {
          truncated = true;
          break;
        }

        const fullPath = path.join(currentDir, dirent.name);
        const relFromRoot = path
          .relative(guard.canonicalRoot, fullPath)
          .replace(/\\/g, '/');

        if (dirent.isDirectory()) {
          if (!REPO_DEFAULT_IGNORE_DIRS.has(dirent.name)) {
            queue.push(fullPath);
          }
          continue;
        }

        // Skip sensitive files
        if (isSensitiveFile(dirent.name)) {
          continue;
        }

        // Skip known binary extensions
        const ext = path.extname(dirent.name).toLowerCase();
        if (SourceContentPolicy.isBinaryExtension(ext)) {
          continue;
        }

        filesScanned++;

        // Only search files <= 2MB
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 2 * 1024 * 1024) {
            continue;
          }

          const content = fs.readFileSync(fullPath, 'utf-8');
          // If null bytes found in text, skip
          if (content.includes('\0')) {
            continue;
          }

          const lines = content.split(/\r?\n/);

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxResults) {
              truncated = true;
              break;
            }

            const line = lines[i] ?? '';
            regex.lastIndex = 0; // reset stateful regex
            if (regex.test(line)) {
              // Extract surrounding context
              const beforeStart = Math.max(0, i - contextLines);
              const beforeContext = lines.slice(beforeStart, i);
              const afterEnd = Math.min(lines.length, i + 1 + contextLines);
              const afterContext = lines.slice(i + 1, afterEnd);

              matches.push({
                relativePath: relFromRoot,
                lineNumber: i + 1,
                matchLine: line,
                beforeContext,
                afterContext,
              });
            }
          }
        } catch {
          // Skip unreadable files
          continue;
        }
      }
    }

    return {
      query,
      isRegex,
      matches,
      totalMatches: matches.length,
      filesScanned,
      truncated,
    };
  }

  // ============================================================================
  // 4. find_symbol
  // ============================================================================
  public async findSymbol(
    input: RepoFindSymbolInputDto,
    userId: string,
  ): Promise<RepoFindSymbolOutputDto> {
    const guard = await this.resolveProjectGuard(input.projectId, userId);

    const targetSymbol = input.symbolName.trim();
    const exactMatch = input.exactMatch ?? true;
    const maxResults = Math.min(input.maxResults ?? 20, 50);

    const symbols: RepoSymbolMatchDto[] = [];
    let parsedFilesCount = 0;

    // If a specific relative file is provided, only inspect that file
    if (input.relativePath) {
      let resolution;
      try {
        resolution = guard.resolveSecurePath(input.relativePath);
      } catch (err: unknown) {
        this.translatePathError(input.relativePath, err);
      }

      if (!resolution.exists) {
        throw new RepositoryToolFileNotFoundError(input.relativePath);
      }

      const relPath = resolution.relativePath;
      const ext = path.extname(resolution.resolvedPath).toLowerCase();
      if (!this.tsParser.supports(null, ext)) {
        return {
          symbolName: targetSymbol,
          symbols: [],
          totalFound: 0,
          language: 'unsupported',
          parsedFilesCount: 0,
        };
      }

      parsedFilesCount++;
      const fileContent = fs.readFileSync(resolution.resolvedPath, 'utf-8');
      const parseResult = this.tsParser.parse({
        relativePath: relPath,
        content: fileContent,
        language: null,
      });

      const lines = fileContent.split(/\r?\n/);

      for (const sym of parseResult.symbols) {
        const matches = exactMatch
          ? sym.name === targetSymbol
          : sym.name.toLowerCase().includes(targetSymbol.toLowerCase());

        if (matches) {
          const declarationSnippet = lines
            .slice(Math.max(0, sym.startLine - 1), sym.endLine)
            .join('\n');

          symbols.push({
            name: sym.name,
            kind: sym.kind,
            relativePath: relPath,
            startLine: sym.startLine,
            endLine: sym.endLine,
            declarationSnippet: declarationSnippet.slice(0, 1000),
            isExported: sym.isExported,
          });

          if (symbols.length >= maxResults) break;
        }
      }

      return {
        symbolName: targetSymbol,
        symbols,
        totalFound: symbols.length,
        language: 'typescript/javascript',
        parsedFilesCount,
      };
    }

    // Walk repository and inspect TypeScript / JavaScript files
    const queue: string[] = [guard.canonicalRoot];
    const MAX_FILES_TO_PARSE = 200;

    while (queue.length > 0 && symbols.length < maxResults && parsedFilesCount < MAX_FILES_TO_PARSE) {
      const currentDir = queue.shift()!;
      let dirents: fs.Dirent[] = [];
      try {
        dirents = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      dirents.sort((a, b) => a.name.localeCompare(b.name));

      for (const dirent of dirents) {
        if (symbols.length >= maxResults || parsedFilesCount >= MAX_FILES_TO_PARSE) {
          break;
        }

        const fullPath = path.join(currentDir, dirent.name);
        const relFromRoot = path
          .relative(guard.canonicalRoot, fullPath)
          .replace(/\\/g, '/');

        if (dirent.isDirectory()) {
          if (!REPO_DEFAULT_IGNORE_DIRS.has(dirent.name)) {
            queue.push(fullPath);
          }
          continue;
        }

        if (isSensitiveFile(dirent.name)) {
          continue;
        }

        const ext = path.extname(dirent.name).toLowerCase();
        if (this.tsParser.supports(null, ext)) {
          parsedFilesCount++;
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 1024 * 1024) continue; // skip massive files

            const content = fs.readFileSync(fullPath, 'utf-8');
            const parseResult = this.tsParser.parse({
              relativePath: relFromRoot,
              content,
              language: null,
            });

            const lines = content.split(/\r?\n/);

            for (const sym of parseResult.symbols) {
              const matches = exactMatch
                ? sym.name === targetSymbol
                : sym.name.toLowerCase().includes(targetSymbol.toLowerCase());

              if (matches) {
                const declarationSnippet = lines
                  .slice(Math.max(0, sym.startLine - 1), sym.endLine)
                  .join('\n');

                symbols.push({
                  name: sym.name,
                  kind: sym.kind,
                  relativePath: relFromRoot,
                  startLine: sym.startLine,
                  endLine: sym.endLine,
                  declarationSnippet: declarationSnippet.slice(0, 1000),
                  isExported: sym.isExported,
                });

                if (symbols.length >= maxResults) break;
              }
            }
          } catch {
            // Ignore parse errors on individual files
            continue;
          }
        }
      }
    }

    return {
      symbolName: targetSymbol,
      symbols,
      totalFound: symbols.length,
      language: 'typescript/javascript',
      parsedFilesCount,
    };
  }

  // ============================================================================
  // 5. get_file_metadata
  // ============================================================================
  public async getFileMetadata(
    input: RepoGetFileMetadataInputDto,
    userId: string,
  ): Promise<RepoGetFileMetadataOutputDto> {
    const guard = await this.resolveProjectGuard(input.projectId, userId);

    let resolution;
    try {
      resolution = guard.resolveSecurePath(input.relativePath);
    } catch (err: unknown) {
      this.translatePathError(input.relativePath, err);
    }

    if (!resolution.exists) {
      throw new RepositoryToolFileNotFoundError(input.relativePath);
    }

    const filename = path.basename(resolution.resolvedPath);
    if (isSensitiveFile(filename)) {
      throw new RepositoryToolSensitiveFileError(resolution.relativePath);
    }

    const stat = fs.statSync(resolution.resolvedPath);
    const isDir = stat.isDirectory();
    const ext = path.extname(resolution.resolvedPath).toLowerCase();

    let isBinary = false;
    let lineCount: number | null = null;

    if (!isDir) {
      isBinary = SourceContentPolicy.isBinaryExtension(ext);
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

      if (!isBinary && stat.size <= 5 * 1024 * 1024) {
        try {
          const content = fs.readFileSync(resolution.resolvedPath, 'utf-8');
          lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length;
        } catch {
          lineCount = null;
        }
      }
    }

    return {
      relativePath: resolution.relativePath,
      extension: ext,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      isDirectory: isDir,
      isBinary,
      lineCount,
    };
  }

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  private async resolveProjectGuard(
    projectId: string,
    userId: string,
  ): Promise<SecureProjectRootGuard> {
    if (!projectId) {
      throw new AiInvalidRequestError('Project ID is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { source: true },
    });

    if (!project || project.deletedAt) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('repository_tool.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access project '${projectId}'.`,
      );
    }

    if (!project.source || !project.source.rootPath) {
      throw new RepositoryToolNotConfiguredError(projectId);
    }

    return new SecureProjectRootGuard(project.source.rootPath);
  }

  private translatePathError(rawPath: string, err: unknown): never {
    if (
      err instanceof LocalFolderPathTraversalError ||
      err instanceof LocalFolderSymlinkEscapeError ||
      err instanceof LocalFolderInvalidPathError
    ) {
      throw new RepositoryToolPathTraversalError(rawPath, err.message);
    }
    throw err as Error;
  }
}
