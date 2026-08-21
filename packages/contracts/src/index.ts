/**
 * @file packages/contracts/src/index.ts
 * Shared platform-neutral contract specifications, DTOs, and IPC signatures.
 *
 * CRITICAL ARCHITECTURAL RULE:
 * This package MUST remain strictly platform-neutral.
 * It must NEVER import Electron, Node.js filesystem/process APIs, database clients,
 * Playwright, or AI SDKs. It is safely consumable by both privileged and unprivileged layers.
 */

import { z } from 'zod';

export const CONTRACT_VERSION = '0.1.0';

export interface PlatformMetadata {
  readonly platformName: string;
  readonly phase: string;
  readonly status: 'initialized' | 'degraded' | 'error';
  readonly timestamp: string;
}

/**
 * Centrally defined, immutable desktop IPC channel names.
 */
export const DESKTOP_CHANNELS = {
  APP_GET_INFO: 'desktop:app:get-info',
  HEALTH_CHECK: 'desktop:health:check',
  DATABASE_GET_STATUS: 'desktop:database:get-status',

  // Project Management Channels
  PROJECTS_LIST: 'desktop:projects:list',
  PROJECTS_GET: 'desktop:projects:get',
  PROJECTS_CREATE: 'desktop:projects:create',
  PROJECTS_UPDATE: 'desktop:projects:update',
  PROJECTS_ARCHIVE: 'desktop:projects:archive',
  PROJECTS_RESTORE: 'desktop:projects:restore',
  PROJECTS_DELETE: 'desktop:projects:delete',

  // Environment Management Channels
  PROJECTS_ENVIRONMENTS_CREATE: 'desktop:projects:environments:create',
  PROJECTS_ENVIRONMENTS_UPDATE: 'desktop:projects:environments:update',
  PROJECTS_ENVIRONMENTS_DELETE: 'desktop:projects:environments:delete',
  PROJECTS_ENVIRONMENTS_SET_DEFAULT: 'desktop:projects:environments:set-default',

  // Source Attachment & Intelligence Channels (V2 Phases 15–25)
  SOURCES_GET: 'desktop:sources:get',
  SOURCES_ATTACH_LOCAL_DIRECTORY: 'desktop:sources:attach-local-directory',
  SOURCES_DETACH: 'desktop:sources:detach',
  SOURCES_VALIDATE: 'desktop:sources:validate',
  SOURCES_REFRESH_METADATA: 'desktop:sources:refresh-metadata',
  SOURCES_GIT_GET: 'desktop:sources:git:get',
  SOURCES_GIT_REFRESH: 'desktop:sources:git:refresh',
  SOURCES_STRUCTURE_GET: 'desktop:sources:structure:get',
  SOURCES_STRUCTURE_REFRESH: 'desktop:sources:structure:refresh',
  SOURCES_TECHNOLOGY_GET: 'desktop:sources:technology:get',
  SOURCES_TECHNOLOGY_REFRESH: 'desktop:sources:technology:refresh',
  SOURCES_FRAMEWORKS_GET: 'desktop:sources:frameworks:get',
  SOURCES_FRAMEWORKS_REFRESH: 'desktop:sources:frameworks:refresh',
  SOURCES_CLASSIFICATION_GET: 'desktop:sources:classification:get',
  SOURCES_CLASSIFICATION_REFRESH: 'desktop:sources:classification:refresh',
  SOURCES_CONTENT_GET: 'desktop:sources:content:get',
  SOURCES_INDEX_GET_STATUS: 'desktop:sources:index:get-status',
  SOURCES_INDEX_REFRESH: 'desktop:sources:index:refresh',
  SOURCES_INDEX_LIST_FILES: 'desktop:sources:index:list-files',
  SOURCES_INDEX_GET_FILE_DETAILS: 'desktop:sources:index:get-file-details',
  SOURCES_INDEX_SEARCH_SYMBOLS: 'desktop:sources:index:search-symbols',
  SOURCES_ARCHITECTURE_GET: 'desktop:sources:architecture:get',
  SOURCES_ARCHITECTURE_REFRESH: 'desktop:sources:architecture:refresh',

  // Application Run & Startup Configuration Channels (V2 Phase 26)
  SOURCES_RUN_CONFIG_GET: 'desktop:sources:run-config:get',
  SOURCES_RUN_CONFIG_DETECT: 'desktop:sources:run-config:detect',
  SOURCES_RUN_CONFIG_SELECT: 'desktop:sources:run-config:select',
  SOURCES_RUN_CONFIG_UPDATE_TARGET_URL: 'desktop:sources:run-config:update-target-url',

  // Repository Snapshot & Change Detection Channels (V2 Phase 27)
  SOURCES_SNAPSHOTS_LIST: 'desktop:sources:snapshots:list',
  SOURCES_SNAPSHOTS_CREATE: 'desktop:sources:snapshots:create',
  SOURCES_SNAPSHOTS_SET_BASELINE: 'desktop:sources:snapshots:set-baseline',
  SOURCES_SNAPSHOTS_DELETE: 'desktop:sources:snapshots:delete',
  SOURCES_CHANGES_GET: 'desktop:sources:changes:get',
  SOURCES_CHANGES_REFRESH: 'desktop:sources:changes:refresh',

  // Requirement Intelligence Channels (V3 Phases 29–31)
  REQUIREMENTS_LIST: 'desktop:requirements:list',
  REQUIREMENTS_GET: 'desktop:requirements:get',
  REQUIREMENTS_GET_BY_KEY: 'desktop:requirements:get-by-key',
  REQUIREMENTS_GET_SUMMARY: 'desktop:requirements:get-summary',
  REQUIREMENTS_CREATE: 'desktop:requirements:create',
  REQUIREMENTS_UPDATE: 'desktop:requirements:update',
  REQUIREMENTS_ACTIVATE: 'desktop:requirements:activate',
  REQUIREMENTS_DEPRECATE: 'desktop:requirements:deprecate',
  REQUIREMENTS_DRAFT: 'desktop:requirements:draft',
  REQUIREMENTS_ARCHIVE: 'desktop:requirements:archive',
  REQUIREMENTS_RESTORE: 'desktop:requirements:restore',
  REQUIREMENTS_DELETE: 'desktop:requirements:delete',
  REQUIREMENTS_PARSE_BULK: 'desktop:requirements:parse-bulk',
  REQUIREMENTS_IMPORT_BULK: 'desktop:requirements:import-bulk',
  REQUIREMENT_SOURCES_LIST: 'desktop:requirement-sources:list',
  REQUIREMENT_SOURCES_GET: 'desktop:requirement-sources:get',
  REQUIREMENT_DOCUMENTS_SELECT_AND_INGEST: 'desktop:requirement-documents:select-and-ingest',
  REQUIREMENT_DOCUMENTS_LIST: 'desktop:requirement-documents:list',
  REQUIREMENT_DOCUMENTS_GET: 'desktop:requirement-documents:get',
  REQUIREMENT_DOCUMENTS_DELETE: 'desktop:requirement-documents:delete',
  REQUIREMENT_DOCUMENTS_EXTRACT: 'desktop:requirement-documents:extract',
  REQUIREMENT_DOCUMENTS_GET_EXTRACTION: 'desktop:requirement-documents:get-extraction',

  // Requirement Candidate Channels (V3 Phase 35)
  REQUIREMENT_CANDIDATES_DETECT: 'desktop:requirement-candidates:detect',
  REQUIREMENT_CANDIDATES_LIST: 'desktop:requirement-candidates:list',
  REQUIREMENT_CANDIDATES_UPDATE: 'desktop:requirement-candidates:update',
  REQUIREMENT_CANDIDATES_SET_STATUS: 'desktop:requirement-candidates:set-status',
  REQUIREMENT_CANDIDATES_IMPORT: 'desktop:requirement-candidates:import',

  // Requirement Provenance & Source Auditability Channels (V3 Phase 36)
  REQUIREMENTS_GET_PROVENANCE: 'desktop:requirements:get-provenance',
  REQUIREMENTS_GET_SOURCE_CONTEXT: 'desktop:requirements:get-source-context',

  // Requirement Structured Representation & Normalization Channels (V3 Phase 37)
  REQUIREMENTS_NORMALIZE: 'desktop:requirements:normalize',
  REQUIREMENTS_GET_REPRESENTATION: 'desktop:requirements:get-representation',
  REQUIREMENTS_UPDATE_REPRESENTATION: 'desktop:requirements:update-representation',
  REQUIREMENTS_REGENERATE_REPRESENTATION: 'desktop:requirements:regenerate-representation',
  REQUIREMENTS_BATCH_NORMALIZE: 'desktop:requirements:batch-normalize',

  // Requirement Classification & Metadata Enrichment Channels (V3 Phase 38)
  REQUIREMENTS_CLASSIFY: 'desktop:requirements:classify',
  REQUIREMENTS_GET_METADATA: 'desktop:requirements:get-metadata',
  REQUIREMENTS_UPDATE_METADATA: 'desktop:requirements:update-metadata',
  REQUIREMENTS_REGENERATE_METADATA: 'desktop:requirements:regenerate-metadata',
  REQUIREMENTS_BATCH_CLASSIFY: 'desktop:requirements:batch-classify',

  // Requirement Quality, Testability, Ambiguity & Clarification Analysis Channels (V3 Phase 39)
  REQUIREMENTS_ANALYZE_QUALITY: 'desktop:requirements:analyze-quality',
  REQUIREMENTS_GET_QUALITY_ANALYSIS: 'desktop:requirements:get-quality-analysis',
  REQUIREMENTS_REVIEW_QUALITY_FINDING: 'desktop:requirements:review-quality-finding',
  REQUIREMENTS_REANALYZE_QUALITY: 'desktop:requirements:reanalyze-quality',
  REQUIREMENTS_BATCH_ANALYZE_QUALITY: 'desktop:requirements:batch-analyze-quality',

  // Requirement Dependency, Relationship & Repository Evidence Mapping Channels (V3 Phase 40)
  REQUIREMENTS_PROPOSE_RELATIONSHIPS: 'desktop:requirements:propose-relationships',
  REQUIREMENTS_GET_RELATIONSHIPS: 'desktop:requirements:get-relationships',
  REQUIREMENTS_GET_RELATIONSHIP_GRAPH: 'desktop:requirements:get-relationship-graph',
  REQUIREMENTS_CREATE_MANUAL_RELATIONSHIP: 'desktop:requirements:create-manual-relationship',
  REQUIREMENTS_REVIEW_RELATIONSHIP: 'desktop:requirements:review-relationship',
  REQUIREMENTS_DELETE_RELATIONSHIP: 'desktop:requirements:delete-relationship',
  REQUIREMENTS_MATCH_REPOSITORY_EVIDENCE: 'desktop:requirements:match-repository-evidence',
  REQUIREMENTS_GET_REPOSITORY_EVIDENCE: 'desktop:requirements:get-repository-evidence',
  REQUIREMENTS_REVIEW_REPOSITORY_EVIDENCE: 'desktop:requirements:review-repository-evidence',
  REQUIREMENTS_CREATE_MANUAL_REPOSITORY_EVIDENCE:
    'desktop:requirements:create-manual-repository-evidence',
  REQUIREMENTS_DELETE_REPOSITORY_EVIDENCE: 'desktop:requirements:delete-repository-evidence',
  REQUIREMENTS_PREVIEW_REPOSITORY_EVIDENCE: 'desktop:requirements:preview-repository-evidence',

  // Requirement Versioning & Impact Channels (V3 Phase 41)
  REQUIREMENTS_GET_HISTORY: 'desktop:requirements:get-history',
  REQUIREMENTS_GET_VERSION: 'desktop:requirements:get-version',
  REQUIREMENTS_COMPARE_VERSIONS: 'desktop:requirements:compare-versions',
  REQUIREMENTS_UPDATE_VERSIONED: 'desktop:requirements:update-versioned',
  REQUIREMENTS_RESTORE_VERSION: 'desktop:requirements:restore-version',
  REQUIREMENTS_GET_CHANGE_IMPACT: 'desktop:requirements:get-change-impact',
  REQUIREMENTS_REVIEW_CHANGE_IMPACT: 'desktop:requirements:review-change-impact',

  // AI Provider Gateway Channels (V4 Phase 43)
  AI_GET_PROVIDER_STATUS: 'desktop:ai:get-provider-status',
  AI_HEALTH_CHECK: 'desktop:ai:health-check',
  AI_GENERATE: 'desktop:ai:generate',

  // AI Configuration & Prompt Execution Channels (V4 Phase 44)
  AI_CONFIG_GET_DEFAULTS: 'desktop:ai:get-config-defaults',
  AI_EXECUTE_PROMPT: 'desktop:ai:execute-prompt',

  // Embedding & Vector Retrieval Channels (V4 Phase 45)
  AI_EMBEDDING_GET_STATUS: 'desktop:ai:embedding-get-status',
  AI_EMBEDDING_INDEX_SUBJECTS: 'desktop:ai:embedding-index-subjects',
  AI_EMBEDDING_SEARCH_SIMILAR: 'desktop:ai:embedding-search-similar',
  AI_EMBEDDING_REINDEX_STALE: 'desktop:ai:embedding-reindex-stale',

  // RAG & Requirement Context Retrieval Channels (V4 Phase 46)
  AI_RAG_RETRIEVE_REQUIREMENT_CONTEXT: 'desktop:ai:rag-retrieve-requirement-context',
  AI_RAG_GET_CONFIG_DEFAULTS: 'desktop:ai:rag-get-config-defaults',

  // LLM Requirement Analysis & Reasoning Channels (V4 Phase 47)
  AI_ANALYSIS_ANALYZE_REQUIREMENT: 'desktop:ai:analysis-analyze-requirement',
  AI_ANALYSIS_GET_CURRENT: 'desktop:ai:analysis-get-current',
  AI_ANALYSIS_GET_HISTORY: 'desktop:ai:analysis-get-history',
  AI_ANALYSIS_REGENERATE: 'desktop:ai:analysis-regenerate',

  // Test Design Intelligence Foundation Channels (V4 Phase 48)
  TEST_DESIGN_ANALYZE: 'desktop:test-design:analyze',
  TEST_DESIGN_GET_CURRENT: 'desktop:test-design:get-current',
  TEST_DESIGN_GET_HISTORY: 'desktop:test-design:get-history',
  TEST_DESIGN_REGENERATE: 'desktop:test-design:regenerate',

  // Requirement-to-Test Scenario Generation Channels (V4 Phase 49)
  SCENARIOS_GENERATE: 'desktop:scenarios:generate',
  SCENARIOS_GET_CURRENT: 'desktop:scenarios:get-current',
  SCENARIOS_GET_HISTORY: 'desktop:scenarios:get-history',
  SCENARIOS_REGENERATE: 'desktop:scenarios:regenerate',

  // Categorized Test Generation Channels (V4 Phase 50)
  CATEGORIZED_TESTS_GENERATE: 'desktop:categorized-tests:generate',
  CATEGORIZED_TESTS_GET_CURRENT: 'desktop:categorized-tests:get-current',

  // Preconditions, Test Data & Expected Result Enrichment Channels (V4 Phase 51)
  TEST_SPECIFICATIONS_ENRICH: 'desktop:test-specifications:enrich',
  TEST_SPECIFICATIONS_GET_CURRENT: 'desktop:test-specifications:get-current',

  // Structured Test Case Model & Persistence Channels (V4 Phase 52)
  TEST_CASES_CREATE: 'desktop:test-cases:create',
  TEST_CASES_GET_BY_ID: 'desktop:test-cases:get-by-id',
  TEST_CASES_LIST: 'desktop:test-cases:list',
  TEST_CASES_PERSIST_FROM_GENERATION: 'desktop:test-cases:persist-from-generation',
  TEST_CASES_PERSIST_BATCH: 'desktop:test-cases:persist-batch',
  TEST_CASES_DELETE: 'desktop:test-cases:delete',

  // AI Test Generation Validation & Hallucination Control Channels (V4 Phase 53)
  TEST_VALIDATION_VALIDATE_TEST_CASE: 'desktop:test-validation:validate-test-case',
  TEST_VALIDATION_VALIDATE_SPECIFICATION: 'desktop:test-validation:validate-specification',
  TEST_VALIDATION_VALIDATE_BATCH: 'desktop:test-validation:validate-batch',
  TEST_VALIDATION_GET_LATEST: 'desktop:test-validation:get-latest',
  TEST_VALIDATION_LIST_HISTORY: 'desktop:test-validation:list-history',

  // Requirement-to-Test Traceability Channels (V4 Phase 54)
  TRACEABILITY_CREATE_TRACE: 'desktop:traceability:create-trace',
  TRACEABILITY_DELETE_TRACE: 'desktop:traceability:delete-trace',
  TRACEABILITY_GET_BY_ID: 'desktop:traceability:get-by-id',
  TRACEABILITY_LIST_BY_REQUIREMENT: 'desktop:traceability:list-by-requirement',
  TRACEABILITY_LIST_BY_TEST_CASE: 'desktop:traceability:list-by-test-case',
  TRACEABILITY_LIST_PROJECT_TRACES: 'desktop:traceability:list-project-traces',

  // Coverage Analysis & Traceability Matrix Channels (V4 Phase 55)
  COVERAGE_GET_PROJECT_SUMMARY: 'desktop:coverage:get-project-summary',
  COVERAGE_GET_REQUIREMENT_COVERAGE: 'desktop:coverage:get-requirement-coverage',
  COVERAGE_GET_TRACEABILITY_MATRIX: 'desktop:coverage:get-traceability-matrix',
  COVERAGE_GET_REVERSE_TRACEABILITY: 'desktop:coverage:get-reverse-traceability',
  COVERAGE_GET_ORPHAN_TESTS: 'desktop:coverage:get-orphan-tests',

  // Test Review, Approval, Regeneration & Versioning Channels (V4 Phase 56)
  TEST_REVIEW_LIST_QUEUE: 'desktop:test-review:list-queue',
  TEST_REVIEW_GET_DETAIL: 'desktop:test-review:get-detail',
  TEST_REVIEW_APPROVE: 'desktop:test-review:approve',
  TEST_REVIEW_REJECT: 'desktop:test-review:reject',
  TEST_REVIEW_EDIT: 'desktop:test-review:edit',
  TEST_REVIEW_REGENERATE: 'desktop:test-review:regenerate',
  TEST_REVIEW_GET_HISTORY: 'desktop:test-review:get-history',
  TEST_REVIEW_COMPARE_VERSIONS: 'desktop:test-review:compare-versions',

  // Diagnostic Error Reporting Channel (Narrow Renderer Capability)
  LOGGING_REPORT_RENDERER_ERROR: 'desktop:logging:report-renderer-error',
} as const;

export type DesktopChannel = (typeof DESKTOP_CHANNELS)[keyof typeof DESKTOP_CHANNELS];

/**
 * Standard error codes for desktop IPC operations.
 */
export type DesktopErrorCode =
  | 'INTERNAL_ERROR'
  | 'UNAUTHORIZED_SENDER'
  | 'INVALID_REQUEST'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_ARCHIVED'
  | 'ENVIRONMENT_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_UNAVAILABLE'
  | 'DIRECTORY_NOT_FOUND'
  | 'INVALID_DIRECTORY'
  | 'DIRECTORY_READ_FAILED'
  | 'SECURITY_EXCLUSION_VIOLATION'
  | 'FILE_TOO_LARGE'
  | 'SENSITIVE_FILE_BLOCKED'
  | 'FILE_NOT_FOUND'
  | 'GIT_NOT_FOUND'
  | 'GIT_TIMEOUT'
  | 'GIT_COMMAND_FAILED'
  | 'NOT_A_GIT_REPOSITORY'
  | 'DETACHED_HEAD'
  | 'DIRTY_WORKING_TREE'
  | 'NO_COMMITS_YET'
  | 'UNSUPPORTED_GIT_VERSION'
  | 'GIT_CORRUPTED'
  | 'SOURCE_INDEXING_TIMEOUT'
  | 'PARSER_LIMIT_EXCEEDED'
  | 'UNSUPPORTED_LANGUAGE'
  | 'INVALID_SNAPSHOT'
  | 'SNAPSHOT_CREATION_FAILED'
  | 'SNAPSHOT_NOT_FOUND'
  | 'SNAPSHOT_IMMUTABLE'
  | 'BASELINE_SNAPSHOT_REQUIRED'
  | 'CONTENT_ACCESS_DENIED'
  | 'CONTENT_NOT_FOUND'
  | 'CONTENT_TOO_LARGE'
  | 'CONTENT_BINARY'
  | 'CONTENT_SENSITIVE'
  | 'CONTENT_FILTERED'
  | 'REQUIREMENT_NOT_FOUND'
  | 'REQUIREMENT_KEY_CONFLICT'
  | 'DUPLICATE_REQUIREMENT_KEY'
  | 'REQUIREMENT_SOURCE_NOT_FOUND'
  | 'INVALID_REQUIREMENT_TRANSITION'
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_INVALID_FORMAT'
  | 'DOCUMENT_TOO_LARGE'
  | 'DOCUMENT_DUPLICATE'
  | 'DOCUMENT_CORRUPT'
  | 'DOCUMENT_STORAGE_ERROR'
  | 'DOCUMENT_STORAGE_FAILED'
  | 'DOCUMENT_FILE_MISSING'
  | 'DOCUMENT_INTEGRITY_MISMATCH'
  | 'DOCUMENT_ENCRYPTED'
  | 'DOCUMENT_EXTRACTION_LIMIT_EXCEEDED'
  | 'DOCUMENT_EXTRACTION_FAILED'
  | 'CANDIDATE_NOT_FOUND'
  | 'EXTRACTION_NOT_FOUND'
  | 'NO_APPROVED_CANDIDATES'
  | 'CANDIDATE_ALREADY_IMPORTED'
  | 'PROVENANCE_NOT_FOUND'
  | 'DOCUMENT_IN_USE'
  | 'SOURCE_IN_USE'
  | 'REPRESENTATION_NOT_FOUND'
  | 'NORMALIZATION_FAILED'
  | 'METADATA_NOT_FOUND'
  | 'CLASSIFICATION_FAILED'
  | 'QUALITY_ANALYSIS_NOT_FOUND'
  | 'QUALITY_FINDING_NOT_FOUND'
  | 'QUALITY_ANALYSIS_FAILED'
  | 'RELATIONSHIP_NOT_FOUND'
  | 'RELATIONSHIP_ALREADY_EXISTS'
  | 'SELF_RELATIONSHIP_ERROR'
  | 'REPOSITORY_EVIDENCE_NOT_FOUND'
  | 'REPOSITORY_INDEX_NOT_AVAILABLE'
  | 'REPOSITORY_EVIDENCE_NOT_AUTHORIZED'
  | 'REQUIREMENT_VERSION_NOT_FOUND'
  | 'REQUIREMENT_VERSION_CONFLICT'
  | 'REQUIREMENT_IMPACT_NOT_FOUND'
  | 'INVALID_VERSION_COMPARISON'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'AUTHENTICATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'PROVIDER_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'INVALID_PROVIDER_RESPONSE'
  | 'UNKNOWN_PROVIDER_ERROR'
  | 'CONFIGURATION_INVALID'
  | 'PROMPT_NOT_FOUND'
  | 'PROMPT_VERSION_NOT_FOUND'
  | 'PROMPT_INPUT_INVALID'
  | 'PROMPT_RENDER_FAILED'
  | 'STRUCTURED_OUTPUT_PARSE_FAILED'
  | 'STRUCTURED_OUTPUT_SCHEMA_FAILED'
  | 'STRUCTURED_OUTPUT_RETRY_EXHAUSTED'
  | 'EMBEDDING_PROVIDER_NOT_CONFIGURED'
  | 'EMBEDDING_CAPABILITY_UNSUPPORTED'
  | 'EMBEDDING_INVALID_INPUT'
  | 'EMBEDDING_DIMENSION_MISMATCH'
  | 'EMBEDDING_VALIDATION_FAILED'
  | 'VECTOR_SEARCH_INVALID_QUERY'
  | 'VECTOR_SEARCH_PROJECT_MISMATCH'
  | 'VECTOR_INDEX_UNAVAILABLE'
  | 'RAG_PROJECT_MISMATCH'
  | 'RAG_REQUIREMENT_NOT_FOUND'
  | 'RAG_RETRIEVAL_FAILED'
  | 'RAG_INVALID_REQUEST'
  | 'RAG_BUDGET_EXCEEDED'
  | 'RAG_REQUIREMENT_CHANGED_DURING_RETRIEVAL'
  | 'RAG_VECTOR_INDEX_UNAVAILABLE'
  | 'AI_ANALYSIS_PROJECT_MISMATCH'
  | 'AI_ANALYSIS_REQUIREMENT_NOT_FOUND'
  | 'AI_ANALYSIS_FAILED'
  | 'AI_ANALYSIS_SCHEMA_VALIDATION_FAILED'
  | 'AI_ANALYSIS_GROUNDING_FAILED'
  | 'AI_ANALYSIS_REQUIREMENT_CHANGED'
  | 'TEST_DESIGN_PROJECT_MISMATCH'
  | 'TEST_DESIGN_REQUIREMENT_NOT_FOUND'
  | 'TEST_DESIGN_FAILED'
  | 'TEST_DESIGN_SCHEMA_VALIDATION_FAILED'
  | 'TEST_DESIGN_GROUNDING_FAILED'
  | 'TEST_DESIGN_REQUIREMENT_CHANGED'
  | 'SCENARIO_PROJECT_MISMATCH'
  | 'SCENARIO_REQUIREMENT_NOT_FOUND'
  | 'SCENARIO_GENERATION_FAILED'
  | 'SCENARIO_SCHEMA_VALIDATION_FAILED'
  | 'SCENARIO_GROUNDING_FAILED'
  | 'SCENARIO_REQUIREMENT_CHANGED'
  | 'CATEGORIZED_TESTS_PROJECT_MISMATCH'
  | 'CATEGORIZED_TESTS_REQUIREMENT_NOT_FOUND'
  | 'CATEGORIZED_TESTS_SCENARIO_NOT_FOUND'
  | 'CATEGORIZED_TESTS_GENERATION_FAILED'
  | 'CATEGORIZED_TESTS_SCHEMA_VALIDATION_FAILED'
  | 'CATEGORIZED_TESTS_GROUNDING_FAILED'
  | 'CATEGORIZED_TESTS_REQUIREMENT_CHANGED'
  | 'TEST_SPECIFICATIONS_PROJECT_MISMATCH'
  | 'TEST_SPECIFICATIONS_REQUIREMENT_NOT_FOUND'
  | 'TEST_SPECIFICATIONS_SCENARIO_NOT_FOUND'
  | 'TEST_SPECIFICATIONS_GENERATION_FAILED'
  | 'TEST_SPECIFICATIONS_SCHEMA_VALIDATION_FAILED'
  | 'TEST_SPECIFICATIONS_GROUNDING_FAILED'
  | 'TEST_SPECIFICATIONS_REQUIREMENT_CHANGED'
  | 'TEST_CASE_PROJECT_MISMATCH'
  | 'TEST_CASE_NOT_FOUND'
  | 'TEST_CASE_REQUIREMENT_NOT_FOUND'
  | 'TEST_CASE_VERSION_MISMATCH'
  | 'TEST_CASE_VALIDATION_FAILED'
  | 'TEST_CASE_DUPLICATE_KEY'
  | 'TEST_CASE_CONCURRENCY_ERROR'
  | 'TEST_CASE_PERSISTENCE_FAILED'
  | 'TEST_CASE_IDEMPOTENCY_CONFLICT'
  | 'TEST_VALIDATION_PROJECT_MISMATCH'
  | 'TEST_VALIDATION_NOT_FOUND'
  | 'TEST_VALIDATION_REQUIREMENT_NOT_FOUND'
  | 'TEST_VALIDATION_TEST_CASE_NOT_FOUND'
  | 'TEST_VALIDATION_VALIDATION_FAILED'
  | 'TEST_VALIDATION_STALE'
  | 'TRACEABILITY_PROJECT_MISMATCH'
  | 'TRACEABILITY_NOT_FOUND'
  | 'TRACEABILITY_REQUIREMENT_NOT_FOUND'
  | 'TRACEABILITY_TEST_CASE_NOT_FOUND'
  | 'TRACEABILITY_ALREADY_EXISTS'
  | 'TRACEABILITY_VALIDATION_FAILED'
  | 'COVERAGE_PROJECT_MISMATCH'
  | 'COVERAGE_REQUIREMENT_NOT_FOUND'
  | 'COVERAGE_TEST_CASE_NOT_FOUND'
  | 'COVERAGE_VALIDATION_FAILED'
  | 'TEST_REVIEW_PROJECT_MISMATCH'
  | 'TEST_REVIEW_NOT_FOUND'
  | 'TEST_VERSION_NOT_FOUND'
  | 'TEST_VERSION_CONFLICT'
  | 'TEST_REVIEW_INVALID_TRANSITION'
  | 'TEST_REGENERATION_FAILED'
  | 'TEST_REVIEW_VALIDATION_FAILED';

/**
 * Sanitized error representation safe for exposure across the IPC boundary.
 */
export interface DesktopError {
  readonly code: DesktopErrorCode;
  readonly message: string;
}

/**
 * Universal IPC envelope enforcing structured success/failure states.
 */
export type DesktopResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: DesktopError };

/**
 * Basic application metadata representation.
 */
export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly platform: string;
  readonly arch: string;
  readonly nodeVersion?: string;
  readonly chromeVersion?: string;
  readonly electronVersion?: string;
}

/**
 * System diagnostic health check report.
 */
export interface HealthInfo {
  readonly status: 'ok' | 'degraded' | 'error';
  readonly timestamp?: string;
  readonly uptimeSeconds?: number;
  readonly memoryUsageBytes?: number;
}

/**
 * Database infrastructure connectivity state.
 */
export type DatabaseState = 'connected' | 'unavailable' | 'not-configured';
export type DatabaseStatusState = DatabaseState;

/**
 * Sanitized database status envelope safe for exposure to the UI.
 */
export interface DatabaseStatus {
  readonly status: DatabaseState;
  readonly latencyMs?: number;
  readonly serverVersion?: string;
  readonly databaseName?: string;
}

// ------------------------------------------------------------------------------
// Domain Enums & DTOs
// ------------------------------------------------------------------------------

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

export type EnvironmentType =
  'LOCAL' | 'DEVELOPMENT' | 'TEST' | 'STAGING' | 'PRODUCTION' | 'CUSTOM';

