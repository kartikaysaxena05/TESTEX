/**
 * @file packages/core/src/agent-tools/repository/repository-tool-errors.ts
 * Typed domain errors for V10 Phase 145: Repository Read / Search Tools.
 */

import { AgentToolError } from '../agent-tool-errors.js';
import type { DesktopErrorCode } from '@ai-quality/contracts';

export class RepositoryToolError extends AgentToolError {
  constructor(code: DesktopErrorCode, message: string, details?: unknown) {
    super(code, message, details);
    this.name = 'RepositoryToolError';
  }
}

export class RepositoryToolFileNotFoundError extends RepositoryToolError {
  public readonly relativePath: string;

  constructor(relativePath: string) {
    super('CONTENT_NOT_FOUND', `File or directory '${relativePath}' does not exist within the project.`, {
      relativePath,
    });
    this.name = 'RepositoryToolFileNotFoundError';
    this.relativePath = relativePath;
  }
}

export class RepositoryToolPathTraversalError extends RepositoryToolError {
  public readonly attemptedPath: string;

  constructor(attemptedPath: string, reason?: string) {
    super(
      'CONTENT_ACCESS_DENIED',
      `Access denied: path '${attemptedPath}' escapes the authorized project root.${reason ? ` Reason: ${reason}` : ''}`,
      { attemptedPath, reason },
    );
    this.name = 'RepositoryToolPathTraversalError';
    this.attemptedPath = attemptedPath;
  }
}

export class RepositoryToolBinaryFileError extends RepositoryToolError {
  public readonly relativePath: string;

  constructor(relativePath: string) {
    super('CONTENT_BINARY', `File '${relativePath}' is a binary file and cannot be read as text.`, {
      relativePath,
    });
    this.name = 'RepositoryToolBinaryFileError';
    this.relativePath = relativePath;
  }
}

export class RepositoryToolFileTooLargeError extends RepositoryToolError {
  public readonly relativePath: string;
  public readonly sizeBytes: number;
  public readonly maxSizeBytes: number;

  constructor(relativePath: string, sizeBytes: number, maxSizeBytes: number) {
    super(
      'CONTENT_TOO_LARGE',
      `File '${relativePath}' size (${sizeBytes} bytes) exceeds maximum limit (${maxSizeBytes} bytes).`,
      { relativePath, sizeBytes, maxSizeBytes },
    );
    this.name = 'RepositoryToolFileTooLargeError';
    this.relativePath = relativePath;
    this.sizeBytes = sizeBytes;
    this.maxSizeBytes = maxSizeBytes;
  }
}

export class RepositoryToolSensitiveFileError extends RepositoryToolError {
  public readonly relativePath: string;

  constructor(relativePath: string) {
    super(
      'CONTENT_SENSITIVE',
      `File '${relativePath}' contains sensitive secrets or credentials and cannot be accessed.`,
      { relativePath },
    );
    this.name = 'RepositoryToolSensitiveFileError';
    this.relativePath = relativePath;
  }
}

export class RepositoryToolNotConfiguredError extends RepositoryToolError {
  public readonly projectId: string;

  constructor(projectId: string) {
    super('SOURCE_UNAVAILABLE', `No repository or local folder source is configured for project '${projectId}'.`, {
      projectId,
    });
    this.name = 'RepositoryToolNotConfiguredError';
    this.projectId = projectId;
  }
}
