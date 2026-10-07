/**
 * @file packages/core/src/local-folders/local-folder-errors.ts
 * Domain errors for Local Project Folder connection and secure file access (Phase 121).
 */

export class LocalFolderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalFolderError';
  }
}

export class LocalFolderNotFoundError extends LocalFolderError {
  constructor(message = 'The specified local folder does not exist.') {
    super(message);
    this.name = 'LocalFolderNotFoundError';
  }
}

export class LocalFolderAccessDeniedError extends LocalFolderError {
  constructor(message = 'Access to this project folder is denied.') {
    super(message);
    this.name = 'LocalFolderAccessDeniedError';
  }
}

export class LocalFolderNotConfiguredError extends LocalFolderError {
  constructor(message = 'No local folder is currently connected to this project.') {
    super(message);
    this.name = 'LocalFolderNotConfiguredError';
  }
}

export class LocalFolderPathTraversalError extends LocalFolderError {
  constructor(message = 'Filesystem path escapes the authorized project root.') {
    super(message);
    this.name = 'LocalFolderPathTraversalError';
  }
}

export class LocalFolderSymlinkEscapeError extends LocalFolderError {
  constructor(message = 'Symlink or junction target resolves outside the authorized project root.') {
    super(message);
    this.name = 'LocalFolderSymlinkEscapeError';
  }
}

export class LocalFolderPermissionDeniedError extends LocalFolderError {
  constructor(message = 'Permission denied reading the requested file or folder.') {
    super(message);
    this.name = 'LocalFolderPermissionDeniedError';
  }
}

export class LocalFolderFileTooLargeError extends LocalFolderError {
  constructor(message = 'File size exceeds maximum permitted read threshold.') {
    super(message);
    this.name = 'LocalFolderFileTooLargeError';
  }
}

export class LocalFolderFileNotFoundError extends LocalFolderError {
  constructor(message = 'The requested file was not found within the project root.') {
    super(message);
    this.name = 'LocalFolderFileNotFoundError';
  }
}

export class LocalFolderInvalidPathError extends LocalFolderError {
  constructor(message = 'The provided path is invalid or malformed.') {
    super(message);
    this.name = 'LocalFolderInvalidPathError';
  }
}