export interface ProjectEnvironmentDto {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly type: EnvironmentType;
  readonly baseUrl: string | null;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly environmentCount: number;
  readonly defaultEnvironment: ProjectEnvironmentDto | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectDetails {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly environments: readonly ProjectEnvironmentDto[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListProjectsInput {
  readonly status?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
}

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string | null;
}

export interface UpdateProjectInput {
  readonly projectId: string;
  readonly name?: string;
  readonly description?: string | null;
}

export interface CreateEnvironmentInput {
  readonly projectId: string;
  readonly name: string;
  readonly type?: EnvironmentType;
  readonly baseUrl?: string | null;
}

export interface UpdateEnvironmentInput {
  readonly projectId: string;
  readonly environmentId: string;
  readonly name?: string;
  readonly type?: EnvironmentType;
  readonly baseUrl?: string | null;
}

export interface DeleteEnvironmentInput {
  readonly projectId: string;
  readonly environmentId: string;
}

export interface SetDefaultEnvironmentInput {
  readonly projectId: string;
  readonly environmentId: string;
}

// ------------------------------------------------------------------------------
// Source Domain Types & DTOs (V2 Phases 15 & 16)
// ------------------------------------------------------------------------------

export type ProjectSourceKind = 'LOCAL_DIRECTORY';

export type SourceAvailability = 'AVAILABLE' | 'UNAVAILABLE';

export interface ProjectSourceDto {
  readonly id: string;
  readonly projectId: string;
  readonly kind: ProjectSourceKind;
  readonly displayName: string;
  readonly rootPath: string;
  readonly identityFingerprint: string | null;
  readonly activeBaselineSnapshotId: string | null;
  readonly availability: SourceAvailability;
  readonly filesystemCreatedAt: string | null;
  readonly filesystemModifiedAt: string | null;
  readonly metadataRefreshedAt: string | null;
  readonly lastValidatedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AttachLocalDirectoryResult =
  { readonly cancelled: true } | { readonly cancelled: false; readonly source: ProjectSourceDto };

export interface DetachSourceResult {
  readonly detached: true;
}

export interface SourceProjectIdInput {
  readonly projectId: string;
}

// ------------------------------------------------------------------------------
// Git Domain Types & DTOs (V2 Phase 17)
// ------------------------------------------------------------------------------

export type GitSourceRelation = 'ROOT' | 'NESTED' | 'UNKNOWN';

export interface GitStatusDto {
  readonly gitAvailable: boolean;
  readonly gitVersion: string | null;
  readonly isGitRepository: boolean;
  readonly repositoryRoot: string | null;
  readonly sourceRelationToRepository: GitSourceRelation;
  readonly currentBranch: string | null;
  readonly headCommit: string | null;
  readonly isDetachedHead: boolean;
  readonly lastCheckedAt: string;
}

// ------------------------------------------------------------------------------
// Structure Discovery & Filtering Types & DTOs (V2 Phases 18 & 19)
// ------------------------------------------------------------------------------

export type StructureEntryKind = 'FILE' | 'DIRECTORY' | 'SYMLINK';

export type StructureTruncationReason = 'MAX_ENTRIES' | 'MAX_DEPTH' | 'TIMEOUT';

export interface SourceStructureEntryDto {
  readonly relativePath: string;
  readonly name: string;
  readonly kind: StructureEntryKind;
  readonly depth: number;
}

export interface SourceStructureSummaryDto {
  readonly filesDiscovered: number;
  readonly directoriesDiscovered: number;
  readonly symlinksDiscovered: number;
  readonly totalDiscovered: number;
  readonly includedFiles: number;
  readonly includedDirectories: number;
  readonly totalIncluded: number;
  readonly ignoredEntries: number;
  readonly safetyExcludedEntries: number;
  readonly earlyPrunedDirectories: number;
  readonly ignoreFilesLoaded: number;
  readonly ignoreRulesLoaded: number;
  readonly warnings: readonly string[];
}

export interface SourceStructureDto {
  readonly sourceId: string;
  readonly rootName: string;
  readonly entries: readonly SourceStructureEntryDto[];
  readonly summary: SourceStructureSummaryDto;
  readonly truncated: boolean;
  readonly truncationReason: StructureTruncationReason | null;
  readonly scannedAt: string;
}

// ------------------------------------------------------------------------------
// Technology & Language Profile Types & DTOs (V2 Phase 20)
// ------------------------------------------------------------------------------

export type LanguageConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type LanguageCategory =
  'PROGRAMMING' | 'SCRIPT' | 'MARKUP' | 'STYLE' | 'QUERY' | 'DATA' | 'CONFIGURATION';

export interface LanguageDetectionDto {
  readonly language: string;
  readonly category: LanguageCategory;
  readonly fileCount: number;
  readonly percentage: number;
  readonly confidence: LanguageConfidence;
  readonly evidenceExtensions: readonly string[];
}

export interface TechnologySignalDto {
  readonly technology: string;
  readonly category: string;
  readonly confidence: LanguageConfidence;
  readonly evidence: readonly string[];
}

export interface TechnologyProfileDto {
  readonly sourceId: string;
  readonly detectedLanguages: readonly LanguageDetectionDto[];
  readonly dominantLanguage: string | null;
  readonly technologySignals: readonly TechnologySignalDto[];
  readonly totalIncludedFiles: number;
  readonly totalLanguageFiles: number;
  readonly unknownFiles: number;
  readonly analyzedAt: string;
}

// ------------------------------------------------------------------------------
// Framework & Dependency Profile Types & DTOs (V2 Phase 21)
// ------------------------------------------------------------------------------

export type DependencyScope = 'RUNTIME' | 'DEVELOPMENT' | 'PEER' | 'OPTIONAL' | 'UNKNOWN';

export type FrameworkCategory =
  | 'FRAMEWORK'
  | 'UI_LIBRARY'
  | 'TEST_FRAMEWORK'
  | 'ORM'
  | 'BUILD_TOOL'
  | 'DATABASE_CLIENT'
  | 'OTHER';

export type DetectionEvidenceKind =
  | 'FRAMEWORK'
  | 'DEPENDENCY'
  | 'DEV_DEPENDENCY'
  | 'PEER_DEPENDENCY'
  | 'MANIFEST'
  | 'LOCKFILE'
  | 'CONFIG_FILE'
  | 'FILE_PATH'
  | 'IMPORT'
  | 'SYMBOL'
  | 'PACKAGE_MANAGER'
  | 'APPLICATION_UNIT'
  | 'ENTRY_POINT'
  | 'CONFIGURATION'
  | 'RUNTIME';

export interface DetectionEvidenceDto {
  readonly kind: DetectionEvidenceKind;
  readonly source: string;
  readonly detail: string;
}

export interface FrameworkDetectionDto {
  readonly id: string;
  readonly name: string;
  readonly category: FrameworkCategory;
  readonly confidence: LanguageConfidence;
  readonly declaredVersion: string | null;
  readonly resolvedVersion: string | null;
  readonly evidence: readonly DetectionEvidenceDto[];
}

export interface DependencyDto {
  readonly name: string;
  readonly declaredVersion: string | null;
  readonly scope: DependencyScope;
  readonly ecosystem: string;
  readonly sourceManifest: string;
}

export interface ManifestSummaryDto {
  readonly relativePath: string;
  readonly ecosystem: string;
  readonly directDependencyCount: number;
  readonly devDependencyCount: number;
  readonly scriptNames: readonly string[];
}

export interface PackageManagerDto {
  readonly name: string;
  readonly confidence: LanguageConfidence;
  readonly isAmbiguous: boolean;
  readonly evidence: readonly string[];
}

export interface FrameworkProfileDto {
  readonly sourceId: string;
  readonly primaryEcosystem: string | null;
  readonly packageManager: PackageManagerDto | null;
  readonly manifests: readonly ManifestSummaryDto[];
  readonly frameworks: readonly FrameworkDetectionDto[];
  readonly dependencies: readonly DependencyDto[];
  readonly directDependencyCount: number;
  readonly devDependencyCount: number;
  readonly analyzedAt: string;
  readonly warnings: readonly string[];
}

// ------------------------------------------------------------------------------
// Source File Classification Types & DTOs (V2 Phase 22)
// ------------------------------------------------------------------------------

export type FileCategory =
  | 'SOURCE'
  | 'TEST'
  | 'CONFIGURATION'
  | 'BUILD_TOOLING'
  | 'DOCUMENTATION'
  | 'ASSET'
  | 'DATABASE'
  | 'MIGRATION'
  | 'GENERATED'
  | 'SCRIPT'
  | 'TEMPLATE'
  | 'UNKNOWN';

export type ClassificationEvidenceType =
  | 'PATH_PATTERN'
  | 'FILENAME_PATTERN'
  | 'EXTENSION'
  | 'LANGUAGE_SIGNAL'
  | 'FRAMEWORK_SIGNAL'
  | 'DIRECTORY_CONTEXT';

export interface ClassificationEvidenceDto {
  readonly type: ClassificationEvidenceType;
  readonly detail: string;
}

export interface FileClassificationDto {
  readonly relativePath: string;
  readonly category: FileCategory;
  readonly confidence: LanguageConfidence;
  readonly evidence: readonly ClassificationEvidenceDto[];
}

export interface ClassificationSummaryDto {
  readonly totalFiles: number;
  readonly sourceFiles: number;
  readonly testFiles: number;
  readonly configurationFiles: number;
  readonly buildToolingFiles: number;
  readonly documentationFiles: number;
  readonly assetFiles: number;
  readonly databaseFiles: number;
  readonly migrationFiles: number;
  readonly generatedFiles: number;
  readonly scriptFiles: number;
  readonly templateFiles: number;
  readonly unknownFiles: number;
}

export interface ClassificationProfileDto {
  readonly sourceId: string;
  readonly summary: ClassificationSummaryDto;
  readonly files: readonly FileClassificationDto[];
  readonly analyzedAt: string;
  readonly ruleVersion: number;
}

// ------------------------------------------------------------------------------
// Source File Content Access Types & DTOs (V2 Phase 23)
// ------------------------------------------------------------------------------

export type SourceContentStatus =
  | 'AVAILABLE'
  | 'NOT_FOUND'
  | 'NOT_AUTHORIZED'
  | 'FILTERED'
  | 'SENSITIVE'
  | 'BINARY'
  | 'TOO_LARGE'
  | 'UNSUPPORTED_ENCODING'
  | 'UNAVAILABLE_SOURCE';

export interface SourceFileContentInput {
  readonly projectId: string;
  readonly relativePath: string;
}

export interface SourceFileContentDto {
  readonly sourceId: string;
  readonly relativePath: string;
  readonly status: SourceContentStatus;
  readonly category: FileCategory | null;
  readonly language: string | null;
  readonly sizeBytes: number;
  readonly encoding: 'UTF-8';
  readonly content: string | null;
  readonly readAt: string;
}

// ------------------------------------------------------------------------------
// Repository Index Types & DTOs (V2 Phase 24)
// ------------------------------------------------------------------------------

export type IndexStatus = 'INDEXED' | 'SKIPPED' | 'ERROR' | 'STALE';

export type IndexRunStatus = 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';

export type SymbolKind =
  | 'FUNCTION'
  | 'CLASS'
  | 'INTERFACE'
  | 'TYPE'
  | 'ENUM'
  | 'VARIABLE'
  | 'CONSTANT'
  | 'METHOD'
  | 'MODULE'
  | 'UNKNOWN';

export type ImportKind = 'LOCAL' | 'EXTERNAL' | 'DYNAMIC' | 'UNKNOWN';

export interface RepositorySymbolDto {
  readonly id: string;
  readonly name: string;
  readonly kind: SymbolKind;
  readonly startLine: number;
  readonly endLine: number;
  readonly isExported: boolean;
}

export interface RepositoryImportDto {
  readonly id: string;
  readonly specifier: string;
  readonly importKind: ImportKind;
  readonly resolvedRelativePath: string | null;
  readonly isExternal: boolean;
  readonly lineNumber: number;
}

export interface RepositoryFileDto {
  readonly id: string;
  readonly sourceId: string;
  readonly relativePath: string;
  readonly name: string;
  readonly extension: string | null;
  readonly language: string | null;
  readonly classification: string;
  readonly sizeBytes: number;
  readonly contentHash: string | null;
  readonly indexStatus: IndexStatus;
  readonly symbolCount: number;
  readonly importCount: number;
  readonly indexedAt: string;
}

export interface RepositoryFileDetailsDto {
  readonly file: RepositoryFileDto;
  readonly symbols: readonly RepositorySymbolDto[];
  readonly imports: readonly RepositoryImportDto[];
}

export interface RepositoryIndexSummaryDto {
  readonly filesEligible: number;
  readonly filesIndexed: number;
  readonly filesSkipped: number;
  readonly filesFailed: number;
  readonly symbolsIndexed: number;
  readonly importsIndexed: number;
  readonly exportsIndexed: number;
  readonly unsupportedLanguageFiles: number;
  readonly durationMs: number | null;
  readonly truncated: boolean;
  readonly warnings: readonly string[];
}

export interface RepositoryIndexStatusDto {
  readonly isIndexed: boolean;
  readonly isRunning: boolean;
  readonly schemaVersion: number;
  readonly parserVersion: number;
  readonly summary: RepositoryIndexSummaryDto | null;
  readonly lastIndexedAt: string | null;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface ListIndexedFilesInput {
  readonly projectId: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly searchQuery?: string;
  readonly language?: string;
  readonly classification?: string;
}

export interface SearchSymbolsInput {
  readonly projectId: string;
  readonly query: string;
  readonly kind?: SymbolKind;
  readonly limit?: number;
}

export interface RepositoryFileDetailsInput {
  readonly projectId: string;
  readonly relativePath: string;
}

// ------------------------------------------------------------------------------
// Application Architecture & Entry-Point Types & DTOs (V2 Phase 25)
// ------------------------------------------------------------------------------

export type ApplicationKind =
  | 'WEB_FRONTEND'
  | 'WEB_BACKEND'
  | 'FULL_STACK_WEB'
  | 'CLI'
  | 'LIBRARY'
  | 'DESKTOP'
  | 'MOBILE'
  | 'SERVICE'
  | 'MULTI_APPLICATION'
  | 'UNKNOWN';

export type EntryPointKind =
  'APPLICATION' | 'SERVER' | 'CLIENT' | 'CLI' | 'LIBRARY' | 'FRAMEWORK_ENTRY' | 'UNKNOWN';

export type ArchitectureConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ArchitectureAnalysisStatus = 'CURRENT' | 'STALE' | 'NOT_ANALYZED';

export type ArchitectureSignalKind =
  | 'LAYERED_STRUCTURE'
  | 'MVC_LIKE_STRUCTURE'
  | 'FEATURE_BASED_STRUCTURE'
  | 'MONOREPO_STRUCTURE'
  | 'FRONTEND_BACKEND_SPLIT'
  | 'DOMAIN_ORIENTED_STRUCTURE'
  | 'FRAMEWORK_CONVENTIONAL_STRUCTURE'
  | 'UNKNOWN';

export type StructuralAreaRole =
  'APPLICATION' | 'TEST' | 'SHARED' | 'CONFIGURATION' | 'DATABASE' | 'UNKNOWN';

export interface ApplicationKindDetectionDto {
  readonly kind: ApplicationKind;
  readonly confidence: ArchitectureConfidence;
  readonly evidence: readonly DetectionEvidenceDto[];
}

export interface EntryPointCandidateDto {
  readonly relativePath: string;
  readonly kind: EntryPointKind;
  readonly confidence: ArchitectureConfidence;
  readonly rank: number;
  readonly evidence: readonly DetectionEvidenceDto[];
}

export interface ApplicationUnitDto {
  readonly id: string;
  readonly name: string;
  readonly relativeRoot: string;
  readonly kind: ApplicationKind;
  readonly primaryFramework: string | null;
  readonly entryPoints: readonly EntryPointCandidateDto[];
}

export interface StructuralAreaDto {
  readonly relativePath: string;
  readonly name: string;
  readonly role: StructuralAreaRole;
  readonly fileCount: number;
  readonly primaryLanguages: readonly string[];
  readonly evidence: readonly DetectionEvidenceDto[];
}

export interface ArchitectureSignalDto {
  readonly kind: ArchitectureSignalKind;
  readonly title: string;
  readonly confidence: ArchitectureConfidence;
  readonly description: string;
  readonly evidence: readonly DetectionEvidenceDto[];
}

export interface ModuleHubDto {
  readonly relativePath: string;
  readonly incomingImports: number;
  readonly outgoingImports: number;
}

export interface ApplicationArchitectureProfileDto {
  readonly sourceId: string;
  readonly status: ArchitectureAnalysisStatus;
  readonly architectureVersion: number;
  readonly primaryKind: ApplicationKind;
  readonly confidence: ArchitectureConfidence;
  readonly applicationKinds: readonly ApplicationKindDetectionDto[];
  readonly applicationUnits: readonly ApplicationUnitDto[];
  readonly entryCandidates: readonly EntryPointCandidateDto[];
  readonly primaryEntryCandidate: EntryPointCandidateDto | null;
  readonly structuralAreas: readonly StructuralAreaDto[];
  readonly architectureSignals: readonly ArchitectureSignalDto[];
  readonly moduleHubs: readonly ModuleHubDto[];
  readonly analyzedAt: string;
  readonly warnings: readonly string[];
}

// ------------------------------------------------------------------------------
// Application Run & Startup Configuration Types & DTOs (V2 Phase 26)
// ------------------------------------------------------------------------------

export type StartupKind =
  'PACKAGE_SCRIPT' | 'RUNTIME_ENTRY' | 'FRAMEWORK_COMMAND' | 'CUSTOM' | 'UNKNOWN';

export type RunConfigSafety = 'SAFE_STRUCTURE' | 'REQUIRES_REVIEW' | 'UNSUPPORTED';

export type RunConfigSource = 'DETECTED' | 'USER_SELECTED';

export type RunConfigStatus = 'CONFIGURED' | 'NEEDS_REVIEW';

export interface RuntimeAvailabilityDto {
  readonly runtime: string;
  readonly available: boolean;
  readonly version: string | null;
}

export interface StartupCandidateDto {
  readonly id: string;
  readonly applicationUnitRoot: string;
  readonly runtime: string | null;
  readonly packageManager: string | null;
  readonly startupKind: StartupKind;
  readonly executable: string;
  readonly args: readonly string[];
  readonly manifestScript: string | null;
  readonly workingDirectory: string;
  readonly confidence: ArchitectureConfidence;
  readonly safety: RunConfigSafety;
  readonly evidence: readonly DetectionEvidenceDto[];
}

export interface ApplicationRunConfigurationDto {
  readonly id: string;
  readonly sourceId: string;
  readonly applicationUnitRoot: string;
  readonly runtime: string | null;
  readonly packageManager: string | null;
  readonly startupKind: StartupKind;
  readonly executable: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly targetUrl: string | null;
  readonly environmentVariableNames: readonly string[];
  readonly confidence: ArchitectureConfidence;
  readonly safety: RunConfigSafety;
  readonly source: RunConfigSource;
  readonly status: RunConfigStatus;
  readonly isSelected: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RunConfigurationProfileDto {
  readonly sourceId: string;
  readonly selectedConfiguration: ApplicationRunConfigurationDto | null;
  readonly candidates: readonly StartupCandidateDto[];
  readonly runtimes: readonly RuntimeAvailabilityDto[];
  readonly targetUrl: string | null;
  readonly targetUrlSource: 'USER_CONFIGURED' | 'DETECTED' | 'UNKNOWN';
  readonly analyzedAt: string;
  readonly warnings: readonly string[];
}

export interface SelectRunConfigInput {
  readonly projectId: string;
  readonly candidateId: string;
}

export interface UpdateTargetUrlInput {
  readonly projectId: string;
  readonly targetUrl: string | null;
}

// ------------------------------------------------------------------------------
// Repository Snapshot & Change Detection Types & DTOs (V2 Phase 27)
// ------------------------------------------------------------------------------

export type SnapshotStatus = 'COMPLETE' | 'PARTIAL' | 'FAILED';

export type SnapshotKind = 'MANUAL_BASELINE' | 'INDEX_BASELINE';

export type FileChangeType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'RENAMED' | 'UNCHANGED';

export interface RepositorySnapshotDto {
  readonly id: string;
  readonly sourceId: string;
  readonly indexRunId: string | null;
  readonly label: string | null;
  readonly kind: SnapshotKind;
  readonly status: SnapshotStatus;
  readonly snapshotVersion: number;
  readonly fingerprint: string;
  readonly fileCount: number;
  readonly sourceFileCount: number;
  readonly testFileCount: number;
  readonly isBaseline: boolean;
  readonly gitHeadCommit: string | null;
  readonly gitBranch: string | null;
  readonly createdAt: string;
}

export interface RepositoryFileChangeDto {
  readonly changeType: FileChangeType;
  readonly previousPath: string | null;
  readonly currentPath: string | null;
  readonly previousHash: string | null;
  readonly currentHash: string | null;
  readonly language: string | null;
  readonly classification: string | null;
  readonly directImporters: readonly string[];
}

export interface RepositoryChangeSetDto {
  readonly sourceId: string;
  readonly baselineSnapshotId: string | null;
  readonly baselineLabel: string | null;
  readonly currentIndexRunId: string | null;
  readonly comparisonVersion: number;
  readonly isStale: boolean;
  readonly totalChanges: number;
  readonly addedCount: number;
  readonly modifiedCount: number;
  readonly deletedCount: number;
  readonly renamedCount: number;
  readonly unchangedCount: number;
  readonly changesByClassification: Record<string, number>;
  readonly changesByLanguage: Record<string, number>;
  readonly changes: readonly RepositoryFileChangeDto[];
  readonly comparedAt: string;
  readonly warnings: readonly string[];
}

export interface CreateSnapshotInput {
  readonly projectId: string;
  readonly label?: string | null;
}

export interface SetBaselineInput {
  readonly projectId: string;
  readonly snapshotId: string;
}

export interface DeleteSnapshotInput {
  readonly projectId: string;
  readonly snapshotId: string;
}

// ------------------------------------------------------------------------------
// Requirement Intelligence Types & DTOs (V3 Phase 29)
// ------------------------------------------------------------------------------

export type RequirementSourceType = 'MANUAL' | 'PASTED_TEXT' | 'DOCUMENT';

export type RequirementSourceStatus = 'ACTIVE' | 'ARCHIVED';

export type RequirementType =
  | 'FUNCTIONAL'
  | 'NON_FUNCTIONAL'
  | 'BUSINESS_RULE'
  | 'SECURITY'
  | 'PERFORMANCE'
  | 'USABILITY'
  | 'DATA'
  | 'INTEGRATION'
  | 'CONSTRAINT'
  | 'UNKNOWN';

export type RequirementPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSPECIFIED';

export type RequirementStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';

export interface RequirementSourceDto {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly sourceType: RequirementSourceType;
  readonly status: RequirementSourceStatus;
  readonly description: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly requirementCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RequirementDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementSourceId: string | null;
  readonly requirementSourceName: string | null;
  readonly requirementKey: string;
  readonly title: string;
  readonly originalText: string;
  readonly type: RequirementType;
  readonly priority: RequirementPriority;
  readonly status: RequirementStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RequirementSummaryDto {
  readonly totalCount: number;
  readonly countsByStatus: Record<RequirementStatus, number>;
  readonly countsByType: Record<RequirementType, number>;
  readonly countsByPriority: Record<RequirementPriority, number>;
}

export interface ListRequirementsInput {
  readonly projectId: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: RequirementStatus;
  readonly type?: RequirementType;
  readonly priority?: RequirementPriority;
  readonly searchQuery?: string;
  readonly requirementSourceId?: string;
}

export interface GetRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface GetRequirementByKeyInput {
  readonly projectId: string;
  readonly requirementKey: string;
}

export interface CreateRequirementInput {
  readonly projectId: string;
  readonly requirementKey?: string;
  readonly title: string;
  readonly originalText: string;
  readonly type?: RequirementType;
  readonly priority?: RequirementPriority;
  readonly status?: RequirementStatus;
  readonly requirementSourceId?: string | null;
}

export interface UpdateRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly title?: string;
  readonly originalText?: string;
  readonly type?: RequirementType;
  readonly priority?: RequirementPriority;
  readonly status?: RequirementStatus;
}

export interface ActivateRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface DeprecateRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface DraftRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface ArchiveRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface RestoreRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface DeleteRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface ListRequirementSourcesInput {
  readonly projectId: string;
}

export interface GetRequirementSourceInput {
  readonly projectId: string;
  readonly sourceId: string;
}

// ------------------------------------------------------------------------------
// Bulk Requirement Intake & Parsing Types (Phase 32)
// ------------------------------------------------------------------------------

export type ParseMethod = 'PLAIN_LINE' | 'NUMBERED' | 'BULLET' | 'PREFIXED' | 'PARAGRAPH';

export interface RequirementCandidate {
  readonly candidateId: string;
  readonly originalText: string;
  readonly title?: string;
  readonly detectedExternalKey?: string | null;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly parseMethod: ParseMethod;
  readonly isDuplicateInBatch: boolean;
  readonly warnings: readonly string[];
}

export interface ParseBulkRequirementsInput {
  readonly rawText: string;
}

export interface ParseBulkRequirementsResult {
  readonly candidates: readonly RequirementCandidate[];
  readonly totalParsed: number;
  readonly duplicateCount: number;
  readonly warningCount: number;
  readonly parseVersion: string;
}

export interface ApprovedBulkCandidateInput {
  readonly originalText: string;
  readonly title?: string;
  readonly type?: RequirementType;
  readonly priority?: RequirementPriority;
  readonly status?: RequirementStatus;
  readonly detectedExternalKey?: string | null;
  readonly lineStart?: number;
  readonly lineEnd?: number;
}

export interface ImportBulkRequirementsInput {
  readonly projectId: string;
  readonly sourceName?: string;
  readonly candidates: readonly ApprovedBulkCandidateInput[];
}

export interface ImportBulkRequirementsResult {
  readonly requirementSourceId: string;
  readonly requirementSourceName: string;
  readonly importedCount: number;
  readonly requirements: readonly RequirementDto[];
}

// ------------------------------------------------------------------------------
// Requirement Document Ingestion Types (Phase 33)
// ------------------------------------------------------------------------------

export type SupportedDocumentFormat = 'pdf' | 'docx' | 'txt' | 'md';

export interface RequirementDocumentDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementSourceId: string;
  readonly originalFileName: string;
  readonly storageKey: string;
  readonly fileExtension: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly sha256: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SelectAndIngestDocumentInput {
  readonly projectId: string;
  readonly sourceName?: string;
}

export interface SelectAndIngestDocumentResult {
  readonly canceled: boolean;
  readonly document?: RequirementDocumentDto;
  readonly warning?: string;
}

export interface IngestDocumentDirectInput {
  readonly projectId: string;
  readonly absoluteSourcePath: string;
  readonly sourceName?: string;
}

export interface ListRequirementDocumentsInput {
  readonly projectId: string;
}

export interface GetRequirementDocumentInput {
  readonly projectId: string;
  readonly documentId: string;
}

export interface DeleteRequirementDocumentInput {
  readonly projectId: string;
  readonly documentId: string;
}

// ------------------------------------------------------------------------------
// Document Text & Structure Extraction Types (Phase 34)
// ------------------------------------------------------------------------------

export type ExtractionStatus = 'COMPLETED' | 'WARNINGS' | 'FAILED';

export type DocumentBlockType =
  'HEADING' | 'PARAGRAPH' | 'LIST_ITEM' | 'TABLE' | 'CODE_BLOCK' | 'UNKNOWN';

export type ExtractionWarningCode =
  | 'NO_EXTRACTABLE_TEXT'
  | 'ENCRYPTED_DOCUMENT'
  | 'PARTIAL_TABLE_EXTRACTION'
  | 'UNKNOWN_ENCODING'
  | 'POSSIBLE_READING_ORDER_ISSUE'
  | 'UNSUPPORTED_EMBEDDED_OBJECT'
  | 'DOCUMENT_EXTRACTION_LIMIT_EXCEEDED';

export interface ExtractionWarningDto {
  readonly code: ExtractionWarningCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface DocumentBlockDto {
  readonly id: string;
  readonly orderIndex: number;
  readonly type: DocumentBlockType;
  readonly text: string;
  readonly pageNumber: number | null;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly headingLevel?: number;
  readonly sectionId?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface DocumentPageDto {
  readonly pageNumber: number;
  readonly text: string;
  readonly characterCount: number;
  readonly lineCount: number;
  readonly blockCount: number;
}

export interface DocumentHeadingDto {
  readonly id: string;
  readonly text: string;
  readonly level: number;
  readonly orderIndex: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly pageNumber: number | null;
  readonly sectionId?: string | null;
}

export interface DocumentSectionDto {
  readonly id: string;
  readonly title: string;
  readonly level: number;
  readonly orderIndex: number;
  readonly parentSectionId: string | null;
  readonly headingId: string | null;
  readonly blockIds: readonly string[];
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly pageNumber: number | null;
}

export interface DocumentTableCellDto {
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly text: string;
  readonly isHeader?: boolean;
}

export interface DocumentTableRowDto {
  readonly rowIndex: number;
  readonly cells: readonly DocumentTableCellDto[];
}

export interface DocumentTableDto {
  readonly id: string;
  readonly orderIndex: number;
  readonly pageNumber: number | null;
  readonly sectionId: string | null;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly rows: readonly DocumentTableRowDto[];
}

export interface RequirementDocumentExtractionDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementDocumentId: string;
  readonly sourceSha256: string;
  readonly extractorVersion: string;
  readonly format: SupportedDocumentFormat;
  readonly plainText: string;
  readonly characterCount: number;
  readonly lineCount: number;
  readonly pageCount: number | null;
  readonly blockCount: number;
  readonly headingCount: number;
  readonly sectionCount: number;
  readonly tableCount: number;
  readonly status: ExtractionStatus;
  readonly warnings: readonly ExtractionWarningDto[];
  readonly blocks: readonly DocumentBlockDto[];
  readonly pages: readonly DocumentPageDto[];
  readonly headings: readonly DocumentHeadingDto[];
  readonly sections: readonly DocumentSectionDto[];
  readonly tables: readonly DocumentTableDto[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ExtractRequirementDocumentInput {
  readonly projectId: string;
  readonly documentId: string;
  readonly force?: boolean;
}

export interface GetRequirementDocumentExtractionInput {
  readonly projectId: string;
  readonly documentId: string;
}

// ------------------------------------------------------------------------------
// Requirement Candidate Detection Types (Phase 35)
// ------------------------------------------------------------------------------

export type CandidateReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'IMPORTED';

export type CandidateDetectionReasonCode =
  | 'EXPLICIT_SHALL'
  | 'EXPLICIT_MUST'
  | 'EXPLICIT_SOURCE_ID'
  | 'NUMBERED_REQUIREMENT'
  | 'BULLET_REQUIREMENT'
  | 'REQUIREMENT_TABLE_ROW'
  | 'USER_STORY_PATTERN'
  | 'REQUIRED_TO_PATTERN'
  | 'PROHIBITION_PATTERN'
  | 'SECTION_CONTEXT'
  | 'WEAK_OBLIGATION_SHOULD'
  | 'OPTIONAL_CAPABILITY_MAY'
  | 'EARS_PATTERN';

export type CandidateWarningCode =
  'EXACT_DUPLICATE_CANDIDATE' | 'WEAK_OBLIGATION' | 'POSSIBLE_BOILERPLATE' | 'SHORT_TEXT';

export interface CandidateDetectionReasonDto {
  readonly code: CandidateDetectionReasonCode;
  readonly description: string;
  readonly score: number;
  readonly matchedText?: string;
}

export interface CandidateWarningDto {
  readonly code: CandidateWarningCode;
  readonly message: string;
}

export interface RequirementCandidateDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementDocumentId: string;
  readonly extractionId: string;
  readonly sourceBlockId: string | null;
  readonly sourceTableId: string | null;
  readonly sourceRowIndex: number | null;
  readonly sourceText: string;
  readonly reviewedText: string | null;
  readonly externalKey: string | null;
  readonly sectionId: string | null;
  readonly sectionPath: string | null;
  readonly pageNumber: number | null;
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
  readonly startOffset: number | null;
  readonly endOffset: number | null;
  readonly detectionMethod: string;
  readonly detectionReasons: readonly CandidateDetectionReasonDto[];
  readonly detectionScore: number;
  readonly warnings: readonly CandidateWarningDto[];
  readonly reviewStatus: CandidateReviewStatus;
  readonly importedRequirementId: string | null;
  readonly detectorVersion: string;
  readonly sourceSha256: string;
  readonly orderIndex: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RequirementCandidateListDto {
  readonly candidates: readonly RequirementCandidateDto[];
  readonly totalCount: number;
  readonly pendingCount: number;
  readonly approvedCount: number;
  readonly rejectedCount: number;
  readonly importedCount: number;
}

export interface DetectRequirementCandidatesInput {
  readonly projectId: string;
  readonly documentId: string;
  readonly force?: boolean;
}

export interface ListRequirementCandidatesInput {
  readonly projectId: string;
  readonly documentId: string;
  readonly status?: CandidateReviewStatus | 'ALL';
  readonly search?: string;
}

export interface UpdateRequirementCandidateInput {
  readonly projectId: string;
  readonly candidateId: string;
  readonly reviewedText: string;
}

export interface SetRequirementCandidateStatusInput {
  readonly projectId: string;
  readonly candidateIds: readonly string[];
  readonly status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface ImportApprovedCandidatesInput {
  readonly projectId: string;
  readonly documentId: string;
  readonly candidateIds?: readonly string[];
}

export interface CreatedRequirementSummaryDto {
  readonly id: string;
  readonly requirementKey: string;
  readonly title: string;
}

export interface ImportCandidatesResultDto {
  readonly importedCount: number;
  readonly createdRequirements: readonly CreatedRequirementSummaryDto[];
}

// ------------------------------------------------------------------------------
// Requirement Source Provenance & Auditability Types & DTOs (V3 Phase 36)
// ------------------------------------------------------------------------------

export type ProvenanceSourceKind = 'MANUAL' | 'PASTED_TEXT' | 'DOCUMENT';

export type ProvenanceLocationKind =
  'NONE' | 'PASTE_LINE' | 'DOCUMENT_BLOCK' | 'TABLE_ROW' | 'PDF_PAGE';

export type ProvenanceCompleteness = 'COMPLETE' | 'PARTIAL' | 'MINIMAL';

export type SourceIntegrityStatus =
  'VERIFIED' | 'MISSING_FILE' | 'HASH_MISMATCH' | 'PARTIAL' | 'SOURCE_RECORD_MISSING';

export interface ProvenanceDocumentMetadataDto {
  readonly id: string;
  readonly originalFileName: string;
  readonly fileExtension: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly sha256: string;
  readonly createdAt: string;
}

export interface ProvenanceCandidateMetadataDto {
  readonly id: string;
  readonly detectorVersion: string;
  readonly detectionScore: number | null;
  readonly detectionReasons: readonly CandidateDetectionReasonDto[];
  readonly reviewStatus: CandidateReviewStatus;
  readonly reviewedText: string | null;
}

export interface RequirementProvenanceDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementSourceId: string;
  readonly sourceKind: ProvenanceSourceKind;
  readonly locationKind: ProvenanceLocationKind;

  // Entity references
  readonly candidateId: string | null;
  readonly documentId: string | null;
  readonly extractionId: string | null;
  readonly sourceBlockId: string | null;
  readonly sourceTableId: string | null;
  readonly sourceRowIndex: number | null;
  readonly sectionId: string | null;
  readonly sectionPath: string | null;

  // Location
  readonly pageNumber: number | null;
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
  readonly startOffset: number | null;
  readonly endOffset: number | null;

  // Evidence text
  readonly sourceText: string | null;
  readonly reviewedText: string | null;
  readonly externalRequirementKey: string | null;
  readonly currentRequirementText: string;

  // Hashes & versions
  readonly sourceSha256: string | null;
  readonly extractorVersion: string | null;
  readonly detectorVersion: string | null;
  readonly detectionReasons: readonly CandidateDetectionReasonDto[];
  readonly detectionScore: number | null;

  // Integrity & Completeness
  readonly completeness: ProvenanceCompleteness;
  readonly integrityStatus: SourceIntegrityStatus;
  readonly integrityMessage: string;

  // Nested rich metadata
  readonly documentMetadata?: ProvenanceDocumentMetadataDto | null;
  readonly candidateMetadata?: ProvenanceCandidateMetadataDto | null;

  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SourceContextBlockDto {
  readonly id: string;
  readonly type: string;
  readonly text: string;
  readonly isTarget: boolean;
  readonly pageNumber: number | null;
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
}

export interface RequirementSourceContextDto {
  readonly requirementId: string;
  readonly sourceKind: ProvenanceSourceKind;
  readonly targetSnippet: string;
  readonly highlightedText?: string | null;
  readonly precedingBlocks: readonly SourceContextBlockDto[];
  readonly targetBlock: SourceContextBlockDto | null;
  readonly succeedingBlocks: readonly SourceContextBlockDto[];
  readonly totalSurroundingBlocks: number;
}

export interface GetRequirementProvenanceInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface GetRequirementSourceContextInput {
  readonly projectId: string;
  readonly requirementId: string;
}

// ------------------------------------------------------------------------------
// Structured Requirement Representation & Normalization Types & DTOs (V3 Phase 37)
// ------------------------------------------------------------------------------

export type RequirementModality =
  'SHALL' | 'MUST' | 'SHALL_NOT' | 'MUST_NOT' | 'SHOULD' | 'MAY' | 'REQUIRED_TO' | 'UNSPECIFIED';

export type NormalizationStatus = 'NOT_NORMALIZED' | 'NORMALIZED' | 'REVIEWED' | 'STALE';

export type NormalizationMethod = 'DETERMINISTIC' | 'MANUAL' | 'DETERMINISTIC_REVIEWED';

export type RepresentationReviewStatus = 'GENERATED' | 'REVIEWED';

export type NormalizationWarningCode =
  | 'ACTOR_NOT_DETECTED'
  | 'ACTION_NOT_DETECTED'
  | 'MULTIPLE_MODALITIES'
  | 'COMPLEX_COMPOUND_REQUIREMENT'
  | 'MULTIPLE_CONDITIONS'
  | 'UNPARSED_QUANTITATIVE_EXPRESSION';

export type ConditionType = 'WHEN' | 'IF' | 'WHILE' | 'WHERE' | 'UNSPECIFIED';

export type QuantitativeOperator =
  'EQUAL' | 'MAXIMUM' | 'MINIMUM' | 'WITHIN' | 'RANGE' | 'PERCENTAGE' | 'UNSPECIFIED';

export interface RequirementConditionDto {
  readonly text: string;
  readonly type: ConditionType;
}

export interface RequirementConstraintDto {
  readonly text: string;
  readonly type?: string;
}

export interface RequirementQuantitativeValueDto {
  readonly text: string;
  readonly value?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly unit?: string;
  readonly operator?: QuantitativeOperator;
}

export interface RequirementRepresentationDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly originalRequirementText: string;
  readonly normalizedText: string;
  readonly actor: string | null;
  readonly modality: RequirementModality;
  readonly negated: boolean;
  readonly action: string | null;
  readonly object: string | null;
  readonly conditions: readonly RequirementConditionDto[];
  readonly constraints: readonly RequirementConstraintDto[];
  readonly quantitativeValues: readonly RequirementQuantitativeValueDto[];
  readonly expectedOutcome: string | null;
  readonly sourceRequirementTextSha256: string;
  readonly normalizationStatus: NormalizationStatus;
  readonly normalizationMethod: NormalizationMethod;
  readonly normalizerVersion: string;
  readonly reviewStatus: RepresentationReviewStatus;
  readonly warnings: readonly NormalizationWarningCode[];
  readonly isStale: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NormalizeRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface GetRequirementRepresentationInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface UpdateRequirementRepresentationInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly normalizedText?: string;
  readonly actor?: string | null;
  readonly modality?: RequirementModality;
  readonly negated?: boolean;
  readonly action?: string | null;
  readonly object?: string | null;
  readonly conditions?: readonly RequirementConditionDto[];
  readonly constraints?: readonly RequirementConstraintDto[];
  readonly quantitativeValues?: readonly RequirementQuantitativeValueDto[];
  readonly expectedOutcome?: string | null;
}

export interface RegenerateRequirementRepresentationInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface BatchNormalizeRequirementsInput {
  readonly projectId: string;
  readonly requirementIds: readonly string[];
}

export interface BatchNormalizeItemResultDto {
  readonly requirementId: string;
  readonly requirementKey?: string;
  readonly success: boolean;
  readonly representation?: RequirementRepresentationDto;
  readonly error?: string;
}

export interface BatchNormalizeRequirementsResultDto {
  readonly normalizedCount: number;
  readonly failedCount: number;
  readonly results: readonly BatchNormalizeItemResultDto[];
}

// ------------------------------------------------------------------------------
// Requirement Classification & Metadata Enrichment Types & DTOs (V3 Phase 38)
// ------------------------------------------------------------------------------

export type RequirementCategory =
  | 'FUNCTIONAL'
  | 'NON_FUNCTIONAL'
  | 'BUSINESS_RULE'
  | 'INTERFACE'
  | 'DATA'
  | 'COMPLIANCE'
  | 'CONSTRAINT'
  | 'UNKNOWN';

export type RequirementSubCategory =
  | 'PERFORMANCE'
  | 'SECURITY'
  | 'USABILITY'
  | 'RELIABILITY'
  | 'AVAILABILITY'
  | 'SCALABILITY'
  | 'MAINTAINABILITY'
  | 'ACCESSIBILITY'
  | 'COMPATIBILITY'
  | 'PORTABILITY'
  | 'OBSERVABILITY'
  | 'RECOVERABILITY'
  | 'RETENTION'
  | 'INTEGRATION'
  | 'TECHNICAL_CONSTRAINT'
  | 'BUSINESS_LOGIC';

export type RequirementRiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSPECIFIED';

export type RequirementCriticality = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSPECIFIED';

export type ClassificationMethod = 'DETERMINISTIC' | 'MANUAL' | 'DETERMINISTIC_REVIEWED';

export type ClassificationReviewStatus = 'GENERATED' | 'REVIEWED';

export type ClassificationReasonCode =
  | 'EXPLICIT_SECURITY_TERM'
  | 'AUTHENTICATION_PATTERN'
  | 'ENCRYPTION_PATTERN'
  | 'AUTHORIZATION_PATTERN'
  | 'TIME_CONSTRAINT'
  | 'THROUGHPUT_PATTERN'
  | 'AVAILABILITY_PERCENTAGE'
  | 'USABILITY_PATTERN'
  | 'ACCESSIBILITY_STANDARD'
  | 'EXPLICIT_COMPLIANCE_STANDARD'
  | 'BUSINESS_RULE_PATTERN'
  | 'EXTERNAL_SYSTEM_INTEGRATION'
  | 'DATA_RETENTION_PATTERN'
  | 'TECHNICAL_CONSTRAINT_PATTERN'
  | 'SECTION_CONTEXT'
  | 'STRUCTURED_ACTOR_PRESENT'
  | 'USER_STORY_STRUCTURE'
  | 'DEFAULT_FUNCTIONAL_HEURISTIC'
  | 'UNCLASSIFIABLE_VAGUE_TEXT';

export interface RequirementMetadataDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly originalRequirementText: string;
  readonly category: RequirementCategory;
  readonly subCategory: RequirementSubCategory | null;
  readonly domain: string | null;
  readonly module: string | null;
  readonly businessCapability: string | null;
  readonly actors: readonly string[];
  readonly securityRelevant: boolean;
  readonly performanceRelevant: boolean;
  readonly complianceRelevant: boolean;
  readonly complianceStandards: readonly string[];
  readonly priority: RequirementPriority;
  readonly riskLevel: RequirementRiskLevel;
  readonly criticality: RequirementCriticality;
  readonly tags: readonly string[];
  readonly classificationMethod: ClassificationMethod;
  readonly classifierVersion: string;
  readonly reviewStatus: ClassificationReviewStatus;
  readonly reasons: readonly ClassificationReasonCode[];
  readonly sourceRequirementTextSha256: string;
  readonly isStale: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ClassifyRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface GetRequirementMetadataInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface UpdateRequirementMetadataInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly category?: RequirementCategory;
  readonly subCategory?: RequirementSubCategory | null;
  readonly domain?: string | null;
  readonly module?: string | null;
  readonly businessCapability?: string | null;
  readonly actors?: readonly string[];
  readonly securityRelevant?: boolean;
  readonly performanceRelevant?: boolean;
  readonly complianceRelevant?: boolean;
  readonly complianceStandards?: readonly string[];
  readonly priority?: RequirementPriority;
  readonly riskLevel?: RequirementRiskLevel;
  readonly criticality?: RequirementCriticality;
  readonly tags?: readonly string[];
}

export interface RegenerateRequirementMetadataInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface BatchClassifyRequirementsInput {
  readonly projectId: string;
  readonly requirementIds: readonly string[];
}

export interface BatchClassifyItemResultDto {
  readonly requirementId: string;
  readonly requirementKey?: string;
  readonly success: boolean;
  readonly metadata?: RequirementMetadataDto;
  readonly error?: string;
}

export interface BatchClassifyRequirementsResultDto {
  readonly classifiedCount: number;
  readonly failedCount: number;
  readonly results: readonly BatchClassifyItemResultDto[];
}

// ------------------------------------------------------------------------------
// Diagnostic Error Reporting Types (Phase 13)
// ------------------------------------------------------------------------------

export type RendererErrorSource = 'react-error-boundary' | 'window-error' | 'unhandled-rejection';

export interface RendererErrorReport {
  readonly source: RendererErrorSource;
  readonly message: string;
  readonly stack?: string;
  readonly componentStack?: string;
  readonly route?: string;
}

export interface RendererErrorReportResult {
  readonly recorded: boolean;
  readonly duplicate?: boolean;
  readonly rateLimited?: boolean;
}

// ------------------------------------------------------------------------------
// Zod Validation Schemas
// ------------------------------------------------------------------------------

export const projectSourceKindSchema = z.literal('LOCAL_DIRECTORY');

export const sourceAvailabilitySchema = z.enum(['AVAILABLE', 'UNAVAILABLE']);

export const gitSourceRelationSchema = z.enum(['ROOT', 'NESTED', 'UNKNOWN']);

export const structureEntryKindSchema = z.enum(['FILE', 'DIRECTORY', 'SYMLINK']);

export const projectIdSchema = z.string().uuid('Project ID must be a valid UUID.');

export const sourceProjectIdSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});

export const sourceFileContentInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relativePath: z
    .string()
    .trim()
    .min(1, 'Relative path is required.')
    .max(1024, 'Relative path must be 1024 characters or fewer.')
    .refine(
      p =>
        !p.includes('\0') &&
        !p.startsWith('/') &&
        !p.startsWith('\\') &&
        !/^[a-zA-Z]:/.test(p) &&
        !p.startsWith('file:'),
      { message: 'Invalid relative path format.' },
    ),
});

export const listIndexedFilesSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  page: z.number().int().min(1).default(1).optional(),
  pageSize: z.number().int().min(1).max(100).default(20).optional(),
  searchQuery: z.string().max(255).optional(),
  language: z.string().max(64).optional(),
  classification: z.string().max(64).optional(),
});

export const searchSymbolsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  query: z.string().trim().min(1).max(255),
  kind: z
    .enum([
      'FUNCTION',
      'CLASS',
      'INTERFACE',
      'TYPE',
      'ENUM',
      'VARIABLE',
      'CONSTANT',
      'METHOD',
      'MODULE',
      'UNKNOWN',
    ])
    .optional(),
  limit: z.number().int().min(1).max(100).default(25).optional(),
});

