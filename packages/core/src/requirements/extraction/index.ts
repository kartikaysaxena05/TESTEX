/**
 * @file packages/core/src/requirements/extraction/index.ts
 * Barrel export for document extraction engine.
 */

export * from './extraction-types.js';
export * from './zip-reader.js';
export * from './extractors/text-extractor.js';
export * from './extractors/markdown-extractor.js';
export * from './extractors/docx-extractor.js';
export * from './extractors/pdf-extractor.js';
export * from './extractor-registry.js';
export * from './requirement-document-extraction-repository.js';
export * from './requirement-document-extraction-service.js';
