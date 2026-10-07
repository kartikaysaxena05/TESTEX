/**
 * @file apps/desktop/src/main/dialogs/folder-picker.ts
 * Privileged native OS directory picker dialog using Electron's dialog API.
 */

import electron from 'electron';
import { getMainWindow } from '../main-window.js';

export type FolderPickerResult =
  { readonly cancelled: true } | { readonly cancelled: false; readonly directoryPath: string };

/**
 * Displays the native OS folder picker dialog attached to the primary application window.
 */
export async function showFolderPickerDialog(): Promise<FolderPickerResult> {
  const mainWindow = getMainWindow();
  const dialog = electron?.dialog;

  if (!dialog) {
    throw new Error('Electron dialog API is unavailable.');
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
  }

  const result =
    mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, {
          title: 'Select Project Directory',
          buttonLabel: 'Select Folder',
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          title: 'Select Project Directory',
          buttonLabel: 'Select Folder',
          properties: ['openDirectory', 'createDirectory'],
        });

  if (result.canceled || result.filePaths.length === 0 || !result.filePaths[0]) {
    return { cancelled: true };
  }

  return {
    cancelled: false,
    directoryPath: result.filePaths[0],
  };
}