export const repositoryFileDetailsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relativePath: z.string().trim().min(1).max(1024),
});

export const selectRunConfigSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  candidateId: z.string().trim().min(1).max(255),
});

export const updateTargetUrlSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  targetUrl: z
    .string()
    .trim()
    .max(2048, 'Target URL must be 2048 characters or fewer.')
    .nullable()
    .optional()
    .refine(
      url => {
        if (!url) return true;
        try {
          const parsed = new URL(url);
          return (
            (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
            !parsed.username &&
            !parsed.password
          );
        } catch {
          return false;
        }
      },
      {
        message: 'Target URL must be a valid HTTP or HTTPS URL without credentials.',
      },
    ),
});

export const createSnapshotSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  label: z
    .string()
    .trim()
    .max(255, 'Snapshot label must be 255 characters or fewer.')
    .nullable()
    .optional(),
});

export const setBaselineSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  snapshotId: z.string().uuid('Snapshot ID must be a valid UUID.'),
});

export const deleteSnapshotSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  snapshotId: z.string().uuid('Snapshot ID must be a valid UUID.'),
});

export const projectStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

export const environmentTypeSchema = z.enum([
  'LOCAL',
  'DEVELOPMENT',
  'TEST',
  'STAGING',
  'PRODUCTION',
  'CUSTOM',
]);

export const listProjectsSchema = z
  .object({
    status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).optional(),
  })
  .optional();

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Project name is required.')
    .max(120, 'Project name must be 120 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(5000, 'Project description must be 5000 characters or fewer.')
    .nullable()
    .optional(),
});

export const updateProjectSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  name: z
    .string()
    .trim()
    .min(1, 'Project name is required.')
    .max(120, 'Project name must be 120 characters or fewer.')
    .optional(),
  description: z
    .string()
    .trim()
    .max(5000, 'Project description must be 5000 characters or fewer.')
    .nullable()
    .optional(),
});

export const createEnvironmentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  name: z
    .string()
    .trim()
    .min(1, 'Environment name is required.')
    .max(80, 'Environment name must be 80 characters or fewer.'),
  type: environmentTypeSchema.optional().default('DEVELOPMENT'),
  baseUrl: z
    .string()
    .trim()
    .max(2048, 'Base URL must be 2048 characters or fewer.')
    .nullable()
    .optional()
    .refine(
      url => {
        if (!url) return true;
        try {
          const parsed = new URL(url);
          return (
            (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
            !parsed.username &&
            !parsed.password
          );
        } catch {
          return false;
        }
      },
      {
        message:
          'Base URL must be a valid HTTP or HTTPS URL without embedded user/password credentials.',
      },
    ),
});

export const updateEnvironmentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  environmentId: z.string().uuid('Environment ID must be a valid UUID.'),
  name: z
    .string()
    .trim()
    .min(1, 'Environment name is required.')
    .max(80, 'Environment name must be 80 characters or fewer.')
    .optional(),
  type: environmentTypeSchema.optional(),
  baseUrl: z
    .string()
    .trim()
    .max(2048, 'Base URL must be 2048 characters or fewer.')
    .nullable()
    .optional()
    .refine(
      url => {
        if (!url) return true;
        try {
          const parsed = new URL(url);
          return (
            (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
            !parsed.username &&
            !parsed.password
          );
        } catch {
          return false;
        }
      },
      {
        message:
          'Base URL must be a valid HTTP or HTTPS URL without embedded user/password credentials.',
      },
    ),
});

export const deleteEnvironmentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  environmentId: z.string().uuid('Environment ID must be a valid UUID.'),
});

export const setDefaultEnvironmentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  environmentId: z.string().uuid('Environment ID must be a valid UUID.'),
});

export const rendererErrorReportSchema = z.object({
  source: z.enum(['react-error-boundary', 'window-error', 'unhandled-rejection']),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  componentStack: z.string().max(8000).optional(),
  route: z.string().max(256).optional(),
});

export const requirementSourceTypeSchema = z.enum(['MANUAL', 'PASTED_TEXT', 'DOCUMENT']);
export const requirementSourceStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const requirementTypeSchema = z.enum([
  'FUNCTIONAL',
  'NON_FUNCTIONAL',
  'BUSINESS_RULE',
  'SECURITY',
  'PERFORMANCE',
  'USABILITY',
  'DATA',
  'INTEGRATION',
  'CONSTRAINT',
  'UNKNOWN',
]);
export const requirementPrioritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNSPECIFIED',
]);
export const requirementStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']);

export const listRequirementsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  page: z.number().int().min(1).default(1).optional(),
  pageSize: z.number().int().min(1).max(500).default(50).optional(),
  status: requirementStatusSchema.optional(),
  type: requirementTypeSchema.optional(),
  priority: requirementPrioritySchema.optional(),
  searchQuery: z.string().max(255).optional(),
  requirementSourceId: z.string().uuid('Requirement Source ID must be a valid UUID.').optional(),
});

export const getRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const getRequirementByKeySchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementKey: z
    .string()
    .trim()
    .min(1, 'Requirement key is required.')
    .max(64, 'Requirement key must be 64 characters or fewer.'),
});

export const createRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementKey: z
    .string()
    .trim()
    .min(1, 'Requirement key is required.')
    .max(64, 'Requirement key must be 64 characters or fewer.')
    .regex(
      /^[A-Za-z0-9_-]+$/,
      'Requirement key may only contain letters, digits, hyphens, and underscores.',
    )
    .optional(),
  title: z
    .string()
    .trim()
    .min(1, 'Requirement title is required.')
    .max(255, 'Requirement title must be 255 characters or fewer.'),
  originalText: z
    .string()
    .trim()
    .min(1, 'Original requirement text is required.')
    .max(20000, 'Original requirement text must be 20000 characters or fewer.'),
  type: requirementTypeSchema.optional().default('UNKNOWN'),
  priority: requirementPrioritySchema.optional().default('UNSPECIFIED'),
  status: requirementStatusSchema.optional().default('DRAFT'),
  requirementSourceId: z
    .string()
    .uuid('Requirement Source ID must be a valid UUID.')
    .nullable()
    .optional(),
});

export const updateRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  title: z
    .string()
    .trim()
    .min(1, 'Requirement title is required.')
    .max(255, 'Requirement title must be 255 characters or fewer.')
    .optional(),
  originalText: z
    .string()
    .trim()
    .min(1, 'Original requirement text is required.')
    .max(20000, 'Original requirement text must be 20000 characters or fewer.')
    .optional(),
  type: requirementTypeSchema.optional(),
  priority: requirementPrioritySchema.optional(),
  status: requirementStatusSchema.optional(),
});

export const activateRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const deprecateRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const draftRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const archiveRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const restoreRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const deleteRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const listRequirementSourcesSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});

export const getRequirementSourceSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  sourceId: z.string().uuid('Source ID must be a valid UUID.'),
});

export const getRequirementSummarySchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});

export const parseBulkRequirementsSchema = z.object({
  rawText: z
    .string()
    .min(1, 'Pasted text cannot be empty.')
    .max(500000, 'Pasted text must be 500,000 characters or fewer.'),
});

export const approvedBulkCandidateSchema = z.object({
  originalText: z
    .string()
    .trim()
    .min(1, 'Candidate text cannot be empty.')
    .max(20000, 'Candidate text must be 20,000 characters or fewer.'),
  title: z.string().trim().max(255, 'Candidate title must be 255 characters or fewer.').optional(),
  type: requirementTypeSchema.optional().default('UNKNOWN'),
  priority: requirementPrioritySchema.optional().default('UNSPECIFIED'),
  status: requirementStatusSchema.optional().default('DRAFT'),
  detectedExternalKey: z.string().trim().max(64).nullable().optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
});

export const importBulkRequirementsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  sourceName: z.string().trim().max(255, 'Source name must be 255 characters or fewer.').optional(),
  candidates: z
    .array(approvedBulkCandidateSchema)
    .min(1, 'At least one candidate must be selected for import.')
    .max(500, 'Cannot import more than 500 candidates in a single batch.'),
});

export const selectAndIngestDocumentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  sourceName: z.string().trim().max(255, 'Source name must be 255 characters or fewer.').optional(),
});

export const ingestDocumentDirectSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  absoluteSourcePath: z.string().min(1, 'Source path is required.'),
  sourceName: z.string().trim().max(255, 'Source name must be 255 characters or fewer.').optional(),
});

export const listRequirementDocumentsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});

export const getRequirementDocumentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  documentId: z.string().uuid('Document ID must be a valid UUID.'),
});

export const deleteRequirementDocumentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  documentId: z.string().uuid('Document ID must be a valid UUID.'),
});

export const extractRequirementDocumentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  documentId: z.string().uuid('Document ID must be a valid UUID.'),
  force: z.boolean().optional().default(false),
});

export const getRequirementDocumentExtractionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  documentId: z.string().uuid('Document ID must be a valid UUID.'),
});

export const candidateReviewStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'IMPORTED']);

export const detectRequirementCandidatesSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  documentId: z.string().uuid('Document ID must be a valid UUID.'),
  force: z.boolean().optional().default(false),
});

export const listRequirementCandidatesSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  documentId: z.string().uuid('Document ID must be a valid UUID.'),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'IMPORTED', 'ALL']).optional().default('ALL'),
  search: z.string().max(255).optional(),
});

export const updateRequirementCandidateSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  candidateId: z.string().uuid('Candidate ID must be a valid UUID.'),
  reviewedText: z
    .string()
    .trim()
    .min(1, 'Reviewed text cannot be empty.')
    .max(10000, 'Reviewed text must not exceed 10,000 characters.'),
});

export const setRequirementCandidateStatusSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  candidateIds: z
    .array(z.string().uuid('Each candidate ID must be a valid UUID.'))
    .min(1, 'At least one candidate ID must be provided.')
    .max(1000, 'Cannot update more than 1,000 candidates at once.'),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
});

export const importApprovedCandidatesSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  documentId: z.string().uuid('Document ID must be a valid UUID.'),
  candidateIds: z
    .array(z.string().uuid('Each candidate ID must be a valid UUID.'))
    .max(1000, 'Cannot import more than 1,000 candidates at once.')
    .optional(),
});

export const provenanceSourceKindSchema = z.enum(['MANUAL', 'PASTED_TEXT', 'DOCUMENT']);
export const provenanceLocationKindSchema = z.enum([
  'NONE',
  'PASTE_LINE',
  'DOCUMENT_BLOCK',
  'TABLE_ROW',
  'PDF_PAGE',
]);
export const provenanceCompletenessSchema = z.enum(['COMPLETE', 'PARTIAL', 'MINIMAL']);
export const sourceIntegrityStatusSchema = z.enum([
  'VERIFIED',
  'MISSING_FILE',
  'HASH_MISMATCH',
  'PARTIAL',
  'SOURCE_RECORD_MISSING',
]);

export const getRequirementProvenanceSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const getRequirementSourceContextSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const requirementModalitySchema = z.enum([
  'SHALL',
  'MUST',
  'SHALL_NOT',
  'MUST_NOT',
  'SHOULD',
  'MAY',
  'REQUIRED_TO',
  'UNSPECIFIED',
]);

export const normalizationStatusSchema = z.enum([
  'NOT_NORMALIZED',
  'NORMALIZED',
  'REVIEWED',
  'STALE',
]);

export const normalizationMethodSchema = z.enum([
  'DETERMINISTIC',
  'MANUAL',
  'DETERMINISTIC_REVIEWED',
]);

export const representationReviewStatusSchema = z.enum(['GENERATED', 'REVIEWED']);

export const requirementConditionSchema = z.object({
  text: z.string().min(1).max(1000),
  type: z.enum(['WHEN', 'IF', 'WHILE', 'WHERE', 'UNSPECIFIED']),
});

export const requirementConstraintSchema = z.object({
  text: z.string().min(1).max(1000),
  type: z.string().max(64).optional(),
});

export const requirementQuantitativeValueSchema = z.object({
  text: z.string().min(1).max(500),
  value: z.number().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  unit: z.string().max(64).optional(),
  operator: z
    .enum(['EQUAL', 'MAXIMUM', 'MINIMUM', 'WITHIN', 'RANGE', 'PERCENTAGE', 'UNSPECIFIED'])
    .optional(),
});

export const normalizeRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const getRequirementRepresentationSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const updateRequirementRepresentationSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  normalizedText: z.string().min(1).max(50000).optional(),
  actor: z.string().max(255).nullable().optional(),
  modality: requirementModalitySchema.optional(),
  negated: z.boolean().optional(),
  action: z.string().max(255).nullable().optional(),
  object: z.string().max(5000).nullable().optional(),
  conditions: z.array(requirementConditionSchema).max(50).optional(),
  constraints: z.array(requirementConstraintSchema).max(50).optional(),
  quantitativeValues: z.array(requirementQuantitativeValueSchema).max(50).optional(),
  expectedOutcome: z.string().max(5000).nullable().optional(),
});

export const regenerateRequirementRepresentationSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const batchNormalizeRequirementsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementIds: z
    .array(z.string().uuid('Each requirement ID must be a valid UUID.'))
    .min(1, 'At least one requirement ID must be provided.')
    .max(100, 'Cannot normalize more than 100 requirements in a single batch.'),
});

// Phase 38 Schemas
export const requirementCategorySchema = z.enum([
  'FUNCTIONAL',
  'NON_FUNCTIONAL',
  'BUSINESS_RULE',
  'INTERFACE',
  'DATA',
  'COMPLIANCE',
  'CONSTRAINT',
  'UNKNOWN',
]);

export const requirementSubCategorySchema = z.enum([
  'PERFORMANCE',
  'SECURITY',
  'USABILITY',
  'RELIABILITY',
  'AVAILABILITY',
  'SCALABILITY',
  'MAINTAINABILITY',
  'ACCESSIBILITY',
  'COMPATIBILITY',
  'PORTABILITY',
  'OBSERVABILITY',
  'RECOVERABILITY',
  'RETENTION',
  'INTEGRATION',
  'TECHNICAL_CONSTRAINT',
  'BUSINESS_LOGIC',
]);

export const requirementRiskLevelSchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNSPECIFIED',
]);

export const requirementCriticalitySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNSPECIFIED',
]);

export const classificationMethodSchema = z.enum([
  'DETERMINISTIC',
  'MANUAL',
  'DETERMINISTIC_REVIEWED',
]);

export const classificationReviewStatusSchema = z.enum(['GENERATED', 'REVIEWED']);

export const classifyRequirementSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const getRequirementMetadataSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const updateRequirementMetadataSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  category: requirementCategorySchema.optional(),
  subCategory: requirementSubCategorySchema.nullable().optional(),
  domain: z.string().max(100).nullable().optional(),
  module: z.string().max(100).nullable().optional(),
  businessCapability: z.string().max(255).nullable().optional(),
  actors: z.array(z.string().max(255)).max(20).optional(),
  securityRelevant: z.boolean().optional(),
  performanceRelevant: z.boolean().optional(),
  complianceRelevant: z.boolean().optional(),
  complianceStandards: z.array(z.string().max(100)).max(20).optional(),
  priority: requirementPrioritySchema.optional(),
  riskLevel: requirementRiskLevelSchema.optional(),
  criticality: requirementCriticalitySchema.optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export const regenerateRequirementMetadataSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const batchClassifyRequirementsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementIds: z
    .array(z.string().uuid('Each requirement ID must be a valid UUID.'))
    .min(1, 'At least one requirement ID must be provided.')
    .max(100, 'Cannot classify more than 100 requirements in a single batch.'),
});

