/**
 * @file packages/core/src/sources/content/content-types.ts
 * Internal constants and boundaries for secure repository source file reading.
 */

export const MAX_TEXT_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB strict file limit

export const SAMPLE_BUFFER_SIZE = 8192; // 8 KB sample for binary detection

export const MAX_BATCH_FILES = 50;

export const MAX_BATCH_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB total batch limit
