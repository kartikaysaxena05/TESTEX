/**
 * @file packages/core/src/sources/content/source-content-service.ts
 * Privileged domain service for secure, bounded, read-only repository source file access.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SourceFileContentDto, SourceContentStatus } from '@ai-quality/contracts';
import { getLogger } from '../../logging/logger.js';
import { ProjectRepository } from '../../projects/project-repository.js';
import { ProjectNotFoundError, ProjectValidationError } from '../../projects/project-errors.js';
import { SourceRepository } from '../source-repository.js';
import { SourceStructureService } from '../structure/source-structure-service.js';
import { LanguageRegistry } from '../technology/language-registry.js';
import { FileClassifier } from '../classification/file-classifier.js';
import { SourceContentPolicy } from './source-content-policy.js';
import {
  MAX_TEXT_FILE_SIZE_BYTES,
  SAMPLE_BUFFER_SIZE,
  MAX_BATCH_FILES,
  MAX_BATCH_TOTAL_BYTES,
} from './content-types.js';

export class SourceContentService {
  constructor(
    private readonly sourceRepository: SourceRepository = new SourceRepository(),
    private readonly projectRepository: ProjectRepository = new ProjectRepository(),
    private readonly structureService: SourceStructureService = new SourceStructureService(),
    private readonly languageRegistry: LanguageRegistry = new LanguageRegistry(),
    private readonly classifier: FileClassifier = new FileClassifier(),
  ) {}

  /**
   * Reads a single source text file with full containment, filtering, sensitivity, and size checks.
   */
  async readSourceFile(projectId: string, relativePath: string): Promise<SourceFileContentDto> {
    const startTime = performance.now();

    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new ProjectValidationError('Project ID is required.');
    }

    // 1. Syntax & Traversal Validation of Relative Path
    if (!SourceContentPolicy.validateRelativePath(relativePath)) {
      return this.buildResult('', relativePath, 'NOT_AUTHORIZED', 0, null);
    }

    // Normalize path with forward slashes
    const normalizedRelativePath = relativePath.replace(/\\/g, '/');

    // 2. Project Existence Verification
    const project = await this.projectRepository.getProjectById(projectId);
    if (!project) {
      throw new ProjectNotFoundError();
    }

    // 3. Source Attachment & Availability Verification
    const source = await this.sourceRepository.getSourceByProjectId(projectId);
    if (!source) {
      return this.buildResult('', normalizedRelativePath, 'NOT_AUTHORIZED', 0, null);
    }

    if (!fs.existsSync(source.rootPath)) {
      return this.buildResult(source.id, normalizedRelativePath, 'UNAVAILABLE_SOURCE', 0, null);
    }

    getLogger().info('source.content_read_requested', {
      projectId,
      sourceId: source.id,
      relativePath: normalizedRelativePath,
    });

    // 4. Absolute Path Resolution & Canonical Containment Check
    const targetPath = path.resolve(source.rootPath, normalizedRelativePath);
    const rootCanonical = path.resolve(source.rootPath);
    const relFromRoot = path.relative(rootCanonical, targetPath);

    if (
      relFromRoot.startsWith('..') ||
      path.isAbsolute(relFromRoot) ||
      targetPath === rootCanonical
    ) {
      getLogger().warn('source.content_read_denied', {
        projectId,
        sourceId: source.id,
        reason: 'Path traversal / root escape attempt',
      });
      return this.buildResult(source.id, normalizedRelativePath, 'NOT_AUTHORIZED', 0, null);
    }

    // 5. Structure Membership Check (Phase 19 Filtered Structure)
    const structure = await this.structureService.getSourceStructure(projectId);
    if (
      !structure ||
      !structure.entries.some(e => e.relativePath === normalizedRelativePath && e.kind === 'FILE')
    ) {
      getLogger().warn('source.content_read_denied', {
        projectId,
        sourceId: source.id,
        reason: 'File not included in filtered repository structure',
      });
      return this.buildResult(source.id, normalizedRelativePath, 'FILTERED', 0, null);
    }

    const fileName = path.posix.basename(normalizedRelativePath);
    const extension = path.posix.extname(normalizedRelativePath).toLowerCase();

    // 6. Sensitive File Deny Policy (.env, private keys, secrets)
    if (SourceContentPolicy.isSensitive(fileName)) {
      getLogger().warn('source.content_read_denied', {
        projectId,
        sourceId: source.id,
        reason: 'Sensitive secret-bearing file access denied',
      });
      return this.buildResult(source.id, normalizedRelativePath, 'SENSITIVE', 0, null);
    }

    // 7. Binary Extension Check
    if (SourceContentPolicy.isBinaryExtension(extension)) {
      return this.buildResult(source.id, normalizedRelativePath, 'BINARY', 0, null);
    }

    // 8. Pre-Read File Stat (Checks existence, regular file, symlink, and size)
    let stat: fs.Stats;
    try {
      stat = await fs.promises.lstat(targetPath);
    } catch {
      return this.buildResult(source.id, normalizedRelativePath, 'NOT_FOUND', 0, null);
    }

    if (stat.isSymbolicLink() || !stat.isFile()) {
      getLogger().warn('source.content_read_denied', {
        projectId,
        sourceId: source.id,
        reason: 'Symlink or non-regular file access denied',
      });
      return this.buildResult(source.id, normalizedRelativePath, 'NOT_AUTHORIZED', 0, null);
    }

    if (stat.size > MAX_TEXT_FILE_SIZE_BYTES) {
      getLogger().warn('source.content_read_too_large', {
        projectId,
        sourceId: source.id,
        sizeBytes: stat.size,
        maxBytes: MAX_TEXT_FILE_SIZE_BYTES,
      });
      return this.buildResult(source.id, normalizedRelativePath, 'TOO_LARGE', stat.size, null);
    }

    // 9. Initial Sample Buffer Read (Inspects for binary NUL bytes)
    try {
      const fd = await fs.promises.open(targetPath, 'r');
      try {
        const sampleSize = Math.min(stat.size, SAMPLE_BUFFER_SIZE);
        const sampleBuffer = Buffer.alloc(sampleSize);
        if (sampleSize > 0) {
          await fd.read(sampleBuffer, 0, sampleSize, 0);
          if (SourceContentPolicy.containsBinaryNullBytes(sampleBuffer)) {
            return this.buildResult(source.id, normalizedRelativePath, 'BINARY', stat.size, null);
          }
        }
      } finally {
        await fd.close();
      }
    } catch {
      return this.buildResult(source.id, normalizedRelativePath, 'NOT_FOUND', 0, null);
    }

    // 10. Read Full UTF-8 Text Content
    let rawContent: string;
    try {
      rawContent = await fs.promises.readFile(targetPath, { encoding: 'utf-8' });
    } catch {
      return this.buildResult(
        source.id,
        normalizedRelativePath,
        'UNSUPPORTED_ENCODING',
        stat.size,
        null,
      );
    }

    // Strip UTF-8 BOM if present
    const content = rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;

    const durationMs = Math.round(performance.now() - startTime);
    getLogger().info('source.content_read_completed', {
      projectId,
      sourceId: source.id,
      sizeBytes: stat.size,
      durationMs,
    });

    return this.buildResult(source.id, normalizedRelativePath, 'AVAILABLE', stat.size, content);
  }

  /**
   * Reads a bounded batch of source text files for internal repository indexing.
   */
  async readTextFiles(
    projectId: string,
    relativePaths: readonly string[],
  ): Promise<readonly SourceFileContentDto[]> {
    if (relativePaths.length > MAX_BATCH_FILES) {
      throw new Error(`Batch file count exceeds maximum allowed limit of ${MAX_BATCH_FILES}.`);
    }

    const results: SourceFileContentDto[] = [];
    let totalBytesAccumulated = 0;

    for (const relPath of relativePaths) {
      const result = await this.readSourceFile(projectId, relPath);
      results.push(result);

      if (result.status === 'AVAILABLE') {
        totalBytesAccumulated += result.sizeBytes;
        if (totalBytesAccumulated > MAX_BATCH_TOTAL_BYTES) {
          break;
        }
      }
    }

    return results;
  }

  private buildResult(
    sourceId: string,
    relativePath: string,
    status: SourceContentStatus,
    sizeBytes: number,
    content: string | null,
  ): SourceFileContentDto {
    const fileName = path.posix.basename(relativePath);
    const langSpec = this.languageRegistry.match(fileName);
    const classification = this.classifier.classify(relativePath);

    return {
      sourceId,
      relativePath,
      status,
      category: classification.category,
      language: langSpec ? langSpec.displayName : null,
      sizeBytes,
      encoding: 'UTF-8',
      content,
      readAt: new Date().toISOString(),
    };
  }
}