// ------------------------------------------------------------------------------
// Requirement Quality, Testability & Clarification Types (Phase 39)
// ------------------------------------------------------------------------------

export type RequirementTestabilityStatus =
  'TESTABLE' | 'PARTIALLY_TESTABLE' | 'NOT_TESTABLE' | 'UNDETERMINED';

export type QualityAnalysisMethod = 'DETERMINISTIC' | 'DETERMINISTIC_REVIEWED' | 'MANUAL';

export type QualityFindingSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type QualityFindingReviewStatus = 'OPEN' | 'ACKNOWLEDGED' | 'DISMISSED';

export type QualityFindingCategory =
  | 'AMBIGUITY'
  | 'COMPLETENESS'
  | 'TESTABILITY'
  | 'SPECIFICITY'
  | 'MEASURABILITY'
  | 'CONSISTENCY'
  | 'ATOMICITY';

export type QualityFindingCode =
  | 'VAGUE_TERM'
  | 'VAGUE_QUANTITY'
  | 'UNDEFINED_TIME_CONSTRAINT'
  | 'UNDEFINED_CAPACITY'
  | 'SUBJECTIVE_CRITERION'
  | 'UNMEASURABLE_QUALITY_ATTRIBUTE'
  | 'WEAK_MODALITY'
  | 'MIXED_MODALITY'
  | 'OPTIONAL_BEHAVIOR'
  | 'MISSING_ACTOR'
  | 'MISSING_ACTION'
  | 'MISSING_OBJECT'
  | 'UNDEFINED_EXPECTED_OUTCOME'
  | 'UNDEFINED_CONDITION'
  | 'UNDEFINED_REFERENCE'
  | 'UNRESOLVED_REFERENCE'
  | 'OPEN_ENDED_LIST'
  | 'AMBIGUOUS_LOGICAL_OPERATOR'
  | 'COMPLEX_NEGATION'
  | 'COMPOUND_REQUIREMENT'
  | 'UNBOUNDED_SUPERLATIVE'
  | 'UNDEFINED_COMPARISON_BASELINE'
  | 'UNDEFINED_SCALE';

export interface RequirementQualityFindingDto {
  readonly id: string;
  readonly analysisId: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly code: QualityFindingCode;
  readonly category: QualityFindingCategory;
  readonly severity: QualityFindingSeverity;
  readonly message: string;
  readonly evidenceText: string | null;
  readonly startOffset: number | null;
  readonly endOffset: number | null;
  readonly suggestedClarification: string | null;
  readonly reviewStatus: QualityFindingReviewStatus;
  readonly reviewRationale: string | null;
  readonly clarificationResponse: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RequirementQualityAnalysisDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly originalRequirementText: string;
  readonly sourceRequirementTextSha256: string;
  readonly analyzerVersion: string;
  readonly testabilityStatus: RequirementTestabilityStatus;
  readonly qualityScore: number | null;
  readonly analysisMethod: QualityAnalysisMethod;
  readonly findingsCount: number;
  readonly openFindingsCount: number;
  readonly clarificationQuestions: readonly string[];
  readonly findings: readonly RequirementQualityFindingDto[];
  readonly isStale: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AnalyzeRequirementQualityInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface GetRequirementQualityAnalysisInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface ReviewRequirementQualityFindingInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly findingId: string;
  readonly reviewStatus: QualityFindingReviewStatus;
  readonly reviewRationale?: string | null;
  readonly clarificationResponse?: string | null;
}

export interface ReanalyzeRequirementQualityInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface BatchAnalyzeRequirementQualityInput {
  readonly projectId: string;
  readonly requirementIds: readonly string[];
}

export interface BatchAnalyzeQualityItemResultDto {
  readonly requirementId: string;
  readonly requirementKey?: string;
  readonly success: boolean;
  readonly analysis?: RequirementQualityAnalysisDto;
  readonly error?: DesktopError;
}

export interface BatchAnalyzeQualityResultDto {
  readonly analyzedCount: number;
  readonly failedCount: number;
  readonly results: readonly BatchAnalyzeQualityItemResultDto[];
}

export const requirementTestabilityStatusSchema = z.enum([
  'TESTABLE',
  'PARTIALLY_TESTABLE',
  'NOT_TESTABLE',
  'UNDETERMINED',
]);

export const qualityAnalysisMethodSchema = z.enum([
  'DETERMINISTIC',
  'DETERMINISTIC_REVIEWED',
  'MANUAL',
]);

export const qualityFindingSeveritySchema = z.enum(['ERROR', 'WARNING', 'INFO']);

export const qualityFindingReviewStatusSchema = z.enum(['OPEN', 'ACKNOWLEDGED', 'DISMISSED']);

export const qualityFindingCategorySchema = z.enum([
  'AMBIGUITY',
  'COMPLETENESS',
  'TESTABILITY',
  'SPECIFICITY',
  'MEASURABILITY',
  'CONSISTENCY',
  'ATOMICITY',
]);

export const qualityFindingCodeSchema = z.enum([
  'VAGUE_TERM',
  'VAGUE_QUANTITY',
  'UNDEFINED_TIME_CONSTRAINT',
  'UNDEFINED_CAPACITY',
  'SUBJECTIVE_CRITERION',
  'UNMEASURABLE_QUALITY_ATTRIBUTE',
  'WEAK_MODALITY',
  'MIXED_MODALITY',
  'OPTIONAL_BEHAVIOR',
  'MISSING_ACTOR',
  'MISSING_ACTION',
  'MISSING_OBJECT',
  'UNDEFINED_EXPECTED_OUTCOME',
  'UNDEFINED_CONDITION',
  'UNDEFINED_REFERENCE',
  'UNRESOLVED_REFERENCE',
  'OPEN_ENDED_LIST',
  'AMBIGUOUS_LOGICAL_OPERATOR',
  'COMPLEX_NEGATION',
  'COMPOUND_REQUIREMENT',
  'UNBOUNDED_SUPERLATIVE',
  'UNDEFINED_COMPARISON_BASELINE',
  'UNDEFINED_SCALE',
]);

export const analyzeRequirementQualitySchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const getRequirementQualityAnalysisSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const reviewRequirementQualityFindingSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  findingId: z.string().uuid('Finding ID must be a valid UUID.'),
  reviewStatus: qualityFindingReviewStatusSchema,
  reviewRationale: z
    .string()
    .max(1000, 'Review rationale cannot exceed 1000 characters.')
    .nullable()
    .optional(),
  clarificationResponse: z
    .string()
    .max(1000, 'Clarification response cannot exceed 1000 characters.')
    .nullable()
    .optional(),
});

export const reanalyzeRequirementQualitySchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const batchAnalyzeRequirementQualitySchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementIds: z
    .array(z.string().uuid('Each requirement ID must be a valid UUID.'))
    .min(1, 'At least one requirement ID must be provided.')
    .max(100, 'Cannot analyze more than 100 requirements in a single batch.'),
});

// ------------------------------------------------------------------------------
// Requirement Dependency & Relationship Types (Phase 40)
// ------------------------------------------------------------------------------

export type RequirementRelationshipType =
  | 'DEPENDS_ON'
  | 'REQUIRED_BY'
  | 'REFINES'
  | 'REFINED_BY'
  | 'PARENT_OF'
  | 'CHILD_OF'
  | 'CONSTRAINS'
  | 'CONSTRAINED_BY'
  | 'RELATED_TO'
  | 'CONFLICTS_WITH'
  | 'DUPLICATES'
  | 'OVERLAPS_WITH';

export type RelationshipDetectionMethod =
  | 'EXPLICIT_REFERENCE'
  | 'SOURCE_HIERARCHY'
  | 'DETERMINISTIC_RULE'
  | 'MANUAL'
  | 'DETERMINISTIC_REVIEWED';

export type RelationshipStatus = 'PROPOSED' | 'CONFIRMED' | 'REJECTED';

export type RelationshipReasonCode =
  | 'EXPLICIT_REQUIREMENT_REFERENCE'
  | 'EXTERNAL_SOURCE_ID_REFERENCE'
  | 'SOURCE_HIERARCHY_NUMERATION'
  | 'CONFIRMED_DUPLICATE'
  | 'CONSTRAINING_RULE'
  | 'REFINEMENT_RULE'
  | 'MANUALLY_SPECIFIED';

export interface RequirementRelationshipDto {
  readonly id: string;
  readonly projectId: string;
  readonly sourceRequirementId: string;
  readonly sourceRequirementKey: string;
  readonly sourceRequirementTitle: string;
  readonly targetRequirementId: string;
  readonly targetRequirementKey: string;
  readonly targetRequirementTitle: string;
  readonly relationshipType: RequirementRelationshipType;
  readonly detectionMethod: RelationshipDetectionMethod;
  readonly status: RelationshipStatus;
  readonly reasonCodes: readonly string[];
  readonly evidence: string | null;
  readonly sourceRequirementTextSha256: string;
  readonly targetRequirementTextSha256: string;
  readonly analyzerVersion: string;
  readonly reviewRationale: string | null;
  readonly isStale: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DependencyCycleDto {
  readonly requirementIds: readonly string[];
  readonly requirementKeys: readonly string[];
  readonly pathDescription: string;
}

export interface RelationshipGraphNodeDto {
  readonly id: string;
  readonly requirementKey: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
}

export interface RelationshipGraphEdgeDto {
  readonly id: string;
  readonly sourceRequirementId: string;
  readonly targetRequirementId: string;
  readonly relationshipType: RequirementRelationshipType;
  readonly status: RelationshipStatus;
  readonly detectionMethod: RelationshipDetectionMethod;
  readonly isStale: boolean;
}

export interface RelationshipGraphDto {
  readonly projectId: string;
  readonly nodes: readonly RelationshipGraphNodeDto[];
  readonly edges: readonly RelationshipGraphEdgeDto[];
  readonly cycles: readonly DependencyCycleDto[];
  readonly confirmedEdgeCount: number;
  readonly proposedEdgeCount: number;
  readonly staleEdgeCount: number;
}

export interface ProposeRelationshipsInput {
  readonly projectId: string;
  readonly requirementId?: string;
}

export interface ProposeRelationshipsResultDto {
  readonly proposedCount: number;
  readonly existingCount: number;
  readonly unresolvedReferences: readonly string[];
  readonly relationships: readonly RequirementRelationshipDto[];
  readonly cycles: readonly DependencyCycleDto[];
}

export interface GetRelationshipsInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface GetRelationshipGraphInput {
  readonly projectId: string;
  readonly requirementId?: string;
  readonly maxDepth?: number;
}

export interface CreateManualRelationshipInput {
  readonly projectId: string;
  readonly sourceRequirementId: string;
  readonly targetRequirementId: string;
  readonly relationshipType: RequirementRelationshipType;
  readonly reviewRationale?: string | null;
}

export interface ReviewRelationshipInput {
  readonly projectId: string;
  readonly relationshipId: string;
  readonly status: RelationshipStatus;
  readonly reviewRationale?: string | null;
}

export interface DeleteRelationshipInput {
  readonly projectId: string;
  readonly relationshipId: string;
}

// ------------------------------------------------------------------------------
// Repository Evidence Mapping Types (Phase 40)
// ------------------------------------------------------------------------------

export type RepositoryEvidenceType =
  | 'FILE'
  | 'SYMBOL'
  | 'ROUTE'
  | 'API_ENDPOINT'
  | 'COMPONENT'
  | 'SERVICE'
  | 'DATABASE_MODEL'
  | 'CONFIGURATION'
  | 'TEST_FILE'
  | 'ENTRY_POINT'
  | 'OTHER';

export type EvidenceMatchMethod =
  | 'EXACT_SYMBOL'
  | 'EXACT_FILE_TOKEN'
  | 'ROUTE_TOKEN_MATCH'
  | 'DOMAIN_MATCH'
  | 'ACTION_OBJECT_MATCH'
  | 'TECHNICAL_IDENTIFIER'
  | 'MANUAL'
  | 'DETERMINISTIC_REVIEWED';

export type RepositoryEvidenceStatus = 'CANDIDATE' | 'CONFIRMED' | 'REJECTED';

export type EvidenceReasonCode =
  | 'EXACT_SYMBOL_NAME'
  | 'EXACT_FILE_TOKEN'
  | 'ROUTE_TOKEN_MATCH'
  | 'DOMAIN_MATCH'
  | 'ACTION_TOKEN_MATCH'
  | 'OBJECT_TOKEN_MATCH'
  | 'TECHNICAL_IDENTIFIER_MATCH'
  | 'COMPONENT_NAME_MATCH'
  | 'DATABASE_MODEL_MATCH'
  | 'TEST_FILE_MATCH'
  | 'MANUAL_ATTACHMENT';

export interface RequirementRepositoryEvidenceDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly projectSourceId: string;
  readonly repositorySnapshotId: string | null;
  readonly indexedFileId: string | null;
  readonly symbolId: string | null;
  readonly evidenceType: RepositoryEvidenceType;
  readonly filePath: string;
  readonly symbolName: string | null;
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
  readonly fileContentHash: string | null;
  readonly evidenceScore: number;
  readonly reasonCodes: readonly string[];
  readonly matchMethod: EvidenceMatchMethod;
  readonly status: RepositoryEvidenceStatus;
  readonly sourceRequirementTextSha256: string;
  readonly matcherVersion: string;
  readonly reviewRationale: string | null;
  readonly isStale: boolean;
  readonly isMissingInSnapshot: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MatchRepositoryEvidenceInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface MatchRepositoryEvidenceResultDto {
  readonly matchedCount: number;
  readonly candidateEvidence: readonly RequirementRepositoryEvidenceDto[];
  readonly snapshotFingerprint: string | null;
  readonly isIndexed: boolean;
}

export interface GetRepositoryEvidenceInput {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface ReviewRepositoryEvidenceInput {
  readonly projectId: string;
  readonly evidenceId: string;
  readonly status: RepositoryEvidenceStatus;
  readonly reviewRationale?: string | null;
}

export interface CreateManualRepositoryEvidenceInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly projectSourceId: string;
  readonly indexedFileId: string;
  readonly symbolId?: string | null;
  readonly evidenceType: RepositoryEvidenceType;
  readonly reviewRationale?: string | null;
}

export interface DeleteRepositoryEvidenceInput {
  readonly projectId: string;
  readonly evidenceId: string;
}

export interface PreviewRepositoryEvidenceInput {
  readonly projectId: string;
  readonly evidenceId: string;
}

export interface EvidencePreviewDto {
  readonly filePath: string;
  readonly content: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly totalLines: number;
  readonly isTruncated: boolean;
  readonly language: string | null;
}

export const requirementRelationshipTypeSchema = z.enum([
  'DEPENDS_ON',
  'REQUIRED_BY',
  'REFINES',
  'REFINED_BY',
  'PARENT_OF',
  'CHILD_OF',
  'CONSTRAINS',
  'CONSTRAINED_BY',
  'RELATED_TO',
  'CONFLICTS_WITH',
  'DUPLICATES',
  'OVERLAPS_WITH',
]);

export const relationshipDetectionMethodSchema = z.enum([
  'EXPLICIT_REFERENCE',
  'SOURCE_HIERARCHY',
  'DETERMINISTIC_RULE',
  'MANUAL',
  'DETERMINISTIC_REVIEWED',
]);

export const relationshipStatusSchema = z.enum(['PROPOSED', 'CONFIRMED', 'REJECTED']);

export const proposeRelationshipsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.').optional(),
});

export const getRelationshipsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const getRelationshipGraphSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.').optional(),
  maxDepth: z.number().int().min(1).max(10).optional(),
});

export const createManualRelationshipSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  sourceRequirementId: z.string().uuid('Source Requirement ID must be a valid UUID.'),
  targetRequirementId: z.string().uuid('Target Requirement ID must be a valid UUID.'),
  relationshipType: requirementRelationshipTypeSchema,
  reviewRationale: z
    .string()
    .max(1000, 'Review rationale cannot exceed 1000 characters.')
    .nullable()
    .optional(),
});

export const reviewRelationshipSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relationshipId: z.string().uuid('Relationship ID must be a valid UUID.'),
  status: relationshipStatusSchema,
  reviewRationale: z
    .string()
    .max(1000, 'Review rationale cannot exceed 1000 characters.')
    .nullable()
    .optional(),
});

export const deleteRelationshipSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relationshipId: z.string().uuid('Relationship ID must be a valid UUID.'),
});

export const repositoryEvidenceTypeSchema = z.enum([
  'FILE',
  'SYMBOL',
  'ROUTE',
  'API_ENDPOINT',
  'COMPONENT',
  'SERVICE',
  'DATABASE_MODEL',
  'CONFIGURATION',
  'TEST_FILE',
  'ENTRY_POINT',
  'OTHER',
]);

export const evidenceMatchMethodSchema = z.enum([
  'EXACT_SYMBOL',
  'EXACT_FILE_TOKEN',
  'ROUTE_TOKEN_MATCH',
  'DOMAIN_MATCH',
  'ACTION_OBJECT_MATCH',
  'TECHNICAL_IDENTIFIER',
  'MANUAL',
  'DETERMINISTIC_REVIEWED',
]);

export const repositoryEvidenceStatusSchema = z.enum(['CANDIDATE', 'CONFIRMED', 'REJECTED']);

export const matchRepositoryEvidenceSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const getRepositoryEvidenceSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const reviewRepositoryEvidenceSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  evidenceId: z.string().uuid('Evidence ID must be a valid UUID.'),
  status: repositoryEvidenceStatusSchema,
  reviewRationale: z
    .string()
    .max(1000, 'Review rationale cannot exceed 1000 characters.')
    .nullable()
    .optional(),
});

export const createManualRepositoryEvidenceSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  projectSourceId: z.string().uuid('Project Source ID must be a valid UUID.'),
  indexedFileId: z.string().uuid('Indexed File ID must be a valid UUID.'),
  symbolId: z.string().uuid('Symbol ID must be a valid UUID.').nullable().optional(),
  evidenceType: repositoryEvidenceTypeSchema,
  reviewRationale: z
    .string()
    .max(1000, 'Review rationale cannot exceed 1000 characters.')
    .nullable()
    .optional(),
});

export const deleteRepositoryEvidenceSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  evidenceId: z.string().uuid('Evidence ID must be a valid UUID.'),
});

export const previewRepositoryEvidenceSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  evidenceId: z.string().uuid('Evidence ID must be a valid UUID.'),
});

// ------------------------------------------------------------------------------
// Requirement Versioning, Change Detection & Impact Foundation Types (Phase 41)
// ------------------------------------------------------------------------------

export type RequirementChangeKind =
  | 'CREATED'
  | 'BASELINE_CAPTURE'
  | 'TEXT_CHANGED'
  | 'TITLE_CHANGED'
  | 'TYPE_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'STATUS_CHANGED'
  | 'MULTIPLE_FIELDS_CHANGED'
  | 'RESTORED_VERSION';

export type RequirementImpactType =
  | 'DEPENDENT_REQUIREMENT'
  | 'PARENT_REQUIREMENT'
  | 'CHILD_REQUIREMENT'
  | 'CONSTRAINED_REQUIREMENT'
  | 'RELATED_REQUIREMENT'
  | 'CONFLICT_REVIEW'
  | 'REPOSITORY_EVIDENCE'
  | 'REPOSITORY_FILE'
  | 'REPOSITORY_SYMBOL';

export type RequirementImpactStatus = 'OPEN' | 'REVIEWED' | 'NOT_IMPACTED' | 'ACTION_REQUIRED';

export interface RequirementVersionDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly versionNumber: number;
  readonly requirementKeySnapshot: string;
  readonly title: string;
  readonly originalText: string;
  readonly type: RequirementType;
  readonly priority: RequirementPriority;
  readonly status: RequirementStatus;
  readonly sourceRequirementTextSha256: string;
  readonly changeKind: RequirementChangeKind;
  readonly changeReason: string | null;
  readonly changedFields: readonly string[];
  readonly createdByActorId: string | null;
  readonly createdAt: string;
}

export interface RequirementHistoryDto {
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly currentVersionNumber: number;
  readonly totalVersions: number;
  readonly versions: readonly RequirementVersionDto[];
}

export interface TextDiffTokenDto {
  readonly type: 'ADDED' | 'REMOVED' | 'UNCHANGED';
  readonly value: string;
}

export interface StructuredDiffFieldDto {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly isChanged: boolean;
}

export interface RequirementDiffDto {
  readonly sourceVersionNumber: number;
  readonly targetVersionNumber: number;
  readonly isNoOp: boolean;
  readonly changedFields: readonly string[];
  readonly changeKinds: readonly RequirementChangeKind[];
  readonly titleDiff: readonly TextDiffTokenDto[];
  readonly textDiff: readonly TextDiffTokenDto[];
  readonly structuredDiff: readonly StructuredDiffFieldDto[];
}

export interface RequirementImpactCandidateDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementVersionId: string;
  readonly impactType: RequirementImpactType;
  readonly targetRequirementId: string | null;
  readonly targetRequirementKey: string | null;
  readonly targetRequirementTitle: string | null;
  readonly repositoryEvidenceId: string | null;
  readonly repositoryEvidencePath: string | null;
  readonly repositoryEvidenceSymbol: string | null;
  readonly reasonCode: string;
  readonly status: RequirementImpactStatus;
  readonly reviewRationale: string | null;
  readonly depth: number;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

export interface RequirementImpactsResultDto {
  readonly requirementId: string;
  readonly requirementVersionId: string;
  readonly versionNumber: number;
  readonly totalCandidates: number;
  readonly openCount: number;
  readonly candidates: readonly RequirementImpactCandidateDto[];
}

export interface GetRequirementHistoryInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface GetRequirementVersionInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly versionNumber: number;
}

export interface CompareRequirementVersionsInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly sourceVersionNumber: number;
  readonly targetVersionNumber: number;
}

export interface UpdateRequirementVersionedInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly title?: string;
  readonly originalText?: string;
  readonly type?: RequirementType;
  readonly priority?: RequirementPriority;
  readonly status?: RequirementStatus;
  readonly expectedVersionNumber?: number;
  readonly changeReason?: string | null;
  readonly actorId?: string | null;
}

export interface RestoreRequirementVersionInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly versionNumberToRestore: number;
  readonly expectedCurrentVersionNumber?: number;
  readonly restoreReason?: string | null;
  readonly actorId?: string | null;
}

export interface GetRequirementChangeImpactInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly versionNumber?: number;
  readonly maxDepth?: number;
}

export interface ReviewRequirementImpactInput {
  readonly projectId: string;
  readonly impactId: string;
  readonly status: RequirementImpactStatus;
  readonly reviewRationale?: string | null;
}

export const requirementChangeKindSchema = z.enum([
  'CREATED',
  'BASELINE_CAPTURE',
  'TEXT_CHANGED',
  'TITLE_CHANGED',
  'TYPE_CHANGED',
  'PRIORITY_CHANGED',
  'STATUS_CHANGED',
  'MULTIPLE_FIELDS_CHANGED',
  'RESTORED_VERSION',
]);

export const requirementImpactTypeSchema = z.enum([
  'DEPENDENT_REQUIREMENT',
  'PARENT_REQUIREMENT',
  'CHILD_REQUIREMENT',
  'CONSTRAINED_REQUIREMENT',
  'RELATED_REQUIREMENT',
  'CONFLICT_REVIEW',
  'REPOSITORY_EVIDENCE',
  'REPOSITORY_FILE',
  'REPOSITORY_SYMBOL',
]);

export const requirementImpactStatusSchema = z.enum([
  'OPEN',
  'REVIEWED',
  'NOT_IMPACTED',
  'ACTION_REQUIRED',
]);

export const getRequirementHistorySchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
});

export const getRequirementVersionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  versionNumber: z.number().int().min(1, 'Version number must be a positive integer.'),
});

export const compareRequirementVersionsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  sourceVersionNumber: z.number().int().min(1, 'Source version number must be a positive integer.'),
  targetVersionNumber: z.number().int().min(1, 'Target version number must be a positive integer.'),
});

export const updateRequirementVersionedSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  title: z
    .string()
    .trim()
    .min(1, 'Title cannot be empty.')
    .max(255, 'Title must not exceed 255 characters.')
    .optional(),
  originalText: z
    .string()
    .trim()
    .min(1, 'Requirement text cannot be empty.')
    .max(50000, 'Requirement text must not exceed 50,000 characters.')
    .optional(),
  type: requirementTypeSchema.optional(),
  priority: requirementPrioritySchema.optional(),
  status: requirementStatusSchema.optional(),
  expectedVersionNumber: z.number().int().min(1).optional(),
  changeReason: z
    .string()
    .max(1000, 'Change reason cannot exceed 1000 characters.')
    .nullable()
    .optional(),
  actorId: z.string().max(255).nullable().optional(),
});

export const restoreRequirementVersionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  versionNumberToRestore: z
    .number()
    .int()
    .min(1, 'Version number to restore must be a positive integer.'),
  expectedCurrentVersionNumber: z.number().int().min(1).optional(),
  restoreReason: z
    .string()
    .max(1000, 'Restore reason cannot exceed 1000 characters.')
    .nullable()
    .optional(),
  actorId: z.string().max(255).nullable().optional(),
});

export const getRequirementChangeImpactSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  versionNumber: z.number().int().min(1).optional(),
  maxDepth: z.number().int().min(1).max(10).optional().default(3),
});

export const reviewRequirementImpactSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  impactId: z.string().uuid('Impact ID must be a valid UUID.'),
  status: requirementImpactStatusSchema,
  reviewRationale: z
    .string()
    .max(1000, 'Review rationale cannot exceed 1000 characters.')
    .nullable()
    .optional(),
});

// ------------------------------------------------------------------------------
// AI Provider Gateway & LLM Foundation Types (V4 Phase 43)
// ------------------------------------------------------------------------------

export type AiProviderId = 'OPENAI' | 'FAKE' | (string & {});

export type AiMessageRole = 'SYSTEM' | 'USER' | 'ASSISTANT';

export interface AiMessageDto {
  readonly role: AiMessageRole;
  readonly content: string;
}

export interface AiTokenUsageDto {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}

