/**
 * @file apps/desktop/src/main/ipc/requirement-document-handlers.ts
 * IPC handlers for requirement document selection, ingestion, listing, and deletion.
 */

import electron from 'electron';
import { RequirementDocumentService, RequirementDocumentExtractionService } from '@ai-quality/core';
import { getMainWindow } from '../main-window.js';
import {
  selectAndIngestDocumentSchema,
  listRequirementDocumentsSchema,
  getRequirementDocumentSchema,
  deleteRequirementDocumentSchema,
  extractRequirementDocumentSchema,
  getRequirementDocumentExtractionSchema,
  type SelectAndIngestDocumentResult,
  type RequirementDocumentDto,
  type RequirementDocumentExtractionDto,
} from '@ai-quality/contracts';

let documentServiceInstance: RequirementDocumentService | null = null;
let extractionServiceInstance: RequirementDocumentExtractionService | null = null;

function getDocumentService(): RequirementDocumentService {
  if (!documentServiceInstance) {
    documentServiceInstance = new RequirementDocumentService();
  }
  return documentServiceInstance;
}

function getExtractionService(): RequirementDocumentExtractionService {
  if (!extractionServiceInstance) {
    extractionServiceInstance = new RequirementDocumentExtractionService();
  }
  return extractionServiceInstance;
}

/**
 * Prompts a secure native file picker and ingests the selected requirement document.
 */
export async function handleSelectAndIngestDocument(
  payload: unknown,
  service: RequirementDocumentService = getDocumentService(),
  customDialog?: typeof electron.dialog,
): Promise<SelectAndIngestDocumentResult> {
  const parsed = selectAndIngestDocumentSchema.parse(payload);
  const electronDialog = customDialog ?? electron?.dialog;
  if (!electronDialog) {
    throw new Error('Electron dialog API is unavailable.');
  }

  const options: electron.OpenDialogOptions = {
    title: 'Select Requirement Document',
    buttonLabel: 'Attach Document',
    filters: [
      {
        name: 'Requirement Documents (*.pdf, *.docx, *.txt, *.md)',
        extensions: ['pdf', 'docx', 'txt', 'md'],
      },
      { name: 'PDF Documents (*.pdf)', extensions: ['pdf'] },
      { name: 'Word Documents (*.docx)', extensions: ['docx'] },
      { name: 'Text Documents (*.txt, *.md)', extensions: ['txt', 'md'] },
    ],
    properties: ['openFile', 'dontAddToRecent'],
  };

  const mainWindow = getMainWindow();
  const dialogResult =
    mainWindow && !mainWindow.isDestroyed()
      ? await electronDialog.showOpenDialog(mainWindow, options)
      : await electronDialog.showOpenDialog(options);

  if (dialogResult.canceled || !dialogResult.filePaths || dialogResult.filePaths.length === 0) {
    return { canceled: true };
  }

  const selectedPath = dialogResult.filePaths[0]!;
  const doc = await service.ingestDocument({
    projectId: parsed.projectId,
    absoluteSourcePath: selectedPath,
    sourceName: parsed.sourceName,
  });

  return {
    canceled: false,
    document: doc,
  };
}

/**
 * Lists all requirement documents for a project.
 */
export async function handleListRequirementDocuments(
  payload: unknown,
  service: RequirementDocumentService = getDocumentService(),
): Promise<readonly RequirementDocumentDto[]> {
  const parsed = listRequirementDocumentsSchema.parse(payload);
  return await service.listDocuments(parsed);
}

/**
 * Gets a specific requirement document by ID.
 */
export async function handleGetRequirementDocument(
  payload: unknown,
  service: RequirementDocumentService = getDocumentService(),
): Promise<RequirementDocumentDto | null> {
  const parsed = getRequirementDocumentSchema.parse(payload);
  return await service.getDocument(parsed);
}

/**
 * Deletes a requirement document and its managed storage copy.
 */
export async function handleDeleteRequirementDocument(
  payload: unknown,
  service: RequirementDocumentService = getDocumentService(),
): Promise<{ readonly deleted: true }> {
  const parsed = deleteRequirementDocumentSchema.parse(payload);
  return await service.deleteDocument(parsed);
}

/**
 * Extracts text, blocks, pages, headings, sections, and tables from a requirement document.
 */
export async function handleExtractRequirementDocument(
  payload: unknown,
  service: RequirementDocumentExtractionService = getExtractionService(),
): Promise<RequirementDocumentExtractionDto> {
  const parsed = extractRequirementDocumentSchema.parse(payload);
  return await service.extractDocument(parsed);
}

/**
 * Retrieves the stored extraction representation for a requirement document.
 */
export async function handleGetRequirementDocumentExtraction(
  payload: unknown,
  service: RequirementDocumentExtractionService = getExtractionService(),
): Promise<RequirementDocumentExtractionDto | null> {
  const parsed = getRequirementDocumentExtractionSchema.parse(payload);
  return await service.getExtraction(parsed);
}
