/**
 * @file apps/desktop/src/main/ipc/local-folder-handlers.ts
 * Privileged IPC handlers for Local Project Folder connection and secure file access (Phase 121).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  LocalFolderService,
  SecureFileAccessService,
  LocalFolderError,
  LocalFolderNotFoundError,
  LocalFolderAccessDeniedError,
  LocalFolderNotConfiguredError,
  LocalFolderPathTraversalError,
  LocalFolderSymlinkEscapeError,
  LocalFolderPermissionDeniedError,
  LocalFolderFileTooLargeError,
  LocalFolderFileNotFoundError,
  LocalFolderInvalidPathError,
  UnauthorizedError,
} from '@ai-quality/core';
import {
  connectLocalFolderSchema,
  disconnectLocalFolderSchema,
  validateLocalFolderSchema,
  getLocalFolderSchema,
  listProjectDirectorySchema,
  readProjectFileSchema,
  searchProjectFilesSchema,
  checkProjectFileExistsSchema,
  getProjectFileMetadataSchema,
  detectProjectGitSchema,
  type LocalFolderConnectionDto,
  type ProjectDirectoryListingDto,
  type ProjectFileContentDto,
  type ProjectFileSearchResultDto,
  type ProjectFileExistsResultDto,
  type ProjectFileMetadataDto,
  type ProjectGitDetectionDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';
import { showFolderPickerDialog } from '../dialogs/folder-picker.js';

let defaultLocalFolderService: LocalFolderService | null = null;
let defaultFileAccessService: SecureFileAccessService | null = null;

export function getLocalFolderService(): LocalFolderService {
  if (!defaultLocalFolderService) {
    defaultLocalFolderService = new LocalFolderService();
  }
  return defaultLocalFolderService;
}

export function setLocalFolderServiceForTest(service: LocalFolderService | null): void {
  defaultLocalFolderService = service;
}

export function getSecureFileAccessService(): SecureFileAccessService {
  if (!defaultFileAccessService) {
    defaultFileAccessService = new SecureFileAccessService();
  }
  return defaultFileAccessService;
}

export function setSecureFileAccessServiceForTest(service: SecureFileAccessService | null): void {
  defaultFileAccessService = service;
}

function isIpcEvent(val: unknown): val is IpcMainInvokeEvent {
  return typeof val === 'object' && val !== null && 'senderFrame' in val;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string> {
  if (!event) {
    throw new LocalFolderAccessDeniedError('Authentication required.');
  }
  const user = await assertAuthenticated(event);
  return user.userId;
}

function mapErrorToResult<T>(err: unknown): DesktopResult<T> {
  let code: DesktopErrorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred.';

  if (err instanceof LocalFolderNotFoundError) {
    code = 'LOCAL_FOLDER_NOT_FOUND';
    message = err.message;
  } else if (err instanceof LocalFolderAccessDeniedError || err instanceof UnauthorizedError) {
    code = 'LOCAL_FOLDER_ACCESS_DENIED';
    message = err.message;
  } else if (err instanceof LocalFolderNotConfiguredError) {
    code = 'LOCAL_FOLDER_NOT_CONFIGURED';
    message = err.message;
  } else if (err instanceof LocalFolderPathTraversalError) {
    code = 'LOCAL_FOLDER_PATH_TRAVERSAL';
    message = err.message;
  } else if (err instanceof LocalFolderSymlinkEscapeError) {
    code = 'LOCAL_FOLDER_SYMLINK_ESCAPE';
    message = err.message;
  } else if (err instanceof LocalFolderPermissionDeniedError) {
    code = 'LOCAL_FOLDER_PERMISSION_DENIED';
    message = err.message;
  } else if (err instanceof LocalFolderFileTooLargeError) {
    code = 'LOCAL_FOLDER_FILE_TOO_LARGE';
    message = err.message;
  } else if (err instanceof LocalFolderFileNotFoundError) {
    code = 'LOCAL_FOLDER_FILE_NOT_FOUND';
    message = err.message;
  } else if (err instanceof LocalFolderInvalidPathError) {
    code = 'LOCAL_FOLDER_INVALID_PATH';
    message = err.message;
  } else if (err instanceof ZodError) {
    code = 'VALIDATION_ERROR';
    message = err.errors.map(e => e.message).join(' ');
  } else if (err instanceof LocalFolderError) {
    code = 'INVALID_REQUEST';
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
  }

  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

export async function handleConnectLocalFolder(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  folderService: LocalFolderService = getLocalFolderService(),
  pickerFn: typeof showFolderPickerDialog = showFolderPickerDialog,
): Promise<DesktopResult<LocalFolderConnectionDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = connectLocalFolderSchema.parse(rawPayload);

    let directoryPath = parsed.directoryPath?.trim();
    if (!directoryPath) {
      const pickerResult = await pickerFn();
      if (pickerResult.cancelled) {
        return {
          ok: false,
          error: {
            code: 'LOCAL_FOLDER_INVALID_PATH',
            message: 'Folder selection was cancelled.',
          },
        };
      }
      directoryPath = pickerResult.directoryPath;
    }

    const result = await folderService.connectLocalFolder(userId, {
      projectId: parsed.projectId,
      directoryPath,
    });

    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleDisconnectLocalFolder(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  folderService: LocalFolderService = getLocalFolderService(),
): Promise<DesktopResult<boolean>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = disconnectLocalFolderSchema.parse(rawPayload);

    const result = await folderService.disconnectLocalFolder(userId, parsed);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleValidateLocalFolder(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  folderService: LocalFolderService = getLocalFolderService(),
): Promise<DesktopResult<LocalFolderConnectionDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = validateLocalFolderSchema.parse(rawPayload);

    const result = await folderService.validateLocalFolder(userId, parsed);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetLocalFolder(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  folderService: LocalFolderService = getLocalFolderService(),
): Promise<DesktopResult<LocalFolderConnectionDto | null>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = getLocalFolderSchema.parse(
      typeof rawPayload === 'string' ? { projectId: rawPayload } : rawPayload,
    );

    const result = await folderService.getLocalFolder(userId, parsed.projectId);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleListProjectDirectory(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  fileService: SecureFileAccessService = getSecureFileAccessService(),
): Promise<DesktopResult<ProjectDirectoryListingDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = listProjectDirectorySchema.parse(rawPayload);

    const result = await fileService.listDirectory(userId, parsed);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleReadProjectFile(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  fileService: SecureFileAccessService = getSecureFileAccessService(),
): Promise<DesktopResult<ProjectFileContentDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = readProjectFileSchema.parse(rawPayload);

    const result = await fileService.readFile(userId, parsed);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleSearchProjectFiles(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  fileService: SecureFileAccessService = getSecureFileAccessService(),
): Promise<DesktopResult<ProjectFileSearchResultDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = searchProjectFilesSchema.parse(rawPayload);

    const result = await fileService.search(userId, parsed);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleCheckProjectFileExists(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  fileService: SecureFileAccessService = getSecureFileAccessService(),
): Promise<DesktopResult<ProjectFileExistsResultDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = checkProjectFileExistsSchema.parse(rawPayload);

    const result = await fileService.checkExists(userId, parsed);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetProjectFileMetadata(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  fileService: SecureFileAccessService = getSecureFileAccessService(),
): Promise<DesktopResult<ProjectFileMetadataDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = getProjectFileMetadataSchema.parse(rawPayload);

    const result = await fileService.getMetadata(userId, parsed);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleDetectProjectGit(
  eventOrPayload: unknown,
  maybePayload?: unknown,
  fileService: SecureFileAccessService = getSecureFileAccessService(),
): Promise<DesktopResult<ProjectGitDetectionDto>> {
  try {
    const event = isIpcEvent(eventOrPayload) ? eventOrPayload : undefined;
    const rawPayload = isIpcEvent(eventOrPayload) ? maybePayload : eventOrPayload;

    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }

    const userId = await extractUser(event);
    const parsed = detectProjectGitSchema.parse(
      typeof rawPayload === 'string' ? { projectId: rawPayload } : rawPayload,
    );

    const result = await fileService.detectGit(userId, parsed);
    return { ok: true, data: result };
  } catch (err) {
    return mapErrorToResult(err);
  }
}