export interface AiGenerationRequestDto {
  readonly requestId?: string;
  readonly providerId: AiProviderId;
  readonly model: string;
  readonly messages: readonly AiMessageDto[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AiGenerationResultDto {
  readonly requestId: string;
  readonly providerId: AiProviderId;
  readonly modelRequested: string;
  readonly modelReported: string | null;
  readonly text: string;
  readonly finishReason: string | null;
  readonly usage: AiTokenUsageDto;
  readonly providerRequestId: string | null;
  readonly durationMs: number;
  readonly retryCount: number;
}

export interface AiProviderCapabilitiesDto {
  readonly textGeneration: boolean;
  readonly systemMessages: boolean;
  readonly tokenUsageReporting: boolean;
  readonly cancellation: boolean;
  readonly embeddings?: boolean;
  readonly maxContextTokens?: number;
  readonly defaultModel: string;
  readonly supportedModels: readonly string[];
  readonly supportedEmbeddingModels?: readonly string[];
}

export type AiProviderHealthStatus =
  'READY' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'AUTHENTICATION_FAILED';

export interface AiProviderStatusDto {
  readonly providerId: AiProviderId;
  readonly configured: boolean;
  readonly status: AiProviderHealthStatus;
  readonly capabilities: AiProviderCapabilitiesDto;
  readonly verifiedAt?: string;
  readonly message?: string;
}

export interface GetAiProviderStatusInput {
  readonly providerId?: AiProviderId;
}

export interface AiHealthCheckInput {
  readonly providerId: AiProviderId;
}

export const aiMessageRoleSchema = z.enum(['SYSTEM', 'USER', 'ASSISTANT']);

export const aiMessageSchema = z.object({
  role: aiMessageRoleSchema,
  content: z
    .string()
    .min(1, 'Message content cannot be empty.')
    .max(100000, 'Message content must not exceed 100,000 characters.'),
});

export const aiGenerationRequestSchema = z.object({
  requestId: z.string().uuid().optional(),
  providerId: z.enum(['OPENAI', 'FAKE']).or(z.string().min(1).max(64)),
  model: z.string().min(1, 'Model name is required.').max(128),
  messages: z
    .array(aiMessageSchema)
    .min(1, 'At least one message is required.')
    .max(100, 'Cannot exceed 100 messages in a single request.'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32768).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const getAiProviderStatusSchema = z.object({
  providerId: z.enum(['OPENAI', 'FAKE']).or(z.string().min(1).max(64)).optional(),
});

export const aiHealthCheckSchema = z.object({
  providerId: z.enum(['OPENAI', 'FAKE']).or(z.string().min(1).max(64)),
});

// ------------------------------------------------------------------------------
// AI Configuration, Prompt Registry & Structured Output (V4 Phase 44)
// ------------------------------------------------------------------------------

export type AiStructuredOutputMode = 'NATIVE_JSON' | 'JSON_PROMPT' | 'AUTO';

export interface AiGenerationConfigDto {
  readonly providerId: AiProviderId;
  readonly model: string;
  readonly temperature: number;
  readonly topP?: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly structuredOutputMode?: AiStructuredOutputMode;
  readonly providerOptions?: Readonly<Record<string, unknown>>;
}

export interface AiConfigSnapshot {
  readonly providerId: AiProviderId;
  readonly model: string;
  readonly temperature: number;
  readonly topP?: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly structuredOutputMode: AiStructuredOutputMode;
}

export interface AiStructuredResultDto<T = unknown> {
  readonly data: T;
  readonly providerId: AiProviderId;
  readonly modelRequested: string;
  readonly modelReported: string | null;
  readonly requestId: string;
  readonly usage: AiTokenUsageDto;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly configSnapshot: AiConfigSnapshot;
  readonly durationMs: number;
  readonly retryCount: number;
  readonly rawText?: string;
}

export interface AiPromptExecutionInputDto {
  readonly promptId: string;
  readonly version?: number;
  readonly input?: unknown;
  readonly configOverride?: Partial<AiGenerationConfigDto>;
  readonly projectId?: string;
}

export const aiStructuredOutputModeSchema = z.enum(['NATIVE_JSON', 'JSON_PROMPT', 'AUTO']);

export const aiGenerationConfigSchema = z.object({
  providerId: z.enum(['OPENAI', 'FAKE']).or(z.string().min(1).max(64)),
  model: z.string().min(1, 'Model name is required.').max(128),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().min(1).max(32768),
  timeoutMs: z.number().int().min(1000).max(300000),
  structuredOutputMode: aiStructuredOutputModeSchema.optional(),
  providerOptions: z.record(z.string(), z.unknown()).optional(),
});

export const aiGenerationConfigOverrideSchema = aiGenerationConfigSchema.partial();

export const aiPromptExecutionInputSchema = z.object({
  promptId: z.string().min(1, 'Prompt ID is required.').max(128),
  version: z.number().int().positive().optional(),
  input: z.unknown(),
  configOverride: aiGenerationConfigOverrideSchema.optional(),
  projectId: z.string().uuid().optional(),
});

// ------------------------------------------------------------------------------
// Embedding & Vector Retrieval Foundation (V4 Phase 45)
// ------------------------------------------------------------------------------

export type VectorSubjectType =
  'REQUIREMENT' | 'REQUIREMENT_VERSION' | 'DOCUMENT_SECTION' | 'REPOSITORY_ENTITY';

export type VectorEmbeddingStatus = 'CURRENT' | 'STALE' | 'INVALIDATED';

export interface EmbeddingProfileDto {
  readonly providerId: AiProviderId;
  readonly model: string;
  readonly dimensions: number;
  readonly canonicalizationVersion: number;
}

export interface AiEmbeddingRequestDto {
  readonly inputs: readonly string[];
  readonly providerId?: AiProviderId;
  readonly model?: string;
  readonly dimensions?: number;
  readonly requestId?: string;
  readonly timeoutMs?: number;
}

export interface AiEmbeddingResultDto {
  readonly embeddings: readonly (readonly number[])[];
  readonly providerId: AiProviderId;
  readonly modelRequested: string;
  readonly modelReported: string;
  readonly dimensions: number;
  readonly usage: AiTokenUsageDto;
  readonly durationMs: number;
  readonly requestId: string;
}

export interface VectorRecordDto {
  readonly id: string;
  readonly projectId: string;
  readonly subjectType: VectorSubjectType;
  readonly subjectId: string;
  readonly sourceVersionId?: string | null;
  readonly providerId: string;
  readonly model: string;
  readonly dimensions: number;
  readonly canonicalizationVersion: number;
  readonly inputSha256: string;
  readonly status: VectorEmbeddingStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly staleAt?: string | null;
}

export interface VectorSearchQueryDto {
  readonly projectId: string;
  readonly queryText?: string;
  readonly queryVector?: readonly number[];
  readonly subjectTypes?: readonly VectorSubjectType[];
  readonly topK?: number;
  readonly minimumSimilarity?: number;
  readonly embeddingProfile?: Partial<EmbeddingProfileDto>;
}

export interface VectorMatchDto {
  readonly subjectId: string;
  readonly subjectType: VectorSubjectType;
  readonly similarity: number;
  readonly distance: number;
  readonly embeddingId: string;
  readonly sourceVersionId?: string | null;
  readonly inputSha256: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface EmbeddingIndexStatusDto {
  readonly projectId: string;
  readonly providerId: AiProviderId;
  readonly model: string;
  readonly dimensions: number;
  readonly totalIndexed: number;
  readonly totalStale: number;
  readonly totalFailed: number;
  readonly lastIndexedAt?: string | null;
}

export interface IndexSubjectsInputDto {
  readonly projectId: string;
  readonly subjectType: VectorSubjectType;
  readonly subjectIds?: readonly string[];
  readonly forceReindex?: boolean;
}

export interface IndexSubjectsResultDto {
  readonly projectId: string;
  readonly totalProcessed: number;
  readonly succeededCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly durationMs: number;
}

export const aiTokenUsageSchema = z.object({
  inputTokens: z.number().int().nullable().optional(),
  outputTokens: z.number().int().nullable().optional(),
  totalTokens: z.number().int().nullable().optional(),
});

export const vectorSubjectTypeSchema = z.enum([
  'REQUIREMENT',
  'REQUIREMENT_VERSION',
  'DOCUMENT_SECTION',
  'REPOSITORY_ENTITY',
]);

export const vectorEmbeddingStatusSchema = z.enum(['CURRENT', 'STALE', 'INVALIDATED']);

export const embeddingProfileSchema = z.object({
  providerId: z.enum(['OPENAI', 'FAKE']).or(z.string().min(1).max(64)),
  model: z.string().min(1).max(128),
  dimensions: z.number().int().min(1).max(16384),
  canonicalizationVersion: z.number().int().min(1).max(100),
});

export const aiEmbeddingRequestSchema = z.object({
  inputs: z
    .array(
      z
        .string()
        .min(1, 'Input item cannot be empty.')
        .max(32000, 'Input item exceeds 32,000 characters.'),
    )
    .min(1, 'At least one input string is required.')
    .max(100, 'Batch size cannot exceed 100 inputs.'),
  providerId: z.enum(['OPENAI', 'FAKE']).or(z.string().min(1).max(64)).optional(),
  model: z.string().min(1).max(128).optional(),
  dimensions: z.number().int().min(1).max(16384).optional(),
  requestId: z.string().uuid().optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
});

export const vectorSearchQuerySchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  queryText: z.string().min(1).max(10000).optional(),
  queryVector: z
    .array(z.number().refine(n => Number.isFinite(n), 'Vector values must be finite numbers.'))
    .optional(),
  subjectTypes: z.array(vectorSubjectTypeSchema).optional(),
  topK: z.number().int().min(1).max(100).optional(),
  minimumSimilarity: z.number().min(0).max(1).optional(),
  embeddingProfile: embeddingProfileSchema.partial().optional(),
});

export const indexSubjectsInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  subjectType: vectorSubjectTypeSchema,
  subjectIds: z.array(z.string().uuid()).optional(),
  forceReindex: z.boolean().optional(),
});

export const getEmbeddingIndexStatusInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});

export const reindexStaleInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});

// ------------------------------------------------------------------------------
// RAG & Requirement Context Retrieval Foundation (V4 Phase 46)
// ------------------------------------------------------------------------------

export type RequirementContextPurpose =
  | 'GENERAL_REQUIREMENT_REASONING'
  | 'TEST_DESIGN'
  | 'TEST_GENERATION'
  | 'QUALITY_REVIEW'
  | 'TRACEABILITY';

export type RagContextSourceType =
  | 'REQUIREMENT'
  | 'REQUIREMENT_SOURCE'
  | 'DOCUMENT_SECTION'
  | 'DOCUMENT_BLOCK'
  | 'STRUCTURED_REQUIREMENT'
  | 'CLASSIFICATION'
  | 'QUALITY_FINDING'
  | 'RELATIONSHIP'
  | 'RELATED_REQUIREMENT'
  | 'REPOSITORY_EVIDENCE';

export type RagAuthorityTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface RagContextItemDto {
  readonly id: string;
  readonly sourceType: RagContextSourceType;
  readonly sourceId: string;
  readonly authorityTier: number;
  readonly title?: string;
  readonly text: string;
  readonly relevance: {
    readonly rank: number;
    readonly similarityScore?: number;
    readonly distance?: number;
    readonly reasonCodes: readonly string[];
  };
  readonly provenance: {
    readonly projectId: string;
    readonly requirementId?: string;
    readonly requirementKey?: string;
    readonly versionNumber?: number;
    readonly documentId?: string;
    readonly documentFileName?: string;
    readonly sectionId?: string;
    readonly blockId?: string;
    readonly relationshipId?: string;
    readonly relationshipType?: string;
    readonly repositorySnapshotId?: string;
    readonly repositoryPath?: string;
    readonly symbolId?: string;
  };
  readonly state: {
    readonly stale: boolean;
    readonly confirmed?: boolean;
    readonly isUntrustedContext: boolean;
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RagContextBudgetDto {
  readonly maxItems: number;
  readonly includedItems: number;
  readonly maxCharacters: number;
  readonly includedCharacters: number;
  readonly estimatedTokens: number;
  readonly truncated: boolean;
  readonly truncationReason?: string | null;
}

export interface RagRetrievalDiagnosticsDto {
  readonly candidateCount: number;
  readonly filteredCount: number;
  readonly deduplicatedCount: number;
  readonly sourcesConsulted: readonly string[];
  readonly warnings: readonly string[];
  readonly durationMs: number;
  readonly vectorSearchDurationMs?: number;
}

export interface RequirementContextPackDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementVersion: number;
  readonly purpose: RequirementContextPurpose;
  readonly retrieval: {
    readonly strategy: string;
    readonly strategyVersion: string;
    readonly retrievedAt: string;
    readonly embeddingModel?: string;
    readonly embeddingDimensions?: number;
  };
  readonly primaryRequirement: {
    readonly id: string;
    readonly requirementKey: string;
    readonly title: string;
    readonly originalText: string;
    readonly type?: string;
    readonly priority?: string;
    readonly status: string;
    readonly versionNumber: number;
  };
  readonly items: readonly RagContextItemDto[];
  readonly budget: RagContextBudgetDto;
  readonly diagnostics: RagRetrievalDiagnosticsDto;
}

export interface RagRetrievalLimitsDto {
  readonly maxItems?: number;
  readonly maxCharacters?: number;
  readonly maxEstimatedTokens?: number;
  readonly maxRelatedRequirements?: number;
  readonly maxDocumentItems?: number;
  readonly maxRepositoryItems?: number;
  readonly maxRelationshipDepth?: number;
  readonly minimumSimilarity?: number;
  readonly includeStale?: boolean;
}

export interface RetrieveRequirementContextInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly purpose?: RequirementContextPurpose;
  readonly limits?: RagRetrievalLimitsDto;
}

export interface RagRetrievalConfigDto {
  readonly defaultStrategy: string;
  readonly defaultStrategyVersion: string;
  readonly defaultPurpose: RequirementContextPurpose;
  readonly defaultLimits: Required<RagRetrievalLimitsDto>;
}

export const requirementContextPurposeSchema = z.enum([
  'GENERAL_REQUIREMENT_REASONING',
  'TEST_DESIGN',
  'TEST_GENERATION',
  'QUALITY_REVIEW',
  'TRACEABILITY',
]);

export const ragContextSourceTypeSchema = z.enum([
  'REQUIREMENT',
  'REQUIREMENT_SOURCE',
  'DOCUMENT_SECTION',
  'DOCUMENT_BLOCK',
  'STRUCTURED_REQUIREMENT',
  'CLASSIFICATION',
  'QUALITY_FINDING',
  'RELATIONSHIP',
  'RELATED_REQUIREMENT',
  'REPOSITORY_EVIDENCE',
]);

export const ragRetrievalLimitsSchema = z.object({
  maxItems: z.number().int().min(1).max(100).optional(),
  maxCharacters: z.number().int().min(100).max(200000).optional(),
  maxEstimatedTokens: z.number().int().min(50).max(50000).optional(),
  maxRelatedRequirements: z.number().int().min(0).max(20).optional(),
  maxDocumentItems: z.number().int().min(0).max(20).optional(),
  maxRepositoryItems: z.number().int().min(0).max(20).optional(),
  maxRelationshipDepth: z.number().int().min(1).max(3).optional(),
  minimumSimilarity: z.number().min(0).max(1).optional(),
  includeStale: z.boolean().optional(),
});

export const retrieveRequirementContextInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  purpose: requirementContextPurposeSchema.optional(),
  limits: ragRetrievalLimitsSchema.optional(),
});

// ------------------------------------------------------------------------------
// LLM Requirement Analysis & Reasoning Foundation (V4 Phase 47)
// ------------------------------------------------------------------------------

export type AiAnalysisStatus = 'CURRENT' | 'STALE' | 'FAILED';

export type EvidenceSupportType =
  | 'DIRECT_REQUIREMENT'
  | 'SOURCE_PROVENANCE'
  | 'RELATED_REQUIREMENT'
  | 'DOCUMENT_CONTEXT'
  | 'REPOSITORY_EVIDENCE'
  | 'INFERENCE'
  | 'UNSUPPORTED';

export type GroundingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface GroundingCitationDto {
  readonly claimKey: string;
  readonly supportType: EvidenceSupportType;
  readonly evidenceId?: string | null;
  readonly citationText?: string | null;
  readonly confidence: GroundingConfidence;
}

export interface QuantitativeConstraintDto {
  readonly value: string;
  readonly unit?: string | null;
  readonly parameter: string;
}

export interface RequirementInterpretationDto {
  readonly summary: string;
  readonly businessIntent?: string | null;
  readonly targetBehavior: string;
  readonly primaryActor?: string | null;
  readonly secondaryActors: readonly string[];
  readonly trigger?: string | null;
  readonly preconditions: readonly string[];
  readonly conditions: readonly string[];
  readonly constraints: readonly string[];
  readonly quantitativeConstraints: readonly QuantitativeConstraintDto[];
  readonly businessRules: readonly string[];
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly expectedOutcome: string;
  readonly exceptionsOrAlternativeBehavior: readonly string[];
  readonly dependencies: readonly string[];
  readonly dataEntities: readonly string[];
  readonly externalSystems: readonly string[];
  readonly securityConsiderations: readonly string[];
  readonly performanceConsiderations: readonly string[];
  readonly complianceConsiderations: readonly string[];
  readonly ambiguities: readonly string[];
  readonly missingInformation: readonly string[];
  readonly unsafeAssumptions: readonly string[];
  readonly clarificationNeeds: readonly string[];
  readonly hasNegation: boolean;
  readonly modality: string;
  readonly citations: readonly GroundingCitationDto[];
  readonly confidence: GroundingConfidence;
}

export interface GroundingSummaryDto {
  readonly totalClaims: number;
  readonly groundedClaims: number;
  readonly unsupportedClaims: number;
  readonly validCitations: number;
  readonly invalidCitations: number;
}

export interface RequirementAiAnalysisDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementVersionId?: string | null;
  readonly requirementVersionNumber: number;
  readonly status: AiAnalysisStatus;
  readonly providerId: string;
  readonly model: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly schemaVersion: number;
  readonly inputSha256: string;
  readonly contextSha256: string;
  readonly structuredAnalysis: RequirementInterpretationDto;
  readonly groundingSummary: GroundingSummaryDto;
  readonly usage: AiTokenUsageDto;
  readonly durationMs: number;
  readonly errorMessage?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly staleAt?: string | null;
}

export interface AnalyzeRequirementInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly forceRegenerate?: boolean;
  readonly configOverride?: Partial<AiGenerationConfigDto>;
}

export interface GetRequirementAnalysisInputDto {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface GetRequirementAnalysisHistoryInputDto {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface RegenerateRequirementAnalysisInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly configOverride?: Partial<AiGenerationConfigDto>;
}

export const aiAnalysisStatusSchema = z.enum(['CURRENT', 'STALE', 'FAILED']);

export const evidenceSupportTypeSchema = z.enum([
  'DIRECT_REQUIREMENT',
  'SOURCE_PROVENANCE',
  'RELATED_REQUIREMENT',
  'DOCUMENT_CONTEXT',
  'REPOSITORY_EVIDENCE',
  'INFERENCE',
  'UNSUPPORTED',
]);

export const groundingConfidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const groundingCitationSchema = z.object({
  claimKey: z.string().min(1).max(128),
  supportType: evidenceSupportTypeSchema,
  evidenceId: z.string().min(1).max(128).nullable().optional(),
  citationText: z.string().max(2000).nullable().optional(),
  confidence: groundingConfidenceSchema,
});

export const quantitativeConstraintSchema = z.object({
  value: z.string().min(1).max(128),
  unit: z.string().max(64).nullable().optional(),
  parameter: z.string().min(1).max(256),
});

export const requirementInterpretationSchema = z.object({
  summary: z.string().min(1).max(5000),
  businessIntent: z.string().max(5000).nullable().optional(),
  targetBehavior: z.string().min(1).max(5000),
  primaryActor: z.string().max(256).nullable().optional(),
  secondaryActors: z.array(z.string().max(256)).default([]),
  trigger: z.string().max(2000).nullable().optional(),
  preconditions: z.array(z.string().max(2000)).default([]),
  conditions: z.array(z.string().max(2000)).default([]),
  constraints: z.array(z.string().max(2000)).default([]),
  quantitativeConstraints: z.array(quantitativeConstraintSchema).default([]),
  businessRules: z.array(z.string().max(2000)).default([]),
  inputs: z.array(z.string().max(2000)).default([]),
  outputs: z.array(z.string().max(2000)).default([]),
  expectedOutcome: z.string().min(1).max(5000),
  exceptionsOrAlternativeBehavior: z.array(z.string().max(2000)).default([]),
  dependencies: z.array(z.string().max(2000)).default([]),
  dataEntities: z.array(z.string().max(256)).default([]),
  externalSystems: z.array(z.string().max(256)).default([]),
  securityConsiderations: z.array(z.string().max(2000)).default([]),
  performanceConsiderations: z.array(z.string().max(2000)).default([]),
  complianceConsiderations: z.array(z.string().max(2000)).default([]),
  ambiguities: z.array(z.string().max(2000)).default([]),
  missingInformation: z.array(z.string().max(2000)).default([]),
  unsafeAssumptions: z.array(z.string().max(2000)).default([]),
  clarificationNeeds: z.array(z.string().max(2000)).default([]),
  hasNegation: z.boolean(),
  modality: z.string().max(64),
  citations: z.array(groundingCitationSchema).default([]),
  confidence: groundingConfidenceSchema,
});

export const analyzeRequirementInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  forceRegenerate: z.boolean().optional(),
  configOverride: aiGenerationConfigSchema.partial().optional(),
});

export const getRequirementAnalysisInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const getRequirementAnalysisHistoryInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const regenerateRequirementAnalysisInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  configOverride: aiGenerationConfigSchema.partial().optional(),
});

// ------------------------------------------------------------------------------
// Test Design Intelligence Foundation (V4 Phase 48)
// ------------------------------------------------------------------------------

export type TestDesignStatus =
  'CURRENT' | 'STALE' | 'FAILED' | 'REQUIRES_REVIEW' | 'INSUFFICIENT_INFORMATION';

export type TestDesignApplicability =
  | 'APPLICABLE'
  | 'PARTIALLY_APPLICABLE'
  | 'INSUFFICIENT_INFORMATION'
  | 'NOT_TESTABLE'
  | 'REQUIRES_CLARIFICATION';

export type AutomationSuitability = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type TestLevel =
  'UNIT' | 'COMPONENT' | 'INTEGRATION' | 'API' | 'SYSTEM' | 'END_TO_END' | 'ACCEPTANCE';

export type TestDimension =
  | 'FUNCTIONAL'
  | 'NEGATIVE'
  | 'BOUNDARY'
  | 'VALIDATION'
  | 'BUSINESS_RULE'
  | 'SECURITY'
  | 'AUTHORIZATION'
  | 'AUTHENTICATION'
  | 'INPUT_VALIDATION'
  | 'DATA_INTEGRITY'
  | 'STATE_TRANSITION'
  | 'ERROR_HANDLING'
  | 'INTEGRATION'
  | 'API'
  | 'UI'
  | 'DATABASE'
  | 'PERFORMANCE'
  | 'LOAD'
  | 'CONCURRENCY'
  | 'AVAILABILITY'
  | 'RECOVERY'
  | 'COMPATIBILITY'
  | 'ACCESSIBILITY'
  | 'COMPLIANCE'
  | 'USABILITY'
  | 'REGRESSION';

export type TestDesignTechnique =
  | 'EQUIVALENCE_PARTITIONING'
  | 'BOUNDARY_VALUE_ANALYSIS'
  | 'DECISION_TABLE'
  | 'STATE_TRANSITION'
  | 'USE_CASE_TESTING'
  | 'PAIRWISE'
  | 'ERROR_GUESSING'
  | 'NEGATIVE_TESTING'
  | 'INPUT_VALIDATION'
  | 'RULE_BASED_TESTING'
  | 'WORKFLOW_TESTING'
  | 'ROLE_PERMISSION_TESTING'
  | 'DATA_INTEGRITY_TESTING'
  | 'CONCURRENCY_TESTING'
  | 'SECURITY_TESTING'
  | 'PERFORMANCE_TESTING'
  | 'RECOVERY_TESTING';

export type CoverageObjectiveCategory =
  | 'FUNCTIONAL_BEHAVIOR'
  | 'BOUNDARY_LIMITS'
  | 'ERROR_HANDLING'
  | 'SECURITY_AUTHORIZATION'
  | 'DATA_INTEGRITY'
  | 'STATE_LIFECYCLE'
  | 'PERFORMANCE_TIMING'
  | 'INTEGRATION_CONTRACT'
  | 'USER_WORKFLOW'
  | 'ACCESSIBILITY_COMPLIANCE';

export type TestDesignPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSPECIFIED';

export type ConstraintType =
  | 'NUMERIC_RANGE'
  | 'EXPLICIT_ENUMERATION'
  | 'TIME_LIMIT'
  | 'ROLE_PERMISSION'
  | 'STATE_TRANSITION'
  | 'DATA_MUTATION'
  | 'CONCURRENCY'
  | 'SECURITY_POLICY'
  | 'RATE_LIMIT';

export interface TestLevelRecommendationDto {
  readonly level: TestLevel;
  readonly priority: TestDesignPriority;
  readonly rationale: string;
  readonly evidenceRefs: readonly string[];
}

export interface TestDimensionRecommendationDto {
  readonly dimension: TestDimension;
  readonly applicable: boolean;
  readonly priority: TestDesignPriority;
  readonly rationaleCodes: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly confidence: GroundingConfidence;
}

export interface TestTechniqueRecommendationDto {
  readonly technique: TestDesignTechnique;
  readonly priority: TestDesignPriority;
  readonly rationale: string;
  readonly rationaleCodes: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly confidence: GroundingConfidence;
}

export interface CoverageObjectiveDto {
  readonly id: string;
  readonly category: CoverageObjectiveCategory;
  readonly priority: TestDesignPriority;
  readonly description: string;
  readonly rationaleCodes: readonly string[];
  readonly evidenceRefs: readonly string[];
}

export interface TestableConstraintDto {
  readonly id: string;
  readonly constraintType: ConstraintType;
  readonly parameter: string;
  readonly value: string;
  readonly unit?: string | null;
  readonly lowerBound?: string | null;
  readonly upperBound?: string | null;
  readonly isInclusive?: boolean | null;
  readonly evidenceRef?: string | null;
}

export interface TestDesignQuestionDto {
  readonly id: string;
  readonly category: string;
  readonly question: string;
  readonly impact: string;
}

export interface TestRiskFocusDto {
  readonly area: string;
  readonly priority: TestDesignPriority;
  readonly rationale: string;
  readonly evidenceRefs: readonly string[];
}

export interface TestDesignRationaleDto {
  readonly code: string;
  readonly description: string;
  readonly source: 'DETERMINISTIC' | 'AI_INFERENCE' | 'HYBRID';
}

export interface TestDesignSourceReferenceDto {
  readonly id: string;
  readonly sourceType: string;
  readonly title: string;
  readonly authorityTier: number;
}

export interface StructuredTestDesignDto {
  readonly applicability: TestDesignApplicability;
  readonly applicabilityRationale: string;
  readonly automationSuitability: AutomationSuitability;
  readonly automationRationale: string;
  readonly recommendedLevels: readonly TestLevelRecommendationDto[];
  readonly recommendedDimensions: readonly TestDimensionRecommendationDto[];
  readonly recommendedTechniques: readonly TestTechniqueRecommendationDto[];
  readonly coverageObjectives: readonly CoverageObjectiveDto[];
  readonly riskFocusAreas: readonly TestRiskFocusDto[];
  readonly identifiedConstraints: readonly TestableConstraintDto[];
  readonly designQuestions: readonly TestDesignQuestionDto[];
  readonly rationale: readonly TestDesignRationaleDto[];
  readonly sourceContext: readonly TestDesignSourceReferenceDto[];
}

export interface TestDesignPlanDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementVersionId?: string | null;
  readonly requirementVersionNumber: number;
  readonly status: TestDesignStatus;
  readonly applicability: TestDesignApplicability;
  readonly automationSuitability: AutomationSuitability;
  readonly inputFingerprint: string;
  readonly engineVersion: string;
  readonly promptTemplateVersion?: number | null;
  readonly providerId: string;
  readonly model: string;
  readonly structuredDesign: StructuredTestDesignDto;
  readonly usage: AiTokenUsageDto;
  readonly durationMs: number;
  readonly errorMessage?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly staleAt?: string | null;
}

export interface AnalyzeTestDesignInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly forceRegenerate?: boolean;
  readonly configOverride?: Partial<AiGenerationConfigDto>;
}

export interface GetTestDesignInputDto {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface GetTestDesignHistoryInputDto {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface RegenerateTestDesignInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly configOverride?: Partial<AiGenerationConfigDto>;
}

export const testDesignStatusSchema = z.enum([
  'CURRENT',
  'STALE',
  'FAILED',
  'REQUIRES_REVIEW',
  'INSUFFICIENT_INFORMATION',
]);

export const testDesignApplicabilitySchema = z.enum([
  'APPLICABLE',
  'PARTIALLY_APPLICABLE',
  'INSUFFICIENT_INFORMATION',
  'NOT_TESTABLE',
  'REQUIRES_CLARIFICATION',
]);

export const automationSuitabilitySchema = z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']);

export const testLevelSchema = z.enum([
  'UNIT',
  'COMPONENT',
  'INTEGRATION',
  'API',
  'SYSTEM',
  'END_TO_END',
  'ACCEPTANCE',
]);

export const testDimensionSchema = z.enum([
  'FUNCTIONAL',
  'NEGATIVE',
  'BOUNDARY',
  'VALIDATION',
  'BUSINESS_RULE',
  'SECURITY',
  'AUTHORIZATION',
  'AUTHENTICATION',
  'INPUT_VALIDATION',
  'DATA_INTEGRITY',
  'STATE_TRANSITION',
  'ERROR_HANDLING',
  'INTEGRATION',
  'API',
  'UI',
  'DATABASE',
  'PERFORMANCE',
  'LOAD',
  'CONCURRENCY',
  'AVAILABILITY',
  'RECOVERY',
  'COMPATIBILITY',
  'ACCESSIBILITY',
  'COMPLIANCE',
  'USABILITY',
  'REGRESSION',
]);

export const testDesignTechniqueSchema = z.enum([
  'EQUIVALENCE_PARTITIONING',
  'BOUNDARY_VALUE_ANALYSIS',
  'DECISION_TABLE',
  'STATE_TRANSITION',
  'USE_CASE_TESTING',
  'PAIRWISE',
  'ERROR_GUESSING',
  'NEGATIVE_TESTING',
  'INPUT_VALIDATION',
  'RULE_BASED_TESTING',
  'WORKFLOW_TESTING',
  'ROLE_PERMISSION_TESTING',
  'DATA_INTEGRITY_TESTING',
  'CONCURRENCY_TESTING',
  'SECURITY_TESTING',
  'PERFORMANCE_TESTING',
  'RECOVERY_TESTING',
]);

export const coverageObjectiveCategorySchema = z.enum([
  'FUNCTIONAL_BEHAVIOR',
  'BOUNDARY_LIMITS',
  'ERROR_HANDLING',
  'SECURITY_AUTHORIZATION',
  'DATA_INTEGRITY',
  'STATE_LIFECYCLE',
  'PERFORMANCE_TIMING',
  'INTEGRATION_CONTRACT',
  'USER_WORKFLOW',
  'ACCESSIBILITY_COMPLIANCE',
]);

export const testDesignPrioritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNSPECIFIED',
]);

export const constraintTypeSchema = z.enum([
  'NUMERIC_RANGE',
  'EXPLICIT_ENUMERATION',
  'TIME_LIMIT',
  'ROLE_PERMISSION',
  'STATE_TRANSITION',
  'DATA_MUTATION',
  'CONCURRENCY',
  'SECURITY_POLICY',
  'RATE_LIMIT',
]);

export const testLevelRecommendationSchema = z.object({
  level: testLevelSchema,
  priority: testDesignPrioritySchema,
  rationale: z.string().max(2000),
  evidenceRefs: z.array(z.string().max(128)).default([]),
});

export const testDimensionRecommendationSchema = z.object({
  dimension: testDimensionSchema,
  applicable: z.boolean(),
  priority: testDesignPrioritySchema,
  rationaleCodes: z.array(z.string().max(64)).default([]),
  evidenceRefs: z.array(z.string().max(128)).default([]),
  confidence: groundingConfidenceSchema,
});

export const testTechniqueRecommendationSchema = z.object({
  technique: testDesignTechniqueSchema,
  priority: testDesignPrioritySchema,
  rationale: z.string().max(2000),
  rationaleCodes: z.array(z.string().max(64)).default([]),
  evidenceRefs: z.array(z.string().max(128)).default([]),
  confidence: groundingConfidenceSchema,
});

export const coverageObjectiveSchema = z.object({
  id: z.string().min(1).max(64),
  category: coverageObjectiveCategorySchema,
  priority: testDesignPrioritySchema,
  description: z.string().min(1).max(2000),
  rationaleCodes: z.array(z.string().max(64)).default([]),
  evidenceRefs: z.array(z.string().max(128)).default([]),
});

export const testableConstraintSchema = z.object({
  id: z.string().min(1).max(64),
  constraintType: constraintTypeSchema,
  parameter: z.string().min(1).max(256),
  value: z.string().min(1).max(256),
  unit: z.string().max(64).nullable().optional(),
  lowerBound: z.string().max(128).nullable().optional(),
  upperBound: z.string().max(128).nullable().optional(),
  isInclusive: z.boolean().nullable().optional(),
  evidenceRef: z.string().max(128).nullable().optional(),
});

export const testDesignQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  category: z.string().max(128),
  question: z.string().min(1).max(2000),
  impact: z.string().max(2000),
});

export const testRiskFocusSchema = z.object({
  area: z.string().min(1).max(256),
  priority: testDesignPrioritySchema,
  rationale: z.string().max(2000),
  evidenceRefs: z.array(z.string().max(128)).default([]),
});

export const testDesignRationaleSchema = z.object({
  code: z.string().min(1).max(64),
  description: z.string().max(2000),
  source: z.enum(['DETERMINISTIC', 'AI_INFERENCE', 'HYBRID']),
});

export const testDesignSourceReferenceSchema = z.object({
  id: z.string().min(1).max(128),
  sourceType: z.string().max(64),
  title: z.string().max(256),
  authorityTier: z.number().int().min(1).max(10),
});

export const structuredTestDesignSchema = z.object({
  applicability: testDesignApplicabilitySchema,
  applicabilityRationale: z.string().max(2000),
  automationSuitability: automationSuitabilitySchema,
  automationRationale: z.string().max(2000),
  recommendedLevels: z.array(testLevelRecommendationSchema).default([]),
  recommendedDimensions: z.array(testDimensionRecommendationSchema).default([]),
  recommendedTechniques: z.array(testTechniqueRecommendationSchema).default([]),
  coverageObjectives: z.array(coverageObjectiveSchema).default([]),
  riskFocusAreas: z.array(testRiskFocusSchema).default([]),
  identifiedConstraints: z.array(testableConstraintSchema).default([]),
  designQuestions: z.array(testDesignQuestionSchema).default([]),
  rationale: z.array(testDesignRationaleSchema).default([]),
  sourceContext: z.array(testDesignSourceReferenceSchema).default([]),
});

export const analyzeTestDesignInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  forceRegenerate: z.boolean().optional(),
  configOverride: aiGenerationConfigSchema.partial().optional(),
});

export const getTestDesignInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const getTestDesignHistoryInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const regenerateTestDesignInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  configOverride: aiGenerationConfigSchema.partial().optional(),
});

