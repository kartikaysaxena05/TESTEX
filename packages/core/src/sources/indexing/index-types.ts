/**
 * @file packages/core/src/sources/indexing/index-types.ts
 * Internal bounds, limits, and version constants for repository indexing.
 */

export const INDEX_SCHEMA_VERSION = 1;
export const PARSER_VERSION = 1;

export const MAX_INDEXABLE_FILES = 25000;
export const MAX_SYMBOLS_PER_FILE = 500;
export const MAX_IMPORTS_PER_FILE = 200;

export const DB_BATCH_SIZE = 100;
export const PARSER_CONCURRENCY = 8;