// ==============================================================================
// V4 Phase 49: Requirement-to-Test Scenario Generation DTOs & Contracts
// ==============================================================================

export type ScenarioGenerationStatus =
  'GENERATED' | 'NO_SCENARIOS' | 'INSUFFICIENT_INFORMATION' | 'FAILED' | 'STALE';

export interface GeneratedTestScenarioDto {
  readonly id?: string;
  readonly scenarioKey?: string | null;
  readonly title: string;
  readonly objective: string;
  readonly rationale: string;
  readonly requirementAspect: string;
  readonly testLevel?: string | null;
  readonly testIntent?: string | null;
  readonly applicability?: string | null;
  readonly assumptions: readonly string[];
  readonly sourceEvidenceRefs: readonly string[];
}

export interface ScenarioGenerationWarningDto {
  readonly code: string;
  readonly message: string;
  readonly scenarioKey?: string | null;
}

export interface StructuredScenarioGenerationOutputDto {
  readonly scenarios: readonly GeneratedTestScenarioDto[];
  readonly assumptions?: readonly string[];
  readonly warnings?: readonly ScenarioGenerationWarningDto[];
}

export interface RequirementScenarioGenerationDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementVersionId?: string | null;
  readonly requirementVersionNumber: number;
  readonly status: ScenarioGenerationStatus;
  readonly inputFingerprint: string;
  readonly providerId: string;
  readonly model: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly scenarioCount: number;
  readonly scenarios: readonly GeneratedTestScenarioDto[];
  readonly warnings: readonly ScenarioGenerationWarningDto[];
  readonly usage: AiTokenUsageDto;
  readonly durationMs: number;
  readonly errorMessage?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly staleAt?: string | null;
}

export interface GenerateScenariosInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly forceRegenerate?: boolean;
  readonly configOverride?: Partial<AiGenerationConfigDto>;
}

export interface GetRequirementScenariosInputDto {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface GetRequirementScenariosHistoryInputDto {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface RegenerateRequirementScenariosInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly configOverride?: Partial<AiGenerationConfigDto>;
}

export const scenarioGenerationStatusSchema = z.enum([
  'GENERATED',
  'NO_SCENARIOS',
  'INSUFFICIENT_INFORMATION',
  'FAILED',
  'STALE',
]);

export const generatedTestScenarioSchema = z.object({
  id: z.string().uuid().optional(),
  scenarioKey: z.string().max(64).nullable().optional(),
  title: z.string().min(1).max(255),
  objective: z.string().min(1).max(2000),
  rationale: z.string().min(1).max(2000),
  requirementAspect: z.string().min(1).max(2000),
  testLevel: z.string().max(64).nullable().optional(),
  testIntent: z.string().max(64).nullable().optional(),
  applicability: z.string().max(64).nullable().optional(),
  assumptions: z.array(z.string().max(1000)).default([]),
  sourceEvidenceRefs: z.array(z.string().max(128)).default([]),
});

export const scenarioGenerationWarningSchema = z.object({
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
  scenarioKey: z.string().max(64).nullable().optional(),
});

export const structuredScenarioGenerationOutputSchema = z.object({
  scenarios: z.array(generatedTestScenarioSchema).default([]),
  assumptions: z.array(z.string().max(1000)).default([]),
  warnings: z.array(scenarioGenerationWarningSchema).default([]),
});

export const requirementScenarioGenerationDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
  requirementKey: z.string().min(1),
  requirementVersionId: z.string().uuid().nullable().optional(),
  requirementVersionNumber: z.number().int().min(1),
  status: scenarioGenerationStatusSchema,
  inputFingerprint: z.string().min(1).max(64),
  providerId: z.string().min(1).max(64),
  model: z.string().min(1).max(128),
  promptId: z.string().min(1).max(64),
  promptVersion: z.number().int().min(1),
  scenarioCount: z.number().int().nonnegative(),
  scenarios: z.array(generatedTestScenarioSchema),
  warnings: z.array(scenarioGenerationWarningSchema),
  usage: aiTokenUsageSchema,
  durationMs: z.number().int().nonnegative(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  staleAt: z.string().datetime().nullable().optional(),
});

export const generateScenariosInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  forceRegenerate: z.boolean().optional(),
  configOverride: aiGenerationConfigSchema.partial().optional(),
});

export const getRequirementScenariosInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const getRequirementScenariosHistoryInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
});

export const regenerateRequirementScenariosInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  configOverride: aiGenerationConfigSchema.partial().optional(),
});

// ==============================================================================
// V4 Phase 50: Positive, Negative, Boundary & Validation Test Generation DTOs
// ==============================================================================

export type TestDesignCategory = 'POSITIVE' | 'NEGATIVE' | 'BOUNDARY' | 'VALIDATION';

export type CategoryApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'EVIDENCE_INSUFFICIENT';

export type BoundaryKind =
  | 'BELOW_MINIMUM'
  | 'AT_MINIMUM'
  | 'JUST_ABOVE_MINIMUM'
  | 'JUST_BELOW_MAXIMUM'
  | 'AT_MAXIMUM'
  | 'ABOVE_MAXIMUM';

export interface BoundaryIntentDto {
  readonly kind: BoundaryKind;
  readonly parameter?: string | null;
  readonly boundaryValue?: string | null;
  readonly lowerBound?: string | null;
  readonly upperBound?: string | null;
  readonly isInclusive?: boolean | null;
  readonly unit?: string | null;
}

export interface ValidationIntentDto {
  readonly rule?: string | null;
  readonly violation?: string | null;
  readonly fieldName?: string | null;
  readonly condition?: string | null;
}

export interface CategorizedTestDesignDto {
  readonly id: string;
  readonly scenarioId?: string | null;
  readonly scenarioKey?: string | null;
  readonly requirementId: string;
  readonly requirementVersionNumber: number;
  readonly category: TestDesignCategory;
  readonly title: string;
  readonly objective: string;
  readonly rationale: string;
  readonly boundaryIntent?: BoundaryIntentDto | null;
  readonly validationIntent?: ValidationIntentDto | null;
  readonly confidence: GroundingConfidence;
  readonly sourceEvidenceRefs: readonly string[];
}

export interface CategoryAssessmentDto {
  readonly category: TestDesignCategory;
  readonly applicability: CategoryApplicability;
  readonly rationale: string;
  readonly testCount: number;
}

export interface TestCategoryMetricsDto {
  readonly totalGenerated: number;
  readonly positiveCount: number;
  readonly negativeCount: number;
  readonly boundaryCount: number;
  readonly validationCount: number;
  readonly notApplicableCategories: readonly TestDesignCategory[];
}

export interface CategorizedTestGenerationResultDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementVersionNumber: number;
  readonly generationId?: string | null;
  readonly inputFingerprint: string;
  readonly providerId: string;
  readonly model: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly categoryAssessments: readonly CategoryAssessmentDto[];
  readonly testDesigns: readonly CategorizedTestDesignDto[];
  readonly metrics: TestCategoryMetricsDto;
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
  readonly usage: AiTokenUsageDto;
  readonly durationMs: number;
  readonly createdAt: string;
}

export interface GenerateCategorizedTestsInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly scenarioId?: string;
  readonly forceRegenerate?: boolean;
  readonly configOverride?: Partial<AiGenerationConfigDto>;
}

export interface GetCategorizedTestsInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly scenarioId?: string;
}

export const testDesignCategorySchema = z.enum(['POSITIVE', 'NEGATIVE', 'BOUNDARY', 'VALIDATION']);

export const categoryApplicabilitySchema = z.enum([
  'APPLICABLE',
  'NOT_APPLICABLE',
  'EVIDENCE_INSUFFICIENT',
]);

export const boundaryKindSchema = z.enum([
  'BELOW_MINIMUM',
  'AT_MINIMUM',
  'JUST_ABOVE_MINIMUM',
  'JUST_BELOW_MAXIMUM',
  'AT_MAXIMUM',
  'ABOVE_MAXIMUM',
]);

export const boundaryIntentSchema = z.object({
  kind: boundaryKindSchema,
  parameter: z.string().max(256).nullable().optional(),
  boundaryValue: z.string().max(256).nullable().optional(),
  lowerBound: z.string().max(128).nullable().optional(),
  upperBound: z.string().max(128).nullable().optional(),
  isInclusive: z.boolean().nullable().optional(),
  unit: z.string().max(64).nullable().optional(),
});

export const validationIntentSchema = z.object({
  rule: z.string().max(1000).nullable().optional(),
  violation: z.string().max(1000).nullable().optional(),
  fieldName: z.string().max(256).nullable().optional(),
  condition: z.string().max(1000).nullable().optional(),
});

export const categorizedTestDesignSchema = z.object({
  id: z.string().uuid(),
  scenarioId: z.string().uuid().nullable().optional(),
  scenarioKey: z.string().max(64).nullable().optional(),
  requirementId: z.string().uuid(),
  requirementVersionNumber: z.number().int().min(1),
  category: testDesignCategorySchema,
  title: z.string().min(1).max(255),
  objective: z.string().min(1).max(2000),
  rationale: z.string().min(1).max(2000),
  boundaryIntent: boundaryIntentSchema.nullable().optional(),
  validationIntent: validationIntentSchema.nullable().optional(),
  confidence: groundingConfidenceSchema,
  sourceEvidenceRefs: z.array(z.string().max(128)).default([]),
});

export const categoryAssessmentSchema = z.object({
  category: testDesignCategorySchema,
  applicability: categoryApplicabilitySchema,
  rationale: z.string().max(2000),
  testCount: z.number().int().nonnegative(),
});

export const testCategoryMetricsSchema = z.object({
  totalGenerated: z.number().int().nonnegative(),
  positiveCount: z.number().int().nonnegative(),
  negativeCount: z.number().int().nonnegative(),
  boundaryCount: z.number().int().nonnegative(),
  validationCount: z.number().int().nonnegative(),
  notApplicableCategories: z.array(testDesignCategorySchema).default([]),
});

export const categorizedTestGenerationResultSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
  requirementKey: z.string().min(1).max(64),
  requirementVersionNumber: z.number().int().min(1),
  generationId: z.string().uuid().nullable().optional(),
  inputFingerprint: z.string().min(1).max(64),
  providerId: z.string().min(1).max(64),
  model: z.string().min(1).max(128),
  promptId: z.string().min(1).max(64),
  promptVersion: z.number().int().min(1),
  categoryAssessments: z.array(categoryAssessmentSchema),
  testDesigns: z.array(categorizedTestDesignSchema),
  metrics: testCategoryMetricsSchema,
  warnings: z.array(z.object({ code: z.string(), message: z.string() })).default([]),
  usage: aiTokenUsageSchema,
  durationMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const generateCategorizedTestsInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  scenarioId: z.string().uuid('Scenario ID must be a valid UUID.').optional(),
  forceRegenerate: z.boolean().optional(),
  configOverride: aiGenerationConfigSchema.partial().optional(),
});

export const getCategorizedTestsInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  scenarioId: z.string().uuid('Scenario ID must be a valid UUID.').optional(),
});

// ==============================================================================
// V4 Phase 51: Preconditions, Test Data & Expected Result Generation DTOs
// ==============================================================================

export type PreconditionCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'APPLICATION_STATE'
  | 'DATA_STATE'
  | 'ACCOUNT_STATE'
  | 'RESOURCE_STATE'
  | 'CONFIGURATION'
  | 'FEATURE_FLAG'
  | 'ENVIRONMENT'
  | 'DEPENDENCY'
  | 'SESSION_STATE'
  | 'WORKFLOW_STATE'
  | 'NONE'
  | 'OTHER';

export type TestDataDataType =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'ENUM'
  | 'ENTITY'
  | 'CREDENTIAL'
  | 'FILE'
  | 'OTHER';

export type TestDataOrigin = 'EXPLICIT' | 'DERIVED' | 'EXAMPLE' | 'GENERATED' | 'UNKNOWN';

export type ExpectedResultCategory =
  | 'SUCCESS'
  | 'VALIDATION_ERROR'
  | 'AUTHORIZATION_DENIED'
  | 'AUTHENTICATION_REQUIRED'
  | 'STATE_CHANGE'
  | 'NO_STATE_CHANGE'
  | 'VALUE_RETURNED'
  | 'ENTITY_CREATED'
  | 'ENTITY_UPDATED'
  | 'ENTITY_DELETED'
  | 'NAVIGATION'
  | 'MESSAGE_DISPLAYED'
  | 'REQUEST_REJECTED'
  | 'BOUNDARY_ACCEPTED'
  | 'BOUNDARY_REJECTED'
  | 'OTHER'
  | 'UNKNOWN';

export interface GeneratedPreconditionDto {
  readonly id: string;
  readonly key: string;
  readonly category: PreconditionCategory;
  readonly description: string;
  readonly confidence: GroundingConfidence;
  readonly sourceEvidenceRefs: readonly string[];
  readonly reviewRequired: boolean;
  readonly assumptions: readonly string[];
}

export interface GeneratedTestDataItemDto {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly dataType: TestDataDataType;
  readonly origin: TestDataOrigin;
  readonly value?: string | number | boolean | null;
  readonly generator?: string | null;
  readonly constraint?: string | null;
  readonly isSensitive: boolean;
  readonly unknownReason?: string | null;
  readonly confidence: GroundingConfidence;
  readonly sourceEvidenceRefs: readonly string[];
  readonly reviewRequired: boolean;
}

export interface GeneratedExpectedResultDto {
  readonly id: string;
  readonly key: string;
  readonly category: ExpectedResultCategory;
  readonly description: string;
  readonly observable: boolean;
  readonly stateChange?: {
    readonly from?: string | null;
    readonly to?: string | null;
    readonly entity?: string | null;
  } | null;
  readonly nonChange?: {
    readonly entity?: string | null;
    readonly preservedState?: string | null;
  } | null;
  readonly exactMessageExpected?: string | null;
  readonly httpStatusExpected?: number | null;
  readonly confidence: GroundingConfidence;
  readonly sourceEvidenceRefs: readonly string[];
  readonly reviewRequired: boolean;
}

export interface GeneratedTestSpecificationDto {
  readonly id: string;
  readonly scenarioId?: string | null;
  readonly scenarioKey?: string | null;
  readonly testDesignId?: string | null;
  readonly title: string;
  readonly category: TestDesignCategory;
  readonly preconditions: readonly GeneratedPreconditionDto[];
  readonly testData: readonly GeneratedTestDataItemDto[];
  readonly expectedResults: readonly GeneratedExpectedResultDto[];
  readonly assumptions: readonly string[];
  readonly unknowns: readonly {
    readonly name: string;
    readonly reason: string;
    readonly reviewRequired: boolean;
  }[];
  readonly confidence: GroundingConfidence;
  readonly reviewRequired: boolean;
  readonly reviewReasons: readonly string[];
  readonly sourceEvidenceRefs: readonly string[];
}

export interface TestSpecificationEnrichmentMetricsDto {
  readonly totalSpecifications: number;
  readonly totalPreconditions: number;
  readonly totalTestDataItems: number;
  readonly totalExpectedResults: number;
  readonly reviewRequiredCount: number;
  readonly unknownCount: number;
}

export interface TestSpecificationEnrichmentResultDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementVersionNumber: number;
  readonly scenarioId?: string | null;
  readonly inputFingerprint: string;
  readonly providerId: string;
  readonly model: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly specifications: readonly GeneratedTestSpecificationDto[];
  readonly metrics: TestSpecificationEnrichmentMetricsDto;
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
  readonly usage: AiTokenUsageDto;
  readonly durationMs: number;
  readonly createdAt: string;
}

export interface EnrichTestSpecificationInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly scenarioId?: string;
  readonly testDesignId?: string;
  readonly forceRegenerate?: boolean;
  readonly configOverride?: Partial<AiGenerationConfigDto>;
}

export interface GetEnrichedTestSpecificationsInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly scenarioId?: string;
}

export const preconditionCategorySchema = z.enum([
  'AUTHENTICATION',
  'AUTHORIZATION',
  'APPLICATION_STATE',
  'DATA_STATE',
  'ACCOUNT_STATE',
  'RESOURCE_STATE',
  'CONFIGURATION',
  'FEATURE_FLAG',
  'ENVIRONMENT',
  'DEPENDENCY',
  'SESSION_STATE',
  'WORKFLOW_STATE',
  'NONE',
  'OTHER',
]);

export const testDataDataTypeSchema = z.enum([
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'ENUM',
  'ENTITY',
  'CREDENTIAL',
  'FILE',
  'OTHER',
]);

export const testDataOriginSchema = z.enum([
  'EXPLICIT',
  'DERIVED',
  'EXAMPLE',
  'GENERATED',
  'UNKNOWN',
]);

export const expectedResultCategorySchema = z.enum([
  'SUCCESS',
  'VALIDATION_ERROR',
  'AUTHORIZATION_DENIED',
  'AUTHENTICATION_REQUIRED',
  'STATE_CHANGE',
  'NO_STATE_CHANGE',
  'VALUE_RETURNED',
  'ENTITY_CREATED',
  'ENTITY_UPDATED',
  'ENTITY_DELETED',
  'NAVIGATION',
  'MESSAGE_DISPLAYED',
  'REQUEST_REJECTED',
  'BOUNDARY_ACCEPTED',
  'BOUNDARY_REJECTED',
  'OTHER',
  'UNKNOWN',
]);

export const generatedPreconditionSchema = z.object({
  id: z.string().uuid(),
  key: z.string().max(64),
  category: preconditionCategorySchema,
  description: z.string().min(1).max(2000),
  confidence: groundingConfidenceSchema,
  sourceEvidenceRefs: z.array(z.string().max(128)).default([]),
  reviewRequired: z.boolean().default(false),
  assumptions: z.array(z.string().max(1000)).default([]),
});

export const generatedTestDataItemSchema = z.object({
  id: z.string().uuid(),
  key: z.string().max(64),
  name: z.string().min(1).max(256),
  dataType: testDataDataTypeSchema,
  origin: testDataOriginSchema,
  value: z.union([z.string(), z.number(), z.boolean()]).nullable().optional(),
  generator: z.string().max(512).nullable().optional(),
  constraint: z.string().max(1000).nullable().optional(),
  isSensitive: z.boolean().default(false),
  unknownReason: z.string().max(1000).nullable().optional(),
  confidence: groundingConfidenceSchema,
  sourceEvidenceRefs: z.array(z.string().max(128)).default([]),
  reviewRequired: z.boolean().default(false),
});

export const stateChangeDetailSchema = z.object({
  from: z.string().max(256).nullable().optional(),
  to: z.string().max(256).nullable().optional(),
  entity: z.string().max(256).nullable().optional(),
});

export const nonChangeDetailSchema = z.object({
  entity: z.string().max(256).nullable().optional(),
  preservedState: z.string().max(256).nullable().optional(),
});

export const generatedExpectedResultSchema = z.object({
  id: z.string().uuid(),
  key: z.string().max(64),
  category: expectedResultCategorySchema,
  description: z.string().min(1).max(2000),
  observable: z.boolean().default(true),
  stateChange: stateChangeDetailSchema.nullable().optional(),
  nonChange: nonChangeDetailSchema.nullable().optional(),
  exactMessageExpected: z.string().max(1000).nullable().optional(),
  httpStatusExpected: z.number().int().min(100).max(599).nullable().optional(),
  confidence: groundingConfidenceSchema,
  sourceEvidenceRefs: z.array(z.string().max(128)).default([]),
  reviewRequired: z.boolean().default(false),
});

export const generatedTestSpecificationSchema = z.object({
  id: z.string().uuid(),
  scenarioId: z.string().uuid().nullable().optional(),
  scenarioKey: z.string().max(64).nullable().optional(),
  testDesignId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(255),
  category: testDesignCategorySchema,
  preconditions: z.array(generatedPreconditionSchema),
  testData: z.array(generatedTestDataItemSchema),
  expectedResults: z.array(generatedExpectedResultSchema),
  assumptions: z.array(z.string().max(1000)).default([]),
  unknowns: z
    .array(
      z.object({
        name: z.string().max(256),
        reason: z.string().max(1000),
        reviewRequired: z.boolean().default(true),
      }),
    )
    .default([]),
  confidence: groundingConfidenceSchema,
  reviewRequired: z.boolean().default(false),
  reviewReasons: z.array(z.string().max(1000)).default([]),
  sourceEvidenceRefs: z.array(z.string().max(128)).default([]),
});

export const testSpecificationEnrichmentMetricsSchema = z.object({
  totalSpecifications: z.number().int().nonnegative(),
  totalPreconditions: z.number().int().nonnegative(),
  totalTestDataItems: z.number().int().nonnegative(),
  totalExpectedResults: z.number().int().nonnegative(),
  reviewRequiredCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
});

export const testSpecificationEnrichmentResultSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
  requirementKey: z.string().min(1).max(64),
  requirementVersionNumber: z.number().int().min(1),
  scenarioId: z.string().uuid().nullable().optional(),
  inputFingerprint: z.string().min(1).max(64),
  providerId: z.string().min(1).max(64),
  model: z.string().min(1).max(128),
  promptId: z.string().min(1).max(64),
  promptVersion: z.number().int().min(1),
  specifications: z.array(generatedTestSpecificationSchema),
  metrics: testSpecificationEnrichmentMetricsSchema,
  warnings: z.array(z.object({ code: z.string(), message: z.string() })).default([]),
  usage: aiTokenUsageSchema,
  durationMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const enrichTestSpecificationInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  scenarioId: z.string().uuid('Scenario ID must be a valid UUID.').optional(),
  testDesignId: z.string().uuid('Test design ID must be a valid UUID.').optional(),
  forceRegenerate: z.boolean().optional(),
  configOverride: aiGenerationConfigSchema.partial().optional(),
});

export const getEnrichedTestSpecificationsInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  scenarioId: z.string().uuid('Scenario ID must be a valid UUID.').optional(),
});

// ==============================================================================
// V4 Phase 52: Structured Test Case Model & Persistence DTOs
// ==============================================================================

export type TestCaseType =
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'BOUNDARY'
  | 'VALIDATION'
  | 'SECURITY'
  | 'PERFORMANCE'
  | 'ACCESSIBILITY'
  | 'COMPATIBILITY'
  | 'REGRESSION'
  | 'SMOKE'
  | 'EXPLORATORY'
  | 'END_TO_END'
  | 'INTEGRATION'
  | 'UNIT'
  | 'OTHER';

export type TestCasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNSPECIFIED';

export type TestCaseStatus = 'DRAFT' | 'GENERATED' | 'ACTIVE' | 'DEPRECATED';

export type TestCaseExecutionSuitability = 'AUTOMATED' | 'MANUAL' | 'SEMI_AUTOMATED' | 'UNKNOWN';

export interface TestCasePreconditionDto {
  readonly id: string;
  readonly testCaseId: string;
  readonly sequenceOrder: number;
  readonly category: PreconditionCategory;
  readonly description: string;
  readonly isEnforced: boolean;
  readonly confidence: string;
  readonly sourceEvidenceRefs: readonly string[];
  readonly reviewRequired: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TestCaseStepDto {
  readonly id: string;
  readonly testCaseId: string;
  readonly stepNumber: number;
  readonly action: string;
  readonly expectedResult?: string | null;
  readonly testDataSummary?: string | null;
  readonly stateChangeFrom?: string | null;
  readonly stateChangeTo?: string | null;
  readonly stateEntity?: string | null;
  readonly isOptional: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TestCaseTestDataItemDto {
  readonly id: string;
  readonly testCaseId: string;
  readonly sequenceOrder: number;
  readonly name: string;
  readonly dataType: string;
  readonly origin: string;
  readonly value?: unknown;
  readonly valueJson?: unknown;
  readonly generator?: string | null;
  readonly constraint?: string | null;
  readonly isSensitive: boolean;
  readonly unknownReason?: string | null;
  readonly confidence: string;
  readonly sourceEvidenceRefs: readonly string[];
  readonly reviewRequired: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TestCaseDto {
  readonly id: string;
  readonly projectId: string;
  readonly testCaseKey: string;
  readonly title: string;
  readonly objective: string;
  readonly description?: string | null;
  readonly type: TestCaseType;
  readonly priority: TestCasePriority;
  readonly status: TestCaseStatus;
  readonly currentVersionNumber?: number;
  readonly reviewStatus?: TestReviewStatus;
  readonly approvedVersionNumber?: number | null;
  readonly approvedAt?: string | null;
  readonly executionSuitability: TestCaseExecutionSuitability;
  readonly sourceRequirementId?: string | null;
  readonly sourceRequirementKey?: string | null;
  readonly sourceRequirementVersionId?: string | null;
  readonly sourceRequirementVersionNumber?: number | null;
  readonly sourceScenarioCandidateId?: string | null;
  readonly sourceScenarioKey?: string | null;
  readonly generationId?: string | null;
  readonly inputFingerprint?: string | null;
  readonly providerId?: string | null;
  readonly model?: string | null;
  readonly promptId?: string | null;
  readonly promptVersion?: number | null;
  readonly overallExpectedResult?: string | null;
  readonly assumptions: readonly string[];
  readonly unknowns: readonly {
    readonly name: string;
    readonly reason: string;
    readonly reviewRequired?: boolean;
  }[];
  readonly tags: readonly string[];
  readonly preconditionCount: number;
  readonly stepCount: number;
  readonly testDataCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TestCaseDetailDto extends TestCaseDto {
  readonly preconditions: readonly TestCasePreconditionDto[];
  readonly steps: readonly TestCaseStepDto[];
  readonly testData: readonly TestCaseTestDataItemDto[];
}

export interface CreateTestCaseInputDto {
  readonly projectId: string;
  readonly title: string;
  readonly objective: string;
  readonly description?: string | null;
  readonly type?: TestCaseType;
  readonly priority?: TestCasePriority;
  readonly status?: TestCaseStatus;
  readonly executionSuitability?: TestCaseExecutionSuitability;
  readonly sourceRequirementId?: string | null;
  readonly sourceRequirementVersionNumber?: number | null;
  readonly sourceScenarioCandidateId?: string | null;
  readonly overallExpectedResult?: string | null;
  readonly preconditions?: readonly {
    readonly category: PreconditionCategory;
    readonly description: string;
    readonly isEnforced?: boolean;
    readonly confidence?: string;
    readonly sourceEvidenceRefs?: readonly string[];
    readonly reviewRequired?: boolean;
  }[];
  readonly steps: readonly {
    readonly action: string;
    readonly expectedResult?: string | null;
    readonly testDataSummary?: string | null;
    readonly stateChangeFrom?: string | null;
    readonly stateChangeTo?: string | null;
    readonly stateEntity?: string | null;
    readonly isOptional?: boolean;
  }[];
  readonly testData?: readonly {
    readonly name: string;
    readonly dataType?: string;
    readonly origin?: string;
    readonly value?: unknown;
    readonly generator?: string | null;
    readonly constraint?: string | null;
    readonly isSensitive?: boolean;
    readonly unknownReason?: string | null;
    readonly confidence?: string;
    readonly sourceEvidenceRefs?: readonly string[];
    readonly reviewRequired?: boolean;
  }[];
  readonly assumptions?: readonly string[];
  readonly unknowns?: readonly {
    readonly name: string;
    readonly reason: string;
    readonly reviewRequired?: boolean;
  }[];
  readonly tags?: readonly string[];
}

export interface PersistGeneratedTestCaseInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementVersionNumber?: number;
  readonly scenarioId?: string | null;
  readonly specification: GeneratedTestSpecificationDto;
  readonly generationProvenance?: {
    readonly generationId?: string | null;
    readonly inputFingerprint?: string | null;
    readonly providerId?: string | null;
    readonly model?: string | null;
    readonly promptId?: string | null;
    readonly promptVersion?: number | null;
  };
  readonly idempotencyToken?: string;
}

export interface PersistGeneratedTestCasesBatchInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementVersionNumber?: number;
  readonly specifications: readonly GeneratedTestSpecificationDto[];
  readonly generationProvenance?: {
    readonly generationId?: string | null;
    readonly inputFingerprint?: string | null;
    readonly providerId?: string | null;
    readonly model?: string | null;
    readonly promptId?: string | null;
    readonly promptVersion?: number | null;
  };
  readonly idempotencyToken?: string;
}

export interface ListTestCasesInputDto {
  readonly projectId: string;
  readonly sourceRequirementId?: string;
  readonly type?: TestCaseType;
  readonly priority?: TestCasePriority;
  readonly status?: TestCaseStatus;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: 'testCaseKey' | 'title' | 'createdAt' | 'updatedAt' | 'priority';
  readonly sortDirection?: 'asc' | 'desc';
}

export interface GetTestCaseByIdInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
}

export interface DeleteTestCaseInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
}

export interface TestCaseListResultDto {
  readonly items: readonly TestCaseDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface BatchPersistTestCasesResultDto {
  readonly createdCount: number;
  readonly testCases: readonly TestCaseDetailDto[];
  readonly idempotentHit: boolean;
}

export const testCaseTypeSchema = z.enum([
  'POSITIVE',
  'NEGATIVE',
  'BOUNDARY',
  'VALIDATION',
  'SECURITY',
  'PERFORMANCE',
  'ACCESSIBILITY',
  'COMPATIBILITY',
  'REGRESSION',
  'SMOKE',
  'EXPLORATORY',
  'END_TO_END',
  'INTEGRATION',
  'UNIT',
  'OTHER',
]);

export const testCasePrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNSPECIFIED']);

export const testCaseStatusSchema = z.enum(['DRAFT', 'GENERATED', 'ACTIVE', 'DEPRECATED']);

export const testCaseExecutionSuitabilitySchema = z.enum([
  'AUTOMATED',
  'MANUAL',
  'SEMI_AUTOMATED',
  'UNKNOWN',
]);

export const testCasePreconditionSchema = z.object({
  id: z.string().uuid(),
  testCaseId: z.string().uuid(),
  sequenceOrder: z.number().int().nonnegative(),
  category: preconditionCategorySchema,
  description: z.string().min(1).max(2000),
  isEnforced: z.boolean(),
  confidence: z.string().max(32),
  sourceEvidenceRefs: z.array(z.string().max(128)),
  reviewRequired: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const testCaseStepSchema = z.object({
  id: z.string().uuid(),
  testCaseId: z.string().uuid(),
  stepNumber: z.number().int().positive(),
  action: z.string().min(1).max(2000),
  expectedResult: z.string().max(2000).nullable().optional(),
  testDataSummary: z.string().max(2000).nullable().optional(),
  stateChangeFrom: z.string().max(256).nullable().optional(),
  stateChangeTo: z.string().max(256).nullable().optional(),
  stateEntity: z.string().max(256).nullable().optional(),
  isOptional: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const testCaseTestDataItemSchema = z.object({
  id: z.string().uuid(),
  testCaseId: z.string().uuid(),
  sequenceOrder: z.number().int().nonnegative(),
  name: z.string().min(1).max(256),
  dataType: z.string().max(64),
  origin: z.string().max(64),
  value: z.unknown().optional(),
  generator: z.string().max(512).nullable().optional(),
  constraint: z.string().max(1000).nullable().optional(),
  isSensitive: z.boolean(),
  unknownReason: z.string().max(1000).nullable().optional(),
  confidence: z.string().max(32),
  sourceEvidenceRefs: z.array(z.string().max(128)),
  reviewRequired: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const testCaseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testCaseKey: z.string().min(1).max(64),
  title: z.string().min(1).max(255),
  objective: z.string().min(1),
  description: z.string().nullable().optional(),
  type: testCaseTypeSchema,
  priority: testCasePrioritySchema,
  status: testCaseStatusSchema,
  executionSuitability: testCaseExecutionSuitabilitySchema,
  sourceRequirementId: z.string().uuid().nullable().optional(),
  sourceRequirementKey: z.string().max(64).nullable().optional(),
  sourceRequirementVersionId: z.string().uuid().nullable().optional(),
  sourceRequirementVersionNumber: z.number().int().positive().nullable().optional(),
  sourceScenarioCandidateId: z.string().uuid().nullable().optional(),
  sourceScenarioKey: z.string().max(64).nullable().optional(),
  generationId: z.string().uuid().nullable().optional(),
  inputFingerprint: z.string().max(64).nullable().optional(),
  providerId: z.string().max(64).nullable().optional(),
  model: z.string().max(128).nullable().optional(),
  promptId: z.string().max(64).nullable().optional(),
  promptVersion: z.number().int().positive().nullable().optional(),
  overallExpectedResult: z.string().nullable().optional(),
  assumptions: z.array(z.string().max(1000)).default([]),
  unknowns: z
    .array(
      z.object({
        name: z.string().max(256),
        reason: z.string().max(1000),
        reviewRequired: z.boolean().optional(),
      }),
    )
    .default([]),
  tags: z.array(z.string().max(64)).default([]),
  preconditionCount: z.number().int().nonnegative(),
  stepCount: z.number().int().nonnegative(),
  testDataCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const testCaseDetailSchema = testCaseSchema.extend({
  preconditions: z.array(testCasePreconditionSchema),
  steps: z.array(testCaseStepSchema),
  testData: z.array(testCaseTestDataItemSchema),
});

export const createTestCaseInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  title: z.string().min(1, 'Title is required.').max(255, 'Title must be <= 255 chars.'),
  objective: z.string().min(1, 'Objective is required.'),
  description: z.string().nullable().optional(),
  type: testCaseTypeSchema.optional(),
  priority: testCasePrioritySchema.optional(),
  status: testCaseStatusSchema.optional(),
  executionSuitability: testCaseExecutionSuitabilitySchema.optional(),
  sourceRequirementId: z.string().uuid().nullable().optional(),
  sourceRequirementVersionNumber: z.number().int().positive().nullable().optional(),
  sourceScenarioCandidateId: z.string().uuid().nullable().optional(),
  overallExpectedResult: z.string().nullable().optional(),
  preconditions: z
    .array(
      z.object({
        category: preconditionCategorySchema,
        description: z.string().min(1).max(2000),
        isEnforced: z.boolean().optional(),
        confidence: z.string().max(32).optional(),
        sourceEvidenceRefs: z.array(z.string().max(128)).optional(),
        reviewRequired: z.boolean().optional(),
      }),
    )
    .optional(),
  steps: z
    .array(
      z.object({
        action: z.string().min(1).max(2000),
        expectedResult: z.string().max(2000).nullable().optional(),
        testDataSummary: z.string().max(2000).nullable().optional(),
        stateChangeFrom: z.string().max(256).nullable().optional(),
        stateChangeTo: z.string().max(256).nullable().optional(),
        stateEntity: z.string().max(256).nullable().optional(),
        isOptional: z.boolean().optional(),
      }),
    )
    .min(1, 'At least one step is required.'),
  testData: z
    .array(
      z.object({
        name: z.string().min(1).max(256),
        dataType: z.string().max(64).optional(),
        origin: z.string().max(64).optional(),
        value: z.unknown().optional(),
        generator: z.string().max(512).nullable().optional(),
        constraint: z.string().max(1000).nullable().optional(),
        isSensitive: z.boolean().optional(),
        unknownReason: z.string().max(1000).nullable().optional(),
        confidence: z.string().max(32).optional(),
        sourceEvidenceRefs: z.array(z.string().max(128)).optional(),
        reviewRequired: z.boolean().optional(),
      }),
    )
    .optional(),
  assumptions: z.array(z.string().max(1000)).optional(),
  unknowns: z
    .array(
      z.object({
        name: z.string().max(256),
        reason: z.string().max(1000),
        reviewRequired: z.boolean().optional(),
      }),
    )
    .optional(),
  tags: z.array(z.string().max(64)).optional(),
});

export const persistGeneratedTestCaseInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  requirementVersionNumber: z.number().int().positive().optional(),
  scenarioId: z.string().uuid().nullable().optional(),
  specification: generatedTestSpecificationSchema,
  generationProvenance: z
    .object({
      generationId: z.string().uuid().nullable().optional(),
      inputFingerprint: z.string().max(64).nullable().optional(),
      providerId: z.string().max(64).nullable().optional(),
      model: z.string().max(128).nullable().optional(),
      promptId: z.string().max(64).nullable().optional(),
      promptVersion: z.number().int().positive().nullable().optional(),
    })
    .optional(),
  idempotencyToken: z.string().max(128).optional(),
});

export const persistGeneratedTestCasesBatchInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  requirementVersionNumber: z.number().int().positive().optional(),
  specifications: z
    .array(generatedTestSpecificationSchema)
    .min(1, 'At least one specification is required.'),
  generationProvenance: z
    .object({
      generationId: z.string().uuid().nullable().optional(),
      inputFingerprint: z.string().max(64).nullable().optional(),
      providerId: z.string().max(64).nullable().optional(),
      model: z.string().max(128).nullable().optional(),
      promptId: z.string().max(64).nullable().optional(),
      promptVersion: z.number().int().positive().nullable().optional(),
    })
    .optional(),
  idempotencyToken: z.string().max(128).optional(),
});

export const listTestCasesInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  sourceRequirementId: z.string().uuid().optional(),
  type: testCaseTypeSchema.optional(),
  priority: testCasePrioritySchema.optional(),
  status: testCaseStatusSchema.optional(),
  search: z.string().max(256).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  sortBy: z.enum(['testCaseKey', 'title', 'createdAt', 'updatedAt', 'priority']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export const getTestCaseByIdInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  testCaseId: z.string().uuid('Test Case ID must be a valid UUID.'),
});

export const deleteTestCaseInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  testCaseId: z.string().uuid('Test Case ID must be a valid UUID.'),
});

// ------------------------------------------------------------------------------
// AI Test Generation Validation & Hallucination Control Types (V4 Phase 53)
// ------------------------------------------------------------------------------

export type TestValidationStatus = 'VALID' | 'REVIEW_REQUIRED' | 'REJECTED' | 'VALIDATION_ERROR';

export type TestValidationSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKER';

export type TestValidationFindingCode =
  | 'STRUCTURAL_INVALIDITY'
  | 'MISSING_GROUNDING_EVIDENCE'
  | 'UNSUPPORTED_ASSUMPTION'
  | 'UNSUPPORTED_ACTOR'
  | 'UNSUPPORTED_ROLE'
  | 'UNSUPPORTED_ENTITY'
  | 'UNSUPPORTED_VALUE'
  | 'UNSUPPORTED_CONSTRAINT'
  | 'UNSUPPORTED_BEHAVIOR'
  | 'UNSUPPORTED_PRECONDITION'
  | 'UNSUPPORTED_TEST_DATA'
  | 'UNSUPPORTED_EXPECTED_RESULT'
  | 'UNVERIFIABLE_EXPECTED_RESULT'
  | 'CONTRADICTS_REQUIREMENT'
  | 'CONTRADICTS_RETRIEVED_CONTEXT'
  | 'INVENTED_IMPLEMENTATION_DETAIL'
  | 'INVENTED_ENDPOINT'
  | 'INVENTED_ROUTE'
  | 'INVENTED_SELECTOR'
  | 'INVENTED_DATABASE_DETAIL'
  | 'INVENTED_UI_CONTROL'
  | 'AMBIGUOUS_SOURCE_REQUIREMENT'
  | 'STALE_REQUIREMENT_CONTEXT'
  | 'STALE_RETRIEVAL_CONTEXT'
  | 'PROMPT_INJECTION_RISK'
  | 'UNSAFE_GENERATED_CONTENT';

export interface TestValidationFindingDto {
  readonly id: string;
  readonly validationId: string;
  readonly code: TestValidationFindingCode;
  readonly severity: TestValidationSeverity;
  readonly fieldPath: string | null;
  readonly message: string;
  readonly evidence: string | null;
  readonly source: string | null;
  readonly suggestedAction: string | null;
  readonly createdAt: string;
}

export interface TestValidationMetricsDto {
  readonly totalFindings: number;
  readonly infoCount: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly blockerCount: number;
  readonly structuralValid: boolean;
  readonly grounded: boolean;
  readonly contradictionCount: number;
  readonly hallucinationCount: number;
  readonly durationMs: number;
}

export interface TestCaseValidationDto {
  readonly id: string;
  readonly projectId: string;
  readonly testCaseId: string | null;
  readonly requirementId: string;
  readonly requirementVersionNumber: number | null;
  readonly validatorVersion: string;
  readonly status: TestValidationStatus;
  readonly isStale: boolean;
  readonly staleReason: string | null;
  readonly testContentHash: string;
  readonly requirementContentHash: string | null;
  readonly summary: string | null;
  readonly metrics: TestValidationMetricsDto;
  readonly provenance: Record<string, unknown>;
  readonly findings: readonly TestValidationFindingDto[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ValidateTestCaseInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly enableAiCritic?: boolean;
}

export interface ValidateSpecificationInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementVersionNumber?: number;
  readonly specification: GeneratedTestSpecificationDto;
  readonly enableAiCritic?: boolean;
}

export interface ValidateTestBatchInputDto {
  readonly projectId: string;
  readonly testCaseIds?: readonly string[];
  readonly requirementId?: string;
  readonly specifications?: readonly GeneratedTestSpecificationDto[];
  readonly enableAiCritic?: boolean;
}

export interface GetLatestValidationInputDto {
  readonly projectId: string;
  readonly testCaseId?: string;
  readonly requirementId?: string;
}

export interface ListValidationHistoryInputDto {
  readonly projectId: string;
  readonly testCaseId?: string;
  readonly requirementId?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface BatchValidationResultDto {
  readonly validations: readonly TestCaseValidationDto[];
  readonly summary: {
    readonly total: number;
    readonly validCount: number;
    readonly reviewRequiredCount: number;
    readonly rejectedCount: number;
    readonly errorCount: number;
  };
}

export const testValidationStatusSchema = z.enum([
  'VALID',
  'REVIEW_REQUIRED',
  'REJECTED',
  'VALIDATION_ERROR',
]);

export const testValidationSeveritySchema = z.enum(['INFO', 'WARNING', 'ERROR', 'BLOCKER']);

export const testValidationFindingCodeSchema = z.enum([
  'STRUCTURAL_INVALIDITY',
  'MISSING_GROUNDING_EVIDENCE',
  'UNSUPPORTED_ASSUMPTION',
  'UNSUPPORTED_ACTOR',
  'UNSUPPORTED_ROLE',
  'UNSUPPORTED_ENTITY',
  'UNSUPPORTED_VALUE',
  'UNSUPPORTED_CONSTRAINT',
  'UNSUPPORTED_BEHAVIOR',
  'UNSUPPORTED_PRECONDITION',
  'UNSUPPORTED_TEST_DATA',
  'UNSUPPORTED_EXPECTED_RESULT',
  'UNVERIFIABLE_EXPECTED_RESULT',
  'CONTRADICTS_REQUIREMENT',
  'CONTRADICTS_RETRIEVED_CONTEXT',
  'INVENTED_IMPLEMENTATION_DETAIL',
  'INVENTED_ENDPOINT',
  'INVENTED_ROUTE',
  'INVENTED_SELECTOR',
  'INVENTED_DATABASE_DETAIL',
  'INVENTED_UI_CONTROL',
  'AMBIGUOUS_SOURCE_REQUIREMENT',
  'STALE_REQUIREMENT_CONTEXT',
  'STALE_RETRIEVAL_CONTEXT',
  'PROMPT_INJECTION_RISK',
  'UNSAFE_GENERATED_CONTENT',
]);

export const testValidationFindingSchema = z.object({
  id: z.string().uuid(),
  validationId: z.string().uuid(),
  code: testValidationFindingCodeSchema,
  severity: testValidationSeveritySchema,
  fieldPath: z.string().max(255).nullable(),
  message: z.string().min(1),
  evidence: z.string().nullable(),
  source: z.string().max(64).nullable(),
  suggestedAction: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const testValidationMetricsSchema = z.object({
  totalFindings: z.number().int().nonnegative(),
  infoCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  blockerCount: z.number().int().nonnegative(),
  structuralValid: z.boolean(),
  grounded: z.boolean(),
  contradictionCount: z.number().int().nonnegative(),
  hallucinationCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});

export const testCaseValidationSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid().nullable(),
  requirementId: z.string().uuid(),
  requirementVersionNumber: z.number().int().positive().nullable(),
  validatorVersion: z.string().max(64),
  status: testValidationStatusSchema,
  isStale: z.boolean(),
  staleReason: z.string().nullable(),
  testContentHash: z.string().max(64),
  requirementContentHash: z.string().max(64).nullable(),
  summary: z.string().nullable(),
  metrics: testValidationMetricsSchema,
  provenance: z.record(z.unknown()).default({}),
  findings: z.array(testValidationFindingSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const validateTestCaseInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  testCaseId: z.string().uuid('Test Case ID must be a valid UUID.'),
  enableAiCritic: z.boolean().optional(),
});

export const validateSpecificationInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().uuid('Requirement ID must be a valid UUID.'),
  requirementVersionNumber: z.number().int().positive().optional(),
  specification: generatedTestSpecificationSchema,
  enableAiCritic: z.boolean().optional(),
});

export const validateTestBatchInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  testCaseIds: z.array(z.string().uuid()).max(100).optional(),
  requirementId: z.string().uuid().optional(),
  specifications: z.array(generatedTestSpecificationSchema).max(100).optional(),
  enableAiCritic: z.boolean().optional(),
});

export const getLatestValidationInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  testCaseId: z.string().uuid().optional(),
  requirementId: z.string().uuid().optional(),
});

export const listValidationHistoryInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  testCaseId: z.string().uuid().optional(),
  requirementId: z.string().uuid().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

export const batchValidationResultSchema = z.object({
  validations: z.array(testCaseValidationSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    validCount: z.number().int().nonnegative(),
    reviewRequiredCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
  }),
});

// ==============================================================================
// V4 Phase 54: Requirement-to-Test Traceability Foundation
// ==============================================================================

export type TraceOrigin = 'GENERATED' | 'MANUAL' | 'DERIVED' | 'IMPORTED';
export type TraceStatus = 'CURRENT' | 'STALE' | 'REVIEW_REQUIRED';

export interface RequirementTestTraceDto {
  readonly id: string;
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementTitle: string;
  readonly requirementVersionId: string | null;
  readonly requirementVersionNumber: number;
  readonly currentRequirementVersionNumber: number;
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly testCaseTitle: string;
  readonly testCaseType: TestCaseType;
  readonly testCasePriority: TestCasePriority;
  readonly testCaseStatus: TestCaseStatus;
  readonly scenarioCandidateId: string | null;
  readonly scenarioKey: string | null;
  readonly generationRunId: string | null;
  readonly origin: TraceOrigin;
  readonly status: TraceStatus;
  readonly isStale: boolean;
  readonly staleReason: string | null;
  readonly provenance: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateRequirementTestTraceInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly testCaseId: string;
  readonly origin?: TraceOrigin;
  readonly provenance?: Record<string, unknown>;
}

export interface DeleteRequirementTestTraceInputDto {
  readonly projectId: string;
  readonly traceId: string;
}

export interface GetTraceByIdInputDto {
  readonly projectId: string;
  readonly traceId: string;
}

export interface ListTracesByRequirementInputDto {
  readonly projectId: string;
  readonly requirementId: string;
  readonly status?: TraceStatus;
  readonly origin?: TraceOrigin;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ListTracesByTestCaseInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly status?: TraceStatus;
  readonly origin?: TraceOrigin;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ListProjectTracesInputDto {
  readonly projectId: string;
  readonly status?: TraceStatus;
  readonly origin?: TraceOrigin;
  readonly isStale?: boolean;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ListTracesResultDto {
  readonly traces: readonly RequirementTestTraceDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// Zod Schemas for Phase 54
export const traceOriginSchema = z.enum(['GENERATED', 'MANUAL', 'DERIVED', 'IMPORTED']);
export const traceStatusSchema = z.enum(['CURRENT', 'STALE', 'REVIEW_REQUIRED']);

export const requirementTestTraceSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
  requirementKey: z.string().min(1).max(64),
  requirementTitle: z.string().min(1).max(255),
  requirementVersionId: z.string().uuid().nullable(),
  requirementVersionNumber: z.number().int().positive(),
  currentRequirementVersionNumber: z.number().int().positive(),
  testCaseId: z.string().uuid(),
  testCaseKey: z.string().min(1).max(64),
  testCaseTitle: z.string().min(1).max(255),
  testCaseType: testCaseTypeSchema,
  testCasePriority: testCasePrioritySchema,
  testCaseStatus: testCaseStatusSchema,
  scenarioCandidateId: z.string().uuid().nullable(),
  scenarioKey: z.string().max(64).nullable(),
  generationRunId: z.string().uuid().nullable(),
  origin: traceOriginSchema,
  status: traceStatusSchema,
  isStale: z.boolean(),
  staleReason: z.string().max(255).nullable(),
  provenance: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createRequirementTestTraceInputSchema = z.object({
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  origin: traceOriginSchema.optional(),
  provenance: z.record(z.unknown()).optional(),
});

export const deleteRequirementTestTraceInputSchema = z.object({
  projectId: z.string().uuid(),
  traceId: z.string().uuid(),
});

export const getTraceByIdInputSchema = z.object({
  projectId: z.string().uuid(),
  traceId: z.string().uuid(),
});

export const listTracesByRequirementInputSchema = z.object({
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
  status: traceStatusSchema.optional(),
  origin: traceOriginSchema.optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

export const listTracesByTestCaseInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  status: traceStatusSchema.optional(),
  origin: traceOriginSchema.optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

export const listProjectTracesInputSchema = z.object({
  projectId: z.string().uuid(),
  status: traceStatusSchema.optional(),
  origin: traceOriginSchema.optional(),
  isStale: z.boolean().optional(),
  search: z.string().max(100).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

export const listTracesResultSchema = z.object({
  traces: z.array(requirementTestTraceSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

// ==============================================================================
// V4 Phase 55: Coverage Analysis & Traceability Matrix DTOs
// ==============================================================================

export type RequirementCoverageStatus =
  'COVERED' | 'PARTIALLY_COVERED' | 'UNCOVERED' | 'NOT_APPLICABLE' | 'UNKNOWN';

export type CoverageDimension =
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'BOUNDARY'
  | 'VALIDATION'
  | 'SECURITY'
  | 'PERFORMANCE'
  | 'ACCESSIBILITY'
  | 'COMPATIBILITY'
  | 'BUSINESS_RULE';

export type CoverageGapCategory =
  | 'NO_TESTS'
  | 'MISSING_DIMENSION'
  | 'ALL_TESTS_STALE'
  | 'ALL_TESTS_REJECTED'
  | 'UNTESTABLE_REQUIREMENT'
  | 'AMBIGUOUS_REQUIREMENT';

export interface CoverageLinkedTestSummaryDto {
  readonly traceId: string;
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly testCaseTitle: string;
  readonly testCaseType: string;
  readonly testCasePriority: string;
  readonly testCaseStatus: string;
  readonly traceOrigin: string;
  readonly traceStatus: string;
  readonly isStale: boolean;
  readonly staleReason: string | null;
  readonly requirementVersionNumber: number;
  readonly isValidationRejected: boolean;
  readonly scenarioKey: string | null;
}

export interface RequirementCoverageDetailDto {
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementTitle: string;
  readonly requirementVersionNumber: number;
  readonly currentRequirementVersionNumber: number;
  readonly lifecycleStatus: string;
  readonly testability: string;
  readonly coverageStatus: RequirementCoverageStatus;
  readonly coveragePercentage: number | null;
  readonly requiredDimensions: readonly CoverageDimension[];
  readonly coveredDimensions: readonly CoverageDimension[];
  readonly missingDimensions: readonly CoverageDimension[];
  readonly totalLinkedTests: number;
  readonly eligibleLinkedTests: number;
  readonly staleLinkedTests: number;
  readonly rejectedLinkedTests: number;
  readonly reasonCodes: readonly string[];
  readonly linkedTestSummaries: readonly CoverageLinkedTestSummaryDto[];
  readonly lastEvaluatedAt: string;
}

export interface CoverageDimensionSummaryDto {
  readonly dimension: CoverageDimension;
  readonly requiredCount: number;
  readonly coveredCount: number;
  readonly percentage: number;
}

export interface CoverageGapDto {
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementTitle: string;
  readonly priority: string;
  readonly category: CoverageGapCategory;
  readonly description: string;
  readonly missingDimensions: readonly CoverageDimension[];
}

export interface ProjectCoverageSummaryDto {
  readonly projectId: string;
  readonly totalRequirements: number;
  readonly eligibleRequirements: number;
  readonly coveredCount: number;
  readonly partiallyCoveredCount: number;
  readonly uncoveredCount: number;
  readonly notApplicableCount: number;
  readonly unknownCount: number;
  readonly overallCoveragePercentage: number;
  readonly overallWithPartialPercentage: number;
  readonly totalLinkedTests: number;
  readonly currentValidTests: number;
  readonly staleTests: number;
  readonly orphanTests: number;
  readonly dimensionSummaries: readonly CoverageDimensionSummaryDto[];
  readonly topGaps: readonly CoverageGapDto[];
  readonly lastEvaluatedAt: string;
}

export interface TraceabilityMatrixRowDto {
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementTitle: string;
  readonly requirementLifecycle: string;
  readonly requirementPriority: string;
  readonly requirementVersion: number;
  readonly currentRequirementVersion: number;
  readonly testability: string;
  readonly coverageStatus: RequirementCoverageStatus;
  readonly coveragePercentage: number | null;
  readonly requiredDimensions: readonly CoverageDimension[];
  readonly coveredDimensions: readonly CoverageDimension[];
  readonly missingDimensions: readonly CoverageDimension[];
  readonly totalLinkedTestCount: number;
  readonly eligibleTestCount: number;
  readonly staleTestCount: number;
  readonly rejectedTestCount: number;
  readonly linkedTests: readonly CoverageLinkedTestSummaryDto[];
}

export interface TraceabilityMatrixResultDto {
  readonly rows: readonly TraceabilityMatrixRowDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly summary: ProjectCoverageSummaryDto;
}

export interface ReverseTraceabilityItemDto {
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly testCaseTitle: string;
  readonly testCaseType: string;
  readonly testCasePriority: string;
  readonly testCaseStatus: string;
  readonly isOrphan: boolean;
  readonly linkedRequirements: readonly {
    readonly traceId: string;
    readonly requirementId: string;
    readonly requirementKey: string;
    readonly requirementTitle: string;
    readonly requirementVersionNumber: number;
    readonly currentRequirementVersionNumber: number;
    readonly traceOrigin: string;
    readonly traceStatus: string;
    readonly isStale: boolean;
    readonly staleReason: string | null;
  }[];
}

export interface ReverseTraceabilityResultDto {
  readonly items: readonly ReverseTraceabilityItemDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalOrphans: number;
}

export interface OrphanTestCaseDto {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly type: string;
  readonly priority: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface OrphanTestsResultDto {
  readonly orphanTestCases: readonly OrphanTestCaseDto[];
  readonly total: number;
}

export interface GetProjectCoverageInputDto {
  readonly projectId: string;
  readonly lifecycleFilter?: readonly string[];
}

export interface GetRequirementCoverageInputDto {
  readonly projectId: string;
  readonly requirementId: string;
}

export interface GetTraceabilityMatrixInputDto {
  readonly projectId: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly coverageStatus?: RequirementCoverageStatus;
  readonly lifecycleFilter?: readonly string[];
  readonly missingDimension?: CoverageDimension;
  readonly search?: string;
  readonly sortBy?:
    'requirementKey' | 'coverageStatus' | 'priority' | 'coveragePercentage' | 'linkedTestCount';
  readonly sortDirection?: 'asc' | 'desc';
}

export interface GetReverseTraceabilityInputDto {
  readonly projectId: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly orphansOnly?: boolean;
  readonly sortBy?: 'testCaseKey' | 'type' | 'priority' | 'createdAt';
  readonly sortDirection?: 'asc' | 'desc';
}

export interface GetOrphanTestsInputDto {
  readonly projectId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

// Zod Schemas for Phase 55
export const requirementCoverageStatusSchema = z.enum([
  'COVERED',
  'PARTIALLY_COVERED',
  'UNCOVERED',
  'NOT_APPLICABLE',
  'UNKNOWN',
]);

export const coverageDimensionSchema = z.enum([
  'POSITIVE',
  'NEGATIVE',
  'BOUNDARY',
  'VALIDATION',
  'SECURITY',
  'PERFORMANCE',
  'ACCESSIBILITY',
  'COMPATIBILITY',
  'BUSINESS_RULE',
]);

export const coverageGapCategorySchema = z.enum([
  'NO_TESTS',
  'MISSING_DIMENSION',
  'ALL_TESTS_STALE',
  'ALL_TESTS_REJECTED',
  'UNTESTABLE_REQUIREMENT',
  'AMBIGUOUS_REQUIREMENT',
]);

export const getProjectCoverageInputSchema = z.object({
  projectId: z.string().uuid(),
  lifecycleFilter: z.array(z.string()).optional(),
});

export const getRequirementCoverageInputSchema = z.object({
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
});

export const getTraceabilityMatrixInputSchema = z.object({
  projectId: z.string().uuid(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  coverageStatus: requirementCoverageStatusSchema.optional(),
  lifecycleFilter: z.array(z.string()).optional(),
  missingDimension: coverageDimensionSchema.optional(),
  search: z.string().max(100).optional(),
  sortBy: z
    .enum(['requirementKey', 'coverageStatus', 'priority', 'coveragePercentage', 'linkedTestCount'])
    .optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export const getReverseTraceabilityInputSchema = z.object({
  projectId: z.string().uuid(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  search: z.string().max(100).optional(),
  orphansOnly: z.boolean().optional(),
  sortBy: z.enum(['testCaseKey', 'type', 'priority', 'createdAt']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export const getOrphanTestsInputSchema = z.object({
  projectId: z.string().uuid(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

// ------------------------------------------------------------------------------
// V4 Phase 56 — Test Review, Approval, Regeneration & Versioning DTOs & Schemas
// ------------------------------------------------------------------------------

export type TestReviewStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export type TestCaseVersionSource =
  'INITIAL_AI_GENERATION' | 'AI_REGENERATION' | 'HUMAN_EDIT' | 'SYSTEM_MIGRATION' | 'IMPORT';

export type TestReviewAction =
  'SUBMITTED_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'EDITED' | 'REGENERATED';

export type TestCaseRejectionReason =
  | 'INVALID_EXPECTED_RESULT'
  | 'UNSUPPORTED_ASSUMPTION'
  | 'DUPLICATE_TEST'
  | 'INCORRECT_PRECONDITION'
  | 'POOR_TEST_DATA'
  | 'NOT_RELEVANT'
  | 'INSUFFICIENT_COVERAGE'
  | 'REQUIREMENT_AMBIGUOUS'
  | 'OTHER';

export interface TestCaseVersionDto {
  readonly id: string;
  readonly projectId: string;
  readonly testCaseId: string;
  readonly versionNumber: number;
  readonly sourceType: TestCaseVersionSource;
  readonly title: string;
  readonly objective: string;
  readonly description?: string | null;
  readonly type: TestCaseType;
  readonly priority: TestCasePriority;
  readonly executionSuitability: TestCaseExecutionSuitability;
  readonly reviewStatus: TestReviewStatus;
  readonly changeReason?: string | null;
  readonly changedFields: readonly string[];
  readonly sourceRequirementId?: string | null;
  readonly sourceRequirementKey?: string | null;
  readonly sourceRequirementVersionNumber?: number | null;
  readonly sourceScenarioCandidateId?: string | null;
  readonly sourceScenarioKey?: string | null;
  readonly generationMetadata: Record<string, unknown>;
  readonly preconditions: readonly TestCasePreconditionDto[];
  readonly steps: readonly TestCaseStepDto[];
  readonly testData: readonly TestCaseTestDataItemDto[];
  readonly assumptions: readonly string[];
  readonly unknowns: readonly string[];
  readonly overallExpectedResult?: string | null;
  readonly createdByActorId?: string | null;
  readonly createdAt: string;
}

export interface TestCaseReviewEventDto {
  readonly id: string;
  readonly projectId: string;
  readonly testCaseId: string;
  readonly versionNumber: number;
  readonly action: TestReviewAction;
  readonly fromStatus: TestReviewStatus;
  readonly toStatus: TestReviewStatus;
  readonly rejectionReason?: TestCaseRejectionReason | null;
  readonly comment?: string | null;
  readonly actorId?: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

export interface TestReviewQueueItemDto {
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly title: string;
  readonly type: TestCaseType;
  readonly priority: TestCasePriority;
  readonly currentVersionNumber: number;
  readonly reviewStatus: TestReviewStatus;
  readonly approvedVersionNumber?: number | null;
  readonly approvedAt?: string | null;
  readonly sourceRequirementId?: string | null;
  readonly sourceRequirementKey?: string | null;
  readonly sourceRequirementTitle?: string | null;
  readonly sourceRequirementVersionNumber?: number | null;
  readonly currentRequirementVersionNumber?: number | null;
  readonly isRequirementStale: boolean;
  readonly latestValidationStatus?: string | null;
  readonly updatedAt: string;
}

export interface TestReviewQueueResultDto {
  readonly items: readonly TestReviewQueueItemDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface TestReviewDetailDto {
  readonly testCase: TestCaseDto;
  readonly activeVersion: TestCaseVersionDto;
  readonly currentRequirement?: {
    readonly id: string;
    readonly key: string;
    readonly title: string;
    readonly versionNumber: number;
    readonly originalText: string;
  } | null;
  readonly isRequirementStale: boolean;
  readonly latestValidation?: {
    readonly id: string;
    readonly status: string;
    readonly confidenceScore: number;
    readonly findingsCount: number;
    readonly blockerCount: number;
    readonly errorCount: number;
    readonly warningCount: number;
  } | null;
  readonly versionsCount: number;
  readonly reviewEvents: readonly TestCaseReviewEventDto[];
}

export interface TestVersionDiffDto {
  readonly fromVersionNumber: number;
  readonly toVersionNumber: number;
  readonly fieldChanges: readonly {
    readonly field: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
  }[];
  readonly preconditionChanges: {
    readonly added: readonly TestCasePreconditionDto[];
    readonly removed: readonly TestCasePreconditionDto[];
    readonly modified: readonly {
      readonly sequenceOrder: number;
      readonly old: TestCasePreconditionDto;
      readonly current: TestCasePreconditionDto;
    }[];
  };
  readonly stepChanges: {
    readonly added: readonly TestCaseStepDto[];
    readonly removed: readonly TestCaseStepDto[];
    readonly modified: readonly {
      readonly stepNumber: number;
      readonly old: TestCaseStepDto;
      readonly current: TestCaseStepDto;
    }[];
  };
  readonly testDataChanges: {
    readonly added: readonly TestCaseTestDataItemDto[];
    readonly removed: readonly TestCaseTestDataItemDto[];
    readonly modified: readonly {
      readonly name: string;
      readonly old: TestCaseTestDataItemDto;
      readonly current: TestCaseTestDataItemDto;
    }[];
  };
}

export interface ListTestReviewQueueInputDto {
  readonly projectId: string;
  readonly reviewStatus?: TestReviewStatus;
  readonly isRequirementStale?: boolean;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface GetTestReviewDetailInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly versionNumber?: number;
}

export interface ApproveTestVersionInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly versionNumber: number;
  readonly comment?: string;
  readonly reviewerActorId?: string;
}

export interface RejectTestVersionInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly versionNumber: number;
  readonly rejectionReason: TestCaseRejectionReason;
  readonly comment?: string;
  readonly reviewerActorId?: string;
}

export interface EditTestCaseInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly expectedVersionNumber: number;
  readonly title: string;
  readonly objective: string;
  readonly description?: string | null;
  readonly type?: TestCaseType;
  readonly priority?: TestCasePriority;
  readonly executionSuitability?: TestCaseExecutionSuitability;
  readonly changeReason?: string;
  readonly preconditions: readonly {
    readonly sequenceOrder: number;
    readonly category?: PreconditionCategory;
    readonly description: string;
    readonly isEnforced?: boolean;
  }[];
  readonly steps: readonly {
    readonly stepNumber: number;
    readonly action: string;
    readonly expectedResult?: string | null;
    readonly testDataSummary?: string | null;
    readonly stateChangeFrom?: string | null;
    readonly stateChangeTo?: string | null;
    readonly stateEntity?: string | null;
    readonly isOptional?: boolean;
  }[];
  readonly testData: readonly {
    readonly sequenceOrder?: number;
    readonly name: string;
    readonly dataType?: string;
    readonly origin?: string;
    readonly valueJson?: unknown;
    readonly constraint?: string | null;
    readonly isSensitive?: boolean;
  }[];
  readonly overallExpectedResult?: string | null;
  readonly editorActorId?: string;
}

export interface RegenerateTestCaseInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly expectedVersionNumber: number;
  readonly reason: string;
  readonly reviewerInstructions?: string;
  readonly actorId?: string;
}

export interface GetTestHistoryInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
}

export interface TestHistoryResultDto {
  readonly versions: readonly TestCaseVersionDto[];
  readonly reviewEvents: readonly TestCaseReviewEventDto[];
}

export interface CompareTestVersionsInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly fromVersionNumber: number;
  readonly toVersionNumber: number;
}

export const testReviewStatusSchema = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED']);

export const testCaseVersionSourceSchema = z.enum([
  'INITIAL_AI_GENERATION',
  'AI_REGENERATION',
  'HUMAN_EDIT',
  'SYSTEM_MIGRATION',
  'IMPORT',
]);

export const testReviewActionSchema = z.enum([
  'SUBMITTED_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'EDITED',
  'REGENERATED',
]);

export const testCaseRejectionReasonSchema = z.enum([
  'INVALID_EXPECTED_RESULT',
  'UNSUPPORTED_ASSUMPTION',
  'DUPLICATE_TEST',
  'INCORRECT_PRECONDITION',
  'POOR_TEST_DATA',
  'NOT_RELEVANT',
  'INSUFFICIENT_COVERAGE',
  'REQUIREMENT_AMBIGUOUS',
  'OTHER',
]);

export const listTestReviewQueueInputSchema = z.object({
  projectId: z.string().uuid(),
  reviewStatus: testReviewStatusSchema.optional(),
  isRequirementStale: z.boolean().optional(),
  search: z.string().max(100).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

export const getTestReviewDetailInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  versionNumber: z.number().int().positive().optional(),
});

export const approveTestVersionInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  comment: z.string().max(2000).optional(),
  reviewerActorId: z.string().max(255).optional(),
});

export const rejectTestVersionInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  rejectionReason: testCaseRejectionReasonSchema,
  comment: z.string().max(2000).optional(),
  reviewerActorId: z.string().max(255).optional(),
});

export const editTestCaseInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  expectedVersionNumber: z.number().int().positive(),
  title: z.string().min(1).max(255),
  objective: z.string().min(1),
  description: z.string().max(2000).nullable().optional(),
  type: testCaseTypeSchema.optional(),
  priority: testCasePrioritySchema.optional(),
  executionSuitability: testCaseExecutionSuitabilitySchema.optional(),
  changeReason: z.string().max(500).optional(),
  preconditions: z.array(
    z.object({
      sequenceOrder: z.number().int().nonnegative(),
      category: preconditionCategorySchema.optional(),
      description: z.string().min(1),
      isEnforced: z.boolean().optional(),
    }),
  ),
  steps: z.array(
    z.object({
      stepNumber: z.number().int().positive(),
      action: z.string().min(1),
      expectedResult: z.string().nullable().optional(),
      testDataSummary: z.string().nullable().optional(),
      stateChangeFrom: z.string().max(255).nullable().optional(),
      stateChangeTo: z.string().max(255).nullable().optional(),
      stateEntity: z.string().max(255).nullable().optional(),
      isOptional: z.boolean().optional(),
    }),
  ),
  testData: z.array(
    z.object({
      sequenceOrder: z.number().int().nonnegative().optional(),
      name: z.string().min(1).max(256),
      dataType: z.string().max(64).optional(),
      origin: z.string().max(64).optional(),
      valueJson: z.unknown().optional(),
      constraint: z.string().nullable().optional(),
      isSensitive: z.boolean().optional(),
    }),
  ),
  overallExpectedResult: z.string().nullable().optional(),
  editorActorId: z.string().max(255).optional(),
});

export const regenerateTestCaseInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  expectedVersionNumber: z.number().int().positive(),
  reason: z.string().min(1).max(500),
  reviewerInstructions: z.string().max(2000).optional(),
  actorId: z.string().max(255).optional(),
});

export const getTestHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
});

export const compareTestVersionsInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  fromVersionNumber: z.number().int().positive(),
  toVersionNumber: z.number().int().positive(),
});

// ------------------------------------------------------------------------------
// Strongly Typed Desktop Bridge API
// ------------------------------------------------------------------------------

export interface DesktopBridge {
  readonly app: {
    readonly getInfo: () => Promise<DesktopResult<AppInfo>>;
  };
  readonly health: {
    readonly check: () => Promise<DesktopResult<HealthInfo>>;
  };
  readonly database: {
    readonly getStatus: () => Promise<DesktopResult<DatabaseStatus>>;
  };
  readonly projects: {
    readonly list: (input?: ListProjectsInput) => Promise<DesktopResult<readonly ProjectSummary[]>>;
    readonly get: (projectId: string) => Promise<DesktopResult<ProjectDetails>>;
    readonly create: (input: CreateProjectInput) => Promise<DesktopResult<ProjectDetails>>;
    readonly update: (input: UpdateProjectInput) => Promise<DesktopResult<ProjectDetails>>;
    readonly archive: (projectId: string) => Promise<DesktopResult<ProjectDetails>>;
    readonly restore: (projectId: string) => Promise<DesktopResult<ProjectDetails>>;
    readonly delete: (projectId: string) => Promise<DesktopResult<{ readonly deleted: true }>>;
    readonly environments: {
      readonly create: (
        input: CreateEnvironmentInput,
      ) => Promise<DesktopResult<ProjectEnvironmentDto>>;
      readonly update: (
        input: UpdateEnvironmentInput,
      ) => Promise<DesktopResult<ProjectEnvironmentDto>>;
      readonly delete: (
        input: DeleteEnvironmentInput,
      ) => Promise<DesktopResult<{ readonly deleted: true }>>;
      readonly setDefault: (
        input: SetDefaultEnvironmentInput,
      ) => Promise<DesktopResult<ProjectEnvironmentDto>>;
    };
  };
  readonly sources: {
    readonly get: (projectId: string) => Promise<DesktopResult<ProjectSourceDto | null>>;
    readonly attachLocalDirectory: (
      projectId: string,
    ) => Promise<DesktopResult<AttachLocalDirectoryResult>>;
    readonly detach: (projectId: string) => Promise<DesktopResult<DetachSourceResult>>;
    readonly validate: (projectId: string) => Promise<DesktopResult<ProjectSourceDto>>;
    readonly refreshMetadata: (projectId: string) => Promise<DesktopResult<ProjectSourceDto>>;
    readonly git: {
      readonly get: (projectId: string) => Promise<DesktopResult<GitStatusDto | null>>;
      readonly refresh: (projectId: string) => Promise<DesktopResult<GitStatusDto>>;
    };
    readonly structure: {
      readonly get: (projectId: string) => Promise<DesktopResult<SourceStructureDto | null>>;
      readonly refresh: (projectId: string) => Promise<DesktopResult<SourceStructureDto>>;
    };
    readonly technology: {
      readonly get: (projectId: string) => Promise<DesktopResult<TechnologyProfileDto | null>>;
      readonly refresh: (projectId: string) => Promise<DesktopResult<TechnologyProfileDto>>;
    };
    readonly frameworks: {
      readonly get: (projectId: string) => Promise<DesktopResult<FrameworkProfileDto | null>>;
      readonly refresh: (projectId: string) => Promise<DesktopResult<FrameworkProfileDto>>;
    };
    readonly classification: {
      readonly get: (projectId: string) => Promise<DesktopResult<ClassificationProfileDto | null>>;
      readonly refresh: (projectId: string) => Promise<DesktopResult<ClassificationProfileDto>>;
    };
    readonly content: {
      readonly get: (input: SourceFileContentInput) => Promise<DesktopResult<SourceFileContentDto>>;
    };
    readonly index: {
      readonly getStatus: (projectId: string) => Promise<DesktopResult<RepositoryIndexStatusDto>>;
      readonly refresh: (projectId: string) => Promise<DesktopResult<RepositoryIndexStatusDto>>;
      readonly listFiles: (
        input: ListIndexedFilesInput,
      ) => Promise<DesktopResult<PaginatedResult<RepositoryFileDto>>>;
      readonly getFileDetails: (
        input: RepositoryFileDetailsInput,
      ) => Promise<DesktopResult<RepositoryFileDetailsDto | null>>;
      readonly searchSymbols: (
        input: SearchSymbolsInput,
      ) => Promise<DesktopResult<readonly RepositorySymbolDto[]>>;
    };
    readonly architecture: {
      readonly get: (
        projectId: string,
      ) => Promise<DesktopResult<ApplicationArchitectureProfileDto | null>>;
      readonly refresh: (
        projectId: string,
      ) => Promise<DesktopResult<ApplicationArchitectureProfileDto>>;
    };
    readonly runConfiguration: {
      readonly get: (
        projectId: string,
      ) => Promise<DesktopResult<RunConfigurationProfileDto | null>>;
      readonly detect: (projectId: string) => Promise<DesktopResult<RunConfigurationProfileDto>>;
      readonly select: (
        input: SelectRunConfigInput,
      ) => Promise<DesktopResult<ApplicationRunConfigurationDto>>;
      readonly updateTargetUrl: (
        input: UpdateTargetUrlInput,
      ) => Promise<DesktopResult<ApplicationRunConfigurationDto | null>>;
    };
    readonly snapshots: {
      readonly list: (
        projectId: string,
      ) => Promise<DesktopResult<readonly RepositorySnapshotDto[]>>;
      readonly create: (
        input: CreateSnapshotInput,
      ) => Promise<DesktopResult<RepositorySnapshotDto>>;
      readonly setBaseline: (
        input: SetBaselineInput,
      ) => Promise<DesktopResult<RepositorySnapshotDto>>;
      readonly delete: (
        input: DeleteSnapshotInput,
      ) => Promise<DesktopResult<{ readonly deleted: true }>>;
    };
    readonly changes: {
      readonly get: (projectId: string) => Promise<DesktopResult<RepositoryChangeSetDto | null>>;
      readonly refresh: (projectId: string) => Promise<DesktopResult<RepositoryChangeSetDto>>;
    };
  };
  readonly requirements: {
    readonly list: (
      input: ListRequirementsInput,
    ) => Promise<DesktopResult<PaginatedResult<RequirementDto>>>;
    readonly get: (input: GetRequirementInput) => Promise<DesktopResult<RequirementDto | null>>;
    readonly getByKey: (
      input: GetRequirementByKeyInput,
    ) => Promise<DesktopResult<RequirementDto | null>>;
    readonly getSummary: (projectId: string) => Promise<DesktopResult<RequirementSummaryDto>>;
    readonly create: (input: CreateRequirementInput) => Promise<DesktopResult<RequirementDto>>;
    readonly update: (input: UpdateRequirementInput) => Promise<DesktopResult<RequirementDto>>;
    readonly activate: (input: ActivateRequirementInput) => Promise<DesktopResult<RequirementDto>>;
    readonly deprecate: (
      input: DeprecateRequirementInput,
    ) => Promise<DesktopResult<RequirementDto>>;
    readonly draft: (input: DraftRequirementInput) => Promise<DesktopResult<RequirementDto>>;
    readonly archive: (input: ArchiveRequirementInput) => Promise<DesktopResult<RequirementDto>>;
    readonly restore: (input: RestoreRequirementInput) => Promise<DesktopResult<RequirementDto>>;
    readonly delete: (
      input: DeleteRequirementInput,
    ) => Promise<DesktopResult<{ readonly deleted: true }>>;
    readonly parseBulk: (
      input: ParseBulkRequirementsInput,
    ) => Promise<DesktopResult<ParseBulkRequirementsResult>>;
    readonly importBulk: (
      input: ImportBulkRequirementsInput,
    ) => Promise<DesktopResult<ImportBulkRequirementsResult>>;
    readonly getProvenance: (
      input: GetRequirementProvenanceInput,
    ) => Promise<DesktopResult<RequirementProvenanceDto | null>>;
    readonly getSourceContext: (
      input: GetRequirementSourceContextInput,
    ) => Promise<DesktopResult<RequirementSourceContextDto | null>>;
    readonly normalize: (
      input: NormalizeRequirementInput,
    ) => Promise<DesktopResult<RequirementRepresentationDto>>;
    readonly getRepresentation: (
      input: GetRequirementRepresentationInput,
    ) => Promise<DesktopResult<RequirementRepresentationDto | null>>;
    readonly updateRepresentation: (
      input: UpdateRequirementRepresentationInput,
    ) => Promise<DesktopResult<RequirementRepresentationDto>>;
    readonly regenerateRepresentation: (
      input: RegenerateRequirementRepresentationInput,
    ) => Promise<DesktopResult<RequirementRepresentationDto>>;
    readonly batchNormalize: (
      input: BatchNormalizeRequirementsInput,
    ) => Promise<DesktopResult<BatchNormalizeRequirementsResultDto>>;
    readonly classify: (
      input: ClassifyRequirementInput,
    ) => Promise<DesktopResult<RequirementMetadataDto>>;
    readonly getMetadata: (
      input: GetRequirementMetadataInput,
    ) => Promise<DesktopResult<RequirementMetadataDto | null>>;
    readonly updateMetadata: (
      input: UpdateRequirementMetadataInput,
    ) => Promise<DesktopResult<RequirementMetadataDto>>;
    readonly regenerateMetadata: (
      input: RegenerateRequirementMetadataInput,
    ) => Promise<DesktopResult<RequirementMetadataDto>>;
    readonly batchClassify: (
      input: BatchClassifyRequirementsInput,
    ) => Promise<DesktopResult<BatchClassifyRequirementsResultDto>>;
    readonly analyzeQuality: (
      input: AnalyzeRequirementQualityInput,
    ) => Promise<DesktopResult<RequirementQualityAnalysisDto>>;
    readonly getQualityAnalysis: (
      input: GetRequirementQualityAnalysisInput,
    ) => Promise<DesktopResult<RequirementQualityAnalysisDto | null>>;
    readonly reviewQualityFinding: (
      input: ReviewRequirementQualityFindingInput,
    ) => Promise<DesktopResult<RequirementQualityFindingDto>>;
    readonly reanalyzeQuality: (
      input: ReanalyzeRequirementQualityInput,
    ) => Promise<DesktopResult<RequirementQualityAnalysisDto>>;
    readonly batchAnalyzeQuality: (
      input: BatchAnalyzeRequirementQualityInput,
    ) => Promise<DesktopResult<BatchAnalyzeQualityResultDto>>;
    readonly proposeRelationships: (
      input: ProposeRelationshipsInput,
    ) => Promise<DesktopResult<ProposeRelationshipsResultDto>>;
    readonly getRelationships: (
      input: GetRelationshipsInput,
    ) => Promise<DesktopResult<readonly RequirementRelationshipDto[]>>;
    readonly getRelationshipGraph: (
      input: GetRelationshipGraphInput,
    ) => Promise<DesktopResult<RelationshipGraphDto>>;
    readonly createManualRelationship: (
      input: CreateManualRelationshipInput,
    ) => Promise<DesktopResult<RequirementRelationshipDto>>;
    readonly reviewRelationship: (
      input: ReviewRelationshipInput,
    ) => Promise<DesktopResult<RequirementRelationshipDto>>;
    readonly deleteRelationship: (
      input: DeleteRelationshipInput,
    ) => Promise<DesktopResult<{ readonly deleted: true }>>;
    readonly matchRepositoryEvidence: (
      input: MatchRepositoryEvidenceInput,
    ) => Promise<DesktopResult<MatchRepositoryEvidenceResultDto>>;
    readonly getRepositoryEvidence: (
      input: GetRepositoryEvidenceInput,
    ) => Promise<DesktopResult<readonly RequirementRepositoryEvidenceDto[]>>;
    readonly reviewRepositoryEvidence: (
      input: ReviewRepositoryEvidenceInput,
    ) => Promise<DesktopResult<RequirementRepositoryEvidenceDto>>;
    readonly createManualRepositoryEvidence: (
      input: CreateManualRepositoryEvidenceInput,
    ) => Promise<DesktopResult<RequirementRepositoryEvidenceDto>>;
    readonly deleteRepositoryEvidence: (
      input: DeleteRepositoryEvidenceInput,
    ) => Promise<DesktopResult<{ readonly deleted: true }>>;
    readonly previewRepositoryEvidence: (
      input: PreviewRepositoryEvidenceInput,
    ) => Promise<DesktopResult<EvidencePreviewDto>>;
    readonly getHistory: (
      input: GetRequirementHistoryInput,
    ) => Promise<DesktopResult<RequirementHistoryDto>>;
    readonly getVersion: (
      input: GetRequirementVersionInput,
    ) => Promise<DesktopResult<RequirementVersionDto | null>>;
    readonly compareVersions: (
      input: CompareRequirementVersionsInput,
    ) => Promise<DesktopResult<RequirementDiffDto>>;
    readonly updateVersioned: (input: UpdateRequirementVersionedInput) => Promise<
      DesktopResult<{
        readonly requirement: RequirementDto;
        readonly version: RequirementVersionDto;
      }>
    >;
    readonly restoreVersion: (input: RestoreRequirementVersionInput) => Promise<
      DesktopResult<{
        readonly requirement: RequirementDto;
        readonly newVersion: RequirementVersionDto;
      }>
    >;
    readonly getChangeImpact: (
      input: GetRequirementChangeImpactInput,
    ) => Promise<DesktopResult<RequirementImpactsResultDto>>;
    readonly reviewChangeImpact: (
      input: ReviewRequirementImpactInput,
    ) => Promise<DesktopResult<RequirementImpactCandidateDto>>;
  };
  readonly requirementSources: {
    readonly list: (
      input: ListRequirementSourcesInput,
    ) => Promise<DesktopResult<readonly RequirementSourceDto[]>>;
    readonly get: (
      input: GetRequirementSourceInput,
    ) => Promise<DesktopResult<RequirementSourceDto | null>>;
  };
  readonly requirementDocuments: {
    readonly selectAndIngest: (
      input: SelectAndIngestDocumentInput,
    ) => Promise<DesktopResult<SelectAndIngestDocumentResult>>;
    readonly list: (
      input: ListRequirementDocumentsInput,
    ) => Promise<DesktopResult<readonly RequirementDocumentDto[]>>;
    readonly get: (
      input: GetRequirementDocumentInput,
    ) => Promise<DesktopResult<RequirementDocumentDto | null>>;
    readonly delete: (
      input: DeleteRequirementDocumentInput,
    ) => Promise<DesktopResult<{ readonly deleted: true }>>;
    readonly extract: (
      input: ExtractRequirementDocumentInput,
    ) => Promise<DesktopResult<RequirementDocumentExtractionDto>>;
    readonly getExtraction: (
      input: GetRequirementDocumentExtractionInput,
    ) => Promise<DesktopResult<RequirementDocumentExtractionDto | null>>;
  };
  readonly requirementCandidates: {
    readonly detect: (
      input: DetectRequirementCandidatesInput,
    ) => Promise<DesktopResult<readonly RequirementCandidateDto[]>>;
    readonly list: (
      input: ListRequirementCandidatesInput,
    ) => Promise<DesktopResult<RequirementCandidateListDto>>;
    readonly update: (
      input: UpdateRequirementCandidateInput,
    ) => Promise<DesktopResult<RequirementCandidateDto>>;
    readonly setStatus: (
      input: SetRequirementCandidateStatusInput,
    ) => Promise<DesktopResult<readonly RequirementCandidateDto[]>>;
    readonly import: (
      input: ImportApprovedCandidatesInput,
    ) => Promise<DesktopResult<ImportCandidatesResultDto>>;
  };
  readonly ai: {
    readonly getProviderStatus: (
      input?: GetAiProviderStatusInput,
    ) => Promise<DesktopResult<readonly AiProviderStatusDto[]>>;
    readonly healthCheck: (
      input: AiHealthCheckInput,
    ) => Promise<DesktopResult<AiProviderStatusDto>>;
    readonly generate: (
      input: AiGenerationRequestDto,
    ) => Promise<DesktopResult<AiGenerationResultDto>>;
    readonly getConfigDefaults: () => Promise<DesktopResult<AiGenerationConfigDto>>;
    readonly executePrompt: (
      input: AiPromptExecutionInputDto,
    ) => Promise<DesktopResult<AiStructuredResultDto<unknown>>>;
    readonly getEmbeddingIndexStatus: (input: {
      readonly projectId: string;
    }) => Promise<DesktopResult<EmbeddingIndexStatusDto>>;
    readonly indexSubjects: (
      input: IndexSubjectsInputDto,
    ) => Promise<DesktopResult<IndexSubjectsResultDto>>;
    readonly searchSimilar: (
      input: VectorSearchQueryDto,
    ) => Promise<DesktopResult<readonly VectorMatchDto[]>>;
    readonly reindexStale: (input: {
      readonly projectId: string;
    }) => Promise<DesktopResult<IndexSubjectsResultDto>>;
    readonly retrieveRequirementContext: (
      input: RetrieveRequirementContextInputDto,
    ) => Promise<DesktopResult<RequirementContextPackDto>>;
    readonly getRagConfigDefaults: () => Promise<DesktopResult<RagRetrievalConfigDto>>;
    readonly analyzeRequirement: (
      input: AnalyzeRequirementInputDto,
    ) => Promise<DesktopResult<RequirementAiAnalysisDto>>;
    readonly getRequirementAnalysis: (
      input: GetRequirementAnalysisInputDto,
    ) => Promise<DesktopResult<RequirementAiAnalysisDto | null>>;
    readonly getRequirementAnalysisHistory: (
      input: GetRequirementAnalysisHistoryInputDto,
    ) => Promise<DesktopResult<readonly RequirementAiAnalysisDto[]>>;
    readonly regenerateRequirementAnalysis: (
      input: RegenerateRequirementAnalysisInputDto,
    ) => Promise<DesktopResult<RequirementAiAnalysisDto>>;
  };
  readonly testDesign: {
    readonly analyze: (
      input: AnalyzeTestDesignInputDto,
    ) => Promise<DesktopResult<TestDesignPlanDto>>;
    readonly getCurrent: (
      input: GetTestDesignInputDto,
    ) => Promise<DesktopResult<TestDesignPlanDto | null>>;
    readonly getHistory: (
      input: GetTestDesignHistoryInputDto,
    ) => Promise<DesktopResult<readonly TestDesignPlanDto[]>>;
    readonly regenerate: (
      input: RegenerateTestDesignInputDto,
    ) => Promise<DesktopResult<TestDesignPlanDto>>;
  };
  readonly scenarios: {
    readonly generate: (
      input: GenerateScenariosInputDto,
    ) => Promise<DesktopResult<RequirementScenarioGenerationDto>>;
    readonly getCurrent: (
      input: GetRequirementScenariosInputDto,
    ) => Promise<DesktopResult<RequirementScenarioGenerationDto | null>>;
    readonly getHistory: (
      input: GetRequirementScenariosHistoryInputDto,
    ) => Promise<DesktopResult<readonly RequirementScenarioGenerationDto[]>>;
    readonly regenerate: (
      input: RegenerateRequirementScenariosInputDto,
    ) => Promise<DesktopResult<RequirementScenarioGenerationDto>>;
  };
  readonly categorizedTests: {
    readonly generate: (
      input: GenerateCategorizedTestsInputDto,
    ) => Promise<DesktopResult<CategorizedTestGenerationResultDto>>;
    readonly getCurrent: (
      input: GetCategorizedTestsInputDto,
    ) => Promise<DesktopResult<CategorizedTestGenerationResultDto | null>>;
  };
  readonly testSpecifications: {
    readonly enrich: (
      input: EnrichTestSpecificationInputDto,
    ) => Promise<DesktopResult<TestSpecificationEnrichmentResultDto>>;
    readonly getCurrent: (
      input: GetEnrichedTestSpecificationsInputDto,
    ) => Promise<DesktopResult<TestSpecificationEnrichmentResultDto | null>>;
  };
  readonly testCases: {
    readonly create: (input: CreateTestCaseInputDto) => Promise<DesktopResult<TestCaseDetailDto>>;
    readonly getById: (
      input: GetTestCaseByIdInputDto,
    ) => Promise<DesktopResult<TestCaseDetailDto | null>>;
    readonly list: (input: ListTestCasesInputDto) => Promise<DesktopResult<TestCaseListResultDto>>;
    readonly persistFromGeneration: (
      input: PersistGeneratedTestCaseInputDto,
    ) => Promise<DesktopResult<TestCaseDetailDto>>;
    readonly persistBatchFromGeneration: (
      input: PersistGeneratedTestCasesBatchInputDto,
    ) => Promise<DesktopResult<BatchPersistTestCasesResultDto>>;
    readonly delete: (
      input: DeleteTestCaseInputDto,
    ) => Promise<DesktopResult<{ readonly deleted: true }>>;
  };
  readonly testValidation: {
    readonly validateTestCase: (
      input: ValidateTestCaseInputDto,
    ) => Promise<DesktopResult<TestCaseValidationDto>>;
    readonly validateSpecification: (
      input: ValidateSpecificationInputDto,
    ) => Promise<DesktopResult<TestCaseValidationDto>>;
    readonly validateBatch: (
      input: ValidateTestBatchInputDto,
    ) => Promise<DesktopResult<BatchValidationResultDto>>;
    readonly getLatest: (
      input: GetLatestValidationInputDto,
    ) => Promise<DesktopResult<TestCaseValidationDto | null>>;
    readonly listHistory: (
      input: ListValidationHistoryInputDto,
    ) => Promise<DesktopResult<readonly TestCaseValidationDto[]>>;
  };
  readonly traceability: {
    readonly createTrace: (
      input: CreateRequirementTestTraceInputDto,
    ) => Promise<DesktopResult<RequirementTestTraceDto>>;
    readonly deleteTrace: (
      input: DeleteRequirementTestTraceInputDto,
    ) => Promise<DesktopResult<{ readonly deleted: true }>>;
    readonly getById: (
      input: GetTraceByIdInputDto,
    ) => Promise<DesktopResult<RequirementTestTraceDto | null>>;
    readonly listByRequirement: (
      input: ListTracesByRequirementInputDto,
    ) => Promise<DesktopResult<ListTracesResultDto>>;
    readonly listByTestCase: (
      input: ListTracesByTestCaseInputDto,
    ) => Promise<DesktopResult<ListTracesResultDto>>;
    readonly listProjectTraces: (
      input: ListProjectTracesInputDto,
    ) => Promise<DesktopResult<ListTracesResultDto>>;
  };
  readonly coverage: {
    readonly getProjectSummary: (
      input: GetProjectCoverageInputDto,
    ) => Promise<DesktopResult<ProjectCoverageSummaryDto>>;
    readonly getRequirementCoverage: (
      input: GetRequirementCoverageInputDto,
    ) => Promise<DesktopResult<RequirementCoverageDetailDto>>;
    readonly getTraceabilityMatrix: (
      input: GetTraceabilityMatrixInputDto,
    ) => Promise<DesktopResult<TraceabilityMatrixResultDto>>;
    readonly getReverseTraceability: (
      input: GetReverseTraceabilityInputDto,
    ) => Promise<DesktopResult<ReverseTraceabilityResultDto>>;
    readonly getOrphanTests: (
      input: GetOrphanTestsInputDto,
    ) => Promise<DesktopResult<OrphanTestsResultDto>>;
  };
  readonly testReview: {
    readonly listQueue: (
      input: ListTestReviewQueueInputDto,
    ) => Promise<DesktopResult<TestReviewQueueResultDto>>;
    readonly getDetail: (
      input: GetTestReviewDetailInputDto,
    ) => Promise<DesktopResult<TestReviewDetailDto>>;
    readonly approve: (
      input: ApproveTestVersionInputDto,
    ) => Promise<DesktopResult<TestReviewDetailDto>>;
    readonly reject: (
      input: RejectTestVersionInputDto,
    ) => Promise<DesktopResult<TestReviewDetailDto>>;
    readonly edit: (input: EditTestCaseInputDto) => Promise<DesktopResult<TestReviewDetailDto>>;
    readonly regenerate: (
      input: RegenerateTestCaseInputDto,
    ) => Promise<DesktopResult<TestReviewDetailDto>>;
    readonly getHistory: (
      input: GetTestHistoryInputDto,
    ) => Promise<DesktopResult<TestHistoryResultDto>>;
    readonly compareVersions: (
      input: CompareTestVersionsInputDto,
    ) => Promise<DesktopResult<TestVersionDiffDto>>;
  };
  readonly logging: {
    readonly reportRendererError: (
      report: RendererErrorReport,
    ) => Promise<DesktopResult<RendererErrorReportResult>>;
  };
}
