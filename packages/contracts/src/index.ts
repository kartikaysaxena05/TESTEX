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
  PROJECTS_MARK_OPENED: 'desktop:projects:mark-opened',

  // Website Target & Live Production Safety Channels (V8 Phase 119)
  WEBSITE_TARGETS_CREATE: 'desktop:website-targets:create',
  WEBSITE_TARGETS_GET: 'desktop:website-targets:get',
  WEBSITE_TARGETS_LIST: 'desktop:website-targets:list',
  WEBSITE_TARGETS_UPDATE: 'desktop:website-targets:update',
  WEBSITE_TARGETS_DELETE: 'desktop:website-targets:delete',
  WEBSITE_TARGETS_SET_ACTIVE: 'desktop:website-targets:set-active',
  WEBSITE_TARGETS_TEST_CONNECTION: 'desktop:website-targets:test-connection',
  WEBSITE_TARGETS_CONFIRM_AUTH: 'desktop:website-targets:confirm-auth',
  WEBSITE_TARGETS_RESOLVE_SNAPSHOT: 'desktop:website-targets:resolve-snapshot',

  // Git Repository Connection & Import Channels (V8 Phase 120)
  REPOSITORY_CONNECTIONS_LIST: 'desktop:repository-connections:list',
  REPOSITORY_CONNECTIONS_GET: 'desktop:repository-connections:get',
  REPOSITORY_CONNECTIONS_CREATE: 'desktop:repository-connections:create',
  REPOSITORY_CONNECTIONS_UPDATE: 'desktop:repository-connections:update',
  REPOSITORY_CONNECTIONS_DELETE: 'desktop:repository-connections:delete',
  REPOSITORY_CONNECTIONS_SET_ACTIVE: 'desktop:repository-connections:set-active',
  REPOSITORY_CONNECTIONS_VERIFY: 'desktop:repository-connections:verify',
  REPOSITORY_CONNECTIONS_IMPORT: 'desktop:repository-connections:import',
  REPOSITORY_CONNECTIONS_CANCEL_IMPORT: 'desktop:repository-connections:cancel-import',
  REPOSITORY_CONNECTIONS_RESOLVE_SNAPSHOT: 'desktop:repository-connections:resolve-snapshot',
  REPOSITORY_PROVIDER_VERIFY_AUTH: 'desktop:repository-provider:verify-auth',
  REPOSITORY_PROVIDER_LIST_REPOS: 'desktop:repository-provider:list-repos',
  REPOSITORY_PROVIDER_LIST_BRANCHES: 'desktop:repository-provider:list-branches',

  // Local Project Folder & Secure File Access Channels (V8 Phase 121)
  LOCAL_FOLDER_CONNECT: 'desktop:local-folder:connect',
  LOCAL_FOLDER_DISCONNECT: 'desktop:local-folder:disconnect',
  LOCAL_FOLDER_VALIDATE: 'desktop:local-folder:validate',
  LOCAL_FOLDER_GET: 'desktop:local-folder:get',
  LOCAL_FOLDER_LIST_DIRECTORY: 'desktop:local-folder:list-directory',
  LOCAL_FOLDER_READ_FILE: 'desktop:local-folder:read-file',
  LOCAL_FOLDER_SEARCH: 'desktop:local-folder:search',
  LOCAL_FOLDER_CHECK_EXISTS: 'desktop:local-folder:check-exists',
  LOCAL_FOLDER_GET_METADATA: 'desktop:local-folder:get-metadata',
  LOCAL_FOLDER_DETECT_GIT: 'desktop:local-folder:detect-git',

  // Browser, Target Environment & Authentication Channels (V8 Phase 122)
  TARGET_ENV_GET: 'desktop:target-env:get',
  TARGET_ENV_LIST: 'desktop:target-env:list',
  TARGET_ENV_SAVE: 'desktop:target-env:save',
  TARGET_ENV_SET_ACTIVE: 'desktop:target-env:set-active',
  TARGET_ENV_DELETE: 'desktop:target-env:delete',
  TARGET_ENV_TEST_CONNECTION: 'desktop:target-env:test-connection',
  TARGET_ENV_TEST_AUTH: 'desktop:target-env:test-auth',
  TARGET_ENV_RESOLVE_TARGET: 'desktop:target-env:resolve-target',

  // Unified Project Context & Source Detection Channels (V8 Phase 123)
  PROJECT_CONTEXT_GET: 'desktop:project-context:get',
  PROJECT_CONTEXT_DETECT: 'desktop:project-context:detect',
  PROJECT_CONTEXT_REFRESH: 'desktop:project-context:refresh',
  PROJECT_CONTEXT_INVALIDATE: 'desktop:project-context:invalidate',
  PROJECT_CONTEXT_STATUS: 'desktop:project-context:status',

  // Conversational AI Testing Agent & Run Controls (V8 Phase 124)
  AGENT_SESSION_CREATE: 'desktop:agent:session:create',
  AGENT_SESSION_GET: 'desktop:agent:session:get',
  AGENT_SESSION_LIST: 'desktop:agent:session:list',
  AGENT_SESSION_DELETE: 'desktop:agent:session:delete',
  AGENT_SEND_MESSAGE: 'desktop:agent:message:send',
  AGENT_APPROVE_ACTION: 'desktop:agent:action:approve',
  AGENT_RUN_CONTROL: 'desktop:agent:run:control',
  AGENT_GET_EVIDENCE: 'desktop:agent:evidence:get',

  // AI Provider Abstraction Channels (V9 Phase 126 & 127)
  AI_PROVIDER_LIST: 'desktop:ai:provider:list',
  AI_PROVIDER_GET: 'desktop:ai:provider:get',
  AI_REQUEST_VALIDATE: 'desktop:ai:request:validate',
  AI_CONFIG_GET: 'desktop:ai:config:get',
  AI_CONFIG_UPDATE: 'desktop:ai:config:update',
  AI_OLLAMA_GET_STATUS: 'desktop:ai:ollama:get-status',
  AI_OLLAMA_HEALTH_CHECK: 'desktop:ai:ollama:health-check',
  AI_OLLAMA_GET_CONFIG: 'desktop:ai:ollama:get-config',
  AI_OLLAMA_SET_CONFIG: 'desktop:ai:ollama:set-config',

  // Installed Model Discovery Channels (V9 Phase 128)
  AI_MODELS_LIST: 'desktop:ai:models:list',
  AI_MODELS_REFRESH: 'desktop:ai:models:refresh',
  AI_MODELS_GET: 'desktop:ai:models:get',

  // Model Selection & Capability Detection Channels (V9 Phase 129)
  AI_MODELS_GET_CAPABILITIES: 'desktop:ai:models:get-capabilities',
  AI_MODELS_VERIFY_CAPABILITIES: 'desktop:ai:models:verify-capabilities',
  AI_MODELS_SELECT: 'desktop:ai:models:select',
  AI_MODELS_GET_SELECTION: 'desktop:ai:models:get-selection',
  AI_MODELS_RESOLVE_FOR_TASK: 'desktop:ai:models:resolve-for-task',

  // AI Generation Runtime Channels (V9 Phase 130)
  AI_GENERATION_GENERATE: 'desktop:ai:generation:generate',
  AI_GENERATION_CANCEL: 'desktop:ai:generation:cancel',
  AI_GENERATION_GET_STATUS: 'desktop:ai:generation:get-status',

  // AI Streaming Response Infrastructure Channels (V9 Phase 131)
  AI_GENERATION_STREAM: 'desktop:ai:generation:stream',
  AI_STREAM_EVENT: 'desktop:ai:stream:event',
  AI_STREAM_START: 'desktop:ai:stream:start',
  AI_STREAM_DELTA: 'desktop:ai:stream:delta',
  AI_STREAM_COMPLETE: 'desktop:ai:stream:complete',
  AI_STREAM_ERROR: 'desktop:ai:stream:error',
  AI_STREAM_CANCELLED: 'desktop:ai:stream:cancelled',

  // Structured Output & Schema Validation Channels (V9 Phase 132)
  AI_STRUCTURED_GENERATE: 'desktop:ai:structured:generate',
  AI_STRUCTURED_VALIDATE: 'desktop:ai:structured:validate',
  AI_STRUCTURED_GET_CAPABILITIES: 'desktop:ai:structured:get-capabilities',

  // Tool-Calling Compatibility Layer Channels (V9 Phase 133)
  AI_TOOL_LIST: 'desktop:ai:tool:list',
  AI_TOOL_GET: 'desktop:ai:tool:get',
  AI_TOOL_PARSE_CALL: 'desktop:ai:tool:parse-call',
  AI_TOOL_VALIDATE_CALL: 'desktop:ai:tool:validate-call',
  AI_TOOL_GENERATE_CALLS: 'desktop:ai:tool:generate-calls',
  AI_TOOL_GET_CAPABILITIES: 'desktop:ai:tool:get-capabilities',

  // Context Window & Token Management Channels (V9 Phase 134)
  AI_CONTEXT_ESTIMATE_TOKENS: 'desktop:ai:context:estimate-tokens',
  AI_CONTEXT_CALCULATE_BUDGET: 'desktop:ai:context:calculate-budget',
  AI_CONTEXT_OPTIMIZE_SELECTION: 'desktop:ai:context:optimize-selection',
  AI_CONTEXT_GET_CAPABILITIES: 'desktop:ai:context:get-capabilities',

  // Requirement & Test Context Adapter Channels (V9 Phase 136)
  AI_CONTEXT_ASSEMBLE_REQ_TEST: 'desktop:ai:context:assemble-req-test',

  // AI Privacy & Local-Only AI Mode Channels (V9 Phase 137)
  AI_PRIVACY_GET_SETTINGS: 'desktop:ai:privacy:get-settings',
  AI_PRIVACY_UPDATE_SETTINGS: 'desktop:ai:privacy:update-settings',
  AI_PRIVACY_CHECK_FIREWALL: 'desktop:ai:privacy:check-firewall',

  // AI Provider Switching & Fallback Channels (V9 Phase 138)
  AI_FALLBACK_GET_POLICY: 'desktop:ai:fallback:get-policy',
  AI_FALLBACK_SET_POLICY: 'desktop:ai:fallback:set-policy',
  AI_PROVIDERS_LIST: 'desktop:ai:providers:list',
  AI_PROVIDERS_STATUS: 'desktop:ai:providers:status',
  AI_PROVIDERS_SELECT: 'desktop:ai:providers:select',

  // Performance, Cancellation & Runtime Recovery Channels (V9 Phase 139)
  AI_LIFECYCLE_GET_ACTIVE_REQUESTS: 'desktop:ai:lifecycle:get-active-requests',
  AI_LIFECYCLE_GET_METRICS: 'desktop:ai:lifecycle:get-metrics',
  AI_LIFECYCLE_RECOVER_INTERRUPTED: 'desktop:ai:lifecycle:recover-interrupted',

  // Agent Runtime Foundation Channels (V10 Phase 141)
  AGENT_RUNTIME_TASK_CREATE: 'desktop:agent:runtime:task:create',
  AGENT_RUNTIME_TASK_GET: 'desktop:agent:runtime:task:get',
  AGENT_RUNTIME_TASK_CANCEL: 'desktop:agent:runtime:task:cancel',
  AGENT_RUNTIME_TASK_GET_EVENTS: 'desktop:agent:runtime:task:get-events',

  // Task / Conversation / Thread Model Channels (V10 Phase 142)
  AGENT_THREAD_CREATE: 'desktop:agent:threads:create',
  AGENT_THREAD_LIST: 'desktop:agent:threads:list',
  AGENT_THREAD_GET: 'desktop:agent:threads:get',
  AGENT_THREAD_ARCHIVE: 'desktop:agent:threads:archive',
  AGENT_THREAD_TASK_CREATE: 'desktop:agent:tasks:create',
  AGENT_THREAD_TASK_GET: 'desktop:agent:tasks:get',
  AGENT_THREAD_TASK_LIST: 'desktop:agent:tasks:list',
  AGENT_THREAD_TASK_CANCEL: 'desktop:agent:tasks:cancel',
  AGENT_THREAD_TASK_RETRY: 'desktop:agent:tasks:retry',
  AGENT_THREAD_TASK_RESUME: 'desktop:agent:tasks:resume',
  AGENT_THREAD_TASK_STOP: 'desktop:agent:tasks:stop',
  AGENT_THREAD_TASK_PAUSE: 'desktop:agent:tasks:pause',
  AGENT_TASK_CONTROL_AUDIT_LOGS_LIST: 'desktop:agent:tasks:audit-logs:list',
  AGENT_THREAD_TASK_GET_RECOVERY_STATE: 'desktop:agent:tasks:recovery-state:get',
  AGENT_THREAD_TASK_LIST_RECOVERABLE: 'desktop:agent:tasks:recoverable:list',
  AGENT_TASK_CHECKPOINTS_LIST: 'desktop:agent:tasks:checkpoints:list',
  AGENT_THREAD_MESSAGE_LIST: 'desktop:agent:messages:list',
  AGENT_EXECUTION_STEP_LIST: 'desktop:agent:execution:list',
  AGENT_TOOL_CALL_LIST: 'desktop:agent:tool-calls:list',
  AGENT_WORKFLOW_EXECUTE: 'desktop:agent:workflow:execute',
  AGENT_WORKFLOW_GET_REPORT: 'desktop:agent:workflow:report:get',
  AGENT_WORKFLOW_APPROVE_FIX: 'desktop:agent:workflow:fix:approve',
  AGENT_WORKFLOW_REJECT_FIX: 'desktop:agent:workflow:fix:reject',

  // Tool Registry & Invocation Channels (V10 Phase 143)
  AGENT_TOOL_REGISTRY_LIST: 'desktop:agent:tool-registry:list',
  AGENT_TOOL_REGISTRY_GET: 'desktop:agent:tool-registry:get',
  AGENT_TOOL_REGISTRY_INVOKE: 'desktop:agent:tool-registry:invoke',

  // Tool Permission & Approval Channels (V10 Phase 144)
  AGENT_TOOL_APPROVAL_LIST: 'desktop:agent:tool-approvals:list',
  AGENT_TOOL_APPROVAL_GET: 'desktop:agent:tool-approvals:get',
  AGENT_TOOL_APPROVAL_DECIDE: 'desktop:agent:tool-approvals:decide',
  AGENT_TOOL_AUDIT_LOG_LIST: 'desktop:agent:tool-audit-logs:list',

  // Environment Management Channels
  PROJECTS_ENVIRONMENTS_CREATE: 'desktop:projects:environments:create',
  PROJECTS_ENVIRONMENTS_UPDATE: 'desktop:projects:environments:update',
  PROJECTS_ENVIRONMENTS_DELETE: 'desktop:projects:environments:delete',
  PROJECTS_ENVIRONMENTS_SET_DEFAULT: 'desktop:projects:environments:set-default',

  // Source Attachment & Intelligence Channels (V2 Phases 15–25)
  SOURCES_GET: 'desktop:sources:get',
  SOURCES_PICK_DIRECTORY: 'desktop:sources:pick-directory',
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

  // Autonomous Test Execution Foundation Channels (V5 Phase 58)
  EXECUTION_GET_CAPABILITIES: 'desktop:execution:get-capabilities',
  EXECUTION_RUNTIME_SMOKE: 'desktop:execution:runtime-smoke',
  EXECUTION_VALIDATE_ELIGIBILITY: 'desktop:execution:validate-eligibility',

  // Target Application & Test Environment Configuration Channels (V5 Phase 59)
  TARGET_APP_GET: 'desktop:target-applications:get',
  TARGET_APP_UPDATE: 'desktop:target-applications:update',
  ENVIRONMENT_LIST: 'desktop:environments:list',
  ENVIRONMENT_GET: 'desktop:environments:get',
  ENVIRONMENT_CREATE: 'desktop:environments:create',
  ENVIRONMENT_UPDATE: 'desktop:environments:update',
  ENVIRONMENT_DELETE: 'desktop:environments:delete',
  ENVIRONMENT_SET_DEFAULT: 'desktop:environments:set-default',
  ENVIRONMENT_CHECK_REACHABILITY: 'desktop:environments:check-reachability',
  ENVIRONMENT_RESOLVE_SNAPSHOT: 'desktop:environments:resolve-snapshot',

  // Structured Test-to-Executable Plan Compiler Channels (V5 Phase 60)
  PLAN_COMPILER_COMPILE: 'desktop:plan-compiler:compile',
  PLAN_COMPILER_GET: 'desktop:plan-compiler:get',
  PLAN_COMPILER_GET_BY_TEST_CASE: 'desktop:plan-compiler:get-by-test-case',
  PLAN_COMPILER_LIST: 'desktop:plan-compiler:list',
  PLAN_COMPILER_PREVIEW: 'desktop:plan-compiler:preview',

  // Test Run Orchestration, Queue & State Machine Channels (V5 Phase 61)
  TEST_RUN_ENQUEUE: 'desktop:test-runs:enqueue',
  TEST_RUN_GET: 'desktop:test-runs:get',
  TEST_RUN_LIST: 'desktop:test-runs:list',
  TEST_RUN_CANCEL: 'desktop:test-runs:cancel',
  TEST_RUN_GET_QUEUE_STATE: 'desktop:test-runs:get-queue-state',

  // Browser Context, Session & Authentication Channels (V5 Phase 62)
  AUTH_PROFILE_CREATE: 'desktop:auth-profiles:create',
  AUTH_PROFILE_GET: 'desktop:auth-profiles:get',
  AUTH_PROFILE_LIST: 'desktop:auth-profiles:list',
  AUTH_PROFILE_UPDATE: 'desktop:auth-profiles:update',
  AUTH_PROFILE_DELETE: 'desktop:auth-profiles:delete',
  AUTH_PROFILE_VALIDATE: 'desktop:auth-profiles:validate',

  // Action Execution Engine Channels (V5 Phase 63)
  EXECUTION_EXECUTE_ACTION: 'desktop:execution:execute-action',
  EXECUTION_EXECUTE_STEP: 'desktop:execution:execute-step',

  // UI Element Resolution & Locator Intelligence Channels (V5 Phase 64)
  EXECUTION_RESOLVE_LOCATOR: 'desktop:execution:resolve-locator',

  // Navigation, Waiting & Synchronization Channels (V5 Phase 66)
  EXECUTION_SYNCHRONIZE: 'desktop:execution:synchronize',

  // Assertion & Expected-vs-Actual Verification Channels (V5 Phase 67)
  EXECUTION_ASSERT: 'desktop:execution:assert',
  EXECUTION_EVALUATE_ASSERTIONS: 'desktop:execution:evaluate-assertions',

  // Execution Persistence & Step-Level Audit Trail Channels (V5 Phase 68)
  EXECUTION_HISTORY_GET_EXECUTION: 'desktop:execution-history:get-execution',
  EXECUTION_HISTORY_LIST_EXECUTIONS: 'desktop:execution-history:list-executions',
  EXECUTION_HISTORY_GET_STEPS: 'desktop:execution-history:get-steps',
  EXECUTION_HISTORY_GET_TIMELINE: 'desktop:execution-history:get-timeline',
  EXECUTION_HISTORY_RECONCILE: 'desktop:execution-history:reconcile',

  // Failure Evidence Capture Foundation Channels (V5 Phase 69)
  EVIDENCE_CREATE_BUNDLE: 'desktop:evidence:create-bundle',
  EVIDENCE_ADD_ARTIFACT: 'desktop:evidence:add-artifact',
  EVIDENCE_FINALIZE_BUNDLE: 'desktop:evidence:finalize-bundle',
  EVIDENCE_GET_BUNDLE: 'desktop:evidence:get-bundle',
  EVIDENCE_LIST_BUNDLES: 'desktop:evidence:list-bundles',
  EVIDENCE_LIST_ARTIFACTS: 'desktop:evidence:list-artifacts',
  EVIDENCE_GET_ARTIFACT_METADATA: 'desktop:evidence:get-artifact-metadata',
  EVIDENCE_GET_ARTIFACT_CONTENT: 'desktop:evidence:get-artifact-content',
  EVIDENCE_VERIFY_INTEGRITY: 'desktop:evidence:verify-integrity',

  // Retry, Flakiness Detection & Execution Recovery Channels (V5 Phase 71)
  EXECUTION_GET_ATTEMPTS: 'desktop:execution:get-attempts',
  EXECUTION_EVALUATE_RELIABILITY: 'desktop:execution:evaluate-reliability',

  // Self-Healing Locators, Parallel Execution & Isolation Controls (V5 Phase 72)
  EXECUTION_GET_HEALING_ATTEMPTS: 'desktop:execution:get-healing-attempts',
  EXECUTION_LIST_HEALING_SUGGESTIONS: 'desktop:execution:list-healing-suggestions',
  EXECUTION_REVIEW_HEALING_SUGGESTION: 'desktop:execution:review-healing-suggestion',
  EXECUTION_GET_PARALLEL_POOL_STATE: 'desktop:execution:get-parallel-pool-state',

  // Diagnostic Error Reporting Channel (Narrow Renderer Capability)
  LOGGING_REPORT_RENDERER_ERROR: 'desktop:logging:report-renderer-error',

  // Failure Intelligence Foundation Channels (V6 Phase 74)
  FAILURES_CREATE_CASE: 'desktop:failures:create-case',
  FAILURES_ENSURE_CASE: 'desktop:failures:ensure-case',
  FAILURES_GET_CASE: 'desktop:failures:get-case',
  FAILURES_LIST_CASES: 'desktop:failures:list-cases',
  FAILURES_START_ANALYSIS: 'desktop:failures:start-analysis',
  FAILURES_COMPLETE_ANALYSIS: 'desktop:failures:complete-analysis',
  FAILURES_FAIL_ANALYSIS: 'desktop:failures:fail-analysis',
  FAILURES_CANCEL_ANALYSIS: 'desktop:failures:cancel-analysis',
  FAILURES_MARK_STALE: 'desktop:failures:mark-stale',
  FAILURES_LIST_RUNS: 'desktop:failures:list-runs',
  FAILURES_LIST_EVIDENCE_REFERENCES: 'desktop:failures:list-evidence-references',

  // Failure Intelligence Evidence Ingestion & Normalization Channels (V6 Phase 75)
  FAILURES_INGEST_EVIDENCE: 'desktop:failures:ingest-evidence',
  FAILURES_GET_EVIDENCE_PACKAGE: 'desktop:failures:get-evidence-package',
  FAILURES_VERIFY_EVIDENCE_INTEGRITY: 'desktop:failures:verify-evidence-integrity',
  FAILURES_GET_EVIDENCE_ARTIFACT_CONTENT: 'desktop:failures:get-evidence-artifact-content',

  // Failure Reproduction & Reproducibility Verification Channels (V6 Phase 76)
  FAILURES_EXECUTE_REPRODUCTION: 'desktop:failures:execute-reproduction',
  FAILURES_GET_REPRODUCTION_ATTEMPTS: 'desktop:failures:get-reproduction-attempts',
  FAILURES_GET_REPRODUCIBILITY_SUMMARY: 'desktop:failures:get-reproducibility-summary',
  FAILURES_CANCEL_REPRODUCTION: 'desktop:failures:cancel-reproduction',

  // Failure Taxonomy & Deterministic Classification Channels (V6 Phase 77)
  FAILURES_CLASSIFY: 'desktop:failures:classify',
  FAILURES_GET_CLASSIFICATION: 'desktop:failures:get-classification',
  FAILURES_RECLASSIFY: 'desktop:failures:reclassify',
  FAILURES_LIST_CLASSIFICATION_HISTORY: 'desktop:failures:list-classification-history',

  // Failure Decision Integrity & Arbitration Channels (V6 Phase 78)
  FAILURES_EVALUATE_DECISION_INTEGRITY: 'desktop:failures:evaluate-decision-integrity',
  FAILURES_GET_DECISION_INTEGRITY: 'desktop:failures:get-decision-integrity',
  FAILURES_RECOMPUTE_DECISION_INTEGRITY: 'desktop:failures:recompute-decision-integrity',
  FAILURES_LIST_DECISION_INTEGRITY_HISTORY: 'desktop:failures:list-decision-integrity-history',

  // Failure Flakiness Detection & Reproducibility Intelligence Channels (V6 Phase 79)
  FAILURES_ANALYZE_FLAKINESS: 'desktop:failures:analyze-flakiness',
  FAILURES_GET_FLAKINESS_ANALYSIS: 'desktop:failures:get-flakiness-analysis',
  FAILURES_REANALYZE_FLAKINESS: 'desktop:failures:reanalyze-flakiness',
  FAILURES_LIST_FLAKINESS_HISTORY: 'desktop:failures:list-flakiness-history',

  // Failure Domain Separation Channels (V6 Phase 80)
  FAILURES_SEPARATE_FAILURE_DOMAIN: 'desktop:failures:separate-failure-domain',
  FAILURES_GET_DOMAIN_SEPARATION: 'desktop:failures:get-domain-separation',
  FAILURES_REEVALUATE_DOMAIN_SEPARATION: 'desktop:failures:reevaluate-domain-separation',
  FAILURES_LIST_DOMAIN_SEPARATION_HISTORY: 'desktop:failures:list-domain-separation-history',

  // Failure Evidence Correlation & Technical Cause Localization Channels (V6 Phase 81)
  FAILURES_LOCALIZE_TECHNICAL_CAUSE: 'desktop:failures:localize-technical-cause',
  FAILURES_GET_TECHNICAL_LOCALIZATION: 'desktop:failures:get-technical-localization',
  FAILURES_RELOCALIZE_TECHNICAL_CAUSE: 'desktop:failures:relocalize-technical-cause',
  FAILURES_LIST_LOCALIZATION_HISTORY: 'desktop:failures:list-localization-history',

  // Failure AI-Assisted Classification & Reasoning Channels (V6 Phase 82)
  FAILURES_ASSESS_WITH_AI: 'desktop:failures:assess-with-ai',
  FAILURES_GET_AI_ASSESSMENT: 'desktop:failures:get-ai-assessment',
  FAILURES_REASSESS_WITH_AI: 'desktop:failures:reassess-with-ai',
  FAILURES_LIST_AI_ASSESSMENT_HISTORY: 'desktop:failures:list-ai-assessment-history',

  // Root-Cause Analysis & Probable Layer Identification Channels (V6 Phase 83)
  FAILURES_ANALYZE_ROOT_CAUSE: 'desktop:failures:analyze-root-cause',
  FAILURES_GET_ROOT_CAUSE_ANALYSIS: 'desktop:failures:get-root-cause-analysis',
  FAILURES_REANALYZE_ROOT_CAUSE: 'desktop:failures:reanalyze-root-cause',
  FAILURES_LIST_ROOT_CAUSE_HISTORY: 'desktop:failures:list-root-cause-history',

  // Severity, Priority & Impact Intelligence Channels (V6 Phase 84)
  FAILURES_ASSESS_IMPACT: 'desktop:failures:assess-impact',
  FAILURES_GET_IMPACT_ASSESSMENT: 'desktop:failures:get-impact-assessment',
  FAILURES_REASSESS_IMPACT: 'desktop:failures:reassess-impact',
  FAILURES_LIST_IMPACT_HISTORY: 'desktop:failures:list-impact-history',

  // Duplicate Failure Detection & Defect Clustering Channels (V6 Phase 85)
  FAILURES_COMPARE_DUPLICATE: 'desktop:failures:compare-duplicate',
  FAILURES_CLUSTER_DEFECTS: 'desktop:failures:cluster-defects',
  FAILURES_GET_CLUSTER: 'desktop:failures:get-cluster',
  FAILURES_LIST_CLUSTERS: 'desktop:failures:list-clusters',
  FAILURES_GET_FAILURE_MEMBERSHIP: 'desktop:failures:get-failure-membership',
  FAILURES_MERGE_CLUSTERS: 'desktop:failures:merge-clusters',
  FAILURES_SPLIT_CLUSTER: 'desktop:failures:split-cluster',
  FAILURES_OVERRIDE_MEMBERSHIP: 'desktop:failures:override-membership',
  FAILURES_LIST_CLUSTER_HISTORY: 'desktop:failures:list-cluster-history',

  // Confidence Scoring, Explainability & Evidence Attribution Channels (V6 Phase 86)
  FAILURES_ASSESS_CONFIDENCE: 'desktop:failures:assess-confidence',
  FAILURES_GET_CONFIDENCE: 'desktop:failures:get-confidence',
  FAILURES_REASSESS_CONFIDENCE: 'desktop:failures:reassess-confidence',
  FAILURES_LIST_CONFIDENCE_HISTORY: 'desktop:failures:list-confidence-history',
  FAILURES_LIST_EVIDENCE_ATTRIBUTIONS: 'desktop:failures:list-evidence-attributions',

  // Structured Bug Report Generation & Workspace Channels (V6 Phase 87)
  FAILURES_CREATE_BUG_REPORT: 'desktop:failures:create-bug-report',
  FAILURES_GET_BUG_REPORT: 'desktop:failures:get-bug-report',
  FAILURES_LIST_BUG_REPORTS: 'desktop:failures:list-bug-reports',
  FAILURES_REGENERATE_BUG_REPORT: 'desktop:failures:regenerate-bug-report',
  FAILURES_LIST_BUG_REPORT_HISTORY: 'desktop:failures:list-bug-report-history',

  // Jira Integration Foundation Channels (V7 Phase 89 & 90)
  JIRA_CREATE_CONNECTION: 'desktop:jira:create-connection',
  JIRA_UPDATE_CONNECTION: 'desktop:jira:update-connection',
  JIRA_GET_CONNECTION: 'desktop:jira:get-connection',
  JIRA_DELETE_CONNECTION: 'desktop:jira:delete-connection',
  JIRA_VALIDATE_CONNECTION: 'desktop:jira:validate-connection',
  JIRA_LIST_AUDIT_LOG: 'desktop:jira:list-audit-log',
  JIRA_DISCOVER_SITES: 'desktop:jira:discover-sites',
  JIRA_DISCOVER_PROJECTS: 'desktop:jira:discover-projects',
  JIRA_DISCOVER_ISSUE_TYPES: 'desktop:jira:discover-issue-types',
  JIRA_DISCOVER_PRIORITIES: 'desktop:jira:discover-priorities',
  JIRA_DISCOVER_FIELDS: 'desktop:jira:discover-fields',
  JIRA_DISCOVER_COMPONENTS: 'desktop:jira:discover-components',
  JIRA_DISCOVER_ASSIGNEES: 'desktop:jira:discover-assignees',
  JIRA_GET_PROJECT_CONFIG: 'desktop:jira:get-project-config',
  JIRA_SAVE_PROJECT_CONFIG: 'desktop:jira:save-project-config',
  JIRA_REFRESH_PROJECT_CONFIG: 'desktop:jira:refresh-project-config',
  JIRA_TEST_CONNECTION_HEALTH: 'desktop:jira:test-connection-health',
  JIRA_CREATE_ISSUE: 'desktop:jira:create-issue',
  JIRA_GET_ISSUE: 'desktop:jira:get-issue',
  JIRA_LIST_ATTACHABLE_EVIDENCE: 'desktop:jira:list-attachable-evidence',
  JIRA_ATTACH_EVIDENCE: 'desktop:jira:attach-evidence',
  JIRA_GET_ATTACHMENT_STATUS: 'desktop:jira:get-attachment-status',
  JIRA_EVALUATE_DUPLICATE: 'desktop:jira:evaluate-duplicate',
  JIRA_LINK_EXISTING_ISSUE: 'desktop:jira:link-existing-issue',
  JIRA_GET_ISSUE_LINK: 'desktop:jira:get-issue-link',
  JIRA_REGISTER_PROJECT_ENGINEER: 'desktop:jira:register-project-engineer',
  JIRA_LIST_ELIGIBLE_ENGINEERS: 'desktop:jira:list-eligible-engineers',
  JIRA_GET_DEFECT_OWNERSHIP: 'desktop:jira:get-defect-ownership',
  JIRA_ASSIGN_ENGINEER: 'desktop:jira:assign-engineer',
  JIRA_UNASSIGN_ENGINEER: 'desktop:jira:unassign-engineer',
  JIRA_SYNC_OWNERSHIP_FROM_JIRA: 'desktop:jira:sync-ownership-from-jira',
  JIRA_RETRY_JIRA_SYNC: 'desktop:jira:retry-jira-sync',

  // Phase 95 — Email Notification System
  EMAIL_GET_CONFIG: 'desktop:email:get-config',
  EMAIL_SAVE_CONFIG: 'desktop:email:save-config',
  EMAIL_TEST_CONNECTION: 'desktop:email:test-connection',
  EMAIL_LIST_NOTIFICATIONS: 'desktop:email:list-notifications',
  EMAIL_GET_NOTIFICATION: 'desktop:email:get-notification',
  EMAIL_RETRY_NOTIFICATION: 'desktop:email:retry-notification',
  EMAIL_SEND_WORKFLOW_NOTIFICATION: 'desktop:email:send-workflow-notification',

  // Phase 96 — Bug Status & External Workflow Synchronization
  WORKFLOW_GET_STATE: 'desktop:workflow:get-state',
  WORKFLOW_UPDATE_INTERNAL_STATUS: 'desktop:workflow:update-internal-status',
  WORKFLOW_GET_STATUS_MAPPINGS: 'desktop:workflow:get-status-mappings',
  WORKFLOW_SAVE_STATUS_MAPPING: 'desktop:workflow:save-status-mapping',
  WORKFLOW_DELETE_STATUS_MAPPING: 'desktop:workflow:delete-status-mapping',
  WORKFLOW_SYNC_NOW: 'desktop:workflow:sync-now',
  WORKFLOW_RESOLVE_CONFLICT: 'desktop:workflow:resolve-conflict',
  WORKFLOW_LIST_SYNC_EVENTS: 'desktop:workflow:list-sync-events',

  // Phase 97 — Defect Reverification Foundation
  REVERIFICATION_GET_STATE: 'desktop:reverification:get-state',
  REVERIFICATION_EVALUATE_ELIGIBILITY: 'desktop:reverification:evaluate-eligibility',
  REVERIFICATION_CREATE_REQUEST: 'desktop:reverification:create-request',
  REVERIFICATION_GENERATE_PLAN: 'desktop:reverification:generate-plan',
  REVERIFICATION_CANCEL: 'desktop:reverification:cancel',
  REVERIFICATION_LIST_AUDIT_EVENTS: 'desktop:reverification:list-audit-events',

  // Phase 98 — Automated Failed-Test Rerun & Fix Verification
  VERIFICATION_EXECUTE: 'desktop:verification:execute',
  VERIFICATION_GET_ATTEMPTS: 'desktop:verification:get-attempts',
  VERIFICATION_GET_COMPARISON: 'desktop:verification:get-comparison',
  VERIFICATION_CANCEL: 'desktop:verification:cancel',

  // Phase 99 — AI Quick-Fix Eligibility & Safety Analysis
  QUICK_FIX_EVALUATE_ELIGIBILITY: 'desktop:quick-fix:evaluate-eligibility',
  QUICK_FIX_GET_ASSESSMENT: 'desktop:quick-fix:get-assessment',
  QUICK_FIX_LIST_ASSESSMENTS: 'desktop:quick-fix:list-assessments',

  // Phase 100 — Repository-Aware Defect Localization
  DEFECT_LOCALIZATION_LOCALIZE: 'desktop:defect-localization:localize',
  DEFECT_LOCALIZATION_GET: 'desktop:defect-localization:get-localization',
  DEFECT_LOCALIZATION_LIST: 'desktop:defect-localization:list-localizations',
  DEFECT_LOCALIZATION_INSPECT_SOURCE: 'desktop:defect-localization:inspect-candidate-source',

  // Phase 101 — Limited AI Patch Generation
  PATCH_PROPOSAL_GENERATE: 'desktop:patch-proposals:generate',
  PATCH_PROPOSAL_GET: 'desktop:patch-proposals:get',
  PATCH_PROPOSAL_LIST: 'desktop:patch-proposals:list',
  PATCH_PROPOSAL_WITHDRAW: 'desktop:patch-proposals:withdraw',

  // Phase 102 — Secure Patch Sandbox & Change Isolation
  PATCH_SANDBOX_CREATE: 'desktop:patch-sandboxes:create',
  PATCH_SANDBOX_APPLY: 'desktop:patch-sandboxes:apply',
  PATCH_SANDBOX_GET: 'desktop:patch-sandboxes:get',
  PATCH_SANDBOX_LIST: 'desktop:patch-sandboxes:list',
  PATCH_SANDBOX_DESTROY: 'desktop:patch-sandboxes:destroy',

  // Phase 103 — Patch Validation & Before/After Testing
  PATCH_VALIDATION_EXECUTE: 'desktop:patch-validation:execute',
  PATCH_VALIDATION_GET: 'desktop:patch-validation:get',
  PATCH_VALIDATION_LIST: 'desktop:patch-validation:list',
  PATCH_VALIDATION_CANCEL: 'desktop:patch-validation:cancel',

  // Phase 104 — Human Approval, Reject & Apply Workflow
  PATCH_APPROVAL_GET: 'desktop:patch-approvals:get',
  PATCH_APPROVAL_LIST: 'desktop:patch-approvals:list',
  PATCH_APPROVAL_APPROVE: 'desktop:patch-approvals:approve',
  PATCH_APPROVAL_REJECT: 'desktop:patch-approvals:reject',
  PATCH_APPROVAL_APPLY: 'desktop:patch-approvals:apply',

  // Phase 149 — Repair/Patch Tool
  REPAIR_PATCH_PROPOSE: 'desktop:repair-patch:propose',
  REPAIR_PATCH_GET: 'desktop:repair-patch:get',
  REPAIR_PATCH_APPROVE: 'desktop:repair-patch:approve',
  REPAIR_PATCH_REJECT: 'desktop:repair-patch:reject',
  REPAIR_PATCH_CANCEL: 'desktop:repair-patch:cancel',
  REPAIR_PATCH_APPLY: 'desktop:repair-patch:apply',

  // Phase 150 — Git Diff & Change Review
  GIT_DIFF_GET_STATUS: 'desktop:git-review:get-status',
  GIT_DIFF_GET: 'desktop:git-review:get-diff',
  GIT_CHANGE_REVIEW_CREATE: 'desktop:git-review:create',
  GIT_CHANGE_REVIEW_GET: 'desktop:git-review:get',
  GIT_CHANGE_REVIEW_APPROVE: 'desktop:git-review:approve',
  GIT_CHANGE_REVIEW_REJECT: 'desktop:git-review:reject',

  // Phase 151 — Sandboxed Terminal Command Gateway
  TERMINAL_EXECUTE: 'desktop:terminal:execute',
  TERMINAL_GET_EXECUTION: 'desktop:terminal:get-execution',
  TERMINAL_LIST_EXECUTIONS: 'desktop:terminal:list-executions',
  TERMINAL_APPROVE: 'desktop:terminal:approve',
  TERMINAL_REJECT: 'desktop:terminal:reject',
  TERMINAL_CANCEL: 'desktop:terminal:cancel',

  // Phase 152 — Multi-Step Planning
  PLANNER_CREATE_PLAN: 'desktop:planner:create-plan',
  PLANNER_GET_PLAN: 'desktop:planner:get-plan',
  PLANNER_LIST_PLANS: 'desktop:planner:list-plans',
  PLANNER_GET_ACTIVE_PLAN: 'desktop:planner:get-active-plan',
  PLANNER_ADD_STEP: 'desktop:planner:add-step',
  PLANNER_REMOVE_STEP: 'desktop:planner:remove-step',
  PLANNER_REORDER_STEPS: 'desktop:planner:reorder-steps',
  PLANNER_MODIFY_STEP: 'desktop:planner:modify-step',
  PLANNER_SET_STEP_STATUS: 'desktop:planner:set-step-status',
  PLANNER_SET_PLAN_STATUS: 'desktop:planner:set-plan-status',

  // Phase 153 — Agent Execution Loop
  AGENT_LOOP_START: 'desktop:agent-loop:start',
  AGENT_LOOP_RESUME: 'desktop:agent-loop:resume',
  AGENT_LOOP_CANCEL: 'desktop:agent-loop:cancel',
  AGENT_LOOP_GET_STATUS: 'desktop:agent-loop:get-status',

  // Phase 154 — Streaming Activity / Tool Progress UI
  AGENT_ACTIVITY_EVENT: 'desktop:agent-activity:event',
  AGENT_ACTIVITY_SUBSCRIBE: 'desktop:agent-activity:subscribe',
  AGENT_ACTIVITY_UNSUBSCRIBE: 'desktop:agent-activity:unsubscribe',
  AGENT_ACTIVITY_GET_TIMELINE: 'desktop:agent-activity:get-timeline',

  // Phase 155 — Human Approval Gates
  APPROVAL_CREATE: 'desktop:approval:create',
  APPROVAL_GET: 'desktop:approval:get',
  APPROVAL_LIST: 'desktop:approval:list',
  APPROVAL_APPROVE: 'desktop:approval:approve',
  APPROVAL_REJECT: 'desktop:approval:reject',
  APPROVAL_CANCEL: 'desktop:approval:cancel',
  APPROVAL_GET_PENDING: 'desktop:approval:get-pending',
  APPROVAL_GET_AUDIT_HISTORY: 'desktop:approval:get-audit-history',

  // Phase 156 — File & Diff Review Workspace
  FILE_REVIEW_CREATE: 'desktop:file-review:create',
  FILE_REVIEW_GET: 'desktop:file-review:get',
  FILE_REVIEW_LIST: 'desktop:file-review:list',
  FILE_REVIEW_APPROVE: 'desktop:file-review:approve',
  FILE_REVIEW_REJECT: 'desktop:file-review:reject',
  FILE_REVIEW_CANCEL: 'desktop:file-review:cancel',
  FILE_REVIEW_APPLY: 'desktop:file-review:apply',
  FILE_REVIEW_GET_FILE_CONTENT: 'desktop:file-review:get-file-content',

  // Phase 105 — Patch Rollback & Recovery
  PATCH_ROLLBACK_PLAN: 'desktop:patch-rollbacks:plan',
  PATCH_ROLLBACK_EXECUTE: 'desktop:patch-rollbacks:execute',
  PATCH_ROLLBACK_GET: 'desktop:patch-rollbacks:get',
  PATCH_ROLLBACK_LIST: 'desktop:patch-rollbacks:list',
  PATCH_ROLLBACK_RESUME_RECOVERY: 'desktop:patch-rollbacks:resume-recovery',

  // Phase 106 — Requirement Change-Impact & Intelligent Retest Selection
  RETEST_CREATE_SNAPSHOT: 'desktop:retest:create-snapshot',
  RETEST_PLAN: 'desktop:retest:plan',
  RETEST_GET_PLAN: 'desktop:retest:get-plan',
  RETEST_LIST_PLANS: 'desktop:retest:list-plans',
  RETEST_EXPLAIN_TEST: 'desktop:retest:explain-test',

  // Phase 107 — Post-Fix Jira & Notification Updates
  POST_FIX_SYNC_EXECUTE: 'desktop:post-fix:sync-execute',
  POST_FIX_SYNC_RETRY: 'desktop:post-fix:sync-retry',
  POST_FIX_SYNC_GET_STATUS: 'desktop:post-fix:sync-get-status',
  POST_FIX_SYNC_LIST_HISTORY: 'desktop:post-fix:sync-list-history',

  // Phase 108 — Complete Repair & Reverification Audit Trail
  AUDIT_GET_TIMELINE: 'desktop:audit:get-timeline',
  AUDIT_GET_SESSION: 'desktop:audit:get-session',
  AUDIT_LIST_SESSIONS: 'desktop:audit:list-sessions',
  AUDIT_EXPORT_TIMELINE: 'desktop:audit:export-timeline',
  AUDIT_RECORD_EVENT: 'desktop:audit:record-event',

  // Phase 109 — Final QA Report & Release Readiness Intelligence
  QA_REPORT_GENERATE: 'desktop:qa-report:generate',
  QA_REPORT_GET: 'desktop:qa-report:get',
  QA_REPORT_LIST: 'desktop:qa-report:list',
  QA_REPORT_FINALIZE: 'desktop:qa-report:finalize',
  QA_REPORT_EXPORT: 'desktop:qa-report:export',
  QA_REPORT_EVALUATE_POLICY: 'desktop:qa-report:evaluate-policy',
  QA_REPORT_CHECK_STALENESS: 'desktop:qa-report:check-staleness',

  // V8 Phase 111 — Desktop Application Shell & Final Product Architecture
  WORKSPACE_SESSIONS_LIST: 'desktop:workspace-sessions:list',
  WORKSPACE_SESSIONS_GET: 'desktop:workspace-sessions:get',
  WORKSPACE_SESSIONS_CREATE: 'desktop:workspace-sessions:create',
  WORKSPACE_SESSIONS_UPDATE: 'desktop:workspace-sessions:update',
  WORKSPACE_SESSIONS_DELETE: 'desktop:workspace-sessions:delete',
  SHELL_LAYOUT_GET: 'desktop:shell-layout:get',
  SHELL_LAYOUT_UPDATE: 'desktop:shell-layout:update',

  // V8 Phase 113 & 114 — User Authentication & Session Management
  AUTH_GET_STATE: 'desktop:auth:get-state',
  AUTH_GET_CURRENT_USER: 'desktop:auth:get-current-user',
  AUTH_LOGIN: 'desktop:auth:login',
  AUTH_LOGOUT: 'desktop:auth:logout',
  AUTH_SIGNUP: 'desktop:auth:signup',
  AUTH_FORGOT_PASSWORD: 'desktop:auth:forgot-password',
  AUTH_RESET_PASSWORD: 'desktop:auth:reset-password',
  AUTH_REVOKE_SESSION: 'desktop:auth:revoke-session',
  AUTH_REVOKE_ALL_SESSIONS: 'desktop:auth:revoke-all-sessions',

  // V8 Phase 115 — Google & Apple Social Authentication
  AUTH_SOCIAL_START: 'desktop:auth:social-start',
  AUTH_SOCIAL_CALLBACK: 'desktop:auth:social-callback',
  AUTH_SOCIAL_CANCEL: 'desktop:auth:social-cancel',
  AUTH_SOCIAL_GET_PROVIDERS: 'desktop:auth:social-get-providers',

  // V8 Phase 116 — User Profile, Account Settings & Application Preferences
  SETTINGS_GET_PROFILE: 'desktop:settings:get-profile',
  SETTINGS_UPDATE_PROFILE: 'desktop:settings:update-profile',
  SETTINGS_CHANGE_PASSWORD: 'desktop:settings:change-password',
  SETTINGS_GET_AUTH_METHODS: 'desktop:settings:get-auth-methods',
  SETTINGS_GET_SESSIONS: 'desktop:settings:get-sessions',
  SETTINGS_GET_PREFERENCES: 'desktop:settings:get-preferences',
  SETTINGS_UPDATE_PREFERENCES: 'desktop:settings:update-preferences',
  SETTINGS_DELETE_ACCOUNT: 'desktop:settings:delete-account',
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
  | 'REPOSITORY_NOT_FOUND'
  | 'REPOSITORY_ACCESS_DENIED'
  | 'REPOSITORY_ALREADY_CONNECTED'
  | 'REPOSITORY_IMPORT_FAILED'
  | 'REPOSITORY_IMPORT_CANCELLED'
  | 'REPOSITORY_IMPORT_TIMEOUT'
  | 'REPOSITORY_PATH_TRAVERSAL'
  | 'REPOSITORY_OVERSIZED'
  | 'GIT_PROVIDER_AUTH_FAILED'
  // Local Project Folder & Secure File Access Error Codes (V8 Phase 121)
  | 'LOCAL_FOLDER_NOT_FOUND'
  | 'LOCAL_FOLDER_ACCESS_DENIED'
  | 'LOCAL_FOLDER_NOT_CONFIGURED'
  | 'LOCAL_FOLDER_PATH_TRAVERSAL'
  | 'LOCAL_FOLDER_SYMLINK_ESCAPE'
  | 'LOCAL_FOLDER_PERMISSION_DENIED'
  | 'LOCAL_FOLDER_FILE_TOO_LARGE'
  | 'LOCAL_FOLDER_FILE_NOT_FOUND'
  | 'LOCAL_FOLDER_INVALID_PATH'
  // Browser, Target Environment & Authentication Error Codes (V8 Phase 122)
  | 'TARGET_ENV_NOT_FOUND'
  | 'TARGET_ENV_ACCESS_DENIED'
  | 'TARGET_ENV_VALIDATION_ERROR'
  | 'TARGET_ENV_UNREACHABLE'
  | 'TARGET_ENV_AUTH_FAILED'
  | 'TARGET_ENV_PROD_SAFETY_VIOLATION'
  // Unified Project Context & Source Detection Error Codes (V8 Phase 123)
  | 'PROJECT_CONTEXT_NOT_FOUND'
  | 'PROJECT_CONTEXT_ACCESS_DENIED'
  | 'PROJECT_CONTEXT_STALE'
  | 'PROJECT_CONTEXT_INVALID'
  | 'PROJECT_CONTEXT_SOURCE_UNAVAILABLE'
  | 'PROJECT_CONTEXT_DETECTION_FAILED'
  | 'PROJECT_CONTEXT_REFRESH_FAILED'
  // Conversational AI Testing Agent Error Codes (V8 Phase 124)
  | 'AGENT_SESSION_NOT_FOUND'
  | 'AGENT_ACCESS_DENIED'
  | 'AGENT_INVALID_REQUEST'
  | 'AGENT_TOOL_FAILED'
  | 'AGENT_APPROVAL_REQUIRED'
  | 'AGENT_RUN_NOT_FOUND'
  | 'AGENT_EVIDENCE_NOT_FOUND'
  | 'AGENT_EXECUTION_FAILED'
  // AI Provider Abstraction Error Codes (V9 Phase 126)
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_PROVIDER_AUTH_ERROR'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_INVALID_REQUEST'
  | 'AI_TIMEOUT'
  | 'AI_CANCELLED'
  | 'AI_RATE_LIMITED'
  | 'AI_INVALID_RESPONSE'
  | 'AI_PROVIDER_ERROR'
  | 'AI_UNKNOWN'
  | 'PROVIDER_AUTH_ERROR'
  | 'MODEL_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'PROVIDER_ERROR'
  | 'UNKNOWN'
  | 'AI_CONFIG_NOT_FOUND'
  | 'AI_CONFIG_INVALID'
  | 'AI_CROSS_PROJECT_ACCESS'
  // Ollama Connection & Health Error Codes (V9 Phase 127)
  | 'OLLAMA_HEALTH_CHECK_FAILED'
  | 'OLLAMA_NOT_CONFIGURED'
  | 'OLLAMA_INVALID_ENDPOINT'
  | 'OLLAMA_UNAUTHORIZED'
  // Installed Model Discovery Error Codes (V9 Phase 128)
  | 'AI_MODEL_DISCOVERY_FAILED'
  | 'AI_MODEL_NOT_FOUND'
  // Model Selection & Capability Detection Error Codes (V9 Phase 129)
  | 'CAPABILITY_UNKNOWN'
  | 'CAPABILITY_UNSUPPORTED'
  | 'NO_COMPATIBLE_MODEL'
  | 'CAPABILITY_PROBE_TIMEOUT'
  | 'CAPABILITY_PROBE_FAILED'
  | 'SELECTION_INVALID'
  // Structured Output & Schema Validation Error Codes (V9 Phase 132)
  | 'STRUCTURED_SCHEMA_INVALID'
  | 'STRUCTURED_PARSE_ERROR'
  | 'STRUCTURED_VALIDATION_FAILED'
  | 'STRUCTURED_MAX_RETRIES_EXCEEDED'
  | 'STRUCTURED_CAPABILITY_UNSUPPORTED'
  | 'STRUCTURED_PAYLOAD_TOO_LARGE'
  | 'STRUCTURED_NESTING_TOO_DEEP'
  // Tool-Calling Compatibility Layer Error Codes (V9 Phase 133)
  | 'TOOL_NOT_FOUND'
  | 'TOOL_DUPLICATE'
  | 'TOOL_SCHEMA_INVALID'
  | 'TOOL_ARGUMENTS_INVALID'
  | 'TOOL_CALL_PARSE_ERROR'
  | 'TOOL_CALL_VALIDATION_FAILED'
  | 'TOOL_CAPABILITY_UNSUPPORTED'
  | 'TOOL_CROSS_PROJECT_ACCESS'
  | 'TOOL_EXECUTION_PROHIBITED'
  // Context Window & Token Management Error Codes (V9 Phase 134)
  | 'CONTEXT_TOO_LARGE'
  | 'TOKEN_BUDGET_EXCEEDED'
  | 'CONTEXT_SELECTION_FAILED'
  | 'TOKEN_ESTIMATION_FAILED'
  | 'OUTPUT_RESERVATION_EXCEEDED'
  // AI Privacy & Local-Only AI Mode Error Codes (V9 Phase 137)
  | 'AI_REMOTE_PROVIDER_BLOCKED'
  | 'AI_PRIVACY_VIOLATION'
  | 'AI_SECRET_DETECTED'
  // AI Provider Switching & Fallback Error Codes (V9 Phase 138)
  | 'AI_FALLBACK_EXHAUSTED'
  | 'AI_FALLBACK_POLICY_BLOCKED'
  // Performance, Cancellation & Runtime Recovery Error Codes (V9 Phase 139)
  | 'AI_STREAM_TIMEOUT'
  | 'AI_RUNTIME_TIMEOUT'
  | 'AI_RUNTIME_RECOVERY_REQUIRED'
  // Agent Runtime Foundation Error Codes (V10 Phase 141 & 142)
  | 'AGENT_TIMEOUT'
  | 'AGENT_CANCELLED'
  | 'AGENT_INVALID_STATE'
  | 'AGENT_MALFORMED_RESPONSE'
  | 'AGENT_RUNTIME_ERROR'
  | 'AGENT_UNAUTHORIZED_TOOL'
  | 'AGENT_THREAD_NOT_FOUND'
  | 'AGENT_THREAD_ARCHIVED'
  | 'AGENT_TASK_NOT_FOUND'
  | 'AGENT_TASK_IMMUTABLE'
  | 'AGENT_TASK_INVALID_STATE'
  // Tool Registry Error Codes (V10 Phase 143)
  | 'TOOL_REGISTRY_NOT_FOUND'
  | 'TOOL_REGISTRY_DUPLICATE'
  | 'TOOL_REGISTRY_DISABLED'
  | 'TOOL_REGISTRY_VALIDATION_ERROR'
  | 'TOOL_REGISTRY_INVOCATION_FAILED'
  | 'TOOL_REGISTRY_PERMISSION_DENIED'
  | 'TOOL_REGISTRY_OUTPUT_INVALID'
  // Tool Permission & Approval Error Codes (V10 Phase 144)
  | 'TOOL_PERMISSION_DENIED'
  | 'TOOL_APPROVAL_REQUIRED'
  | 'TOOL_APPROVAL_NOT_FOUND'
  | 'TOOL_APPROVAL_ALREADY_DECIDED'
  // Multi-Step Planning Error Codes (V10 Phase 152)
  | 'AGENT_PLAN_NOT_FOUND'
  | 'AGENT_PLAN_VERSION_CONFLICT'
  | 'AGENT_PLAN_VALIDATION_ERROR'
  | 'AGENT_PLAN_CIRCULAR_DEPENDENCY'
  | 'AGENT_PLAN_STEP_NOT_FOUND'
  | 'AGENT_PLAN_STEP_DUPLICATE'
  | 'AGENT_PLAN_INVALID_STATE'
  | 'AGENT_PLAN_CROSS_PROJECT_ACCESS'
  // Agent Execution Loop Error Codes (V10 Phase 153)
  | 'AGENT_LOOP_ERROR'
  | 'AGENT_LOOP_NOT_FOUND'
  | 'AGENT_LOOP_INVALID_STATE'
  | 'AGENT_LOOP_CONCURRENT_EXECUTION'
  | 'AGENT_LOOP_SAFETY_LIMIT_EXCEEDED'
  | 'AGENT_LOOP_TIMEOUT'
  | 'AGENT_LOOP_CANCELLED'
  | 'AGENT_LOOP_APPROVAL_REQUIRED'
  | 'AGENT_LOOP_EXECUTION_FAILED'
  | 'AGENT_LOOP_PLANNER_FAILED'
  | 'AGENT_LOOP_INVALID_TOOL'
  | 'AGENT_LOOP_CROSS_PROJECT_ACCESS'
  // Streaming Activity & Tool Progress UI Error Codes (V10 Phase 154)
  | 'AGENT_ACTIVITY_ERROR'
  | 'AGENT_ACTIVITY_NOT_FOUND'
  | 'AGENT_ACTIVITY_UNAUTHORIZED'
  | 'AGENT_ACTIVITY_INVALID_EVENT'
  // Human Approval Gates Error Codes (V10 Phase 155)
  | 'APPROVAL_NOT_FOUND'
  | 'APPROVAL_ALREADY_DECIDED'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_CANCELLED'
  | 'APPROVAL_ACTION_MODIFIED'
  | 'APPROVAL_UNAUTHORIZED'
  | 'APPROVAL_VALIDATION_ERROR'
  | 'APPROVAL_CONFLICT'
  // File & Diff Review Workspace Error Codes (V10 Phase 156)
  | 'FILE_REVIEW_NOT_FOUND'
  | 'FILE_REVIEW_ALREADY_DECIDED'
  | 'FILE_REVIEW_NOT_APPROVED'
  | 'FILE_REVIEW_ALREADY_APPLIED'
  | 'FILE_REVIEW_INVALID_STATE_TRANSITION'
  | 'FILE_REVIEW_PATH_TRAVERSAL'
  | 'FILE_REVIEW_FILE_NOT_FOUND'
  | 'FILE_REVIEW_FILE_TOO_LARGE'
  | 'FILE_REVIEW_UNAUTHORIZED'
  | 'FILE_REVIEW_VALIDATION_ERROR'
  | 'FILE_REVIEW_APPLY_FAILED'
  | 'FILE_REVIEW_CHECKSUM_MISMATCH'
  // Local Model Generation Runtime Error Codes (V9 Phase 130)
  | 'CONNECTION_ERROR'
  | 'GENERATION_ERROR'
  | 'ENVIRONMENT_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'EXECUTION_NOT_ELIGIBLE'
  | 'INVALID_EXECUTION_PARAMS'
  | 'TEST_NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'PLAN_NOT_COMPILED'
  | 'BROWSER_INITIALIZATION_FAILED'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TEST_PLAN_NOT_FOUND'
  | 'TEST_NOT_APPROVED'
  | 'TEST_VERSION_STALE'
  | 'TEST_ENVIRONMENT_MISMATCH'
  | 'COMPILATION_ERROR'
  | 'UNSUPPORTED_ACTION_ERROR'
  | 'UNSAFE_URL_ERROR'
  | 'COMPILER_VALIDATION_ERROR'
  | 'TEST_RUN_NOT_FOUND'
  | 'TEST_RUN_ALREADY_TERMINAL'
  | 'TEST_RUN_INVALID_STATE_TRANSITION'
  | 'TEST_RUN_QUEUE_FULL'
  | 'TEST_RUN_CANCELLATION_REJECTED'
  | 'TEST_RUN_CONCURRENCY_ERROR'
  | 'TEST_RUN_VALIDATION_ERROR'
  | 'TEST_RUN_PLAN_NOT_FOUND'
  | 'TEST_RUN_PLAN_NOT_EXECUTABLE'
  | 'TEST_RUN_STALE_ERROR'
  | 'AUTH_PROFILE_NOT_FOUND'
  | 'AUTH_PROFILE_PROJECT_MISMATCH'
  | 'AUTH_PROFILE_DUPLICATE_NAME'
  | 'AUTH_PROFILE_VALIDATION_ERROR'
  | 'AUTH_STRATEGY_UNSUPPORTED'
  | 'AUTHENTICATION_REJECTED'
  | 'AUTHENTICATION_TIMEOUT'
  | 'SESSION_VALIDATION_FAILED'
  | 'STORAGE_STATE_INVALID'
  | 'STORAGE_STATE_NOT_FOUND'
  | 'BROWSER_SESSION_NOT_FOUND'
  | 'BROWSER_SESSION_INVALID_STATE'
  | 'CREDENTIAL_REFERENCE_NOT_FOUND'
  | 'PAGE_NOT_AVAILABLE'
  | 'CONTEXT_CLOSED'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_AMBIGUOUS'
  | 'TARGET_NOT_VISIBLE'
  | 'TARGET_DISABLED'
  | 'ACTION_TIMEOUT'
  | 'NAVIGATION_REJECTED'
  | 'INVALID_ACTION'
  | 'INVALID_ACTION_VALUE'
  | 'UNSUPPORTED_ACTION'
  | 'PLAYWRIGHT_ERROR'
  | 'ACTION_CANCELLED'
  | 'CROSS_RUN_EXECUTION_ERROR'
  | 'DESTRUCTIVE_ACTION_PROHIBITED'
  | 'LOCATOR_INVALID_TARGET'
  | 'LOCATOR_NOT_FOUND'
  | 'LOCATOR_AMBIGUOUS'
  | 'LOCATOR_TIMEOUT'
  | 'LOCATOR_UNSUPPORTED_STRATEGY'
  | 'LOCATOR_SCOPE_NOT_FOUND'
  | 'LOCATOR_FRAME_NOT_FOUND'
  | 'LOCATOR_FRAME_AMBIGUOUS'
  | 'LOCATOR_CANCELLED'
  | 'LOCATOR_PAGE_CLOSED'
  | 'LOCATOR_CONTEXT_CLOSED'
  | 'FILE_NOT_ALLOWED'
  | 'ELEMENT_NOT_ACTIONABLE'
  | 'TARGET_NOT_RESOLVED'
  | 'SYNCHRONIZATION_TIMEOUT'
  | 'NAVIGATION_TIMEOUT'
  | 'ELEMENT_READINESS_TIMEOUT'
  | 'RESPONSE_WAIT_TIMEOUT'
  | 'POPUP_TIMEOUT'
  | 'LOADING_STATE_TIMEOUT'
  | 'CUSTOM_CONDITION_TIMEOUT'
  | 'ASSERTION_FAILED'
  | 'ASSERTION_TIMEOUT'
  | 'ASSERTION_ERROR'
  | 'UNSUPPORTED_ASSERTION'
  | 'INVALID_ASSERTION_TYPE'
  | 'INVALID_ASSERTION_OPERATOR'
  | 'INVALID_EXPECTED_VALUE'
  | 'MALFORMED_REGEX'
  | 'UNRESOLVED_VARIABLE'
  | 'EXECUTION_NOT_FOUND'
  | 'EXECUTION_STEP_NOT_FOUND'
  | 'EXECUTION_ALREADY_TERMINAL'
  | 'INVALID_STATE_TRANSITION'
  | 'EXECUTION_PERSISTENCE_ERROR'
  | 'EXECUTION_CORRUPTED_HISTORY'
  | 'EVIDENCE_BUNDLE_NOT_FOUND'
  | 'EVIDENCE_ARTIFACT_NOT_FOUND'
  | 'EVIDENCE_INTEGRITY_MISMATCH'
  | 'EVIDENCE_PATH_TRAVERSAL'
  | 'EVIDENCE_OWNERSHIP_MISMATCH'
  | 'EVIDENCE_BUNDLE_ALREADY_FINALIZED'
  | 'EVIDENCE_STORAGE_ERROR'
  | 'EVIDENCE_SIZE_LIMIT_EXCEEDED'
  | 'EVIDENCE_INVALID_MIME_TYPE'
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
  | 'TEST_REVIEW_VALIDATION_FAILED'
  | 'EXECUTION_REQUEST_INVALID'
  | 'EXECUTION_PROJECT_MISMATCH'
  | 'EXECUTION_TEST_NOT_FOUND'
  | 'EXECUTION_TEST_NOT_APPROVED'
  | 'EXECUTION_TEST_STALE'
  | 'EXECUTION_TEST_REJECTED'
  | 'EXECUTION_TEST_NOT_EXECUTABLE'
  | 'BROWSER_LAUNCH_FAILED'
  | 'BROWSER_RUNTIME_ERROR'
  | 'BROWSER_UNAVAILABLE'
  | 'BROWSER_UNSUPPORTED'
  | 'EXECUTION_TIMEOUT'
  | 'EXECUTION_CLEANUP_FAILED'
  | 'EXECUTION_CONCURRENCY_LIMIT'
  | 'EXECUTION_SECURITY_VIOLATION'
  | 'TARGET_APP_NOT_FOUND'
  | 'INVALID_BASE_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'ENVIRONMENT_DISABLED'
  | 'ENVIRONMENT_NOT_REACHABLE'
  | 'CONNECTION_TIMEOUT'
  | 'TLS_ERROR'
  | 'SECRET_REFERENCE_INVALID'
  | 'PRODUCTION_SAFETY_VIOLATION'
  | 'ENVIRONMENT_PROJECT_MISMATCH'
  | 'FAILURE_CASE_NOT_FOUND'
  | 'EXECUTION_INELIGIBLE'
  | 'FAILURE_CASE_ALREADY_EXISTS'
  | 'INVALID_LIFECYCLE_TRANSITION'
  | 'ANALYSIS_ALREADY_RUNNING'
  | 'CROSS_PROJECT_MISMATCH'
  | 'FAILURE_ANALYSIS_RUN_NOT_FOUND'
  | 'FAILURE_EVIDENCE_NOT_FOUND'
  | 'EVIDENCE_INTEGRITY_FAILED'
  | 'EVIDENCE_ARTIFACT_MISSING'
  | 'EVIDENCE_CORRUPT'
  | 'EVIDENCE_PATH_TRAVERSAL_DETECTED'
  | 'EVIDENCE_INGESTION_FAILED'
  | 'REPRODUCTION_BLOCKED'
  | 'HISTORICAL_TEST_VERSION_UNAVAILABLE'
  | 'REPRODUCTION_ENVIRONMENT_INCOMPATIBLE'
  | 'REPRODUCTION_ATTEMPT_LIMIT_EXCEEDED'
  | 'REPRODUCTION_ALREADY_IN_PROGRESS'
  | 'REPRODUCTION_NOT_FOUND'
  | 'CLASSIFICATION_NOT_FOUND'
  | 'CLASSIFICATION_BLOCKED'
  | 'CLASSIFICATION_CONFLICT'
  | 'CLASSIFICATION_EVIDENCE_INSUFFICIENT'
  | 'CLASSIFICATION_ALREADY_EXISTS'
  | 'CLASSIFICATION_CONCURRENT_MUTATION'
  | 'DECISION_INTEGRITY_NOT_FOUND'
  | 'DECISION_INTEGRITY_STALE'
  | 'DECISION_INTEGRITY_INVALIDATED'
  | 'DECISION_INTEGRITY_CONFLICTED'
  | 'DECISION_INTEGRITY_INSUFFICIENT'
  | 'DECISION_INTEGRITY_BLOCKED'
  | 'DECISION_INTEGRITY_CONCURRENT_MUTATION'
  | 'FLAKINESS_ANALYSIS_NOT_FOUND'
  | 'FLAKINESS_ANALYSIS_STALE'
  | 'FLAKINESS_ANALYSIS_INSUFFICIENT_EVIDENCE'
  | 'FLAKINESS_ANALYSIS_BLOCKED'
  | 'FLAKINESS_ANALYSIS_CONCURRENT_MUTATION'
  | 'FLAKINESS_ANALYSIS_CROSS_PROJECT'
  | 'FAILURE_DOMAIN_NOT_FOUND'
  | 'FAILURE_DOMAIN_STALE'
  | 'FAILURE_DOMAIN_INSUFFICIENT_EVIDENCE'
  | 'FAILURE_DOMAIN_BLOCKED'
  | 'FAILURE_DOMAIN_CONCURRENT_MUTATION'
  | 'FAILURE_DOMAIN_CROSS_PROJECT'
  | 'LOCALIZATION_NOT_FOUND'
  | 'LOCALIZATION_STALE'
  | 'LOCALIZATION_INSUFFICIENT_EVIDENCE'
  | 'LOCALIZATION_BLOCKED'
  | 'LOCALIZATION_CROSS_PROJECT'
  | 'LOCALIZATION_CONCURRENT_MUTATION'
  | 'AI_ASSESSMENT_NOT_FOUND'
  | 'AI_ASSESSMENT_STALE'
  | 'AI_ASSESSMENT_UNAVAILABLE'
  | 'AI_ASSESSMENT_INSUFFICIENT_EVIDENCE'
  | 'AI_ASSESSMENT_BLOCKED'
  | 'AI_ASSESSMENT_CROSS_PROJECT'
  | 'AI_ASSESSMENT_CONCURRENT_MUTATION'
  | 'ROOT_CAUSE_NOT_FOUND'
  | 'ROOT_CAUSE_STALE'
  | 'ROOT_CAUSE_UNAVAILABLE'
  | 'ROOT_CAUSE_INSUFFICIENT_EVIDENCE'
  | 'ROOT_CAUSE_BLOCKED'
  | 'ROOT_CAUSE_CROSS_PROJECT'
  | 'ROOT_CAUSE_CONCURRENT_MUTATION'
  | 'IMPACT_ASSESSMENT_NOT_FOUND'
  | 'IMPACT_ASSESSMENT_STALE'
  | 'IMPACT_ASSESSMENT_UNAVAILABLE'
  | 'IMPACT_ASSESSMENT_INSUFFICIENT_EVIDENCE'
  | 'IMPACT_ASSESSMENT_BLOCKED'
  | 'IMPACT_ASSESSMENT_CROSS_PROJECT'
  | 'IMPACT_ASSESSMENT_CONCURRENT_MUTATION'
  | 'DEFECT_CLUSTER_NOT_FOUND'
  | 'DEFECT_CLUSTER_CROSS_PROJECT'
  | 'DEFECT_CLUSTER_INVALID_OPERATION'
  | 'DEFECT_CLUSTER_CONCURRENT_MUTATION'
  | 'DEFECT_CLUSTER_INSUFFICIENT_EVIDENCE'
  | 'DEFECT_CLUSTER_ALREADY_MEMBER'
  | 'DEFECT_CLUSTER_EMPTY_SPLIT'
  // Phase 86: Confidence Scoring, Explainability & Evidence Attribution Error Codes
  | 'CONFIDENCE_ASSESSMENT_NOT_FOUND'
  | 'CONFIDENCE_ASSESSMENT_STALE'
  | 'CONFIDENCE_ASSESSMENT_CROSS_PROJECT'
  | 'CONFIDENCE_ASSESSMENT_INVALID_OPERATION'
  | 'CONFIDENCE_ASSESSMENT_INSUFFICIENT_EVIDENCE'
  | 'CONFIDENCE_ASSESSMENT_CONCURRENT_MUTATION'
  | 'CONFIDENCE_INTEGRITY_VIOLATION'
  // Phase 87: Structured Bug Report Generation & Failure Intelligence Workspace Error Codes
  | 'BUG_REPORT_NOT_FOUND'
  | 'BUG_REPORT_STALE'
  | 'BUG_REPORT_CROSS_PROJECT'
  | 'BUG_REPORT_INVALID_OPERATION'
  | 'BUG_REPORT_INSUFFICIENT_EVIDENCE'
  | 'BUG_REPORT_CONCURRENT_MUTATION'
  | 'BUG_REPORT_INTEGRITY_VIOLATION'
  // Phase 89 & 90: Jira Integration Foundation & Configuration Error Codes
  | 'JIRA_AUTHENTICATION_FAILED'
  | 'JIRA_PERMISSION_DENIED'
  | 'JIRA_CONNECTION_FAILED'
  | 'JIRA_REQUEST_TIMEOUT'
  | 'JIRA_RATE_LIMITED'
  | 'JIRA_INVALID_RESPONSE'
  | 'JIRA_CONFIGURATION_INVALID'
  | 'JIRA_CONNECTION_NOT_FOUND'
  | 'JIRA_SECURITY_VIOLATION'
  | 'JIRA_CONCURRENT_MUTATION'
  | 'JIRA_CROSS_PROJECT'
  | 'JIRA_PROJECT_NOT_FOUND'
  | 'JIRA_PROJECT_ACCESS_DENIED'
  | 'JIRA_ISSUE_TYPE_NOT_FOUND'
  | 'JIRA_PRIORITY_NOT_FOUND'
  | 'JIRA_CONFIG_NOT_FOUND'
  | 'JIRA_STALE_CONFIG'
  | 'JIRA_WRONG_PROJECT_METADATA'
  | 'JIRA_CONNECTION_EXPIRED'
  | 'JIRA_CONNECTION_REVOKED'
  | 'JIRA_SITE_UNREACHABLE'
  | 'JIRA_ISSUE_INELIGIBLE'
  | 'JIRA_ISSUE_CREATION_FAILED'
  | 'JIRA_ISSUE_ALREADY_EXISTS'
  | 'JIRA_BUG_REPORT_NOT_FOUND'
  | 'JIRA_ATTACHMENT_INELIGIBLE'
  | 'JIRA_EVIDENCE_NOT_FOUND'
  | 'JIRA_EVIDENCE_INTEGRITY_FAILED'
  | 'JIRA_EVIDENCE_TOO_LARGE'
  | 'JIRA_EVIDENCE_UNSUPPORTED_TYPE'
  | 'JIRA_ATTACHMENT_FAILED'
  | 'JIRA_DUPLICATE_FOUND'
  | 'JIRA_LINK_NOT_FOUND'
  | 'JIRA_LINK_INVALID'
  | 'JIRA_DEDUPLICATION_CONFLICT'
  | 'JIRA_DEFECT_CLUSTER_NOT_FOUND'
  | 'JIRA_ISSUE_NOT_FOUND'
  | 'JIRA_ENGINEER_INELIGIBLE'
  | 'JIRA_ENGINEER_NOT_FOUND'
  | 'JIRA_STALE_OWNERSHIP_VERSION'
  | 'JIRA_OWNERSHIP_NOT_FOUND'
  | 'JIRA_OWNERSHIP_CONFLICT'
  | 'EMAIL_CONFIGURATION_MISSING'
  | 'EMAIL_PROVIDER_UNAVAILABLE'
  | 'EMAIL_RECIPIENT_INVALID'
  | 'EMAIL_DELIVERY_FAILED'
  | 'EMAIL_ALREADY_SENT'
  | 'EMAIL_NOT_FOUND'
  | 'EMAIL_RETRY_LIMIT_EXCEEDED'
  | 'EMAIL_CROSS_PROJECT_FORBIDDEN'
  | 'WORKFLOW_STATE_NOT_FOUND'
  | 'WORKFLOW_INVALID_TRANSITION'
  | 'WORKFLOW_STATUS_UNMAPPED'
  | 'WORKFLOW_SYNC_CONFLICT'
  | 'WORKFLOW_EXTERNAL_ISSUE_NOT_FOUND'
  | 'WORKFLOW_SYNC_LOCKED'
  | 'WORKFLOW_CROSS_PROJECT_FORBIDDEN'
  | 'WORKFLOW_MAPPING_NOT_FOUND'
  | 'REVERIFICATION_NOT_FOUND'
  | 'REVERIFICATION_NOT_ELIGIBLE'
  | 'REVERIFICATION_BLOCKED'
  | 'REVERIFICATION_ALREADY_EXISTS'
  | 'REVERIFICATION_CROSS_PROJECT_FORBIDDEN'
  | 'REVERIFICATION_UNSAFE_ENVIRONMENT'
  | 'REVERIFICATION_HISTORICAL_TEST_UNAVAILABLE'
  | 'REVERIFICATION_IMMUTABLE'
  | 'REVERIFICATION_MANUAL_FIX_FORBIDDEN'
  | 'VERIFICATION_NOT_FOUND'
  | 'VERIFICATION_IN_PROGRESS'
  | 'VERIFICATION_ATTEMPT_LIMIT_EXCEEDED'
  | 'VERIFICATION_EXECUTION_FAILED'
  | 'VERIFICATION_BLOCKED'
  | 'VERIFICATION_ENVIRONMENT_INCOMPATIBLE'
  | 'VERIFICATION_CANCELLED'
  // Phase 99: AI Quick-Fix Eligibility & Safety Analysis Error Codes
  | 'QUICK_FIX_NOT_FOUND'
  | 'QUICK_FIX_STALE'
  | 'QUICK_FIX_BLOCKED'
  | 'QUICK_FIX_INSUFFICIENT_EVIDENCE'
  | 'QUICK_FIX_CROSS_PROJECT'
  | 'QUICK_FIX_CONCURRENT_MUTATION'
  | 'QUICK_FIX_SAFETY_POLICY_VIOLATION'
  | 'QUICK_FIX_GIT_DIRTY_WORKTREE'
  | 'QUICK_FIX_GIT_ERROR'
  // Phase 100: Repository-Aware Defect Localization Error Codes
  | 'LOCALIZATION_NOT_FOUND'
  | 'LOCALIZATION_STALE'
  | 'LOCALIZATION_CROSS_PROJECT'
  | 'LOCALIZATION_CONCURRENT_MUTATION'
  | 'LOCALIZATION_REPOSITORY_NOT_FOUND'
  | 'LOCALIZATION_REVISION_UNAVAILABLE'
  | 'LOCALIZATION_PATH_TRAVERSAL_DETECTED'
  | 'LOCALIZATION_SYMLINK_ESCAPE_DETECTED'
  | 'LOCALIZATION_READ_ONLY_VIOLATION'
  | 'LOCALIZATION_FABRICATED_ENTITY_REJECTED'
  // Phase 101: Limited AI Patch Generation Error Codes
  | 'PATCH_NOT_FOUND'
  | 'PATCH_INELIGIBLE'
  | 'PATCH_LOCALIZATION_REQUIRED'
  | 'PATCH_CROSS_PROJECT'
  | 'PATCH_CONCURRENT_MUTATION'
  | 'PATCH_REVISION_DRIFT'
  | 'PATCH_PATH_TRAVERSAL_DETECTED'
  | 'PATCH_UNAUTHORIZED_FILE'
  | 'PATCH_OVERSIZED'
  | 'PATCH_HIGH_RISK_BLOCKED'
  | 'PATCH_MALFORMED_DIFF'
  | 'PATCH_HALLUCINATED_ENTITY'
  | 'PATCH_DIRECT_MUTATION_FORBIDDEN'
  // Phase 102: Secure Patch Sandbox & Change Isolation Error Codes
  | 'PATCH_SANDBOX_NOT_FOUND'
  | 'PATCH_SANDBOX_ALREADY_EXISTS'
  | 'PATCH_SANDBOX_CREATION_FAILED'
  | 'PATCH_SANDBOX_REVISION_MISMATCH'
  | 'PATCH_SANDBOX_PATH_TRAVERSAL_DETECTED'
  | 'PATCH_SANDBOX_SYMLINK_ESCAPE_DETECTED'
  | 'PATCH_SANDBOX_UNAUTHORIZED_FILE'
  | 'PATCH_SANDBOX_SENSITIVE_FILE_BLOCKED'
  | 'PATCH_SANDBOX_GIT_METADATA_BLOCKED'
  | 'PATCH_SANDBOX_CONFLICT'
  | 'PATCH_SANDBOX_DIFF_MISMATCH'
  | 'PATCH_SANDBOX_OVERSIZED'
  | 'PATCH_SANDBOX_UNSUPPORTED_BINARY'
  | 'PATCH_SANDBOX_ALREADY_APPLIED'
  | 'PATCH_SANDBOX_CROSS_PROJECT'
  | 'PATCH_SANDBOX_CONCURRENT_MUTATION'
  | 'PATCH_SANDBOX_CLEANUP_FAILED'
  | 'PATCH_SANDBOX_IMMUTABILITY_VIOLATION'
  // Phase 103: Patch Validation & Before/After Testing Error Codes
  | 'PATCH_VALIDATION_NOT_FOUND'
  | 'PATCH_VALIDATION_IN_PROGRESS'
  | 'PATCH_VALIDATION_ALREADY_COMPLETED'
  | 'PATCH_VALIDATION_SANDBOX_UNAVAILABLE'
  | 'PATCH_VALIDATION_PROPOSAL_NOT_FOUND'
  | 'PATCH_VALIDATION_CROSS_PROJECT'
  | 'PATCH_VALIDATION_CONCURRENT_MUTATION'
  | 'PATCH_VALIDATION_TIMEOUT'
  | 'PATCH_VALIDATION_CANCELLED'
  | 'PATCH_VALIDATION_BEFORE_EXECUTION_FAILED'
  | 'PATCH_VALIDATION_PATCH_APPLICATION_FAILED'
  | 'PATCH_VALIDATION_REGRESSION_DETECTED'
  | 'PATCH_VALIDATION_QUALITY_GATE_FAILED'
  | 'PATCH_VALIDATION_UNEXPECTED_CHANGES'
  | 'PATCH_VALIDATION_SANDBOX_ESCAPE_ATTEMPT'
  // Phase 104 — Human Approval, Reject & Apply Workflow
  | 'PATCH_APPROVAL_NOT_FOUND'
  | 'PATCH_APPROVAL_CROSS_PROJECT'
  | 'PATCH_APPROVAL_INVALID_STATE_TRANSITION'
  | 'PATCH_APPROVAL_VALIDATION_NOT_VALID'
  | 'PATCH_APPROVAL_STALE_VALIDATION'
  | 'PATCH_APPROVAL_HASH_MISMATCH'
  | 'PATCH_APPROVAL_REPOSITORY_DRIFT'
  | 'PATCH_APPROVAL_NOT_APPROVED'
  | 'PATCH_APPROVAL_ALREADY_APPLIED'
  | 'PATCH_APPROVAL_APPLY_FAILED'
  | 'PATCH_APPROVAL_SCOPE_VIOLATION'
  | 'PATCH_APPROVAL_CONCURRENT_MUTATION'
  // Phase 105 — Patch Rollback & Recovery
  | 'PATCH_ROLLBACK_NOT_FOUND'
  | 'PATCH_ROLLBACK_CROSS_PROJECT'
  | 'PATCH_ROLLBACK_INVALID_STATE'
  | 'PATCH_ROLLBACK_NOT_APPLIED'
  | 'PATCH_ROLLBACK_CONFLICT'
  | 'PATCH_ROLLBACK_DRIFT_DETECTED'
  | 'PATCH_ROLLBACK_RECOVERY_FAILED'
  | 'PATCH_ROLLBACK_INTEGRITY_FAILED'
  | 'PATCH_ROLLBACK_CONCURRENT_MUTATION'
  | 'PATCH_ROLLBACK_RECOVERY_REQUIRED'
  // Phase 106 — Requirement Change-Impact & Intelligent Retest Selection
  | 'RETEST_PLAN_NOT_FOUND'
  | 'RETEST_SNAPSHOT_NOT_FOUND'
  | 'RETEST_PROJECT_MISMATCH'
  | 'RETEST_VALIDATION_ERROR'
  | 'RETEST_PATCH_NOT_FOUND'
  | 'RETEST_REQUIREMENT_NOT_FOUND'
  | 'RETEST_CONCURRENT_ANALYSIS_ERROR'
  | 'RETEST_UNBOUNDED_SCOPE_ERROR'
  // Phase 107 — Post-Fix Jira & Notification Updates
  | 'POST_FIX_SYNC_NOT_FOUND'
  | 'POST_FIX_REVERIFICATION_NOT_FOUND'
  | 'POST_FIX_JIRA_LINK_NOT_FOUND'
  | 'POST_FIX_PROJECT_MISMATCH'
  | 'POST_FIX_VALIDATION_ERROR'
  | 'POST_FIX_UNAUTHORITATIVE_VERIFICATION'
  | 'POST_FIX_CONCURRENT_SYNC_ERROR'
  | 'POST_FIX_INVALID_TRANSITION'
  | 'POST_FIX_JIRA_RATE_LIMITED'
  | 'POST_FIX_JIRA_AUTH_FAILED'
  | 'POST_FIX_NOTIFICATION_FAILED'
  // Phase 108 — Complete Repair & Reverification Audit Trail
  | 'AUDIT_SESSION_NOT_FOUND'
  | 'AUDIT_EVENT_NOT_FOUND'
  | 'AUDIT_IMMUTABILITY_VIOLATION'
  | 'AUDIT_PROJECT_MISMATCH'
  | 'AUDIT_VALIDATION_ERROR'
  | 'AUDIT_CONCURRENT_MUTATION'
  | 'AUDIT_EXPORT_FAILED'
  // Phase 109 — Final QA Report & Release Readiness Intelligence
  | 'QA_REPORT_NOT_FOUND'
  | 'QA_REPORT_ALREADY_FINAL'
  | 'QA_REPORT_IMMUTABILITY_VIOLATION'
  | 'QA_REPORT_PROJECT_MISMATCH'
  | 'QA_REPORT_VALIDATION_ERROR'
  | 'QA_REPORT_EXPORT_FAILED'
  | 'QA_REPORT_STALE_DATA'
  | 'QA_REPORT_CONCURRENT_MUTATION'
  | 'WORKSPACE_SESSION_NOT_FOUND'
  | 'WORKSPACE_SESSION_PROJECT_MISMATCH'
  | 'WORKSPACE_SESSION_VALIDATION_ERROR'
  // V8 Phase 113 & 114: User Authentication Foundation & Recovery Error Codes
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_LOCKED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_AUTH_INPUT'
  | 'RATE_LIMITED'
  | 'AUTHENTICATION_UNAVAILABLE'
  | 'PASSWORD_POLICY_VIOLATION'
  | 'USER_ALREADY_EXISTS'
  | 'ACCOUNT_ALREADY_EXISTS'
  | 'USER_NOT_FOUND'
  | 'RESET_TOKEN_EXPIRED'
  | 'RESET_TOKEN_INVALID'
  | 'PASSWORD_MISMATCH'
  | 'UNAUTHORIZED'
  // V8 Phase 115: Social Authentication Error Codes
  | 'SOCIAL_AUTH_CANCELLED'
  | 'SOCIAL_AUTH_EXPIRED'
  | 'SOCIAL_AUTH_STATE_INVALID'
  | 'SOCIAL_AUTH_PROVIDER_MISMATCH'
  | 'SOCIAL_AUTH_TOKEN_INVALID'
  | 'SOCIAL_AUTH_ACCOUNT_CONFLICT'
  | 'SOCIAL_AUTH_PROVIDER_UNAVAILABLE'
  | 'SOCIAL_AUTH_NETWORK_ERROR'
  | 'SOCIAL_AUTH_DUPLICATE_IDENTITY'
  // V8 Phase 116: User Profile, Account Settings & Preferences Error Codes
  | 'PROFILE_UPDATE_FAILED'
  | 'INVALID_DISPLAY_NAME'
  | 'CURRENT_PASSWORD_INCORRECT'
  | 'CANNOT_CHANGE_OAUTH_PASSWORD'
  | 'PREFERENCE_UPDATE_FAILED'
  | 'ACCOUNT_DELETION_FAILED';

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

export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';

export type EnvironmentType =
  'LOCAL' | 'DEVELOPMENT' | 'TEST' | 'QA' | 'STAGING' | 'UAT' | 'PRODUCTION' | 'CUSTOM';

export type ProductionSafetyPolicy = 'PROHIBITED' | 'MANUAL_APPROVAL_REQUIRED' | 'SAFE_MODE';

export type BrowserColorScheme = 'light' | 'dark' | 'no-preference';

export type ReachabilityStatus =
  | 'REACHABLE'
  | 'UNREACHABLE'
  | 'AUTHENTICATION_REQUIRED'
  | 'TLS_ERROR'
  | 'TIMEOUT'
  | 'REDIRECT_LOOP'
  | 'INVALID_URL';

export interface SecretReferenceItemDto {
  readonly key: string;
  readonly secretRef: string;
  readonly description?: string;
}

export interface TargetApplicationDto {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly description: string | null;
  readonly defaultEnvironmentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpdateTargetApplicationInputDto {
  readonly projectId: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly defaultEnvironmentId?: string | null;
}

export interface ProjectEnvironmentDto {
  readonly id: string;
  readonly projectId: string;
  readonly targetApplicationId: string | null;
  readonly name: string;
  readonly type: EnvironmentType;
  readonly baseUrl: string | null;
  readonly isDefault: boolean;
  readonly isEnabled: boolean;
  readonly isProduction: boolean;
  readonly productionSafetyPolicy: ProductionSafetyPolicy;
  readonly browserEngine: BrowserEngine;
  readonly headless: boolean;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly locale: string | null;
  readonly timezoneId: string | null;
  readonly colorScheme: BrowserColorScheme;
  readonly ignoreHttpsErrors: boolean;
  readonly permissions: readonly string[];
  readonly extraHeaders: Record<string, string> | null;
  readonly variables: Record<string, string> | null;
  readonly secretReferences: readonly SecretReferenceItemDto[] | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ProjectSourceState =
  | 'NOT_CONFIGURED'
  | 'WEBSITE_CONFIGURED'
  | 'REPOSITORY_CONFIGURED'
  | 'LOCAL_FOLDER_CONFIGURED'
  | 'BOTH_CONFIGURED'
  | 'MULTIPLE_CONFIGURED';

export type TargetAuthorizationState = 'UNVERIFIED' | 'USER_CONFIRMED' | 'VERIFIED' | 'BLOCKED';
export type TargetConnectionStatus =
  'CONFIGURED' | 'VERIFIED_REACHABLE' | 'UNREACHABLE' | 'BLOCKED' | 'UNKNOWN';
export type ActionSafetyClass =
  | 'SAFE_READ'
  | 'LOW_RISK_MUTATION'
  | 'HIGH_RISK_MUTATION'
  | 'DESTRUCTIVE'
  | 'EXTERNAL_SIDE_EFFECT'
  | 'FINANCIAL';

export interface WebsiteTargetSummary {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly canonicalUrl: string;
  readonly environmentType: EnvironmentType;
  readonly authorizationState: TargetAuthorizationState;
  readonly authorizationConfirmedAt: string | null;
  readonly authorizationConfirmedBy: string | null;
  readonly safeModeEnabled: boolean;
  readonly requiresAuth: boolean;
  readonly isActive: boolean;
  readonly connectionStatus: TargetConnectionStatus;
  readonly lastCheckedAt: string | null;
  readonly lastReachableAt: string | null;
  readonly lastFailureReason: string | null;
  readonly lastStatusCode: number | null;
  readonly lastResponseTimeMs: number | null;
  readonly resolvedFinalUrl: string | null;
  readonly redirectCount: number;
  readonly tlsValid: boolean | null;
  readonly notes: string | null;
  readonly environmentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type WebsiteTargetDetails = WebsiteTargetSummary;

export interface WebsiteTargetSnapshot {
  readonly websiteTargetId: string;
  readonly projectId: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly canonicalUrl: string;
  readonly environmentType: EnvironmentType;
  readonly resolvedFinalUrl: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly port: number;
  readonly connectionStatus: TargetConnectionStatus;
  readonly tlsValid: boolean | null;
  readonly timestamp: string;
  readonly authorizationState: TargetAuthorizationState;
  readonly safeModeEnabled: boolean;
  readonly requiresAuth: boolean;
  readonly environmentId: string | null;
}

export interface ConnectivityCheckResultDto {
  readonly status: TargetConnectionStatus;
  readonly statusCode: number | null;
  readonly statusText: string | null;
  readonly requestedUrl: string;
  readonly resolvedFinalUrl: string | null;
  readonly responseTimeMs: number;
  readonly redirectCount: number;
  readonly tlsValid: boolean | null;
  readonly message: string;
  readonly checkedAt: string;
  readonly dnsResolved: boolean;
}

// ------------------------------------------------------------------------------
// Git Repository Connections & Repository Import Types & DTOs (V8 Phase 120)
// ------------------------------------------------------------------------------

export type GitProviderType = 'GITHUB' | 'GITLAB' | 'BITBUCKET' | 'LOCAL_GIT';

export type RepositoryConnectionStatus =
  | 'CONFIGURED'
  | 'CONNECTED'
  | 'ACCESSIBLE'
  | 'UNREACHABLE'
  | 'UNAUTHORIZED'
  | 'BLOCKED'
  | 'IMPORTING'
  | 'IMPORTED'
  | 'FAILED';

export type RepositoryImportStatus =
  'NOT_IMPORTED' | 'PENDING' | 'IMPORTING' | 'IMPORTED' | 'FAILED' | 'CANCELLED';

export type RepositoryVisibility = 'PUBLIC' | 'PRIVATE' | 'INTERNAL' | 'UNKNOWN';

export interface GitProviderAccountDto {
  readonly provider: GitProviderType;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly scopes: readonly string[];
}

export interface GitProviderRepositoryDto {
  readonly provider: GitProviderType;
  readonly repositoryIdentifier: string; // e.g. "owner/repo"
  readonly name: string;
  readonly owner: string;
  readonly url: string;
  readonly visibility: RepositoryVisibility;
  readonly defaultBranch: string;
  readonly isFork?: boolean;
}

export interface GitBranchDto {
  readonly name: string;
  readonly commitSha: string;
  readonly isDefault: boolean;
}

export interface RepositoryConnectionSummary {
  readonly id: string;
  readonly projectId: string;
  readonly provider: GitProviderType;
  readonly repositoryIdentifier: string;
  readonly repositoryName: string;
  readonly owner: string;
  readonly repositoryUrl: string;
  readonly displayName: string;
  readonly visibility: RepositoryVisibility;
  readonly defaultBranch: string;
  readonly selectedBranch: string;
  readonly selectedRevision: string | null;
  readonly importedRevision: string | null;
  readonly connectionStatus: RepositoryConnectionStatus;
  readonly importStatus: RepositoryImportStatus;
  readonly isActive: boolean;
  readonly localPath: string | null;
  readonly lastVerifiedAt: string | null;
  readonly lastImportedAt: string | null;
  readonly fileCount: number;
  readonly totalSizeBytes: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RepositoryConnectionDetails extends RepositoryConnectionSummary {
  readonly lastFailureReason: string | null;
  readonly hasCredentials: boolean;
}

export interface RepositoryConnectionSnapshot {
  readonly connectionId: string;
  readonly projectId: string;
  readonly provider: GitProviderType;
  readonly repositoryIdentifier: string;
  readonly repositoryName: string;
  readonly owner: string;
  readonly repositoryUrl: string;
  readonly branch: string;
  readonly revision: string;
  readonly localPath: string | null;
  readonly snapshotTimestamp: string;
}

export interface RepositoryImportResultDto {
  readonly connectionId: string;
  readonly status: RepositoryImportStatus;
  readonly branch: string;
  readonly revision: string;
  readonly fileCount: number;
  readonly totalSizeBytes: number;
  readonly durationMs: number;
  readonly localPath: string;
  readonly errorMessage?: string | null;
}

export interface RepositoryVerificationResultDto {
  readonly connectionId: string;
  readonly accessible: boolean;
  readonly status: RepositoryConnectionStatus;
  readonly resolvedBranch: string;
  readonly resolvedRevision: string;
  readonly errorMessage?: string | null;
  readonly verifiedAt: string;
}

export interface CreateRepositoryConnectionInput {
  readonly projectId: string;
  readonly provider?: GitProviderType;
  readonly repositoryIdentifier: string;
  readonly repositoryName?: string;
  readonly owner?: string;
  readonly repositoryUrl?: string;
  readonly displayName?: string;
  readonly visibility?: RepositoryVisibility;
  readonly defaultBranch?: string;
  readonly selectedBranch?: string;
  readonly selectedRevision?: string | null;
  readonly credentialsToken?: string | null;
  readonly setAsActive?: boolean;
}

export interface UpdateRepositoryConnectionInput {
  readonly projectId: string;
  readonly connectionId: string;
  readonly displayName?: string;
  readonly selectedBranch?: string;
  readonly selectedRevision?: string | null;
  readonly credentialsToken?: string | null;
}

export interface DeleteRepositoryConnectionInput {
  readonly projectId: string;
  readonly connectionId: string;
}

export interface SetActiveRepositoryConnectionInput {
  readonly projectId: string;
  readonly connectionId: string;
}

export interface VerifyRepositoryConnectionInput {
  readonly projectId: string;
  readonly connectionId: string;
}

export interface ImportRepositoryConnectionInput {
  readonly projectId: string;
  readonly connectionId: string;
  readonly branch?: string;
  readonly revision?: string;
}

export interface CancelRepositoryImportInput {
  readonly projectId: string;
  readonly connectionId: string;
}

export interface ResolveRepositorySnapshotInput {
  readonly projectId: string;
  readonly connectionId?: string;
}

export interface GetRepositoryConnectionInput {
  readonly projectId: string;
  readonly connectionId: string;
}

export interface ListRepositoryConnectionsInput {
  readonly projectId: string;
  readonly includeDeleted?: boolean;
}

export interface VerifyGitProviderAuthInput {
  readonly provider: GitProviderType;
  readonly token: string;
}

export interface ListGitProviderReposInput {
  readonly provider: GitProviderType;
  readonly token?: string;
  readonly search?: string;
}

export interface ListGitProviderBranchesInput {
  readonly provider: GitProviderType;
  readonly repositoryIdentifier: string;
  readonly token?: string;
}

// ------------------------------------------------------------------------------
// Local Project Folder & Secure File Access Types & DTOs (V8 Phase 121)
// ------------------------------------------------------------------------------

export type LocalFolderAvailability = 'AVAILABLE' | 'UNAVAILABLE';
export type LocalFolderStatus = 'CONNECTED' | 'DISCONNECTED' | 'MISSING' | 'PERMISSION_DENIED';

export interface LocalFolderConnectionDto {
  readonly id: string;
  readonly projectId: string;
  readonly displayName: string;
  readonly rootPath: string;
  readonly availability: LocalFolderAvailability;
  readonly status: LocalFolderStatus;
  readonly isGitRepository: boolean;
  readonly currentBranch: string | null;
  readonly headCommit: string | null;
  readonly identityFingerprint: string | null;
  readonly filesystemCreatedAt: string | null;
  readonly filesystemModifiedAt: string | null;
  readonly lastValidatedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ConnectLocalFolderInput {
  readonly projectId: string;
  readonly directoryPath?: string;
}

export interface DisconnectLocalFolderInput {
  readonly projectId: string;
}

export interface ValidateLocalFolderInput {
  readonly projectId: string;
}

export interface ProjectFileEntryDto {
  readonly name: string;
  readonly relativePath: string;
  readonly kind: 'file' | 'directory' | 'symlink';
  readonly sizeBytes: number;
  readonly modifiedAt: string;
  readonly isBinary: boolean;
  readonly extension: string;
}

export interface ProjectDirectoryListingDto {
  readonly relativeDirectoryPath: string;
  readonly entries: readonly ProjectFileEntryDto[];
  readonly totalEntries: number;
  readonly truncated: boolean;
  readonly isGitRepository: boolean;
}

export interface ListProjectDirectoryInput {
  readonly projectId: string;
  readonly relativeDirectoryPath?: string;
  readonly recursive?: boolean;
  readonly maxEntries?: number;
  readonly maxDepth?: number;
}

export interface ProjectFileContentDto {
  readonly relativePath: string;
  readonly content: string | null;
  readonly encoding: 'utf-8' | 'base64';
  readonly sizeBytes: number;
  readonly isBinary: boolean;
  readonly isTruncated: boolean;
  readonly lineCount: number;
  readonly modifiedAt: string;
}

export interface ReadProjectFileInput {
  readonly projectId: string;
  readonly relativePath: string;
  readonly maxSizeBytes?: number;
}

export interface ProjectFileSearchMatchDto {
  readonly relativePath: string;
  readonly matchType: 'filename' | 'content';
  readonly lineNumber?: number;
  readonly lineContent?: string;
  readonly previewSnippet?: string;
}

export interface ProjectFileSearchResultDto {
  readonly query: string;
  readonly matches: readonly ProjectFileSearchMatchDto[];
  readonly totalMatches: number;
  readonly durationMs: number;
  readonly truncated: boolean;
}

export interface SearchProjectFilesInput {
  readonly projectId: string;
  readonly query: string;
  readonly searchType?: 'filename' | 'content' | 'both';
  readonly caseSensitive?: boolean;
  readonly maxResults?: number;
}

export interface ProjectFileExistsResultDto {
  readonly exists: boolean;
  readonly kind?: 'file' | 'directory' | 'symlink';
  readonly sizeBytes?: number;
}

export interface CheckProjectFileExistsInput {
  readonly projectId: string;
  readonly relativePath: string;
}

export interface ProjectFileMetadataDto {
  readonly name: string;
  readonly relativePath: string;
  readonly kind: 'file' | 'directory' | 'symlink';
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly modifiedAt: string;
  readonly isBinary: boolean;
  readonly extension: string;
  readonly isGitRepository?: boolean;
}

export interface GetProjectFileMetadataInput {
  readonly projectId: string;
  readonly relativePath: string;
}

export interface ProjectGitDetectionDto {
  readonly isGitRepository: boolean;
  readonly currentBranch: string | null;
  readonly headCommit: string | null;
  readonly isDetachedHead: boolean;
  readonly repositoryRoot: string | null;
}

export interface DetectProjectGitInput {
  readonly projectId: string;
}

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly environmentCount: number;
  readonly defaultEnvironment: ProjectEnvironmentDto | null;
  readonly userId?: string | null;
  readonly lastOpenedAt?: string | null;
  readonly archivedAt?: string | null;
  readonly deletedAt?: string | null;
  readonly isFavorite?: boolean;
  readonly sourceState?: ProjectSourceState;
  readonly activeWebsiteTarget?: WebsiteTargetSummary | null;
  readonly websiteTargets?: readonly WebsiteTargetSummary[];
  readonly activeRepositoryConnection?: RepositoryConnectionSummary | null;
  readonly repositoryConnections?: readonly RepositoryConnectionSummary[];
  readonly localFolder?: LocalFolderConnectionDto | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectDetails {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly environments: readonly ProjectEnvironmentDto[];
  readonly userId?: string | null;
  readonly lastOpenedAt?: string | null;
  readonly archivedAt?: string | null;
  readonly deletedAt?: string | null;
  readonly isFavorite?: boolean;
  readonly sourceState?: ProjectSourceState;
  readonly activeWebsiteTarget?: WebsiteTargetSummary | null;
  readonly websiteTargets?: readonly WebsiteTargetSummary[];
  readonly activeRepositoryConnection?: RepositoryConnectionSummary | null;
  readonly repositoryConnections?: readonly RepositoryConnectionSummary[];
  readonly localFolder?: LocalFolderConnectionDto | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListProjectsInput {
  readonly status?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
  readonly search?: string;
  readonly sortBy?: 'recent' | 'created' | 'name';
  readonly sortDirection?: 'asc' | 'desc';
}

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string | null;
  readonly isFavorite?: boolean;
}

export interface UpdateProjectInput {
  readonly projectId: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly isFavorite?: boolean;
}

export interface MarkProjectOpenedInput {
  readonly projectId: string;
}

export interface CreateWebsiteTargetInput {
  readonly projectId: string;
  readonly url: string;
  readonly name: string;
  readonly environmentType?: EnvironmentType;
  readonly safeModeEnabled?: boolean;
  readonly requiresAuth?: boolean;
  readonly confirmedOwnership?: boolean;
  readonly confirmedProductionRisk?: boolean;
  readonly notes?: string | null;
}

export interface UpdateWebsiteTargetInput {
  readonly projectId: string;
  readonly targetId: string;
  readonly name?: string;
  readonly url?: string;
  readonly environmentType?: EnvironmentType;
  readonly safeModeEnabled?: boolean;
  readonly requiresAuth?: boolean;
  readonly confirmedOwnership?: boolean;
  readonly confirmedProductionRisk?: boolean;
  readonly notes?: string | null;
}

export interface DeleteWebsiteTargetInput {
  readonly projectId: string;
  readonly targetId: string;
}

export interface SetActiveWebsiteTargetInput {
  readonly projectId: string;
  readonly targetId: string;
}

export interface TestWebsiteTargetConnectionInput {
  readonly projectId: string;
  readonly targetId?: string;
  readonly url?: string;
  readonly environmentType?: EnvironmentType;
  readonly timeoutMs?: number;
  readonly ignoreHttpsErrors?: boolean;
}

export interface ConfirmWebsiteTargetAuthInput {
  readonly projectId: string;
  readonly targetId: string;
  readonly confirmedOwnership: boolean;
  readonly confirmedProductionRisk?: boolean;
}

export interface GetWebsiteTargetInput {
  readonly projectId: string;
  readonly targetId: string;
}

export interface ListWebsiteTargetsInput {
  readonly projectId: string;
  readonly includeDeleted?: boolean;
}

export interface ResolveWebsiteTargetSnapshotInput {
  readonly projectId: string;
  readonly targetId?: string;
}

export interface CreateEnvironmentInput {
  readonly projectId: string;
  readonly targetApplicationId?: string | null;
  readonly name: string;
  readonly type?: EnvironmentType;
  readonly baseUrl?: string | null;
  readonly isDefault?: boolean;
  readonly isEnabled?: boolean;
  readonly isProduction?: boolean;
  readonly productionSafetyPolicy?: ProductionSafetyPolicy;
  readonly browserEngine?: BrowserEngine;
  readonly headless?: boolean;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly locale?: string | null;
  readonly timezoneId?: string | null;
  readonly colorScheme?: BrowserColorScheme;
  readonly ignoreHttpsErrors?: boolean;
  readonly permissions?: readonly string[];
  readonly extraHeaders?: Record<string, string> | null;
  readonly variables?: Record<string, string> | null;
  readonly secretReferences?: readonly SecretReferenceItemDto[] | null;
  readonly notes?: string | null;
}

export interface UpdateEnvironmentInput {
  readonly projectId: string;
  readonly environmentId: string;
  readonly targetApplicationId?: string | null;
  readonly name?: string;
  readonly type?: EnvironmentType;
  readonly baseUrl?: string | null;
  readonly isDefault?: boolean;
  readonly isEnabled?: boolean;
  readonly isProduction?: boolean;
  readonly productionSafetyPolicy?: ProductionSafetyPolicy;
  readonly browserEngine?: BrowserEngine;
  readonly headless?: boolean;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly locale?: string | null;
  readonly timezoneId?: string | null;
  readonly colorScheme?: BrowserColorScheme;
  readonly ignoreHttpsErrors?: boolean;
  readonly permissions?: readonly string[];
  readonly extraHeaders?: Record<string, string> | null;
  readonly variables?: Record<string, string> | null;
  readonly secretReferences?: readonly SecretReferenceItemDto[] | null;
  readonly notes?: string | null;
}

export interface DeleteEnvironmentInput {
  readonly projectId: string;
  readonly environmentId: string;
}

export interface SetDefaultEnvironmentInput {
  readonly projectId: string;
  readonly environmentId: string;
}

export interface GetEnvironmentInputDto {
  readonly projectId: string;
  readonly environmentId: string;
}

export interface ListEnvironmentsInputDto {
  readonly projectId: string;
  readonly includeDisabled?: boolean;
}

export interface CheckEnvironmentReachabilityInputDto {
  readonly projectId: string;
  readonly environmentId?: string;
  readonly targetUrl?: string;
  readonly timeoutMs?: number;
  readonly ignoreHttpsErrors?: boolean;
}

export interface EnvironmentReachabilityResultDto {
  readonly status: ReachabilityStatus;
  readonly statusCode: number | null;
  readonly statusText: string | null;
  readonly requestedUrl: string;
  readonly finalUrl: string | null;
  readonly responseTimeMs: number;
  readonly redirectCount: number;
  readonly message: string;
  readonly checkedAt: string;
}

export interface ResolveEnvironmentSnapshotInputDto {
  readonly projectId: string;
  readonly environmentId?: string;
}

export interface ExecutionEnvironmentSnapshotDto {
  readonly environmentId: string;
  readonly projectId: string;
  readonly targetApplicationName: string;
  readonly environmentName: string;
  readonly environmentType: EnvironmentType;
  readonly baseUrl: string;
  readonly isProduction: boolean;
  readonly productionSafetyPolicy: ProductionSafetyPolicy;
  readonly browserEngine: BrowserEngine;
  readonly headless: boolean;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly locale: string | null;
  readonly timezoneId: string | null;
  readonly colorScheme: BrowserColorScheme;
  readonly ignoreHttpsErrors: boolean;
  readonly permissions: readonly string[];
  readonly extraHeaders: Record<string, string>;
  readonly variables: Record<string, string>;
  readonly secretReferences: readonly SecretReferenceItemDto[];
  readonly snapshotTimestamp: string;
  readonly configurationHash: string;
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

export interface PickDirectoryResult {
  readonly cancelled: boolean;
  readonly directoryPath?: string;
  readonly folderName?: string;
}

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

export const attachLocalDirectorySchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  directoryPath: z.string().trim().min(1).optional(),
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
export const projectSourceStateSchema = z.enum(['NOT_CONFIGURED']);

export const listProjectsSchema = z
  .object({
    status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).optional(),
    search: z.string().trim().max(100).optional(),
    sortBy: z.enum(['recent', 'created', 'name']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
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
  isFavorite: z.boolean().optional(),
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
  isFavorite: z.boolean().optional(),
});

export const markProjectOpenedSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
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
  readonly streaming?: boolean;
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

export const aiProviderStatusSchema = z.object({
  providerId: z.string().min(1).max(64),
  configured: z.boolean(),
  status: z.string(),
  capabilities: z.any(),
  verifiedAt: z.string().optional(),
  message: z.string().optional(),
});

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
  readonly overallCoveragePercentage: number | null;
  readonly overallWithPartialPercentage: number | null;
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
// Autonomous Test Execution Domain Types & DTOs (V5 Phase 58)
// ------------------------------------------------------------------------------

export type ExecutionMode = 'HEADLESS' | 'HEADED';

export type ExecutionStatus =
  | 'QUEUED'
  | 'PREPARING'
  | 'RUNNING'
  | 'PASSED'
  | 'FAILED'
  | 'BLOCKED'
  | 'AUTOMATION_ERROR'
  | 'CANCELLED';

export type ExecutionResultOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'AUTOMATION_ERROR' | 'SKIPPED';

export type TestEligibilityStatus =
  'ELIGIBLE' | 'NOT_APPROVED' | 'STALE' | 'REJECTED' | 'UNSUPPORTED_SUITABILITY' | 'NOT_FOUND';

export interface ExecutionCapabilitiesDto {
  readonly playwrightInstalled: boolean;
  readonly playwrightVersion: string | null;
  readonly supportedBrowsers: readonly BrowserEngine[];
  readonly defaultBrowser: BrowserEngine;
  readonly chromiumAvailable: boolean;
  readonly chromiumVersion: string | null;
  readonly runtimeStatus: 'READY' | 'DEGRADED' | 'UNAVAILABLE';
  readonly activeExecutionsCount: number;
}

export interface ExecutionRequestDto {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly testCaseVersionNumber?: number;
  readonly browserEngine?: BrowserEngine;
  readonly headless?: boolean;
  readonly timeoutMs?: number;
  readonly environmentId?: string;
}

export interface ValidateTestEligibilityInputDto {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly versionNumber?: number;
}

export interface TestEligibilityDto {
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly title: string;
  readonly status: TestEligibilityStatus;
  readonly isEligible: boolean;
  readonly reviewStatus: TestReviewStatus;
  readonly currentVersionNumber: number;
  readonly approvedVersionNumber: number | null;
  readonly isRequirementStale: boolean;
  readonly sourceRequirementVersionNumber: number | null;
  readonly currentRequirementVersionNumber: number | null;
  readonly reasons: readonly string[];
}

export interface RuntimeSmokeInputDto {
  readonly browserEngine?: BrowserEngine;
  readonly headless?: boolean;
  readonly timeoutMs?: number;
}

export interface RuntimeSmokeResultDto {
  readonly executionId: string;
  readonly browserEngine: BrowserEngine;
  readonly browserVersion: string;
  readonly headless: boolean;
  readonly launchSuccess: boolean;
  readonly contextSuccess: boolean;
  readonly pageSuccess: boolean;
  readonly navigationSuccess: boolean;
  readonly cleanupSuccess: boolean;
  readonly timings: {
    readonly launchMs: number;
    readonly contextMs: number;
    readonly pageMs: number;
    readonly navigationMs: number;
    readonly cleanupMs: number;
    readonly totalMs: number;
  };
  readonly pageTitle: string;
  readonly verifiedText: string;
  readonly timestamp: string;
}

export interface ExecutionResultFoundationDto {
  readonly executionId: string;
  readonly projectId: string;
  readonly testCaseId: string;
  readonly testCaseVersionNumber: number;
  readonly outcome: ExecutionResultOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly browserEngine: BrowserEngine;
  readonly browserVersion: string | null;
  readonly headless: boolean;
  readonly errorMessage?: string | null;
  readonly errorCode?: string | null;
}

export const executionRequestSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int().positive().optional(),
  browserEngine: z.enum(['chromium', 'firefox', 'webkit']).optional().default('chromium'),
  headless: z.boolean().optional().default(true),
  timeoutMs: z.number().int().min(1000).max(300000).optional().default(30000),
  environmentId: z.string().uuid().optional(),
});

export const validateTestEligibilityInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  versionNumber: z.number().int().positive().optional(),
});

export const runtimeSmokeInputSchema = z.object({
  browserEngine: z.enum(['chromium', 'firefox', 'webkit']).optional().default('chromium'),
  headless: z.boolean().optional().default(true),
  timeoutMs: z.number().int().min(1000).max(60000).optional().default(30000),
});

// ------------------------------------------------------------------------------
// Target Application & Test Environment Configuration Schemas (V5 Phase 59)
// ------------------------------------------------------------------------------

export const environmentTypeSchema = z.enum([
  'LOCAL',
  'DEVELOPMENT',
  'TEST',
  'QA',
  'STAGING',
  'UAT',
  'PRODUCTION',
  'CUSTOM',
]);

export const productionSafetyPolicySchema = z.enum([
  'PROHIBITED',
  'MANUAL_APPROVAL_REQUIRED',
  'SAFE_MODE',
]);

export const browserEngineSchema = z.enum(['chromium', 'firefox', 'webkit']);
export type TargetBrowserEngine = BrowserEngine;

export const browserColorSchemeSchema = z.enum(['light', 'dark', 'no-preference']);

export const secretReferenceItemSchema = z.object({
  key: z.string().min(1).max(100),
  secretRef: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
});

export const updateTargetApplicationSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  defaultEnvironmentId: z.string().uuid().nullable().optional(),
});

export const browserPermissionSchema = z.enum([
  'geolocation',
  'notifications',
  'camera',
  'microphone',
  'clipboard-read',
  'clipboard-write',
  'midi',
  'accelerometer',
  'gyroscope',
  'magnetometer',
  'ambient-light-sensor',
  'payment-handler',
]);

const baseUrlSchema = z
  .string()
  .max(2048)
  .refine(
    val => {
      if (!val || val.trim() === '') return true;
      try {
        const u = new URL(val.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
        if (u.username || u.password) return false;
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Base URL must be a valid http or https URL without credentials.' },
  )
  .nullable()
  .optional();

export const createEnvironmentSchema = z.object({
  projectId: z.string().uuid(),
  targetApplicationId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(80),
  type: environmentTypeSchema.optional().default('DEVELOPMENT'),
  baseUrl: baseUrlSchema,
  isDefault: z.boolean().optional().default(false),
  isEnabled: z.boolean().optional().default(true),
  isProduction: z.boolean().optional().default(false),
  productionSafetyPolicy: productionSafetyPolicySchema.optional().default('PROHIBITED'),
  browserEngine: browserEngineSchema.optional().default('chromium'),
  headless: z.boolean().optional().default(true),
  viewportWidth: z.number().int().min(320).max(3840).optional().default(1280),
  viewportHeight: z.number().int().min(240).max(2160).optional().default(720),
  locale: z.string().max(32).nullable().optional(),
  timezoneId: z.string().max(64).nullable().optional(),
  colorScheme: browserColorSchemeSchema.optional().default('light'),
  ignoreHttpsErrors: z.boolean().optional().default(false),
  permissions: z.array(browserPermissionSchema).optional().default([]),
  extraHeaders: z.record(z.string(), z.string()).nullable().optional(),
  variables: z.record(z.string(), z.string()).nullable().optional(),
  secretReferences: z.array(secretReferenceItemSchema).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateEnvironmentSchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid(),
  targetApplicationId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(80).optional(),
  type: environmentTypeSchema.optional(),
  baseUrl: baseUrlSchema,
  isDefault: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  isProduction: z.boolean().optional(),
  productionSafetyPolicy: productionSafetyPolicySchema.optional(),
  browserEngine: browserEngineSchema.optional(),
  headless: z.boolean().optional(),
  viewportWidth: z.number().int().min(320).max(3840).optional(),
  viewportHeight: z.number().int().min(240).max(2160).optional(),
  locale: z.string().max(32).nullable().optional(),
  timezoneId: z.string().max(64).nullable().optional(),
  colorScheme: browserColorSchemeSchema.optional(),
  ignoreHttpsErrors: z.boolean().optional(),
  permissions: z.array(browserPermissionSchema).optional(),
  extraHeaders: z.record(z.string(), z.string()).nullable().optional(),
  variables: z.record(z.string(), z.string()).nullable().optional(),
  secretReferences: z.array(secretReferenceItemSchema).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const deleteEnvironmentSchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid(),
});

export const setDefaultEnvironmentSchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid(),
});

export const getEnvironmentInputSchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid(),
});

export const listEnvironmentsInputSchema = z.object({
  projectId: z.string().uuid(),
  includeDisabled: z.boolean().optional().default(false),
});

export const checkEnvironmentReachabilitySchema = z
  .object({
    projectId: z.string().uuid(),
    environmentId: z.string().uuid().optional(),
    targetUrl: z.string().max(2048).optional(),
    timeoutMs: z.number().int().min(1000).max(30000).optional().default(5000),
    ignoreHttpsErrors: z.boolean().optional().default(false),
  })
  .refine(data => Boolean(data.environmentId || data.targetUrl), {
    message: 'Either environmentId or targetUrl must be provided.',
  });

export const resolveEnvironmentSnapshotSchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid().optional(),
});

// ------------------------------------------------------------------------------
// Website URL Targets & Live Production Safety Schemas (V8 Phase 119)
// ------------------------------------------------------------------------------

export const targetAuthorizationStateSchema = z.enum([
  'UNVERIFIED',
  'USER_CONFIRMED',
  'VERIFIED',
  'BLOCKED',
]);

export const targetConnectionStatusSchema = z.enum([
  'CONFIGURED',
  'VERIFIED_REACHABLE',
  'UNREACHABLE',
  'BLOCKED',
  'UNKNOWN',
]);

export const actionSafetyClassSchema = z.enum([
  'SAFE_READ',
  'LOW_RISK_MUTATION',
  'HIGH_RISK_MUTATION',
  'DESTRUCTIVE',
  'EXTERNAL_SIDE_EFFECT',
  'FINANCIAL',
]);

export const createWebsiteTargetSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  url: z
    .string()
    .trim()
    .min(1, 'Target URL is required.')
    .max(2048, 'Target URL must be 2048 characters or fewer.'),
  name: z
    .string()
    .trim()
    .min(1, 'Target display name is required.')
    .max(120, 'Target display name must be 120 characters or fewer.'),
  environmentType: environmentTypeSchema.optional().default('LOCAL'),
  safeModeEnabled: z.boolean().optional(),
  requiresAuth: z.boolean().optional().default(false),
  confirmedOwnership: z.boolean().optional().default(false),
  confirmedProductionRisk: z.boolean().optional().default(false),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateWebsiteTargetSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  targetId: z.string().uuid('Target ID must be a valid UUID.'),
  name: z
    .string()
    .trim()
    .min(1, 'Target display name is required.')
    .max(120, 'Target display name must be 120 characters or fewer.')
    .optional(),
  url: z
    .string()
    .trim()
    .min(1, 'Target URL is required.')
    .max(2048, 'Target URL must be 2048 characters or fewer.')
    .optional(),
  environmentType: environmentTypeSchema.optional(),
  safeModeEnabled: z.boolean().optional(),
  requiresAuth: z.boolean().optional(),
  confirmedOwnership: z.boolean().optional(),
  confirmedProductionRisk: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const deleteWebsiteTargetSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  targetId: z.string().uuid('Target ID must be a valid UUID.'),
});

export const setActiveWebsiteTargetSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  targetId: z.string().uuid('Target ID must be a valid UUID.'),
});

export const testWebsiteTargetConnectionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  targetId: z.string().uuid('Target ID must be a valid UUID.').optional(),
  url: z.string().max(2048).optional(),
  environmentType: environmentTypeSchema.optional(),
  timeoutMs: z.number().int().min(500).max(30000).optional().default(5000),
  ignoreHttpsErrors: z.boolean().optional().default(false),
});

export const confirmWebsiteTargetAuthSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  targetId: z.string().uuid('Target ID must be a valid UUID.'),
  confirmedOwnership: z.boolean(),
  confirmedProductionRisk: z.boolean().optional().default(false),
});

export const getWebsiteTargetSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  targetId: z.string().uuid('Target ID must be a valid UUID.'),
});

export const listWebsiteTargetsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  includeDeleted: z.boolean().optional().default(false),
});

export const resolveWebsiteTargetSnapshotSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  targetId: z.string().uuid('Target ID must be a valid UUID.').optional(),
});

// ------------------------------------------------------------------------------
// Git Repository Connections & Repository Import Schemas (V8 Phase 120)
// ------------------------------------------------------------------------------

export const gitProviderTypeSchema = z.enum(['GITHUB', 'GITLAB', 'BITBUCKET', 'LOCAL_GIT']);
export const repositoryConnectionStatusSchema = z.enum([
  'CONFIGURED',
  'CONNECTED',
  'ACCESSIBLE',
  'UNREACHABLE',
  'UNAUTHORIZED',
  'BLOCKED',
  'IMPORTING',
  'IMPORTED',
  'FAILED',
]);
export const repositoryImportStatusSchema = z.enum([
  'NOT_IMPORTED',
  'PENDING',
  'IMPORTING',
  'IMPORTED',
  'FAILED',
  'CANCELLED',
]);
export const repositoryVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE', 'INTERNAL', 'UNKNOWN']);

export const createRepositoryConnectionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  provider: gitProviderTypeSchema.optional().default('GITHUB'),
  repositoryIdentifier: z
    .string()
    .trim()
    .min(1, 'Repository identifier is required.')
    .max(255, 'Repository identifier must be 255 characters or fewer.'),
  repositoryName: z.string().trim().max(255).optional(),
  owner: z.string().trim().max(255).optional(),
  repositoryUrl: z.string().trim().max(2048).optional(),
  displayName: z.string().trim().max(255).optional(),
  visibility: repositoryVisibilitySchema.optional().default('PUBLIC'),
  defaultBranch: z.string().trim().max(255).optional().default('main'),
  selectedBranch: z.string().trim().max(255).optional().default('main'),
  selectedRevision: z.string().trim().max(64).nullable().optional(),
  credentialsToken: z.string().trim().max(1000).nullable().optional(),
  setAsActive: z.boolean().optional(),
});

export const updateRepositoryConnectionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  connectionId: z.string().uuid('Connection ID must be a valid UUID.'),
  displayName: z.string().trim().max(255).optional(),
  selectedBranch: z.string().trim().max(255).optional(),
  selectedRevision: z.string().trim().max(64).nullable().optional(),
  credentialsToken: z.string().trim().max(1000).nullable().optional(),
});

export const deleteRepositoryConnectionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  connectionId: z.string().uuid('Connection ID must be a valid UUID.'),
});

export const setActiveRepositoryConnectionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  connectionId: z.string().uuid('Connection ID must be a valid UUID.'),
});

export const verifyRepositoryConnectionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  connectionId: z.string().uuid('Connection ID must be a valid UUID.'),
});

export const importRepositoryConnectionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  connectionId: z.string().uuid('Connection ID must be a valid UUID.'),
  branch: z.string().trim().max(255).optional(),
  revision: z.string().trim().max(64).optional(),
});

export const cancelRepositoryImportSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  connectionId: z.string().uuid('Connection ID must be a valid UUID.'),
});

export const resolveRepositorySnapshotSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  connectionId: z.string().uuid('Connection ID must be a valid UUID.').optional(),
});

export const getRepositoryConnectionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  connectionId: z.string().uuid('Connection ID must be a valid UUID.'),
});

export const listRepositoryConnectionsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  includeDeleted: z.boolean().optional().default(false),
});

export const verifyGitProviderAuthSchema = z.object({
  provider: gitProviderTypeSchema.optional().default('GITHUB'),
  token: z.string().trim().min(1, 'Access token is required.').max(1000),
});

export const listGitProviderReposSchema = z.object({
  provider: gitProviderTypeSchema.optional().default('GITHUB'),
  token: z.string().trim().max(1000).optional(),
  search: z.string().trim().max(100).optional(),
});

export const listGitProviderBranchesSchema = z.object({
  provider: gitProviderTypeSchema.optional().default('GITHUB'),
  repositoryIdentifier: z.string().trim().min(1, 'Repository identifier is required.').max(255),
  token: z.string().trim().max(1000).optional(),
});

// ------------------------------------------------------------------------------
// Local Project Folder & Secure File Access Schemas (V8 Phase 121)
// ------------------------------------------------------------------------------

export const connectLocalFolderSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  directoryPath: z.string().trim().max(4096).optional(),
});

export const disconnectLocalFolderSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});

export const validateLocalFolderSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});

export const getLocalFolderSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});

export const listProjectDirectorySchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relativeDirectoryPath: z.string().max(1024).optional().default(''),
  recursive: z.boolean().optional().default(false),
  maxEntries: z.number().int().positive().max(10000).optional().default(1000),
  maxDepth: z.number().int().positive().max(20).optional().default(5),
});

export const readProjectFileSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relativePath: z.string().trim().min(1, 'Relative path is required.').max(1024),
  maxSizeBytes: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024)
    .optional()
    .default(10 * 1024 * 1024),
});

export const searchProjectFilesSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  query: z.string().trim().min(1, 'Search query is required.').max(500),
  searchType: z.enum(['filename', 'content', 'both']).optional().default('both'),
  caseSensitive: z.boolean().optional().default(false),
  maxResults: z.number().int().positive().max(500).optional().default(100),
});

export const checkProjectFileExistsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relativePath: z.string().trim().min(1, 'Relative path is required.').max(1024),
});

export const getProjectFileMetadataSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relativePath: z.string().trim().min(1, 'Relative path is required.').max(1024),
});

export const detectProjectGitSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});

// ------------------------------------------------------------------------------
// Structured Test-to-Executable Plan Compiler Schemas & DTOs (V5 Phase 60)
// ------------------------------------------------------------------------------

export const executableActionTypeSchema = z.enum([
  'NAVIGATE',
  'CLICK',
  'DOUBLE_CLICK',
  'FILL',
  'TYPE',
  'CLEAR',
  'SELECT',
  'SELECT_OPTION',
  'CHECK',
  'UNCHECK',
  'PRESS',
  'HOVER',
  'FOCUS',
  'BLUR',
  'SCROLL',
  'SCROLL_INTO_VIEW',
  'UPLOAD',
  'UPLOAD_FILE',
  'DRAG_AND_DROP',
  'GO_BACK',
  'GO_FORWARD',
  'RELOAD',
  'WAIT_FOR_STATE',
  'WAIT_FOR_ELEMENT',
  'WAIT_FOR_URL',
  'WAIT_FOR_LOAD_STATE',
  'ASSERT',
]);
export type ExecutableActionType = z.infer<typeof executableActionTypeSchema>;

export const targetDescriptorKindSchema = z.enum([
  'ROUTE',
  'CONTROL',
  'FIELD',
  'PAGE_REGION',
  'DOCUMENT_UPLOAD',
  'ELEMENT',
]);
export type TargetDescriptorKind = z.infer<typeof targetDescriptorKindSchema>;

export const valueReferenceKindSchema = z.enum([
  'LITERAL',
  'VARIABLE',
  'SECRET_REFERENCE',
  'GENERATED_VALUE',
  'PREVIOUS_STEP_OUTPUT',
]);
export type ValueReferenceKind = z.infer<typeof valueReferenceKindSchema>;

export const assertionTypeSchema = z.enum([
  'VISIBLE',
  'HIDDEN',
  'ELEMENT_VISIBLE',
  'ELEMENT_HIDDEN',
  'ELEMENT_EXISTS',
  'ELEMENT_NOT_EXISTS',
  'ENABLED',
  'DISABLED',
  'ELEMENT_ENABLED',
  'ELEMENT_DISABLED',
  'CHECKED',
  'UNCHECKED',
  'ELEMENT_CHECKED',
  'ELEMENT_UNCHECKED',
  'TEXT_EQUALS',
  'TEXT_CONTAINS',
  'TEXT_MATCHES',
  'VALUE_EQUALS',
  'VALUE_CONTAINS',
  'URL_EQUALS',
  'URL_CONTAINS',
  'URL_MATCHES',
  'TITLE_EQUALS',
  'PAGE_TITLE_EQUALS',
  'PAGE_TITLE_CONTAINS',
  'COUNT_EQUALS',
  'ELEMENT_COUNT_EQUALS',
  'ELEMENT_COUNT_GREATER_THAN',
  'ELEMENT_COUNT_LESS_THAN',
  'ATTRIBUTE_EQUALS',
  'ATTRIBUTE_CONTAINS',
  'RESPONSE_STATUS',
  'CUSTOM_CONDITION',
]);
export type AssertionType = z.infer<typeof assertionTypeSchema>;

export const assertionOperatorSchema = z.enum([
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'NOT_CONTAINS',
  'MATCHES',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'EXISTS',
  'NOT_EXISTS',
  'VISIBLE',
  'HIDDEN',
  'ENABLED',
  'DISABLED',
  'CHECKED',
  'UNCHECKED',
]);
export type AssertionOperator = z.infer<typeof assertionOperatorSchema>;

export const assertionStatusSchema = z.enum([
  'PASSED',
  'FAILED',
  'ERROR',
  'UNSUPPORTED',
  'CANCELLED',
]);
export type AssertionStatus = z.infer<typeof assertionStatusSchema>;

export const planCompilationStatusSchema = z.enum(['VALID', 'INVALID', 'STALE', 'REVIEW_REQUIRED']);
export type PlanCompilationStatus = z.infer<typeof planCompilationStatusSchema>;

export const compilationDiagnosticSeveritySchema = z.enum(['ERROR', 'WARNING', 'INFO']);
export type CompilationDiagnosticSeverity = z.infer<typeof compilationDiagnosticSeveritySchema>;

export const compilationDiagnosticCodeSchema = z.enum([
  'UNSUPPORTED_ACTION',
  'AMBIGUOUS_ACTION',
  'MISSING_TARGET',
  'AMBIGUOUS_TARGET',
  'MISSING_INPUT_VALUE',
  'UNRESOLVED_VARIABLE',
  'UNSUPPORTED_ASSERTION',
  'NON_EXECUTABLE_EXPECTATION',
  'MISSING_ENVIRONMENT',
  'STALE_TEST',
  'UNAPPROVED_TEST',
  'INVALID_STEP_ORDER',
  'UNSAFE_URL',
  'PROHIBITED_ACTION',
  'UNSAFE_PATH',
  'MALFORMED_VARIABLE',
  'VALIDATION_BLOCKER',
]);
export type CompilationDiagnosticCode = z.infer<typeof compilationDiagnosticCodeSchema>;

export const locatorStrategyTypeSchema = z.enum([
  'TEST_ID',
  'ROLE',
  'LABEL',
  'PLACEHOLDER',
  'TEXT',
  'ALT_TEXT',
  'TITLE',
  'CSS',
  'XPATH',
]);
export type LocatorStrategyType = z.infer<typeof locatorStrategyTypeSchema>;

export const locatorScopeTypeSchema = z.enum([
  'PAGE',
  'FORM',
  'DIALOG',
  'MODAL',
  'REGION',
  'SECTION',
  'TABLE',
  'TABLE_ROW',
  'FRAME',
  'CONTAINER',
]);
export type LocatorScopeType = z.infer<typeof locatorScopeTypeSchema>;

export const locatorScopeDescriptorSchema = z.object({
  type: locatorScopeTypeSchema,
  name: z.string().max(255).optional(),
  selector: z.string().max(1024).optional(),
  testId: z.string().max(128).optional(),
  hasText: z.string().max(512).optional(),
});
export type LocatorScopeDescriptorDto = z.infer<typeof locatorScopeDescriptorSchema>;

export const locatorFilterDescriptorSchema = z.object({
  hasText: z.string().max(512).optional(),
  hasNotText: z.string().max(512).optional(),
});
export type LocatorFilterDescriptorDto = z.infer<typeof locatorFilterDescriptorSchema>;

export const locatorFrameDescriptorSchema = z.object({
  selector: z.string().max(1024).optional(),
  name: z.string().max(255).optional(),
  testId: z.string().max(128).optional(),
});
export type LocatorFrameDescriptorDto = z.infer<typeof locatorFrameDescriptorSchema>;

export const executableTargetDescriptorSchema = z.object({
  kind: targetDescriptorKindSchema,
  strategy: locatorStrategyTypeSchema.optional(),
  role: z.string().max(64).optional(),
  name: z.string().max(255).optional(),
  label: z.string().max(255).optional(),
  placeholder: z.string().max(255).optional(),
  testId: z.string().max(128).optional(),
  altText: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  text: z.string().max(512).optional(),
  css: z.string().max(1024).optional(),
  xpath: z.string().max(1024).optional(),
  exact: z.boolean().default(true).optional(),
  ordinal: z.number().int().nonnegative().optional(),
  semanticHint: z.string().max(255).optional(),
  route: z.string().max(2048).optional(),
  locatorHints: z.array(z.string().max(512)).optional(),
  scope: locatorScopeDescriptorSchema.optional(),
  filter: locatorFilterDescriptorSchema.optional(),
  frame: locatorFrameDescriptorSchema.optional(),
});
export type ExecutableTargetDescriptorDto = z.infer<typeof executableTargetDescriptorSchema>;

export const locatorResolutionStatusSchema = z.enum([
  'RESOLVED',
  'NOT_FOUND',
  'AMBIGUOUS',
  'INVALID_TARGET',
  'UNSUPPORTED',
  'CANCELLED',
]);
export type LocatorResolutionStatus = z.infer<typeof locatorResolutionStatusSchema>;

export const elementDiagnosticsDtoSchema = z.object({
  tagName: z.string().optional(),
  role: z.string().optional(),
  accessibleName: z.string().optional(),
  isVisible: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  inputType: z.string().optional(),
  boundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});
export type ElementDiagnosticsDto = z.infer<typeof elementDiagnosticsDtoSchema>;

export const candidateDiagnosticItemSchema = z.object({
  index: z.number().int().nonnegative(),
  tagName: z.string(),
  role: z.string().optional(),
  accessibleName: z.string().optional(),
  isVisible: z.boolean().optional(),
});
export type CandidateDiagnosticItemDto = z.infer<typeof candidateDiagnosticItemSchema>;

export const locatorResolutionResultDtoSchema = z.object({
  status: locatorResolutionStatusSchema,
  strategy: locatorStrategyTypeSchema.optional(),
  matchCount: z.number().int().nonnegative(),
  resolvedTarget: executableTargetDescriptorSchema,
  selectorRecipe: z.string().max(2048),
  durationMs: z.number().nonnegative(),
  elementDiagnostics: elementDiagnosticsDtoSchema.optional(),
  candidateDiagnostics: z.array(candidateDiagnosticItemSchema).optional(),
  errorMessage: z.string().max(2000).optional(),
  errorCode: z.string().max(100).optional(),
});
export type LocatorResolutionResultDto = z.infer<typeof locatorResolutionResultDtoSchema>;

export const resolveLocatorInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  target: executableTargetDescriptorSchema,
  timeoutMs: z.number().int().positive().max(60000).optional(),
});
export type ResolveLocatorInputDto = z.infer<typeof resolveLocatorInputSchema>;

export const executableValueReferenceSchema = z.object({
  kind: valueReferenceKindSchema,
  value: z.string().max(4096).optional(),
  variableName: z.string().max(255).optional(),
  secretRef: z.string().max(255).optional(),
  keyName: z.string().max(100).optional(),
  generator: z.string().max(255).optional(),
  stepSequence: z.number().int().positive().optional(),
  propertyName: z.string().max(100).optional(),
});
export type ExecutableValueReferenceDto = z.infer<typeof executableValueReferenceSchema>;

export const executableAssertionSchema = z.object({
  id: z.string().uuid(),
  type: assertionTypeSchema,
  target: executableTargetDescriptorSchema,
  expectedValue: executableValueReferenceSchema.optional(),
  attributeName: z.string().max(100).optional(),
  stepSequence: z.number().int().positive().optional(),
  isNegated: z.boolean().default(false).optional(),
  description: z.string().max(2000),
});
export type ExecutableAssertionDto = z.infer<typeof executableAssertionSchema>;

export const executablePlanStepSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().positive(),
  action: executableActionTypeSchema,
  target: executableTargetDescriptorSchema.optional(),
  value: executableValueReferenceSchema.optional(),
  description: z.string().max(2000),
  isOptional: z.boolean().default(false),
  timeoutMs: z.number().int().positive().optional(),
  assertions: z.array(executableAssertionSchema).default([]),
});
export type ExecutablePlanStepDto = z.infer<typeof executablePlanStepSchema>;

export const executablePreconditionSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().positive(),
  category: z.enum([
    'EXECUTION_PREREQUISITE',
    'AUTHENTICATION',
    'ENVIRONMENT_ASSUMPTION',
    'DATA_REQUIREMENT',
    'MANUAL_CONSTRAINT',
  ]),
  description: z.string().max(2000),
  isEnforced: z.boolean().default(true),
});
export type ExecutablePreconditionDto = z.infer<typeof executablePreconditionSchema>;

export const executablePostconditionSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().positive(),
  action: z.string().max(2000),
  target: z.string().max(500).optional(),
  isMandatory: z.boolean().default(false),
});
export type ExecutablePostconditionDto = z.infer<typeof executablePostconditionSchema>;

export const compilationDiagnosticSchema = z.object({
  code: compilationDiagnosticCodeSchema,
  severity: compilationDiagnosticSeveritySchema,
  message: z.string().max(1000),
  reason: z.string().max(2000),
  stepSequence: z.number().int().positive().optional(),
  suggestedAction: z.string().max(1000).optional(),
});
export type CompilationDiagnosticDto = z.infer<typeof compilationDiagnosticSchema>;

export const executableTestPlanSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionId: z.string().uuid().nullable().optional(),
  testCaseVersionNumber: z.number().int().positive(),
  environmentId: z.string().uuid().nullable().optional(),
  targetApplicationId: z.string().uuid().nullable().optional(),
  compilerVersion: z.string().max(32),
  planSchemaVersion: z.number().int().positive(),
  status: planCompilationStatusSchema,
  planFingerprint: z.string().max(64),
  sourceRequirementIds: z.array(z.string().uuid()).default([]),
  sourceRequirementKeys: z.array(z.string().max(64)).default([]),
  summary: z.string().nullable().optional(),
  preconditions: z.array(executablePreconditionSchema).default([]),
  steps: z.array(executablePlanStepSchema).default([]),
  assertions: z.array(executableAssertionSchema).default([]),
  postconditions: z.array(executablePostconditionSchema).default([]),
  diagnostics: z.array(compilationDiagnosticSchema).default([]),
  hasErrors: z.boolean(),
  hasWarnings: z.boolean(),
  isExecutable: z.boolean(),
  compiledAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExecutableTestPlanDto = z.infer<typeof executableTestPlanSchema>;

export const compileTestPlanInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int().positive().optional(),
  environmentId: z.string().uuid().optional(),
  previewOnly: z.boolean().optional().default(false),
  forceRecompile: z.boolean().optional().default(false),
});
export type CompileTestPlanInputDto = z.input<typeof compileTestPlanInputSchema>;

export const getExecutablePlanInputSchema = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
});
export type GetExecutablePlanInputDto = z.infer<typeof getExecutablePlanInputSchema>;

export const getExecutablePlanByTestCaseInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int().positive().optional(),
  environmentId: z.string().uuid().optional(),
});
export type GetExecutablePlanByTestCaseInputDto = z.infer<
  typeof getExecutablePlanByTestCaseInputSchema
>;

export const listExecutablePlansInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid().optional(),
  environmentId: z.string().uuid().optional(),
  status: planCompilationStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});
export type ListExecutablePlansInputDto = z.input<typeof listExecutablePlansInputSchema>;

export const previewTestPlanInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int().positive().optional(),
  environmentId: z.string().uuid().optional(),
});
export type PreviewTestPlanInputDto = z.input<typeof previewTestPlanInputSchema>;

// ------------------------------------------------------------------------------
// Test Run Orchestration, Queue & State Machine Contracts (V5 Phase 61)
// ------------------------------------------------------------------------------

export const testRunStatusSchema = z.enum([
  'QUEUED',
  'PREPARING',
  'RUNNING',
  'PASSED',
  'FAILED',
  'BLOCKED',
  'AUTOMATION_ERROR',
  'CANCELLED',
]);
export type TestRunStatus = z.infer<typeof testRunStatusSchema>;

export const testRunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionId: z.string().uuid().nullable().optional(),
  testCaseVersionNumber: z.number().int().positive(),
  executableTestPlanId: z.string().uuid(),
  environmentId: z.string().uuid().nullable().optional(),
  targetApplicationId: z.string().uuid().nullable().optional(),
  status: testRunStatusSchema,
  idempotencyKey: z.string().max(128).nullable().optional(),
  workerId: z.string().max(64).nullable().optional(),
  leaseExpiresAt: z.string().datetime().nullable().optional(),
  heartbeatAt: z.string().datetime().nullable().optional(),
  queuedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  cancelRequestedAt: z.string().datetime().nullable().optional(),
  cancelledAt: z.string().datetime().nullable().optional(),
  terminalReason: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  executionDurationMs: z.number().int().nullable().optional(),
  planFingerprint: z.string().max(64),
  testCaseTitle: z.string(),
  environmentName: z.string().nullable().optional(),
  browserEngine: browserEngineSchema,
  headless: z.boolean(),
  timeoutMs: z.number().int().positive(),
  totalAttempts: z.number().int().positive().default(1),
  passedAfterRetry: z.boolean().default(false),
  reliabilityStatus: z.string().default('NOT_EVALUATED'),
  healingUsed: z.boolean().default(false),
  healingCount: z.number().int().nonnegative().default(0),
  diagnosticsJson: z.array(z.unknown()).default([]),
  metadataJson: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TestRunDto = z.infer<typeof testRunSchema>;

export const enqueueTestRunInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int().positive().optional(),
  environmentId: z.string().uuid().optional(),
  browserEngine: browserEngineSchema.optional().default('chromium'),
  headless: z.boolean().optional().default(true),
  timeoutMs: z.number().int().min(1000).max(300000).optional().default(30000),
  idempotencyKey: z.string().max(128).optional(),
});
export type EnqueueTestRunInputDto = z.input<typeof enqueueTestRunInputSchema>;

export const getTestRunInputSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
});
export type GetTestRunInputDto = z.infer<typeof getTestRunInputSchema>;

export const listTestRunsInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid().optional(),
  status: testRunStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});
export type ListTestRunsInputDto = z.input<typeof listTestRunsInputSchema>;

export const cancelTestRunInputSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type CancelTestRunInputDto = z.input<typeof cancelTestRunInputSchema>;

export const testRunQueueStateSchema = z.object({
  queuedCount: z.number().int().min(0),
  preparingCount: z.number().int().min(0),
  runningCount: z.number().int().min(0),
  maxConcurrentRuns: z.number().int().min(1),
  maxQueueDepth: z.number().int().min(1),
  isQueueFull: z.boolean(),
  activeWorkerIds: z.array(z.string()),
});
export type TestRunQueueStateDto = z.infer<typeof testRunQueueStateSchema>;

// ============================================================================
// Phase 62: Browser Context, Session & Authentication DTOs & Schemas
// ============================================================================

export const authStrategySchema = z.enum(['NONE', 'FORM_LOGIN', 'STORAGE_STATE', 'HTTP_BASIC']);
export type AuthStrategy = z.infer<typeof authStrategySchema>;

export const authValidationTypeSchema = z.enum([
  'NONE',
  'URL_MATCH',
  'ELEMENT_PRESENT',
  'COOKIE_PRESENT',
]);
export type AuthValidationType = z.infer<typeof authValidationTypeSchema>;

export const authProfileStatusSchema = z.enum([
  'CONFIGURED',
  'VALID',
  'INVALID',
  'STALE',
  'UNSUPPORTED',
]);
export type AuthProfileStatus = z.infer<typeof authProfileStatusSchema>;

export const browserSessionLifecycleStatusSchema = z.enum([
  'CREATING',
  'READY',
  'AUTHENTICATING',
  'AUTHENTICATED',
  'ACTIVE',
  'CLOSING',
  'CLOSED',
  'FAILED',
]);
export type BrowserSessionLifecycleStatus = z.infer<typeof browserSessionLifecycleStatusSchema>;

export const authProfileDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  environmentId: z.string().uuid().nullable().optional(),
  environmentName: z.string().nullable().optional(),
  name: z.string().min(1).max(100),
  strategy: authStrategySchema,
  status: authProfileStatusSchema,
  description: z.string().nullable().optional(),
  loginUrl: z.string().nullable().optional(),
  usernameFieldSelector: z.string().nullable().optional(),
  passwordFieldSelector: z.string().nullable().optional(),
  submitControlSelector: z.string().nullable().optional(),
  successValidationType: authValidationTypeSchema,
  successValidationValue: z.string().nullable().optional(),
  credentialReference: z.string().nullable().optional(),
  storageStateKey: z.string().nullable().optional(),
  hasCredential: z.boolean().default(false),
  hasStorageState: z.boolean().default(false),
  isReusable: z.boolean().default(false),
  lastValidatedAt: z.string().nullable().optional(),
  validationError: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AuthProfileDto = z.infer<typeof authProfileDtoSchema>;

export const createAuthProfileInputSchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  strategy: authStrategySchema.default('NONE'),
  description: z.string().max(1000).optional(),
  loginUrl: z.string().max(2048).optional(),
  usernameFieldSelector: z.string().max(255).optional(),
  passwordFieldSelector: z.string().max(255).optional(),
  submitControlSelector: z.string().max(255).optional(),
  successValidationType: authValidationTypeSchema.default('NONE'),
  successValidationValue: z.string().max(2048).optional(),
  credentialReference: z.string().max(255).optional(),
  storageStateKey: z.string().max(255).optional(),
  isReusable: z.boolean().default(false),
  metadataJson: z.record(z.unknown()).optional(),
});
export type CreateAuthProfileInputDto = z.input<typeof createAuthProfileInputSchema>;

export const updateAuthProfileInputSchema = z.object({
  projectId: z.string().uuid(),
  profileId: z.string().uuid(),
  environmentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(100).optional(),
  strategy: authStrategySchema.optional(),
  description: z.string().max(1000).nullable().optional(),
  loginUrl: z.string().max(2048).nullable().optional(),
  usernameFieldSelector: z.string().max(255).nullable().optional(),
  passwordFieldSelector: z.string().max(255).nullable().optional(),
  submitControlSelector: z.string().max(255).nullable().optional(),
  successValidationType: authValidationTypeSchema.optional(),
  successValidationValue: z.string().max(2048).nullable().optional(),
  credentialReference: z.string().max(255).nullable().optional(),
  storageStateKey: z.string().max(255).nullable().optional(),
  isReusable: z.boolean().optional(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type UpdateAuthProfileInputDto = z.input<typeof updateAuthProfileInputSchema>;

export const getAuthProfileInputSchema = z.object({
  projectId: z.string().uuid(),
  profileId: z.string().uuid(),
});
export type GetAuthProfileInputDto = z.infer<typeof getAuthProfileInputSchema>;

export const listAuthProfilesInputSchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid().optional(),
  strategy: authStrategySchema.optional(),
  status: authProfileStatusSchema.optional(),
});
export type ListAuthProfilesInputDto = z.input<typeof listAuthProfilesInputSchema>;

export const deleteAuthProfileInputSchema = z.object({
  projectId: z.string().uuid(),
  profileId: z.string().uuid(),
});
export type DeleteAuthProfileInputDto = z.infer<typeof deleteAuthProfileInputSchema>;

export const validateAuthProfileInputSchema = z.object({
  projectId: z.string().uuid(),
  profileId: z.string().uuid(),
  testPassword: z.string().optional(),
});
export type ValidateAuthProfileInputDto = z.input<typeof validateAuthProfileInputSchema>;

export const authValidationResultDtoSchema = z.object({
  profileId: z.string().uuid(),
  status: authProfileStatusSchema,
  success: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  message: z.string(),
  validatedAt: z.string(),
  finalUrl: z.string().optional(),
  errorDetails: z.string().optional(),
});
export type AuthValidationResultDto = z.infer<typeof authValidationResultDtoSchema>;

// ------------------------------------------------------------------------------
// Browser, Target Environment & Authentication Schemas & DTOs (V8 Phase 122)
// ------------------------------------------------------------------------------

export const targetAuthConfigSchema = z.object({
  id: z.string().uuid(),
  strategy: authStrategySchema,
  status: authProfileStatusSchema,
  loginUrl: z.string().nullable(),
  username: z.string().nullable(),
  hasPassword: z.boolean(),
  passwordPreview: z.string().nullable(),
  usernameFieldSelector: z.string().nullable(),
  passwordFieldSelector: z.string().nullable(),
  submitControlSelector: z.string().nullable(),
  successValidationType: authValidationTypeSchema,
  successValidationValue: z.string().nullable(),
  lastValidatedAt: z.string().nullable(),
  validationError: z.string().nullable(),
});
export type TargetAuthConfigDto = z.infer<typeof targetAuthConfigSchema>;

export const targetEnvironmentConfigSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  type: environmentTypeSchema,
  baseUrl: z.string().nullable(),
  apiUrl: z.string().nullable(),
  isDefault: z.boolean(),
  isEnabled: z.boolean(),
  isProduction: z.boolean(),
  productionSafetyPolicy: productionSafetyPolicySchema,
  browserEngine: browserEngineSchema,
  headless: z.boolean(),
  viewportWidth: z.number().int(),
  viewportHeight: z.number().int(),
  ignoreHttpsErrors: z.boolean(),
  notes: z.string().nullable(),
  auth: targetAuthConfigSchema.nullable().optional(),
  lastCheckedAt: z.string().nullable(),
  connectionStatus: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TargetEnvironmentConfigDto = z.infer<typeof targetEnvironmentConfigSchema>;

export const saveTargetEnvironmentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  environmentId: z.string().uuid('Environment ID must be a valid UUID.').optional(),
  name: z.string().trim().min(1, 'Environment name is required.').max(80),
  type: environmentTypeSchema.optional().default('DEVELOPMENT'),
  baseUrl: z.string().trim().max(2048).nullable().optional(),
  apiUrl: z.string().trim().max(2048).nullable().optional(),
  isDefault: z.boolean().optional(),
  isEnabled: z.boolean().optional().default(true),
  isProduction: z.boolean().optional().default(false),
  productionSafetyPolicy: productionSafetyPolicySchema.optional().default('PROHIBITED'),
  browserEngine: browserEngineSchema.optional().default('chromium'),
  headless: z.boolean().optional().default(true),
  viewportWidth: z.number().int().min(320).max(3840).optional().default(1280),
  viewportHeight: z.number().int().min(240).max(2160).optional().default(720),
  ignoreHttpsErrors: z.boolean().optional().default(false),
  notes: z.string().max(2000).nullable().optional(),
  auth: z
    .object({
      profileId: z.string().uuid().optional(),
      strategy: authStrategySchema.optional().default('NONE'),
      loginUrl: z.string().trim().max(2048).nullable().optional(),
      username: z.string().trim().max(255).nullable().optional(),
      password: z.string().max(500).nullable().optional(),
      usernameFieldSelector: z.string().trim().max(255).nullable().optional(),
      passwordFieldSelector: z.string().trim().max(255).nullable().optional(),
      submitControlSelector: z.string().trim().max(255).nullable().optional(),
      successValidationType: authValidationTypeSchema.optional().default('NONE'),
      successValidationValue: z.string().trim().max(2048).nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type SaveTargetEnvironmentInput = z.infer<typeof saveTargetEnvironmentSchema>;

export const getTargetEnvironmentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  environmentId: z.string().uuid('Environment ID must be a valid UUID.'),
});
export type GetTargetEnvironmentInput = z.infer<typeof getTargetEnvironmentSchema>;

export const listTargetEnvironmentsSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});
export type ListTargetEnvironmentsInput = z.infer<typeof listTargetEnvironmentsSchema>;

export const deleteTargetEnvironmentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  environmentId: z.string().uuid('Environment ID must be a valid UUID.'),
});
export type DeleteTargetEnvironmentInput = z.infer<typeof deleteTargetEnvironmentSchema>;

export const setActiveTargetEnvironmentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  environmentId: z.string().uuid('Environment ID must be a valid UUID.'),
});
export type SetActiveTargetEnvironmentInput = z.infer<typeof setActiveTargetEnvironmentSchema>;

export const testTargetConnectionSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  environmentId: z.string().uuid('Environment ID must be a valid UUID.').optional(),
  url: z.string().trim().max(2048).optional(),
});
export type TestTargetConnectionInput = z.infer<typeof testTargetConnectionSchema>;

export const testTargetAuthSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  environmentId: z.string().uuid('Environment ID must be a valid UUID.'),
  temporaryPassword: z.string().max(500).optional(),
  browserEngine: browserEngineSchema.optional(),
  headless: z.boolean().optional(),
});
export type TestTargetAuthInput = z.infer<typeof testTargetAuthSchema>;

export const resolveTargetEnvironmentSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  environmentId: z.string().uuid('Environment ID must be a valid UUID.').optional(),
});
export type ResolveTargetEnvironmentInput = z.infer<typeof resolveTargetEnvironmentSchema>;

export const targetConnectionTestResultSchema = z.object({
  reachable: z.boolean(),
  statusCode: z.number().nullable(),
  responseTimeMs: z.number(),
  redirectCount: z.number(),
  finalUrl: z.string().nullable(),
  tlsValid: z.boolean().nullable(),
  errorMessage: z.string().nullable(),
});
export type TargetConnectionTestResultDto = z.infer<typeof targetConnectionTestResultSchema>;

export const targetAuthTestResultSchema = z.object({
  success: z.boolean(),
  durationMs: z.number(),
  authenticated: z.boolean(),
  finalUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  diagnosticEvidence: z
    .object({
      screenshotBase64: z.string().optional(),
      domSnippet: z.string().optional(),
      failedStep: z.string().optional(),
    })
    .nullable()
    .optional(),
});
export type TargetAuthTestResultDto = z.infer<typeof targetAuthTestResultSchema>;

export const targetExecutionSnapshotSchema = z.object({
  environmentId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  type: environmentTypeSchema,
  baseUrl: z.string(),
  apiUrl: z.string().nullable(),
  browserEngine: browserEngineSchema,
  headless: z.boolean(),
  viewport: z.object({
    width: z.number().int(),
    height: z.number().int(),
  }),
  ignoreHttpsErrors: z.boolean(),
  isProduction: z.boolean(),
  productionSafetyPolicy: productionSafetyPolicySchema,
  authProfileId: z.string().uuid().nullable(),
  storageStateKey: z.string().nullable(),
  resolvedAt: z.string(),
});
export type TargetExecutionSnapshotDto = z.infer<typeof targetExecutionSnapshotSchema>;

// ------------------------------------------------------------------------------
// Unified Project Context & Source Detection Schemas & DTOs (V8 Phase 123)
// ------------------------------------------------------------------------------

export const projectContextLifecycleStateSchema = z.enum([
  'CONNECTED',
  'PARTIAL',
  'REFRESHING',
  'STALE',
  'INVALID',
  'ERROR',
]);
export type ProjectContextLifecycleState = z.infer<typeof projectContextLifecycleStateSchema>;

export const contextFreshnessSchema = z.object({
  isStale: z.boolean(),
  lastRefreshedAt: z.string(),
  staleReasons: z.array(z.string()),
});
export type ContextFreshnessDto = z.infer<typeof contextFreshnessSchema>;

export const websiteSourceSummarySchema = z.object({
  targetId: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  environmentType: environmentTypeSchema,
  isActive: z.boolean(),
  connectionStatus: targetConnectionStatusSchema,
  safeModeEnabled: z.boolean(),
  lastCheckedAt: z.string().nullable().optional(),
  lastReachableAt: z.string().nullable().optional(),
  lastStatusCode: z.number().int().nullable().optional(),
});
export type WebsiteSourceSummaryDto = z.infer<typeof websiteSourceSummarySchema>;

export const gitSourceSummarySchema = z.object({
  connectionId: z.string(),
  provider: gitProviderTypeSchema,
  repositoryName: z.string(),
  repositoryUrl: z.string(),
  defaultBranch: z.string(),
  selectedBranch: z.string(),
  importedRevision: z.string().nullable().optional(),
  isActive: z.boolean(),
  connectionStatus: repositoryConnectionStatusSchema,
  importStatus: repositoryImportStatusSchema,
  localPath: z.string().nullable().optional(),
  fileCount: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
  lastImportedAt: z.string().nullable().optional(),
});
export type GitSourceSummaryDto = z.infer<typeof gitSourceSummarySchema>;

export const localFolderSourceSummarySchema = z.object({
  sourceId: z.string(),
  displayName: z.string(),
  rootPath: z.string(),
  isGit: z.boolean(),
  branch: z.string().nullable().optional(),
  headCommit: z.string().nullable().optional(),
  isAvailable: z.boolean(),
  lastValidatedAt: z.string().nullable().optional(),
});
export type LocalFolderSourceSummaryDto = z.infer<typeof localFolderSourceSummarySchema>;

export const projectContextSourcesSchema = z.object({
  website: websiteSourceSummarySchema.nullable().optional(),
  git: gitSourceSummarySchema.nullable().optional(),
  localFolder: localFolderSourceSummarySchema.nullable().optional(),
});
export type ProjectContextSourcesDto = z.infer<typeof projectContextSourcesSchema>;

export const projectContextEnvironmentSchema = z.object({
  environmentId: z.string(),
  name: z.string(),
  type: environmentTypeSchema,
  baseUrl: z.string().nullable().optional(),
  apiUrl: z.string().nullable().optional(),
  isProduction: z.boolean(),
  productionSafetyPolicy: productionSafetyPolicySchema,
});
export type ProjectContextEnvironmentDto = z.infer<typeof projectContextEnvironmentSchema>;

export const projectContextBrowserSchema = z.object({
  browserEngine: browserEngineSchema,
  headless: z.boolean(),
  viewportWidth: z.number().int(),
  viewportHeight: z.number().int(),
  ignoreHttpsErrors: z.boolean(),
});
export type ProjectContextBrowserDto = z.infer<typeof projectContextBrowserSchema>;

export const projectContextTargetSchema = z.object({
  baseUrl: z.string().nullable().optional(),
  environment: projectContextEnvironmentSchema.nullable().optional(),
  browser: projectContextBrowserSchema.nullable().optional(),
});
export type ProjectContextTargetDto = z.infer<typeof projectContextTargetSchema>;

export const projectContextAuthProfileSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  strategy: authStrategySchema,
  status: authProfileStatusSchema,
  loginUrl: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  passwordPreview: z.string().nullable().optional(),
  isReusable: z.boolean(),
  lastValidatedAt: z.string().nullable().optional(),
  validationError: z.string().nullable().optional(),
});
export type ProjectContextAuthProfileSummaryDto = z.infer<
  typeof projectContextAuthProfileSummarySchema
>;

export const projectContextAuthSchema = z.object({
  status: z.string(),
  profiles: z.array(projectContextAuthProfileSummarySchema),
});
export type ProjectContextAuthDto = z.infer<typeof projectContextAuthSchema>;

export const detectedTechnologySchema = z.object({
  primaryLanguage: z.string().nullable().optional(),
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  packageManager: z.string().nullable().optional(),
  testFramework: z.string().nullable().optional(),
  likelyEntryPoints: z.array(z.string()),
  testDirectories: z.array(z.string()),
  requirementsFiles: z.array(z.string()),
  configurationFiles: z.array(z.string()),
});
export type DetectedTechnologyDto = z.infer<typeof detectedTechnologySchema>;

export const repositorySummarySchema = z.object({
  fileCount: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
  structureSummary: z.string(),
  isGitRepo: z.boolean(),
  branch: z.string().nullable().optional(),
  commit: z.string().nullable().optional(),
});
export type RepositorySummaryDto = z.infer<typeof repositorySummarySchema>;

export const requirementsSummarySchema = z.object({
  totalRequirements: z.number().int().nonnegative(),
  totalDocuments: z.number().int().nonnegative(),
  statusBreakdown: z.record(z.number().int().nonnegative()),
  lastUpdated: z.string().nullable().optional(),
});
export type RequirementsSummaryDto = z.infer<typeof requirementsSummarySchema>;

export const testSummarySchema = z.object({
  totalTestCases: z.number().int().nonnegative(),
  automatedCount: z.number().int().nonnegative(),
  manualCount: z.number().int().nonnegative(),
  priorityBreakdown: z.record(z.number().int().nonnegative()),
});
export type TestSummaryDto = z.infer<typeof testSummarySchema>;

export const executionSummarySchema = z.object({
  totalRuns: z.number().int().nonnegative(),
  lastRunStatus: z.string().nullable().optional(),
  lastRunAt: z.string().nullable().optional(),
  passRate: z.number().nullable().optional(),
});
export type ExecutionSummaryDto = z.infer<typeof executionSummarySchema>;

export const projectContextSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string(),
  projectDescription: z.string().nullable().optional(),
  projectStatus: projectStatusSchema,
  lifecycleState: projectContextLifecycleStateSchema,
  freshness: contextFreshnessSchema,
  sources: projectContextSourcesSchema,
  target: projectContextTargetSchema,
  authentication: projectContextAuthSchema,
  detectedTechnology: detectedTechnologySchema.nullable().optional(),
  repositorySummary: repositorySummarySchema.nullable().optional(),
  requirementsSummary: requirementsSummarySchema.nullable().optional(),
  testSummary: testSummarySchema.nullable().optional(),
  executionSummary: executionSummarySchema.nullable().optional(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});
export type ProjectContextDto = z.infer<typeof projectContextSchema>;

export const getProjectContextInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  forceRefresh: z.boolean().optional(),
});
export type GetProjectContextInputDto = z.infer<typeof getProjectContextInputSchema>;

export const detectProjectSourcesInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});
export type DetectProjectSourcesInputDto = z.infer<typeof detectProjectSourcesInputSchema>;

export const detectedProjectSourcesSchema = z.object({
  projectId: z.string().uuid(),
  detectedTechnology: detectedTechnologySchema,
  repositorySummary: repositorySummarySchema.nullable().optional(),
  websiteMetadata: z.record(z.unknown()).nullable().optional(),
});
export type DetectedProjectSourcesDto = z.infer<typeof detectedProjectSourcesSchema>;

export const refreshProjectContextInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});
export type RefreshProjectContextInputDto = z.infer<typeof refreshProjectContextInputSchema>;

export const invalidateProjectContextInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  reason: z.string().max(500).optional(),
});
export type InvalidateProjectContextInputDto = z.infer<typeof invalidateProjectContextInputSchema>;

export const getProjectContextStatusInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
});
export type GetProjectContextStatusInputDto = z.infer<typeof getProjectContextStatusInputSchema>;

export const projectContextStatusSchema = z.object({
  projectId: z.string().uuid(),
  lifecycleState: projectContextLifecycleStateSchema,
  isStale: z.boolean(),
  lastRefreshedAt: z.string(),
  connectedSourcesCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});
export type ProjectContextStatusDto = z.infer<typeof projectContextStatusSchema>;

// ------------------------------------------------------------------------------
// Action Execution Engine Schemas & DTOs (V5 Phase 63)
// ------------------------------------------------------------------------------

export const actionExecutionStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'PASSED',
  'FAILED',
  'CANCELLED',
]);
export type ActionExecutionStatus = z.infer<typeof actionExecutionStatusSchema>;

export const actionRiskLevelSchema = z.enum(['READ_ONLY', 'MUTATING', 'DESTRUCTIVE']);
export type ActionRiskLevel = z.infer<typeof actionRiskLevelSchema>;

export const actionResultDtoSchema = z.object({
  actionId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
  testRunId: z.string().uuid(),
  projectId: z.string().uuid(),
  actionType: executableActionTypeSchema,
  status: actionExecutionStatusSchema,
  riskLevel: actionRiskLevelSchema,
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
  targetSummary: z.string().optional(),
  valueSummary: z.string().optional(),
  forceUsed: z.boolean().default(false),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type ActionResultDto = z.infer<typeof actionResultDtoSchema>;

export const stepExecutionResultDtoSchema = z.object({
  stepId: z.string().uuid(),
  sequence: z.number().int().positive(),
  actionResult: actionResultDtoSchema,
  status: actionExecutionStatusSchema,
  durationMs: z.number().int().nonnegative(),
  errorMessage: z.string().optional(),
  assertionResults: z
    .array(z.lazy(() => assertionResultDtoSchema))
    .default([])
    .optional(),
});
export type StepExecutionResultDto = z.infer<typeof stepExecutionResultDtoSchema>;

export const executeActionInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
  action: executablePlanStepSchema,
  allowDestructive: z.boolean().optional(),
});
export type ExecuteActionInputDto = z.input<typeof executeActionInputSchema>;

export const executeStepInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  step: executablePlanStepSchema,
  allowDestructive: z.boolean().optional(),
});
export type ExecuteStepInputDto = z.input<typeof executeStepInputSchema>;

// ------------------------------------------------------------------------------
// Navigation, Waiting & Synchronization Schemas & DTOs (V5 Phase 66)
// ------------------------------------------------------------------------------

export const synchronizationStrategyTypeSchema = z.enum([
  'AUTO',
  'ELEMENT',
  'NAVIGATION',
  'URL',
  'PAGE_LOAD',
  'DOM_CONTENT_LOADED',
  'NETWORK',
  'RESPONSE',
  'LOADING_STATE',
  'POPUP',
  'NEW_PAGE',
  'CUSTOM_CONDITION',
]);
export type SynchronizationStrategyType = z.infer<typeof synchronizationStrategyTypeSchema>;

export const elementReadinessStateSchema = z.enum([
  'ATTACHED',
  'DETACHED',
  'VISIBLE',
  'HIDDEN',
  'ENABLED',
  'DISABLED',
  'EDITABLE',
  'STABLE',
]);
export type ElementReadinessState = z.infer<typeof elementReadinessStateSchema>;

export const pageLoadStateSchema = z.enum(['commit', 'domcontentloaded', 'load', 'networkidle']);
export type PageLoadState = z.infer<typeof pageLoadStateSchema>;

export const synchronizationOutcomeSchema = z.enum(['SATISFIED', 'TIMEOUT', 'CANCELLED', 'FAILED']);
export type SynchronizationOutcome = z.infer<typeof synchronizationOutcomeSchema>;

export const networkRequestMatcherSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).optional(),
  urlPattern: z.string().max(2048).optional(),
  status: z.number().int().min(100).max(599).optional(),
  timeoutMs: z.number().int().positive().optional(),
});
export type NetworkRequestMatcherDto = z.infer<typeof networkRequestMatcherSchema>;

export const customConditionDescriptorSchema = z.object({
  kind: z.enum([
    'LOCATOR_STATE',
    'URL_MATCH',
    'TEXT_APPEARS',
    'RESPONSE_OCCURS',
    'LOADING_DISAPPEARS',
  ]),
  target: executableTargetDescriptorSchema.optional(),
  state: elementReadinessStateSchema.optional(),
  urlPattern: z.string().max(2048).optional(),
  text: z.string().max(1000).optional(),
  responseMatcher: networkRequestMatcherSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
});
export type CustomConditionDescriptorDto = z.infer<typeof customConditionDescriptorSchema>;

export const synchronizationPolicyConfigSchema = z.object({
  defaultStrategy: synchronizationStrategyTypeSchema.default('AUTO'),
  actionTimeoutMs: z.number().int().positive().optional(),
  navigationTimeoutMs: z.number().int().positive().optional(),
  elementTimeoutMs: z.number().int().positive().optional(),
  networkTimeoutMs: z.number().int().positive().optional(),
  popupTimeoutMs: z.number().int().positive().optional(),
  loadingIndicators: z.array(z.string()).default([]),
  waitForNetworkIdle: z.boolean().default(false),
});
export type SynchronizationPolicyConfigDto = z.infer<typeof synchronizationPolicyConfigSchema>;

export const synchronizationResultDtoSchema = z.object({
  strategy: synchronizationStrategyTypeSchema,
  outcome: synchronizationOutcomeSchema,
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number().int().nonnegative(),
  targetSummary: z.string().optional(),
  expectedCondition: z.string().optional(),
  actualState: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type SynchronizationResultDto = z.infer<typeof synchronizationResultDtoSchema>;

export const synchronizeStepInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  strategy: synchronizationStrategyTypeSchema.default('AUTO'),
  target: executableTargetDescriptorSchema.optional(),
  readinessState: elementReadinessStateSchema.optional(),
  urlPattern: z.string().max(2048).optional(),
  loadState: pageLoadStateSchema.optional(),
  responseMatcher: networkRequestMatcherSchema.optional(),
  customCondition: customConditionDescriptorSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
});
export type SynchronizeStepInputDto = z.input<typeof synchronizeStepInputSchema>;

// ------------------------------------------------------------------------------
// Assertion & Expected-vs-Actual Verification Schemas & DTOs (V5 Phase 67)
// ------------------------------------------------------------------------------

export const assertionOptionsSchema = z.object({
  operator: assertionOperatorSchema.optional(),
  timeoutMs: z.number().int().positive().max(120000).optional(),
  isCaseSensitive: z.boolean().default(true).optional(),
  trimWhitespace: z.boolean().default(true).optional(),
  normalizeWhitespace: z.boolean().default(false).optional(),
  isHard: z.boolean().default(true).optional(),
  attributeName: z.string().max(100).optional(),
});
export type AssertionOptionsDto = z.infer<typeof assertionOptionsSchema>;

export const assertionResultDtoSchema = z.object({
  assertionId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
  testRunId: z.string().uuid(),
  projectId: z.string().uuid(),
  assertionType: assertionTypeSchema,
  operator: assertionOperatorSchema,
  status: assertionStatusSchema,
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  targetSummary: z.string().optional(),
  message: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  isHard: z.boolean().default(true),
  durationMs: z.number().int().nonnegative(),
  startedAt: z.string(),
  completedAt: z.string(),
});
export type AssertionResultDto = z.infer<typeof assertionResultDtoSchema>;

export const stepAssertionEvaluationResultDtoSchema = z.object({
  stepId: z.string().uuid(),
  status: assertionStatusSchema,
  results: z.array(assertionResultDtoSchema),
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  errorMessage: z.string().optional(),
});
export type StepAssertionEvaluationResultDto = z.infer<
  typeof stepAssertionEvaluationResultDtoSchema
>;

export const assertInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
  assertion: executableAssertionSchema,
  options: assertionOptionsSchema.optional(),
});
export type AssertInputDto = z.input<typeof assertInputSchema>;

export const evaluateStepAssertionsInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  stepId: z.string().uuid(),
  assertions: z.array(executableAssertionSchema),
  options: assertionOptionsSchema.optional(),
});
export type EvaluateStepAssertionsInputDto = z.input<typeof evaluateStepAssertionsInputSchema>;

// ------------------------------------------------------------------------------
// Execution Persistence & Step-Level Audit Trail Schemas & DTOs (V5 Phase 68)
// ------------------------------------------------------------------------------

export const stepExecutionStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'PASSED',
  'FAILED',
  'BLOCKED',
  'AUTOMATION_ERROR',
  'SKIPPED',
  'CANCELLED',
]);
export type StepExecutionStatus = z.infer<typeof stepExecutionStatusSchema>;

export const assertionExecutionRecordDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  stepExecutionId: z.string().uuid(),
  sourceAssertionId: z.string().uuid().nullable().optional(),
  assertionType: z.string(),
  operator: z.string(),
  status: z.string(),
  isHard: z.boolean().default(true),
  targetSummary: z.string().nullable().optional(),
  expectedValueJson: z.unknown().optional(),
  actualValueJson: z.unknown().optional(),
  message: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  evaluatedAt: z.string().datetime(),
});
export type AssertionExecutionRecordDto = z.infer<typeof assertionExecutionRecordDtoSchema>;

export const stepExecutionRecordDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  sourceStepId: z.string().uuid().nullable().optional(),
  stepIndex: z.number().int().positive(),
  attempt: z.number().int().positive().default(1),
  actionType: z.string(),
  status: stepExecutionStatusSchema,
  healingStatus: z.string().nullable().optional(),
  healedTarget: executableTargetDescriptorSchema.nullable().optional(),
  healingScore: z.number().nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  targetSummary: z.string().nullable().optional(),
  actionDataJson: z.record(z.unknown()).default({}),
  expectedSummary: z.string().nullable().optional(),
  actualSummary: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()).default({}),
  assertionResults: z.array(assertionExecutionRecordDtoSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StepExecutionRecordDto = z.infer<typeof stepExecutionRecordDtoSchema>;

export const testExecutionStateTransitionDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  fromStatus: testRunStatusSchema.nullable().optional(),
  toStatus: testRunStatusSchema,
  reason: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()).default({}),
  transitionedAt: z.string().datetime(),
});
export type TestExecutionStateTransitionDto = z.infer<typeof testExecutionStateTransitionDtoSchema>;

export const testCaseExecutionDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionId: z.string().uuid().nullable().optional(),
  testCaseVersionNumber: z.number().int().positive(),
  executableTestPlanId: z.string().uuid(),
  environmentId: z.string().uuid().nullable().optional(),
  attempt: z.number().int().positive().default(1),
  status: testRunStatusSchema,
  passedAfterRetry: z.boolean().default(false),
  reliabilityStatus: z.string().default('NOT_EVALUATED'),
  retryReason: z.string().nullable().optional(),
  retryEligibilityJson: z.record(z.unknown()).default({}),
  healingUsed: z.boolean().default(false),
  healingCount: z.number().int().nonnegative().default(0),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  terminalReason: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  browserEngine: z.string(),
  environmentSnapshotJson: z.record(z.unknown()).default({}),
  metadataJson: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  stepExecutions: z.array(stepExecutionRecordDtoSchema).optional(),
  stateTransitions: z.array(testExecutionStateTransitionDtoSchema).optional(),
});
export type TestCaseExecutionDto = z.infer<typeof testCaseExecutionDtoSchema>;

export const executionAuditTimelineEventDtoSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  category: z.enum([
    'RUN_LIFECYCLE',
    'EXECUTION_LIFECYCLE',
    'STEP_STARTED',
    'STEP_COMPLETED',
    'ASSERTION_EVALUATED',
  ]),
  status: z.string(),
  title: z.string(),
  description: z.string().optional(),
  stepIndex: z.number().int().optional(),
  attempt: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ExecutionAuditTimelineEventDto = z.infer<typeof executionAuditTimelineEventDtoSchema>;

export const executionAuditTimelineDtoSchema = z.object({
  executionId: z.string().uuid(),
  testRunId: z.string().uuid(),
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseTitle: z.string(),
  testCaseVersionNumber: z.number().int(),
  status: testRunStatusSchema,
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  totalDurationMs: z.number().int().nonnegative().nullable().optional(),
  events: z.array(executionAuditTimelineEventDtoSchema),
});
export type ExecutionAuditTimelineDto = z.infer<typeof executionAuditTimelineDtoSchema>;

// Inputs
export const createExecutionInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionId: z.string().uuid().nullable().optional(),
  testCaseVersionNumber: z.number().int().positive(),
  executableTestPlanId: z.string().uuid(),
  environmentId: z.string().uuid().nullable().optional(),
  attempt: z.number().int().positive().default(1).optional(),
  browserEngine: z.string().default('chromium').optional(),
  environmentSnapshotJson: z.record(z.unknown()).default({}).optional(),
  metadataJson: z.record(z.unknown()).default({}).optional(),
});
export type CreateExecutionInputDto = z.input<typeof createExecutionInputSchema>;

export const startStepExecutionInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  sourceStepId: z.string().uuid().nullable().optional(),
  stepIndex: z.number().int().positive(),
  attempt: z.number().int().positive().default(1).optional(),
  actionType: z.string(),
  targetSummary: z.string().nullable().optional(),
  actionDataJson: z.record(z.unknown()).default({}).optional(),
  expectedSummary: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()).default({}).optional(),
});
export type StartStepExecutionInputDto = z.input<typeof startStepExecutionInputSchema>;

export const completeStepExecutionInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  stepExecutionId: z.string().uuid(),
  status: stepExecutionStatusSchema,
  durationMs: z.number().int().nonnegative(),
  actualSummary: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()).default({}).optional(),
  assertionResults: z
    .array(z.lazy(() => assertionResultDtoSchema))
    .default([])
    .optional(),
});
export type CompleteStepExecutionInputDto = z.input<typeof completeStepExecutionInputSchema>;

export const completeExecutionInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  status: testRunStatusSchema,
  terminalReason: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  metadataJson: z.record(z.unknown()).default({}).optional(),
});
export type CompleteExecutionInputDto = z.input<typeof completeExecutionInputSchema>;

export const getExecutionInputSchema = z.object({
  projectId: z.string().uuid(),
  executionId: z.string().uuid().optional(),
  testRunId: z.string().uuid().optional(),
});
export type GetExecutionInputDto = z.input<typeof getExecutionInputSchema>;

export const listExecutionsInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid().optional(),
  testRunId: z.string().uuid().optional(),
  status: testRunStatusSchema.optional(),
  page: z.number().int().positive().default(1).optional(),
  pageSize: z.number().int().positive().max(100).default(20).optional(),
});
export type ListExecutionsInputDto = z.input<typeof listExecutionsInputSchema>;

export const getExecutionStepsInputSchema = z.object({
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
  page: z.number().int().positive().default(1).optional(),
  pageSize: z.number().int().positive().max(100).default(50).optional(),
});
export type GetExecutionStepsInputDto = z.input<typeof getExecutionStepsInputSchema>;

export const getExecutionAuditTimelineInputSchema = z.object({
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
});
export type GetExecutionAuditTimelineInputDto = z.input<
  typeof getExecutionAuditTimelineInputSchema
>;

export const reconcileOrphanedExecutionsInputSchema = z.object({
  projectId: z.string().uuid().optional(),
});
export type ReconcileOrphanedExecutionsInputDto = z.input<
  typeof reconcileOrphanedExecutionsInputSchema
>;

// ------------------------------------------------------------------------------
// V5 Phase 69 — Failure Evidence Capture Foundation Schemas & DTOs
// ------------------------------------------------------------------------------

export const evidenceBundleStatusSchema = z.enum([
  'PENDING',
  'COLLECTING',
  'COMPLETE',
  'PARTIAL',
  'FAILED',
]);
export type EvidenceBundleStatus = z.infer<typeof evidenceBundleStatusSchema>;

export const evidenceArtifactTypeSchema = z.enum([
  'SCREENSHOT',
  'PLAYWRIGHT_TRACE',
  'CONSOLE_LOG',
  'NETWORK_LOG',
  'NETWORK_REQUEST',
  'NETWORK_RESPONSE',
  'DOM_SNAPSHOT',
  'PAGE_METADATA',
  'ASSERTION_CONTEXT',
  'ERROR_CONTEXT',
]);
export type EvidenceArtifactType = z.infer<typeof evidenceArtifactTypeSchema>;

export const evidenceRedactionStatusSchema = z.enum(['NONE', 'REDACTED', 'PARTIALLY_REDACTED']);
export type EvidenceRedactionStatus = z.infer<typeof evidenceRedactionStatusSchema>;

export const evidenceRetentionStatusSchema = z.enum(['ACTIVE', 'EXPIRED', 'DELETED']);
export type EvidenceRetentionStatus = z.infer<typeof evidenceRetentionStatusSchema>;

export const executionEvidenceArtifactDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  bundleId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  stepExecutionId: z.string().uuid().nullable().optional(),
  artifactType: evidenceArtifactTypeSchema,
  storageIdentity: z.string().min(1).max(128),
  originalLogicalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  redactionStatus: evidenceRedactionStatusSchema,
  capturedAt: z.string(),
  persistedAt: z.string(),
  metadataJson: z.record(z.unknown()).default({}),
  createdAt: z.string(),
});
export type ExecutionEvidenceArtifactDto = z.infer<typeof executionEvidenceArtifactDtoSchema>;

export const executionEvidenceBundleDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  stepExecutionId: z.string().uuid().nullable().optional(),
  stepIndex: z.number().int().positive().nullable().optional(),
  attempt: z.number().int().positive().default(1),
  status: evidenceBundleStatusSchema,
  failureTimestamp: z.string().nullable().optional(),
  collectionStartedAt: z.string().nullable().optional(),
  collectionCompletedAt: z.string().nullable().optional(),
  retentionStatus: evidenceRetentionStatusSchema,
  errorSummary: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
  artifacts: z.array(executionEvidenceArtifactDtoSchema).default([]),
});
export type ExecutionEvidenceBundleDto = z.infer<typeof executionEvidenceBundleDtoSchema>;

export const createEvidenceBundleInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  stepExecutionId: z.string().uuid().optional(),
  stepIndex: z.number().int().positive().optional(),
  attempt: z.number().int().positive().default(1).optional(),
  failureTimestamp: z.string().optional(),
  errorSummary: z.string().max(4000).optional(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type CreateEvidenceBundleInputDto = z.input<typeof createEvidenceBundleInputSchema>;

export const addEvidenceArtifactInputSchema = z.object({
  projectId: z.string().uuid(),
  bundleId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  stepExecutionId: z.string().uuid().optional(),
  artifactType: evidenceArtifactTypeSchema,
  originalLogicalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  content: z.union([z.string(), z.instanceof(Uint8Array)]),
  metadataJson: z.record(z.unknown()).optional(),
  redactionStatus: evidenceRedactionStatusSchema.optional(),
  capturedAt: z.string().optional(),
});
export type AddEvidenceArtifactInputDto = z.input<typeof addEvidenceArtifactInputSchema>;

export const finalizeEvidenceBundleInputSchema = z.object({
  projectId: z.string().uuid(),
  bundleId: z.string().uuid(),
  status: evidenceBundleStatusSchema,
  errorSummary: z.string().max(4000).optional(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type FinalizeEvidenceBundleInputDto = z.input<typeof finalizeEvidenceBundleInputSchema>;

export const getEvidenceBundleInputSchema = z.object({
  projectId: z.string().uuid(),
  bundleId: z.string().uuid(),
});
export type GetEvidenceBundleInputDto = z.input<typeof getEvidenceBundleInputSchema>;

export const listEvidenceBundlesInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid().optional(),
  executionId: z.string().uuid().optional(),
  stepExecutionId: z.string().uuid().optional(),
  status: evidenceBundleStatusSchema.optional(),
  page: z.number().int().positive().default(1).optional(),
  pageSize: z.number().int().positive().max(100).default(20).optional(),
});
export type ListEvidenceBundlesInputDto = z.input<typeof listEvidenceBundlesInputSchema>;

export const listEvidenceArtifactsInputSchema = z.object({
  projectId: z.string().uuid(),
  bundleId: z.string().uuid().optional(),
  testRunId: z.string().uuid().optional(),
  executionId: z.string().uuid().optional(),
  stepExecutionId: z.string().uuid().optional(),
  artifactType: evidenceArtifactTypeSchema.optional(),
  page: z.number().int().positive().default(1).optional(),
  pageSize: z.number().int().positive().max(100).default(50).optional(),
});
export type ListEvidenceArtifactsInputDto = z.input<typeof listEvidenceArtifactsInputSchema>;

export const getEvidenceArtifactMetadataInputSchema = z.object({
  projectId: z.string().uuid(),
  artifactId: z.string().uuid(),
});
export type GetEvidenceArtifactMetadataInputDto = z.input<
  typeof getEvidenceArtifactMetadataInputSchema
>;

export const verifyEvidenceArtifactIntegrityInputSchema = z.object({
  projectId: z.string().uuid(),
  artifactId: z.string().uuid(),
});
export type VerifyEvidenceArtifactIntegrityInputDto = z.input<
  typeof verifyEvidenceArtifactIntegrityInputSchema
>;

export const purgeExecutionEvidenceInputSchema = z.object({
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
});
export type PurgeExecutionEvidenceInputDto = z.input<typeof purgeExecutionEvidenceInputSchema>;

// ------------------------------------------------------------------------------
// V5 Phase 70 — Screenshot, Console, Network, DOM & Trace Collection Schemas & DTOs
// ------------------------------------------------------------------------------

export const traceModeSchema = z.enum(['OFF', 'FAILURE_ONLY', 'ALWAYS']);
export type TraceMode = z.infer<typeof traceModeSchema>;

export const evidenceCollectorConfigSchema = z.object({
  captureFailureScreenshot: z.boolean().default(true),
  captureStepScreenshot: z.boolean().default(false),
  captureConsole: z.boolean().default(true),
  captureNetwork: z.boolean().default(true),
  captureDom: z.boolean().default(true),
  traceMode: traceModeSchema.default('FAILURE_ONLY'),
  fullPageScreenshot: z.boolean().default(false),
  maxConsoleEvents: z.number().int().positive().max(5000).default(500),
  maxNetworkEvents: z.number().int().positive().max(5000).default(500),
  maxBodyBytes: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024)
    .default(64 * 1024),
  maxDomBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024)
    .default(512 * 1024),
  maskSensitiveFields: z.boolean().default(true),
  maskSelectors: z
    .array(z.string())
    .default([
      'input[type="password"]',
      'input[autocomplete*="password"]',
      'input[autocomplete*="cc-"]',
      'input[name*="password" i]',
      'input[name*="token" i]',
      'input[name*="secret" i]',
      'input[name*="apiKey" i]',
      '[data-sensitive="true"]',
    ]),
  collectorTimeoutMs: z.number().int().positive().default(5000),
});
export type EvidenceCollectorConfigDto = z.infer<typeof evidenceCollectorConfigSchema>;

export const getEvidenceArtifactContentInputSchema = z.object({
  projectId: z.string().uuid(),
  artifactId: z.string().uuid(),
});
export type GetEvidenceArtifactContentInputDto = z.input<
  typeof getEvidenceArtifactContentInputSchema
>;

export const evidenceArtifactContentDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  artifactType: evidenceArtifactTypeSchema,
  mimeType: z.string().min(1).max(100),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  content: z.string(),
  isBase64: z.boolean(),
});
export type EvidenceArtifactContentDto = z.infer<typeof evidenceArtifactContentDtoSchema>;

// ------------------------------------------------------------------------------
// V5 Phase 71 — Retry, Flakiness Detection & Execution Recovery Schemas & DTOs
// ------------------------------------------------------------------------------

export const retryCategorySchema = z.enum([
  'TIMEOUT',
  'NETWORK_ERROR',
  'BROWSER_CRASH',
  'CONTEXT_CLOSED',
  'TRANSIENT_DOM_ERROR',
  'AUTOMATION_ERROR',
  'ASSERTION_FAILURE',
  'UNKNOWN',
]);
export type RetryCategory = z.infer<typeof retryCategorySchema>;

export const sideEffectSafetyLevelSchema = z.enum([
  'SAFE_TO_RETRY',
  'RETRY_WITH_NEW_CONTEXT',
  'NOT_SAFE_TO_RETRY',
  'UNKNOWN',
]);
export type SideEffectSafetyLevel = z.infer<typeof sideEffectSafetyLevelSchema>;

export const executionReliabilityStatusSchema = z.enum([
  'STABLE',
  'RECOVERED_RUNTIME',
  'FLAKY_CANDIDATE',
  'NOT_EVALUATED',
]);
export type ExecutionReliabilityStatus = z.infer<typeof executionReliabilityStatusSchema>;

export const retryPolicyConfigDtoSchema = z.object({
  enabled: z.boolean().default(true),
  maxAttempts: z.number().int().min(1).max(5).default(3),
  retryDelayMs: z.number().int().min(0).max(30000).default(1000),
  backoffMultiplier: z.number().min(1.0).max(5.0).default(1.5),
  retryOnAssertionFailure: z.boolean().default(false),
  retryableCategories: z
    .array(retryCategorySchema)
    .default([
      'TIMEOUT',
      'NETWORK_ERROR',
      'BROWSER_CRASH',
      'CONTEXT_CLOSED',
      'TRANSIENT_DOM_ERROR',
      'AUTOMATION_ERROR',
    ]),
  freshContextOnRetry: z.enum(['ALWAYS', 'ON_CRASH_ONLY', 'NEVER']).default('ALWAYS'),
  sideEffectSafetyPolicy: z
    .enum(['SAFE_ONLY', 'ALLOW_IDEMPOTENT', 'STRICT_NO_SIDE_EFFECTS'])
    .default('SAFE_ONLY'),
});
export type RetryPolicyConfigDto = z.infer<typeof retryPolicyConfigDtoSchema>;

export const retryDecisionDtoSchema = z.object({
  shouldRetry: z.boolean(),
  reason: z.string(),
  category: retryCategorySchema,
  attemptNumber: z.number().int().positive(),
  remainingAttempts: z.number().int().nonnegative(),
  safetyLevel: sideEffectSafetyLevelSchema,
  delayMs: z.number().int().nonnegative(),
});
export type RetryDecisionDto = z.infer<typeof retryDecisionDtoSchema>;

export const executionAttemptSummaryDtoSchema = z.object({
  attempt: z.number().int().positive(),
  executionId: z.string().uuid(),
  status: testRunStatusSchema,
  durationMs: z.number().int().nonnegative().nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  retryReason: z.string().nullable().optional(),
  reliabilityStatus: executionReliabilityStatusSchema,
  passedAfterRetry: z.boolean(),
  evidenceBundleId: z.string().uuid().nullable().optional(),
  evidenceArtifactCount: z.number().int().nonnegative().default(0),
});
export type ExecutionAttemptSummaryDto = z.infer<typeof executionAttemptSummaryDtoSchema>;

export const executionReliabilityReportDtoSchema = z.object({
  testRunId: z.string().uuid(),
  totalAttempts: z.number().int().positive(),
  finalStatus: testRunStatusSchema,
  passedAfterRetry: z.boolean(),
  reliabilityStatus: executionReliabilityStatusSchema,
  isFlakyCandidate: z.boolean(),
  inconsistentSteps: z.array(z.number().int().positive()).default([]),
  attempts: z.array(executionAttemptSummaryDtoSchema),
  generatedAt: z.string().datetime(),
});
export type ExecutionReliabilityReportDto = z.infer<typeof executionReliabilityReportDtoSchema>;

export const getExecutionAttemptsInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
});
export type GetExecutionAttemptsInputDto = z.input<typeof getExecutionAttemptsInputSchema>;

export const evaluateExecutionReliabilityInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
});
export type EvaluateExecutionReliabilityInputDto = z.input<
  typeof evaluateExecutionReliabilityInputSchema
>;

// ------------------------------------------------------------------------------
// V5 Phase 72 — Self-Healing Locators, Parallel Execution & Isolation Controls Schemas & DTOs
// ------------------------------------------------------------------------------

export const healingResultStatusSchema = z.enum([
  'NOT_NEEDED',
  'HEALED',
  'HEAL_FAILED',
  'AMBIGUOUS',
  'POLICY_BLOCKED',
  'REVIEW_REQUIRED',
]);
export type HealingResultStatus = z.infer<typeof healingResultStatusSchema>;

export const healingReviewStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED']);
export type HealingReviewStatus = z.infer<typeof healingReviewStatusSchema>;

export const locatorHealingCandidateDtoSchema = z.object({
  candidateIndex: z.number().int().nonnegative(),
  tagName: z.string(),
  role: z.string().nullable().optional(),
  accessibleName: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  testId: z.string().nullable().optional(),
  inputType: z.string().nullable().optional(),
  selectorRecipe: z.string(),
  score: z.number(),
  scoreBreakdown: z.record(z.string(), z.number()),
  isDisqualified: z.boolean(),
  disqualificationReason: z.string().nullable().optional(),
  isVisible: z.boolean(),
  isEnabled: z.boolean(),
});
export type LocatorHealingCandidateDto = z.infer<typeof locatorHealingCandidateDtoSchema>;

export const locatorHealingAttemptDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  stepExecutionId: z.string().uuid().nullable().optional(),
  stepIndex: z.number().int().positive(),
  attempt: z.number().int().positive(),
  actionType: z.string(),
  originalTarget: executableTargetDescriptorSchema,
  originalSelector: z.string(),
  failureReason: z.string(),
  healingResult: healingResultStatusSchema,
  candidateCount: z.number().int().nonnegative(),
  selectedCandidate: locatorHealingCandidateDtoSchema.nullable().optional(),
  selectedScore: z.number().nullable().optional(),
  confidenceThreshold: z.number(),
  scoringModelVersion: z.string(),
  policyVersion: z.string(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  candidatesEvaluated: z.array(locatorHealingCandidateDtoSchema),
  actionAttempted: z.boolean(),
  actionSucceeded: z.boolean(),
  evidenceBundleId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type LocatorHealingAttemptDto = z.infer<typeof locatorHealingAttemptDtoSchema>;

export const locatorHealingSuggestionDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int().positive(),
  stepIndex: z.number().int().positive(),
  originalTarget: executableTargetDescriptorSchema,
  suggestedTarget: executableTargetDescriptorSchema,
  suggestedSelector: z.string(),
  reason: z.string(),
  score: z.number(),
  reviewStatus: healingReviewStatusSchema,
  discoveredInRunId: z.string().uuid(),
  reviewedAt: z.string().nullable().optional(),
  reviewedBy: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LocatorHealingSuggestionDto = z.infer<typeof locatorHealingSuggestionDtoSchema>;

export const getHealingAttemptsInputSchema = z.object({
  projectId: z.string().uuid(),
  testRunId: z.string().uuid().optional(),
  executionId: z.string().uuid().optional(),
  stepIndex: z.number().int().positive().optional(),
});
export type GetHealingAttemptsInputDto = z.input<typeof getHealingAttemptsInputSchema>;

export const listHealingSuggestionsInputSchema = z.object({
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid().optional(),
  reviewStatus: healingReviewStatusSchema.optional(),
});
export type ListHealingSuggestionsInputDto = z.input<typeof listHealingSuggestionsInputSchema>;

export const reviewHealingSuggestionInputSchema = z.object({
  projectId: z.string().uuid(),
  suggestionId: z.string().uuid(),
  reviewStatus: z.enum(['ACCEPTED', 'REJECTED']),
  rejectionReason: z.string().optional(),
  reviewerId: z.string().optional(),
});
export type ReviewHealingSuggestionInputDto = z.input<typeof reviewHealingSuggestionInputSchema>;

export const parallelWorkerPoolConfigDtoSchema = z.object({
  maxParallelRuns: z.number().int().min(1).max(16).default(4),
  maxQueueDepth: z.number().int().min(1).max(500).default(100),
  workerIdleTimeoutMs: z.number().int().min(1000).max(60000).default(10000),
});
export type ParallelWorkerPoolConfigDto = z.infer<typeof parallelWorkerPoolConfigDtoSchema>;

export const parallelWorkerPoolActiveRunDtoSchema = z.object({
  runId: z.string().uuid(),
  projectId: z.string().uuid(),
  workerId: z.string(),
  startedAt: z.string(),
});
export type ParallelWorkerPoolActiveRunDto = z.infer<typeof parallelWorkerPoolActiveRunDtoSchema>;

export const parallelWorkerPoolStateDtoSchema = z.object({
  activeWorkers: z.number().int().nonnegative(),
  maxParallelRuns: z.number().int().positive(),
  activeRuns: z.array(parallelWorkerPoolActiveRunDtoSchema),
  queuedCount: z.number().int().nonnegative(),
  preparingCount: z.number().int().nonnegative(),
  runningCount: z.number().int().nonnegative(),
});
export type ParallelWorkerPoolStateDto = z.infer<typeof parallelWorkerPoolStateDtoSchema>;

export const getParallelPoolStateInputSchema = z.object({
  projectId: z.string().uuid().optional(),
});
export type GetParallelPoolStateInputDto = z.input<typeof getParallelPoolStateInputSchema>;

// -----------------------------------------------------------------------------
// V6 Phase 74 — Failure Intelligence Domain & Analysis Pipeline Contracts
// -----------------------------------------------------------------------------

export const failureCaseStatusSchema = z.enum([
  'PENDING',
  'READY',
  'ANALYZING',
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'STALE',
  'CANCELLED',
]);
export type FailureCaseStatus = z.infer<typeof failureCaseStatusSchema>;

export const failureAnalysisRunStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'CANCELLED',
]);
export type FailureAnalysisRunStatus = z.infer<typeof failureAnalysisRunStatusSchema>;

export const evidenceIntegrityStatusSchema = z.enum([
  'VERIFIED',
  'UNVERIFIED',
  'MISSING',
  'CORRUPT',
  'MISMATCH',
  'UNAVAILABLE',
]);
export type EvidenceIntegrityStatus = z.infer<typeof evidenceIntegrityStatusSchema>;

export const evidenceCompletenessStatusSchema = z.enum([
  'COMPLETE',
  'PARTIAL',
  'MINIMAL',
  'INSUFFICIENT',
]);
export type EvidenceCompletenessStatus = z.infer<typeof evidenceCompletenessStatusSchema>;

export const evidenceAvailabilityStateSchema = z.enum([
  'CAPTURED_AVAILABLE',
  'CAPTURED_EMPTY',
  'NOT_CAPTURED',
  'UNAVAILABLE',
  'FAILED_TO_READ',
]);
export type EvidenceAvailabilityState = z.infer<typeof evidenceAvailabilityStateSchema>;

export const failureCaseDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int(),
  testRunId: z.string().uuid(),
  executionId: z.string().uuid(),
  stepExecutionId: z.string().uuid().nullable().optional(),
  stepIndex: z.number().int().nullable().optional(),
  triggeringExecutionStatus: testRunStatusSchema,
  status: failureCaseStatusSchema,
  isEligible: z.boolean(),
  ineligibilityReason: z.string().nullable().optional(),
  isStale: z.boolean(),
  stalenessReason: z.string().nullable().optional(),
  staleAt: z.string().nullable().optional(),
  currentAnalysisRunId: z.string().uuid().nullable().optional(),
  analysisAttemptCount: z.number().int(),
  title: z.string(),
  failureSummary: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  environmentId: z.string().uuid().nullable().optional(),
  failureSignature: z.string().nullable().optional(),
  evidenceCompleteness: evidenceCompletenessStatusSchema.nullable().optional(),
  metadataJson: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
  testCaseKey: z.string().optional(),
  sourceRequirementId: z.string().uuid().nullable().optional(),
  sourceRequirementKey: z.string().nullable().optional(),
  evidenceReferencesCount: z.number().int().optional(),
  analysisRunsCount: z.number().int().optional(),
});
export type FailureCaseDto = z.infer<typeof failureCaseDtoSchema>;

export const failureAnalysisRunDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  attemptNumber: z.number().int(),
  analyzerVersion: z.string(),
  status: failureAnalysisRunStatusSchema,
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  triggerSource: z.string(),
  inputSnapshotJson: z.record(z.unknown()).default({}),
  failureReason: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FailureAnalysisRunDto = z.infer<typeof failureAnalysisRunDtoSchema>;

export const failureEvidenceReferenceDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analysisRunId: z.string().uuid().nullable().optional(),
  executionId: z.string().uuid(),
  bundleId: z.string().uuid().nullable().optional(),
  artifactType: evidenceArtifactTypeSchema,
  sourceArtifactId: z.string().uuid().nullable().optional(),
  stepExecutionId: z.string().uuid().nullable().optional(),
  storageIdentity: z.string().nullable().optional(),
  logicalName: z.string(),
  mimeType: z.string().nullable().optional(),
  byteSize: z.number().int().nullable().optional(),
  sha256: z.string().nullable().optional(),
  integrityStatus: evidenceIntegrityStatusSchema.default('UNVERIFIED'),
  integrityDetails: z.string().nullable().optional(),
  lastVerifiedAt: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()).default({}),
  attachedAt: z.string(),
});
export type FailureEvidenceReferenceDto = z.infer<typeof failureEvidenceReferenceDtoSchema>;

export const createFailureCaseInputSchema = z.object({
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  failureSummary: z.string().max(5000).optional(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type CreateFailureCaseInputDto = z.input<typeof createFailureCaseInputSchema>;

export const ensureFailureCaseInputSchema = z.object({
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  failureSummary: z.string().max(5000).optional(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type EnsureFailureCaseInputDto = z.input<typeof ensureFailureCaseInputSchema>;

export const getFailureCaseInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetFailureCaseInputDto = z.input<typeof getFailureCaseInputSchema>;

export const listFailureCasesInputSchema = z.object({
  projectId: z.string().uuid(),
  status: failureCaseStatusSchema.optional(),
  testCaseId: z.string().uuid().optional(),
  testRunId: z.string().uuid().optional(),
  isStale: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});
export type ListFailureCasesInputDto = z.input<typeof listFailureCasesInputSchema>;

export const startFailureAnalysisInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analyzerVersion: z.string().max(32).optional(),
  triggerSource: z.string().max(64).optional(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type StartFailureAnalysisInputDto = z.input<typeof startFailureAnalysisInputSchema>;

export const completeFailureAnalysisInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analysisRunId: z.string().uuid(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type CompleteFailureAnalysisInputDto = z.input<typeof completeFailureAnalysisInputSchema>;

export const failFailureAnalysisInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analysisRunId: z.string().uuid(),
  failureReason: z.string().min(1).max(5000),
  metadataJson: z.record(z.unknown()).optional(),
});
export type FailFailureAnalysisInputDto = z.input<typeof failFailureAnalysisInputSchema>;

export const cancelFailureAnalysisInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type CancelFailureAnalysisInputDto = z.input<typeof cancelFailureAnalysisInputSchema>;

export const markFailureCaseStaleInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reason: z.string().min(1).max(255),
});
export type MarkFailureCaseStaleInputDto = z.input<typeof markFailureCaseStaleInputSchema>;

export const listFailureAnalysisRunsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListFailureAnalysisRunsInputDto = z.input<typeof listFailureAnalysisRunsInputSchema>;

export const listFailureEvidenceReferencesInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analysisRunId: z.string().uuid().optional(),
});
export type ListFailureEvidenceReferencesInputDto = z.input<
  typeof listFailureEvidenceReferencesInputSchema
>;

// -----------------------------------------------------------------------------
// V6 Phase 75 — Failure Evidence Ingestion, Normalization & Integrity Contracts
// -----------------------------------------------------------------------------

export const normalizedFailedStepDtoSchema = z.object({
  stepIndex: z.number().int(),
  stepIdentity: z.string().uuid().nullable().optional(),
  actionType: z.string(),
  targetSummary: z.string().nullable().optional(),
  expectedSummary: z.string().nullable().optional(),
  actualSummary: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  attempt: z.number().int().default(1),
  healingUsed: z.boolean().default(false),
  healedTarget: z.string().nullable().optional(),
});
export type NormalizedFailedStepDto = z.infer<typeof normalizedFailedStepDtoSchema>;

export const normalizedExpectedActualDtoSchema = z.object({
  assertionType: z.string().nullable().optional(),
  operator: z.string().nullable().optional(),
  expectedValue: z.unknown().optional(),
  actualValue: z.unknown().optional(),
  message: z.string().nullable().optional(),
  target: z.string().nullable().optional(),
  isHard: z.boolean().default(true),
});
export type NormalizedExpectedActualDto = z.infer<typeof normalizedExpectedActualDtoSchema>;

export const normalizedConsoleMessageDtoSchema = z.object({
  timestamp: z.string().nullable().optional(),
  level: z.enum(['log', 'info', 'warn', 'warning', 'error', 'debug']),
  message: z.string(),
  source: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  lineNumber: z.number().int().nullable().optional(),
  columnNumber: z.number().int().nullable().optional(),
  isRedacted: z.boolean().default(false),
});
export type NormalizedConsoleMessageDto = z.infer<typeof normalizedConsoleMessageDtoSchema>;

export const normalizedNetworkRecordDtoSchema = z.object({
  method: z.string(),
  url: z.string(),
  resourceType: z.string().nullable().optional(),
  statusCode: z.number().int().nullable().optional(),
  requestTimestamp: z.string().nullable().optional(),
  responseTimestamp: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  isFailed: z.boolean().default(false),
  requestHeaders: z.record(z.string()).optional(),
  responseHeaders: z.record(z.string()).optional(),
  isRedacted: z.boolean().default(false),
});
export type NormalizedNetworkRecordDto = z.infer<typeof normalizedNetworkRecordDtoSchema>;

export const normalizedDomEvidenceDtoSchema = z.object({
  elementRole: z.string().nullable().optional(),
  elementName: z.string().nullable().optional(),
  locator: z.string().nullable().optional(),
  isVisible: z.boolean().nullable().optional(),
  isEnabled: z.boolean().nullable().optional(),
  htmlFragment: z.string().nullable().optional(),
  boundingBox: z.record(z.number()).nullable().optional(),
});
export type NormalizedDomEvidenceDto = z.infer<typeof normalizedDomEvidenceDtoSchema>;

export const normalizedRetryRecordDtoSchema = z.object({
  attempt: z.number().int(),
  status: testRunStatusSchema,
  durationMs: z.number().int().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});
export type NormalizedRetryRecordDto = z.infer<typeof normalizedRetryRecordDtoSchema>;

export const normalizedHealingRecordDtoSchema = z.object({
  originalSelector: z.string(),
  failureReason: z.string(),
  healingResult: z.string(),
  candidateCount: z.number().int(),
  selectedCandidate: z.string().nullable().optional(),
  selectedScore: z.number().nullable().optional(),
  confidenceThreshold: z.number(),
});
export type NormalizedHealingRecordDto = z.infer<typeof normalizedHealingRecordDtoSchema>;

export const normalizedEnvironmentDtoSchema = z.object({
  environmentName: z.string().nullable().optional(),
  baseUrl: z.string().nullable().optional(),
  browserEngine: z.string(),
  browserVersion: z.string().nullable().optional(),
  viewport: z.record(z.number()).nullable().optional(),
  operatingSystem: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
});
export type NormalizedEnvironmentDto = z.infer<typeof normalizedEnvironmentDtoSchema>;

export const failureEvidencePackageDtoSchema = z.object({
  packageVersion: z.string().default('1.0.0'),
  failureCaseId: z.string().uuid(),
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
  testRunId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int(),
  requirementId: z.string().uuid().nullable().optional(),
  requirementKey: z.string().nullable().optional(),
  failureSignature: z.string(),
  triggeringStatus: testRunStatusSchema,
  failedStep: normalizedFailedStepDtoSchema.nullable().optional(),
  expectedVsActual: normalizedExpectedActualDtoSchema.nullable().optional(),
  screenshots: z.array(failureEvidenceReferenceDtoSchema),
  consoleMessages: z.array(normalizedConsoleMessageDtoSchema),
  consoleAvailability: evidenceAvailabilityStateSchema,
  networkRecords: z.array(normalizedNetworkRecordDtoSchema),
  networkAvailability: evidenceAvailabilityStateSchema,
  traceReference: failureEvidenceReferenceDtoSchema.nullable().optional(),
  traceAvailability: evidenceAvailabilityStateSchema,
  domEvidence: normalizedDomEvidenceDtoSchema.nullable().optional(),
  domAvailability: evidenceAvailabilityStateSchema,
  retryHistory: z.array(normalizedRetryRecordDtoSchema),
  healingRecords: z.array(normalizedHealingRecordDtoSchema),
  environment: normalizedEnvironmentDtoSchema,
  completeness: evidenceCompletenessStatusSchema,
  integrityStatus: evidenceIntegrityStatusSchema,
  integrityDetails: z.string().nullable().optional(),
  generatedAt: z.string(),
});
export type FailureEvidencePackageDto = z.infer<typeof failureEvidencePackageDtoSchema>;

export const failureEvidenceItemReportDtoSchema = z.object({
  referenceId: z.string().uuid(),
  artifactType: evidenceArtifactTypeSchema,
  logicalName: z.string(),
  status: evidenceIntegrityStatusSchema,
  details: z.string().nullable().optional(),
});
export type FailureEvidenceItemReportDto = z.infer<typeof failureEvidenceItemReportDtoSchema>;

export const failureEvidenceIntegrityReportDtoSchema = z.object({
  failureCaseId: z.string().uuid(),
  projectId: z.string().uuid(),
  overallIntegrity: evidenceIntegrityStatusSchema,
  itemsVerified: z.number().int().nonnegative(),
  itemsMissing: z.number().int().nonnegative(),
  itemsCorrupt: z.number().int().nonnegative(),
  itemsUnavailable: z.number().int().nonnegative(),
  verifiedAt: z.string(),
  itemReports: z.array(failureEvidenceItemReportDtoSchema),
});
export type FailureEvidenceIntegrityReportDto = z.infer<
  typeof failureEvidenceIntegrityReportDtoSchema
>;

export const failureEvidenceArtifactContentDtoSchema = z.object({
  referenceId: z.string().uuid(),
  artifactType: evidenceArtifactTypeSchema,
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string(),
  contentBase64: z.string().nullable().optional(),
  contentText: z.string().nullable().optional(),
  logicalName: z.string(),
});
export type FailureEvidenceArtifactContentDto = z.infer<
  typeof failureEvidenceArtifactContentDtoSchema
>;

export const ingestFailureEvidenceInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  revalidateIntegrity: z.boolean().default(true),
});
export type IngestFailureEvidenceInputDto = z.input<typeof ingestFailureEvidenceInputSchema>;

export const getFailureEvidencePackageInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetFailureEvidencePackageInputDto = z.input<
  typeof getFailureEvidencePackageInputSchema
>;

export const verifyEvidenceIntegrityInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type VerifyEvidenceIntegrityInputDto = z.input<typeof verifyEvidenceIntegrityInputSchema>;

export const getFailureEvidenceArtifactContentInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  referenceId: z.string().uuid(),
});
export type GetFailureEvidenceArtifactContentInputDto = z.input<
  typeof getFailureEvidenceArtifactContentInputSchema
>;

// -----------------------------------------------------------------------------
// V6 Phase 76 — Failure Reproduction & Reproducibility Verification Schemas & DTOs
// -----------------------------------------------------------------------------

export const failureReproductionOutcomeSchema = z.enum([
  'REPRODUCED',
  'NOT_REPRODUCED',
  'BLOCKED',
  'INCONCLUSIVE',
  'CANCELLED',
  'EXECUTION_ERROR',
]);
export type FailureReproductionOutcome = z.infer<typeof failureReproductionOutcomeSchema>;

export const environmentEquivalenceStatusSchema = z.enum([
  'EXACT',
  'EQUIVALENT',
  'DRIFTED',
  'UNKNOWN',
  'INCOMPATIBLE',
]);
export type EnvironmentEquivalenceStatus = z.infer<typeof environmentEquivalenceStatusSchema>;

export const reproductionStepComparisonDtoSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  actionType: z.string(),
  targetSummary: z.string().nullable().optional(),
  isMatch: z.boolean(),
  originalStatus: z.string(),
  reproductionStatus: z.string(),
  originalDurationMs: z.number().int().nonnegative().nullable().optional(),
  reproductionDurationMs: z.number().int().nonnegative().nullable().optional(),
  originalErrorMessage: z.string().nullable().optional(),
  reproductionErrorMessage: z.string().nullable().optional(),
});
export type ReproductionStepComparisonDto = z.infer<typeof reproductionStepComparisonDtoSchema>;

export const reproductionAssertionComparisonDtoSchema = z.object({
  assertionType: z.string().nullable().optional(),
  operator: z.string().nullable().optional(),
  isMatch: z.boolean(),
  originalExpected: z.unknown().optional(),
  originalActual: z.unknown().optional(),
  reproductionExpected: z.unknown().optional(),
  reproductionActual: z.unknown().optional(),
  diffSummary: z.string().nullable().optional(),
});
export type ReproductionAssertionComparisonDto = z.infer<
  typeof reproductionAssertionComparisonDtoSchema
>;

export const reproductionEnvironmentComparisonDtoSchema = z.object({
  status: environmentEquivalenceStatusSchema,
  originalBaseUrl: z.string().nullable().optional(),
  reproductionBaseUrl: z.string().nullable().optional(),
  originalBrowserEngine: z.string().nullable().optional(),
  reproductionBrowserEngine: z.string().nullable().optional(),
  originalViewport: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable()
    .optional(),
  reproductionViewport: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable()
    .optional(),
  driftItems: z.array(z.string()),
});
export type ReproductionEnvironmentComparisonDto = z.infer<
  typeof reproductionEnvironmentComparisonDtoSchema
>;

export const failureReproductionAttemptDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analysisRunId: z.string().uuid().nullable().optional(),
  originalExecutionId: z.string().uuid(),
  reproductionExecutionId: z.string().uuid().nullable().optional(),
  reproductionTestRunId: z.string().uuid().nullable().optional(),
  attemptNumber: z.number().int().positive(),
  testCaseId: z.string().uuid(),
  testCaseVersionId: z.string().uuid().nullable().optional(),
  testCaseVersionNumber: z.number().int().positive(),
  requirementId: z.string().uuid().nullable().optional(),
  requirementVersionNumber: z.number().int().positive().nullable().optional(),
  targetEnvironmentId: z.string().uuid().nullable().optional(),
  browserEngine: z.string(),
  reproductionVersion: z.string(),
  status: failureReproductionOutcomeSchema,
  environmentEquivalence: environmentEquivalenceStatusSchema,
  originalFailureSignature: z.string().nullable().optional(),
  reproductionFailureSignature: z.string().nullable().optional(),
  isSignatureMatch: z.boolean().nullable().optional(),
  failedStepIndex: z.number().int().nonnegative().nullable().optional(),
  isFailedStepMatch: z.boolean().nullable().optional(),
  stepComparison: z.array(reproductionStepComparisonDtoSchema),
  assertionComparison: reproductionAssertionComparisonDtoSchema.nullable().optional(),
  environmentComparison: reproductionEnvironmentComparisonDtoSchema,
  blockerReason: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FailureReproductionAttemptDto = z.infer<typeof failureReproductionAttemptDtoSchema>;

export const reproducibilitySummaryDtoSchema = z.object({
  failureCaseId: z.string().uuid(),
  projectId: z.string().uuid(),
  overallOutcome: failureReproductionOutcomeSchema,
  attemptsRequested: z.number().int().nonnegative(),
  attemptsStarted: z.number().int().nonnegative(),
  attemptsCompleted: z.number().int().nonnegative(),
  equivalentFailures: z.number().int().nonnegative(),
  differentFailures: z.number().int().nonnegative(),
  passes: z.number().int().nonnegative(),
  blockedAttempts: z.number().int().nonnegative(),
  cancelledAttempts: z.number().int().nonnegative(),
  environmentDriftDetected: z.boolean(),
  reproducibilityRatio: z.number().min(0).max(1),
  lastAttemptAt: z.string().nullable().optional(),
});
export type ReproducibilitySummaryDto = z.infer<typeof reproducibilitySummaryDtoSchema>;

export const executeReproductionInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  targetEnvironmentId: z.string().uuid().optional(),
  maxAttempts: z.number().int().min(1).max(5).default(1),
  browserEngine: z.string().optional(),
});
export type ExecuteReproductionInputDto = z.input<typeof executeReproductionInputSchema>;

export const getReproductionAttemptsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetReproductionAttemptsInputDto = z.input<typeof getReproductionAttemptsInputSchema>;

export const getReproducibilitySummaryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetReproducibilitySummaryInputDto = z.input<
  typeof getReproducibilitySummaryInputSchema
>;

export const cancelReproductionInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type CancelReproductionInputDto = z.input<typeof cancelReproductionInputSchema>;

// -----------------------------------------------------------------------------
// V6 Phase 77 — Failure Taxonomy & Deterministic Classification Foundation
// -----------------------------------------------------------------------------

export const failureCategorySchema = z.enum([
  'APPLICATION_FAILURE',
  'AUTOMATION_FAILURE',
  'TEST_DATA_FAILURE',
  'ENVIRONMENT_FAILURE',
  'REQUIREMENT_AMBIGUITY',
  'INVALID_TEST',
  'BLOCKED_EXECUTION',
  'UNKNOWN',
  'INCONCLUSIVE',
]);
export type FailureCategory = z.infer<typeof failureCategorySchema>;

export const failureSubcategorySchema = z.enum([
  'ASSERTION_MISMATCH',
  'HTTP_ERROR_RESPONSE',
  'UNEXPECTED_UI_STATE',
  'MISSING_EXPECTED_ELEMENT',
  'APPLICATION_CRASH',
  'APPLICATION_CONSOLE_ERROR',
  'LOCATOR_NOT_FOUND',
  'AMBIGUOUS_LOCATOR',
  'BROWSER_CRASH',
  'PLAYWRIGHT_ERROR',
  'TIMEOUT',
  'ACTION_EXECUTION_ERROR',
  'UNSUPPORTED_BROWSER',
  'AUTOMATION_INFRASTRUCTURE_ERROR',
  'MISSING_TEST_DATA',
  'INVALID_TEST_DATA',
  'EXPIRED_TEST_DATA',
  'DATA_PRECONDITION_FAILURE',
  'TARGET_UNREACHABLE',
  'ENVIRONMENT_CONFIGURATION_MISSING',
  'INCOMPATIBLE_RUNTIME',
  'ENVIRONMENT_DRIFT',
  'DEPENDENCY_UNAVAILABLE',
  'REQUIREMENT_INCONSISTENCY',
  'TEST_DEFINITION_INVALID',
  'UNSPECIFIED_FAILURE',
]);
export type FailureSubcategory = z.infer<typeof failureSubcategorySchema>;

export const factualSignalStrengthSchema = z.enum(['DEFINITIVE', 'STRONG', 'INDICATIVE']);
export type FactualSignalStrength = z.infer<typeof factualSignalStrengthSchema>;

export const classificationRuleExplanationDtoSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  category: failureCategorySchema,
  subcategory: failureSubcategorySchema.nullable().optional(),
  explanation: z.string(),
  supportingEvidence: z.array(z.string()),
  signalStrength: factualSignalStrengthSchema,
});
export type ClassificationRuleExplanationDto = z.infer<
  typeof classificationRuleExplanationDtoSchema
>;

export const failureClassificationDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analysisRunId: z.string().uuid().nullable().optional(),
  category: failureCategorySchema,
  subcategory: failureSubcategorySchema.nullable().optional(),
  classifierVersion: z.string(),
  taxonomyVersion: z.string(),
  primaryRuleId: z.string(),
  matchedRuleIds: z.array(z.string()),
  ruleExplanations: z.array(classificationRuleExplanationDtoSchema),
  conflictingRuleIds: z.array(z.string()),
  evidenceReferences: z.array(z.string()),
  isAuthoritative: z.boolean(),
  reclassificationReason: z.string().nullable().optional(),
  supersededById: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FailureClassificationDto = z.infer<typeof failureClassificationDtoSchema>;

export const classifyFailureInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analysisRunId: z.string().uuid().optional(),
  forceReclassify: z.boolean().optional(),
  reclassificationReason: z.string().max(1000).optional(),
});
export type ClassifyFailureInputDto = z.input<typeof classifyFailureInputSchema>;

export const getFailureClassificationInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetFailureClassificationInputDto = z.input<typeof getFailureClassificationInputSchema>;

export const reclassifyFailureInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analysisRunId: z.string().uuid().optional(),
  reclassificationReason: z.string().min(1, 'Reclassification reason is required').max(1000),
});
export type ReclassifyFailureInputDto = z.input<typeof reclassifyFailureInputSchema>;

export const listFailureClassificationsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListFailureClassificationsInputDto = z.input<
  typeof listFailureClassificationsInputSchema
>;

// ------------------------------------------------------------------------------
// V6 Phase 78 — Classification Decision Integrity & Arbitration Contracts
// ------------------------------------------------------------------------------

export const decisionIntegrityStateSchema = z.enum([
  'VALID',
  'STALE',
  'INVALIDATED',
  'CONFLICTED',
  'INSUFFICIENT',
  'BLOCKED',
]);
export type DecisionIntegrityState = z.infer<typeof decisionIntegrityStateSchema>;

export const evidenceFreshnessStateSchema = z.enum(['CURRENT', 'STALE', 'UNKNOWN']);
export type EvidenceFreshnessState = z.infer<typeof evidenceFreshnessStateSchema>;

export const decisionConsistencyStateSchema = z.enum(['CONSISTENT', 'INCONSISTENT', 'UNKNOWN']);
export type DecisionConsistencyState = z.infer<typeof decisionConsistencyStateSchema>;

export const decisionArbitrationStateSchema = z.enum([
  'SUPPORTED',
  'OVERRIDDEN',
  'CONFLICTED',
  'UNKNOWN',
]);
export type DecisionArbitrationState = z.infer<typeof decisionArbitrationStateSchema>;

export const classificationDecisionIntegrityDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  classificationId: z.string().uuid(),
  classifierVersion: z.string(),
  taxonomyVersion: z.string(),
  evidencePackageIdentity: z.string(),
  evidencePackageVersion: z.string(),
  evidenceIntegrityState: evidenceIntegrityStatusSchema,
  reproductionSnapshotIdentity: z.string(),
  reproductionSummaryVersion: z.string(),
  decisionFingerprint: z.string(),
  decisionState: decisionIntegrityStateSchema,
  evidenceFreshnessState: evidenceFreshnessStateSchema,
  consistencyState: decisionConsistencyStateSchema,
  arbitrationState: decisionArbitrationStateSchema,
  isAuthoritative: z.boolean(),
  blockingReasons: z.array(z.string()),
  warningReasons: z.array(z.string()),
  conflictDetailsJson: z.record(z.string(), z.unknown()),
  materialChangesJson: z.array(z.string()),
  evaluatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ClassificationDecisionIntegrityDto = z.infer<
  typeof classificationDecisionIntegrityDtoSchema
>;

export const evaluateDecisionIntegrityInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  classificationId: z.string().uuid().optional(),
  forceRecompute: z.boolean().optional(),
});
export type EvaluateDecisionIntegrityInputDto = z.input<
  typeof evaluateDecisionIntegrityInputSchema
>;

export const getDecisionIntegrityInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  classificationId: z.string().uuid().optional(),
});
export type GetDecisionIntegrityInputDto = z.input<typeof getDecisionIntegrityInputSchema>;

export const recomputeDecisionIntegrityInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  classificationId: z.string().uuid().optional(),
});
export type RecomputeDecisionIntegrityInputDto = z.input<
  typeof recomputeDecisionIntegrityInputSchema
>;

export const listDecisionIntegrityHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListDecisionIntegrityHistoryInputDto = z.input<
  typeof listDecisionIntegrityHistoryInputSchema
>;

// ------------------------------------------------------------------------------
// V6 Phase 79 — Flakiness Detection & Reproducibility Intelligence Contracts
// ------------------------------------------------------------------------------

export const flakinessStateSchema = z.enum([
  'STABLE_FAILURE',
  'STABLE_PASS',
  'FLAKY_CANDIDATE',
  'CONFIRMED_FLAKY',
  'INCONCLUSIVE',
  'INSUFFICIENT_EVIDENCE',
  'ENVIRONMENT_VARIABILITY',
  'EXECUTION_VARIABILITY',
]);
export type FlakinessState = z.infer<typeof flakinessStateSchema>;

export const stabilityStateSchema = z.enum(['STABLE', 'INTERMITTENT', 'UNSTABLE', 'UNKNOWN']);
export type StabilityState = z.infer<typeof stabilityStateSchema>;

export const flakinessAttemptSummarySchema = z.object({
  attemptId: z.string(),
  source: z.enum(['PRIMARY_EXECUTION', 'V5_RETRY', 'PHASE76_REPRODUCTION']),
  attemptNumber: z.number().int(),
  status: z.enum(['PASSED', 'FAILED', 'BLOCKED', 'CANCELLED', 'EXECUTION_ERROR']),
  isEligible: z.boolean(),
  ineligibilityReason: z.string().nullable().optional(),
  environmentEquivalence: z.string(),
  failureSignature: z.string().nullable().optional(),
  isSignatureMatch: z.boolean().nullable().optional(),
  failedStepIndex: z.number().nullable().optional(),
  isStepMatch: z.boolean().nullable().optional(),
  testCaseVersionNumber: z.number().int(),
  durationMs: z.number().nullable().optional(),
  timestamp: z.string().nullable().optional(),
});
export type FlakinessAttemptSummaryDto = z.infer<typeof flakinessAttemptSummarySchema>;

export const flakinessAnalysisDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  classificationId: z.string().uuid().nullable().optional(),
  decisionIntegrityId: z.string().uuid().nullable().optional(),
  testCaseId: z.string().uuid(),
  testCaseVersionId: z.string().uuid().nullable().optional(),
  testCaseVersionNumber: z.number().int(),
  analysisVersion: z.string(),
  flakinessPolicyVersion: z.string(),
  flakinessState: flakinessStateSchema,
  stabilityState: stabilityStateSchema,
  attemptCount: z.number().int(),
  validAttemptCount: z.number().int(),
  passCount: z.number().int(),
  failCount: z.number().int(),
  blockedCount: z.number().int(),
  cancelledCount: z.number().int(),
  executionErrorCount: z.number().int(),
  equivalentFailureCount: z.number().int(),
  differentFailureCount: z.number().int(),
  sameStepFailureCount: z.number().int(),
  differentStepFailureCount: z.number().int(),
  environmentComparableCount: z.number().int(),
  environmentDriftCount: z.number().int(),
  reproducibilityRatio: z.number().nullable(),
  passRate: z.number().nullable(),
  failureRate: z.number().nullable(),
  dominantFailureSignature: z.string().nullable().optional(),
  analysisFingerprint: z.string(),
  isAuthoritative: z.boolean(),
  isStale: z.boolean(),
  stalenessReason: z.string().nullable().optional(),
  analysisExplanation: z.string().nullable().optional(),
  attemptTimeline: z.array(flakinessAttemptSummarySchema),
  warnings: z.array(z.string()),
  evidenceGaps: z.array(z.string()),
  evaluatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FlakinessAnalysisDto = z.infer<typeof flakinessAnalysisDtoSchema>;

export const analyzeFlakinessInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  maxAdditionalAttempts: z.number().int().min(0).max(3).optional(),
});
export type AnalyzeFlakinessInputDto = z.input<typeof analyzeFlakinessInputSchema>;

export const getFlakinessAnalysisInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetFlakinessAnalysisInputDto = z.input<typeof getFlakinessAnalysisInputSchema>;

export const reanalyzeFlakinessInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reanalysisReason: z.string().min(1, 'Reanalysis reason is required.'),
  maxAdditionalAttempts: z.number().int().min(0).max(3).optional(),
});
export type ReanalyzeFlakinessInputDto = z.input<typeof reanalyzeFlakinessInputSchema>;

export const listFlakinessHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListFlakinessHistoryInputDto = z.input<typeof listFlakinessHistoryInputSchema>;

// ------------------------------------------------------------------------------
// V6 Phase 80 — Application Bug vs Automation / Test-Data / Environment Failure Separation Contracts
// ------------------------------------------------------------------------------

export const failureDomainSchema = z.enum([
  'APPLICATION_DEFECT_CANDIDATE',
  'AUTOMATION_FAILURE',
  'TEST_DATA_FAILURE',
  'ENVIRONMENT_FAILURE',
  'BLOCKED',
  'INCONCLUSIVE',
  'UNKNOWN',
]);
export type FailureDomain = z.infer<typeof failureDomainSchema>;

export const failureDomainSeparationDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  failureAnalysisRunId: z.string().uuid().nullable().optional(),
  classificationId: z.string().uuid().nullable().optional(),
  decisionIntegrityId: z.string().uuid().nullable().optional(),
  flakinessAnalysisId: z.string().uuid().nullable().optional(),
  testCaseId: z.string().uuid(),
  domain: failureDomainSchema,
  domainSubreason: z.string().nullable().optional(),
  separationRulesVersion: z.string(),
  primaryRationale: z.string(),
  decisionExplanation: z.string(),
  matchedRuleIds: z.array(z.string()),
  excludedDomains: z.array(failureDomainSchema),
  exclusionReasons: z.record(z.string(), z.string()),
  conflictingSignals: z.array(z.string()),
  evidenceReferences: z.array(z.string()),
  reproductionSummary: z.record(z.string(), z.unknown()),
  flakinessSummary: z.record(z.string(), z.unknown()),
  separationFingerprint: z.string(),
  isAuthoritative: z.boolean(),
  isStale: z.boolean(),
  stalenessReason: z.string().nullable().optional(),
  reevaluationCount: z.number().int(),
  lastReevaluatedAt: z.string().nullable().optional(),
  reevaluationReason: z.string().nullable().optional(),
  evaluatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FailureDomainSeparationDto = z.infer<typeof failureDomainSeparationDtoSchema>;

export const separateFailureDomainInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type SeparateFailureDomainInputDto = z.input<typeof separateFailureDomainInputSchema>;

export const getDomainSeparationInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetDomainSeparationInputDto = z.input<typeof getDomainSeparationInputSchema>;

export const reevaluateDomainSeparationInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reevaluationReason: z.string().min(1, 'Reevaluation reason is required.'),
});
export type ReevaluateDomainSeparationInputDto = z.input<
  typeof reevaluateDomainSeparationInputSchema
>;

export const listDomainSeparationHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListDomainSeparationHistoryInputDto = z.input<
  typeof listDomainSeparationHistoryInputSchema
>;

// ------------------------------------------------------------------------------
// V6 Phase 81 — Failure Evidence Correlation & Technical Cause Localization Contracts
// ------------------------------------------------------------------------------

export const technicalLayerSchema = z.enum([
  'FRONTEND_UI',
  'FRONTEND_STATE',
  'FRONTEND_NETWORK_CLIENT',
  'BACKEND_API',
  'BACKEND_SERVICE',
  'DATABASE',
  'AUTHENTICATION',
  'AUTHORIZATION',
  'EXTERNAL_SERVICE',
  'BROWSER_AUTOMATION',
  'TEST_INFRASTRUCTURE',
  'TEST_DATA',
  'ENVIRONMENT',
  'UNKNOWN',
  'MULTI_LAYER',
]);
export type TechnicalLayer = z.infer<typeof technicalLayerSchema>;

export const localizationTargetTypeSchema = z.enum([
  'TEST_STEP',
  'ASSERTION',
  'DOM_ELEMENT',
  'FRONTEND_ROUTE',
  'FRONTEND_COMPONENT',
  'FRONTEND_EVENT_HANDLER',
  'NETWORK_REQUEST',
  'API_ENDPOINT',
  'BACKEND_ROUTE',
  'BACKEND_CONTROLLER',
  'BACKEND_SERVICE',
  'REPOSITORY_FILE',
  'REPOSITORY_SYMBOL',
  'DATABASE_OPERATION',
  'EXTERNAL_SERVICE',
  'ENVIRONMENT_DEPENDENCY',
  'BROWSER_SUBSYSTEM',
]);
export type LocalizationTargetType = z.infer<typeof localizationTargetTypeSchema>;

export const signalStrengthSchema = z.enum(['DIRECT', 'STRONG', 'SUPPORTING', 'WEAK', 'UNKNOWN']);
export type SignalStrength = z.infer<typeof signalStrengthSchema>;

export const timelineEventTypeSchema = z.enum([
  'STEP_EXECUTION',
  'NETWORK_REQUEST',
  'NETWORK_RESPONSE',
  'CONSOLE_ERROR',
  'DOM_MUTATION',
  'ASSERTION_FAILURE',
  'ERROR_EVENT',
]);
export type TimelineEventType = z.infer<typeof timelineEventTypeSchema>;

export const timelineEventDtoSchema = z.object({
  eventId: z.string(),
  eventType: timelineEventTypeSchema,
  timestampMs: z.number(),
  relativeTimeMs: z.number(),
  stepIndex: z.number().int().optional(),
  summary: z.string(),
  details: z.record(z.string(), z.unknown()),
  evidenceArtifactId: z.string().optional(),
});
export type TimelineEventDto = z.infer<typeof timelineEventDtoSchema>;

export const correlationSignalDtoSchema = z.object({
  signalId: z.string(),
  signalType: z.string(),
  technicalLayer: technicalLayerSchema,
  targetType: localizationTargetTypeSchema,
  targetIdentity: z.string(),
  sourceEvidenceKey: z.string(),
  executionId: z.string().optional(),
  stepIndex: z.number().int().optional(),
  networkRequestId: z.string().optional(),
  repositoryReference: z.string().optional(),
  strength: signalStrengthSchema,
  explanation: z.string(),
});
export type CorrelationSignalDto = z.infer<typeof correlationSignalDtoSchema>;

export const secondaryTargetDtoSchema = z.object({
  targetType: localizationTargetTypeSchema,
  identifier: z.string(),
  explanation: z.string(),
});
export type SecondaryTargetDto = z.infer<typeof secondaryTargetDtoSchema>;

export const failureTechnicalLocalizationDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  failureAnalysisRunId: z.string().uuid().nullable().optional(),
  domainSeparationId: z.string().uuid().nullable().optional(),
  primaryLayer: technicalLayerSchema,
  secondaryLayers: z.array(technicalLayerSchema),
  primaryTargetType: localizationTargetTypeSchema,
  primaryTargetIdentifier: z.string(),
  secondaryTargets: z.array(secondaryTargetDtoSchema),
  repositoryFileId: z.string().uuid().nullable().optional(),
  repositorySymbolId: z.string().uuid().nullable().optional(),
  matchedFilePath: z.string().nullable().optional(),
  matchedSymbolName: z.string().nullable().optional(),
  matchedLineNumber: z.number().int().nullable().optional(),
  httpEndpoint: z.string().nullable().optional(),
  httpMethod: z.string().nullable().optional(),
  httpStatusCode: z.number().int().nullable().optional(),
  domSelector: z.string().nullable().optional(),
  uiComponentName: z.string().nullable().optional(),
  routePath: z.string().nullable().optional(),
  timelineSummary: z.array(timelineEventDtoSchema),
  correlationSignals: z.array(correlationSignalDtoSchema),
  conflictingSignals: z.array(correlationSignalDtoSchema),
  localizationRationale: z.string(),
  evidenceReferences: z.array(z.string()),
  localizationFingerprint: z.string(),
  isAuthoritative: z.boolean(),
  isStale: z.boolean(),
  stalenessReason: z.string().nullable().optional(),
  relocalizationCount: z.number().int(),
  lastRelocalizedAt: z.string().nullable().optional(),
  relocalizationReason: z.string().nullable().optional(),
  localizedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FailureTechnicalLocalizationDto = z.infer<typeof failureTechnicalLocalizationDtoSchema>;

export const localizeTechnicalCauseInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type LocalizeTechnicalCauseInputDto = z.input<typeof localizeTechnicalCauseInputSchema>;

export const getTechnicalLocalizationInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetTechnicalLocalizationInputDto = z.input<typeof getTechnicalLocalizationInputSchema>;

export const relocalizeTechnicalCauseInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  relocalizationReason: z.string().min(1, 'Relocalization reason is required.'),
});
export type RelocalizeTechnicalCauseInputDto = z.input<typeof relocalizeTechnicalCauseInputSchema>;

export const listLocalizationHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListLocalizationHistoryInputDto = z.input<typeof listLocalizationHistoryInputSchema>;

// ------------------------------------------------------------------------------
// V6 Phase 82 — Failure AI-Assisted Classification & Reasoning Schemas & DTOs
// ------------------------------------------------------------------------------

export const classificationAgreementSchema = z.enum([
  'AGREES',
  'DISAGREES',
  'PARTIAL_AGREEMENT',
  'NOT_COMPARABLE',
]);
export type ClassificationAgreement = z.infer<typeof classificationAgreementSchema>;

export const aiConfidenceLevelSchema = z.enum(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']);
export type AiConfidenceLevel = z.infer<typeof aiConfidenceLevelSchema>;

export const aiSupportingEvidenceItemSchema = z.object({
  id: z.string(),
  fact: z.string(),
  sourceEvidenceKey: z.string().optional(),
  evidenceType: z.string().optional(),
  significance: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'SUPPORTING']).default('SUPPORTING'),
});
export type AiSupportingEvidenceItemDto = z.infer<typeof aiSupportingEvidenceItemSchema>;

export const aiContradictingEvidenceItemSchema = z.object({
  id: z.string(),
  fact: z.string(),
  sourceEvidenceKey: z.string().optional(),
  evidenceType: z.string().optional(),
  tensionDescription: z.string(),
});
export type AiContradictingEvidenceItemDto = z.infer<typeof aiContradictingEvidenceItemSchema>;

export const aiAlternativeHypothesisSchema = z.object({
  category: failureCategorySchema,
  subcategory: failureSubcategorySchema.nullable().optional(),
  rationale: z.string(),
  plausibility: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  disqualifyingFactor: z.string().optional(),
});
export type AiAlternativeHypothesisDto = z.infer<typeof aiAlternativeHypothesisSchema>;

export const failureAiAssessmentDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int(),
  failureAnalysisRunId: z.string().uuid().nullable().optional(),
  deterministicClassificationId: z.string().uuid().nullable().optional(),
  technicalLocalizationId: z.string().uuid().nullable().optional(),
  domainSeparationId: z.string().uuid().nullable().optional(),

  aiCategory: failureCategorySchema,
  aiSubcategory: failureSubcategorySchema.nullable().optional(),
  agreementState: classificationAgreementSchema,
  confidenceLevel: aiConfidenceLevelSchema,
  confidenceScore: z.number().min(0).max(1),
  confidenceBasis: z.array(z.string()),

  primaryReasoning: z.string(),
  humanExplanation: z.string(),
  supportingEvidence: z.array(aiSupportingEvidenceItemSchema),
  contradictingEvidence: z.array(aiContradictingEvidenceItemSchema),
  alternativeHypotheses: z.array(aiAlternativeHypothesisSchema),
  uncertainties: z.array(z.string()),

  modelProvider: z.string(),
  modelName: z.string(),
  promptVersion: z.string(),
  schemaVersion: z.string(),
  assessmentFingerprint: z.string(),

  isAuthoritative: z.boolean(),
  isStale: z.boolean(),
  stalenessReason: z.string().nullable().optional(),
  reanalysisCount: z.number().int(),
  lastReanalyzedAt: z.string().nullable().optional(),
  reanalysisReason: z.string().nullable().optional(),
  supersededById: z.string().uuid().nullable().optional(),

  assessedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FailureAiAssessmentDto = z.infer<typeof failureAiAssessmentDtoSchema>;

export const assessFailureWithAiInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  modelProviderOverride: z.string().optional(),
  modelNameOverride: z.string().optional(),
});
export type AssessFailureWithAiInputDto = z.input<typeof assessFailureWithAiInputSchema>;

export const getFailureAiAssessmentInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetFailureAiAssessmentInputDto = z.input<typeof getFailureAiAssessmentInputSchema>;

export const reassessFailureWithAiInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reanalysisReason: z.string().min(1, 'Reanalysis reason is required.'),
  modelProviderOverride: z.string().optional(),
  modelNameOverride: z.string().optional(),
});
export type ReassessFailureWithAiInputDto = z.input<typeof reassessFailureWithAiInputSchema>;

export const listFailureAiAssessmentHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListFailureAiAssessmentHistoryInputDto = z.input<
  typeof listFailureAiAssessmentHistoryInputSchema
>;

// ------------------------------------------------------------------------------
// V6 Phase 83 — Root-Cause Analysis & Probable Layer Identification Schemas & DTOs
// ------------------------------------------------------------------------------

export const rootCauseProbableLayerSchema = z.enum([
  'FRONTEND',
  'BACKEND',
  'API',
  'DATABASE',
  'AUTHENTICATION',
  'AUTHORIZATION',
  'VALIDATION',
  'BUSINESS_LOGIC',
  'NETWORK',
  'CONFIGURATION',
  'INFRASTRUCTURE',
  'TEST_AUTOMATION',
  'TEST_DATA',
  'ENVIRONMENT',
  'THIRD_PARTY_DEPENDENCY',
  'UNKNOWN',
  'MULTI_LAYER',
]);
export type RootCauseProbableLayer = z.infer<typeof rootCauseProbableLayerSchema>;

export const rootCauseStatusSchema = z.enum([
  'SUPPORTED_HYPOTHESIS',
  'MULTIPLE_PLAUSIBLE_CAUSES',
  'INSUFFICIENT_EVIDENCE',
  'NO_REPOSITORY_CONTEXT',
  'NOT_APPLICABLE',
  'INCONCLUSIVE',
]);
export type RootCauseStatus = z.infer<typeof rootCauseStatusSchema>;

export const rootCauseSupportingEvidenceItemSchema = z.object({
  id: z.string(),
  fact: z.string(),
  sourceEvidenceKey: z.string().optional(),
  evidenceType: z.string().optional(),
  significance: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'SUPPORTING']).default('SUPPORTING'),
});
export type RootCauseSupportingEvidenceItemDto = z.infer<
  typeof rootCauseSupportingEvidenceItemSchema
>;

export const rootCauseContradictingEvidenceItemSchema = z.object({
  id: z.string(),
  fact: z.string(),
  sourceEvidenceKey: z.string().optional(),
  evidenceType: z.string().optional(),
  tensionDescription: z.string(),
});
export type RootCauseContradictingEvidenceItemDto = z.infer<
  typeof rootCauseContradictingEvidenceItemSchema
>;

export const rootCauseAlternativeHypothesisSchema = z.object({
  layer: rootCauseProbableLayerSchema,
  probableCause: z.string(),
  rationale: z.string(),
  plausibility: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  disqualifyingFactor: z.string().optional(),
});
export type RootCauseAlternativeHypothesisDto = z.infer<
  typeof rootCauseAlternativeHypothesisSchema
>;

export const rootCauseRepositoryReferenceSchema = z.object({
  fileId: z.string().optional(),
  filePath: z.string(),
  symbolId: z.string().optional(),
  symbolName: z.string().optional(),
  symbolKind: z.string().optional(),
  startLine: z.number().int().optional(),
  endLine: z.number().int().optional(),
  relevance: z.string(),
});
export type RootCauseRepositoryReferenceDto = z.infer<typeof rootCauseRepositoryReferenceSchema>;

export const failureRootCauseAnalysisDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int(),
  failureAnalysisRunId: z.string().uuid().nullable().optional(),
  deterministicClassificationId: z.string().uuid().nullable().optional(),
  technicalLocalizationId: z.string().uuid().nullable().optional(),
  domainSeparationId: z.string().uuid().nullable().optional(),
  aiAssessmentId: z.string().uuid().nullable().optional(),

  rootCauseStatus: rootCauseStatusSchema,
  probableLayer: rootCauseProbableLayerSchema,
  probableComponent: z.string().nullable().optional(),
  relatedEndpoint: z.string().nullable().optional(),

  probableCause: z.string(),
  humanExplanation: z.string(),
  affectedExecutionPath: z.array(z.string()),
  supportingEvidence: z.array(rootCauseSupportingEvidenceItemSchema),
  contradictingEvidence: z.array(rootCauseContradictingEvidenceItemSchema),
  alternativeHypotheses: z.array(rootCauseAlternativeHypothesisSchema),
  repositoryReferences: z.array(rootCauseRepositoryReferenceSchema),
  repositoryContextAvailable: z.boolean(),
  limitations: z.array(z.string()),
  uncertainties: z.array(z.string()),

  modelProvider: z.string(),
  modelName: z.string(),
  promptVersion: z.string(),
  schemaVersion: z.string(),
  rootCauseFingerprint: z.string(),

  isAuthoritative: z.boolean(),
  isStale: z.boolean(),
  stalenessReason: z.string().nullable().optional(),
  reanalysisCount: z.number().int(),
  lastReanalyzedAt: z.string().nullable().optional(),
  reanalysisReason: z.string().nullable().optional(),
  supersededById: z.string().uuid().nullable().optional(),

  analyzedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FailureRootCauseAnalysisDto = z.infer<typeof failureRootCauseAnalysisDtoSchema>;

export const analyzeRootCauseInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  modelProviderOverride: z.string().optional(),
  modelNameOverride: z.string().optional(),
});
export type AnalyzeRootCauseInputDto = z.input<typeof analyzeRootCauseInputSchema>;

export const getRootCauseAnalysisInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetRootCauseAnalysisInputDto = z.input<typeof getRootCauseAnalysisInputSchema>;

export const reanalyzeRootCauseInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reanalysisReason: z.string().min(1, 'Reanalysis reason is required.'),
  modelProviderOverride: z.string().optional(),
  modelNameOverride: z.string().optional(),
});
export type ReanalyzeRootCauseInputDto = z.input<typeof reanalyzeRootCauseInputSchema>;

export const listRootCauseHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListRootCauseHistoryInputDto = z.input<typeof listRootCauseHistoryInputSchema>;

// -----------------------------------------------------------------------------
// V6 Phase 84: Severity, Priority & Impact Intelligence Schemas
// -----------------------------------------------------------------------------

export const defectSeveritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNKNOWN',
  'NOT_APPLICABLE',
]);
export type DefectSeverityDto = z.infer<typeof defectSeveritySchema>;

export const defectPrioritySchema = z.enum([
  'P0_IMMEDIATE',
  'P1_URGENT',
  'P2_NORMAL',
  'P3_LOW',
  'UNKNOWN',
]);
export type DefectPriorityDto = z.infer<typeof defectPrioritySchema>;

export const releaseRecommendationSchema = z.enum([
  'BLOCK_RELEASE',
  'REVIEW_REQUIRED',
  'NON_BLOCKING',
  'UNKNOWN',
]);
export type ReleaseRecommendationDto = z.infer<typeof releaseRecommendationSchema>;

export const dataImpactSchema = z.enum([
  'NO_DATA_IMPACT',
  'DISPLAY_ONLY',
  'INCORRECT_READ',
  'FAILED_WRITE',
  'INCORRECT_WRITE',
  'DUPLICATE_WRITE',
  'PARTIAL_WRITE',
  'DATA_INCONSISTENCY',
  'DATA_CORRUPTION',
  'DATA_LOSS',
  'UNKNOWN',
]);
export type DataImpactDto = z.infer<typeof dataImpactSchema>;

export const securityImpactSchema = z.enum([
  'NONE_PROVEN',
  'AUTHENTICATION_BYPASS',
  'AUTHORIZATION_BYPASS',
  'SESSION_EXPOSURE',
  'CREDENTIAL_LEAK',
  'PRIVILEGE_ESCALATION',
  'DATA_EXPOSURE',
  'SUSPECTED',
  'UNKNOWN',
]);
export type SecurityImpactDto = z.infer<typeof securityImpactSchema>;

export const userImpactScopeSchema = z.enum([
  'ALL_USERS',
  'MULTIPLE_USERS',
  'SPECIFIC_ROLE',
  'SINGLE_USER',
  'UNKNOWN',
]);
export type UserImpactScopeDto = z.infer<typeof userImpactScopeSchema>;

export const availabilityImpactSchema = z.enum([
  'FULL_OUTAGE',
  'DEGRADED',
  'SERVICE_UNAVAILABLE',
  'MODULE_UNAVAILABLE',
  'PAGE_UNAVAILABLE',
  'ACTION_UNAVAILABLE',
  'NONE_AFFECTED',
  'UNKNOWN',
]);
export type AvailabilityImpactDto = z.infer<typeof availabilityImpactSchema>;

export const blastRadiusSchema = z.enum([
  'PROJECT_WIDE',
  'MULTIPLE_MODULES',
  'SINGLE_MODULE',
  'SINGLE_FEATURE',
  'SINGLE_REQUIREMENT',
  'SINGLE_TEST',
  'UNKNOWN',
]);
export type BlastRadiusDto = z.infer<typeof blastRadiusSchema>;

export const workaroundStatusSchema = z.enum([
  'WORKAROUND_AVAILABLE',
  'WORKAROUND_PARTIAL',
  'NO_WORKAROUND',
  'UNKNOWN',
]);
export type WorkaroundStatusDto = z.infer<typeof workaroundStatusSchema>;

export const impactSupportingEvidenceItemSchema = z.object({
  id: z.string(),
  sourceType: z.string(),
  sourceId: z.string().optional(),
  fact: z.string(),
  significance: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'CONTEXTUAL']),
});
export type ImpactSupportingEvidenceItemDto = z.infer<typeof impactSupportingEvidenceItemSchema>;

export const failureImpactAssessmentDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseVersionNumber: z.number().int(),
  failureAnalysisRunId: z.string().uuid().nullable().optional(),
  deterministicClassificationId: z.string().uuid().nullable().optional(),
  technicalLocalizationId: z.string().uuid().nullable().optional(),
  domainSeparationId: z.string().uuid().nullable().optional(),
  aiAssessmentId: z.string().uuid().nullable().optional(),
  rootCauseAnalysisId: z.string().uuid().nullable().optional(),

  severity: defectSeveritySchema,
  severityRuleId: z.string(),
  severityRationale: z.string(),
  severityReasons: z.array(z.string()),

  priority: defectPrioritySchema,
  priorityRuleId: z.string(),
  priorityRationale: z.string(),
  priorityReasons: z.array(z.string()),

  releaseRecommendation: releaseRecommendationSchema,
  releaseRecommendationRationale: z.string(),

  userImpact: userImpactScopeSchema,
  userImpactDetails: z.string().nullable().optional(),
  functionalImpact: z.string(),
  businessImpact: z.string(),
  businessCriticality: z.string(),
  dataImpact: dataImpactSchema,
  dataImpactDetails: z.string().nullable().optional(),
  securityImpact: securityImpactSchema,
  securityImpactDetails: z.string().nullable().optional(),
  availabilityImpact: availabilityImpactSchema,
  integrationImpact: z.string(),
  blastRadius: blastRadiusSchema,
  workaroundStatus: workaroundStatusSchema,
  workaroundDetails: z.string().nullable().optional(),

  supportingEvidence: z.array(impactSupportingEvidenceItemSchema),
  conflictingSignals: z.array(z.string()),
  unknownFactors: z.array(z.string()),

  severityModelVersion: z.string(),
  priorityModelVersion: z.string(),
  impactModelVersion: z.string(),
  assessmentFingerprint: z.string(),

  isAuthoritative: z.boolean(),
  isStale: z.boolean(),
  stalenessReason: z.string().nullable().optional(),
  reassessmentCount: z.number().int(),
  lastReassessedAt: z.string().nullable().optional(),
  reassessmentReason: z.string().nullable().optional(),
  supersededById: z.string().uuid().nullable().optional(),

  assessedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FailureImpactAssessmentDto = z.infer<typeof failureImpactAssessmentDtoSchema>;

export const assessImpactInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  environmentOverride: z.string().optional(),
  releaseBlockingOverride: z.boolean().optional(),
});
export type AssessImpactInputDto = z.input<typeof assessImpactInputSchema>;

export const getImpactAssessmentInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetImpactAssessmentInputDto = z.input<typeof getImpactAssessmentInputSchema>;

export const reassessImpactInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reassessmentReason: z.string().min(1, 'Reassessment reason is required.'),
  environmentOverride: z.string().optional(),
  releaseBlockingOverride: z.boolean().optional(),
});
export type ReassessImpactInputDto = z.input<typeof reassessImpactInputSchema>;

export const listImpactHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListImpactHistoryInputDto = z.input<typeof listImpactHistoryInputSchema>;

// -----------------------------------------------------------------------------
// V6 Phase 85 — Duplicate Failure Detection & Defect Clustering Schemas
// -----------------------------------------------------------------------------

export const defectClusterStatusSchema = z.enum([
  'ACTIVE',
  'RESOLVED',
  'RECURRED',
  'MERGED',
  'SPLIT',
  'ARCHIVED',
]);
export type DefectClusterStatusDto = z.infer<typeof defectClusterStatusSchema>;

export const duplicateRelationshipTypeSchema = z.enum([
  'EXACT_DUPLICATE',
  'PROBABLE_DUPLICATE',
  'RELATED_FAILURE',
  'DISTINCT_FAILURE',
  'INCONCLUSIVE',
  'INSUFFICIENT_EVIDENCE',
]);
export type DuplicateRelationshipTypeDto = z.infer<typeof duplicateRelationshipTypeSchema>;

export const clusterRelationshipStrengthSchema = z.enum([
  'EXACT',
  'STRONG',
  'MODERATE',
  'WEAK',
  'UNKNOWN',
]);
export type ClusterRelationshipStrengthDto = z.infer<typeof clusterRelationshipStrengthSchema>;

export const clusterEventTypeSchema = z.enum([
  'CREATED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'REPRESENTATIVE_CHANGED',
  'MERGED',
  'SPLIT',
  'STATUS_CHANGED',
  'MANUAL_OVERRIDE',
  'REANALYZED',
]);
export type ClusterEventTypeDto = z.infer<typeof clusterEventTypeSchema>;

export const matchedSignalItemSchema = z.object({
  signal: z.string(),
  description: z.string(),
  weight: z.number().optional(),
});
export type MatchedSignalItemDto = z.infer<typeof matchedSignalItemSchema>;

export const contradictorySignalItemSchema = z.object({
  signal: z.string(),
  description: z.string(),
  severity: z.string().optional(),
});
export type ContradictorySignalItemDto = z.infer<typeof contradictorySignalItemSchema>;

export const duplicateComparisonResultDtoSchema = z.object({
  failureCaseIdA: z.string().uuid(),
  failureCaseIdB: z.string().uuid(),
  relationshipType: duplicateRelationshipTypeSchema,
  relationshipStrength: clusterRelationshipStrengthSchema,
  similarityScore: z.number().min(0).max(1),
  matchedSignals: z.array(matchedSignalItemSchema),
  contradictorySignals: z.array(contradictorySignalItemSchema),
  explanation: z.string(),
  evaluatedAt: z.string(),
});
export type DuplicateComparisonResultDto = z.infer<typeof duplicateComparisonResultDtoSchema>;

export const defectClusterMembershipDtoSchema = z.object({
  id: z.string().uuid(),
  clusterId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  projectId: z.string().uuid(),
  relationshipType: duplicateRelationshipTypeSchema,
  relationshipStrength: clusterRelationshipStrengthSchema,
  similarityScore: z.number().min(0).max(1),
  matchedSignals: z.array(matchedSignalItemSchema),
  contradictorySignals: z.array(contradictorySignalItemSchema),
  explanation: z.string(),
  isRepresentative: z.boolean(),
  isManualOverride: z.boolean(),
  manualOverrideReason: z.string().nullable().optional(),
  isActive: z.boolean(),
  addedAt: z.string(),
  removedAt: z.string().nullable().optional(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  failureCase: z
    .object({
      id: z.string().uuid(),
      title: z.string(),
      failureSummary: z.string().nullable().optional(),
      errorCode: z.string().nullable().optional(),
      errorMessage: z.string().nullable().optional(),
      failureSignature: z.string().nullable().optional(),
      evidenceCompleteness: z.string().nullable().optional(),
      createdAt: z.string(),
    })
    .optional(),
});
export type DefectClusterMembershipDto = z.infer<typeof defectClusterMembershipDtoSchema>;

export const defectClusterDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  clusterKey: z.string(),
  title: z.string(),
  clusterStatus: defectClusterStatusSchema,
  representativeFailureId: z.string().uuid(),
  memberCount: z.number().int(),
  relationshipStrength: clusterRelationshipStrengthSchema,
  classificationSummary: z.string().nullable().optional(),
  probableLayer: z.string().nullable().optional(),
  rootCauseSummary: z.string().nullable().optional(),
  severitySummary: defectSeveritySchema.nullable().optional(),
  prioritySummary: defectPrioritySchema.nullable().optional(),
  affectedRequirements: z.array(z.string()),
  affectedRoutes: z.array(z.string()),
  affectedBuilds: z.array(z.string()),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  clusterFingerprint: z.string(),
  version: z.number().int(),
  mergedIntoClusterId: z.string().uuid().nullable().optional(),
  splitFromClusterId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  memberships: z.array(defectClusterMembershipDtoSchema).optional(),
});
export type DefectClusterDto = z.infer<typeof defectClusterDtoSchema>;

export const defectClusterHistoryDtoSchema = z.object({
  id: z.string().uuid(),
  clusterId: z.string().uuid(),
  projectId: z.string().uuid(),
  eventType: clusterEventTypeSchema,
  failureCaseId: z.string().uuid().nullable().optional(),
  previousState: z.record(z.unknown()).nullable().optional(),
  newState: z.record(z.unknown()).nullable().optional(),
  reason: z.string(),
  actor: z.string(),
  createdAt: z.string(),
});
export type DefectClusterHistoryDto = z.infer<typeof defectClusterHistoryDtoSchema>;

export const compareDuplicatesInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseIdA: z.string().uuid(),
  failureCaseIdB: z.string().uuid(),
});
export type CompareDuplicatesInputDto = z.input<typeof compareDuplicatesInputSchema>;

export const clusterDefectsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseIds: z.array(z.string().uuid()).optional(),
});
export type ClusterDefectsInputDto = z.input<typeof clusterDefectsInputSchema>;

export const getClusterInputSchema = z.object({
  projectId: z.string().uuid(),
  clusterId: z.string().uuid(),
});
export type GetClusterInputDto = z.input<typeof getClusterInputSchema>;

export const listClustersInputSchema = z.object({
  projectId: z.string().uuid(),
  status: defectClusterStatusSchema.optional(),
});
export type ListClustersInputDto = z.input<typeof listClustersInputSchema>;

export const getFailureMembershipInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetFailureMembershipInputDto = z.input<typeof getFailureMembershipInputSchema>;

export const mergeClustersInputSchema = z.object({
  projectId: z.string().uuid(),
  sourceClusterId: z.string().uuid(),
  targetClusterId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required for merging clusters.'),
});
export type MergeClustersInputDto = z.input<typeof mergeClustersInputSchema>;

export const splitClusterInputSchema = z.object({
  projectId: z.string().uuid(),
  clusterId: z.string().uuid(),
  failureCaseIdsToExtract: z
    .array(z.string().uuid())
    .min(1, 'At least one failure case must be extracted.'),
  reason: z.string().min(1, 'Reason is required for splitting cluster.'),
});
export type SplitClusterInputDto = z.input<typeof splitClusterInputSchema>;

export const overrideMembershipInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  targetClusterId: z.string().uuid().nullable().optional(),
  action: z.enum(['MOVE', 'DETACH']),
  reason: z.string().min(1, 'Reason is required for manual membership override.'),
});
export type OverrideMembershipInputDto = z.input<typeof overrideMembershipInputSchema>;

export const listClusterHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  clusterId: z.string().uuid(),
});
export type ListClusterHistoryInputDto = z.input<typeof listClusterHistoryInputSchema>;

// ------------------------------------------------------------------------------
// Confidence Scoring, Explainability & Evidence Attribution (V6 Phase 86)
// ------------------------------------------------------------------------------

export const confidenceBandSchema = z.enum(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']);
export type ConfidenceBandDto = z.infer<typeof confidenceBandSchema>;
export type ConfidenceBand = ConfidenceBandDto;

export const conclusionTypeSchema = z.enum([
  'CLASSIFICATION',
  'REPRODUCIBILITY',
  'ROOT_CAUSE',
  'SEVERITY',
  'DUPLICATE_CLUSTER',
  'OVERALL',
]);
export type ConclusionTypeDto = z.infer<typeof conclusionTypeSchema>;
export type ConclusionType = ConclusionTypeDto;

export const attributionRelationshipSchema = z.enum([
  'SUPPORTS',
  'CONTRADICTS',
  'NEUTRAL',
  'REQUIRED',
  'MISSING',
]);
export type AttributionRelationshipDto = z.infer<typeof attributionRelationshipSchema>;
export type AttributionRelationship = AttributionRelationshipDto;

export const attributionSupportStrengthSchema = z.enum([
  'DECISIVE',
  'STRONG',
  'SUPPORTING',
  'WEAK',
  'NONE',
]);
export type AttributionSupportStrengthDto = z.infer<typeof attributionSupportStrengthSchema>;
export type AttributionSupportStrength = AttributionSupportStrengthDto;

export const sourceSubsystemSchema = z.enum([
  'V5_EXECUTION',
  'PHASE_75_EVIDENCE',
  'PHASE_76_REPRODUCTION',
  'PHASE_77_CLASSIFICATION',
  'PHASE_78_DECISION_INTEGRITY',
  'PHASE_79_FLAKINESS',
  'PHASE_80_DOMAIN_SEPARATION',
  'PHASE_81_CAUSE_LOCALIZATION',
  'PHASE_82_AI_CLASSIFICATION',
  'PHASE_83_ROOT_CAUSE',
  'PHASE_84_SEVERITY',
  'PHASE_85_DUPLICATE_CLUSTER',
]);
export type SourceSubsystemDto = z.infer<typeof sourceSubsystemSchema>;
export type SourceSubsystem = SourceSubsystemDto;

export const epistemicTypeSchema = z.enum([
  'FACT',
  'DETERMINISTIC_INFERENCE',
  'AI_INFERENCE',
  'UNKNOWN',
  'CONTRADICTORY',
]);
export type EpistemicTypeDto = z.infer<typeof epistemicTypeSchema>;
export type EpistemicType = EpistemicTypeDto;

export const evidenceAttributionDtoSchema = z.object({
  id: z.string().uuid(),
  confidenceAssessmentId: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  conclusionType: conclusionTypeSchema,
  conclusionValue: z.string(),
  evidenceReferenceId: z.string().uuid().nullable().optional(),
  evidenceType: z.string(),
  relationship: attributionRelationshipSchema,
  supportStrength: attributionSupportStrengthSchema,
  sourceSubsystem: sourceSubsystemSchema,
  reason: z.string(),
  epistemicType: epistemicTypeSchema,
  canonicalEvidenceKey: z.string(),
  createdAt: z.string().or(z.date()),
});
export type EvidenceAttributionDto = z.infer<typeof evidenceAttributionDtoSchema>;

export const confidenceComponentScoreDtoSchema = z.object({
  component: z.string(),
  score: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  applicable: z.boolean(),
  description: z.string(),
  supportingCount: z.number().int().min(0),
  contradictingCount: z.number().int().min(0),
  missingCount: z.number().int().min(0),
});
export type ConfidenceComponentScoreDto = z.infer<typeof confidenceComponentScoreDtoSchema>;

export const confidenceAssessmentDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  failureAnalysisRunId: z.string().uuid().nullable().optional(),
  revision: z.number().int().min(1),
  isAuthoritative: z.boolean(),
  supersededById: z.string().uuid().nullable().optional(),
  supersedesId: z.string().uuid().nullable().optional(),
  overallConfidence: z.number().min(0).max(1),
  confidenceBand: confidenceBandSchema,
  classificationConfidence: z.number().min(0).max(1).nullable().optional(),
  reproducibilityConfidence: z.number().min(0).max(1).nullable().optional(),
  rootCauseConfidence: z.number().min(0).max(1).nullable().optional(),
  severityConfidence: z.number().min(0).max(1).nullable().optional(),
  duplicateConfidence: z.number().min(0).max(1).nullable().optional(),
  componentBreakdown: z.array(confidenceComponentScoreDtoSchema),
  supportingFactors: z.array(z.string()),
  penalties: z.array(z.string()),
  missingFactors: z.array(z.string()),
  contradictions: z.array(z.string()),
  deterministicFacts: z.array(z.string()),
  aiInferences: z.array(z.string()),
  humanExplanation: z.string(),
  confidenceFingerprint: z.string(),
  confidenceEngineVersion: z.string(),
  scoringPolicyVersion: z.string(),
  explanationVersion: z.string(),
  isStale: z.boolean(),
  stalenessReason: z.string().nullable().optional(),
  recalculationReason: z.string().nullable().optional(),
  assessedAt: z.string().or(z.date()),
  createdAt: z.string().or(z.date()),
  attributions: z.array(evidenceAttributionDtoSchema).optional(),
});
export type ConfidenceAssessmentDto = z.infer<typeof confidenceAssessmentDtoSchema>;

export const assessConfidenceInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  forceReassess: z.boolean().optional(),
});
export type AssessConfidenceInputDto = z.input<typeof assessConfidenceInputSchema>;

export const getConfidenceInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetConfidenceInputDto = z.input<typeof getConfidenceInputSchema>;

export const reassessConfidenceInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required for re-assessing confidence.'),
});
export type ReassessConfidenceInputDto = z.input<typeof reassessConfidenceInputSchema>;

export const listConfidenceHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListConfidenceHistoryInputDto = z.input<typeof listConfidenceHistoryInputSchema>;

export const listEvidenceAttributionsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  confidenceAssessmentId: z.string().uuid().optional(),
  conclusionType: conclusionTypeSchema.optional(),
});
export type ListEvidenceAttributionsInputDto = z.input<typeof listEvidenceAttributionsInputSchema>;

// ==============================================================================
// V6 Phase 87: Structured Bug Report Generation & Failure Intelligence Workspace
// ==============================================================================

export const bugReportStatusSchema = z.enum(['DRAFT', 'READY', 'SUPERSEDED']);
export type BugReportStatusDto = z.infer<typeof bugReportStatusSchema>;

export const applicationDefectStateSchema = z.enum([
  'CONFIRMED_APPLICATION_DEFECT',
  'SUPPORTED_APPLICATION_DEFECT',
  'AUTOMATION_FAILURE',
  'TEST_DATA_FAILURE',
  'ENVIRONMENT_FAILURE',
  'FLAKY_UNSTABLE_FAILURE',
  'INCONCLUSIVE',
  'UNKNOWN',
  'BLOCKED',
]);
export type ApplicationDefectStateDto = z.infer<typeof applicationDefectStateSchema>;

export const derivedReproductionStepSchema = z.object({
  stepIndex: z.number().int(),
  actionType: z.string(),
  description: z.string(),
  targetSummary: z.string().nullable().optional(),
  actionDataJson: z.string().nullable().optional(),
  expectedSummary: z.string().nullable().optional(),
  actualSummary: z.string().nullable().optional(),
  status: z.string(),
  isFailureStep: z.boolean(),
  errorMessage: z.string().nullable().optional(),
});
export type DerivedReproductionStepDto = z.infer<typeof derivedReproductionStepSchema>;

export const reportEvidenceReferenceSchema = z.object({
  id: z.string().uuid(),
  evidenceType: z.string(),
  filePath: z.string(),
  sha256: z.string(),
  byteSize: z.number(),
  mimeType: z.string(),
  integrityStatus: z.string(),
  description: z.string().optional(),
});
export type ReportEvidenceReferenceDto = z.infer<typeof reportEvidenceReferenceSchema>;

export const structuredBugReportDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analysisRunId: z.string().uuid().nullable().optional(),
  reportNumber: z.string(),
  revision: z.number().int(),
  status: bugReportStatusSchema,
  defectState: applicationDefectStateSchema,
  isApplicationDefect: z.boolean(),
  title: z.string(),
  summary: z.string(),
  environmentSummary: z.record(z.unknown()),
  requirementId: z.string().nullable().optional(),
  requirementKey: z.string().nullable().optional(),
  requirementVersion: z.number().int().nullable().optional(),
  testCaseId: z.string().nullable().optional(),
  testCaseKey: z.string().nullable().optional(),
  testCaseVersion: z.number().int().nullable().optional(),
  executionPlanId: z.string().nullable().optional(),
  preconditions: z.array(z.string()),
  reproductionSteps: z.array(derivedReproductionStepSchema),
  expectedBehavior: z.string(),
  actualBehavior: z.string(),
  failedStepIndex: z.number().int().nullable().optional(),
  rootCauseHypothesis: z.string().nullable().optional(),
  probableLayer: z.string().nullable().optional(),
  probableComponent: z.string().nullable().optional(),
  severity: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  clusterKey: z.string().nullable().optional(),
  clusterMemberCount: z.number().int().nullable().optional(),
  calibratedScore: z.number().nullable().optional(),
  evidenceReferences: z.array(reportEvidenceReferenceSchema),
  limitationsAndUnknowns: z.array(z.string()),
  reportMarkdown: z.string(),
  reportFingerprint: z.string(),
  generatorVersion: z.string(),
  regenerationReason: z.string().nullable().optional(),
  supersededById: z.string().nullable().optional(),
  supersedesId: z.string().nullable().optional(),
  isStale: z.boolean(),
  stalenessReason: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type StructuredBugReportDto = z.infer<typeof structuredBugReportDtoSchema>;

export const createBugReportInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  analysisRunId: z.string().uuid().optional(),
  titleOverride: z.string().max(256).optional(),
});
export type CreateBugReportInputDto = z.input<typeof createBugReportInputSchema>;

export const getBugReportInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  revision: z.number().int().optional(),
});
export type GetBugReportInputDto = z.input<typeof getBugReportInputSchema>;

export const listBugReportsInputSchema = z.object({
  projectId: z.string().uuid(),
  defectState: applicationDefectStateSchema.optional(),
  isApplicationDefect: z.boolean().optional(),
  status: bugReportStatusSchema.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});
export type ListBugReportsInputDto = z.input<typeof listBugReportsInputSchema>;

export const regenerateBugReportInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required for regenerating a bug report.'),
  titleOverride: z.string().max(256).optional(),
});
export type RegenerateBugReportInputDto = z.input<typeof regenerateBugReportInputSchema>;

export const listBugReportHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListBugReportHistoryInputDto = z.input<typeof listBugReportHistoryInputSchema>;

// ------------------------------------------------------------------------------
// Jira Integration Foundation (V7 Phase 89)
// ------------------------------------------------------------------------------

export const jiraDeploymentTypeSchema = z.enum(['JIRA_CLOUD', 'JIRA_DATA_CENTER', 'JIRA_SERVER']);
export type JiraDeploymentType = z.infer<typeof jiraDeploymentTypeSchema>;

export const jiraAuthenticationTypeSchema = z.enum([
  'API_TOKEN',
  'BASIC_AUTH',
  'PERSONAL_ACCESS_TOKEN',
  'OAUTH2',
]);
export type JiraAuthenticationType = z.infer<typeof jiraAuthenticationTypeSchema>;

export const jiraConnectionStatusSchema = z.enum([
  'UNVALIDATED',
  'CONNECTED',
  'AUTHENTICATION_FAILED',
  'UNREACHABLE',
  'PERMISSION_DENIED',
  'INVALID_CONFIGURATION',
  'RATE_LIMITED',
  'TIMEOUT',
  'UNKNOWN_ERROR',
  'DISCONNECTED',
]);
export type JiraConnectionStatus = z.infer<typeof jiraConnectionStatusSchema>;

export const jiraAuditEventTypeSchema = z.enum([
  'CONNECTION_CREATED',
  'CONNECTION_UPDATED',
  'CREDENTIALS_REPLACED',
  'VALIDATION_ATTEMPTED',
  'VALIDATION_SUCCEEDED',
  'VALIDATION_FAILED',
  'CONNECTION_DELETED',
  'PROJECT_SELECTED',
  'CONFIGURATION_SAVED',
  'METADATA_REFRESHED',
  'CONFIGURATION_STALE',
  'HEALTH_CHECKED',
  'ISSUE_CREATION_ATTEMPTED',
  'ISSUE_CREATED',
  'ISSUE_CREATION_FAILED',
  'EVIDENCE_ATTACHMENT_ATTEMPTED',
  'EVIDENCE_ATTACHED',
  'EVIDENCE_ATTACHMENT_FAILED',
  'DUPLICATE_CHECK_STARTED',
  'DUPLICATE_MATCH_FOUND',
  'EXISTING_ISSUE_LINKED',
  'NEW_ISSUE_ALLOWED',
  'LINK_INVALIDATED',
  'EXTERNAL_ISSUE_MISSING',
  'DEDUPLICATION_CONFLICT',
  'DEFECT_ASSIGNED',
  'DEFECT_REASSIGNED',
  'DEFECT_UNASSIGNED',
  'JIRA_ASSIGNEE_SYNCED',
  'JIRA_ASSIGNEE_SYNC_FAILED',
  'OWNERSHIP_CONFLICT_DETECTED',
]);
export type JiraAuditEventType = z.infer<typeof jiraAuditEventTypeSchema>;

export const jiraValidationResultDtoSchema = z.object({
  status: jiraConnectionStatusSchema,
  validatedAt: z.string(),
  durationMs: z.number(),
  accountIdentity: z
    .object({
      accountId: z.string().optional(),
      displayName: z.string().optional(),
      emailAddress: z.string().optional(),
      active: z.boolean().optional(),
    })
    .optional(),
  serverInfo: z
    .object({
      baseUrl: z.string().optional(),
      version: z.string().optional(),
      deploymentType: z.string().optional(),
      serverTitle: z.string().optional(),
    })
    .optional(),
  accessibleProjectCount: z.number().int().optional(),
  rateLimitInfo: z
    .object({
      retryAfterSeconds: z.number().optional(),
    })
    .optional(),
  errorMessage: z.string().optional(),
  errorCode: z.string().optional(),
});
export type JiraValidationResultDto = z.infer<typeof jiraValidationResultDtoSchema>;

export const jiraConnectionDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  displayName: z.string(),
  deploymentType: jiraDeploymentTypeSchema,
  baseUrl: z.string(),
  authenticationType: jiraAuthenticationTypeSchema,
  accountIdentifier: z.string(),
  credentialConfigured: z.boolean(),
  connectionStatus: jiraConnectionStatusSchema,
  lastValidatedAt: z.string().nullable(),
  lastValidationResult: jiraValidationResultDtoSchema.nullable().optional(),
  createdBy: z.string(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type JiraConnectionDto = z.infer<typeof jiraConnectionDtoSchema>;

export const jiraConnectionAuditDtoSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  projectId: z.string().uuid(),
  eventType: jiraAuditEventTypeSchema,
  previousStatus: jiraConnectionStatusSchema.nullable().optional(),
  newStatus: jiraConnectionStatusSchema.nullable().optional(),
  details: z.record(z.unknown()).nullable().optional(),
  actor: z.string(),
  createdAt: z.string().or(z.date()),
});
export type JiraConnectionAuditDto = z.infer<typeof jiraConnectionAuditDtoSchema>;

export const createJiraConnectionInputSchema = z.object({
  projectId: z.string().uuid(),
  displayName: z.string().min(1).max(128),
  deploymentType: jiraDeploymentTypeSchema.default('JIRA_CLOUD'),
  baseUrl: z.string().min(1).max(512),
  authenticationType: jiraAuthenticationTypeSchema.default('API_TOKEN'),
  accountIdentifier: z.string().min(1).max(255),
  apiToken: z.string().min(1).max(4096),
  validateImmediately: z.boolean().optional().default(false),
});
export type CreateJiraConnectionInputDto = z.input<typeof createJiraConnectionInputSchema>;

export const updateJiraConnectionInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid(),
  displayName: z.string().min(1).max(128).optional(),
  baseUrl: z.string().min(1).max(512).optional(),
  accountIdentifier: z.string().min(1).max(255).optional(),
  apiToken: z.string().min(1).max(4096).optional(),
  authenticationType: jiraAuthenticationTypeSchema.optional(),
  validateImmediately: z.boolean().optional().default(false),
});
export type UpdateJiraConnectionInputDto = z.input<typeof updateJiraConnectionInputSchema>;

export const getJiraConnectionInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
});
export type GetJiraConnectionInputDto = z.input<typeof getJiraConnectionInputSchema>;

export const deleteJiraConnectionInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid(),
});
export type DeleteJiraConnectionInputDto = z.input<typeof deleteJiraConnectionInputSchema>;

export const validateJiraConnectionInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
});
export type ValidateJiraConnectionInputDto = z.input<typeof validateJiraConnectionInputSchema>;

export const listJiraAuditLogInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type ListJiraAuditLogInputDto = z.input<typeof listJiraAuditLogInputSchema>;

// Phase 90: Jira Configuration & Discovery Schemas
export const jiraProjectConfigStatusSchema = z.enum([
  'CONFIGURED',
  'STALE',
  'NEEDS_REVIEW',
  'INVALID',
]);
export type JiraProjectConfigStatus = z.infer<typeof jiraProjectConfigStatusSchema>;

export const jiraAssigneeStrategySchema = z.enum(['UNASSIGNED', 'SPECIFIC_USER', 'AUTOMATIC']);
export type JiraAssigneeStrategy = z.infer<typeof jiraAssigneeStrategySchema>;

export const jiraDiscoveredSiteDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  scopes: z.array(z.string()).optional(),
  avatarUrl: z.string().optional(),
});
export type JiraDiscoveredSiteDto = z.infer<typeof jiraDiscoveredSiteDtoSchema>;

export const jiraDiscoveredProjectDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  projectTypeKey: z.string().optional(),
  simplified: z.boolean().optional(),
  avatarUrls: z.record(z.string()).optional(),
  lead: z
    .object({
      accountId: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
});
export type JiraDiscoveredProjectDto = z.infer<typeof jiraDiscoveredProjectDtoSchema>;

export const jiraDiscoveredIssueTypeDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  subtask: z.boolean(),
  hierarchyLevel: z.number().int().optional(),
  iconUrl: z.string().optional(),
});
export type JiraDiscoveredIssueTypeDto = z.infer<typeof jiraDiscoveredIssueTypeDtoSchema>;

export const jiraDiscoveredPriorityDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  statusColor: z.string().optional(),
  iconUrl: z.string().optional(),
  isDefault: z.boolean().optional(),
});
export type JiraDiscoveredPriorityDto = z.infer<typeof jiraDiscoveredPriorityDtoSchema>;

export const jiraDiscoveredFieldDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  custom: z.boolean(),
  orderable: z.boolean().optional(),
  navigable: z.boolean().optional(),
  searchable: z.boolean().optional(),
  required: z.boolean().optional(),
  schema: z
    .object({
      type: z.string().optional(),
      system: z.string().optional(),
      custom: z.string().optional(),
      customId: z.number().optional(),
      items: z.string().optional(),
    })
    .optional(),
  allowedValues: z.array(z.record(z.unknown())).optional(),
});
export type JiraDiscoveredFieldDto = z.infer<typeof jiraDiscoveredFieldDtoSchema>;

export const jiraDiscoveredComponentDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  lead: z
    .object({
      accountId: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
  assigneeType: z.string().optional(),
});
export type JiraDiscoveredComponentDto = z.infer<typeof jiraDiscoveredComponentDtoSchema>;

export const jiraDiscoveredAssigneeDtoSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
  emailAddress: z.string().optional(),
  active: z.boolean().optional(),
  avatarUrls: z.record(z.string()).optional(),
});
export type JiraDiscoveredAssigneeDto = z.infer<typeof jiraDiscoveredAssigneeDtoSchema>;

export const jiraHealthCheckResultDtoSchema = z.object({
  status: jiraConnectionStatusSchema,
  healthy: z.boolean(),
  checkedAt: z.string(),
  durationMs: z.number(),
  checks: z.object({
    authentication: z.object({
      passed: z.boolean(),
      message: z.string(),
      details: z.record(z.unknown()).optional(),
    }),
    reachability: z.object({
      passed: z.boolean(),
      message: z.string(),
      responseTimeMs: z.number().optional(),
    }),
    projectAccess: z.object({
      passed: z.boolean(),
      message: z.string(),
      accessibleCount: z.number().int().optional(),
    }),
    issueMetadataAccess: z.object({
      passed: z.boolean(),
      message: z.string(),
      details: z.record(z.unknown()).optional(),
    }),
  }),
  accountIdentity: z
    .object({
      accountId: z.string().optional(),
      displayName: z.string().optional(),
      emailAddress: z.string().optional(),
      active: z.boolean().optional(),
    })
    .optional(),
  serverInfo: z
    .object({
      baseUrl: z.string().optional(),
      version: z.string().optional(),
      deploymentType: z.string().optional(),
      serverTitle: z.string().optional(),
    })
    .optional(),
  errorMessage: z.string().optional(),
  errorCode: z.string().optional(),
});
export type JiraHealthCheckResultDto = z.infer<typeof jiraHealthCheckResultDtoSchema>;

export const jiraProjectConfigDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  connectionId: z.string().uuid(),
  jiraProjectId: z.string(),
  jiraProjectKey: z.string(),
  jiraProjectName: z.string(),
  selectedIssueTypeId: z.string(),
  selectedIssueTypeName: z.string(),
  defaultPriorityId: z.string().nullable().optional(),
  defaultPriorityName: z.string().nullable().optional(),
  defaultComponentId: z.string().nullable().optional(),
  defaultComponentName: z.string().nullable().optional(),
  assigneeStrategy: jiraAssigneeStrategySchema,
  defaultAssigneeId: z.string().nullable().optional(),
  defaultAssigneeName: z.string().nullable().optional(),
  fieldMappings: z.record(z.unknown()).nullable().optional(),
  configStatus: jiraProjectConfigStatusSchema,
  staleReason: z.string().nullable().optional(),
  metadataSnapshot: z.record(z.unknown()).nullable().optional(),
  lastRefreshedAt: z.string().nullable().optional(),
  createdBy: z.string(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type JiraProjectConfigDto = z.infer<typeof jiraProjectConfigDtoSchema>;

export const discoverJiraSitesInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
});
export type DiscoverJiraSitesInputDto = z.input<typeof discoverJiraSitesInputSchema>;

export const discoverJiraProjectsInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
});
export type DiscoverJiraProjectsInputDto = z.input<typeof discoverJiraProjectsInputSchema>;

export const discoverJiraIssueTypesInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  jiraProjectIdOrKey: z.string().min(1),
});
export type DiscoverJiraIssueTypesInputDto = z.input<typeof discoverJiraIssueTypesInputSchema>;

export const discoverJiraPrioritiesInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
});
export type DiscoverJiraPrioritiesInputDto = z.input<typeof discoverJiraPrioritiesInputSchema>;

export const discoverJiraFieldsInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  jiraProjectIdOrKey: z.string().min(1).optional(),
  issueTypeId: z.string().min(1).optional(),
});
export type DiscoverJiraFieldsInputDto = z.input<typeof discoverJiraFieldsInputSchema>;

export const discoverJiraComponentsInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  jiraProjectIdOrKey: z.string().min(1),
});
export type DiscoverJiraComponentsInputDto = z.input<typeof discoverJiraComponentsInputSchema>;

export const discoverJiraAssigneesInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  jiraProjectKey: z.string().min(1),
  query: z.string().optional(),
});
export type DiscoverJiraAssigneesInputDto = z.input<typeof discoverJiraAssigneesInputSchema>;

export const getJiraProjectConfigInputSchema = z.object({
  projectId: z.string().uuid(),
});
export type GetJiraProjectConfigInputDto = z.input<typeof getJiraProjectConfigInputSchema>;

export const saveJiraProjectConfigInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid(),
  jiraProjectId: z.string().min(1),
  jiraProjectKey: z.string().min(1),
  jiraProjectName: z.string().min(1),
  selectedIssueTypeId: z.string().min(1),
  selectedIssueTypeName: z.string().min(1),
  defaultPriorityId: z.string().optional().nullable(),
  defaultPriorityName: z.string().optional().nullable(),
  defaultComponentId: z.string().optional().nullable(),
  defaultComponentName: z.string().optional().nullable(),
  assigneeStrategy: jiraAssigneeStrategySchema.default('UNASSIGNED'),
  defaultAssigneeId: z.string().optional().nullable(),
  defaultAssigneeName: z.string().optional().nullable(),
  fieldMappings: z.record(z.unknown()).optional().nullable(),
});
export type SaveJiraProjectConfigInputDto = z.input<typeof saveJiraProjectConfigInputSchema>;

export const refreshJiraProjectConfigInputSchema = z.object({
  projectId: z.string().uuid(),
});
export type RefreshJiraProjectConfigInputDto = z.input<typeof refreshJiraProjectConfigInputSchema>;

export const testJiraConnectionHealthInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  jiraProjectIdOrKey: z.string().optional(),
  issueTypeId: z.string().optional(),
});
export type TestJiraConnectionHealthInputDto = z.input<typeof testJiraConnectionHealthInputSchema>;

export const jiraIssueCreationStatusSchema = z.enum(['CREATED', 'FAILED']);
export type JiraIssueCreationStatus = z.infer<typeof jiraIssueCreationStatusSchema>;

export const jiraExternalIssueDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid(),
  connectionId: z.string().uuid(),
  jiraProjectId: z.string(),
  jiraProjectKey: z.string(),
  jiraIssueId: z.string(),
  jiraIssueKey: z.string(),
  jiraIssueUrl: z.string(),
  issueType: z.string(),
  summary: z.string(),
  priority: z.string().nullable().optional(),
  creationStatus: jiraIssueCreationStatusSchema,
  requestFingerprint: z.string(),
  metadataSnapshot: z.record(z.unknown()).nullable().optional(),
  createdBy: z.string(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type JiraExternalIssueDto = z.infer<typeof jiraExternalIssueDtoSchema>;

export const createJiraIssueInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid(),
});
export type CreateJiraIssueInputDto = z.input<typeof createJiraIssueInputSchema>;

export const getJiraIssueInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid().optional(),
});
export type GetJiraIssueInputDto = z.input<typeof getJiraIssueInputSchema>;

// Phase 92 — Bug Evidence & Artifact Attachment to Jira
export const jiraAttachmentStatusSchema = z.enum([
  'PENDING',
  'ATTACHED',
  'BLOCKED',
  'FAILED',
  'SKIPPED',
]);
export type JiraAttachmentStatusDto = z.infer<typeof jiraAttachmentStatusSchema>;

export const listAttachableEvidenceInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid().optional(),
});
export type ListAttachableEvidenceInputDto = z.input<typeof listAttachableEvidenceInputSchema>;

export const jiraAttachableEvidenceItemSchema = z.object({
  evidenceReferenceId: z.string().uuid(),
  artifactType: z.string(),
  logicalName: z.string(),
  mimeType: z.string().nullable().optional(),
  byteSize: z.number().nullable().optional(),
  sha256: z.string().nullable().optional(),
  isEligible: z.boolean(),
  ineligibilityReason: z.string().nullable().optional(),
  requiresRedaction: z.boolean(),
  isAlreadyAttached: z.boolean(),
  attachedJiraAttachmentId: z.string().nullable().optional(),
  attachmentStatus: jiraAttachmentStatusSchema.nullable().optional(),
});
export type JiraAttachableEvidenceItemDto = z.infer<typeof jiraAttachableEvidenceItemSchema>;

export const attachEvidenceInputSchema = z.object({
  projectId: z.string().uuid(),
  externalIssueId: z.string().uuid(),
  evidenceReferenceIds: z.array(z.string().uuid()).min(1),
});
export type AttachEvidenceInputDto = z.input<typeof attachEvidenceInputSchema>;

export const jiraEvidenceAttachmentDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  externalIssueId: z.string().uuid(),
  bugReportId: z.string().uuid(),
  evidenceReferenceId: z.string().uuid(),
  evidenceType: z.string(),
  artifactHash: z.string(),
  jiraAttachmentId: z.string().nullable().optional(),
  jiraFilename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  status: jiraAttachmentStatusSchema,
  failureCode: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  isDerivedRedacted: z.boolean(),
  sourceArtifactHash: z.string().nullable().optional(),
  redactionVersion: z.string().nullable().optional(),
  uploadedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type JiraEvidenceAttachmentDto = z.infer<typeof jiraEvidenceAttachmentDtoSchema>;

export const jiraAttachmentBatchResultSchema = z.object({
  externalIssueId: z.string().uuid(),
  jiraIssueKey: z.string(),
  totalRequested: z.number(),
  attachedCount: z.number(),
  blockedCount: z.number(),
  failedCount: z.number(),
  skippedCount: z.number(),
  attachments: z.array(jiraEvidenceAttachmentDtoSchema),
});
export type JiraAttachmentBatchResultDto = z.infer<typeof jiraAttachmentBatchResultSchema>;

export const getAttachmentStatusInputSchema = z.object({
  projectId: z.string().uuid(),
  externalIssueId: z.string().uuid(),
});
export type GetAttachmentStatusInputDto = z.input<typeof getAttachmentStatusInputSchema>;

// Phase 93 — Jira Duplicate Prevention & Existing-Issue Linking
export const jiraLinkSourceSchema = z.enum([
  'EXACT_EXISTING_LINK',
  'SAME_BUG_REPORT',
  'SAME_FAILURE',
  'SAME_DEFECT_CLUSTER',
  'EXTERNAL_EXACT_MATCH',
  'USER_CONFIRMED_LINK',
]);
export type JiraLinkSource = z.infer<typeof jiraLinkSourceSchema>;

export const jiraDuplicateDecisionSchema = z.enum([
  'CREATE_NEW',
  'USE_EXISTING',
  'BLOCKED',
  'INCONCLUSIVE',
]);
export type JiraDuplicateDecision = z.infer<typeof jiraDuplicateDecisionSchema>;

export const jiraIssueLinkDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid().nullable().optional(),
  defectClusterId: z.string().uuid().nullable().optional(),
  externalIssueId: z.string().uuid().nullable().optional(),
  jiraConnectionId: z.string().uuid(),
  jiraProjectKey: z.string(),
  jiraIssueId: z.string(),
  jiraIssueKey: z.string(),
  jiraIssueUrl: z.string(),
  linkReason: z.string(),
  linkSource: jiraLinkSourceSchema,
  ruleId: z.string().nullable().optional(),
  decision: jiraDuplicateDecisionSchema,
  isActive: z.boolean(),
  invalidationReason: z.string().nullable().optional(),
  supersededById: z.string().uuid().nullable().optional(),
  metadataSnapshot: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type JiraIssueLinkDto = z.infer<typeof jiraIssueLinkDtoSchema>;

export const evaluateDuplicateInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid().optional(),
});
export type EvaluateDuplicateInputDto = z.input<typeof evaluateDuplicateInputSchema>;

export const jiraDuplicateEvaluationDtoSchema = z.object({
  decision: jiraDuplicateDecisionSchema,
  ruleId: z.string(),
  reason: z.string(),
  matchedLink: jiraIssueLinkDtoSchema.nullable().optional(),
  existingIssue: jiraExternalIssueDtoSchema.nullable().optional(),
  defectClusterId: z.string().uuid().nullable().optional(),
  defectClusterKey: z.string().nullable().optional(),
  clusterMembershipAuthoritative: z.boolean().optional(),
  jiraIssueKey: z.string().nullable().optional(),
  jiraIssueId: z.string().nullable().optional(),
  jiraIssueUrl: z.string().nullable().optional(),
  candidateCount: z.number().int().nonnegative().optional(),
  evaluatedAt: z.string().or(z.date()),
});
export type JiraDuplicateEvaluationDto = z.infer<typeof jiraDuplicateEvaluationDtoSchema>;

export const linkExistingIssueInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid().optional(),
  jiraIssueKey: z.string().min(1).max(64),
  linkReason: z.string().min(1).max(2000),
  linkSource: jiraLinkSourceSchema.optional(),
});
export type LinkExistingIssueInputDto = z.input<typeof linkExistingIssueInputSchema>;

export const getIssueLinkInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid().optional(),
});
export type GetIssueLinkInputDto = z.input<typeof getIssueLinkInputSchema>;

// Phase 94 — Engineer Assignment & Defect Ownership Workflow
export const defectAssignmentSourceSchema = z.enum([
  'MANUAL',
  'DETERMINISTIC_RULES',
  'JIRA_SYNCHRONIZED',
]);
export type DefectAssignmentSource = z.infer<typeof defectAssignmentSourceSchema>;

export const jiraAssigneeSyncStatusSchema = z.enum([
  'NOT_APPLICABLE',
  'PENDING',
  'SYNCHRONIZED',
  'JIRA_SYNC_FAILED',
  'CONFLICT_DETECTED',
]);
export type JiraAssigneeSyncStatus = z.infer<typeof jiraAssigneeSyncStatusSchema>;

export const defectOwnershipActionSchema = z.enum([
  'ASSIGNED',
  'REASSIGNED',
  'UNASSIGNED',
  'JIRA_SYNC_UPDATED',
  'JIRA_SYNC_FAILED',
  'CONFLICT_RESOLVED',
]);
export type DefectOwnershipAction = z.infer<typeof defectOwnershipActionSchema>;

export const projectEngineerDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  jiraAccountId: z.string().nullable().optional(),
  jiraUsername: z.string().nullable().optional(),
  isActive: z.boolean(),
  routingTags: z.array(z.string()).default([]),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type ProjectEngineerDto = z.infer<typeof projectEngineerDtoSchema>;

export const registerProjectEngineerInputSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(255),
  email: z.string().email(),
  jiraAccountId: z.string().max(128).optional().nullable(),
  jiraUsername: z.string().max(128).optional().nullable(),
  routingTags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});
export type RegisterProjectEngineerInputDto = z.input<typeof registerProjectEngineerInputSchema>;

export const listEligibleEngineersInputSchema = z.object({
  projectId: z.string().uuid(),
  activeOnly: z.boolean().optional().default(true),
});
export type ListEligibleEngineersInputDto = z.input<typeof listEligibleEngineersInputSchema>;

export const defectOwnershipHistoryDtoSchema = z.object({
  id: z.string().uuid(),
  ownershipId: z.string().uuid(),
  projectId: z.string().uuid(),
  bugReportId: z.string().uuid(),
  action: defectOwnershipActionSchema,
  previousEngineerId: z.string().uuid().nullable().optional(),
  newEngineerId: z.string().uuid().nullable().optional(),
  assignmentSource: defectAssignmentSourceSchema,
  assignmentReason: z.string().nullable().optional(),
  ruleId: z.string().nullable().optional(),
  jiraAssigneeSyncStatus: jiraAssigneeSyncStatusSchema,
  syncErrorMessage: z.string().nullable().optional(),
  ownershipVersion: z.number().int(),
  actorUserId: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
});
export type DefectOwnershipHistoryDto = z.infer<typeof defectOwnershipHistoryDtoSchema>;

export const defectOwnershipDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid(),
  jiraIssueLinkId: z.string().uuid().nullable().optional(),
  assignedEngineerId: z.string().uuid().nullable().optional(),
  assignmentSource: defectAssignmentSourceSchema,
  assignmentReason: z.string().nullable().optional(),
  ruleId: z.string().nullable().optional(),
  jiraAssigneeSyncStatus: jiraAssigneeSyncStatusSchema,
  lastJiraSyncError: z.string().nullable().optional(),
  lastJiraSyncAt: z.string().or(z.date()).nullable().optional(),
  ownershipVersion: z.number().int(),
  assignedByUserId: z.string().nullable().optional(),
  assignedAt: z.string().or(z.date()).nullable().optional(),
  assignedEngineer: projectEngineerDtoSchema.nullable().optional(),
  jiraIssueKey: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  history: z.array(defectOwnershipHistoryDtoSchema).optional(),
});
export type DefectOwnershipDto = z.infer<typeof defectOwnershipDtoSchema>;

export const getDefectOwnershipInputSchema = z.object({
  projectId: z.string().uuid(),
  bugReportId: z.string().uuid(),
});
export type GetDefectOwnershipInputDto = z.input<typeof getDefectOwnershipInputSchema>;

export const assignEngineerInputSchema = z.object({
  projectId: z.string().uuid(),
  bugReportId: z.string().uuid(),
  engineerId: z.string().uuid(),
  assignmentReason: z.string().max(2000).optional(),
  actorUserId: z.string().optional(),
  expectedVersion: z.number().int().optional(),
});
export type AssignEngineerInputDto = z.input<typeof assignEngineerInputSchema>;

export const unassignEngineerInputSchema = z.object({
  projectId: z.string().uuid(),
  bugReportId: z.string().uuid(),
  reason: z.string().max(2000).optional(),
  actorUserId: z.string().optional(),
  expectedVersion: z.number().int().optional(),
});
export type UnassignEngineerInputDto = z.input<typeof unassignEngineerInputSchema>;

export const syncOwnershipFromJiraInputSchema = z.object({
  projectId: z.string().uuid(),
  bugReportId: z.string().uuid(),
  actorUserId: z.string().optional(),
});
export type SyncOwnershipFromJiraInputDto = z.input<typeof syncOwnershipFromJiraInputSchema>;

export const retryJiraSyncInputSchema = z.object({
  projectId: z.string().uuid(),
  bugReportId: z.string().uuid(),
});
export type RetryJiraSyncInputDto = z.input<typeof retryJiraSyncInputSchema>;

// ------------------------------------------------------------------------------
// Email Notification System (V7 Phase 95)
// ------------------------------------------------------------------------------

export const emailProviderTypeSchema = z.enum(['SMTP', 'SANDBOX', 'TEST_STREAM']);
export type EmailProviderType = z.infer<typeof emailProviderTypeSchema>;

export const notificationEventTypeSchema = z.enum([
  'BUG_CREATED',
  'BUG_ASSIGNED',
  'BUG_REASSIGNED',
  'HIGH_SEVERITY_BUG_CREATED',
  'CRITICAL_SEVERITY_BUG_CREATED',
  'JIRA_ISSUE_CREATED',
  'JIRA_ISSUE_LINKED',
  'JIRA_ISSUE_CREATION_FAILED',
  'TEST_REVERIFICATION_REQUIRED',
  'POST_FIX_VERIFICATION_SUCCEEDED',
  'POST_FIX_VERIFICATION_FAILED',
  'POST_FIX_REGRESSION_DETECTED',
  'POST_FIX_VERIFICATION_BLOCKED',
]);
export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>;

export const notificationDeliveryStatusSchema = z.enum([
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED',
  'SUPPRESSED',
  'CANCELLED',
]);
export type NotificationDeliveryStatus = z.infer<typeof notificationDeliveryStatusSchema>;

export const notificationDeliveryModeSchema = z.enum(['REAL', 'TEST', 'SIMULATED']);
export type NotificationDeliveryMode = z.infer<typeof notificationDeliveryModeSchema>;

export const notificationAuditActionSchema = z.enum([
  'NOTIFICATION_CREATED',
  'DELIVERY_ATTEMPTED',
  'DELIVERY_SUCCEEDED',
  'DELIVERY_FAILED',
  'DELIVERY_RETRIED',
  'NOTIFICATION_SUPPRESSED',
  'RESTART_RECOVERED',
]);
export type NotificationAuditAction = z.infer<typeof notificationAuditActionSchema>;

export const qaRecipientSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});
export type QaRecipientDto = z.infer<typeof qaRecipientSchema>;

export const projectEmailConfigDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  providerType: emailProviderTypeSchema,
  senderName: z.string(),
  senderAddress: z.string().email(),
  replyTo: z.string().email().nullable().optional(),
  smtpHost: z.string().nullable().optional(),
  smtpPort: z.number().int().nullable().optional(),
  smtpSecure: z.boolean(),
  smtpUser: z.string().nullable().optional(),
  isConfigured: z.boolean(),
  isEnabled: z.boolean(),
  isTestMode: z.boolean(),
  testInboxAddress: z.string().email().nullable().optional(),
  minSeverity: z.string(),
  notifyOnBugCreated: z.boolean(),
  notifyOnBugAssigned: z.boolean(),
  notifyOnJiraAction: z.boolean(),
  qaTeamRecipients: z.array(qaRecipientSchema),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type ProjectEmailConfigDto = z.infer<typeof projectEmailConfigDtoSchema>;

export const getProjectEmailConfigInputSchema = z.object({
  projectId: z.string().uuid(),
});
export type GetProjectEmailConfigInputDto = z.input<typeof getProjectEmailConfigInputSchema>;

export const saveProjectEmailConfigInputSchema = z.object({
  projectId: z.string().uuid(),
  providerType: emailProviderTypeSchema.optional().default('SMTP'),
  senderName: z.string().min(1).max(128).optional(),
  senderAddress: z.string().email(),
  replyTo: z.string().email().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  isEnabled: z.boolean().optional(),
  isTestMode: z.boolean().optional(),
  testInboxAddress: z.string().email().optional(),
  minSeverity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  notifyOnBugCreated: z.boolean().optional(),
  notifyOnBugAssigned: z.boolean().optional(),
  notifyOnJiraAction: z.boolean().optional(),
  qaTeamRecipients: z.array(qaRecipientSchema).optional(),
});
export type SaveProjectEmailConfigInputDto = z.input<typeof saveProjectEmailConfigInputSchema>;

export const testEmailConnectionInputSchema = z.object({
  projectId: z.string().uuid(),
  testRecipientEmail: z.string().email().optional(),
});
export type TestEmailConnectionInputDto = z.input<typeof testEmailConnectionInputSchema>;

export const testEmailConnectionResultSchema = z.object({
  success: z.boolean(),
  provider: z.string(),
  message: z.string(),
  deliveryMode: notificationDeliveryModeSchema.optional(),
  details: z.record(z.unknown()).optional(),
});
export type TestEmailConnectionResultDto = z.infer<typeof testEmailConnectionResultSchema>;

export const notificationDeliveryAttemptDtoSchema = z.object({
  id: z.string().uuid(),
  notificationId: z.string().uuid(),
  projectId: z.string().uuid(),
  attemptNumber: z.number().int(),
  status: notificationDeliveryStatusSchema,
  provider: z.string(),
  providerMessageId: z.string().nullable().optional(),
  providerResponse: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  isTransient: z.boolean(),
  durationMs: z.number().int().nullable().optional(),
  startedAt: z.string().or(z.date()),
  completedAt: z.string().or(z.date()).nullable().optional(),
});
export type NotificationDeliveryAttemptDto = z.infer<typeof notificationDeliveryAttemptDtoSchema>;

export const emailNotificationDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  eventType: notificationEventTypeSchema,
  entityType: z.string(),
  entityId: z.string().uuid(),
  failureCaseId: z.string().uuid().nullable().optional(),
  bugReportId: z.string().uuid().nullable().optional(),
  recipientUserId: z.string().nullable().optional(),
  recipientAddress: z.string(),
  recipientName: z.string().nullable().optional(),
  recipientRole: z.string().nullable().optional(),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string(),
  templateId: z.string(),
  templateVersion: z.string(),
  idempotencyKey: z.string(),
  status: notificationDeliveryStatusSchema,
  deliveryMode: notificationDeliveryModeSchema,
  attemptCount: z.number().int(),
  maxAttempts: z.number().int(),
  provider: z.string(),
  providerMessageId: z.string().nullable().optional(),
  providerResponse: z.string().nullable().optional(),
  lastErrorCode: z.string().nullable().optional(),
  lastErrorMessage: z.string().nullable().optional(),
  suppressionReason: z.string().nullable().optional(),
  queuedAt: z.string().or(z.date()),
  sentAt: z.string().or(z.date()).nullable().optional(),
  failedAt: z.string().or(z.date()).nullable().optional(),
  lastAttemptAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  deliveryAttempts: z.array(notificationDeliveryAttemptDtoSchema).optional(),
});
export type EmailNotificationDto = z.infer<typeof emailNotificationDtoSchema>;

export const listEmailNotificationsInputSchema = z.object({
  projectId: z.string().uuid(),
  bugReportId: z.string().uuid().optional(),
  failureCaseId: z.string().uuid().optional(),
  status: notificationDeliveryStatusSchema.optional(),
  eventType: notificationEventTypeSchema.optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(100).optional().default(20),
});
export type ListEmailNotificationsInputDto = z.input<typeof listEmailNotificationsInputSchema>;

export const getEmailNotificationInputSchema = z.object({
  projectId: z.string().uuid(),
  notificationId: z.string().uuid(),
});
export type GetEmailNotificationInputDto = z.input<typeof getEmailNotificationInputSchema>;

export const retryEmailNotificationInputSchema = z.object({
  projectId: z.string().uuid(),
  notificationId: z.string().uuid(),
});
export type RetryEmailNotificationInputDto = z.input<typeof retryEmailNotificationInputSchema>;

export const sendWorkflowNotificationInputSchema = z.object({
  projectId: z.string().uuid(),
  eventType: notificationEventTypeSchema,
  bugReportId: z.string().uuid().optional(),
  failureCaseId: z.string().uuid().optional(),
});
export type SendWorkflowNotificationInputDto = z.input<typeof sendWorkflowNotificationInputSchema>;

// ------------------------------------------------------------------------------
// Bug Status & External Workflow Synchronization Types & DTOs (V7 Phase 96)
// ------------------------------------------------------------------------------

export const internalBugStatusSchema = z.enum([
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
  'REOPENED',
  'CLOSED',
  'BLOCKED',
  'WONT_FIX',
  'DUPLICATE',
]);
export type InternalBugStatusDto = z.infer<typeof internalBugStatusSchema>;

export const defectVerificationStatusSchema = z.enum([
  'NOT_VERIFIED',
  'VERIFICATION_PENDING',
  'VERIFIED_FIXED',
  'REVERIFICATION_FAILED',
]);
export type DefectVerificationStatusDto = z.infer<typeof defectVerificationStatusSchema>;

export const syncDirectionSchema = z.enum([
  'INTERNAL_TO_EXTERNAL',
  'EXTERNAL_TO_INTERNAL',
  'BIDIRECTIONAL',
]);
export type SyncDirectionDto = z.infer<typeof syncDirectionSchema>;

export const syncConflictPolicySchema = z.enum([
  'MANUAL_REVIEW',
  'INTERNAL_WINS',
  'EXTERNAL_WINS',
  'LATEST_VALID_CHANGE',
]);
export type SyncConflictPolicyDto = z.infer<typeof syncConflictPolicySchema>;

export const syncResultStatusSchema = z.enum([
  'SYNCED',
  'NO_CHANGE',
  'BLOCKED',
  'CONFLICT',
  'FAILED',
  'UNMAPPED',
  'UNAUTHORIZED',
  'EXTERNAL_NOT_FOUND',
  'RATE_LIMITED',
]);
export type SyncResultStatusDto = z.infer<typeof syncResultStatusSchema>;

export const workflowConflictStateSchema = z.object({
  detectedAt: z.string().or(z.date()),
  internalStatus: internalBugStatusSchema,
  externalStatus: z.string(),
  lastSyncedInternalStatus: internalBugStatusSchema.nullable().optional(),
  lastSyncedExternalStatus: z.string().nullable().optional(),
  reason: z.string(),
  suggestedAction: z.string().optional(),
});
export type WorkflowConflictStateDto = z.infer<typeof workflowConflictStateSchema>;

export const bugWorkflowStateDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid().nullable().optional(),
  currentStatus: internalBugStatusSchema,
  verificationStatus: defectVerificationStatusSchema,
  statusReason: z.string().nullable().optional(),
  resolvedAt: z.string().or(z.date()).nullable().optional(),
  resolutionReason: z.string().nullable().optional(),
  reopenedAt: z.string().or(z.date()).nullable().optional(),
  reopenReason: z.string().nullable().optional(),
  closedAt: z.string().or(z.date()).nullable().optional(),
  lastChangedBy: z.string(),
  workflowVersion: z.number().int(),
  lastExternalStatus: z.string().nullable().optional(),
  lastExternalStatusId: z.string().nullable().optional(),
  lastSyncedInternalStatus: internalBugStatusSchema.nullable().optional(),
  lastSyncedExternalStatus: z.string().nullable().optional(),
  lastSyncedAt: z.string().or(z.date()).nullable().optional(),
  lastExternalUpdatedAt: z.string().or(z.date()).nullable().optional(),
  syncVersion: z.number().int(),
  lastSyncResult: syncResultStatusSchema.nullable().optional(),
  lastSyncError: z.string().nullable().optional(),
  conflictState: z.any().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type BugWorkflowStateDto = z.infer<typeof bugWorkflowStateDtoSchema>;

export const workflowStatusMappingDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().nullable().optional(),
  externalSystem: z.string(),
  externalStatusId: z.string(),
  externalStatusName: z.string(),
  internalStatus: internalBugStatusSchema,
  direction: syncDirectionSchema,
  conflictPolicy: syncConflictPolicySchema,
  isEnabled: z.boolean(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type WorkflowStatusMappingDto = z.infer<typeof workflowStatusMappingDtoSchema>;

export const workflowSyncEventDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  workflowStateId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  bugReportId: z.string().uuid().nullable().optional(),
  connectionId: z.string().uuid().nullable().optional(),
  externalIssueId: z.string().nullable().optional(),
  externalIssueKey: z.string().nullable().optional(),
  direction: syncDirectionSchema,
  sourceStatus: z.string(),
  targetStatus: z.string().nullable().optional(),
  mappedStatus: z.string().nullable().optional(),
  syncResult: syncResultStatusSchema,
  conflictDetails: z.any().nullable().optional(),
  startedAt: z.string().or(z.date()),
  completedAt: z.string().or(z.date()).nullable().optional(),
  externalUpdatedAt: z.string().or(z.date()).nullable().optional(),
  internalUpdatedAt: z.string().or(z.date()).nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  retryCount: z.number().int(),
  actor: z.string(),
  createdAt: z.string().or(z.date()),
});
export type WorkflowSyncEventDto = z.infer<typeof workflowSyncEventDtoSchema>;

// Input schemas
export const getWorkflowStateInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid().optional(),
  bugReportId: z.string().uuid().optional(),
});
export type GetWorkflowStateInputDto = z.input<typeof getWorkflowStateInputSchema>;

export const updateInternalStatusInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  targetStatus: internalBugStatusSchema,
  reason: z.string().optional(),
  actor: z.string().optional(),
  syncExternal: z.boolean().optional().default(true),
});
export type UpdateInternalStatusInputDto = z.input<typeof updateInternalStatusInputSchema>;

export const getWorkflowStatusMappingsInputSchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  externalSystem: z.string().optional(),
});
export type GetWorkflowStatusMappingsInputDto = z.input<
  typeof getWorkflowStatusMappingsInputSchema
>;

export const saveWorkflowStatusMappingInputSchema = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid().optional(),
  connectionId: z.string().uuid().optional(),
  externalSystem: z.string().min(1).default('JIRA'),
  externalStatusId: z.string().min(1).default('*'),
  externalStatusName: z.string().min(1),
  internalStatus: internalBugStatusSchema,
  direction: syncDirectionSchema.optional().default('BIDIRECTIONAL'),
  conflictPolicy: syncConflictPolicySchema.optional().default('MANUAL_REVIEW'),
  isEnabled: z.boolean().optional().default(true),
});
export type SaveWorkflowStatusMappingInputDto = z.input<
  typeof saveWorkflowStatusMappingInputSchema
>;

export const deleteWorkflowStatusMappingInputSchema = z.object({
  projectId: z.string().uuid(),
  mappingId: z.string().uuid(),
});
export type DeleteWorkflowStatusMappingInputDto = z.input<
  typeof deleteWorkflowStatusMappingInputSchema
>;

export const syncWorkflowNowInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  direction: syncDirectionSchema.optional().default('BIDIRECTIONAL'),
  actor: z.string().optional(),
});
export type SyncWorkflowNowInputDto = z.input<typeof syncWorkflowNowInputSchema>;

export const resolveWorkflowConflictInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  chosenWinner: z.enum(['INTERNAL', 'EXTERNAL']),
  overrideStatus: z.string().optional(),
  resolutionNote: z.string().min(1),
  actor: z.string().optional(),
});
export type ResolveWorkflowConflictInputDto = z.input<typeof resolveWorkflowConflictInputSchema>;

export const listWorkflowSyncEventsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid().optional(),
  workflowStateId: z.string().uuid().optional(),
  syncResult: syncResultStatusSchema.optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(100).optional().default(20),
});
export type ListWorkflowSyncEventsInputDto = z.input<typeof listWorkflowSyncEventsInputSchema>;

// ------------------------------------------------------------------------------
// Defect Reverification Foundation Types & DTOs (V7 Phase 97)
// ------------------------------------------------------------------------------

export const reverificationStatusSchema = z.enum([
  'DRAFT',
  'ELIGIBILITY_CHECK',
  'READY',
  'BLOCKED',
  'PENDING_EXECUTION',
  'EXECUTING',
  'COMPLETED',
  'CANCELLED',
  'SUPERSEDED',
]);
export type ReverificationStatusDto = z.infer<typeof reverificationStatusSchema>;

export const reverificationEligibilitySchema = z.enum([
  'ELIGIBLE',
  'NOT_ELIGIBLE',
  'BLOCKED',
  'UNKNOWN',
]);
export type ReverificationEligibilityDto = z.infer<typeof reverificationEligibilitySchema>;

export const reverificationTriggerTypeSchema = z.enum([
  'EXTERNAL_ISSUE_FIXED',
  'EXTERNAL_ISSUE_RESOLVED',
  'MANUAL_REQUEST',
  'PATCH_APPLIED',
  'SOURCE_CHANGE_DETECTED',
  'BUG_STATUS_CHANGED',
]);
export type ReverificationTriggerTypeDto = z.infer<typeof reverificationTriggerTypeSchema>;

export const defectReverificationDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  failureAnalysisId: z.string().uuid().nullable().optional(),
  bugReportId: z.string().uuid().nullable().optional(),
  externalIssueLinkId: z.string().uuid().nullable().optional(),

  originalTestRunId: z.string().uuid(),
  originalExecutionId: z.string().uuid(),
  originalTestCaseId: z.string().uuid(),
  originalTestCaseVersionId: z.string().uuid().nullable().optional(),
  originalTestCaseVersionNumber: z.number().int(),

  selectedTestCaseId: z.string().uuid(),
  selectedTestCaseVersionId: z.string().uuid().nullable().optional(),
  selectedTestCaseVersionNumber: z.number().int(),
  testVersionSelectionReason: z.string().nullable().optional(),

  requirementId: z.string().uuid().nullable().optional(),
  requirementKey: z.string().nullable().optional(),
  requirementVersionId: z.string().uuid().nullable().optional(),
  requirementVersionNumber: z.number().int().nullable().optional(),

  status: reverificationStatusSchema,
  eligibility: reverificationEligibilitySchema,
  eligibilityReasons: z.array(z.string()),

  triggerType: reverificationTriggerTypeSchema,
  triggerReference: z.string().nullable().optional(),

  originalEnvironmentId: z.string().uuid().nullable().optional(),
  targetEnvironmentId: z.string().uuid(),
  environmentSnapshotJson: z.any().optional(),

  fixReference: z.string().nullable().optional(),
  fixProvenanceJson: z.any().optional(),

  baselineFailureJson: z.any().optional(),
  expectedVerificationJson: z.any().optional(),
  executionPlanJson: z.any().optional(),

  safetyStatus: z.string(),
  safetyReason: z.string().nullable().optional(),

  isAuthoritative: z.boolean(),
  supersededById: z.string().uuid().nullable().optional(),
  supersededAt: z.string().or(z.date()).nullable().optional(),
  supersedeReason: z.string().nullable().optional(),

  cancelledById: z.string().nullable().optional(),
  cancelledAt: z.string().or(z.date()).nullable().optional(),
  cancellationReason: z.string().nullable().optional(),

  requestedBy: z.string(),
  requestedAt: z.string().or(z.date()),
  version: z.number().int(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type DefectReverificationDto = z.infer<typeof defectReverificationDtoSchema>;

export const reverificationAuditEventDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  reverificationId: z.string().uuid(),
  action: z.string(),
  fromStatus: reverificationStatusSchema.nullable().optional(),
  toStatus: reverificationStatusSchema.nullable().optional(),
  actor: z.string(),
  reason: z.string().nullable().optional(),
  detailsJson: z.any().optional(),
  createdAt: z.string().or(z.date()),
});
export type ReverificationAuditEventDto = z.infer<typeof reverificationAuditEventDtoSchema>;

export const getReverificationStateInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type GetReverificationStateInputDto = z.input<typeof getReverificationStateInputSchema>;

export const evaluateReverificationEligibilityInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  targetEnvironmentId: z.string().uuid().optional(),
  triggerType: reverificationTriggerTypeSchema.optional().default('MANUAL_REQUEST'),
  triggerReference: z.string().optional(),
  fixReference: z.string().optional(),
  fixProvenance: z.record(z.any()).optional(),
});
export type EvaluateReverificationEligibilityInputDto = z.input<
  typeof evaluateReverificationEligibilityInputSchema
>;

export const evaluateReverificationEligibilityOutputSchema = z.object({
  eligibility: reverificationEligibilitySchema,
  reasons: z.array(z.string()),
  targetEnvironmentId: z.string().uuid().nullable().optional(),
  originalTestCaseVersionNumber: z.number().int(),
  selectedTestCaseVersionNumber: z.number().int(),
  safetyStatus: z.string(),
  isProductionBlocked: z.boolean(),
  details: z.record(z.any()).optional(),
});
export type EvaluateReverificationEligibilityOutputDto = z.infer<
  typeof evaluateReverificationEligibilityOutputSchema
>;

export const createReverificationRequestInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  targetEnvironmentId: z.string().uuid().optional(),
  triggerType: reverificationTriggerTypeSchema.optional().default('MANUAL_REQUEST'),
  triggerReference: z.string().optional(),
  fixReference: z.string().optional(),
  fixProvenance: z.record(z.any()).optional(),
  actor: z.string().optional().default('USER'),
  selectedTestCaseVersionNumber: z.number().int().optional(),
  testVersionSelectionReason: z.string().optional(),
});
export type CreateReverificationRequestInputDto = z.input<
  typeof createReverificationRequestInputSchema
>;

export const generateReverificationPlanInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reverificationId: z.string().uuid().optional(),
  targetEnvironmentId: z.string().uuid().optional(),
  actor: z.string().optional().default('USER'),
});
export type GenerateReverificationPlanInputDto = z.input<
  typeof generateReverificationPlanInputSchema
>;

export const cancelReverificationInputSchema = z.object({
  projectId: z.string().uuid(),
  reverificationId: z.string().uuid(),
  reason: z.string().min(1),
  actor: z.string().optional().default('USER'),
});
export type CancelReverificationInputDto = z.input<typeof cancelReverificationInputSchema>;

export const listReverificationAuditEventsInputSchema = z.object({
  projectId: z.string().uuid(),
  reverificationId: z.string().uuid(),
});
export type ListReverificationAuditEventsInputDto = z.input<
  typeof listReverificationAuditEventsInputSchema
>;

// ------------------------------------------------------------------------------
// Phase 98 — Automated Failed-Test Rerun & Fix Verification
// ------------------------------------------------------------------------------

export const verificationOutcomeSchema = z.enum([
  'VERIFIED_FIXED',
  'STILL_FAILING',
  'DIFFERENT_FAILURE',
  'BLOCKED',
  'INCONCLUSIVE',
  'CANCELLED',
  'EXECUTION_ERROR',
]);
export type VerificationOutcome = z.infer<typeof verificationOutcomeSchema>;

export const verificationModeSchema = z.enum(['HISTORICAL', 'CURRENT']);
export type VerificationMode = z.infer<typeof verificationModeSchema>;

export const defectVerificationAttemptDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  reverificationId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  structuredBugReportId: z.string().uuid().nullable().optional(),
  originalExecutionId: z.string().uuid(),
  verificationExecutionId: z.string().uuid().nullable().optional(),
  verificationTestRunId: z.string().uuid().nullable().optional(),
  verificationMode: verificationModeSchema,
  testCaseId: z.string().uuid(),
  originalTestCaseVersionId: z.string().uuid().nullable().optional(),
  originalTestCaseVersionNumber: z.number().int(),
  verificationTestCaseVersionId: z.string().uuid().nullable().optional(),
  verificationTestCaseVersionNumber: z.number().int(),
  testVersionDifference: z.string().nullable().optional(),
  originalRequirementVersionNumber: z.number().int().nullable().optional(),
  verificationRequirementVersionNumber: z.number().int().nullable().optional(),
  attemptNumber: z.number().int(),
  targetEnvironmentId: z.string().uuid().nullable().optional(),
  browserEngine: z.string(),
  status: verificationOutcomeSchema,
  originalFailureSignature: z.string().nullable().optional(),
  verificationFailureSignature: z.string().nullable().optional(),
  isSignatureMatch: z.boolean().nullable().optional(),
  failedStepIndex: z.number().int().nullable().optional(),
  originalFailedStepAction: z.string().nullable().optional(),
  verificationFailedStepAction: z.string().nullable().optional(),
  stepComparisonJson: z.any().optional(),
  assertionComparisonJson: z.any().optional(),
  environmentComparisonJson: z.any().optional(),
  environmentEquivalence: environmentEquivalenceStatusSchema.optional(),
  environmentDriftDetails: z.string().nullable().optional(),
  originalBuildCommit: z.string().nullable().optional(),
  verificationBuildCommit: z.string().nullable().optional(),
  blockerReason: z.string().nullable().optional(),
  executionDurationMs: z.number().int().nullable().optional(),
  startedAt: z.string().or(z.date()).nullable().optional(),
  completedAt: z.string().or(z.date()).nullable().optional(),
  metadataJson: z.any().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type DefectVerificationAttemptDto = z.infer<typeof defectVerificationAttemptDtoSchema>;

export const verificationSummaryDtoSchema = z.object({
  failureCaseId: z.string().uuid(),
  reverificationId: z.string().uuid(),
  projectId: z.string().uuid(),
  totalAttempts: z.number().int(),
  latestAttemptNumber: z.number().int(),
  latestOutcome: verificationOutcomeSchema,
  isFixed: z.boolean(),
  isStillFailing: z.boolean(),
  isBlocked: z.boolean(),
  isInconclusive: z.boolean(),
  environmentEquivalence: environmentEquivalenceStatusSchema,
  attempts: z.array(defectVerificationAttemptDtoSchema),
  factualMetrics: z.object({
    attemptsRequested: z.number().int(),
    attemptsStarted: z.number().int(),
    attemptsCompleted: z.number().int(),
    passes: z.number().int(),
    sameFailures: z.number().int(),
    differentFailures: z.number().int(),
    blocked: z.number().int(),
    cancelled: z.number().int(),
    executionErrors: z.number().int(),
    environmentDrift: z.boolean(),
  }),
});
export type VerificationSummaryDto = z.infer<typeof verificationSummaryDtoSchema>;

export const executeVerificationInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reverificationId: z.string().uuid().optional(),
  mode: verificationModeSchema.optional().default('HISTORICAL'),
  targetEnvironmentId: z.string().uuid().optional(),
  maxAttempts: z.number().int().min(1).max(5).optional().default(1),
  actor: z.string().optional().default('USER'),
});
export type ExecuteVerificationInputDto = z.input<typeof executeVerificationInputSchema>;

export const getVerificationAttemptsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reverificationId: z.string().uuid().optional(),
});
export type GetVerificationAttemptsInputDto = z.input<typeof getVerificationAttemptsInputSchema>;

export const getVerificationComparisonInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  attemptId: z.string().uuid().optional(),
});
export type GetVerificationComparisonInputDto = z.input<
  typeof getVerificationComparisonInputSchema
>;

export const cancelVerificationInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reason: z.string().min(1),
  actor: z.string().optional().default('USER'),
});
export type CancelVerificationInputDto = z.input<typeof cancelVerificationInputSchema>;

// ------------------------------------------------------------------------------
// Phase 99 — AI Quick-Fix Eligibility & Safety Analysis
// ------------------------------------------------------------------------------

export const quickFixEligibilityDecisionSchema = z.enum([
  'ELIGIBLE',
  'NOT_ELIGIBLE',
  'NEEDS_HUMAN_REVIEW',
  'INSUFFICIENT_EVIDENCE',
  'BLOCKED',
]);
export type QuickFixEligibilityDecisionDto = z.infer<typeof quickFixEligibilityDecisionSchema>;

export const quickFixRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type QuickFixRiskLevelDto = z.infer<typeof quickFixRiskLevelSchema>;

export const quickFixCandidateSymbolDtoSchema = z.object({
  symbolName: z.string(),
  symbolType: z.string(),
  filePath: z.string(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
});
export type QuickFixCandidateSymbolDto = z.infer<typeof quickFixCandidateSymbolDtoSchema>;

export const quickFixRiskFactorsDtoSchema = z.object({
  isSecuritySensitive: z.boolean(),
  isAuthOrPermission: z.boolean(),
  isFinancialOrPayment: z.boolean(),
  isDbMigrationOrSchema: z.boolean(),
  isDependencyChange: z.boolean(),
  isProductionConfigOrCi: z.boolean(),
  isDataDestructive: z.boolean(),
  isPublicApiBreaking: z.boolean(),
  isDirtyWorktree: z.boolean(),
  isLargeScope: z.boolean(),
  details: z.record(z.string(), z.any()).optional(),
});
export type QuickFixRiskFactorsDto = z.infer<typeof quickFixRiskFactorsDtoSchema>;

export const quickFixBlastRadiusDtoSchema = z.object({
  totalDependentFiles: z.number().int(),
  totalDependentSymbols: z.number().int(),
  affectedModules: z.array(z.string()),
  affectedEndpoints: z.array(z.string()).optional(),
  dependencyGraphDepth: z.number().int().optional(),
  highRiskDependents: z.array(z.string()).optional(),
});
export type QuickFixBlastRadiusDto = z.infer<typeof quickFixBlastRadiusDtoSchema>;

export const quickFixRequiredTestDtoSchema = z.object({
  testId: z.string().optional(),
  testName: z.string(),
  testType: z.string(),
  filePath: z.string().optional(),
  isRequired: z.boolean(),
  reason: z.string(),
});
export type QuickFixRequiredTestDto = z.infer<typeof quickFixRequiredTestDtoSchema>;

export const quickFixGitStateDtoSchema = z.object({
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  isClean: z.boolean(),
  modifiedFiles: z.array(z.string()),
  untrackedFiles: z.array(z.string()),
});
export type QuickFixGitStateDto = z.infer<typeof quickFixGitStateDtoSchema>;

export const quickFixEligibilityAssessmentDtoSchema = z.object({
  id: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceId: z.string().uuid().nullable().optional(),
  rootCauseAnalysisId: z.string().uuid().nullable().optional(),
  decision: quickFixEligibilityDecisionSchema,
  riskLevel: quickFixRiskLevelSchema,
  confidenceScore: z.number().min(0).max(1),
  summary: z.string(),
  reasons: z.array(z.string()),
  matchedRules: z.array(z.string()),
  blockingRules: z.array(z.string()),
  candidateFiles: z.array(z.string()),
  candidateSymbols: z.array(quickFixCandidateSymbolDtoSchema),
  blastRadius: quickFixBlastRadiusDtoSchema,
  requiredTests: z.array(quickFixRequiredTestDtoSchema),
  riskFactors: quickFixRiskFactorsDtoSchema,
  gitState: quickFixGitStateDtoSchema,
  gitBranch: z.string().nullable().optional(),
  gitCommitSha: z.string().nullable().optional(),
  gitClean: z.boolean(),
  isSuperseded: z.boolean(),
  supersededById: z.string().uuid().nullable().optional(),
  evaluatedBy: z.string(),
  evaluatedAt: z.string().or(z.date()),
  metadataJson: z.any().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type QuickFixEligibilityAssessmentDto = z.infer<
  typeof quickFixEligibilityAssessmentDtoSchema
>;

export const evaluateQuickFixEligibilityInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  sourceId: z.string().uuid().optional(),
  actor: z.string().optional().default('SYSTEM'),
});
export type EvaluateQuickFixEligibilityInputDto = z.input<
  typeof evaluateQuickFixEligibilityInputSchema
>;

export const getQuickFixAssessmentInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  assessmentId: z.string().uuid().optional(),
});
export type GetQuickFixAssessmentInputDto = z.input<typeof getQuickFixAssessmentInputSchema>;

export const listQuickFixAssessmentsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListQuickFixAssessmentsInputDto = z.input<typeof listQuickFixAssessmentsInputSchema>;

// -----------------------------------------------------------------------------
// V7 Phase 100 — Repository-Aware Defect Localization Contracts & Schemas
// -----------------------------------------------------------------------------

export const repositoryRevisionStateSchema = z.enum([
  'EXACT_REVISION',
  'EQUIVALENT_REVISION',
  'DRIFTED_REVISION',
  'HISTORICAL_REVISION_UNAVAILABLE',
  'UNKNOWN',
]);
export type RepositoryRevisionStateDto = z.infer<typeof repositoryRevisionStateSchema>;

export const defectCandidateTypeSchema = z.enum([
  'FILE',
  'CLASS',
  'FUNCTION',
  'METHOD',
  'COMPONENT',
  'API_HANDLER',
  'ROUTE',
  'CONTROLLER',
  'SERVICE',
  'REPOSITORY',
  'DATABASE_QUERY',
  'VALIDATION_SCHEMA',
  'MIDDLEWARE',
  'CONFIGURATION_FILE',
]);
export type DefectCandidateTypeDto = z.infer<typeof defectCandidateTypeSchema>;

export const candidateEvidenceSignalSchema = z.enum([
  'STACK_TRACE',
  'SOURCE_MAP',
  'NETWORK_ENDPOINT',
  'ROUTE_MAPPING',
  'DOM_COMPONENT',
  'UI_ACTION_TARGET',
  'ROOT_CAUSE_PROBABLE_LAYER',
  'ROOT_CAUSE_HYPOTHESIS',
  'REQUIREMENT_TRACEABILITY',
  'SYMBOL_GRAPH_IMPORT',
  'SYMBOL_GRAPH_CALLER',
  'RECENT_COMMIT_TOUCH',
  'KEYWORD_SIMILARITY',
]);
export type CandidateEvidenceSignalDto = z.infer<typeof candidateEvidenceSignalSchema>;

export const candidateEvidenceItemSchema = z.object({
  signal: candidateEvidenceSignalSchema,
  strength: z.enum(['STRONG', 'MODERATE', 'WEAK']),
  description: z.string(),
  provenance: z.string(),
  rawReference: z.string().optional(),
});
export type CandidateEvidenceItemDto = z.infer<typeof candidateEvidenceItemSchema>;

export const rankedDefectCandidateDtoSchema = z.object({
  rank: z.number().int().positive(),
  filePath: z.string(),
  symbolName: z.string().nullable().optional(),
  symbolKind: z.string().nullable().optional(),
  candidateType: defectCandidateTypeSchema,
  score: z.number().min(0).max(1),
  confidenceLevel: z.enum(['VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW', 'VERY_LOW']),
  priorityStatus: z.enum([
    'HIGH_PRIORITY_CANDIDATE',
    'MEDIUM_PRIORITY_CANDIDATE',
    'LOW_PRIORITY_CANDIDATE',
  ]),
  startLine: z.number().int().nullable().optional(),
  endLine: z.number().int().nullable().optional(),
  relevanceExplanation: z.string(),
  supportingEvidence: z.array(candidateEvidenceItemSchema),
  contradictingEvidence: z.array(candidateEvidenceItemSchema),
  traceabilityLinks: z.object({
    requirementId: z.string().uuid().nullable().optional(),
    requirementKey: z.string().nullable().optional(),
    testCaseId: z.string().uuid().nullable().optional(),
    testCaseKey: z.string().nullable().optional(),
    executionId: z.string().uuid().nullable().optional(),
    failedStepIndex: z.number().int().nullable().optional(),
  }),
});
export type RankedDefectCandidateDto = z.infer<typeof rankedDefectCandidateDtoSchema>;

export const defectLocalizationTraceabilityDtoSchema = z.object({
  requirementId: z.string().uuid().nullable().optional(),
  requirementKey: z.string().nullable().optional(),
  requirementTitle: z.string().nullable().optional(),
  testCaseId: z.string().uuid().nullable().optional(),
  testCaseKey: z.string().nullable().optional(),
  testCaseTitle: z.string().nullable().optional(),
  executionId: z.string().uuid().nullable().optional(),
  failedStepAction: z.string().nullable().optional(),
  failedStepTarget: z.string().nullable().optional(),
  assertionMessage: z.string().nullable().optional(),
});
export type DefectLocalizationTraceabilityDto = z.infer<
  typeof defectLocalizationTraceabilityDtoSchema
>;

export const defectLocalizationNetworkCorrelationDtoSchema = z.object({
  observedEndpoint: z.string().nullable().optional(),
  httpMethod: z.string().nullable().optional(),
  statusCode: z.number().nullable().optional(),
  matchedRoutePath: z.string().nullable().optional(),
  matchedHandlerFile: z.string().nullable().optional(),
  matchedServiceFile: z.string().nullable().optional(),
});
export type DefectLocalizationNetworkCorrelationDto = z.infer<
  typeof defectLocalizationNetworkCorrelationDtoSchema
>;

export const defectLocalizationUiCorrelationDtoSchema = z.object({
  domSelector: z.string().nullable().optional(),
  uiComponentName: z.string().nullable().optional(),
  matchedComponentFile: z.string().nullable().optional(),
  matchedEventHandler: z.string().nullable().optional(),
});
export type DefectLocalizationUiCorrelationDto = z.infer<
  typeof defectLocalizationUiCorrelationDtoSchema
>;

export const defectLocalizationStackTraceDtoSchema = z.object({
  hasTrustedStack: z.boolean(),
  framesParsed: z.number(),
  topSourceFile: z.string().nullable().optional(),
  topLineNumber: z.number().nullable().optional(),
  topColumnNumber: z.number().nullable().optional(),
  topSymbolName: z.string().nullable().optional(),
});
export type DefectLocalizationStackTraceDto = z.infer<typeof defectLocalizationStackTraceDtoSchema>;

export const defectLocalizationSourceMapDtoSchema = z.object({
  sourceMapsAvailable: z.boolean(),
  resolvedFilesCount: z.number(),
  details: z.string(),
});
export type DefectLocalizationSourceMapDto = z.infer<typeof defectLocalizationSourceMapDtoSchema>;

export const defectLocalizationSymbolGraphDtoSchema = z.object({
  nodesExplored: z.number(),
  maxDepthReached: z.number(),
  relatedFiles: z.array(z.string()),
  relatedSymbols: z.array(z.string()),
});
export type DefectLocalizationSymbolGraphDto = z.infer<
  typeof defectLocalizationSymbolGraphDtoSchema
>;

export const repositoryDefectLocalizationDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  repositoryId: z.string().uuid().nullable().optional(),
  rootCauseAnalysisId: z.string().uuid().nullable().optional(),
  quickFixAssessmentId: z.string().uuid().nullable().optional(),

  repositoryRevision: z.string(),
  failureTimeRevision: z.string().nullable().optional(),
  branchName: z.string().nullable().optional(),
  revisionState: repositoryRevisionStateSchema,
  isDrifted: z.boolean(),
  driftDetails: z.string().nullable().optional(),

  topCandidateFilePath: z.string().nullable().optional(),
  topCandidateSymbolName: z.string().nullable().optional(),
  topCandidateScore: z.number().nullable().optional(),
  topCandidateType: defectCandidateTypeSchema.nullable().optional(),

  candidateFiles: z.array(z.string()),
  rankedCandidates: z.array(rankedDefectCandidateDtoSchema),
  supportingEvidence: z.array(candidateEvidenceItemSchema),
  contradictingEvidence: z.array(candidateEvidenceItemSchema),
  traceability: defectLocalizationTraceabilityDtoSchema,
  networkCorrelation: defectLocalizationNetworkCorrelationDtoSchema,
  uiCorrelation: defectLocalizationUiCorrelationDtoSchema,
  stackTrace: defectLocalizationStackTraceDtoSchema,
  sourceMap: defectLocalizationSourceMapDtoSchema,
  symbolGraph: defectLocalizationSymbolGraphDtoSchema,

  isAuthoritative: z.boolean(),
  localizationVersion: z.number().int(),
  relocalizationReason: z.string().nullable().optional(),
  supersededById: z.string().uuid().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  metadataJson: z.any().optional(),

  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type RepositoryDefectLocalizationDto = z.infer<typeof repositoryDefectLocalizationDtoSchema>;

export const localizeDefectInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  actor: z.string().optional().default('SYSTEM'),
  forceRelocalize: z.boolean().optional().default(false),
  relocalizationReason: z.string().optional(),
});
export type LocalizeDefectInputDto = z.input<typeof localizeDefectInputSchema>;

export const getDefectLocalizationInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  localizationId: z.string().uuid().optional(),
});
export type GetDefectLocalizationInputDto = z.input<typeof getDefectLocalizationInputSchema>;

export const listDefectLocalizationsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListDefectLocalizationsInputDto = z.input<typeof listDefectLocalizationsInputSchema>;

export const inspectCandidateSourceInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  filePath: z.string().min(1),
  startLine: z.number().int().optional(),
  endLine: z.number().int().optional(),
});
export type InspectCandidateSourceInputDto = z.input<typeof inspectCandidateSourceInputSchema>;

export const candidateSourceContentDtoSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  totalLines: z.number().int(),
  startLine: z.number().int(),
  endLine: z.number().int(),
  highlightStartLine: z.number().int().nullable().optional(),
  highlightEndLine: z.number().int().nullable().optional(),
  isTruncated: z.boolean(),
  isReadOnly: z.literal(true),
});
export type CandidateSourceContentDto = z.infer<typeof candidateSourceContentDtoSchema>;

// -----------------------------------------------------------------------------
// V7 Phase 101 — Limited AI Patch Generation Contracts & Schemas
// -----------------------------------------------------------------------------

export const patchProposalStatusSchema = z.enum([
  'PROPOSED',
  'SUPERSEDED',
  'REJECTED',
  'WITHDRAWN',
]);
export type PatchProposalStatusDto = z.infer<typeof patchProposalStatusSchema>;

export const patchRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type PatchRiskLevelDto = z.infer<typeof patchRiskLevelSchema>;

export const structuredEditOperationSchema = z.object({
  filePath: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  originalContent: z.string(),
  replacementContent: z.string(),
  explanation: z.string().optional(),
});
export type StructuredEditOperationDto = z.infer<typeof structuredEditOperationSchema>;

export const patchTestReferenceDtoSchema = z.object({
  testCaseId: z.string().uuid().nullable().optional(),
  testCaseKey: z.string().nullable().optional(),
  testTitle: z.string(),
  relevance: z.string(),
  failedAssertion: z.string().nullable().optional(),
});
export type PatchTestReferenceDto = z.infer<typeof patchTestReferenceDtoSchema>;

export const defectPatchProposalDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  repositoryId: z.string().uuid().nullable().optional(),
  quickFixAssessmentId: z.string().uuid().nullable().optional(),
  defectLocalizationId: z.string().uuid().nullable().optional(),
  rootCauseAnalysisId: z.string().uuid().nullable().optional(),

  repositoryRevision: z.string(),
  branchName: z.string().nullable().optional(),
  sourceFileSha256: z.string().nullable().optional(),
  isDrifted: z.boolean(),
  driftDetails: z.string().nullable().optional(),

  status: patchProposalStatusSchema,
  riskLevel: patchRiskLevelSchema,
  proposalVersion: z.number().int().positive(),
  supersededById: z.string().uuid().nullable().optional(),
  generationModel: z.string(),
  generationPromptTokens: z.number().int().nullable().optional(),
  generationCompletionTokens: z.number().int().nullable().optional(),
  generationDurationMs: z.number().int().nullable().optional(),

  targetFiles: z.array(z.string()),
  linesAdded: z.number().int(),
  linesRemoved: z.number().int(),
  totalChangedLines: z.number().int(),

  unifiedDiff: z.string(),
  structuredEdits: z.array(structuredEditOperationSchema),

  rationale: z.string(),
  assumptions: z.array(z.string()),
  uncertainties: z.array(z.string()),
  riskFactors: z.array(z.string()),
  evidenceReferences: z.array(z.string()),
  testReferences: z.array(patchTestReferenceDtoSchema),
  traceabilityJson: z.any().optional(),
  metadataJson: z.any().optional(),

  isReadOnlyProposal: z.literal(true),

  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type DefectPatchProposalDto = z.infer<typeof defectPatchProposalDtoSchema>;

export const generatePatchProposalInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  quickFixAssessmentId: z.string().uuid().optional(),
  defectLocalizationId: z.string().uuid().optional(),
  actor: z.string().optional().default('SYSTEM'),
  userGuidance: z.string().max(2000).optional(),
  forceRegenerate: z.boolean().optional().default(false),
});
export type GeneratePatchProposalInputDto = z.input<typeof generatePatchProposalInputSchema>;

export const getPatchProposalInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  proposalId: z.string().uuid().optional(),
});
export type GetPatchProposalInputDto = z.input<typeof getPatchProposalInputSchema>;

export const listPatchProposalsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
});
export type ListPatchProposalsInputDto = z.input<typeof listPatchProposalsInputSchema>;

export const withdrawPatchProposalInputSchema = z.object({
  projectId: z.string().uuid(),
  proposalId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
  actor: z.string().optional().default('USER'),
});
export type WithdrawPatchProposalInputDto = z.input<typeof withdrawPatchProposalInputSchema>;

// ------------------------------------------------------------------------------
// Phase 102: Secure Patch Sandbox & Change Isolation
// ------------------------------------------------------------------------------

export const patchSandboxStatusSchema = z.enum([
  'CREATING',
  'READY',
  'PATCH_APPLYING',
  'PATCH_APPLIED',
  'PATCH_REJECTED',
  'FAILED',
  'DESTROYING',
  'DESTROYED',
  'EXPIRED',
]);
export type PatchSandboxStatusDto = z.infer<typeof patchSandboxStatusSchema>;

export const patchSandboxSecurityChecksDtoSchema = z.object({
  pathContainmentPassed: z.boolean(),
  symlinkEscapePassed: z.boolean(),
  allowedFileScopePassed: z.boolean(),
  sensitiveFilesProtected: z.boolean(),
  gitMetadataProtected: z.boolean(),
  arbitraryShellExecutionBlocked: z.boolean(),
  binaryFilesBlocked: z.boolean(),
  hardlinkIsolated: z.boolean(),
  checkedAt: z.string().or(z.date()),
});
export type PatchSandboxSecurityChecksDto = z.infer<typeof patchSandboxSecurityChecksDtoSchema>;

export const defectPatchSandboxDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  patchProposalId: z.string().uuid(),

  sandboxStatus: patchSandboxStatusSchema,

  sourceRevision: z.string(),
  sandboxRevision: z.string().nullable().optional(),
  branchName: z.string().nullable().optional(),
  // Sanitized / safe location representation - strictly NO unredacted raw paths
  sanitizedSandboxLocation: z.string(),
  isolationStrategy: z.string(),
  isolationVersion: z.number().int(),

  originalRepoHeadCommit: z.string(),
  originalRepoClean: z.boolean(),
  originalRepoIntegrityVerified: z.boolean(),
  originalRepoModifiedCount: z.number().int(),

  appliedPatchProposalVersion: z.number().int().nullable().optional(),
  patchApplied: z.boolean(),
  patchAppliedAt: z.string().or(z.date()).nullable().optional(),

  claimedFilesCount: z.number().int(),
  claimedLinesAdded: z.number().int(),
  claimedLinesRemoved: z.number().int(),

  actualFilesModified: z.array(z.string()),
  actualFilesCreated: z.array(z.string()),
  actualFilesDeleted: z.array(z.string()),
  actualFilesRenamed: z.array(z.string()),
  actualLinesAdded: z.number().int(),
  actualLinesRemoved: z.number().int(),
  actualTotalChangedLines: z.number().int(),

  actualUnifiedDiff: z.string().nullable().optional(),
  changeSetHash: z.string().nullable().optional(),
  claimedVsActualDiffMatch: z.boolean().nullable().optional(),

  fileHashesBefore: z.record(z.string()).optional(),
  fileHashesAfter: z.record(z.string()).optional(),
  securityChecks: patchSandboxSecurityChecksDtoSchema.optional(),

  failureReason: z.string().nullable().optional(),
  expiresAt: z.string().or(z.date()).nullable().optional(),
  destroyedAt: z.string().or(z.date()).nullable().optional(),

  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type DefectPatchSandboxDto = z.infer<typeof defectPatchSandboxDtoSchema>;

export const createPatchSandboxInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  patchProposalId: z.string().uuid(),
  actor: z.string().optional().default('SYSTEM'),
});
export type CreatePatchSandboxInputDto = z.input<typeof createPatchSandboxInputSchema>;

export const applyPatchToSandboxInputSchema = z.object({
  projectId: z.string().uuid(),
  sandboxId: z.string().uuid(),
  actor: z.string().optional().default('SYSTEM'),
});
export type ApplyPatchToSandboxInputDto = z.input<typeof applyPatchToSandboxInputSchema>;

export const getPatchSandboxInputSchema = z.object({
  projectId: z.string().uuid(),
  sandboxId: z.string().uuid().optional(),
  failureCaseId: z.string().uuid().optional(),
  patchProposalId: z.string().uuid().optional(),
});
export type GetPatchSandboxInputDto = z.input<typeof getPatchSandboxInputSchema>;

export const listPatchSandboxesInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid().optional(),
  patchProposalId: z.string().uuid().optional(),
});
export type ListPatchSandboxesInputDto = z.input<typeof listPatchSandboxesInputSchema>;

export const destroyPatchSandboxInputSchema = z.object({
  projectId: z.string().uuid(),
  sandboxId: z.string().uuid(),
  actor: z.string().optional().default('USER'),
  reason: z.string().max(500).optional(),
});
export type DestroyPatchSandboxInputDto = z.input<typeof destroyPatchSandboxInputSchema>;

// ------------------------------------------------------------------------------
// Phase 103: Patch Validation & Before/After Testing
// ------------------------------------------------------------------------------

export const patchValidationOutcomeSchema = z.enum([
  'VALID',
  'INVALID',
  'INCONCLUSIVE',
  'BLOCKED',
  'CANCELLED',
  'EXECUTION_ERROR',
]);
export type PatchValidationOutcomeDto = z.infer<typeof patchValidationOutcomeSchema>;

export const patchValidationStatusSchema = z.enum([
  'PENDING',
  'RUNNING_BEFORE',
  'APPLYING_PATCH',
  'RUNNING_AFTER',
  'RUNNING_REGRESSION',
  'RUNNING_QUALITY_GATES',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type PatchValidationStatusDto = z.infer<typeof patchValidationStatusSchema>;

export const validationExecutionEvidenceDtoSchema = z.object({
  status: z.string(),
  failedStepIndex: z.number().nullable().optional(),
  failedStepAction: z.string().nullable().optional(),
  expectedResult: z.string().nullable().optional(),
  actualResult: z.string().nullable().optional(),
  failureSignature: z.string().nullable().optional(),
  screenshotPath: z.string().nullable().optional(),
  consoleLogs: z.array(z.string()).optional().default([]),
  networkCalls: z.array(z.record(z.unknown())).optional().default([]),
  domSnapshot: z.string().nullable().optional(),
  tracePath: z.string().nullable().optional(),
  durationMs: z.number().optional(),
  executedAt: z.string().or(z.date()).optional(),
});
export type ValidationExecutionEvidenceDto = z.infer<typeof validationExecutionEvidenceDtoSchema>;

export const regressionTestResultDtoSchema = z.object({
  testCaseId: z.string(),
  testCaseKey: z.string(),
  testCaseTitle: z.string(),
  type: z.string().optional(),
  beforeStatus: z.string().optional().default('UNKNOWN'),
  afterStatus: z.string(),
  isNewRegression: z.boolean(),
  failureSignature: z.string().nullable().optional(),
  durationMs: z.number().optional(),
});
export type RegressionTestResultDto = z.infer<typeof regressionTestResultDtoSchema>;

export const qualityGateResultDtoSchema = z.object({
  checkType: z.enum(['TYPECHECK', 'LINT', 'FORMAT', 'BUILD']),
  status: z.enum(['PASS', 'FAIL', 'SKIPPED', 'NOT_CONFIGURED']),
  passed: z.boolean(),
  outputSnippet: z.string().nullable().optional(),
  durationMs: z.number().optional(),
});
export type QualityGateResultDto = z.infer<typeof qualityGateResultDtoSchema>;

export const defectPatchValidationDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  patchProposalId: z.string().uuid(),
  sandboxId: z.string().uuid(),
  repositoryId: z.string().uuid().nullable().optional(),
  testCaseId: z.string().uuid(),
  testCaseVersionId: z.string().uuid().nullable().optional(),
  testCaseVersionNumber: z.number().int(),
  requirementIds: z.array(z.string()),

  status: patchValidationStatusSchema,
  validationOutcome: patchValidationOutcomeSchema,
  validationReason: z.string().nullable().optional(),

  baseRevision: z.string(),
  patchHash: z.string(),
  originalRepoModifiedCount: z.number().int(),
  originalRepoClean: z.boolean(),

  targetFailureFixed: z.boolean(),
  beforeStatus: z.string(),
  afterStatus: z.string(),
  beforeFailureSignature: z.string().nullable().optional(),
  afterFailureSignature: z.string().nullable().optional(),
  beforeExpected: z.string().nullable().optional(),
  beforeActual: z.string().nullable().optional(),
  afterExpected: z.string().nullable().optional(),
  afterActual: z.string().nullable().optional(),
  sameTestCaseVerified: z.boolean(),
  sameTestVersionVerified: z.boolean(),

  regressionDetected: z.boolean(),
  targetedRegressionTotal: z.number().int(),
  targetedRegressionPassed: z.number().int(),
  targetedRegressionFailed: z.number().int(),
  newRegressionsCount: z.number().int(),
  newRegressions: z.array(regressionTestResultDtoSchema).optional().default([]),
  preExistingFailuresCount: z.number().int(),
  preExistingFailures: z.array(regressionTestResultDtoSchema).optional().default([]),

  unexpectedChangesDetected: z.boolean(),
  unexpectedFiles: z.array(z.string()).optional().default([]),
  typecheckStatus: z.string(),
  lintStatus: z.string(),
  formatStatus: z.string(),
  buildStatus: z.string(),
  qualityGates: z.array(qualityGateResultDtoSchema).optional().default([]),

  beforeExecutionIds: z.array(z.string()),
  afterExecutionIds: z.array(z.string()),
  beforeEvidence: validationExecutionEvidenceDtoSchema.nullable().optional(),
  afterEvidence: validationExecutionEvidenceDtoSchema.nullable().optional(),

  validatorVersion: z.string(),
  executedBy: z.string(),
  executionDurationMs: z.number().int().nullable().optional(),
  startedAt: z.string().or(z.date()).nullable().optional(),
  completedAt: z.string().or(z.date()).nullable().optional(),

  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type DefectPatchValidationDto = z.infer<typeof defectPatchValidationDtoSchema>;

export const executePatchValidationInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  patchProposalId: z.string().uuid(),
  sandboxId: z.string().uuid().optional(),
  testCaseId: z.string().uuid().optional(),
  testCaseVersionNumber: z.number().int().optional(),
  timeoutMs: z.number().int().positive().optional().default(60000),
  actor: z.string().optional().default('USER'),
  skipQualityGates: z.boolean().optional().default(false),
});
export type ExecutePatchValidationInputDto = z.input<typeof executePatchValidationInputSchema>;

export const getPatchValidationInputSchema = z.object({
  projectId: z.string().uuid(),
  validationId: z.string().uuid().optional(),
  failureCaseId: z.string().uuid().optional(),
  patchProposalId: z.string().uuid().optional(),
});
export type GetPatchValidationInputDto = z.input<typeof getPatchValidationInputSchema>;

export const listPatchValidationsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid().optional(),
  patchProposalId: z.string().uuid().optional(),
  sandboxId: z.string().uuid().optional(),
});
export type ListPatchValidationsInputDto = z.input<typeof listPatchValidationsInputSchema>;

export const cancelPatchValidationInputSchema = z.object({
  projectId: z.string().uuid(),
  validationId: z.string().uuid(),
  actor: z.string().optional().default('USER'),
  reason: z.string().max(500).optional(),
});
export type CancelPatchValidationInputDto = z.input<typeof cancelPatchValidationInputSchema>;

// ==============================================================================
// V7 Phase 104 — Human Approval, Reject & Apply Workflow
// ==============================================================================

export const patchApprovalStatusSchema = z.enum([
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'APPLYING',
  'APPLIED',
  'APPLY_FAILED',
  'SUPERSEDED',
  'ROLLED_BACK',
]);
export type PatchApprovalStatusDto = z.infer<typeof patchApprovalStatusSchema>;

export const patchRejectionReasonSchema = z.enum([
  'INCORRECT_FIX',
  'TOO_RISKY',
  'WRONG_ROOT_CAUSE',
  'UNNECESSARY_CHANGE',
  'NEEDS_MANUAL_REPAIR',
  'ARCHITECTURE_CONCERN',
  'OTHER',
]);
export type PatchRejectionReasonDto = z.infer<typeof patchRejectionReasonSchema>;

export const patchApprovalAuditEntryDtoSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  timestamp: z.string(),
  actor: z.string(),
  details: z.record(z.unknown()).optional().default({}),
});
export type PatchApprovalAuditEntryDto = z.infer<typeof patchApprovalAuditEntryDtoSchema>;

export const defectPatchApprovalDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  patchProposalId: z.string().uuid(),
  validationId: z.string().uuid(),
  repositoryId: z.string().uuid().nullable().optional(),

  status: patchApprovalStatusSchema,

  reviewedPatchHash: z.string(),
  appliedPatchHash: z.string().nullable().optional(),
  baseRevision: z.string(),
  appliedRevision: z.string().nullable().optional(),

  reviewedBy: z.string().nullable().optional(),
  reviewedAt: z.string().or(z.date()).nullable().optional(),
  reviewComment: z.string().nullable().optional(),

  rejectionReason: patchRejectionReasonSchema.nullable().optional(),
  rejectionDetails: z.string().nullable().optional(),

  applyRequestedAt: z.string().or(z.date()).nullable().optional(),
  applyStartedAt: z.string().or(z.date()).nullable().optional(),
  appliedAt: z.string().or(z.date()).nullable().optional(),
  appliedBy: z.string().nullable().optional(),
  applyError: z.string().nullable().optional(),
  applyErrorCategory: z.string().nullable().optional(),

  affectedFiles: z.array(z.string()).default([]),
  filesModifiedCount: z.number().int().default(0),
  linesAdded: z.number().int().default(0),
  linesRemoved: z.number().int().default(0),
  appliedUnifiedDiff: z.string().nullable().optional(),

  auditTrail: z.array(patchApprovalAuditEntryDtoSchema).default([]),

  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type DefectPatchApprovalDto = z.infer<typeof defectPatchApprovalDtoSchema>;

export const getPatchApprovalInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid().optional(),
  failureCaseId: z.string().uuid().optional(),
  patchProposalId: z.string().uuid().optional(),
  validationId: z.string().uuid().optional(),
});
export type GetPatchApprovalInputDto = z.input<typeof getPatchApprovalInputSchema>;

export const listPatchApprovalsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid().optional(),
  patchProposalId: z.string().uuid().optional(),
  status: patchApprovalStatusSchema.optional(),
});
export type ListPatchApprovalsInputDto = z.input<typeof listPatchApprovalsInputSchema>;

export const approvePatchInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
  reviewedBy: z.string().min(1).max(128).optional().default('HUMAN_REVIEWER'),
  reviewComment: z.string().max(2000).optional(),
});
export type ApprovePatchInputDto = z.input<typeof approvePatchInputSchema>;

export const rejectPatchInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
  rejectionReason: patchRejectionReasonSchema,
  rejectionDetails: z.string().max(2000).optional(),
  reviewedBy: z.string().min(1).max(128).optional().default('HUMAN_REVIEWER'),
});
export type RejectPatchInputDto = z.input<typeof rejectPatchInputSchema>;

export const applyPatchInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
  appliedBy: z.string().min(1).max(128).optional().default('HUMAN_REVIEWER'),
  expectedBaseRevision: z.string().optional(),
});
export type ApplyPatchInputDto = z.input<typeof applyPatchInputSchema>;

// ==============================================================================
// V7 Phase 105 — Patch Rollback & Recovery
// ==============================================================================

export const patchRollbackStatusSchema = z.enum([
  'PENDING',
  'PLANNING',
  'RECOVERY_POINT_CREATED',
  'APPLYING',
  'COMPLETED',
  'FAILED',
  'CONFLICT_BLOCKED',
  'RECOVERY_REQUIRED',
]);
export type PatchRollbackStatusDto = z.infer<typeof patchRollbackStatusSchema>;

export const patchRollbackConflictTypeSchema = z.enum([
  'OVERLAPPING_USER_CHANGES',
  'SAME_FILE_CONFLICT',
  'FILE_DELETED',
  'FILE_MOVED',
  'NEWER_PATCH_CONFLICT',
  'DRIFT_DETECTED',
]);
export type PatchRollbackConflictTypeDto = z.infer<typeof patchRollbackConflictTypeSchema>;

export const rollbackConflictItemSchema = z.object({
  type: patchRollbackConflictTypeSchema,
  filePath: z.string(),
  startLine: z.number().int().optional(),
  endLine: z.number().int().optional(),
  details: z.string(),
  conflictingContent: z.string().optional(),
});
export type RollbackConflictItemDto = z.infer<typeof rollbackConflictItemSchema>;

export const rollbackAuditEntryDtoSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  timestamp: z.string(),
  actor: z.string(),
  details: z.record(z.unknown()).optional().default({}),
});
export type RollbackAuditEntryDto = z.infer<typeof rollbackAuditEntryDtoSchema>;

export const defectPatchRollbackDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  patchProposalId: z.string().uuid(),
  patchApprovalId: z.string().uuid(),
  repositoryId: z.string().uuid().nullable().optional(),

  rollbackRequestedBy: z.string(),
  rollbackReason: z.string().nullable().optional(),

  status: patchRollbackStatusSchema,

  conflictType: patchRollbackConflictTypeSchema.nullable().optional(),
  conflictDetails: z
    .array(rollbackConflictItemSchema)
    .or(z.record(z.unknown()))
    .nullable()
    .optional(),

  targetPrePatchHashes: z.record(z.string()).default({}),
  preRollbackHashes: z.record(z.string()).default({}),
  postRollbackHashes: z.record(z.string()).nullable().optional(),

  targetFiles: z.array(z.string()).default([]),
  restoredFiles: z.array(z.string()).default([]),
  preservedUnrelatedFiles: z.array(z.string()).default([]),

  recoveryPointId: z.string().nullable().optional(),
  recoveryPointSnapshot: z.record(z.unknown()).nullable().optional(),

  reverseDiff: z.string().nullable().optional(),
  structuredReverseEdits: z.array(z.record(z.unknown())).nullable().optional(),

  dryRunOnly: z.boolean().default(false),
  dryRunSuccess: z.boolean().nullable().optional(),
  dryRunConflicts: z.array(rollbackConflictItemSchema).nullable().optional(),

  integrityVerified: z.boolean().default(false),
  integrityDetails: z.record(z.unknown()).nullable().optional(),

  postRollbackTestRunId: z.string().uuid().nullable().optional(),
  postRollbackTestPassed: z.boolean().nullable().optional(),
  originalFailureReoccurred: z.boolean().nullable().optional(),

  auditTrail: z.array(rollbackAuditEntryDtoSchema).default([]),

  startedAt: z.string().or(z.date()).nullable().optional(),
  completedAt: z.string().or(z.date()).nullable().optional(),
  errorMessage: z.string().nullable().optional(),

  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type DefectPatchRollbackDto = z.infer<typeof defectPatchRollbackDtoSchema>;

export const planPatchRollbackInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
  actor: z.string().optional().default('HUMAN_OPERATOR'),
});
export type PlanPatchRollbackInputDto = z.input<typeof planPatchRollbackInputSchema>;

export const patchRollbackPlanResultDtoSchema = z.object({
  approvalId: z.string().uuid(),
  canRollback: z.boolean(),
  conflicts: z.array(rollbackConflictItemSchema).default([]),
  targetFiles: z.array(z.string()).default([]),
  reverseDiff: z.string().nullable().optional(),
  structuredReverseEdits: z.array(z.record(z.unknown())).default([]),
  preRollbackHashes: z.record(z.string()).default({}),
  expectedPostRollbackHashes: z.record(z.string()).default({}),
  preservedFiles: z.array(z.string()).default([]),
});
export type PatchRollbackPlanResultDto = z.infer<typeof patchRollbackPlanResultDtoSchema>;

export const executePatchRollbackInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
  rollbackRequestedBy: z.string().min(1).max(128).optional().default('HUMAN_OPERATOR'),
  rollbackReason: z.string().max(2000).optional(),
  dryRun: z.boolean().optional().default(false),
});
export type ExecutePatchRollbackInputDto = z.input<typeof executePatchRollbackInputSchema>;

export const getPatchRollbackInputSchema = z.object({
  projectId: z.string().uuid(),
  rollbackId: z.string().uuid().optional(),
  approvalId: z.string().uuid().optional(),
});
export type GetPatchRollbackInputDto = z.input<typeof getPatchRollbackInputSchema>;

export const listPatchRollbacksInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid().optional(),
  failureCaseId: z.string().uuid().optional(),
  status: patchRollbackStatusSchema.optional(),
});
export type ListPatchRollbacksInputDto = z.input<typeof listPatchRollbacksInputSchema>;

export const resumePatchRollbackRecoveryInputSchema = z.object({
  projectId: z.string().uuid(),
  rollbackId: z.string().uuid(),
  actor: z.string().min(1).max(128).optional().default('HUMAN_OPERATOR'),
});
export type ResumePatchRollbackRecoveryInputDto = z.input<
  typeof resumePatchRollbackRecoveryInputSchema
>;

// -----------------------------------------------------------------------------
// V7 Phase 106 — Requirement Change-Impact & Intelligent Retest Selection
// -----------------------------------------------------------------------------

export const changeSourceTypeSchema = z.enum([
  'REQUIREMENT_CHANGE',
  'SOURCE_CODE_CHANGE',
  'APPROVED_PATCH',
  'MANUAL_FILE_CHANGE',
  'COMMIT_DIFF',
  'BRANCH_DIFF',
  'CONFIGURATION_CHANGE',
  'API_CONTRACT_CHANGE',
]);
export type ChangeSourceType = z.infer<typeof changeSourceTypeSchema>;

export const testSelectionStateSchema = z.enum([
  'MANDATORY',
  'RECOMMENDED',
  'OPTIONAL',
  'NOT_IMPACTED',
  'UNKNOWN',
  'EXCLUDED',
]);
export type TestSelectionState = z.infer<typeof testSelectionStateSchema>;

export const impactCategorySchema = z.enum(['DIRECT', 'INDIRECT', 'TRANSITIVE', 'UNKNOWN']);
export type ImpactCategory = z.infer<typeof impactCategorySchema>;

export const impactConfidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']);
export type ImpactConfidence = z.infer<typeof impactConfidenceSchema>;

export const retestPlanStatusSchema = z.enum(['DRAFT', 'ANALYZING', 'COMPLETED', 'FAILED']);
export type RetestPlanStatus = z.infer<typeof retestPlanStatusSchema>;

export const changeSnapshotDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceType: changeSourceTypeSchema,
  sourceEntityId: z.string().nullable().optional(),
  baseRevision: z.string().nullable().optional(),
  targetRevision: z.string().nullable().optional(),
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  changedFiles: z.array(z.string()).default([]),
  changedSymbolsJson: z.array(z.record(z.unknown())).default([]),
  changedRequirements: z.array(z.string()).default([]),
  changedApisJson: z.array(z.record(z.unknown())).default([]),
  changedConfiguration: z.record(z.unknown()).default({}),
  diffText: z.string().nullable().optional(),
  metadataJson: z.record(z.unknown()).default({}),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type ChangeSnapshotDto = z.infer<typeof changeSnapshotDtoSchema>;

export const createChangeSnapshotInputSchema = z.object({
  projectId: z.string().uuid(),
  sourceType: changeSourceTypeSchema,
  sourceEntityId: z.string().optional(),
  baseRevision: z.string().optional(),
  targetRevision: z.string().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  changedFiles: z.array(z.string()).optional(),
  changedSymbolsJson: z.array(z.record(z.unknown())).optional(),
  changedRequirements: z.array(z.string()).optional(),
  changedApisJson: z.array(z.record(z.unknown())).optional(),
  changedConfiguration: z.record(z.unknown()).optional(),
  diffText: z.string().optional(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type CreateChangeSnapshotInputDto = z.input<typeof createChangeSnapshotInputSchema>;

export const retestImpactNodeDtoSchema = z.object({
  id: z.string(),
  type: z.enum([
    'Requirement',
    'RequirementVersion',
    'SourceFile',
    'Symbol',
    'API',
    'DatabaseModel',
    'Component',
    'TestCase',
    'TestCaseVersion',
    'ExecutableTestPlan',
  ]),
  label: z.string(),
  entityId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type RetestImpactNodeDto = z.infer<typeof retestImpactNodeDtoSchema>;

export const retestImpactEdgeDtoSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum([
    'IMPLEMENTS',
    'DEPENDS_ON',
    'VALIDATES',
    'TESTS',
    'CALLS',
    'IMPORTS',
    'READS',
    'WRITES',
    'TRACES_TO',
    'AFFECTS',
  ]),
  label: z.string().optional(),
});
export type RetestImpactEdgeDto = z.infer<typeof retestImpactEdgeDtoSchema>;

export const retestImpactGraphDtoSchema = z.object({
  nodes: z.array(retestImpactNodeDtoSchema).default([]),
  edges: z.array(retestImpactEdgeDtoSchema).default([]),
});
export type RetestImpactGraphDto = z.infer<typeof retestImpactGraphDtoSchema>;

export const retestSelectedTestDtoSchema = z.object({
  testCaseId: z.string().uuid(),
  testCaseKey: z.string(),
  testCaseTitle: z.string(),
  testCaseVersionId: z.string().uuid().nullable().optional(),
  testCaseVersionNumber: z.number().int().optional(),
  selectionState: testSelectionStateSchema,
  impactCategory: impactCategorySchema,
  confidence: impactConfidenceSchema,
  selectionReason: z.string(),
  dependencyPath: z.array(z.string()).default([]),
  riskSignals: z.array(z.string()).default([]),
  evidenceReferences: z.array(z.string()).default([]),
  historicalFailureSignal: z.boolean().default(false),
  isExecutable: z.boolean().default(true),
});
export type RetestSelectedTestDto = z.infer<typeof retestSelectedTestDtoSchema>;

export const retestPlanDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  changeSnapshotId: z.string().uuid(),
  status: retestPlanStatusSchema,
  baseRevision: z.string().nullable().optional(),
  targetRevision: z.string().nullable().optional(),
  selectionPolicyVersion: z.string(),
  riskPolicyVersion: z.string(),
  impactEngineVersion: z.string(),
  fullRegressionRequired: z.boolean(),
  fullRegressionReason: z.string().nullable().optional(),
  totalTestsCount: z.number().int(),
  mandatoryCount: z.number().int(),
  recommendedCount: z.number().int(),
  optionalCount: z.number().int(),
  unknownCount: z.number().int(),
  excludedCount: z.number().int(),
  impactGraph: retestImpactGraphDtoSchema,
  selectedTests: z.array(retestSelectedTestDtoSchema).default([]),
  changeSnapshot: changeSnapshotDtoSchema.optional(),
  auditTrail: z.array(z.record(z.unknown())).default([]),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type RetestPlanDto = z.infer<typeof retestPlanDtoSchema>;

export const planRetestInputSchema = z.object({
  projectId: z.string().uuid(),
  changeSnapshotId: z.string().uuid().optional(),
  snapshotInput: createChangeSnapshotInputSchema.optional(),
  forceFullRegression: z.boolean().optional().default(false),
  conservativeSafetyPolicy: z.boolean().optional().default(true),
  actor: z.string().min(1).max(128).optional().default('HUMAN_OPERATOR'),
});
export type PlanRetestInputDto = z.input<typeof planRetestInputSchema>;

export const getRetestPlanInputSchema = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
});
export type GetRetestPlanInputDto = z.input<typeof getRetestPlanInputSchema>;

export const listRetestPlansInputSchema = z.object({
  projectId: z.string().uuid(),
  changeSnapshotId: z.string().uuid().optional(),
  status: retestPlanStatusSchema.optional(),
});
export type ListRetestPlansInputDto = z.input<typeof listRetestPlansInputSchema>;

export const explainTestSelectionInputSchema = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
  testCaseId: z.string().uuid(),
});
export type ExplainTestSelectionInputDto = z.input<typeof explainTestSelectionInputSchema>;

export const explainTestSelectionResultDtoSchema = z.object({
  testCaseId: z.string().uuid(),
  testCaseKey: z.string(),
  testCaseTitle: z.string(),
  selectionState: testSelectionStateSchema,
  impactCategory: impactCategorySchema,
  confidence: impactConfidenceSchema,
  selectionReason: z.string(),
  dependencyPath: z.array(z.string()),
  riskSignals: z.array(z.string()),
  evidenceReferences: z.array(z.string()),
  historicalFailureSignal: z.boolean(),
  changedRequirement: z.string().nullable().optional(),
  affectedCodeOrApi: z.string().nullable().optional(),
  tracePath: z.array(z.string()).default([]),
});
export type ExplainTestSelectionResultDto = z.infer<typeof explainTestSelectionResultDtoSchema>;

// -----------------------------------------------------------------------------
// V7 Phase 107 — Post-Fix Jira & Notification Updates Schemas & DTOs
// -----------------------------------------------------------------------------

export const postFixSyncOutcomeSchema = z.enum([
  'VERIFIED_FIXED',
  'STILL_FAILING',
  'REGRESSION_DETECTED',
  'BLOCKED',
  'INCONCLUSIVE',
  'ROLLED_BACK',
  'CANCELLED',
]);
export type PostFixSyncOutcome = z.infer<typeof postFixSyncOutcomeSchema>;

export const postFixSyncStatusSchema = z.enum(['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'SKIPPED']);
export type PostFixSyncStatus = z.infer<typeof postFixSyncStatusSchema>;

export const postFixJiraUpdateStatusSchema = z.enum([
  'COMMENT_POSTED',
  'TRANSITIONED',
  'TRANSITION_UNAVAILABLE',
  'FAILED',
  'SKIPPED',
]);
export type PostFixJiraUpdateStatus = z.infer<typeof postFixJiraUpdateStatusSchema>;

export const postFixNotificationDeliveryStatusSchema = z.enum([
  'SENT',
  'FAILED',
  'SKIPPED',
  'SUPPRESSED',
]);
export type PostFixNotificationDeliveryStatus = z.infer<
  typeof postFixNotificationDeliveryStatusSchema
>;

export const postFixSyncAuditDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  syncRecordId: z.string().uuid(),
  action: z.string(),
  status: postFixSyncStatusSchema,
  actor: z.string(),
  detailsJson: z.record(z.unknown()).default({}),
  createdAt: z.string().or(z.date()),
});
export type PostFixSyncAuditDto = z.infer<typeof postFixSyncAuditDtoSchema>;

export const postFixSyncRecordDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reverificationId: z.string().uuid(),
  jiraIssueLinkId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string(),
  outcome: postFixSyncOutcomeSchema,
  overallStatus: postFixSyncStatusSchema,
  jiraIssueKey: z.string().nullable().optional(),
  jiraCommentStatus: postFixJiraUpdateStatusSchema,
  jiraCommentId: z.string().nullable().optional(),
  jiraTransitionStatus: postFixJiraUpdateStatusSchema,
  jiraFromStatus: z.string().nullable().optional(),
  jiraToStatus: z.string().nullable().optional(),
  jiraTransitionId: z.string().nullable().optional(),
  jiraError: z.string().nullable().optional(),
  notificationStatus: postFixNotificationDeliveryStatusSchema,
  notificationRecipient: z.string().nullable().optional(),
  notificationSubject: z.string().nullable().optional(),
  notificationError: z.string().nullable().optional(),
  evidenceCount: z.number().int(),
  evidenceReferencesJson: z.array(z.record(z.unknown())).default([]),
  retryCount: z.number().int(),
  actor: z.string(),
  customNote: z.string().nullable().optional(),
  detailsJson: z.record(z.unknown()).default({}),
  requestedAt: z.string().or(z.date()),
  completedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  audits: z.array(postFixSyncAuditDtoSchema).optional().default([]),
});
export type PostFixSyncRecordDto = z.infer<typeof postFixSyncRecordDtoSchema>;

export const executePostFixSyncInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  reverificationId: z.string().uuid(),
  notifyAssignee: z.boolean().optional().default(true),
  forceTransition: z.boolean().optional().default(false),
  customNote: z.string().max(1000).optional(),
  actor: z.string().min(1).max(128).optional().default('HUMAN_OPERATOR'),
});
export type ExecutePostFixSyncInputDto = z.input<typeof executePostFixSyncInputSchema>;

export const retryPostFixSyncInputSchema = z.object({
  projectId: z.string().uuid(),
  syncRecordId: z.string().uuid(),
  actor: z.string().min(1).max(128).optional().default('HUMAN_OPERATOR'),
});
export type RetryPostFixSyncInputDto = z.input<typeof retryPostFixSyncInputSchema>;

export const getPostFixSyncStatusInputSchema = z.object({
  projectId: z.string().uuid(),
  syncRecordId: z.string().uuid(),
});
export type GetPostFixSyncStatusInputDto = z.input<typeof getPostFixSyncStatusInputSchema>;

export const listPostFixSyncHistoryInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});
export type ListPostFixSyncHistoryInputDto = z.input<typeof listPostFixSyncHistoryInputSchema>;

// ------------------------------------------------------------------------------
// Phase 108 — Complete Repair & Reverification Audit Trail
// ------------------------------------------------------------------------------

export const repairAuditActorTypeSchema = z.enum([
  'USER',
  'AI',
  'SYSTEM',
  'TEST_ENGINE',
  'JIRA_INTEGRATION',
  'NOTIFICATION_SERVICE',
  'REPAIR_ENGINE',
]);
export type RepairAuditActorType = z.infer<typeof repairAuditActorTypeSchema>;

export const repairAuditEventTypeSchema = z.enum([
  'FAILURE_CREATED',
  'BUG_REPORT_CREATED',
  'JIRA_ISSUE_CREATED',
  'JIRA_ISSUE_LINKED',
  'ENGINEER_ASSIGNED',
  'REVERIFICATION_STARTED',
  'REVERIFICATION_COMPLETED',
  'QUICK_FIX_EVALUATED',
  'QUICK_FIX_APPROVED_FOR_GENERATION',
  'DEFECT_LOCALIZED',
  'PATCH_PROPOSED',
  'PATCH_VALIDATION_STARTED',
  'PATCH_VALIDATION_COMPLETED',
  'PATCH_REJECTED',
  'PATCH_APPROVED',
  'PATCH_APPLIED',
  'PATCH_APPLY_FAILED',
  'RETEST_STARTED',
  'RETEST_COMPLETED',
  'ROLLBACK_STARTED',
  'ROLLBACK_COMPLETED',
  'CHANGE_IMPACT_ANALYZED',
  'REGRESSION_SELECTION_CREATED',
  'POST_FIX_STATUS_UPDATED',
  'NOTIFICATION_SENT',
  'REPAIR_SESSION_COMPLETED',
]);
export type RepairAuditEventType = z.infer<typeof repairAuditEventTypeSchema>;

export const repairSessionStatusSchema = z.enum([
  'ACTIVE',
  'PATCH_APPROVED',
  'PATCH_APPLIED',
  'VERIFIED',
  'REVERTED',
  'FAILED',
  'CANCELLED',
  'COMPLETED',
]);
export type RepairSessionStatus = z.infer<typeof repairSessionStatusSchema>;

export const repairAuditEventDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  repairSessionId: z.string().uuid().nullable().optional(),
  sequenceNumber: z.number().int().min(0),
  eventType: repairAuditEventTypeSchema,
  actorType: repairAuditActorTypeSchema,
  actorId: z.string().min(1).max(128),
  sourceComponent: z.string().min(1).max(64),
  timestamp: z.string(),
  previousState: z.string().nullable().optional(),
  newState: z.string().nullable().optional(),
  evidenceReferences: z.array(z.record(z.any())).optional().default([]),
  repositoryState: z.record(z.any()).optional().default({}),
  testRunReferences: z.array(z.record(z.any())).optional().default([]),
  jiraReference: z.record(z.any()).optional().default({}),
  notificationReference: z.record(z.any()).optional().default({}),
  reason: z.string().nullable().optional(),
  correlationId: z.string().min(1).max(128),
  causationId: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1).max(128),
  schemaVersion: z.string().optional().default('1.0.0'),
  metadata: z.record(z.any()).optional().default({}),
  createdAt: z.string(),
});
export type RepairAuditEventDto = z.infer<typeof repairAuditEventDtoSchema>;

export const repairSessionDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  sessionKey: z.string().min(1).max(64),
  status: repairSessionStatusSchema,
  totalEventsCount: z.number().int().min(0),
  startedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  metadata: z.record(z.any()).optional().default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
  events: z.array(repairAuditEventDtoSchema).optional().default([]),
});
export type RepairSessionDto = z.infer<typeof repairSessionDtoSchema>;

export const repairAuditTimelineDtoSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  session: repairSessionDtoSchema.nullable().optional(),
  totalEvents: z.number().int().min(0),
  events: z.array(repairAuditEventDtoSchema),
  generatedAt: z.string(),
});
export type RepairAuditTimelineDto = z.infer<typeof repairAuditTimelineDtoSchema>;

export const getRepairTimelineInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  eventTypeFilter: z.array(repairAuditEventTypeSchema).optional(),
  actorTypeFilter: z.array(repairAuditActorTypeSchema).optional(),
  limit: z.number().int().min(1).max(500).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
});
export type GetRepairTimelineInputDto = z.input<typeof getRepairTimelineInputSchema>;

export const getRepairSessionInputSchema = z.object({
  projectId: z.string().uuid(),
  sessionIdOrKey: z.string().min(1).max(128),
});
export type GetRepairSessionInputDto = z.input<typeof getRepairSessionInputSchema>;

export const listRepairSessionsInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid().optional(),
  status: repairSessionStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});
export type ListRepairSessionsInputDto = z.input<typeof listRepairSessionsInputSchema>;

export const exportRepairTimelineInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  format: z.enum(['JSON', 'MARKDOWN']).optional().default('JSON'),
});
export type ExportRepairTimelineInputDto = z.input<typeof exportRepairTimelineInputSchema>;

export const exportRepairTimelineResultDtoSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  content: z.string(),
  eventCount: z.number(),
  checksumSha256: z.string(),
  exportedAt: z.string(),
});
export type ExportRepairTimelineResultDto = z.infer<typeof exportRepairTimelineResultDtoSchema>;

export const recordRepairAuditEventInputSchema = z.object({
  projectId: z.string().uuid(),
  failureCaseId: z.string().uuid(),
  repairSessionId: z.string().uuid().optional(),
  eventType: repairAuditEventTypeSchema,
  actorType: repairAuditActorTypeSchema,
  actorId: z.string().min(1).max(128),
  sourceComponent: z.string().min(1).max(64),
  previousState: z.string().max(64).optional(),
  newState: z.string().max(64).optional(),
  evidenceReferences: z.array(z.record(z.any())).optional(),
  repositoryState: z.record(z.any()).optional(),
  testRunReferences: z.array(z.record(z.any())).optional(),
  jiraReference: z.record(z.any()).optional(),
  notificationReference: z.record(z.any()).optional(),
  reason: z.string().max(2000).optional(),
  correlationId: z.string().min(1).max(128).optional(),
  causationId: z.string().max(128).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
  metadata: z.record(z.any()).optional(),
});
export type RecordRepairAuditEventInputDto = z.input<typeof recordRepairAuditEventInputSchema>;

// ==============================================================================
// Phase 109 — Final QA Report & Release Readiness Intelligence
// ==============================================================================

export const releaseReadinessVerdictSchema = z.enum([
  'READY',
  'READY_WITH_RISK',
  'NOT_READY',
  'BLOCKED',
  'UNKNOWN',
]);
export type ReleaseReadinessVerdictDto = z.infer<typeof releaseReadinessVerdictSchema>;

export const qaReportStatusSchema = z.enum(['DRAFT', 'FINAL', 'SUPERSEDED']);
export type QaReportStatusDto = z.infer<typeof qaReportStatusSchema>;

export const qaReportAuditActionSchema = z.enum([
  'REPORT_GENERATED',
  'REPORT_FINALIZED',
  'REPORT_SUPERSEDED',
  'POLICY_EVALUATED',
  'EXPORT_GENERATED',
]);
export type QaReportAuditActionDto = z.infer<typeof qaReportAuditActionSchema>;

export const qaReportRequirementSummaryDtoSchema = z.object({
  total: z.number().int().min(0),
  testable: z.number().int().min(0),
  covered: z.number().int().min(0),
  verified: z.number().int().min(0),
  uncovered: z.number().int().min(0),
  failing: z.number().int().min(0),
  blocked: z.number().int().min(0),
  coveragePercentage: z.number().min(0).max(100),
  verifiedPercentage: z.number().min(0).max(100),
});
export type QaReportRequirementSummaryDto = z.infer<typeof qaReportRequirementSummaryDtoSchema>;

export const qaReportTestExecutionSummaryDtoSchema = z.object({
  totalDistinctTests: z.number().int().min(0),
  totalExecutionAttempts: z.number().int().min(0),
  passedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  blockedCount: z.number().int().min(0),
  automationErrorCount: z.number().int().min(0),
  cancelledCount: z.number().int().min(0),
  passPercentage: z.number().min(0).max(100),
  retryCount: z.number().int().min(0),
  passedAfterRetryCount: z.number().int().min(0),
});
export type QaReportTestExecutionSummaryDto = z.infer<typeof qaReportTestExecutionSummaryDtoSchema>;

export const qaReportFailureDomainSummaryDtoSchema = z.object({
  totalFailures: z.number().int().min(0),
  applicationDefects: z.number().int().min(0),
  automationFailures: z.number().int().min(0),
  testDataFailures: z.number().int().min(0),
  environmentFailures: z.number().int().min(0),
  blockedFailures: z.number().int().min(0),
  inconclusiveFailures: z.number().int().min(0),
  unknownFailures: z.number().int().min(0),
});
export type QaReportFailureDomainSummaryDto = z.infer<typeof qaReportFailureDomainSummaryDtoSchema>;

export const qaReportDefectSummaryDtoSchema = z.object({
  totalDefects: z.number().int().min(0),
  openCritical: z.number().int().min(0),
  openHigh: z.number().int().min(0),
  openMedium: z.number().int().min(0),
  openLow: z.number().int().min(0),
  resolvedOrClosed: z.number().int().min(0),
  verifiedFixed: z.number().int().min(0),
  reverificationPending: z.number().int().min(0),
  reverificationFailed: z.number().int().min(0),
});
export type QaReportDefectSummaryDto = z.infer<typeof qaReportDefectSummaryDtoSchema>;

export const qaReportReverificationSummaryDtoSchema = z.object({
  totalReverifications: z.number().int().min(0),
  verifiedFixedCount: z.number().int().min(0),
  stillFailingCount: z.number().int().min(0),
  differentFailureCount: z.number().int().min(0),
  blockedCount: z.number().int().min(0),
  inconclusiveCount: z.number().int().min(0),
});
export type QaReportReverificationSummaryDto = z.infer<
  typeof qaReportReverificationSummaryDtoSchema
>;

export const qaReportRegressionSummaryDtoSchema = z.object({
  totalRetestPlans: z.number().int().min(0),
  totalRegressionTests: z.number().int().min(0),
  passedRegressionTests: z.number().int().min(0),
  failedRegressionTests: z.number().int().min(0),
  untestedRegressionTests: z.number().int().min(0),
  allMandatoryRegressionsPassed: z.boolean(),
});
export type QaReportRegressionSummaryDto = z.infer<typeof qaReportRegressionSummaryDtoSchema>;

export const qaReportFlakinessSummaryDtoSchema = z.object({
  flakyTestsDetected: z.number().int().min(0),
  flakyExecutionAttempts: z.number().int().min(0),
  flakinessRate: z.number().min(0).max(100),
});
export type QaReportFlakinessSummaryDto = z.infer<typeof qaReportFlakinessSummaryDtoSchema>;

export const qaReportHealthSummaryDtoSchema = z.object({
  status: z.enum(['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN']),
  issues: z.array(z.string()).default([]),
  details: z.record(z.any()).default({}),
});
export type QaReportHealthSummaryDto = z.infer<typeof qaReportHealthSummaryDtoSchema>;

export const releaseBlockerItemSchema = z.object({
  ruleCode: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  targetEntity: z.string().optional(),
  targetEntityId: z.string().optional(),
});
export type ReleaseBlockerItemDto = z.infer<typeof releaseBlockerItemSchema>;

export const residualRiskItemSchema = z.object({
  riskCode: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  mitigation: z.string().optional(),
});
export type ResidualRiskItemDto = z.infer<typeof residualRiskItemSchema>;

export const knownLimitationItemSchema = z.object({
  code: z.string(),
  description: z.string(),
  impact: z.string().optional(),
});
export type KnownLimitationItemDto = z.infer<typeof knownLimitationItemSchema>;

export const traceabilityMatrixItemSchema = z.object({
  requirementId: z.string(),
  requirementKey: z.string(),
  title: z.string(),
  priority: z.string(),
  status: z.string(),
  associatedTestCount: z.number().int().min(0),
  verified: z.boolean(),
  failingTests: z.array(z.string()).default([]),
});
export type TraceabilityMatrixItemDto = z.infer<typeof traceabilityMatrixItemSchema>;

export const evidenceReferenceItemSchema = z.object({
  type: z.string(),
  id: z.string(),
  title: z.string(),
  uri: z.string().optional(),
  details: z.record(z.any()).optional(),
});
export type EvidenceReferenceItemDto = z.infer<typeof evidenceReferenceItemSchema>;

export const finalQaReportDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  environmentId: z.string().uuid().nullable().optional(),
  reportKey: z.string(),
  releaseIdentifier: z.string(),
  buildIdentifier: z.string().nullable().optional(),
  commitSha: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  environmentName: z.string().nullable().optional(),
  reportVersion: z.number().int().min(1),
  status: qaReportStatusSchema,
  verdict: releaseReadinessVerdictSchema,
  policyVersion: z.string(),
  policyRulesEvaluated: z.array(z.any()).default([]),
  policyRulesPassed: z.array(z.string()).default([]),
  policyRulesFailed: z.array(z.string()).default([]),
  blockingRules: z.array(releaseBlockerItemSchema).default([]),
  warningRules: z.array(residualRiskItemSchema).default([]),
  readinessScore: z.number().nullable().optional(),
  readinessExplanation: z.string(),
  executiveSummary: z.string(),
  overallRecommendation: z.string(),
  requirementSummary: qaReportRequirementSummaryDtoSchema,
  testExecutionSummary: qaReportTestExecutionSummaryDtoSchema,
  failureDomainSummary: qaReportFailureDomainSummaryDtoSchema,
  defectSummary: qaReportDefectSummaryDtoSchema,
  reverificationSummary: qaReportReverificationSummaryDtoSchema,
  regressionSummary: qaReportRegressionSummaryDtoSchema,
  flakinessSummary: qaReportFlakinessSummaryDtoSchema,
  automationHealth: qaReportHealthSummaryDtoSchema,
  environmentHealth: qaReportHealthSummaryDtoSchema,
  testDataHealth: qaReportHealthSummaryDtoSchema,
  securityFindings: z.array(z.any()).default([]),
  releaseBlockers: z.array(releaseBlockerItemSchema).default([]),
  residualRisks: z.array(residualRiskItemSchema).default([]),
  knownLimitations: z.array(knownLimitationItemSchema).default([]),
  traceabilityMatrix: z.array(traceabilityMatrixItemSchema).default([]),
  evidenceReferences: z.array(evidenceReferenceItemSchema).default([]),
  sourceSnapshotTime: z.string(),
  finalizedAt: z.string().nullable().optional(),
  generatedByActorId: z.string(),
  isStale: z.boolean(),
  staleReason: z.string().nullable().optional(),
  checksumSha256: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FinalQaReportDto = z.infer<typeof finalQaReportDtoSchema>;

export const qaReportAuditEventDtoSchema = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid(),
  projectId: z.string().uuid(),
  action: qaReportAuditActionSchema,
  actorId: z.string(),
  details: z.record(z.any()).default({}),
  timestamp: z.string(),
});
export type QaReportAuditEventDto = z.infer<typeof qaReportAuditEventDtoSchema>;

export const generateQaReportInputSchema = z.object({
  projectId: z.string().uuid(),
  releaseIdentifier: z.string().min(1).max(128),
  environmentId: z.string().uuid().optional(),
  buildIdentifier: z.string().max(128).optional(),
  commitSha: z.string().max(64).optional(),
  branch: z.string().max(128).optional(),
  environmentName: z.string().max(80).optional(),
  policyVersion: z.string().max(32).optional(),
  actorId: z.string().max(128).optional().default('SYSTEM'),
});
export type GenerateQaReportInputDto = z.input<typeof generateQaReportInputSchema>;

export const getQaReportInputSchema = z.object({
  projectId: z.string().uuid(),
  reportIdOrKey: z.string().min(1).max(128),
  version: z.number().int().min(1).optional(),
});
export type GetQaReportInputDto = z.input<typeof getQaReportInputSchema>;

export const listQaReportsInputSchema = z.object({
  projectId: z.string().uuid(),
  releaseIdentifier: z.string().max(128).optional(),
  status: qaReportStatusSchema.optional(),
  verdict: releaseReadinessVerdictSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});
export type ListQaReportsInputDto = z.input<typeof listQaReportsInputSchema>;

export const finalizeQaReportInputSchema = z.object({
  projectId: z.string().uuid(),
  reportId: z.string().uuid(),
  actorId: z.string().max(128).optional().default('SYSTEM'),
});
export type FinalizeQaReportInputDto = z.input<typeof finalizeQaReportInputSchema>;

export const exportQaReportInputSchema = z.object({
  projectId: z.string().uuid(),
  reportId: z.string().uuid(),
  format: z.enum(['JSON', 'MARKDOWN']).optional().default('JSON'),
});
export type ExportQaReportInputDto = z.input<typeof exportQaReportInputSchema>;

export const exportQaReportResultDtoSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  content: z.string(),
  checksumSha256: z.string(),
  exportedAt: z.string(),
  reportKey: z.string(),
  releaseIdentifier: z.string(),
  reportVersion: z.number(),
});
export type ExportQaReportResultDto = z.infer<typeof exportQaReportResultDtoSchema>;

export const evaluateReleasePolicyInputSchema = z.object({
  projectId: z.string().uuid(),
  releaseIdentifier: z.string().max(128).optional(),
  policyVersion: z.string().max(32).optional(),
});
export type EvaluateReleasePolicyInputDto = z.input<typeof evaluateReleasePolicyInputSchema>;

export const releasePolicyEvaluationResultDtoSchema = z.object({
  policyVersion: z.string(),
  verdict: releaseReadinessVerdictSchema,
  readinessScore: z.number().nullable().optional(),
  passedRules: z.array(z.string()),
  failedRules: z.array(z.string()),
  blockingRules: z.array(releaseBlockerItemSchema),
  warningRules: z.array(residualRiskItemSchema),
  explanation: z.string(),
  recommendations: z.array(z.string()),
  evaluatedAt: z.string(),
});
export type ReleasePolicyEvaluationResultDto = z.infer<
  typeof releasePolicyEvaluationResultDtoSchema
>;

export const checkQaReportStalenessInputSchema = z.object({
  projectId: z.string().uuid(),
  reportId: z.string().uuid(),
});
export type CheckQaReportStalenessInputDto = z.input<typeof checkQaReportStalenessInputSchema>;

export const qaReportStalenessResultDtoSchema = z.object({
  reportId: z.string().uuid(),
  isStale: z.boolean(),
  staleReason: z.string().nullable().optional(),
  lastSnapshotTime: z.string(),
  checkedAt: z.string(),
});
export type QaReportStalenessResultDto = z.infer<typeof qaReportStalenessResultDtoSchema>;

// ==============================================================================
// V10 Phase 142: Task / Conversation / Thread Model Contracts
// ==============================================================================

export const AGENT_THREAD_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type AgentThreadStatus = (typeof AGENT_THREAD_STATUSES)[number];
export const agentThreadStatusSchema = z.enum(AGENT_THREAD_STATUSES);

export const AGENT_THREAD_TASK_STATUSES = [
  'QUEUED',
  'PLANNING',
  'RUNNING',
  'WAITING_FOR_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'PAUSED',
  'STOPPED',
  'INTERRUPTED',
] as const;
export type AgentThreadTaskStatus = (typeof AGENT_THREAD_TASK_STATUSES)[number];
export const agentThreadTaskStatusSchema = z.enum(AGENT_THREAD_TASK_STATUSES);

export const AGENT_THREAD_MESSAGE_ROLES = ['USER', 'ASSISTANT', 'SYSTEM', 'TOOL', 'ERROR'] as const;
export type AgentThreadMessageRole = (typeof AGENT_THREAD_MESSAGE_ROLES)[number];
export const agentThreadMessageRoleSchema = z.enum(AGENT_THREAD_MESSAGE_ROLES);

export const AGENT_EXECUTION_STEP_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'WAITING',
] as const;
export type AgentExecutionStepStatus = (typeof AGENT_EXECUTION_STEP_STATUSES)[number];
export const agentExecutionStepStatusSchema = z.enum(AGENT_EXECUTION_STEP_STATUSES);

export const AGENT_TOOL_CALL_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type AgentToolCallStatus = (typeof AGENT_TOOL_CALL_STATUSES)[number];
export const agentToolCallStatusSchema = z.enum(AGENT_TOOL_CALL_STATUSES);

// V10 Phase 157 & 158: Task Control Actions & Actor Types
export const TASK_CONTROL_ACTIONS = [
  'STOP',
  'CANCEL',
  'PAUSE',
  'RESUME',
  'RETRY',
  'CHECKPOINT_CREATED',
  'INTERRUPTION_DETECTED',
  'RECOVERY_ATTEMPTED',
  'RECOVERY_FAILED',
] as const;
export type TaskControlAction = (typeof TASK_CONTROL_ACTIONS)[number];
export const taskControlActionSchema = z.enum(TASK_CONTROL_ACTIONS);

export const TASK_CONTROL_ACTOR_TYPES = ['USER', 'SYSTEM', 'TIMEOUT'] as const;
export type TaskControlActorType = (typeof TASK_CONTROL_ACTOR_TYPES)[number];
export const taskControlActorTypeSchema = z.enum(TASK_CONTROL_ACTOR_TYPES);

export const agentTaskControlAuditLogDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  userId: z.string().uuid(),
  action: taskControlActionSchema,
  previousState: agentThreadTaskStatusSchema,
  newState: agentThreadTaskStatusSchema,
  actorType: taskControlActorTypeSchema,
  actorId: z.string(),
  attemptNumber: z.number().int().default(1),
  reason: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  timestamp: z.string().or(z.date()),
});
export type AgentTaskControlAuditLogDto = z.infer<typeof agentTaskControlAuditLogDtoSchema>;

// DTO Schemas
export const agentThreadDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string(),
  status: agentThreadStatusSchema,
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  lastActivityAt: z.string().or(z.date()),
  archivedAt: z.string().or(z.date()).nullable().optional(),
});
export type AgentThreadDto = z.infer<typeof agentThreadDtoSchema>;

export const agentThreadTaskDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string(),
  instruction: z.string(),
  status: agentThreadTaskStatusSchema,
  failureReason: z.string().nullable().optional(),
  retryCount: z.number().int().default(0),
  parentTaskId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  startedAt: z.string().or(z.date()).nullable().optional(),
  completedAt: z.string().or(z.date()).nullable().optional(),
  cancelledAt: z.string().or(z.date()).nullable().optional(),
  pausedAt: z.string().or(z.date()).nullable().optional(),
  stoppedAt: z.string().or(z.date()).nullable().optional(),
  attemptNumber: z.number().int().default(1),
  isRecoverable: z.boolean().default(false),
  interruptedAt: z.string().or(z.date()).nullable().optional(),
  lastCheckpointId: z.string().uuid().nullable().optional(),
  lastCheckpointSeq: z.number().int().nullable().optional(),
  maxRetries: z.number().int().default(3),
});
export type AgentThreadTaskDto = z.infer<typeof agentThreadTaskDtoSchema>;

export const agentThreadMessageDtoSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid().nullable().optional(),
  role: agentThreadMessageRoleSchema,
  content: z.string(),
  sequence: z.number().int(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().or(z.date()),
});
export type AgentThreadMessageDto = z.infer<typeof agentThreadMessageDtoSchema>;

export const agentExecutionStepDtoSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  sequence: z.number().int(),
  stepType: z.string(),
  status: agentExecutionStepStatusSchema,
  title: z.string(),
  inputReference: z.string().nullable().optional(),
  outputReference: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  startedAt: z.string().or(z.date()).nullable().optional(),
  completedAt: z.string().or(z.date()).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type AgentExecutionStepDto = z.infer<typeof agentExecutionStepDtoSchema>;

export const agentToolCallRecordDtoSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  stepId: z.string().uuid().nullable().optional(),
  toolName: z.string(),
  status: agentToolCallStatusSchema,
  input: z.unknown().default({}),
  output: z.unknown().nullable().optional(),
  error: z.string().nullable().optional(),
  startedAt: z.string().or(z.date()).nullable().optional(),
  completedAt: z.string().or(z.date()).nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type AgentToolCallRecordDto = z.infer<typeof agentToolCallRecordDtoSchema>;

// Inputs
export const createAgentThreadInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(255).optional().default('New Thread'),
});
export type CreateAgentThreadInputDto = z.input<typeof createAgentThreadInputSchema>;

export const listAgentThreadsInputSchema = z.object({
  projectId: z.string().uuid(),
  status: agentThreadStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type ListAgentThreadsInputDto = z.input<typeof listAgentThreadsInputSchema>;

export const getAgentThreadInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
});
export type GetAgentThreadInputDto = z.input<typeof getAgentThreadInputSchema>;

export const archiveAgentThreadInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
});
export type ArchiveAgentThreadInputDto = z.input<typeof archiveAgentThreadInputSchema>;

export const createAgentThreadTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  title: z.string().min(1).max(255),
  instruction: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateAgentThreadTaskInputDto = z.input<typeof createAgentThreadTaskInputSchema>;

export const getAgentThreadTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type GetAgentThreadTaskInputDto = z.input<typeof getAgentThreadTaskInputSchema>;

export const listAgentThreadTasksInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type ListAgentThreadTasksInputDto = z.input<typeof listAgentThreadTasksInputSchema>;

export const cancelAgentThreadTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  reason: z.string().optional().default('Cancelled by user'),
});
export type CancelAgentThreadTaskInputDto = z.input<typeof cancelAgentThreadTaskInputSchema>;

export const retryAgentThreadTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  instruction: z.string().optional(),
});
export type RetryAgentThreadTaskInputDto = z.input<typeof retryAgentThreadTaskInputSchema>;

export const resumeAgentThreadTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type ResumeAgentThreadTaskInputDto = z.input<typeof resumeAgentThreadTaskInputSchema>;

export const stopAgentThreadTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  reason: z.string().optional().default('Stopped by user'),
});
export type StopAgentThreadTaskInputDto = z.input<typeof stopAgentThreadTaskInputSchema>;

export const pauseAgentThreadTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  reason: z.string().optional().default('Paused by user'),
});
export type PauseAgentThreadTaskInputDto = z.input<typeof pauseAgentThreadTaskInputSchema>;

export const listAgentTaskControlAuditLogsInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type ListAgentTaskControlAuditLogsInputDto = z.input<
  typeof listAgentTaskControlAuditLogsInputSchema
>;

export const listAgentThreadMessagesInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
});
export type ListAgentThreadMessagesInputDto = z.input<typeof listAgentThreadMessagesInputSchema>;

export const listAgentExecutionStepsInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type ListAgentExecutionStepsInputDto = z.input<typeof listAgentExecutionStepsInputSchema>;

export const listAgentToolCallsInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
});
export type ListAgentToolCallsInputDto = z.input<typeof listAgentToolCallsInputSchema>;

// ==============================================================================
// V10 Phase 158: Task Checkpointing & Recovery Models & DTOs
// ==============================================================================

export const agentTaskCheckpointDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  userId: z.string().uuid(),
  stepId: z.string().uuid().nullable().optional(),
  sequenceNumber: z.number().int(),
  taskStatus: agentThreadTaskStatusSchema,
  serializedRecoveryState: z.string(),
  activeToolCall: z.string().nullable().optional(),
  completedStepCount: z.number().int().default(0),
  pendingStepCount: z.number().int().default(0),
  retryCount: z.number().int().default(0),
  isRecoverable: z.boolean().default(true),
  createdAt: z.string().or(z.date()),
});
export type AgentTaskCheckpointDto = z.infer<typeof agentTaskCheckpointDtoSchema>;

export const taskRecoveryStateSchema = z.object({
  version: z.literal(1),
  taskId: z.string().uuid(),
  threadId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: agentThreadTaskStatusSchema,
  currentStepId: z.string().uuid().nullable().optional(),
  currentStepSequence: z.number().int().nullable().optional(),
  completedStepIds: z.array(z.string().uuid()).default([]),
  pendingStepIds: z.array(z.string().uuid()).default([]),
  activeToolName: z.string().nullable().optional(),
  activeToolCallId: z.string().uuid().nullable().optional(),
  retryCount: z.number().int().default(0),
  attemptNumber: z.number().int().default(1),
  isRecoverable: z.boolean().default(true),
  failureReason: z.string().nullable().optional(),
  lastCompletedStepTitle: z.string().nullable().optional(),
  interruptedAt: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type TaskRecoveryState = z.infer<typeof taskRecoveryStateSchema>;

export const taskRecoverySummaryDtoSchema = z.object({
  taskId: z.string().uuid(),
  threadId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskTitle: z.string(),
  status: agentThreadTaskStatusSchema,
  isRecoverable: z.boolean(),
  interruptedAt: z.string().or(z.date()).nullable().optional(),
  retryCount: z.number().int(),
  maxRetries: z.number().int(),
  attemptNumber: z.number().int(),
  lastCompletedStepTitle: z.string().nullable().optional(),
  completedStepCount: z.number().int(),
  pendingStepCount: z.number().int(),
  canResume: z.boolean(),
  canRetry: z.boolean(),
  canCancel: z.boolean(),
  lastCheckpointSeq: z.number().int().nullable().optional(),
});
export type TaskRecoverySummaryDto = z.infer<typeof taskRecoverySummaryDtoSchema>;

export const getTaskRecoveryStateInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type GetTaskRecoveryStateInputDto = z.input<typeof getTaskRecoveryStateInputSchema>;

export const listRecoverableTasksInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type ListRecoverableTasksInputDto = z.input<typeof listRecoverableTasksInputSchema>;

export const listAgentTaskCheckpointsInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type ListAgentTaskCheckpointsInputDto = z.input<typeof listAgentTaskCheckpointsInputSchema>;

// ==============================================================================
// V10 Phase 143: Tool Registry & Invocation Models & DTOs
// ==============================================================================

export const AGENT_TOOL_PERMISSION_LEVELS = ['READ', 'EXECUTE', 'WRITE', 'ADMIN'] as const;
export type AgentToolPermissionLevel = (typeof AGENT_TOOL_PERMISSION_LEVELS)[number];
export const agentToolPermissionLevelSchema = z.enum(AGENT_TOOL_PERMISSION_LEVELS);

export const AGENT_TOOL_CATEGORIES = [
  'REPOSITORY',
  'REQUIREMENTS',
  'TESTS',
  'DEFECTS',
  'ENVIRONMENT',
  'ANALYSIS',
  'UTILITY',
] as const;
export type AgentToolCategory = (typeof AGENT_TOOL_CATEGORIES)[number];
export const agentToolCategorySchema = z.enum(AGENT_TOOL_CATEGORIES);

export const agentToolDefinitionDtoSchema = z.object({
  toolId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/, 'Tool ID must use dot/dash/underscore notation'),
  name: z.string().trim().min(1).max(128),
  description: z.string().min(1).max(2000),
  version: z
    .string()
    .min(1)
    .max(32)
    .regex(/^\d+(\.\d+)*$/, 'Version must be semver or dot-delimited digits'),
  category: agentToolCategorySchema,
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  permissionLevel: agentToolPermissionLevelSchema,
  enabled: z.boolean().default(true),
});
export type AgentToolDefinitionDto = z.infer<typeof agentToolDefinitionDtoSchema>;

export const agentToolInvocationResultDtoSchema = z.object({
  success: z.boolean(),
  toolId: z.string(),
  executionId: z.string().uuid(),
  output: z.unknown().nullable(),
  error: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative(),
  timestamp: z.string(),
});
export type AgentToolInvocationResultDto = z.infer<typeof agentToolInvocationResultDtoSchema>;

export const listAgentToolsInputSchema = z.object({
  projectId: z.string().uuid(),
  category: agentToolCategorySchema.optional(),
  includeDisabled: z.boolean().optional().default(false),
});
export type ListAgentToolsInputDto = z.input<typeof listAgentToolsInputSchema>;

export const getAgentToolInputSchema = z.object({
  projectId: z.string().uuid(),
  toolId: z.string().min(1).max(128),
});
export type GetAgentToolInputDto = z.input<typeof getAgentToolInputSchema>;

export const invokeAgentToolInputSchema = z.object({
  projectId: z.string().uuid(),
  toolId: z.string().min(1).max(128),
  input: z.unknown().default({}),
  taskId: z.string().uuid().optional(),
  stepId: z.string().uuid().optional(),
});
export type InvokeAgentToolInputDto = z.input<typeof invokeAgentToolInputSchema>;

// ==============================================================================
// V10 Phase 144: Tool Permission System Schemas & DTOs
// ==============================================================================

export const TOOL_PERMISSION_LEVELS = [
  'DENIED',
  'READ_ONLY',
  'EXECUTE',
  'APPROVAL_REQUIRED',
] as const;
export type ToolPermissionLevel = (typeof TOOL_PERMISSION_LEVELS)[number];
export const toolPermissionLevelSchema = z.enum(TOOL_PERMISSION_LEVELS);

export const TOOL_APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
export type ToolApprovalStatus = (typeof TOOL_APPROVAL_STATUSES)[number];
export const toolApprovalStatusSchema = z.enum(TOOL_APPROVAL_STATUSES);

export const TOOL_DECISIONS = [
  'PERMITTED',
  'DENIED',
  'APPROVAL_REQUESTED',
  'APPROVAL_GRANTED',
  'APPROVAL_REJECTED',
] as const;
export type ToolDecision = (typeof TOOL_DECISIONS)[number];
export const toolDecisionSchema = z.enum(TOOL_DECISIONS);

export const agentToolApprovalDtoSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  threadId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  toolName: z.string().min(1).max(128),
  requestedOperation: z.string().min(1).max(255),
  permissionLevel: toolPermissionLevelSchema,
  status: toolApprovalStatusSchema,
  inputPayload: z.record(z.unknown()),
  reason: z.string().nullable(),
  decisionReason: z.string().nullable(),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentToolApprovalDto = z.infer<typeof agentToolApprovalDtoSchema>;

export const agentToolAuditLogDtoSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  threadId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  toolName: z.string().min(1).max(128),
  requestedOperation: z.string().min(1).max(255),
  permissionLevel: toolPermissionLevelSchema,
  decision: toolDecisionSchema,
  reason: z.string().nullable(),
  metadata: z.record(z.unknown()),
  timestamp: z.string(),
});
export type AgentToolAuditLogDto = z.infer<typeof agentToolAuditLogDtoSchema>;

export const listAgentToolApprovalsInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  status: toolApprovalStatusSchema.optional(),
});
export type ListAgentToolApprovalsInputDto = z.input<typeof listAgentToolApprovalsInputSchema>;

export const getAgentToolApprovalInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
});
export type GetAgentToolApprovalInputDto = z.input<typeof getAgentToolApprovalInputSchema>;

export const decideAgentToolApprovalInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().max(2000).optional(),
});
export type DecideAgentToolApprovalInputDto = z.input<typeof decideAgentToolApprovalInputSchema>;

export const listAgentToolAuditLogsInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  toolName: z.string().optional(),
});
export type ListAgentToolAuditLogsInputDto = z.input<typeof listAgentToolAuditLogsInputSchema>;

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
    readonly markOpened: (
      input: MarkProjectOpenedInput,
    ) => Promise<DesktopResult<{ readonly success: true }>>;
    readonly environments: {
      readonly list: (
        input: ListEnvironmentsInputDto,
      ) => Promise<DesktopResult<readonly ProjectEnvironmentDto[]>>;
      readonly get: (
        input: GetEnvironmentInputDto,
      ) => Promise<DesktopResult<ProjectEnvironmentDto | null>>;
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
      readonly checkReachability: (
        input: CheckEnvironmentReachabilityInputDto,
      ) => Promise<DesktopResult<EnvironmentReachabilityResultDto>>;
      readonly resolveSnapshot: (
        input: ResolveEnvironmentSnapshotInputDto,
      ) => Promise<DesktopResult<ExecutionEnvironmentSnapshotDto>>;
    };
  };
  readonly websiteTargets: {
    readonly create: (
      input: CreateWebsiteTargetInput,
    ) => Promise<DesktopResult<WebsiteTargetDetails>>;
    readonly get: (input: GetWebsiteTargetInput) => Promise<DesktopResult<WebsiteTargetDetails>>;
    readonly list: (
      input: ListWebsiteTargetsInput,
    ) => Promise<DesktopResult<readonly WebsiteTargetSummary[]>>;
    readonly update: (
      input: UpdateWebsiteTargetInput,
    ) => Promise<DesktopResult<WebsiteTargetDetails>>;
    readonly delete: (
      input: DeleteWebsiteTargetInput,
    ) => Promise<DesktopResult<{ readonly deleted: true }>>;
    readonly setActive: (
      input: SetActiveWebsiteTargetInput,
    ) => Promise<DesktopResult<WebsiteTargetDetails>>;
    readonly testConnection: (
      input: TestWebsiteTargetConnectionInput,
    ) => Promise<DesktopResult<ConnectivityCheckResultDto>>;
    readonly confirmAuth: (
      input: ConfirmWebsiteTargetAuthInput,
    ) => Promise<DesktopResult<WebsiteTargetDetails>>;
    readonly resolveSnapshot: (
      input: ResolveWebsiteTargetSnapshotInput,
    ) => Promise<DesktopResult<WebsiteTargetSnapshot>>;
  };
  readonly repositoryConnections: {
    readonly list: (
      input: ListRepositoryConnectionsInput,
    ) => Promise<DesktopResult<readonly RepositoryConnectionSummary[]>>;
    readonly get: (
      input: GetRepositoryConnectionInput,
    ) => Promise<DesktopResult<RepositoryConnectionDetails>>;
    readonly create: (
      input: CreateRepositoryConnectionInput,
    ) => Promise<DesktopResult<RepositoryConnectionDetails>>;
    readonly update: (
      input: UpdateRepositoryConnectionInput,
    ) => Promise<DesktopResult<RepositoryConnectionDetails>>;
    readonly delete: (
      input: DeleteRepositoryConnectionInput,
    ) => Promise<DesktopResult<{ readonly deleted: true }>>;
    readonly setActive: (
      input: SetActiveRepositoryConnectionInput,
    ) => Promise<DesktopResult<RepositoryConnectionDetails>>;
    readonly verify: (
      input: VerifyRepositoryConnectionInput,
    ) => Promise<DesktopResult<RepositoryVerificationResultDto>>;
    readonly import: (
      input: ImportRepositoryConnectionInput,
    ) => Promise<DesktopResult<RepositoryImportResultDto>>;
    readonly cancelImport: (
      input: CancelRepositoryImportInput,
    ) => Promise<DesktopResult<{ readonly cancelled: true }>>;
    readonly resolveSnapshot: (
      input: ResolveRepositorySnapshotInput,
    ) => Promise<DesktopResult<RepositoryConnectionSnapshot>>;
  };
  readonly gitProvider: {
    readonly verifyAuth: (
      input: VerifyGitProviderAuthInput,
    ) => Promise<DesktopResult<GitProviderAccountDto>>;
    readonly listRepos: (
      input: ListGitProviderReposInput,
    ) => Promise<DesktopResult<readonly GitProviderRepositoryDto[]>>;
    readonly listBranches: (
      input: ListGitProviderBranchesInput,
    ) => Promise<DesktopResult<readonly GitBranchDto[]>>;
  };
  readonly localFolder: {
    readonly connect: (
      input: ConnectLocalFolderInput,
    ) => Promise<DesktopResult<LocalFolderConnectionDto>>;
    readonly disconnect: (input: DisconnectLocalFolderInput) => Promise<DesktopResult<boolean>>;
    readonly validate: (
      input: ValidateLocalFolderInput,
    ) => Promise<DesktopResult<LocalFolderConnectionDto>>;
    readonly get: (projectId: string) => Promise<DesktopResult<LocalFolderConnectionDto | null>>;
    readonly listDirectory: (
      input: ListProjectDirectoryInput,
    ) => Promise<DesktopResult<ProjectDirectoryListingDto>>;
    readonly readFile: (
      input: ReadProjectFileInput,
    ) => Promise<DesktopResult<ProjectFileContentDto>>;
    readonly search: (
      input: SearchProjectFilesInput,
    ) => Promise<DesktopResult<ProjectFileSearchResultDto>>;
    readonly checkExists: (
      input: CheckProjectFileExistsInput,
    ) => Promise<DesktopResult<ProjectFileExistsResultDto>>;
    readonly getMetadata: (
      input: GetProjectFileMetadataInput,
    ) => Promise<DesktopResult<ProjectFileMetadataDto>>;
    readonly detectGit: (
      input: DetectProjectGitInput,
    ) => Promise<DesktopResult<ProjectGitDetectionDto>>;
  };
  readonly targetEnvironment: {
    readonly get: (
      input: GetTargetEnvironmentInput,
    ) => Promise<DesktopResult<TargetEnvironmentConfigDto>>;
    readonly list: (
      input: ListTargetEnvironmentsInput,
    ) => Promise<DesktopResult<readonly TargetEnvironmentConfigDto[]>>;
    readonly save: (
      input: SaveTargetEnvironmentInput,
    ) => Promise<DesktopResult<TargetEnvironmentConfigDto>>;
    readonly setActive: (
      input: SetActiveTargetEnvironmentInput,
    ) => Promise<DesktopResult<TargetEnvironmentConfigDto>>;
    readonly delete: (input: DeleteTargetEnvironmentInput) => Promise<DesktopResult<boolean>>;
    readonly testConnection: (
      input: TestTargetConnectionInput,
    ) => Promise<DesktopResult<TargetConnectionTestResultDto>>;
    readonly testAuth: (
      input: TestTargetAuthInput,
    ) => Promise<DesktopResult<TargetAuthTestResultDto>>;
    readonly resolveTarget: (
      input: ResolveTargetEnvironmentInput,
    ) => Promise<DesktopResult<TargetExecutionSnapshotDto>>;
  };
  readonly projectContext: {
    readonly get: (input: GetProjectContextInputDto) => Promise<DesktopResult<ProjectContextDto>>;
    readonly detect: (
      input: DetectProjectSourcesInputDto,
    ) => Promise<DesktopResult<DetectedProjectSourcesDto>>;
    readonly refresh: (
      input: RefreshProjectContextInputDto,
    ) => Promise<DesktopResult<ProjectContextDto>>;
    readonly invalidate: (
      input: InvalidateProjectContextInputDto,
    ) => Promise<DesktopResult<ProjectContextDto>>;
    readonly getStatus: (
      input: GetProjectContextStatusInputDto,
    ) => Promise<DesktopResult<ProjectContextStatusDto>>;
  };
  readonly conversationalAgent?: {
    readonly createSession: (
      input: CreateAgentSessionInputDto,
    ) => Promise<DesktopResult<AgentSessionDto>>;
    readonly getSession: (
      input: GetAgentSessionInputDto,
    ) => Promise<DesktopResult<AgentSessionDto>>;
    readonly listSessions: (
      input: ListAgentSessionsInputDto,
    ) => Promise<DesktopResult<readonly AgentSessionDto[]>>;
    readonly deleteSession: (
      input: DeleteAgentSessionInputDto,
    ) => Promise<DesktopResult<{ readonly success: boolean; readonly sessionId: string }>>;
    readonly sendMessage: (
      input: SendAgentMessageInputDto,
    ) => Promise<DesktopResult<AgentMessageResponseDto>>;
    readonly approveAction: (
      input: ApproveAgentActionInputDto,
    ) => Promise<DesktopResult<AgentActionApprovalResultDto>>;
    readonly runControl: (
      input: AgentRunControlInputDto,
    ) => Promise<DesktopResult<AgentRunControlResultDto>>;
    readonly getEvidence: (
      input: GetAgentEvidenceInputDto,
    ) => Promise<DesktopResult<AgentEvidenceQueryResultDto>>;
  };
  readonly aiProvider: {
    readonly listProviders: (
      input?: ListAiProvidersInputDto,
    ) => Promise<DesktopResult<readonly AiProviderDescriptorDto[]>>;
    readonly getProvider: (
      input: GetAiProviderInputDto,
    ) => Promise<DesktopResult<AiProviderDescriptorDto>>;
    readonly validateRequest: (
      input: ValidateAiRequestInputDto,
    ) => Promise<DesktopResult<NormalizedAiRequestDto>>;
    readonly getConfig: (input: {
      projectId?: string | null;
      providerId: string;
    }) => Promise<DesktopResult<AiProviderConfigDto>>;
    readonly updateConfig: (
      input: UpdateAiProviderConfigInput,
    ) => Promise<DesktopResult<AiProviderConfigDto>>;
  };
  readonly ollama: {
    readonly getStatus: (
      input?: GetOllamaStatusInputDto,
    ) => Promise<DesktopResult<OllamaStatusDto>>;
    readonly healthCheck: (
      input?: HealthCheckOllamaInputDto,
    ) => Promise<DesktopResult<OllamaHealthDiagnosticDto>>;
    readonly getConfig: (
      input?: GetOllamaConfigInputDto,
    ) => Promise<DesktopResult<OllamaConfigDto>>;
    readonly setConfig: (input: SetOllamaConfigInputDto) => Promise<DesktopResult<OllamaConfigDto>>;
  };
  readonly aiModels: {
    readonly list: (input?: ListAiModelsInputDto) => Promise<DesktopResult<AiModelListDto>>;
    readonly refresh: (input?: RefreshAiModelsInputDto) => Promise<DesktopResult<AiModelListDto>>;
    readonly get: (input: GetAiModelInputDto) => Promise<DesktopResult<AiModelDto>>;
    readonly getCapabilities: (
      input: GetModelCapabilitiesInputDto,
    ) => Promise<DesktopResult<ModelCapabilitiesProfileDto>>;
    readonly verifyCapabilities: (
      input: VerifyModelCapabilitiesInputDto,
    ) => Promise<DesktopResult<ModelCapabilitiesProfileDto>>;
    readonly select: (
      input: SelectModelInputDto,
    ) => Promise<DesktopResult<ModelSelectionResultDto>>;
    readonly getSelection: (
      input: GetModelSelectionInputDto,
    ) => Promise<DesktopResult<ModelSelectionResultDto | null>>;
    readonly resolveForTask: (
      input: ResolveModelForTaskInputDto,
    ) => Promise<DesktopResult<ModelSelectionResultDto>>;
  };
  readonly aiGeneration: {
    readonly generate: (
      input: LocalGenerationRequestInputDto,
    ) => Promise<DesktopResult<LocalGenerationResultDto>>;
    readonly generateStream: (
      input: LocalGenerationRequestInputDto,
      onEvent: (event: AiStreamEventDto) => void,
    ) => Promise<() => void>;
    readonly cancel: (
      input: CancelGenerationInputDto,
    ) => Promise<DesktopResult<{ readonly cancelled: boolean; readonly requestId: string }>>;
    readonly getStatus: (
      input: GetGenerationStatusInputDto,
    ) => Promise<DesktopResult<LocalGenerationStatusDto>>;
    readonly generateStructured: (
      input: StructuredGenerationRequestInputDto,
    ) => Promise<DesktopResult<StructuredGenerationResultDto>>;
    readonly validateStructured: (
      input: ValidateStructuredInputDto,
    ) => Promise<DesktopResult<StructuredValidationResultDto>>;
    readonly getStructuredCapabilities: (
      input?: GetStructuredCapabilitiesInputDto,
    ) => Promise<DesktopResult<StructuredCapabilitiesDto>>;
  };
  readonly aiTool: {
    readonly listTools: (
      input?: ListAiToolsInputDto,
    ) => Promise<DesktopResult<readonly AiToolDefinitionDto[]>>;
    readonly getTool: (
      input: GetAiToolInputDto,
    ) => Promise<DesktopResult<AiToolDefinitionDto | null>>;
    readonly parseCalls: (
      input: ParseAiToolCallsInputDto,
    ) => Promise<DesktopResult<readonly NormalizedAiToolCallDto[]>>;
    readonly validateCall: (
      input: ValidateAiToolCallInputDto,
    ) => Promise<DesktopResult<ValidatedAiToolCallResultDto>>;
    readonly generateCalls: (
      input: GenerateAiToolCallsInputDto,
    ) => Promise<DesktopResult<GenerateAiToolCallsResultDto>>;
    readonly getCapabilities: (
      input?: GetAiToolCapabilitiesInputDto,
    ) => Promise<DesktopResult<AiToolCapabilitiesDto>>;
  };
  readonly aiContext: {
    readonly estimateTokens: (
      input: EstimateTokensInputDto,
    ) => Promise<DesktopResult<TokenEstimationResultDto>>;
    readonly calculateBudget: (
      input: CalculateContextBudgetInputDto,
    ) => Promise<DesktopResult<ContextBudgetDto>>;
    readonly optimizeSelection: (
      input: OptimizeContextSelectionInputDto,
    ) => Promise<DesktopResult<OptimizedContextSelectionResultDto>>;
    readonly getCapabilities: (
      input: GetModelContextCapabilitiesInputDto,
    ) => Promise<DesktopResult<ModelContextCapabilitiesDto>>;
    readonly assembleRequirementTestContext: (
      input: AssembleRequirementTestContextInputDto,
    ) => Promise<DesktopResult<RequirementTestContextResultDto>>;
  };
  readonly aiPrivacy: {
    readonly getSettings: (
      input?: GetAiPrivacySettingsInputDto,
    ) => Promise<DesktopResult<AiPrivacySettingsDto>>;
    readonly updateSettings: (
      input: UpdateAiPrivacySettingsInputDto,
    ) => Promise<DesktopResult<AiPrivacySettingsDto>>;
    readonly checkFirewall: (
      input: CheckAiContextFirewallInputDto,
    ) => Promise<DesktopResult<AiContextFirewallResultDto>>;
  };
  readonly aiRouter: {
    readonly getFallbackSettings: (
      input?: GetAiFallbackSettingsInputDto,
    ) => Promise<DesktopResult<AiFallbackSettingsDto>>;
    readonly updateFallbackSettings: (
      input: UpdateAiFallbackSettingsInputDto,
    ) => Promise<DesktopResult<AiFallbackSettingsDto>>;
    readonly listProviders: (
      input?: GetAiProviderRegistryStatusInputDto,
    ) => Promise<DesktopResult<readonly AiProviderRegistryItemDto[]>>;
    readonly getProviderStatus: (input: {
      readonly providerId: string;
      readonly projectId?: string | null;
    }) => Promise<DesktopResult<AiProviderRegistryItemDto>>;
    readonly selectProvider: (
      input: AiProviderSelectionCriteriaDto,
    ) => Promise<DesktopResult<AiProviderSelectionResultDto>>;
  };
  readonly aiLifecycle: {
    readonly getActiveRequests: (
      projectId?: string | null,
    ) => Promise<DesktopResult<readonly AiActiveRequestDto[]>>;
    readonly getMetrics: () => Promise<DesktopResult<AiRuntimeMetricsDto>>;
    readonly recoverInterrupted: (
      input?: RecoverInterruptedRequestsInputDto,
    ) => Promise<DesktopResult<RecoverInterruptedRequestsResultDto>>;
  };
  readonly agentRuntime: {
    readonly createTask: (
      input: CreateAgentRuntimeTaskInputDto,
    ) => Promise<DesktopResult<AgentRuntimeTaskDto>>;
    readonly getTask: (
      input: GetAgentRuntimeTaskInputDto,
    ) => Promise<DesktopResult<AgentRuntimeTaskDto | null>>;
    readonly cancelTask: (
      input: CancelAgentRuntimeTaskInputDto,
    ) => Promise<DesktopResult<AgentRuntimeTaskDto>>;
    readonly getTaskEvents: (
      input: GetAgentRuntimeTaskEventsInputDto,
    ) => Promise<DesktopResult<readonly AgentRuntimeTaskEventDto[]>>;
  };
  readonly agentThread: {
    readonly createThread: (
      input: CreateAgentThreadInputDto,
    ) => Promise<DesktopResult<AgentThreadDto>>;
    readonly listThreads: (
      input: ListAgentThreadsInputDto,
    ) => Promise<DesktopResult<readonly AgentThreadDto[]>>;
    readonly getThread: (
      input: GetAgentThreadInputDto,
    ) => Promise<DesktopResult<AgentThreadDto | null>>;
    readonly archiveThread: (
      input: ArchiveAgentThreadInputDto,
    ) => Promise<DesktopResult<AgentThreadDto>>;
    readonly createTask: (
      input: CreateAgentThreadTaskInputDto,
    ) => Promise<DesktopResult<AgentThreadTaskDto>>;
    readonly getTask: (
      input: GetAgentThreadTaskInputDto,
    ) => Promise<DesktopResult<AgentThreadTaskDto | null>>;
    readonly listTasks: (
      input: ListAgentThreadTasksInputDto,
    ) => Promise<DesktopResult<readonly AgentThreadTaskDto[]>>;
    readonly cancelTask: (
      input: CancelAgentThreadTaskInputDto,
    ) => Promise<DesktopResult<AgentThreadTaskDto>>;
    readonly retryTask: (
      input: RetryAgentThreadTaskInputDto,
    ) => Promise<DesktopResult<AgentThreadTaskDto>>;
    readonly resumeTask: (
      input: ResumeAgentThreadTaskInputDto,
    ) => Promise<DesktopResult<AgentThreadTaskDto>>;
    readonly stopTask: (
      input: StopAgentThreadTaskInputDto,
    ) => Promise<DesktopResult<AgentThreadTaskDto>>;
    readonly pauseTask: (
      input: PauseAgentThreadTaskInputDto,
    ) => Promise<DesktopResult<AgentThreadTaskDto>>;
    readonly listControlAuditLogs: (
      input: ListAgentTaskControlAuditLogsInputDto,
    ) => Promise<DesktopResult<readonly AgentTaskControlAuditLogDto[]>>;
    readonly listMessages: (
      input: ListAgentThreadMessagesInputDto,
    ) => Promise<DesktopResult<readonly AgentThreadMessageDto[]>>;
    readonly listExecutionSteps: (
      input: ListAgentExecutionStepsInputDto,
    ) => Promise<DesktopResult<readonly AgentExecutionStepDto[]>>;
    readonly listToolCalls: (
      input: ListAgentToolCallsInputDto,
    ) => Promise<DesktopResult<readonly AgentToolCallRecordDto[]>>;
    readonly getRecoveryState: (
      input: GetTaskRecoveryStateInputDto,
    ) => Promise<DesktopResult<TaskRecoverySummaryDto | null>>;
    readonly listRecoverableTasks: (
      input: ListRecoverableTasksInputDto,
    ) => Promise<DesktopResult<readonly TaskRecoverySummaryDto[]>>;
    readonly listCheckpoints: (
      input: ListAgentTaskCheckpointsInputDto,
    ) => Promise<DesktopResult<readonly AgentTaskCheckpointDto[]>>;
    readonly executeAutonomousWorkflow: (
      input: ExecuteAutonomousWorkflowInputDto,
    ) => Promise<DesktopResult<AgentAutonomousWorkflowReportDto>>;
    readonly getAutonomousWorkflowReport: (
      input: GetAutonomousWorkflowReportInputDto,
    ) => Promise<DesktopResult<AgentAutonomousWorkflowReportDto | null>>;
    readonly approveWorkflowFix: (
      input: ApproveWorkflowFixInputDto,
    ) => Promise<DesktopResult<AgentAutonomousWorkflowReportDto>>;
    readonly rejectWorkflowFix: (
      input: RejectWorkflowFixInputDto,
    ) => Promise<DesktopResult<AgentAutonomousWorkflowReportDto>>;
  };
  readonly agentToolRegistry: {
    readonly listTools: (
      input: ListAgentToolsInputDto,
    ) => Promise<DesktopResult<readonly AgentToolDefinitionDto[]>>;
    readonly getTool: (
      input: GetAgentToolInputDto,
    ) => Promise<DesktopResult<AgentToolDefinitionDto | null>>;
    readonly invokeTool: (
      input: InvokeAgentToolInputDto,
    ) => Promise<DesktopResult<AgentToolInvocationResultDto>>;
  };
  readonly agentToolPermissions: {
    readonly listApprovals: (
      input: ListAgentToolApprovalsInputDto,
    ) => Promise<DesktopResult<readonly AgentToolApprovalDto[]>>;
    readonly getApproval: (
      input: GetAgentToolApprovalInputDto,
    ) => Promise<DesktopResult<AgentToolApprovalDto | null>>;
    readonly decideApproval: (
      input: DecideAgentToolApprovalInputDto,
    ) => Promise<DesktopResult<AgentToolApprovalDto>>;
    readonly listAuditLogs: (
      input: ListAgentToolAuditLogsInputDto,
    ) => Promise<DesktopResult<readonly AgentToolAuditLogDto[]>>;
  };
  readonly targetApplications: {
    readonly get: (projectId: string) => Promise<DesktopResult<TargetApplicationDto>>;
    readonly update: (
      input: UpdateTargetApplicationInputDto,
    ) => Promise<DesktopResult<TargetApplicationDto>>;
  };
  readonly environments: {
    readonly list: (
      input: ListEnvironmentsInputDto,
    ) => Promise<DesktopResult<readonly ProjectEnvironmentDto[]>>;
    readonly get: (
      input: GetEnvironmentInputDto,
    ) => Promise<DesktopResult<ProjectEnvironmentDto | null>>;
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
    readonly checkReachability: (
      input: CheckEnvironmentReachabilityInputDto,
    ) => Promise<DesktopResult<EnvironmentReachabilityResultDto>>;
    readonly resolveSnapshot: (
      input: ResolveEnvironmentSnapshotInputDto,
    ) => Promise<DesktopResult<ExecutionEnvironmentSnapshotDto>>;
  };
  readonly sources: {
    readonly get: (projectId: string) => Promise<DesktopResult<ProjectSourceDto | null>>;
    readonly pickDirectory: () => Promise<DesktopResult<PickDirectoryResult>>;
    readonly attachLocalDirectory: (
      projectId: string,
      directoryPath?: string,
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
  readonly execution: {
    readonly getCapabilities: () => Promise<DesktopResult<ExecutionCapabilitiesDto>>;
    readonly runRuntimeSmoke: (
      input?: RuntimeSmokeInputDto,
    ) => Promise<DesktopResult<RuntimeSmokeResultDto>>;
    readonly validateEligibility: (
      input: ValidateTestEligibilityInputDto,
    ) => Promise<DesktopResult<TestEligibilityDto>>;
  };
  readonly planCompiler: {
    readonly compile: (
      input: CompileTestPlanInputDto,
    ) => Promise<DesktopResult<ExecutableTestPlanDto>>;
    readonly get: (
      input: GetExecutablePlanInputDto,
    ) => Promise<DesktopResult<ExecutableTestPlanDto>>;
    readonly getByTestCase: (
      input: GetExecutablePlanByTestCaseInputDto,
    ) => Promise<DesktopResult<ExecutableTestPlanDto | null>>;
    readonly list: (
      input: ListExecutablePlansInputDto,
    ) => Promise<DesktopResult<readonly ExecutableTestPlanDto[]>>;
    readonly preview: (
      input: PreviewTestPlanInputDto,
    ) => Promise<DesktopResult<ExecutableTestPlanDto>>;
  };
  readonly testRuns: {
    readonly enqueue: (input: EnqueueTestRunInputDto) => Promise<DesktopResult<TestRunDto>>;
    readonly get: (input: GetTestRunInputDto) => Promise<DesktopResult<TestRunDto>>;
    readonly list: (input: ListTestRunsInputDto) => Promise<DesktopResult<readonly TestRunDto[]>>;
    readonly cancel: (input: CancelTestRunInputDto) => Promise<DesktopResult<TestRunDto>>;
    readonly getQueueState: (input: {
      readonly projectId: string;
    }) => Promise<DesktopResult<TestRunQueueStateDto>>;
  };
  readonly authProfiles: {
    readonly create: (input: CreateAuthProfileInputDto) => Promise<DesktopResult<AuthProfileDto>>;
    readonly get: (input: GetAuthProfileInputDto) => Promise<DesktopResult<AuthProfileDto>>;
    readonly list: (
      input: ListAuthProfilesInputDto,
    ) => Promise<DesktopResult<readonly AuthProfileDto[]>>;
    readonly update: (input: UpdateAuthProfileInputDto) => Promise<DesktopResult<AuthProfileDto>>;
    readonly delete: (
      input: DeleteAuthProfileInputDto,
    ) => Promise<DesktopResult<{ readonly deleted: true }>>;
    readonly validate: (
      input: ValidateAuthProfileInputDto,
    ) => Promise<DesktopResult<AuthValidationResultDto>>;
  };
  readonly actions: {
    readonly executeAction: (
      input: ExecuteActionInputDto,
    ) => Promise<DesktopResult<ActionResultDto>>;
    readonly executeStep: (
      input: ExecuteStepInputDto,
    ) => Promise<DesktopResult<StepExecutionResultDto>>;
  };
  readonly locators: {
    readonly resolveLocator: (
      input: ResolveLocatorInputDto,
    ) => Promise<DesktopResult<LocatorResolutionResultDto>>;
  };
  readonly synchronization: {
    readonly synchronize: (
      input: SynchronizeStepInputDto,
    ) => Promise<DesktopResult<SynchronizationResultDto>>;
  };
  readonly assertions: {
    readonly assert: (input: AssertInputDto) => Promise<DesktopResult<AssertionResultDto>>;
    readonly evaluateStepAssertions: (
      input: EvaluateStepAssertionsInputDto,
    ) => Promise<DesktopResult<StepAssertionEvaluationResultDto>>;
  };
  readonly executionHistory: {
    readonly getExecution: (
      input: GetExecutionInputDto,
    ) => Promise<DesktopResult<TestCaseExecutionDto>>;
    readonly listExecutions: (input: ListExecutionsInputDto) => Promise<
      DesktopResult<{
        readonly items: readonly TestCaseExecutionDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    >;
    readonly getExecutionSteps: (input: GetExecutionStepsInputDto) => Promise<
      DesktopResult<{
        readonly items: readonly StepExecutionRecordDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
      }>
    >;
    readonly getExecutionTimeline: (
      input: GetExecutionAuditTimelineInputDto,
    ) => Promise<DesktopResult<ExecutionAuditTimelineDto>>;
    readonly reconcileOrphaned: (
      input?: ReconcileOrphanedExecutionsInputDto,
    ) => Promise<DesktopResult<{ readonly reconciledCount: number }>>;
    readonly getAttempts: (
      input: GetExecutionAttemptsInputDto,
    ) => Promise<DesktopResult<readonly ExecutionAttemptSummaryDto[]>>;
    readonly evaluateReliability: (
      input: EvaluateExecutionReliabilityInputDto,
    ) => Promise<DesktopResult<ExecutionReliabilityReportDto>>;
    readonly getHealingAttempts: (
      input: GetHealingAttemptsInputDto,
    ) => Promise<DesktopResult<readonly LocatorHealingAttemptDto[]>>;
    readonly listHealingSuggestions: (
      input: ListHealingSuggestionsInputDto,
    ) => Promise<DesktopResult<readonly LocatorHealingSuggestionDto[]>>;
    readonly reviewHealingSuggestion: (
      input: ReviewHealingSuggestionInputDto,
    ) => Promise<DesktopResult<LocatorHealingSuggestionDto>>;
  };
  readonly executionPool: {
    readonly getPoolState: (
      input?: GetParallelPoolStateInputDto,
    ) => Promise<DesktopResult<ParallelWorkerPoolStateDto>>;
  };
  readonly evidence: {
    readonly createBundle: (
      input: CreateEvidenceBundleInputDto,
    ) => Promise<DesktopResult<ExecutionEvidenceBundleDto>>;
    readonly addArtifact: (
      input: AddEvidenceArtifactInputDto,
    ) => Promise<DesktopResult<ExecutionEvidenceArtifactDto>>;
    readonly finalizeBundle: (
      input: FinalizeEvidenceBundleInputDto,
    ) => Promise<DesktopResult<ExecutionEvidenceBundleDto>>;
    readonly getBundle: (
      input: GetEvidenceBundleInputDto,
    ) => Promise<DesktopResult<ExecutionEvidenceBundleDto>>;
    readonly listBundles: (input: ListEvidenceBundlesInputDto) => Promise<
      DesktopResult<{
        readonly items: readonly ExecutionEvidenceBundleDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    >;
    readonly listArtifacts: (input: ListEvidenceArtifactsInputDto) => Promise<
      DesktopResult<{
        readonly items: readonly ExecutionEvidenceArtifactDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    >;
    readonly getArtifactMetadata: (
      input: GetEvidenceArtifactMetadataInputDto,
    ) => Promise<DesktopResult<ExecutionEvidenceArtifactDto>>;
    readonly getArtifactContent: (
      input: GetEvidenceArtifactContentInputDto,
    ) => Promise<DesktopResult<EvidenceArtifactContentDto>>;
    readonly verifyIntegrity: (input: VerifyEvidenceArtifactIntegrityInputDto) => Promise<
      DesktopResult<{
        readonly isValid: boolean;
        readonly expectedSha256: string;
        readonly actualSha256: string;
        readonly byteSize: number;
      }>
    >;
  };
  readonly logging: {
    readonly reportRendererError: (
      report: RendererErrorReport,
    ) => Promise<DesktopResult<RendererErrorReportResult>>;
  };
  readonly failures: {
    readonly createCase: (
      input: CreateFailureCaseInputDto,
    ) => Promise<DesktopResult<FailureCaseDto>>;
    readonly ensureCase: (
      input: EnsureFailureCaseInputDto,
    ) => Promise<DesktopResult<FailureCaseDto>>;
    readonly getCase: (input: GetFailureCaseInputDto) => Promise<DesktopResult<FailureCaseDto>>;
    readonly listCases: (input: ListFailureCasesInputDto) => Promise<
      DesktopResult<{
        readonly items: readonly FailureCaseDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    >;
    readonly startAnalysis: (
      input: StartFailureAnalysisInputDto,
    ) => Promise<DesktopResult<FailureAnalysisRunDto>>;
    readonly completeAnalysis: (
      input: CompleteFailureAnalysisInputDto,
    ) => Promise<DesktopResult<FailureAnalysisRunDto>>;
    readonly failAnalysis: (
      input: FailFailureAnalysisInputDto,
    ) => Promise<DesktopResult<FailureAnalysisRunDto>>;
    readonly cancelAnalysis: (
      input: CancelFailureAnalysisInputDto,
    ) => Promise<DesktopResult<FailureCaseDto>>;
    readonly markStale: (
      input: MarkFailureCaseStaleInputDto,
    ) => Promise<DesktopResult<FailureCaseDto>>;
    readonly listRuns: (
      input: ListFailureAnalysisRunsInputDto,
    ) => Promise<DesktopResult<readonly FailureAnalysisRunDto[]>>;
    readonly listEvidenceReferences: (
      input: ListFailureEvidenceReferencesInputDto,
    ) => Promise<DesktopResult<readonly FailureEvidenceReferenceDto[]>>;
    readonly ingestEvidence: (
      input: IngestFailureEvidenceInputDto,
    ) => Promise<DesktopResult<FailureEvidencePackageDto>>;
    readonly getEvidencePackage: (
      input: GetFailureEvidencePackageInputDto,
    ) => Promise<DesktopResult<FailureEvidencePackageDto>>;
    readonly verifyEvidenceIntegrity: (
      input: VerifyEvidenceIntegrityInputDto,
    ) => Promise<DesktopResult<FailureEvidenceIntegrityReportDto>>;
    readonly getEvidenceArtifactContent: (
      input: GetFailureEvidenceArtifactContentInputDto,
    ) => Promise<DesktopResult<FailureEvidenceArtifactContentDto>>;
    readonly executeReproduction: (
      input: ExecuteReproductionInputDto,
    ) => Promise<DesktopResult<ReproducibilitySummaryDto>>;
    readonly getReproductionAttempts: (
      input: GetReproductionAttemptsInputDto,
    ) => Promise<DesktopResult<readonly FailureReproductionAttemptDto[]>>;
    readonly getReproducibilitySummary: (
      input: GetReproducibilitySummaryInputDto,
    ) => Promise<DesktopResult<ReproducibilitySummaryDto>>;
    readonly cancelReproduction: (
      input: CancelReproductionInputDto,
    ) => Promise<DesktopResult<{ readonly cancelled: boolean }>>;
    readonly classify: (
      input: ClassifyFailureInputDto,
    ) => Promise<DesktopResult<FailureClassificationDto>>;
    readonly getClassification: (
      input: GetFailureClassificationInputDto,
    ) => Promise<DesktopResult<FailureClassificationDto | null>>;
    readonly reclassify: (
      input: ReclassifyFailureInputDto,
    ) => Promise<DesktopResult<FailureClassificationDto>>;
    readonly listClassificationHistory: (
      input: ListFailureClassificationsInputDto,
    ) => Promise<DesktopResult<readonly FailureClassificationDto[]>>;
    readonly evaluateDecisionIntegrity: (
      input: EvaluateDecisionIntegrityInputDto,
    ) => Promise<DesktopResult<ClassificationDecisionIntegrityDto>>;
    readonly getDecisionIntegrity: (
      input: GetDecisionIntegrityInputDto,
    ) => Promise<DesktopResult<ClassificationDecisionIntegrityDto | null>>;
    readonly recomputeDecisionIntegrity: (
      input: RecomputeDecisionIntegrityInputDto,
    ) => Promise<DesktopResult<ClassificationDecisionIntegrityDto>>;
    readonly listDecisionIntegrityHistory: (
      input: ListDecisionIntegrityHistoryInputDto,
    ) => Promise<DesktopResult<readonly ClassificationDecisionIntegrityDto[]>>;
    readonly analyzeFlakiness: (
      input: AnalyzeFlakinessInputDto,
    ) => Promise<DesktopResult<FlakinessAnalysisDto>>;
    readonly getFlakinessAnalysis: (
      input: GetFlakinessAnalysisInputDto,
    ) => Promise<DesktopResult<FlakinessAnalysisDto | null>>;
    readonly reanalyzeFlakiness: (
      input: ReanalyzeFlakinessInputDto,
    ) => Promise<DesktopResult<FlakinessAnalysisDto>>;
    readonly listFlakinessHistory: (
      input: ListFlakinessHistoryInputDto,
    ) => Promise<DesktopResult<readonly FlakinessAnalysisDto[]>>;
    readonly separateFailureDomain: (
      input: SeparateFailureDomainInputDto,
    ) => Promise<DesktopResult<FailureDomainSeparationDto>>;
    readonly getDomainSeparation: (
      input: GetDomainSeparationInputDto,
    ) => Promise<DesktopResult<FailureDomainSeparationDto | null>>;
    readonly reevaluateDomainSeparation: (
      input: ReevaluateDomainSeparationInputDto,
    ) => Promise<DesktopResult<FailureDomainSeparationDto>>;
    readonly listDomainSeparationHistory: (
      input: ListDomainSeparationHistoryInputDto,
    ) => Promise<DesktopResult<readonly FailureDomainSeparationDto[]>>;
    readonly localizeTechnicalCause: (
      input: LocalizeTechnicalCauseInputDto,
    ) => Promise<DesktopResult<FailureTechnicalLocalizationDto>>;
    readonly getTechnicalLocalization: (
      input: GetTechnicalLocalizationInputDto,
    ) => Promise<DesktopResult<FailureTechnicalLocalizationDto | null>>;
    readonly relocalizeTechnicalCause: (
      input: RelocalizeTechnicalCauseInputDto,
    ) => Promise<DesktopResult<FailureTechnicalLocalizationDto>>;
    readonly listLocalizationHistory: (
      input: ListLocalizationHistoryInputDto,
    ) => Promise<DesktopResult<readonly FailureTechnicalLocalizationDto[]>>;
    readonly assessWithAi: (
      input: AssessFailureWithAiInputDto,
    ) => Promise<DesktopResult<FailureAiAssessmentDto>>;
    readonly getAiAssessment: (
      input: GetFailureAiAssessmentInputDto,
    ) => Promise<DesktopResult<FailureAiAssessmentDto | null>>;
    readonly reassessWithAi: (
      input: ReassessFailureWithAiInputDto,
    ) => Promise<DesktopResult<FailureAiAssessmentDto>>;
    readonly listAiAssessmentHistory: (
      input: ListFailureAiAssessmentHistoryInputDto,
    ) => Promise<DesktopResult<readonly FailureAiAssessmentDto[]>>;
    readonly analyzeRootCause: (
      input: AnalyzeRootCauseInputDto,
    ) => Promise<DesktopResult<FailureRootCauseAnalysisDto>>;
    readonly getRootCauseAnalysis: (
      input: GetRootCauseAnalysisInputDto,
    ) => Promise<DesktopResult<FailureRootCauseAnalysisDto | null>>;
    readonly reanalyzeRootCause: (
      input: ReanalyzeRootCauseInputDto,
    ) => Promise<DesktopResult<FailureRootCauseAnalysisDto>>;
    readonly listRootCauseHistory: (
      input: ListRootCauseHistoryInputDto,
    ) => Promise<DesktopResult<readonly FailureRootCauseAnalysisDto[]>>;
    readonly assessImpact: (
      input: AssessImpactInputDto,
    ) => Promise<DesktopResult<FailureImpactAssessmentDto>>;
    readonly getImpactAssessment: (
      input: GetImpactAssessmentInputDto,
    ) => Promise<DesktopResult<FailureImpactAssessmentDto | null>>;
    readonly reassessImpact: (
      input: ReassessImpactInputDto,
    ) => Promise<DesktopResult<FailureImpactAssessmentDto>>;
    readonly listImpactHistory: (
      input: ListImpactHistoryInputDto,
    ) => Promise<DesktopResult<readonly FailureImpactAssessmentDto[]>>;
    readonly compareDuplicates: (
      input: CompareDuplicatesInputDto,
    ) => Promise<DesktopResult<DuplicateComparisonResultDto>>;
    readonly clusterDefects: (
      input: ClusterDefectsInputDto,
    ) => Promise<DesktopResult<readonly DefectClusterDto[]>>;
    readonly getCluster: (
      input: GetClusterInputDto,
    ) => Promise<DesktopResult<DefectClusterDto | null>>;
    readonly listClusters: (
      input: ListClustersInputDto,
    ) => Promise<DesktopResult<readonly DefectClusterDto[]>>;
    readonly getFailureMembership: (
      input: GetFailureMembershipInputDto,
    ) => Promise<DesktopResult<DefectClusterMembershipDto | null>>;
    readonly mergeClusters: (
      input: MergeClustersInputDto,
    ) => Promise<DesktopResult<DefectClusterDto>>;
    readonly splitCluster: (input: SplitClusterInputDto) => Promise<
      DesktopResult<{
        readonly remainingCluster: DefectClusterDto;
        readonly newCluster: DefectClusterDto;
      }>
    >;
    readonly overrideMembership: (
      input: OverrideMembershipInputDto,
    ) => Promise<DesktopResult<DefectClusterMembershipDto | null>>;
    readonly listClusterHistory: (
      input: ListClusterHistoryInputDto,
    ) => Promise<DesktopResult<readonly DefectClusterHistoryDto[]>>;
    readonly assessConfidence: (
      input: AssessConfidenceInputDto,
    ) => Promise<DesktopResult<ConfidenceAssessmentDto>>;
    readonly getConfidence: (
      input: GetConfidenceInputDto,
    ) => Promise<DesktopResult<ConfidenceAssessmentDto | null>>;
    readonly reassessConfidence: (
      input: ReassessConfidenceInputDto,
    ) => Promise<DesktopResult<ConfidenceAssessmentDto>>;
    readonly listConfidenceHistory: (
      input: ListConfidenceHistoryInputDto,
    ) => Promise<DesktopResult<readonly ConfidenceAssessmentDto[]>>;
    readonly listEvidenceAttributions: (
      input: ListEvidenceAttributionsInputDto,
    ) => Promise<DesktopResult<readonly EvidenceAttributionDto[]>>;
    readonly createBugReport: (
      input: CreateBugReportInputDto,
    ) => Promise<DesktopResult<StructuredBugReportDto>>;
    readonly getBugReport: (
      input: GetBugReportInputDto,
    ) => Promise<DesktopResult<StructuredBugReportDto | null>>;
    readonly listBugReports: (input: ListBugReportsInputDto) => Promise<
      DesktopResult<{
        readonly items: readonly StructuredBugReportDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    >;
    readonly regenerateBugReport: (
      input: RegenerateBugReportInputDto,
    ) => Promise<DesktopResult<StructuredBugReportDto>>;
    readonly listBugReportHistory: (
      input: ListBugReportHistoryInputDto,
    ) => Promise<DesktopResult<readonly StructuredBugReportDto[]>>;
  };
  readonly jira: {
    readonly createConnection: (
      input: CreateJiraConnectionInputDto,
    ) => Promise<DesktopResult<JiraConnectionDto>>;
    readonly updateConnection: (
      input: UpdateJiraConnectionInputDto,
    ) => Promise<DesktopResult<JiraConnectionDto>>;
    readonly getConnection: (
      input: GetJiraConnectionInputDto,
    ) => Promise<DesktopResult<JiraConnectionDto | null>>;
    readonly deleteConnection: (
      input: DeleteJiraConnectionInputDto,
    ) => Promise<DesktopResult<{ readonly deleted: boolean }>>;
    readonly validateConnection: (
      input: ValidateJiraConnectionInputDto,
    ) => Promise<DesktopResult<JiraValidationResultDto>>;
    readonly listAuditLog: (
      input: ListJiraAuditLogInputDto,
    ) => Promise<DesktopResult<readonly JiraConnectionAuditDto[]>>;
    readonly discoverSites: (
      input: DiscoverJiraSitesInputDto,
    ) => Promise<DesktopResult<readonly JiraDiscoveredSiteDto[]>>;
    readonly discoverProjects: (
      input: DiscoverJiraProjectsInputDto,
    ) => Promise<DesktopResult<readonly JiraDiscoveredProjectDto[]>>;
    readonly discoverIssueTypes: (
      input: DiscoverJiraIssueTypesInputDto,
    ) => Promise<DesktopResult<readonly JiraDiscoveredIssueTypeDto[]>>;
    readonly discoverPriorities: (
      input: DiscoverJiraPrioritiesInputDto,
    ) => Promise<DesktopResult<readonly JiraDiscoveredPriorityDto[]>>;
    readonly discoverFields: (
      input: DiscoverJiraFieldsInputDto,
    ) => Promise<DesktopResult<readonly JiraDiscoveredFieldDto[]>>;
    readonly discoverComponents: (
      input: DiscoverJiraComponentsInputDto,
    ) => Promise<DesktopResult<readonly JiraDiscoveredComponentDto[]>>;
    readonly discoverAssignees: (
      input: DiscoverJiraAssigneesInputDto,
    ) => Promise<DesktopResult<readonly JiraDiscoveredAssigneeDto[]>>;
    readonly getProjectConfig: (
      input: GetJiraProjectConfigInputDto,
    ) => Promise<DesktopResult<JiraProjectConfigDto | null>>;
    readonly saveProjectConfig: (
      input: SaveJiraProjectConfigInputDto,
    ) => Promise<DesktopResult<JiraProjectConfigDto>>;
    readonly refreshProjectConfig: (
      input: RefreshJiraProjectConfigInputDto,
    ) => Promise<DesktopResult<JiraProjectConfigDto>>;
    readonly testConnectionHealth: (
      input: TestJiraConnectionHealthInputDto,
    ) => Promise<DesktopResult<JiraHealthCheckResultDto>>;
    readonly createIssue: (
      input: CreateJiraIssueInputDto,
    ) => Promise<DesktopResult<JiraExternalIssueDto>>;
    readonly getIssue: (
      input: GetJiraIssueInputDto,
    ) => Promise<DesktopResult<JiraExternalIssueDto | null>>;
    readonly listAttachableEvidence: (
      input: ListAttachableEvidenceInputDto,
    ) => Promise<DesktopResult<readonly JiraAttachableEvidenceItemDto[]>>;
    readonly attachEvidence: (
      input: AttachEvidenceInputDto,
    ) => Promise<DesktopResult<JiraAttachmentBatchResultDto>>;
    readonly getAttachmentStatus: (
      input: GetAttachmentStatusInputDto,
    ) => Promise<DesktopResult<readonly JiraEvidenceAttachmentDto[]>>;
    readonly evaluateDuplicate: (
      input: EvaluateDuplicateInputDto,
    ) => Promise<DesktopResult<JiraDuplicateEvaluationDto>>;
    readonly linkExistingIssue: (
      input: LinkExistingIssueInputDto,
    ) => Promise<DesktopResult<JiraIssueLinkDto>>;
    readonly getIssueLink: (
      input: GetIssueLinkInputDto,
    ) => Promise<DesktopResult<JiraIssueLinkDto | null>>;
    readonly registerProjectEngineer: (
      input: RegisterProjectEngineerInputDto,
    ) => Promise<DesktopResult<ProjectEngineerDto>>;
    readonly listEligibleEngineers: (
      input: ListEligibleEngineersInputDto,
    ) => Promise<DesktopResult<readonly ProjectEngineerDto[]>>;
    readonly getDefectOwnership: (
      input: GetDefectOwnershipInputDto,
    ) => Promise<DesktopResult<DefectOwnershipDto | null>>;
    readonly assignEngineer: (
      input: AssignEngineerInputDto,
    ) => Promise<DesktopResult<DefectOwnershipDto>>;
    readonly unassignEngineer: (
      input: UnassignEngineerInputDto,
    ) => Promise<DesktopResult<DefectOwnershipDto>>;
    readonly syncOwnershipFromJira: (
      input: SyncOwnershipFromJiraInputDto,
    ) => Promise<DesktopResult<DefectOwnershipDto>>;
    readonly retryJiraSync: (
      input: RetryJiraSyncInputDto,
    ) => Promise<DesktopResult<DefectOwnershipDto>>;
  };
  readonly email: {
    readonly getConfig: (input: {
      readonly projectId: string;
    }) => Promise<DesktopResult<ProjectEmailConfigDto | null>>;
    readonly saveConfig: (
      input: SaveProjectEmailConfigInputDto,
    ) => Promise<DesktopResult<ProjectEmailConfigDto>>;
    readonly testConnection: (
      input: TestEmailConnectionInputDto,
    ) => Promise<DesktopResult<TestEmailConnectionResultDto>>;
    readonly listNotifications: (input: ListEmailNotificationsInputDto) => Promise<
      DesktopResult<{
        readonly items: readonly EmailNotificationDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
      }>
    >;
    readonly getNotification: (
      input: GetEmailNotificationInputDto,
    ) => Promise<DesktopResult<EmailNotificationDto | null>>;
    readonly retryNotification: (
      input: RetryEmailNotificationInputDto,
    ) => Promise<DesktopResult<EmailNotificationDto>>;
    readonly sendWorkflowNotification: (
      input: SendWorkflowNotificationInputDto,
    ) => Promise<DesktopResult<readonly EmailNotificationDto[]>>;
  };
  readonly workflow: {
    readonly getState: (
      input: GetWorkflowStateInputDto,
    ) => Promise<DesktopResult<BugWorkflowStateDto>>;
    readonly updateInternalStatus: (
      input: UpdateInternalStatusInputDto,
    ) => Promise<DesktopResult<BugWorkflowStateDto>>;
    readonly getStatusMappings: (
      input: GetWorkflowStatusMappingsInputDto,
    ) => Promise<DesktopResult<readonly WorkflowStatusMappingDto[]>>;
    readonly saveStatusMapping: (
      input: SaveWorkflowStatusMappingInputDto,
    ) => Promise<DesktopResult<WorkflowStatusMappingDto>>;
    readonly deleteStatusMapping: (
      input: DeleteWorkflowStatusMappingInputDto,
    ) => Promise<DesktopResult<{ readonly deleted: true }>>;
    readonly syncNow: (
      input: SyncWorkflowNowInputDto,
    ) => Promise<DesktopResult<BugWorkflowStateDto>>;
    readonly resolveConflict: (
      input: ResolveWorkflowConflictInputDto,
    ) => Promise<DesktopResult<BugWorkflowStateDto>>;
    readonly listSyncEvents: (input: ListWorkflowSyncEventsInputDto) => Promise<
      DesktopResult<{
        readonly items: readonly WorkflowSyncEventDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    >;
  };
  readonly reverification: {
    readonly getState: (
      input: GetReverificationStateInputDto,
    ) => Promise<DesktopResult<DefectReverificationDto | null>>;
    readonly evaluateEligibility: (
      input: EvaluateReverificationEligibilityInputDto,
    ) => Promise<DesktopResult<EvaluateReverificationEligibilityOutputDto>>;
    readonly createRequest: (
      input: CreateReverificationRequestInputDto,
    ) => Promise<DesktopResult<DefectReverificationDto>>;
    readonly generatePlan: (
      input: GenerateReverificationPlanInputDto,
    ) => Promise<DesktopResult<DefectReverificationDto>>;
    readonly cancel: (
      input: CancelReverificationInputDto,
    ) => Promise<DesktopResult<DefectReverificationDto>>;
    readonly listAuditEvents: (
      input: ListReverificationAuditEventsInputDto,
    ) => Promise<DesktopResult<readonly ReverificationAuditEventDto[]>>;
  };
  readonly verification: {
    readonly execute: (
      input: ExecuteVerificationInputDto,
    ) => Promise<DesktopResult<VerificationSummaryDto>>;
    readonly getAttempts: (
      input: GetVerificationAttemptsInputDto,
    ) => Promise<DesktopResult<readonly DefectVerificationAttemptDto[]>>;
    readonly getComparison: (
      input: GetVerificationComparisonInputDto,
    ) => Promise<DesktopResult<DefectVerificationAttemptDto | null>>;
    readonly cancel: (
      input: CancelVerificationInputDto,
    ) => Promise<DesktopResult<{ readonly cancelled: true }>>;
  };
  readonly quickFix: {
    readonly evaluateEligibility: (
      input: EvaluateQuickFixEligibilityInputDto,
    ) => Promise<DesktopResult<QuickFixEligibilityAssessmentDto>>;
    readonly getAssessment: (
      input: GetQuickFixAssessmentInputDto,
    ) => Promise<DesktopResult<QuickFixEligibilityAssessmentDto | null>>;
    readonly listAssessments: (
      input: ListQuickFixAssessmentsInputDto,
    ) => Promise<DesktopResult<readonly QuickFixEligibilityAssessmentDto[]>>;
  };
  readonly defectLocalization: {
    readonly localize: (
      input: LocalizeDefectInputDto,
    ) => Promise<DesktopResult<RepositoryDefectLocalizationDto>>;
    readonly getLocalization: (
      input: GetDefectLocalizationInputDto,
    ) => Promise<DesktopResult<RepositoryDefectLocalizationDto | null>>;
    readonly listLocalizations: (
      input: ListDefectLocalizationsInputDto,
    ) => Promise<DesktopResult<readonly RepositoryDefectLocalizationDto[]>>;
    readonly inspectCandidateSource: (
      input: InspectCandidateSourceInputDto,
    ) => Promise<DesktopResult<CandidateSourceContentDto>>;
  };
  readonly patchProposal: {
    readonly generate: (
      input: GeneratePatchProposalInputDto,
    ) => Promise<DesktopResult<DefectPatchProposalDto>>;
    readonly get: (
      input: GetPatchProposalInputDto,
    ) => Promise<DesktopResult<DefectPatchProposalDto | null>>;
    readonly list: (
      input: ListPatchProposalsInputDto,
    ) => Promise<DesktopResult<readonly DefectPatchProposalDto[]>>;
    readonly withdraw: (
      input: WithdrawPatchProposalInputDto,
    ) => Promise<DesktopResult<DefectPatchProposalDto>>;
  };
  readonly patchSandbox: {
    readonly create: (
      input: CreatePatchSandboxInputDto,
    ) => Promise<DesktopResult<DefectPatchSandboxDto>>;
    readonly apply: (
      input: ApplyPatchToSandboxInputDto,
    ) => Promise<DesktopResult<DefectPatchSandboxDto>>;
    readonly get: (
      input: GetPatchSandboxInputDto,
    ) => Promise<DesktopResult<DefectPatchSandboxDto | null>>;
    readonly list: (
      input: ListPatchSandboxesInputDto,
    ) => Promise<DesktopResult<readonly DefectPatchSandboxDto[]>>;
    readonly destroy: (
      input: DestroyPatchSandboxInputDto,
    ) => Promise<DesktopResult<DefectPatchSandboxDto>>;
  };
  readonly patchValidation: {
    readonly execute: (
      input: ExecutePatchValidationInputDto,
    ) => Promise<DesktopResult<DefectPatchValidationDto>>;
    readonly get: (
      input: GetPatchValidationInputDto,
    ) => Promise<DesktopResult<DefectPatchValidationDto | null>>;
    readonly list: (
      input: ListPatchValidationsInputDto,
    ) => Promise<DesktopResult<readonly DefectPatchValidationDto[]>>;
    readonly cancel: (
      input: CancelPatchValidationInputDto,
    ) => Promise<DesktopResult<DefectPatchValidationDto>>;
  };
  readonly patchApproval: {
    readonly get: (
      input: GetPatchApprovalInputDto,
    ) => Promise<DesktopResult<DefectPatchApprovalDto | null>>;
    readonly list: (
      input: ListPatchApprovalsInputDto,
    ) => Promise<DesktopResult<readonly DefectPatchApprovalDto[]>>;
    readonly approve: (
      input: ApprovePatchInputDto,
    ) => Promise<DesktopResult<DefectPatchApprovalDto>>;
    readonly reject: (input: RejectPatchInputDto) => Promise<DesktopResult<DefectPatchApprovalDto>>;
    readonly apply: (input: ApplyPatchInputDto) => Promise<DesktopResult<DefectPatchApprovalDto>>;
  };
  readonly repairPatch: {
    readonly propose: (
      input: RepairPatchProposeInputDto,
    ) => Promise<DesktopResult<RepairPatchToolOutputDto>>;
    readonly get: (
      input: RepairPatchGetInputDto,
    ) => Promise<DesktopResult<RepairPatchToolOutputDto | null>>;
    readonly approve: (
      input: RepairPatchApproveInputDto,
    ) => Promise<DesktopResult<RepairPatchToolOutputDto>>;
    readonly reject: (
      input: RepairPatchRejectInputDto,
    ) => Promise<DesktopResult<RepairPatchToolOutputDto>>;
    readonly cancel: (
      input: RepairPatchCancelInputDto,
    ) => Promise<DesktopResult<RepairPatchToolOutputDto>>;
    readonly apply: (
      input: RepairPatchApplyInputDto,
    ) => Promise<DesktopResult<RepairPatchToolOutputDto>>;
  };
  readonly gitReview: {
    readonly getStatus: (
      input: GitDiffGetStatusInputDto,
    ) => Promise<DesktopResult<GitWorkingStatusDto>>;
    readonly getDiff: (input: GitDiffGetInputDto) => Promise<DesktopResult<GitDiffResultDto>>;
    readonly createReview: (
      input: CreateGitChangeReviewInputDto,
    ) => Promise<DesktopResult<AgentGitChangeReviewDto>>;
    readonly getReview: (
      input: GetGitChangeReviewInputDto,
    ) => Promise<DesktopResult<AgentGitChangeReviewDto | null>>;
    readonly approveReview: (
      input: ApproveGitChangeReviewInputDto,
    ) => Promise<DesktopResult<AgentGitChangeReviewDto>>;
    readonly rejectReview: (
      input: RejectGitChangeReviewInputDto,
    ) => Promise<DesktopResult<AgentGitChangeReviewDto>>;
  };
  readonly terminal: {
    readonly execute: (
      input: TerminalExecuteInputDto,
    ) => Promise<DesktopResult<AgentTerminalExecutionDto>>;
    readonly getExecution: (
      input: GetTerminalExecutionInputDto,
    ) => Promise<DesktopResult<AgentTerminalExecutionDto | null>>;
    readonly listExecutions: (
      input: ListTerminalExecutionsInputDto,
    ) => Promise<DesktopResult<readonly AgentTerminalExecutionDto[]>>;
    readonly approve: (
      input: ApproveTerminalExecutionInputDto,
    ) => Promise<DesktopResult<AgentTerminalExecutionDto>>;
    readonly reject: (
      input: RejectTerminalExecutionInputDto,
    ) => Promise<DesktopResult<AgentTerminalExecutionDto>>;
    readonly cancel: (
      input: CancelTerminalExecutionInputDto,
    ) => Promise<DesktopResult<AgentTerminalExecutionDto>>;
  };
  readonly planner: {
    readonly createPlan: (
      input: CreateAgentPlanInputDto,
    ) => Promise<DesktopResult<AgentPlanExecutionDto>>;
    readonly getPlan: (
      input: GetAgentPlanInputDto,
    ) => Promise<DesktopResult<AgentPlanExecutionDto | null>>;
    readonly listPlans: (
      input: ListAgentPlansInputDto,
    ) => Promise<DesktopResult<readonly AgentPlanExecutionDto[]>>;
    readonly getActivePlan: (
      input: GetActiveAgentPlanInputDto,
    ) => Promise<DesktopResult<AgentPlanExecutionDto | null>>;
    readonly addStep: (
      input: AddAgentPlanStepInputDto,
    ) => Promise<DesktopResult<AgentPlanExecutionDto>>;
    readonly removeStep: (
      input: RemoveAgentPlanStepInputDto,
    ) => Promise<DesktopResult<AgentPlanExecutionDto>>;
    readonly reorderSteps: (
      input: ReorderAgentPlanStepsInputDto,
    ) => Promise<DesktopResult<AgentPlanExecutionDto>>;
    readonly modifyStep: (
      input: ModifyAgentPlanStepInputDto,
    ) => Promise<DesktopResult<AgentPlanExecutionDto>>;
    readonly setStepStatus: (
      input: SetAgentPlanStepStatusInputDto,
    ) => Promise<DesktopResult<AgentPlanExecutionDto>>;
    readonly setPlanStatus: (
      input: SetAgentPlanStatusInputDto,
    ) => Promise<DesktopResult<AgentPlanExecutionDto>>;
  };
  readonly agentLoop: {
    readonly start: (
      input: StartAgentLoopInputDto,
    ) => Promise<DesktopResult<AgentLoopRunResultDto>>;
    readonly resume: (
      input: ResumeAgentLoopInputDto,
    ) => Promise<DesktopResult<AgentLoopRunResultDto>>;
    readonly cancel: (
      input: CancelAgentLoopInputDto,
    ) => Promise<DesktopResult<AgentLoopRunResultDto>>;
    readonly getStatus: (
      input: GetAgentLoopStatusInputDto,
    ) => Promise<DesktopResult<AgentLoopStateDto | null>>;
  };
  readonly agentActivity: {
    readonly subscribe: (
      input: SubscribeAgentActivityInputDto,
      onEvent: (event: AgentActivityEventDto) => void,
    ) => Promise<DesktopResult<{ readonly subscribed: true }>>;
    readonly unsubscribe: (
      input: UnsubscribeAgentActivityInputDto,
    ) => Promise<DesktopResult<{ readonly unsubscribed: true }>>;
    readonly getTimeline: (
      input: GetAgentActivityTimelineInputDto,
    ) => Promise<DesktopResult<AgentActivityTimelineDto>>;
  };
  readonly approval: {
    readonly create: (input: CreateApprovalInputDto) => Promise<DesktopResult<ApprovalRequestDto>>;
    readonly get: (input: GetApprovalInputDto) => Promise<DesktopResult<ApprovalRequestDto | null>>;
    readonly list: (
      input: ListApprovalsInputDto,
    ) => Promise<DesktopResult<readonly ApprovalRequestDto[]>>;
    readonly approve: (
      input: ApproveApprovalInputDto,
    ) => Promise<DesktopResult<ApprovalRequestDto>>;
    readonly reject: (input: RejectApprovalInputDto) => Promise<DesktopResult<ApprovalRequestDto>>;
    readonly cancel: (input: CancelApprovalInputDto) => Promise<DesktopResult<ApprovalRequestDto>>;
    readonly getPending: (
      input: GetPendingApprovalInputDto,
    ) => Promise<DesktopResult<ApprovalRequestDto | null>>;
    readonly getAuditHistory: (
      input: GetApprovalInputDto,
    ) => Promise<DesktopResult<readonly ApprovalAuditLogDto[]>>;
  };
  readonly fileReview: {
    readonly create: (input: CreateFileReviewInputDto) => Promise<DesktopResult<FileDiffReviewDto>>;
    readonly get: (
      input: GetFileReviewInputDto,
    ) => Promise<DesktopResult<FileDiffReviewDto | null>>;
    readonly list: (
      input: ListFileReviewsInputDto,
    ) => Promise<DesktopResult<readonly FileDiffReviewDto[]>>;
    readonly approve: (
      input: ApproveFileReviewInputDto,
    ) => Promise<DesktopResult<FileDiffReviewDto>>;
    readonly reject: (input: RejectFileReviewInputDto) => Promise<DesktopResult<FileDiffReviewDto>>;
    readonly cancel: (input: CancelFileReviewInputDto) => Promise<DesktopResult<FileDiffReviewDto>>;
    readonly apply: (
      input: ApplyFileReviewInputDto,
    ) => Promise<DesktopResult<ApplyFileReviewResultDto>>;
    readonly getFileContent: (
      input: GetFileReviewContentInputDto,
    ) => Promise<DesktopResult<FileReviewContentDto>>;
  };
  readonly patchRollback: {
    readonly plan: (
      input: PlanPatchRollbackInputDto,
    ) => Promise<DesktopResult<PatchRollbackPlanResultDto>>;
    readonly execute: (
      input: ExecutePatchRollbackInputDto,
    ) => Promise<DesktopResult<DefectPatchRollbackDto>>;
    readonly get: (
      input: GetPatchRollbackInputDto,
    ) => Promise<DesktopResult<DefectPatchRollbackDto | null>>;
    readonly list: (
      input: ListPatchRollbacksInputDto,
    ) => Promise<DesktopResult<readonly DefectPatchRollbackDto[]>>;
    readonly resumeRecovery: (
      input: ResumePatchRollbackRecoveryInputDto,
    ) => Promise<DesktopResult<DefectPatchRollbackDto>>;
  };
  readonly retest: {
    readonly createSnapshot: (
      input: CreateChangeSnapshotInputDto,
    ) => Promise<DesktopResult<ChangeSnapshotDto>>;
    readonly planRetest: (input: PlanRetestInputDto) => Promise<DesktopResult<RetestPlanDto>>;
    readonly getRetestPlan: (
      input: GetRetestPlanInputDto,
    ) => Promise<DesktopResult<RetestPlanDto | null>>;
    readonly listRetestPlans: (
      input: ListRetestPlansInputDto,
    ) => Promise<DesktopResult<readonly RetestPlanDto[]>>;
    readonly explainTestSelection: (
      input: ExplainTestSelectionInputDto,
    ) => Promise<DesktopResult<ExplainTestSelectionResultDto>>;
  };
  readonly postFix: {
    readonly execute: (
      input: ExecutePostFixSyncInputDto,
    ) => Promise<DesktopResult<PostFixSyncRecordDto>>;
    readonly retry: (
      input: RetryPostFixSyncInputDto,
    ) => Promise<DesktopResult<PostFixSyncRecordDto>>;
    readonly getStatus: (
      input: GetPostFixSyncStatusInputDto,
    ) => Promise<DesktopResult<PostFixSyncRecordDto | null>>;
    readonly listHistory: (
      input: ListPostFixSyncHistoryInputDto,
    ) => Promise<DesktopResult<readonly PostFixSyncRecordDto[]>>;
  };
  readonly audit: {
    readonly getTimeline: (
      input: GetRepairTimelineInputDto,
    ) => Promise<DesktopResult<RepairAuditTimelineDto>>;
    readonly getSession: (
      input: GetRepairSessionInputDto,
    ) => Promise<DesktopResult<RepairSessionDto | null>>;
    readonly listSessions: (
      input: ListRepairSessionsInputDto,
    ) => Promise<DesktopResult<readonly RepairSessionDto[]>>;
    readonly exportTimeline: (
      input: ExportRepairTimelineInputDto,
    ) => Promise<DesktopResult<ExportRepairTimelineResultDto>>;
    readonly recordEvent: (
      input: RecordRepairAuditEventInputDto,
    ) => Promise<DesktopResult<RepairAuditEventDto>>;
  };
  readonly qaReport: {
    readonly generate: (
      input: GenerateQaReportInputDto,
    ) => Promise<DesktopResult<FinalQaReportDto>>;
    readonly get: (input: GetQaReportInputDto) => Promise<DesktopResult<FinalQaReportDto | null>>;
    readonly list: (
      input: ListQaReportsInputDto,
    ) => Promise<DesktopResult<readonly FinalQaReportDto[]>>;
    readonly finalize: (
      input: FinalizeQaReportInputDto,
    ) => Promise<DesktopResult<FinalQaReportDto>>;
    readonly export: (
      input: ExportQaReportInputDto,
    ) => Promise<DesktopResult<ExportQaReportResultDto>>;
    readonly evaluatePolicy: (
      input: EvaluateReleasePolicyInputDto,
    ) => Promise<DesktopResult<ReleasePolicyEvaluationResultDto>>;
    readonly checkStaleness: (
      input: CheckQaReportStalenessInputDto,
    ) => Promise<DesktopResult<QaReportStalenessResultDto>>;
  };
  readonly workspaceSessions: {
    readonly list: (
      input: ListWorkspaceSessionsInputDto,
    ) => Promise<DesktopResult<readonly WorkspaceSessionSummaryDto[]>>;
    readonly get: (
      input: GetWorkspaceSessionInputDto,
    ) => Promise<DesktopResult<WorkspaceSessionDto | null>>;
    readonly create: (
      input: CreateWorkspaceSessionInputDto,
    ) => Promise<DesktopResult<WorkspaceSessionDto>>;
    readonly update: (
      input: UpdateWorkspaceSessionInputDto,
    ) => Promise<DesktopResult<WorkspaceSessionDto>>;
    readonly delete: (
      input: DeleteWorkspaceSessionInputDto,
    ) => Promise<DesktopResult<{ readonly deleted: boolean }>>;
  };
  readonly shellLayout: {
    readonly get: () => Promise<DesktopResult<ShellLayoutPreferencesDto>>;
    readonly update: (
      input: UpdateShellLayoutInputDto,
    ) => Promise<DesktopResult<ShellLayoutPreferencesDto>>;
  };
  readonly auth: {
    readonly getAuthState: () => Promise<DesktopResult<AuthStateDto>>;
    readonly getCurrentUser: () => Promise<DesktopResult<AuthenticatedUserContextDto | null>>;
    readonly login: (input: LoginInputDto) => Promise<DesktopResult<AuthenticatedUserContextDto>>;
    readonly signup: (input: SignupInputDto) => Promise<DesktopResult<AuthenticatedUserContextDto>>;
    readonly forgotPassword: (
      input: ForgotPasswordInputDto,
    ) => Promise<DesktopResult<PasswordResetResponseDto>>;
    readonly resetPassword: (
      input: ResetPasswordInputDto,
    ) => Promise<DesktopResult<{ readonly success: boolean }>>;
    readonly logout: () => Promise<DesktopResult<{ readonly success: boolean }>>;
    readonly revokeSession: (
      input: RevokeSessionInputDto,
    ) => Promise<DesktopResult<{ readonly revoked: boolean }>>;
    readonly revokeAllSessions: (
      input: RevokeAllSessionsInputDto,
    ) => Promise<DesktopResult<{ readonly revokedCount: number }>>;
    readonly startSocialAuth: (
      input: SocialAuthStartInputDto,
    ) => Promise<DesktopResult<SocialAuthStartResponseDto>>;
    readonly completeSocialAuth: (
      input: SocialAuthCallbackInputDto,
    ) => Promise<DesktopResult<AuthenticatedUserContextDto>>;
    readonly cancelSocialAuth: (
      input: SocialAuthCancelInputDto,
    ) => Promise<DesktopResult<{ readonly cancelled: boolean }>>;
    readonly getSocialProviders: () => Promise<DesktopResult<readonly SocialProviderStatusDto[]>>;
  };
  readonly settings?: {
    readonly getProfile: () => Promise<DesktopResult<UserProfileDto>>;
    readonly updateProfile: (
      input: UpdateProfileInputDto,
    ) => Promise<DesktopResult<UserProfileDto>>;
    readonly changePassword: (
      input: ChangePasswordInputDto,
    ) => Promise<DesktopResult<{ readonly success: boolean }>>;
    readonly getAuthMethods: () => Promise<DesktopResult<UserAuthMethodsDto>>;
    readonly getSessions: () => Promise<DesktopResult<readonly SessionSummaryDto[]>>;
    readonly getPreferences: () => Promise<DesktopResult<UserPreferencesDto>>;
    readonly updatePreferences: (
      input: UpdateUserPreferencesInputDto,
    ) => Promise<DesktopResult<UserPreferencesDto>>;
    readonly deleteAccount: (
      input: DeleteAccountInputDto,
    ) => Promise<DesktopResult<{ readonly success: boolean }>>;
  };
}

// ============================================================================
// V8 Phase 111: Desktop Application Shell & Product Architecture Types
// ============================================================================

export type WorkspaceSessionStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR';

export interface WorkspaceSessionActiveContextDto {
  readonly runId?: string;
  readonly testCaseId?: string;
  readonly defectId?: string;
  readonly reportId?: string;
  readonly sourceFilePath?: string;
  readonly activeTab?: 'run' | 'evidence' | 'test' | 'failure' | 'source';
}

export interface WorkspaceSessionDto {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: WorkspaceSessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activeContext: WorkspaceSessionActiveContextDto;
  readonly metadata?: Record<string, unknown>;
}

export interface WorkspaceSessionSummaryDto {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: WorkspaceSessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListWorkspaceSessionsInputDto {
  readonly projectId: string;
  readonly limit?: number;
}

export interface GetWorkspaceSessionInputDto {
  readonly projectId: string;
  readonly sessionId: string;
}

export interface CreateWorkspaceSessionInputDto {
  readonly projectId: string;
  readonly title: string;
  readonly activeContext?: WorkspaceSessionActiveContextDto;
}

export interface UpdateWorkspaceSessionInputDto {
  readonly projectId: string;
  readonly sessionId: string;
  readonly title?: string;
  readonly status?: WorkspaceSessionStatus;
  readonly activeContext?: WorkspaceSessionActiveContextDto;
}

export interface DeleteWorkspaceSessionInputDto {
  readonly projectId: string;
  readonly sessionId: string;
}

export interface ShellLayoutPreferencesDto {
  readonly sidebarCollapsed: boolean;
  readonly contextPanelCollapsed: boolean;
  readonly activeContextTab: 'run' | 'evidence' | 'test' | 'failure' | 'requirement' | 'source';
  readonly sidebarWidthPx: number;
  readonly contextPanelWidthPx: number;
  readonly themeMode?: 'dark' | 'light' | 'system';
}

export interface UpdateShellLayoutInputDto {
  readonly sidebarCollapsed?: boolean;
  readonly contextPanelCollapsed?: boolean;
  readonly activeContextTab?: 'run' | 'evidence' | 'test' | 'failure' | 'requirement' | 'source';
  readonly sidebarWidthPx?: number;
  readonly contextPanelWidthPx?: number;
}

export interface ContextPanelDataDto {
  readonly activeTab: 'run' | 'evidence' | 'test' | 'failure' | 'requirement' | 'source';
  readonly currentRun?: {
    readonly runId: string;
    readonly status: string;
    readonly totalTests: number;
    readonly passedTests: number;
    readonly failedTests: number;
    readonly durationMs: number;
  };
  readonly evidence?: {
    readonly screenshotsCount: number;
    readonly consoleLogsCount: number;
    readonly networkLogsCount: number;
    readonly hasDomSnapshot: boolean;
    readonly hasTrace: boolean;
  };
  readonly testDetails?: {
    readonly testKey: string;
    readonly title: string;
    readonly priority: string;
    readonly stepCount: number;
  };
  readonly failureDetails?: {
    readonly failureKey: string;
    readonly domain: string;
    readonly rootCause: string;
    readonly patchStatus?: string;
  };
  readonly sourceContext?: {
    readonly filePath: string;
    readonly symbol?: string;
    readonly line?: number;
  };
}

// ============================================================================
// V8 Phase 113: User Authentication Foundation Types
// ============================================================================

export type UserAccountStatus = 'ACTIVE' | 'UNVERIFIED' | 'LOCKED' | 'DISABLED' | 'DELETED';

export type AuthAuditAction =
  | 'CREDENTIAL_CREATED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'SESSION_ISSUED'
  | 'SESSION_REVOKED'
  | 'ALL_SESSIONS_REVOKED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_DISABLED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'LOGOUT'
  | 'SOCIAL_AUTH_STARTED'
  | 'SOCIAL_AUTH_SUCCESS'
  | 'SOCIAL_AUTH_FAILURE'
  | 'SOCIAL_AUTH_CANCELLED'
  | 'SOCIAL_IDENTITY_LINKED'
  | 'ACCOUNT_LINK_CONFLICT'
  | 'PROFILE_UPDATED'
  | 'PREFERENCE_UPDATED'
  | 'ACCOUNT_DELETED'
  | 'PROJECT_CREATED'
  | 'PROJECT_RENAMED'
  | 'PROJECT_ARCHIVED'
  | 'PROJECT_RESTORED'
  | 'PROJECT_DELETED';

export interface AuthenticatedUserContextDto {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly accountStatus: UserAccountStatus;
  readonly emailVerified: boolean;
  readonly sessionId: string;
  readonly expiresAt: string;
}

export interface AuthStateDto {
  readonly status: 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'CHECKING';
  readonly user: AuthenticatedUserContextDto | null;
}

export interface LoginInputDto {
  readonly email: string;
  readonly password: string;
  readonly deviceInfo?: string;
}

export interface RevokeSessionInputDto {
  readonly sessionId: string;
  readonly reason?: string;
}

export interface RevokeAllSessionsInputDto {
  readonly userId: string;
  readonly reason?: string;
}

export interface CreateUserIdentityInputDto {
  readonly email: string;
  readonly displayName: string;
  readonly accountStatus?: UserAccountStatus;
  readonly emailVerified?: boolean;
}

export interface CreatePasswordCredentialInputDto {
  readonly userId: string;
  readonly password: string;
}

// ============================================================================
// V8 Phase 114: Signup, Login, Password Recovery & Session Management Types
// ============================================================================

export interface SignupInputDto {
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
  readonly confirmPassword?: string;
  readonly deviceInfo?: string;
}

export interface ForgotPasswordInputDto {
  readonly email: string;
}

export interface ResetPasswordInputDto {
  readonly resetToken: string;
  readonly newPassword: string;
  readonly confirmPassword?: string;
}

export interface PasswordResetResponseDto {
  readonly message: string;
  readonly resetToken?: string;
}

// ============================================================================
// V8 Phase 115: Google & Apple Social Authentication Types
// ============================================================================

export type SocialAuthProvider = 'GOOGLE' | 'APPLE';

export interface SocialProviderStatusDto {
  readonly provider: SocialAuthProvider;
  readonly name: string;
  readonly enabled: boolean;
  readonly clientIdConfigured: boolean;
}

export interface SocialAuthStartInputDto {
  readonly provider: SocialAuthProvider;
  readonly deviceInfo?: string;
}

export interface SocialAuthStartResponseDto {
  readonly authorizationUrl: string;
  readonly state: string;
  readonly provider: SocialAuthProvider;
  readonly redirectUri: string;
  readonly port?: number;
}

export interface SocialAuthCallbackInputDto {
  readonly state: string;
  readonly provider?: SocialAuthProvider;
  readonly code?: string;
  readonly idToken?: string;
  readonly userJson?: string;
  readonly error?: string;
  readonly errorDescription?: string;
  readonly deviceInfo?: string;
}

export interface SocialAuthCancelInputDto {
  readonly state: string;
  readonly reason?: string;
}

export interface SocialIdentityDto {
  readonly id: string;
  readonly userId: string;
  readonly provider: SocialAuthProvider;
  readonly providerSubjectId: string;
  readonly providerEmail?: string | null;
  readonly emailVerified: boolean;
  readonly createdAt: string;
}

// ============================================================================
// V8 Phase 116: User Profile, Account Settings & Preferences Types
// ============================================================================

export interface UserProfileDto {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly accountStatus: UserAccountStatus;
  readonly emailVerified: boolean;
  readonly emailVerifiedAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastAuthenticatedAt?: string | null;
  readonly avatarUrl?: string | null;
}

export interface UpdateProfileInputDto {
  readonly displayName: string;
}

export interface ChangePasswordInputDto {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmPassword?: string;
}

export interface UserAuthMethodsDto {
  readonly hasPassword: boolean;
  readonly googleConnected: boolean;
  readonly googleEmail?: string | null;
  readonly appleConnected: boolean;
  readonly appleEmail?: string | null;
  readonly lastSignInMethod?: string | null;
}

export interface SessionSummaryDto {
  readonly sessionId: string;
  readonly deviceInfo?: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string;
  readonly expiresAt: string;
  readonly isCurrentSession: boolean;
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type DensityPreference = 'comfortable' | 'compact';
export type TimeFormatPreference = 'system' | '12h' | '24h';
export type BrowserPreference = 'chromium' | 'system' | 'firefox' | 'webkit';

export interface UserPreferencesDto {
  readonly theme: ThemePreference;
  readonly density: DensityPreference;
  readonly timeFormat: TimeFormatPreference;
  readonly productionSafeMode: boolean;
  readonly defaultBrowser: BrowserPreference;
  readonly confirmDestructiveActions: boolean;
  readonly openExternalLinksSafely: boolean;
  readonly desktopNotifications: boolean;
  readonly notifyTestRunComplete: boolean;
  readonly notifyCriticalDefect: boolean;
  readonly notifyRepairApproval: boolean;
  readonly notifyReleaseReadiness: boolean;
  readonly emailNotifications: boolean;
  readonly emailCriticalDefect: boolean;
  readonly emailReleaseReadiness: boolean;
  readonly telemetryEnabled: boolean;
  readonly crashReportsEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpdateUserPreferencesInputDto {
  readonly theme?: ThemePreference;
  readonly density?: DensityPreference;
  readonly timeFormat?: TimeFormatPreference;
  readonly productionSafeMode?: boolean;
  readonly defaultBrowser?: BrowserPreference;
  readonly confirmDestructiveActions?: boolean;
  readonly openExternalLinksSafely?: boolean;
  readonly desktopNotifications?: boolean;
  readonly notifyTestRunComplete?: boolean;
  readonly notifyCriticalDefect?: boolean;
  readonly notifyRepairApproval?: boolean;
  readonly notifyReleaseReadiness?: boolean;
  readonly emailNotifications?: boolean;
  readonly emailCriticalDefect?: boolean;
  readonly emailReleaseReadiness?: boolean;
  readonly telemetryEnabled?: boolean;
  readonly crashReportsEnabled?: boolean;
}

export interface DeleteAccountInputDto {
  readonly confirmationText: string;
  readonly currentPassword?: string;
}

// ------------------------------------------------------------------------------
// V9 Phase 126 — AI Provider Abstraction Contracts & Schemas
// ------------------------------------------------------------------------------

export type AiProviderType = 'LOCAL' | 'CLOUD' | 'EMULATED';
export const aiProviderTypeSchema = z.enum(['LOCAL', 'CLOUD', 'EMULATED']);

export type AiProviderRuntimeStatus =
  'AVAILABLE' | 'UNAVAILABLE' | 'DEGRADED' | 'UNCONFIGURED' | 'ERROR';

export const aiProviderRuntimeStatusSchema = z.enum([
  'AVAILABLE',
  'UNAVAILABLE',
  'DEGRADED',
  'UNCONFIGURED',
  'ERROR',
]);

export interface AiProviderConfigSummaryDto {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly requestTimeoutMs: number;
  readonly streamingEnabled: boolean;
}

export const aiProviderConfigSummarySchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().url(),
  defaultModel: z.string().min(1).max(128),
  requestTimeoutMs: z.number().int().min(1000).max(600000),
  streamingEnabled: z.boolean(),
});

export const aiProviderCapabilitiesSchema = z.object({
  textGeneration: z.boolean(),
  systemMessages: z.boolean(),
  tokenUsageReporting: z.boolean(),
  cancellation: z.boolean(),
  streaming: z.boolean().optional(),
  embeddings: z.boolean().optional(),
  maxContextTokens: z.number().int().optional(),
  defaultModel: z.string(),
  supportedModels: z.array(z.string()),
  supportedEmbeddingModels: z.array(z.string()).optional(),
});

export interface AiProviderDescriptorDto {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerType: AiProviderType;
  readonly status: AiProviderRuntimeStatus;
  readonly capabilities: AiProviderCapabilitiesDto;
  readonly configuration: AiProviderConfigSummaryDto;
}

export const aiProviderDescriptorSchema = z.object({
  providerId: z.string().min(1).max(64),
  providerName: z.string().min(1).max(128),
  providerType: aiProviderTypeSchema,
  status: aiProviderRuntimeStatusSchema,
  capabilities: aiProviderCapabilitiesSchema,
  configuration: aiProviderConfigSummarySchema,
});

export interface AiProviderConfigDto {
  readonly id?: string;
  readonly projectId?: string | null;
  readonly providerId: string;
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly requestTimeoutMs: number;
  readonly streamingEnabled: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export const aiProviderConfigSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64),
  enabled: z.boolean(),
  baseUrl: z.string().min(1).max(2048),
  defaultModel: z.string().min(1).max(128),
  requestTimeoutMs: z.number().int().min(1000).max(600000),
  streamingEnabled: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export interface UpdateAiProviderConfigInput {
  readonly projectId?: string | null;
  readonly providerId: string;
  readonly enabled?: boolean;
  readonly baseUrl?: string;
  readonly defaultModel?: string;
  readonly requestTimeoutMs?: number;
  readonly streamingEnabled?: boolean;
}

export const updateAiProviderConfigSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64),
  enabled: z.boolean().optional(),
  baseUrl: z.string().min(1).max(2048).optional(),
  defaultModel: z.string().min(1).max(128).optional(),
  requestTimeoutMs: z.number().int().min(1000).max(600000).optional(),
  streamingEnabled: z.boolean().optional(),
});

export interface GetAiProviderInputDto {
  readonly providerId: string;
  readonly projectId?: string | null;
}

export const getAiProviderInputSchema = z.object({
  providerId: z.string().min(1).max(64),
  projectId: z.string().uuid().nullable().optional(),
});

export interface ListAiProvidersInputDto {
  readonly projectId?: string | null;
}

export const listAiProvidersInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
});

export interface AiGenerationParametersDto {
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly stopSequences?: readonly string[];
}

export const aiGenerationParametersSchema = z.object({
  temperature: z.number().min(0.0).max(2.0).optional(),
  topP: z.number().min(0.0).max(1.0).optional(),
  maxTokens: z.number().int().min(1).max(131072).optional(),
  timeoutMs: z.number().int().min(1000).max(600000).optional(),
  stopSequences: z.array(z.string().max(64)).max(16).optional(),
});

export interface AiContextFileDto {
  readonly path: string;
  readonly content: string;
}

export const aiContextFileSchema = z.object({
  path: z.string().min(1).max(1024),
  content: z.string().max(100000),
});

export interface AiRequestContextDto {
  readonly messages?: readonly AiMessageDto[];
  readonly files?: readonly AiContextFileDto[];
  readonly metadata?: Readonly<Record<string, string>>;
}

export const aiRequestContextSchema = z.object({
  messages: z.array(aiMessageSchema).max(100).optional(),
  files: z.array(aiContextFileSchema).max(50).optional(),
  metadata: z.record(z.string().max(128), z.string().max(2048)).optional(),
});

export interface NormalizedAiRequestDto {
  readonly requestId: string;
  readonly projectId: string;
  readonly providerId: string;
  readonly model: string;
  readonly systemPrompt?: string;
  readonly prompt: string;
  readonly context?: AiRequestContextDto;
  readonly parameters?: AiGenerationParametersDto;
  readonly outputFormat?: 'text' | 'json';
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const normalizedAiRequestSchema = z.object({
  requestId: z.string().uuid(),
  projectId: z.string().uuid(),
  providerId: z.string().min(1).max(64),
  model: z.string().min(1).max(128),
  systemPrompt: z.string().max(100000).optional(),
  prompt: z.string().min(1, 'Prompt is required.').max(500000),
  context: aiRequestContextSchema.optional(),
  parameters: aiGenerationParametersSchema.optional(),
  outputFormat: z.enum(['text', 'json']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export interface ValidateAiRequestInputDto {
  readonly requestId?: string;
  readonly projectId: string;
  readonly providerId?: string;
  readonly model?: string;
  readonly systemPrompt?: string;
  readonly prompt: string;
  readonly context?: AiRequestContextDto;
  readonly parameters?: AiGenerationParametersDto;
  readonly outputFormat?: 'text' | 'json';
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const validateAiRequestInputSchema = z.object({
  requestId: z.string().uuid().optional(),
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  providerId: z.string().min(1).max(64).optional(),
  model: z.string().min(1).max(128).optional(),
  systemPrompt: z.string().max(100000).optional(),
  prompt: z.string().min(1, 'Prompt is required.').max(500000),
  context: aiRequestContextSchema.optional(),
  parameters: aiGenerationParametersSchema.optional(),
  outputFormat: z.enum(['text', 'json']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export interface AiTimingDto {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}

export const aiTimingSchema = z.object({
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number().int().nonnegative(),
});

export type AiFinishReason = 'stop' | 'length' | 'cancelled' | 'error' | 'timeout' | 'unknown';

export const aiFinishReasonSchema = z.enum([
  'stop',
  'length',
  'cancelled',
  'error',
  'timeout',
  'unknown',
]);

export interface NormalizedAiResponseDto {
  readonly requestId: string;
  readonly providerId: string;
  readonly model: string;
  readonly text: string;
  readonly finishReason: AiFinishReason;
  readonly usage?: AiTokenUsageDto | null;
  readonly timing: AiTimingDto;
  readonly structuredOutput?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const normalizedAiResponseSchema = z.object({
  requestId: z.string().uuid(),
  providerId: z.string(),
  model: z.string(),
  text: z.string(),
  finishReason: aiFinishReasonSchema,
  usage: aiTokenUsageSchema.nullable().optional(),
  timing: aiTimingSchema,
  structuredOutput: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export interface AiStreamChunkDto {
  readonly requestId: string;
  readonly deltaText: string;
  readonly finishReason?: AiFinishReason | null;
  readonly usage?: AiTokenUsageDto | null;
  readonly accumulatedText?: string;
}

export const aiStreamChunkSchema = z.object({
  requestId: z.string().uuid(),
  deltaText: z.string(),
  finishReason: aiFinishReasonSchema.nullable().optional(),
  usage: aiTokenUsageSchema.nullable().optional(),
  accumulatedText: z.string().optional(),
});

// ============================================================================
// V9 Phase 127: Ollama Connection & Health Detection Types
// ============================================================================

export type OllamaHealthState =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_ENDPOINT'
  | 'UNAUTHORIZED'
  | 'ERROR'
  | 'NOT_CONFIGURED';

export const ollamaHealthStateSchema = z.enum([
  'AVAILABLE',
  'UNAVAILABLE',
  'TIMEOUT',
  'INVALID_ENDPOINT',
  'UNAUTHORIZED',
  'ERROR',
  'NOT_CONFIGURED',
]);

export type OllamaInstallationState =
  | 'INSTALLED_AND_RUNNING'
  | 'INSTALLED_AND_STOPPED'
  | 'NOT_INSTALLED'
  | 'CUSTOM_ENDPOINT'
  | 'UNKNOWN';

export const ollamaInstallationStateSchema = z.enum([
  'INSTALLED_AND_RUNNING',
  'INSTALLED_AND_STOPPED',
  'NOT_INSTALLED',
  'CUSTOM_ENDPOINT',
  'UNKNOWN',
]);

export interface OllamaHealthDiagnosticDto {
  readonly state: OllamaHealthState;
  readonly message: string;
  readonly latencyMs?: number;
  readonly httpStatusCode?: number;
  readonly endpoint: string;
  readonly errorDetails?: string;
  readonly checkedAt: string;
}

export const ollamaHealthDiagnosticSchema = z.object({
  state: ollamaHealthStateSchema,
  message: z.string().min(1).max(1024),
  latencyMs: z.number().int().nonnegative().optional(),
  httpStatusCode: z.number().int().optional(),
  endpoint: z.string().min(1).max(2048),
  errorDetails: z.string().max(2048).optional(),
  checkedAt: z.string(),
});

export interface OllamaStatusDto {
  readonly provider: 'OLLAMA';
  readonly enabled: boolean;
  readonly endpoint: string;
  readonly connectionTimeout: number;
  readonly health: OllamaHealthDiagnosticDto;
  readonly installation: {
    readonly state: OllamaInstallationState;
    readonly detectedPath?: string;
    readonly isCustomEndpoint: boolean;
  };
  readonly isConnected: boolean;
  readonly lastCheckedAt: string;
}

export const ollamaStatusSchema = z.object({
  provider: z.literal('OLLAMA'),
  enabled: z.boolean(),
  endpoint: z.string().min(1).max(2048),
  connectionTimeout: z.number().int().positive(),
  health: ollamaHealthDiagnosticSchema,
  installation: z.object({
    state: ollamaInstallationStateSchema,
    detectedPath: z.string().optional(),
    isCustomEndpoint: z.boolean(),
  }),
  isConnected: z.boolean(),
  lastCheckedAt: z.string(),
});

export interface OllamaConfigDto {
  readonly provider: 'OLLAMA';
  readonly enabled: boolean;
  readonly endpoint: string;
  readonly connectionTimeout: number;
  readonly projectId?: string | null;
  readonly isProjectSpecific: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export const ollamaConfigSchema = z.object({
  provider: z.literal('OLLAMA'),
  enabled: z.boolean(),
  endpoint: z.string().min(1).max(2048),
  connectionTimeout: z.number().int().min(1000).max(600000),
  projectId: z.string().uuid().nullable().optional(),
  isProjectSpecific: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export interface GetOllamaStatusInputDto {
  readonly projectId?: string | null;
}

export const getOllamaStatusInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
});

export interface HealthCheckOllamaInputDto {
  readonly projectId?: string | null;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
}

export const healthCheckOllamaInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  endpoint: z.string().min(1).max(2048).optional(),
  timeoutMs: z.number().int().min(1000).max(600000).optional(),
});

export interface GetOllamaConfigInputDto {
  readonly projectId?: string | null;
}

export const getOllamaConfigInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
});

export interface SetOllamaConfigInputDto {
  readonly projectId?: string | null;
  readonly enabled?: boolean;
  readonly endpoint?: string;
  readonly connectionTimeout?: number;
}

export const setOllamaConfigInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  endpoint: z.string().min(1).max(2048).optional(),
  connectionTimeout: z.number().int().min(1000).max(600000).optional(),
});

// ============================================================================
// V9 Phase 128 — Installed Model Discovery Contracts & Schemas
// ============================================================================

export interface AiModelDto {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly size?: number;
  readonly modifiedAt?: string;
  readonly digest?: string;
  readonly family?: string;
  readonly architecture?: string;
  readonly parameters?: string;
  readonly quantization?: string;
  readonly contextLength?: number;
  readonly capabilities: {
    readonly textGeneration: boolean;
    readonly embeddings: boolean;
    readonly vision: boolean;
    readonly toolCalling: boolean;
  };
}

export const aiModelSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(256),
  provider: z.string().min(1).max(64),
  size: z.number().nonnegative().optional(),
  modifiedAt: z.string().optional(),
  digest: z.string().max(256).optional(),
  family: z.string().max(128).optional(),
  architecture: z.string().max(128).optional(),
  parameters: z.string().max(64).optional(),
  quantization: z.string().max(64).optional(),
  contextLength: z.number().int().positive().optional(),
  capabilities: z.object({
    textGeneration: z.boolean(),
    embeddings: z.boolean(),
    vision: z.boolean(),
    toolCalling: z.boolean(),
  }),
});

export interface AiModelListDto {
  readonly provider: string;
  readonly models: readonly AiModelDto[];
  readonly total: number;
  readonly refreshedAt: string;
  readonly fromCache: boolean;
  readonly endpoint?: string;
}

export const aiModelListSchema = z.object({
  provider: z.string().min(1).max(64),
  models: z.array(aiModelSchema),
  total: z.number().int().nonnegative(),
  refreshedAt: z.string(),
  fromCache: z.boolean(),
  endpoint: z.string().optional(),
});

export interface ListAiModelsInputDto {
  readonly projectId?: string | null;
  readonly providerId?: string;
  readonly forceRefresh?: boolean;
}

export const listAiModelsInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64).optional(),
  forceRefresh: z.boolean().optional(),
});

export interface RefreshAiModelsInputDto {
  readonly projectId?: string | null;
  readonly providerId?: string;
}

export const refreshAiModelsInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64).optional(),
});

export interface GetAiModelInputDto {
  readonly modelId: string;
  readonly projectId?: string | null;
  readonly providerId?: string;
}

export const getAiModelInputSchema = z.object({
  modelId: z.string().min(1).max(256),
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64).optional(),
});

// ==============================================================================
// V9 Phase 129 — AI Model Selection & Capability Detection
// ==============================================================================

export const MODEL_CAPABILITY_TYPES = [
  'CHAT',
  'TEXT_GENERATION',
  'STREAMING',
  'STRUCTURED_OUTPUT',
  'JSON_OUTPUT',
  'TOOL_CALLING',
  'CODE_GENERATION',
  'CODE_ANALYSIS',
  'LONG_CONTEXT',
  'VISION',
  'EMBEDDING',
] as const;

export type ModelCapabilityType = (typeof MODEL_CAPABILITY_TYPES)[number];
export const modelCapabilityTypeSchema = z.enum(MODEL_CAPABILITY_TYPES);

export const CAPABILITY_SUPPORT_STATUSES = ['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN'] as const;

export type CapabilitySupportStatus = (typeof CAPABILITY_SUPPORT_STATUSES)[number];
export const capabilitySupportStatusSchema = z.enum(CAPABILITY_SUPPORT_STATUSES);

export const CAPABILITY_SOURCES = ['METADATA', 'PROBE', 'HEURISTIC', 'UNKNOWN'] as const;

export type CapabilitySource = (typeof CAPABILITY_SOURCES)[number];
export const capabilitySourceSchema = z.enum(CAPABILITY_SOURCES);

export interface ModelCapabilityDetailDto {
  readonly status: CapabilitySupportStatus;
  readonly source: CapabilitySource;
  readonly confidence: number;
  readonly verifiedAt?: string;
  readonly notes?: string;
}

export const modelCapabilityDetailSchema = z.object({
  status: capabilitySupportStatusSchema,
  source: capabilitySourceSchema,
  confidence: z.number().min(0).max(1),
  verifiedAt: z.string().optional(),
  notes: z.string().optional(),
});

export type ModelCapabilitiesMap = Record<ModelCapabilityType, ModelCapabilityDetailDto>;
export const modelCapabilitiesMapSchema = z.record(
  modelCapabilityTypeSchema,
  modelCapabilityDetailSchema,
);

export const MODEL_SELECTION_TASKS = [
  'default',
  'chat',
  'code',
  'structured-output',
  'tool-calling',
  'vision',
  'long-context',
] as const;

export type ModelSelectionTask = (typeof MODEL_SELECTION_TASKS)[number];
export const modelSelectionTaskSchema = z.enum(MODEL_SELECTION_TASKS);

export const MODEL_SELECTION_TYPES = [
  'DEFAULT',
  'CHAT',
  'CODE',
  'STRUCTURED_OUTPUT',
  'TOOL_CALLING',
  'VISION',
] as const;

export type ModelSelectionType = (typeof MODEL_SELECTION_TYPES)[number];
export const modelSelectionTypeSchema = z.enum(MODEL_SELECTION_TYPES);

export interface ModelCapabilitiesProfileDto {
  readonly modelId: string;
  readonly modelName: string;
  readonly provider: string;
  readonly availability: boolean;
  readonly contextLength?: number;
  readonly capabilities: ModelCapabilitiesMap;
  readonly verifiedAt?: string;
}

export const modelCapabilitiesProfileSchema = z.object({
  modelId: z.string().min(1).max(256),
  modelName: z.string().min(1).max(256),
  provider: z.string().min(1).max(64),
  availability: z.boolean(),
  contextLength: z.number().int().positive().optional(),
  capabilities: modelCapabilitiesMapSchema,
  verifiedAt: z.string().optional(),
});

export interface ModelSelectionConstraintsDto {
  readonly minimumContext?: number;
  readonly requiredCapabilities?: readonly ModelCapabilityType[];
  readonly preferredProvider?: string;
  readonly preferredModel?: string;
}

export const modelSelectionConstraintsSchema = z.object({
  minimumContext: z.number().int().positive().optional(),
  requiredCapabilities: z.array(modelCapabilityTypeSchema).optional(),
  preferredProvider: z.string().min(1).max(64).optional(),
  preferredModel: z.string().min(1).max(256).optional(),
});

export interface ModelSelectionResultDto {
  readonly selectedModel: AiModelDto;
  readonly provider: string;
  readonly task: ModelSelectionTask;
  readonly selectionType: ModelSelectionType;
  readonly capabilities: ModelCapabilitiesMap;
  readonly selectionReason: string;
  readonly isPersistent: boolean;
  readonly lastVerifiedAt?: string;
}

export const modelSelectionResultSchema = z.object({
  selectedModel: aiModelSchema,
  provider: z.string().min(1).max(64),
  task: modelSelectionTaskSchema,
  selectionType: modelSelectionTypeSchema,
  capabilities: modelCapabilitiesMapSchema,
  selectionReason: z.string().min(1).max(512),
  isPersistent: z.boolean(),
  lastVerifiedAt: z.string().optional(),
});

export interface GetModelCapabilitiesInputDto {
  readonly modelId: string;
  readonly projectId?: string | null;
  readonly providerId?: string;
}

export const getModelCapabilitiesInputSchema = z.object({
  modelId: z.string().min(1).max(256),
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64).optional(),
});

export interface VerifyModelCapabilitiesInputDto {
  readonly modelId: string;
  readonly capabilities?: readonly ModelCapabilityType[];
  readonly projectId?: string | null;
  readonly providerId?: string;
  readonly timeoutMs?: number;
}

export const verifyModelCapabilitiesInputSchema = z.object({
  modelId: z.string().min(1).max(256),
  capabilities: z.array(modelCapabilityTypeSchema).optional(),
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64).optional(),
  timeoutMs: z.number().int().min(500).max(60000).optional(),
});

export interface SelectModelInputDto {
  readonly modelId: string;
  readonly selectionType?: ModelSelectionType;
  readonly projectId?: string | null;
  readonly providerId?: string;
}

export const selectModelInputSchema = z.object({
  modelId: z.string().min(1).max(256),
  selectionType: modelSelectionTypeSchema.optional(),
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64).optional(),
});

export interface GetModelSelectionInputDto {
  readonly selectionType?: ModelSelectionType;
  readonly projectId?: string | null;
}

export const getModelSelectionInputSchema = z.object({
  selectionType: modelSelectionTypeSchema.optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export interface ResolveModelForTaskInputDto {
  readonly task: ModelSelectionTask;
  readonly constraints?: ModelSelectionConstraintsDto;
  readonly projectId?: string | null;
}

export const resolveModelForTaskInputSchema = z.object({
  task: modelSelectionTaskSchema,
  constraints: modelSelectionConstraintsSchema.optional(),
  projectId: z.string().uuid().nullable().optional(),
});

// ============================================================================
// V9 Phase 130: Local Model Chat & Generation Runtime Types & Schemas
// ============================================================================

export type AiGenerationLifecycleState =
  | 'IDLE'
  | 'VALIDATING'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE';

export const aiGenerationLifecycleStateSchema = z.enum([
  'IDLE',
  'VALIDATING',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'CANCELLED',
  'TIMEOUT',
  'PROVIDER_ERROR',
  'INVALID_RESPONSE',
]);

export interface AiProjectContextDto {
  readonly repositoryInfo?: string | null;
  readonly requirements?: string | null;
  readonly testInfo?: string | null;
  readonly targetInfo?: string | null;
  readonly relevantMetadata?: Record<string, unknown> | null;
}

export const aiProjectContextSchema = z.object({
  repositoryInfo: z.string().max(20000).nullable().optional(),
  requirements: z.string().max(20000).nullable().optional(),
  testInfo: z.string().max(20000).nullable().optional(),
  targetInfo: z.string().max(20000).nullable().optional(),
  relevantMetadata: z.record(z.unknown()).nullable().optional(),
});

export interface LocalGenerationRequestInputDto {
  readonly requestId?: string;
  readonly projectId?: string | null;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly prompt: string;
  readonly systemPrompt?: string | null;
  readonly context?: AiProjectContextDto | null;
  readonly parameters?: {
    readonly temperature?: number;
    readonly topP?: number;
    readonly maxTokens?: number;
    readonly stopSequences?: readonly string[];
  } | null;
  readonly timeoutMs?: number;
}

export const localGenerationRequestSchema = z.object({
  requestId: z.string().uuid().optional(),
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64).optional(),
  modelId: z.string().min(1).max(256).optional(),
  prompt: z.string().trim().min(1, 'Prompt cannot be empty').max(100000),
  systemPrompt: z.string().max(20000).nullable().optional(),
  context: aiProjectContextSchema.nullable().optional(),
  parameters: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      maxTokens: z.number().int().min(1).max(128000).optional(),
      stopSequences: z.array(z.string().min(1).max(64)).max(16).optional(),
    })
    .nullable()
    .optional(),
  timeoutMs: z.number().int().min(50).max(300000).optional(),
});

export interface LocalGenerationResultDto {
  readonly requestId: string;
  readonly provider: string;
  readonly model: string;
  readonly content: string;
  readonly finishReason: string;
  readonly durationMs: number;
  readonly usage?: {
    readonly inputTokens?: number | null;
    readonly outputTokens?: number | null;
    readonly totalTokens?: number | null;
  } | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly state: AiGenerationLifecycleState;
  readonly fallbackApplied?: boolean;
  readonly fallbackProviderId?: string;
  readonly attemptHistory?: readonly AiFallbackAttemptDto[];
  readonly originalProviderId?: string;
}

export const localGenerationResultSchema = z.object({
  requestId: z.string().uuid(),
  provider: z.string().min(1).max(64),
  model: z.string().min(1).max(256),
  content: z.string(),
  finishReason: z.string(),
  durationMs: z.number().nonnegative(),
  usage: z
    .object({
      inputTokens: z.number().int().nullable().optional(),
      outputTokens: z.number().int().nullable().optional(),
      totalTokens: z.number().int().nullable().optional(),
    })
    .nullable()
    .optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  state: aiGenerationLifecycleStateSchema,
  fallbackApplied: z.boolean().optional(),
  fallbackProviderId: z.string().optional(),
  attemptHistory: z.array(z.any()).optional(),
  originalProviderId: z.string().optional(),
});

export interface LocalGenerationStatusDto {
  readonly requestId: string;
  readonly state: AiGenerationLifecycleState;
  readonly modelId?: string;
  readonly startedAt?: string;
  readonly durationMs?: number;
  readonly error?: string | null;
}

export const localGenerationStatusSchema = z.object({
  requestId: z.string().uuid(),
  state: aiGenerationLifecycleStateSchema,
  modelId: z.string().optional(),
  startedAt: z.string().optional(),
  durationMs: z.number().optional(),
  error: z.string().nullable().optional(),
});

export interface CancelGenerationInputDto {
  readonly requestId: string;
}

export const cancelGenerationInputSchema = z.object({
  requestId: z.string().uuid(),
});

export interface GetGenerationStatusInputDto {
  readonly requestId: string;
}

export const getGenerationStatusInputSchema = z.object({
  requestId: z.string().uuid(),
});

// ============================================================================
// V9 Phase 131: AI Streaming Response Infrastructure Types & Schemas
// ============================================================================

export type AiStreamEventType = 'START' | 'DELTA' | 'COMPLETE' | 'ERROR' | 'CANCELLED';

export const aiStreamEventTypeSchema = z.enum(['START', 'DELTA', 'COMPLETE', 'ERROR', 'CANCELLED']);

export interface AiStreamEventDto {
  readonly requestId: string;
  readonly projectId?: string | null;
  readonly conversationId?: string | null;
  readonly sequence: number;
  readonly type: AiStreamEventType;
  readonly content?: string;
  readonly deltaText?: string;
  readonly accumulatedText?: string;
  readonly done: boolean;
  readonly model?: string;
  readonly provider?: string;
  readonly metadata?: Record<string, unknown> | null;
  readonly error?: string | null;
  readonly finishReason?: string | null;
  readonly durationMs?: number;
  readonly usage?: {
    readonly inputTokens?: number | null;
    readonly outputTokens?: number | null;
    readonly totalTokens?: number | null;
  } | null;
}

export const aiStreamEventSchema = z.object({
  requestId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  sequence: z.number().int().nonnegative(),
  type: aiStreamEventTypeSchema,
  content: z.string().optional(),
  deltaText: z.string().optional(),
  accumulatedText: z.string().optional(),
  done: z.boolean(),
  model: z.string().optional(),
  provider: z.string().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
  finishReason: z.string().nullable().optional(),
  durationMs: z.number().nonnegative().optional(),
  usage: z
    .object({
      inputTokens: z.number().int().nullable().optional(),
      outputTokens: z.number().int().nullable().optional(),
      totalTokens: z.number().int().nullable().optional(),
    })
    .nullable()
    .optional(),
});

// ============================================================================
// V9 Phase 132: Structured Output & Schema Validation Types & Schemas
// ============================================================================

export type StructuredValidationStatus =
  'VALID' | 'INVALID' | 'PARSE_ERROR' | 'EMPTY' | 'TRUNCATED' | 'UNSUPPORTED';

export const structuredValidationStatusSchema = z.enum([
  'VALID',
  'INVALID',
  'PARSE_ERROR',
  'EMPTY',
  'TRUNCATED',
  'UNSUPPORTED',
]);

export type StructuredOutputCapability = 'NATIVE' | 'PROMPTED' | 'UNSUPPORTED' | 'UNKNOWN';

export const structuredOutputCapabilitySchema = z.enum([
  'NATIVE',
  'PROMPTED',
  'UNSUPPORTED',
  'UNKNOWN',
]);

export interface StructuredValidationErrorDto {
  readonly path: string;
  readonly message: string;
  readonly code?: string;
}

export const structuredValidationErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

export interface StructuredValidationPolicyDto {
  readonly allowMarkdownFences?: boolean;
  readonly stripTrailingCommas?: boolean;
  readonly maxRetries?: number;
  readonly maxNestingDepth?: number;
  readonly maxPayloadChars?: number;
}

export const structuredValidationPolicySchema = z.object({
  allowMarkdownFences: z.boolean().optional(),
  stripTrailingCommas: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
  maxNestingDepth: z.number().int().min(1).max(32).optional(),
  maxPayloadChars: z.number().int().min(100).max(500000).optional(),
});

export interface StructuredGenerationRequestInputDto {
  readonly requestId?: string;
  readonly projectId?: string | null;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly schemaName: string;
  readonly schemaVersion?: number;
  readonly jsonSchema?: Record<string, unknown> | null;
  readonly prompt: string;
  readonly systemPrompt?: string | null;
  readonly context?: AiProjectContextDto | null;
  readonly policy?: StructuredValidationPolicyDto | null;
  readonly parameters?: {
    readonly temperature?: number;
    readonly topP?: number;
    readonly maxTokens?: number;
    readonly stopSequences?: readonly string[];
  } | null;
  readonly timeoutMs?: number;
}

export const structuredGenerationRequestSchema = z.object({
  requestId: z.string().uuid().optional(),
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64).optional(),
  modelId: z.string().min(1).max(256).optional(),
  schemaName: z.string().min(1).max(128),
  schemaVersion: z.number().int().positive().optional(),
  jsonSchema: z.record(z.unknown()).nullable().optional(),
  prompt: z.string().trim().min(1, 'Prompt cannot be empty').max(100000),
  systemPrompt: z.string().max(20000).nullable().optional(),
  context: aiProjectContextSchema.nullable().optional(),
  policy: structuredValidationPolicySchema.nullable().optional(),
  parameters: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      maxTokens: z.number().int().min(1).max(128000).optional(),
      stopSequences: z.array(z.string().min(1).max(64)).max(16).optional(),
    })
    .nullable()
    .optional(),
  timeoutMs: z.number().int().min(50).max(300000).optional(),
});

export interface StructuredGenerationResultDto {
  readonly requestId: string;
  readonly provider: string;
  readonly model: string;
  readonly schemaName: string;
  readonly schemaVersion: number;
  readonly rawContent: string;
  readonly parsedData: unknown | null;
  readonly validationStatus: StructuredValidationStatus;
  readonly validationErrors: readonly StructuredValidationErrorDto[];
  readonly retryCount: number;
  readonly capabilityUsed: StructuredOutputCapability;
  readonly durationMs: number;
  readonly parseDurationMs: number;
  readonly validationDurationMs: number;
  readonly usage?: {
    readonly inputTokens?: number | null;
    readonly outputTokens?: number | null;
    readonly totalTokens?: number | null;
  } | null;
  readonly metadata?: Record<string, unknown> | null;
}

export const structuredGenerationResultSchema = z.object({
  requestId: z.string().uuid(),
  provider: z.string().min(1).max(64),
  model: z.string().min(1).max(256),
  schemaName: z.string().min(1).max(128),
  schemaVersion: z.number().int().positive(),
  rawContent: z.string(),
  parsedData: z.unknown().nullable(),
  validationStatus: structuredValidationStatusSchema,
  validationErrors: z.array(structuredValidationErrorSchema),
  retryCount: z.number().int().nonnegative(),
  capabilityUsed: structuredOutputCapabilitySchema,
  durationMs: z.number().nonnegative(),
  parseDurationMs: z.number().nonnegative(),
  validationDurationMs: z.number().nonnegative(),
  usage: z
    .object({
      inputTokens: z.number().int().nullable().optional(),
      outputTokens: z.number().int().nullable().optional(),
      totalTokens: z.number().int().nullable().optional(),
    })
    .nullable()
    .optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export interface ValidateStructuredInputDto {
  readonly schemaName: string;
  readonly schemaVersion?: number;
  readonly jsonSchema?: Record<string, unknown> | null;
  readonly rawContent: string;
  readonly policy?: StructuredValidationPolicyDto | null;
}

export const validateStructuredInputSchema = z.object({
  schemaName: z.string().min(1).max(128),
  schemaVersion: z.number().int().positive().optional(),
  jsonSchema: z.record(z.unknown()).nullable().optional(),
  rawContent: z.string().max(500000),
  policy: structuredValidationPolicySchema.nullable().optional(),
});

export interface StructuredValidationResultDto {
  readonly schemaName: string;
  readonly schemaVersion: number;
  readonly status: StructuredValidationStatus;
  readonly parsedData: unknown | null;
  readonly errors: readonly StructuredValidationErrorDto[];
  readonly parseDurationMs: number;
  readonly validationDurationMs: number;
}

export const structuredValidationResultSchema = z.object({
  schemaName: z.string().min(1).max(128),
  schemaVersion: z.number().int().positive(),
  status: structuredValidationStatusSchema,
  parsedData: z.unknown().nullable(),
  errors: z.array(structuredValidationErrorSchema),
  parseDurationMs: z.number().nonnegative(),
  validationDurationMs: z.number().nonnegative(),
});

export interface GetStructuredCapabilitiesInputDto {
  readonly providerId?: string;
  readonly modelId?: string;
}

export const getStructuredCapabilitiesInputSchema = z.object({
  providerId: z.string().min(1).max(64).optional(),
  modelId: z.string().min(1).max(256).optional(),
});

export interface StructuredCapabilitiesDto {
  readonly providerId: string;
  readonly modelId: string;
  readonly capability: StructuredOutputCapability;
  readonly supportsJsonFormat: boolean;
  readonly supportsJsonSchema: boolean;
  readonly description: string;
}

export const structuredCapabilitiesSchema = z.object({
  providerId: z.string().min(1).max(64),
  modelId: z.string().min(1).max(256),
  capability: structuredOutputCapabilitySchema,
  supportsJsonFormat: z.boolean(),
  supportsJsonSchema: z.boolean(),
  description: z.string(),
});

// ============================================================================
// V9 Phase 133: Tool-Calling Compatibility Layer Types & Schemas
// ============================================================================

export type ToolRiskLevel = 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export const toolRiskLevelSchema = z.enum(['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export type ToolCategory =
  'REPOSITORY' | 'REQUIREMENTS' | 'TESTS' | 'DEFECTS' | 'ENVIRONMENT' | 'ANALYSIS' | 'UTILITY';
export const toolCategorySchema = z.enum([
  'REPOSITORY',
  'REQUIREMENTS',
  'TESTS',
  'DEFECTS',
  'ENVIRONMENT',
  'ANALYSIS',
  'UTILITY',
]);

export interface AiToolDefinitionDto {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown> | null;
  readonly version: number;
  readonly category: ToolCategory;
  readonly riskLevel: ToolRiskLevel;
  readonly metadata?: Record<string, unknown> | null;
}

export const aiToolDefinitionSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(
      /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/,
      'Tool name must use dot/dash/underscore notation',
    ),
  description: z.string().min(1).max(2000),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()).nullable().optional(),
  version: z.number().int().positive(),
  category: toolCategorySchema,
  riskLevel: toolRiskLevelSchema,
  metadata: z.record(z.unknown()).nullable().optional(),
});

export type ToolCallValidationStatus =
  | 'VALID'
  | 'INVALID_ARGUMENTS'
  | 'UNKNOWN_TOOL'
  | 'PARSE_ERROR'
  | 'UNSUPPORTED'
  | 'POLICY_VIOLATION';
export const toolCallValidationStatusSchema = z.enum([
  'VALID',
  'INVALID_ARGUMENTS',
  'UNKNOWN_TOOL',
  'PARSE_ERROR',
  'UNSUPPORTED',
  'POLICY_VIOLATION',
]);

export interface NormalizedAiToolCallDto {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  readonly schemaVersion: number;
  readonly metadata?: Record<string, unknown> | null;
}

export const normalizedAiToolCallSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  arguments: z.record(z.unknown()),
  schemaVersion: z.number().int().positive().default(1),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export interface ToolCallValidationErrorDto {
  readonly path: string;
  readonly message: string;
  readonly code?: string;
}

export const toolCallValidationErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

export interface ValidatedAiToolCallResultDto {
  readonly toolCall: NormalizedAiToolCallDto | null;
  readonly status: ToolCallValidationStatus;
  readonly errors: readonly ToolCallValidationErrorDto[];
  readonly toolDefinition?: AiToolDefinitionDto | null;
}

export const validatedAiToolCallResultSchema = z.object({
  toolCall: normalizedAiToolCallSchema.nullable(),
  status: toolCallValidationStatusSchema,
  errors: z.array(toolCallValidationErrorSchema),
  toolDefinition: aiToolDefinitionSchema.nullable().optional(),
});

export interface NormalizedAiToolResultDto {
  readonly toolCallId: string;
  readonly success: boolean;
  readonly output: unknown | null;
  readonly error?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly truncated?: boolean;
}

export const normalizedAiToolResultSchema = z.object({
  toolCallId: z.string().min(1).max(128),
  success: z.boolean(),
  output: z.unknown().nullable(),
  error: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  truncated: z.boolean().optional(),
});

export type ToolCallingCapability = 'NATIVE' | 'COMPATIBILITY' | 'UNSUPPORTED';
export const toolCallingCapabilitySchema = z.enum(['NATIVE', 'COMPATIBILITY', 'UNSUPPORTED']);

export interface AiToolCapabilitiesDto {
  readonly providerId: string;
  readonly modelId: string;
  readonly capability: ToolCallingCapability;
  readonly supportsStreamingToolCalls: boolean;
  readonly supportsMultiToolCalls: boolean;
  readonly description: string;
}

export const aiToolCapabilitiesSchema = z.object({
  providerId: z.string().min(1).max(64),
  modelId: z.string().min(1).max(256),
  capability: toolCallingCapabilitySchema,
  supportsStreamingToolCalls: z.boolean(),
  supportsMultiToolCalls: z.boolean(),
  description: z.string(),
});

export interface ListAiToolsInputDto {
  readonly projectId?: string | null;
  readonly category?: ToolCategory;
}

export const listAiToolsInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  category: toolCategorySchema.optional(),
});

export interface GetAiToolInputDto {
  readonly name: string;
  readonly projectId?: string | null;
}

export const getAiToolInputSchema = z.object({
  name: z.string().min(1).max(128),
  projectId: z.string().uuid().nullable().optional(),
});

export interface ParseAiToolCallsInputDto {
  readonly rawContent: string;
  readonly allowMarkdownFences?: boolean;
  readonly maxPayloadChars?: number;
}

export const parseAiToolCallsInputSchema = z.object({
  rawContent: z.string().max(500000),
  allowMarkdownFences: z.boolean().optional(),
  maxPayloadChars: z.number().int().min(100).max(500000).optional(),
});

export interface ValidateAiToolCallInputDto {
  readonly toolCall: NormalizedAiToolCallDto;
  readonly projectId?: string | null;
}

export const validateAiToolCallInputSchema = z.object({
  toolCall: normalizedAiToolCallSchema,
  projectId: z.string().uuid().nullable().optional(),
});

export interface GenerateAiToolCallsInputDto {
  readonly requestId?: string;
  readonly projectId?: string | null;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly prompt: string;
  readonly systemPrompt?: string | null;
  readonly toolNames?: readonly string[];
  readonly context?: AiProjectContextDto | null;
  readonly parameters?: {
    readonly temperature?: number;
    readonly topP?: number;
    readonly maxTokens?: number;
    readonly stopSequences?: readonly string[];
  } | null;
  readonly timeoutMs?: number;
}

export const generateAiToolCallsInputSchema = z.object({
  requestId: z.string().uuid().optional(),
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64).optional(),
  modelId: z.string().min(1).max(256).optional(),
  prompt: z.string().trim().min(1, 'Prompt cannot be empty').max(100000),
  systemPrompt: z.string().max(20000).nullable().optional(),
  toolNames: z.array(z.string().min(1).max(128)).max(32).optional(),
  context: aiProjectContextSchema.nullable().optional(),
  parameters: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      maxTokens: z.number().int().min(1).max(128000).optional(),
      stopSequences: z.array(z.string().min(1).max(64)).max(16).optional(),
    })
    .nullable()
    .optional(),
  timeoutMs: z.number().int().min(50).max(300000).optional(),
});

export interface GenerateAiToolCallsResultDto {
  readonly requestId: string;
  readonly provider: string;
  readonly model: string;
  readonly rawContent: string;
  readonly validatedCalls: readonly ValidatedAiToolCallResultDto[];
  readonly capabilityUsed: ToolCallingCapability;
  readonly durationMs: number;
  readonly parseDurationMs: number;
  readonly validationDurationMs: number;
  readonly usage?: {
    readonly inputTokens?: number | null;
    readonly outputTokens?: number | null;
    readonly totalTokens?: number | null;
  } | null;
  readonly metadata?: Record<string, unknown> | null;
}

export const generateAiToolCallsResultSchema = z.object({
  requestId: z.string().uuid(),
  provider: z.string().min(1).max(64),
  model: z.string().min(1).max(256),
  rawContent: z.string(),
  validatedCalls: z.array(validatedAiToolCallResultSchema),
  capabilityUsed: toolCallingCapabilitySchema,
  durationMs: z.number().nonnegative(),
  parseDurationMs: z.number().nonnegative(),
  validationDurationMs: z.number().nonnegative(),
  usage: z
    .object({
      inputTokens: z.number().int().nullable().optional(),
      outputTokens: z.number().int().nullable().optional(),
      totalTokens: z.number().int().nullable().optional(),
    })
    .nullable()
    .optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export interface GetAiToolCapabilitiesInputDto {
  readonly providerId?: string;
  readonly modelId?: string;
}

export const getAiToolCapabilitiesInputSchema = z.object({
  providerId: z.string().min(1).max(64).optional(),
  modelId: z.string().min(1).max(256).optional(),
});

// ============================================================================
// V9 Phase 134: Context Window & Token Management Types & Schemas
// ============================================================================

export type ContextPriorityLevel =
  | 'P1_USER_REQUEST'
  | 'P2_SYSTEM_SECURITY'
  | 'P3_TASK_CONTEXT'
  | 'P4_REQUIREMENT'
  | 'P5_TEST_CASE'
  | 'P6_FAILURE_EVIDENCE'
  | 'P7_REPOSITORY_CODE'
  | 'P8_PROJECT_METADATA'
  | 'P9_CONVERSATION_HISTORY'
  | 'P10_BACKGROUND_INFO';

export const contextPriorityLevelSchema = z.enum([
  'P1_USER_REQUEST',
  'P2_SYSTEM_SECURITY',
  'P3_TASK_CONTEXT',
  'P4_REQUIREMENT',
  'P5_TEST_CASE',
  'P6_FAILURE_EVIDENCE',
  'P7_REPOSITORY_CODE',
  'P8_PROJECT_METADATA',
  'P9_CONVERSATION_HISTORY',
  'P10_BACKGROUND_INFO',
]);

export interface ModelContextCapabilitiesDto {
  readonly modelId: string;
  readonly provider: string;
  readonly contextWindow: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly isEstimated: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsTools: boolean;
  readonly supportsStructuredOutput: boolean;
  readonly metadata?: Record<string, unknown> | null;
}

export const modelContextCapabilitiesSchema = z.object({
  modelId: z.string().min(1).max(256),
  provider: z.string().min(1).max(64),
  contextWindow: z.number().int().positive(),
  maxInputTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  isEstimated: z.boolean(),
  supportsStreaming: z.boolean(),
  supportsTools: z.boolean(),
  supportsStructuredOutput: z.boolean(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export interface TokenEstimationDetailDto {
  readonly category: string;
  readonly estimatedTokens: number;
  readonly characterCount: number;
  readonly isEstimated: boolean;
}

export const tokenEstimationDetailSchema = z.object({
  category: z.string(),
  estimatedTokens: z.number().int().nonnegative(),
  characterCount: z.number().int().nonnegative(),
  isEstimated: z.boolean(),
});

export interface TokenEstimationResultDto {
  readonly totalTokens: number;
  readonly breakdown: readonly TokenEstimationDetailDto[];
  readonly method: 'TOKENIZER' | 'ESTIMATED_HEURISTIC';
}

export const tokenEstimationResultSchema = z.object({
  totalTokens: z.number().int().nonnegative(),
  breakdown: z.array(tokenEstimationDetailSchema),
  method: z.enum(['TOKENIZER', 'ESTIMATED_HEURISTIC']),
});

export type OutputReservationSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'CUSTOM';
export const outputReservationSizeSchema = z.enum(['SMALL', 'MEDIUM', 'LARGE', 'CUSTOM']);

export interface ContextBudgetDto {
  readonly modelId: string;
  readonly provider: string;
  readonly contextWindow: number;
  readonly reservedOutputTokens: number;
  readonly safetyMarginTokens: number;
  readonly availableInputBudget: number;
  readonly reservationTier: OutputReservationSize;
}

export const contextBudgetSchema = z.object({
  modelId: z.string().min(1).max(256),
  provider: z.string().min(1).max(64),
  contextWindow: z.number().int().positive(),
  reservedOutputTokens: z.number().int().nonnegative(),
  safetyMarginTokens: z.number().int().nonnegative(),
  availableInputBudget: z.number().int().nonnegative(),
  reservationTier: outputReservationSizeSchema,
});

export interface PrioritizedContextItemDto {
  readonly id: string;
  readonly priority: ContextPriorityLevel;
  readonly category: string;
  readonly content: string;
  readonly tokenCount: number;
  readonly provenance?: {
    readonly sourceId?: string;
    readonly sourceType?: string;
    readonly path?: string;
  } | null;
  readonly isMandatory?: boolean;
}

export const prioritizedContextItemSchema = z.object({
  id: z.string(),
  priority: contextPriorityLevelSchema,
  category: z.string(),
  content: z.string(),
  tokenCount: z.number().int().nonnegative(),
  provenance: z
    .object({
      sourceId: z.string().optional(),
      sourceType: z.string().optional(),
      path: z.string().optional(),
    })
    .nullable()
    .optional(),
  isMandatory: z.boolean().optional(),
});

export interface OptimizedContextSelectionResultDto {
  readonly modelId: string;
  readonly provider: string;
  readonly budget: ContextBudgetDto;
  readonly selectedItems: readonly PrioritizedContextItemDto[];
  readonly omittedItems: readonly PrioritizedContextItemDto[];
  readonly totalSelectedTokens: number;
  readonly totalOmittedTokens: number;
  readonly fitsWithinBudget: boolean;
  readonly assembledPrompt: string;
  readonly assembledSystemPrompt?: string | null;
  readonly reductionApplied: boolean;
}

export const optimizedContextSelectionResultSchema = z.object({
  modelId: z.string().min(1).max(256),
  provider: z.string().min(1).max(64),
  budget: contextBudgetSchema,
  selectedItems: z.array(prioritizedContextItemSchema),
  omittedItems: z.array(prioritizedContextItemSchema),
  totalSelectedTokens: z.number().int().nonnegative(),
  totalOmittedTokens: z.number().int().nonnegative(),
  fitsWithinBudget: z.boolean(),
  assembledPrompt: z.string(),
  assembledSystemPrompt: z.string().nullable().optional(),
  reductionApplied: z.boolean(),
});

export interface EstimateTokensInputDto {
  readonly text?: string | null;
  readonly items?: readonly {
    readonly category: string;
    readonly content: string;
  }[];
  readonly modelId?: string;
  readonly providerId?: string;
}

export const estimateTokensInputSchema = z.object({
  text: z.string().max(500000).nullable().optional(),
  items: z
    .array(
      z.object({
        category: z.string().min(1).max(64),
        content: z.string().max(500000),
      }),
    )
    .max(100)
    .optional(),
  modelId: z.string().min(1).max(256).optional(),
  providerId: z.string().min(1).max(64).optional(),
});

export interface CalculateContextBudgetInputDto {
  readonly modelId: string;
  readonly providerId?: string;
  readonly outputReservationTier?: OutputReservationSize;
  readonly customOutputTokens?: number;
  readonly safetyMarginTokens?: number;
}

export const calculateContextBudgetInputSchema = z.object({
  modelId: z.string().min(1).max(256),
  providerId: z.string().min(1).max(64).optional(),
  outputReservationTier: outputReservationSizeSchema.optional(),
  customOutputTokens: z.number().int().min(128).max(32000).optional(),
  safetyMarginTokens: z.number().int().min(0).max(16000).optional(),
});

export interface OptimizeContextSelectionInputDto {
  readonly modelId: string;
  readonly providerId?: string;
  readonly projectId?: string | null;
  readonly userPrompt: string;
  readonly systemPrompt?: string | null;
  readonly context?: AiProjectContextDto | null;
  readonly previousMessages?: readonly {
    readonly role: 'user' | 'assistant' | 'system';
    readonly content: string;
  }[];
  readonly toolDefinitions?: readonly AiToolDefinitionDto[];
  readonly outputReservationTier?: OutputReservationSize;
  readonly safetyMarginTokens?: number;
}

export const optimizeContextSelectionInputSchema = z.object({
  modelId: z.string().min(1).max(256),
  providerId: z.string().min(1).max(64).optional(),
  projectId: z.string().uuid().nullable().optional(),
  userPrompt: z.string().min(1).max(100000),
  systemPrompt: z.string().max(20000).nullable().optional(),
  context: aiProjectContextSchema.nullable().optional(),
  previousMessages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(50000),
      }),
    )
    .max(50)
    .optional(),
  toolDefinitions: z.array(aiToolDefinitionSchema).max(32).optional(),
  outputReservationTier: outputReservationSizeSchema.optional(),
  safetyMarginTokens: z.number().int().min(0).max(16000).optional(),
});

export interface GetModelContextCapabilitiesInputDto {
  readonly modelId: string;
  readonly providerId?: string;
}

export const getModelContextCapabilitiesInputSchema = z.object({
  modelId: z.string().min(1).max(256),
  providerId: z.string().min(1).max(64).optional(),
});

// ==============================================================================
// V9 Phase 137 — AI Privacy & Local-Only Mode DTOs & Schemas
// ==============================================================================

export type AiPrivacyModeDto = 'LOCAL_ONLY' | 'REMOTE_ALLOWED';
export const aiPrivacyModeSchema = z.enum(['LOCAL_ONLY', 'REMOTE_ALLOWED']);

export type AiDataContextClassificationDto =
  | 'PUBLIC'
  | 'PROJECT_DATA'
  | 'SOURCE_CODE'
  | 'REQUIREMENTS'
  | 'TEST_DATA'
  | 'EXECUTION_EVIDENCE'
  | 'CREDENTIAL'
  | 'SECRET';

export const aiDataContextClassificationSchema = z.enum([
  'PUBLIC',
  'PROJECT_DATA',
  'SOURCE_CODE',
  'REQUIREMENTS',
  'TEST_DATA',
  'EXECUTION_EVIDENCE',
  'CREDENTIAL',
  'SECRET',
]);

export interface AiPrivacySettingsDto {
  readonly id: string;
  readonly projectId?: string | null;
  readonly userId?: string | null;
  readonly privacyMode: AiPrivacyModeDto;
  readonly allowCloudFallback: boolean;
  readonly redactSecrets: boolean;
  readonly stripCredentials: boolean;
  readonly permittedLocalProvider: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const aiPrivacySettingsSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  privacyMode: aiPrivacyModeSchema,
  allowCloudFallback: z.boolean(),
  redactSecrets: z.boolean(),
  stripCredentials: z.boolean(),
  permittedLocalProvider: z.string().min(1).max(64),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export interface GetAiPrivacySettingsInputDto {
  readonly projectId?: string | null;
}

export const getAiPrivacySettingsInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
});

export interface UpdateAiPrivacySettingsInputDto {
  readonly projectId?: string | null;
  readonly privacyMode?: AiPrivacyModeDto;
  readonly allowCloudFallback?: boolean;
  readonly redactSecrets?: boolean;
  readonly stripCredentials?: boolean;
  readonly permittedLocalProvider?: string;
}

export const updateAiPrivacySettingsInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  privacyMode: aiPrivacyModeSchema.optional(),
  allowCloudFallback: z.boolean().optional(),
  redactSecrets: z.boolean().optional(),
  stripCredentials: z.boolean().optional(),
  permittedLocalProvider: z.string().min(1).max(64).optional(),
});

export interface CheckAiContextFirewallInputDto {
  readonly projectId?: string | null;
  readonly providerId: string;
  readonly prompt: string;
  readonly systemPrompt?: string | null;
  readonly context?: AiProjectContextDto | null;
}

export const checkAiContextFirewallInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64),
  prompt: z.string().max(100000),
  systemPrompt: z.string().max(20000).nullable().optional(),
  context: aiProjectContextSchema.nullable().optional(),
});

export interface AiContextFirewallResultDto {
  readonly allowed: boolean;
  readonly privacyMode: AiPrivacyModeDto;
  readonly providerId: string;
  readonly providerType: AiProviderType;
  readonly blockReason?: string;
  readonly sanitizedPrompt: string;
  readonly sanitizedSystemPrompt?: string | null;
  readonly sanitizedContext?: AiProjectContextDto | null;
  readonly redactedSecretsCount: number;
  readonly dataClassifications: readonly AiDataContextClassificationDto[];
}

export const aiContextFirewallResultSchema = z.object({
  allowed: z.boolean(),
  privacyMode: aiPrivacyModeSchema,
  providerId: z.string(),
  providerType: aiProviderTypeSchema,
  blockReason: z.string().optional(),
  sanitizedPrompt: z.string(),
  sanitizedSystemPrompt: z.string().nullable().optional(),
  sanitizedContext: aiProjectContextSchema.nullable().optional(),
  redactedSecretsCount: z.number().int().nonnegative(),
  dataClassifications: z.array(aiDataContextClassificationSchema),
});

// ==============================================================================
// V9 Phase 136 — Requirement & Test Context Adapter DTOs & Schemas
// ==============================================================================

export interface AiRequirementItemDto {
  readonly id: string;
  readonly requirementKey: string;
  readonly title: string;
  readonly description: string;
  readonly type: string;
  readonly status: string;
  readonly priority: string;
  readonly versionNumber?: number;
  readonly provenance?: {
    readonly sourceKind?: string;
    readonly sourceText?: string | null;
    readonly sectionPath?: string | null;
    readonly pageNumber?: number | null;
    readonly lineStart?: number | null;
    readonly lineEnd?: number | null;
  } | null;
  readonly acceptanceCriteria?: readonly string[];
  readonly tags?: readonly string[];
}

export const aiRequirementItemSchema = z.object({
  id: z.string().uuid(),
  requirementKey: z.string().min(1).max(64),
  title: z.string().min(1).max(255),
  description: z.string(),
  type: z.string(),
  status: z.string(),
  priority: z.string(),
  versionNumber: z.number().int().positive().optional(),
  provenance: z
    .object({
      sourceKind: z.string().optional(),
      sourceText: z.string().nullable().optional(),
      sectionPath: z.string().nullable().optional(),
      pageNumber: z.number().int().nullable().optional(),
      lineStart: z.number().int().nullable().optional(),
      lineEnd: z.number().int().nullable().optional(),
    })
    .nullable()
    .optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export interface AiTestCaseItemDto {
  readonly id: string;
  readonly testCaseKey: string;
  readonly sourceRequirementId?: string | null;
  readonly sourceRequirementKey?: string | null;
  readonly title: string;
  readonly objective?: string;
  readonly type: string;
  readonly priority: string;
  readonly status: string;
  readonly reviewStatus: string;
  readonly preconditions?: readonly string[];
  readonly steps?: readonly {
    readonly stepNumber: number;
    readonly action: string;
    readonly expectedResult?: string | null;
  }[];
  readonly expectedResult?: string | null;
  readonly tags?: readonly string[];
}

export const aiTestCaseItemSchema = z.object({
  id: z.string().uuid(),
  testCaseKey: z.string().min(1).max(64),
  sourceRequirementId: z.string().uuid().nullable().optional(),
  sourceRequirementKey: z.string().nullable().optional(),
  title: z.string().min(1).max(255),
  objective: z.string().optional(),
  type: z.string(),
  priority: z.string(),
  status: z.string(),
  reviewStatus: z.string(),
  preconditions: z.array(z.string()).optional(),
  steps: z
    .array(
      z.object({
        stepNumber: z.number().int().positive(),
        action: z.string(),
        expectedResult: z.string().nullable().optional(),
      }),
    )
    .optional(),
  expectedResult: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export interface AiTraceabilityItemDto {
  readonly id: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly status: string;
  readonly origin: string;
}

export const aiTraceabilityItemSchema = z.object({
  id: z.string().uuid(),
  requirementId: z.string().uuid(),
  requirementKey: z.string().min(1).max(64),
  testCaseId: z.string().uuid(),
  testCaseKey: z.string().min(1).max(64),
  status: z.string(),
  origin: z.string(),
});

export interface AiExecutionSummaryItemDto {
  readonly id: string;
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly status: string;
  readonly durationMs?: number | null;
  readonly errorMessage?: string | null;
  readonly terminalReason?: string | null;
  readonly completedAt?: string | null;
}

export const aiExecutionSummaryItemSchema = z.object({
  id: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseKey: z.string().min(1).max(64),
  status: z.string(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  terminalReason: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});

export interface AiFailureSummaryItemDto {
  readonly id: string;
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly title: string;
  readonly failureSummary?: string | null;
  readonly errorMessage?: string | null;
  readonly errorCode?: string | null;
  readonly status: string;
  readonly failureSignature?: string | null;
}

export const aiFailureSummaryItemSchema = z.object({
  id: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseKey: z.string().min(1).max(64),
  title: z.string().min(1).max(255),
  failureSummary: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  status: z.string(),
  failureSignature: z.string().nullable().optional(),
});

export interface AssembleRequirementTestContextInputDto {
  readonly projectId: string;
  readonly requirementIds?: readonly string[];
  readonly requirementKeys?: readonly string[];
  readonly testCaseIds?: readonly string[];
  readonly testCaseKeys?: readonly string[];
  readonly includeTraceability?: boolean;
  readonly includeExecutions?: boolean;
  readonly includeFailures?: boolean;
  readonly maxTokens?: number;
  readonly maxRequirements?: number;
  readonly maxTestCases?: number;
  readonly maxExecutions?: number;
  readonly maxFailures?: number;
}

export const assembleRequirementTestContextInputSchema = z.object({
  projectId: z.string().uuid(),
  requirementIds: z.array(z.string().uuid()).max(100).optional(),
  requirementKeys: z.array(z.string().min(1).max(64)).max(100).optional(),
  testCaseIds: z.array(z.string().uuid()).max(100).optional(),
  testCaseKeys: z.array(z.string().min(1).max(64)).max(100).optional(),
  includeTraceability: z.boolean().optional(),
  includeExecutions: z.boolean().optional(),
  includeFailures: z.boolean().optional(),
  maxTokens: z.number().int().positive().max(128000).optional(),
  maxRequirements: z.number().int().positive().max(100).optional(),
  maxTestCases: z.number().int().positive().max(100).optional(),
  maxExecutions: z.number().int().positive().max(50).optional(),
  maxFailures: z.number().int().positive().max(50).optional(),
});

export interface RequirementTestContextResultDto {
  readonly projectId: string;
  readonly requirements: readonly AiRequirementItemDto[];
  readonly testCases: readonly AiTestCaseItemDto[];
  readonly traceability: readonly AiTraceabilityItemDto[];
  readonly executions: readonly AiExecutionSummaryItemDto[];
  readonly failures: readonly AiFailureSummaryItemDto[];
  readonly formattedRequirementContext: string;
  readonly formattedTestContext: string;
  readonly formattedUnifiedContext: string;
  readonly estimatedTokens: number;
  readonly truncated: boolean;
  readonly truncationReason?: string | null;
}

export const requirementTestContextResultSchema = z.object({
  projectId: z.string().uuid(),
  requirements: z.array(aiRequirementItemSchema),
  testCases: z.array(aiTestCaseItemSchema),
  traceability: z.array(aiTraceabilityItemSchema),
  executions: z.array(aiExecutionSummaryItemSchema),
  failures: z.array(aiFailureSummaryItemSchema),
  formattedRequirementContext: z.string(),
  formattedTestContext: z.string(),
  formattedUnifiedContext: z.string(),
  estimatedTokens: z.number().int().nonnegative(),
  truncated: z.boolean(),
  truncationReason: z.string().nullable().optional(),
});

// ==============================================================================
// V9 Phase 138 — AI Provider Switching & Fallback DTOs & Schemas
// ==============================================================================

export type AiFallbackPolicyDto =
  'DISABLED' | 'LOCAL_ONLY' | 'CONFIGURED_PROVIDERS' | 'ANY_ALLOWED_PROVIDER';

export const aiFallbackPolicySchema = z.enum([
  'DISABLED',
  'LOCAL_ONLY',
  'CONFIGURED_PROVIDERS',
  'ANY_ALLOWED_PROVIDER',
]);

export type AiProviderFailureReasonDto =
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'MODEL_UNAVAILABLE'
  | 'AUTHENTICATION_FAILURE'
  | 'RATE_LIMITED'
  | 'CAPABILITY_UNSUPPORTED'
  | 'INVALID_RESPONSE'
  | 'STRUCTURED_OUTPUT_FAILURE'
  | 'STREAM_INTERRUPTED'
  | 'CANCELLED'
  | 'POLICY_BLOCKED';

export const aiProviderFailureReasonSchema = z.enum([
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'MODEL_UNAVAILABLE',
  'AUTHENTICATION_FAILURE',
  'RATE_LIMITED',
  'CAPABILITY_UNSUPPORTED',
  'INVALID_RESPONSE',
  'STRUCTURED_OUTPUT_FAILURE',
  'STREAM_INTERRUPTED',
  'CANCELLED',
  'POLICY_BLOCKED',
]);

export interface AiFallbackAttemptDto {
  readonly attemptNumber: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly timestamp: string;
  readonly durationMs: number;
  readonly status: 'SUCCESS' | 'FAILED' | 'RETRYING' | 'FALLBACK_TRIGGERED';
  readonly failureReason?: AiProviderFailureReasonDto;
  readonly errorMessage?: string;
}

export const aiFallbackAttemptSchema = z.object({
  attemptNumber: z.number().int().positive(),
  providerId: z.string().min(1).max(64),
  modelId: z.string().min(1).max(256),
  timestamp: z.string(),
  durationMs: z.number().nonnegative(),
  status: z.enum(['SUCCESS', 'FAILED', 'RETRYING', 'FALLBACK_TRIGGERED']),
  failureReason: aiProviderFailureReasonSchema.optional(),
  errorMessage: z.string().optional(),
});

export interface AiProviderRegistryItemDto {
  readonly providerId: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly available: boolean;
  readonly isLocal: boolean;
  readonly priority: number;
  readonly health: AiProviderStatusDto;
  readonly capabilities: AiProviderCapabilitiesDto;
  readonly models: readonly AiModelDto[];
}

export const aiProviderRegistryItemSchema = z.object({
  providerId: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  enabled: z.boolean(),
  available: z.boolean(),
  isLocal: z.boolean(),
  priority: z.number().int(),
  health: aiProviderStatusSchema,
  capabilities: aiProviderCapabilitiesSchema,
  models: z.array(aiModelSchema),
});

export interface AiFallbackSettingsDto {
  readonly id: string;
  readonly projectId?: string | null;
  readonly userId?: string | null;
  readonly preferredProvider: string;
  readonly preferredModel?: string | null;
  readonly fallbackPolicy: AiFallbackPolicyDto;
  readonly fallbackPriority: readonly string[];
  readonly maxRetries: number;
  readonly requestTimeoutMs: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const aiFallbackSettingsSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  preferredProvider: z.string().min(1).max(64),
  preferredModel: z.string().max(256).nullable().optional(),
  fallbackPolicy: aiFallbackPolicySchema,
  fallbackPriority: z.array(z.string().min(1).max(64)),
  maxRetries: z.number().int().min(0).max(10),
  requestTimeoutMs: z.number().int().min(1000).max(600000),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export interface GetAiFallbackSettingsInputDto {
  readonly projectId?: string | null;
}

export const getAiFallbackSettingsInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
});

export interface UpdateAiFallbackSettingsInputDto {
  readonly projectId?: string | null;
  readonly preferredProvider?: string;
  readonly preferredModel?: string | null;
  readonly fallbackPolicy?: AiFallbackPolicyDto;
  readonly fallbackPriority?: readonly string[];
  readonly maxRetries?: number;
  readonly requestTimeoutMs?: number;
}

export const updateAiFallbackSettingsInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  preferredProvider: z.string().min(1).max(64).optional(),
  preferredModel: z.string().max(256).nullable().optional(),
  fallbackPolicy: aiFallbackPolicySchema.optional(),
  fallbackPriority: z.array(z.string().min(1).max(64)).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  requestTimeoutMs: z.number().int().min(1000).max(600000).optional(),
});

export interface GetAiProviderRegistryStatusInputDto {
  readonly projectId?: string | null;
}

export const getAiProviderRegistryStatusInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
});

export interface AiProviderSelectionCriteriaDto {
  readonly projectId?: string | null;
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;
  readonly requiredCapabilities?: readonly ModelCapabilityType[];
  readonly requiresStreaming?: boolean;
  readonly requiresStructuredOutput?: boolean;
  readonly requiresToolCalling?: boolean;
  readonly minContextTokens?: number;
}

export const aiProviderSelectionCriteriaSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  requestedProviderId: z.string().min(1).max(64).optional(),
  requestedModelId: z.string().min(1).max(256).optional(),
  requiredCapabilities: z.array(modelCapabilityTypeSchema).optional(),
  requiresStreaming: z.boolean().optional(),
  requiresStructuredOutput: z.boolean().optional(),
  requiresToolCalling: z.boolean().optional(),
  minContextTokens: z.number().int().positive().optional(),
});

export interface AiProviderSelectionResultDto {
  readonly providerId: string;
  readonly modelId: string;
  readonly isLocal: boolean;
  readonly isFallback: boolean;
  readonly selectionReason: string;
  readonly attemptedProviders: readonly string[];
}

export const aiProviderSelectionResultSchema = z.object({
  providerId: z.string().min(1).max(64),
  modelId: z.string().min(1).max(256),
  isLocal: z.boolean(),
  isFallback: z.boolean(),
  selectionReason: z.string(),
  attemptedProviders: z.array(z.string()),
});

// ============================================================================
// V9 Phase 139: Performance, Cancellation & Runtime Recovery Types & Schemas
// ============================================================================

export type AiLifecycleState =
  | 'QUEUED'
  | 'STARTING'
  | 'RUNNING'
  | 'STREAMING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'MODEL_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'INTERRUPTED'
  | 'RECOVERY_REQUIRED';

export const aiLifecycleStateSchema = z.enum([
  'QUEUED',
  'STARTING',
  'RUNNING',
  'STREAMING',
  'COMPLETED',
  'CANCELLED',
  'TIMEOUT',
  'PROVIDER_ERROR',
  'MODEL_ERROR',
  'NETWORK_ERROR',
  'INVALID_RESPONSE',
  'INTERRUPTED',
  'RECOVERY_REQUIRED',
]);

export interface AiRuntimeMetricsDto {
  readonly connectionLatencyMs: number;
  readonly modelStartupLatencyMs: number;
  readonly timeToFirstTokenMs?: number | null;
  readonly generationDurationMs: number;
  readonly streamDurationMs?: number | null;
  readonly tokensGenerated?: number | null;
  readonly requestCompletionRate: number;
  readonly cancellationLatencyMs?: number | null;
  readonly retryCount: number;
  readonly totalRequestsTracked: number;
  readonly activeRequestsCount: number;
}

export const aiRuntimeMetricsSchema = z.object({
  connectionLatencyMs: z.number().nonnegative(),
  modelStartupLatencyMs: z.number().nonnegative(),
  timeToFirstTokenMs: z.number().nonnegative().nullable().optional(),
  generationDurationMs: z.number().nonnegative(),
  streamDurationMs: z.number().nonnegative().nullable().optional(),
  tokensGenerated: z.number().int().nonnegative().nullable().optional(),
  requestCompletionRate: z.number().min(0).max(1),
  cancellationLatencyMs: z.number().nonnegative().nullable().optional(),
  retryCount: z.number().int().nonnegative(),
  totalRequestsTracked: z.number().int().nonnegative(),
  activeRequestsCount: z.number().int().nonnegative(),
});

export interface AiActiveRequestDto {
  readonly requestId: string;
  readonly projectId?: string | null;
  readonly providerId: string;
  readonly modelId: string;
  readonly state: AiLifecycleState;
  readonly promptLength: number;
  readonly isStreaming: boolean;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly tokensGenerated?: number | null;
  readonly error?: string | null;
}

export const aiActiveRequestSchema = z.object({
  requestId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  providerId: z.string().min(1).max(64),
  modelId: z.string().min(1).max(256),
  state: aiLifecycleStateSchema,
  promptLength: z.number().int().nonnegative(),
  isStreaming: z.boolean(),
  startedAt: z.string(),
  durationMs: z.number().nonnegative(),
  tokensGenerated: z.number().int().nonnegative().nullable().optional(),
  error: z.string().nullable().optional(),
});

export interface RecoverInterruptedRequestsInputDto {
  readonly projectId?: string | null;
}

export const recoverInterruptedRequestsInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
});

export interface RecoverInterruptedRequestsResultDto {
  readonly recoveredCount: number;
  readonly updatedRequestIds: readonly string[];
}

export const recoverInterruptedRequestsResultSchema = z.object({
  recoveredCount: z.number().int().nonnegative(),
  updatedRequestIds: z.array(z.string().uuid()),
});

// ============================================================================
// Conversational AI Testing Agent Contracts (V8 Phase 124)
// ============================================================================

export type AgentSessionStatus =
  'IDLE' | 'THINKING' | 'PLANNING' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export const agentSessionStatusSchema = z.enum([
  'IDLE',
  'THINKING',
  'PLANNING',
  'RUNNING',
  'WAITING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export type AgentMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export const agentMessageRoleSchema = z.enum(['USER', 'ASSISTANT', 'SYSTEM', 'TOOL']);

export type AgentTaskStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'IN_PROGRESS'
  | 'AWAITING_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export const agentTaskStatusSchema = z.enum([
  'PENDING',
  'PLANNING',
  'IN_PROGRESS',
  'AWAITING_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export type AgentApprovalState = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export const agentApprovalStateSchema = z.enum(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED']);

export type AgentRunControlAction = 'START' | 'PAUSE' | 'RESUME' | 'CANCEL' | 'RETRY' | 'STOP';

export const agentRunControlActionSchema = z.enum([
  'START',
  'PAUSE',
  'RESUME',
  'CANCEL',
  'RETRY',
  'STOP',
]);

export interface AgentPlanStepDto {
  readonly stepIndex: number;
  readonly action: string;
  readonly description: string;
  readonly targetTool?: string | null;
  readonly status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  readonly isDestructive: boolean;
  readonly requiresApproval: boolean;
}

export const agentPlanStepSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  action: z.string().min(1),
  description: z.string(),
  targetTool: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED']),
  isDestructive: z.boolean(),
  requiresApproval: z.boolean(),
});

export interface AgentPlanDto {
  readonly summary: string;
  readonly intent: string;
  readonly steps: readonly AgentPlanStepDto[];
  readonly requiresApproval: boolean;
  readonly approvalReason?: string | null;
}

export const agentPlanSchema = z.object({
  summary: z.string(),
  intent: z.string(),
  steps: z.array(agentPlanStepSchema),
  requiresApproval: z.boolean(),
  approvalReason: z.string().nullable().optional(),
});

export interface AgentActivityDto {
  readonly type:
    'THINKING' | 'PLANNING' | 'TOOL_CALLING' | 'EXECUTING' | 'EVALUATING' | 'COMPLETED' | 'ERROR';
  readonly message: string;
  readonly timestamp: string;
  readonly details?: Record<string, unknown> | null;
}

export const agentActivitySchema = z.object({
  type: z.enum([
    'THINKING',
    'PLANNING',
    'TOOL_CALLING',
    'EXECUTING',
    'EVALUATING',
    'COMPLETED',
    'ERROR',
  ]),
  message: z.string(),
  timestamp: z.string(),
  details: z.record(z.unknown()).nullable().optional(),
});

export interface AgentEvidenceReferenceDto {
  readonly evidenceId: string;
  readonly artifactType:
    'SCREENSHOT' | 'CONSOLE_LOG' | 'NETWORK_TRACE' | 'DOM_SNAPSHOT' | 'STEP_RESULT';
  readonly title: string;
  readonly urlOrPath?: string | null;
  readonly stepNumber?: number | null;
  readonly timestamp?: string | null;
  readonly actualResult?: string | null;
  readonly expectedResult?: string | null;
  readonly failureClassification?: string | null;
}

export const agentEvidenceReferenceSchema = z.object({
  evidenceId: z.string(),
  artifactType: z.enum([
    'SCREENSHOT',
    'CONSOLE_LOG',
    'NETWORK_TRACE',
    'DOM_SNAPSHOT',
    'STEP_RESULT',
  ]),
  title: z.string(),
  urlOrPath: z.string().nullable().optional(),
  stepNumber: z.number().int().nullable().optional(),
  timestamp: z.string().nullable().optional(),
  actualResult: z.string().nullable().optional(),
  expectedResult: z.string().nullable().optional(),
  failureClassification: z.string().nullable().optional(),
});

export interface AgentMessageDto {
  readonly id: string;
  readonly sessionId: string;
  readonly role: AgentMessageRole;
  readonly content: string;
  readonly plan?: AgentPlanDto | null;
  readonly toolCalls?: readonly unknown[] | null;
  readonly toolResults?: readonly unknown[] | null;
  readonly evidenceRefs?: readonly AgentEvidenceReferenceDto[] | null;
  readonly runId?: string | null;
  readonly tokenCount?: number | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly createdAt: string;
}

export const agentMessageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: agentMessageRoleSchema,
  content: z.string(),
  plan: agentPlanSchema.nullable().optional(),
  toolCalls: z.array(z.unknown()).nullable().optional(),
  toolResults: z.array(z.unknown()).nullable().optional(),
  evidenceRefs: z.array(agentEvidenceReferenceSchema).nullable().optional(),
  runId: z.string().uuid().nullable().optional(),
  tokenCount: z.number().int().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string(),
});

export interface AgentTaskDto {
  readonly id: string;
  readonly sessionId: string;
  readonly projectId: string;
  readonly userPrompt: string;
  readonly status: AgentTaskStatus;
  readonly approvalState: AgentApprovalState;
  readonly plan?: AgentPlanDto | null;
  readonly activeRunId?: string | null;
  readonly toolHistory?: readonly unknown[] | null;
  readonly evidenceRefs?: readonly AgentEvidenceReferenceDto[] | null;
  readonly resultSummary?: string | null;
  readonly errorMessage?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const agentTaskSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  projectId: z.string().uuid(),
  userPrompt: z.string(),
  status: agentTaskStatusSchema,
  approvalState: agentApprovalStateSchema,
  plan: agentPlanSchema.nullable().optional(),
  activeRunId: z.string().uuid().nullable().optional(),
  toolHistory: z.array(z.unknown()).nullable().optional(),
  evidenceRefs: z.array(agentEvidenceReferenceSchema).nullable().optional(),
  resultSummary: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export interface AgentSessionDto {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly title: string;
  readonly status: AgentSessionStatus;
  readonly approvalState: AgentApprovalState;
  readonly activeRunId?: string | null;
  readonly currentTaskId?: string | null;
  readonly contextSnapshot?: Record<string, unknown> | null;
  readonly messages: readonly AgentMessageDto[];
  readonly currentTask?: AgentTaskDto | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const agentSessionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string(),
  status: agentSessionStatusSchema,
  approvalState: agentApprovalStateSchema,
  activeRunId: z.string().uuid().nullable().optional(),
  currentTaskId: z.string().uuid().nullable().optional(),
  contextSnapshot: z.record(z.unknown()).nullable().optional(),
  messages: z.array(agentMessageSchema),
  currentTask: agentTaskSchema.nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export interface CreateAgentSessionInputDto {
  readonly projectId: string;
  readonly title?: string;
}

export const createAgentSessionInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
});

export interface GetAgentSessionInputDto {
  readonly sessionId: string;
  readonly projectId: string;
}

export const getAgentSessionInputSchema = z.object({
  sessionId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export interface ListAgentSessionsInputDto {
  readonly projectId: string;
  readonly limit?: number;
}

export const listAgentSessionsInputSchema = z.object({
  projectId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional(),
});

export interface DeleteAgentSessionInputDto {
  readonly sessionId: string;
  readonly projectId: string;
}

export const deleteAgentSessionInputSchema = z.object({
  sessionId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export interface SendAgentMessageInputDto {
  readonly sessionId: string;
  readonly projectId: string;
  readonly content: string;
  readonly requireApprovalForDestructive?: boolean;
}

export const sendAgentMessageInputSchema = z.object({
  sessionId: z.string().uuid(),
  projectId: z.string().uuid(),
  content: z.string().trim().min(1).max(10000),
  requireApprovalForDestructive: z.boolean().optional(),
});

export interface AgentMessageResponseDto {
  readonly userMessage: AgentMessageDto;
  readonly agentMessage: AgentMessageDto;
  readonly task?: AgentTaskDto | null;
  readonly activities: readonly AgentActivityDto[];
  readonly sessionStatus: AgentSessionStatus;
}

export const agentMessageResponseSchema = z.object({
  userMessage: agentMessageSchema,
  agentMessage: agentMessageSchema,
  task: agentTaskSchema.nullable().optional(),
  activities: z.array(agentActivitySchema),
  sessionStatus: agentSessionStatusSchema,
});

export interface ApproveAgentActionInputDto {
  readonly sessionId: string;
  readonly projectId: string;
  readonly taskId?: string;
  readonly approved: boolean;
  readonly reason?: string;
}

export const approveAgentActionInputSchema = z.object({
  sessionId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  approved: z.boolean(),
  reason: z.string().max(1000).optional(),
});

export interface AgentActionApprovalResultDto {
  readonly sessionId: string;
  readonly approvalState: AgentApprovalState;
  readonly status: AgentSessionStatus;
  readonly message: string;
  readonly agentMessage?: AgentMessageDto | null;
}

export const agentActionApprovalResultSchema = z.object({
  sessionId: z.string().uuid(),
  approvalState: agentApprovalStateSchema,
  status: agentSessionStatusSchema,
  message: z.string(),
  agentMessage: agentMessageSchema.nullable().optional(),
});

export interface AgentRunControlInputDto {
  readonly sessionId: string;
  readonly projectId: string;
  readonly action: AgentRunControlAction;
  readonly runId?: string;
  readonly reason?: string;
}

export const agentRunControlInputSchema = z.object({
  sessionId: z.string().uuid(),
  projectId: z.string().uuid(),
  action: agentRunControlActionSchema,
  runId: z.string().uuid().optional(),
  reason: z.string().max(1000).optional(),
});

export interface AgentRunControlResultDto {
  readonly sessionId: string;
  readonly runId?: string | null;
  readonly action: AgentRunControlAction;
  readonly success: boolean;
  readonly runStatus?: string | null;
  readonly message: string;
}

export const agentRunControlResultSchema = z.object({
  sessionId: z.string().uuid(),
  runId: z.string().uuid().nullable().optional(),
  action: agentRunControlActionSchema,
  success: z.boolean(),
  runStatus: z.string().nullable().optional(),
  message: z.string(),
});

export interface GetAgentEvidenceInputDto {
  readonly projectId: string;
  readonly runId?: string;
  readonly testCaseId?: string;
  readonly query?: string;
}

export const getAgentEvidenceInputSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  testCaseId: z.string().uuid().optional(),
  query: z.string().max(500).optional(),
});

export interface AgentEvidenceQueryResultDto {
  readonly runId?: string | null;
  readonly testCaseKey?: string | null;
  readonly requirementKey?: string | null;
  readonly verdict?: string | null;
  readonly evidenceItems: readonly AgentEvidenceReferenceDto[];
  readonly failureAnalysis?: {
    readonly rootCause?: string | null;
    readonly failureSignature?: string | null;
    readonly classification?: string | null;
    readonly suggestedFix?: string | null;
  } | null;
  readonly naturalLanguageExplanation?: string | null;
}

export const agentEvidenceQueryResultSchema = z.object({
  runId: z.string().uuid().nullable().optional(),
  testCaseKey: z.string().nullable().optional(),
  requirementKey: z.string().nullable().optional(),
  verdict: z.string().nullable().optional(),
  evidenceItems: z.array(agentEvidenceReferenceSchema),
  failureAnalysis: z
    .object({
      rootCause: z.string().nullable().optional(),
      failureSignature: z.string().nullable().optional(),
      classification: z.string().nullable().optional(),
      suggestedFix: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  naturalLanguageExplanation: z.string().nullable().optional(),
});

// ==============================================================================
// V10 Phase 141: Agent Runtime Foundation
// ==============================================================================

export const AGENT_RUNTIME_STATES = [
  'IDLE',
  'THINKING',
  'TOOL_CALLING',
  'WAITING_FOR_TOOL',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
  'TIMEOUT',
] as const;

export type AgentRuntimeState = (typeof AGENT_RUNTIME_STATES)[number];

export const agentRuntimeStateSchema = z.enum(AGENT_RUNTIME_STATES);

export const agentRuntimeToolCallDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type AgentRuntimeToolCallDto = z.infer<typeof agentRuntimeToolCallDtoSchema>;

export const agentRuntimeTaskResultDtoSchema = z.object({
  output: z.string(),
  toolCallsExecuted: z.number().int().default(0),
  iterations: z.number().int().default(1),
  durationMs: z.number().default(0),
  metadata: z.record(z.unknown()).optional(),
});
export type AgentRuntimeTaskResultDto = z.infer<typeof agentRuntimeTaskResultDtoSchema>;

export const agentRuntimeTaskDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  threadId: z.string().optional(),
  userRequest: z.string(),
  state: agentRuntimeStateSchema,
  currentIteration: z.number().int().default(0),
  maxIterations: z.number().int().default(10),
  timeoutMs: z.number().int().default(120000),
  providerId: z.string().default('OLLAMA'),
  modelId: z.string().optional(),
  toolCalls: z.array(agentRuntimeToolCallDtoSchema).default([]),
  result: agentRuntimeTaskResultDtoSchema.nullable().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .nullable()
    .optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  completedAt: z.string().or(z.date()).nullable().optional(),
});
export type AgentRuntimeTaskDto = z.infer<typeof agentRuntimeTaskDtoSchema>;

export const agentRuntimeTaskEventDtoSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  projectId: z.string().uuid(),
  threadId: z.string().optional(),
  eventType: z.string(),
  previousState: agentRuntimeStateSchema.optional(),
  newState: agentRuntimeStateSchema.optional(),
  iteration: z.number().int().optional(),
  payload: z.record(z.unknown()).default({}),
  timestamp: z.string().or(z.date()),
});
export type AgentRuntimeTaskEventDto = z.infer<typeof agentRuntimeTaskEventDtoSchema>;

export const createAgentRuntimeTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().optional(),
  userRequest: z.string().min(1, 'User request cannot be empty'),
  providerId: z.string().optional().default('OLLAMA'),
  modelId: z.string().optional(),
  maxIterations: z.number().int().min(1).max(50).optional().default(10),
  timeoutMs: z.number().int().min(1000).max(600000).optional().default(120000),
  contextPayload: z
    .object({
      requirementIds: z.array(z.string().uuid()).optional(),
      testCaseIds: z.array(z.string().uuid()).optional(),
      repositoryPath: z.string().optional(),
      priorMessages: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant', 'system', 'tool']),
            content: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});
export type CreateAgentRuntimeTaskInputDto = z.input<typeof createAgentRuntimeTaskInputSchema>;

export const getAgentRuntimeTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type GetAgentRuntimeTaskInputDto = z.infer<typeof getAgentRuntimeTaskInputSchema>;

export const cancelAgentRuntimeTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  reason: z.string().optional().default('User requested cancellation'),
});
export type CancelAgentRuntimeTaskInputDto = z.infer<typeof cancelAgentRuntimeTaskInputSchema>;

export const getAgentRuntimeTaskEventsInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type GetAgentRuntimeTaskEventsInputDto = z.infer<
  typeof getAgentRuntimeTaskEventsInputSchema
>;

// ==============================================================================
// V10 Phase 145: Repository Read / Search Tools Contracts & DTOs
// ==============================================================================

export const repoListFilesInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relativeDirectory: z.string().optional().default('.'),
  recursive: z.boolean().optional().default(false),
  maxFiles: z.number().int().min(1).max(5000).optional().default(1000),
  maxDepth: z.number().int().min(1).max(20).optional().default(10),
});
export type RepoListFilesInputDto = z.infer<typeof repoListFilesInputSchema>;

export const repoFileItemDtoSchema = z.object({
  relativePath: z.string(),
  name: z.string(),
  type: z.enum(['file', 'directory', 'symlink']),
  sizeBytes: z.number().int().nonnegative(),
  extension: z.string(),
  modifiedAt: z.string(),
});
export type RepoFileItemDto = z.infer<typeof repoFileItemDtoSchema>;

export const repoListFilesOutputSchema = z.object({
  relativeDirectory: z.string(),
  items: z.array(repoFileItemDtoSchema),
  totalCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type RepoListFilesOutputDto = z.infer<typeof repoListFilesOutputSchema>;

export const repoReadFileInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relativePath: z.string().min(1, 'Relative file path is required.'),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  maxSizeBytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024)
    .optional()
    .default(2 * 1024 * 1024),
  maxOutputChars: z.number().int().min(1).max(500000).optional().default(100000),
});
export type RepoReadFileInputDto = z.infer<typeof repoReadFileInputSchema>;

export const repoReadFileOutputSchema = z.object({
  relativePath: z.string(),
  content: z.string(),
  lineCount: z.number().int().nonnegative(),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  sizeBytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  encoding: z.literal('utf-8'),
});
export type RepoReadFileOutputDto = z.infer<typeof repoReadFileOutputSchema>;

export const repoSearchFilesInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  query: z.string().min(1, 'Search query cannot be empty.').max(1000),
  isRegex: z.boolean().optional().default(false),
  caseSensitive: z.boolean().optional().default(false),
  relativeDirectory: z.string().optional().default('.'),
  maxResults: z.number().int().min(1).max(200).optional().default(50),
  contextLines: z.number().int().min(0).max(5).optional().default(1),
});
export type RepoSearchFilesInputDto = z.infer<typeof repoSearchFilesInputSchema>;

export const repoSearchMatchDtoSchema = z.object({
  relativePath: z.string(),
  lineNumber: z.number().int().positive(),
  matchLine: z.string(),
  beforeContext: z.array(z.string()).default([]),
  afterContext: z.array(z.string()).default([]),
});
export type RepoSearchMatchDto = z.infer<typeof repoSearchMatchDtoSchema>;

export const repoSearchFilesOutputSchema = z.object({
  query: z.string(),
  isRegex: z.boolean(),
  matches: z.array(repoSearchMatchDtoSchema),
  totalMatches: z.number().int().nonnegative(),
  filesScanned: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type RepoSearchFilesOutputDto = z.infer<typeof repoSearchFilesOutputSchema>;

export const repoFindSymbolInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  symbolName: z.string().min(1, 'Symbol name is required.').max(200),
  relativePath: z.string().optional(),
  exactMatch: z.boolean().optional().default(true),
  maxResults: z.number().int().min(1).max(50).optional().default(20),
});
export type RepoFindSymbolInputDto = z.infer<typeof repoFindSymbolInputSchema>;

export const repoSymbolMatchDtoSchema = z.object({
  name: z.string(),
  kind: z.string(),
  relativePath: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  declarationSnippet: z.string(),
  isExported: z.boolean().optional(),
});
export type RepoSymbolMatchDto = z.infer<typeof repoSymbolMatchDtoSchema>;

export const repoFindSymbolOutputSchema = z.object({
  symbolName: z.string(),
  symbols: z.array(repoSymbolMatchDtoSchema),
  totalFound: z.number().int().nonnegative(),
  language: z.string(),
  parsedFilesCount: z.number().int().nonnegative(),
});
export type RepoFindSymbolOutputDto = z.infer<typeof repoFindSymbolOutputSchema>;

export const repoGetFileMetadataInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  relativePath: z.string().min(1, 'Relative path is required.'),
});
export type RepoGetFileMetadataInputDto = z.infer<typeof repoGetFileMetadataInputSchema>;

export const repoGetFileMetadataOutputSchema = z.object({
  relativePath: z.string(),
  extension: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: z.string(),
  isDirectory: z.boolean(),
  isBinary: z.boolean(),
  lineCount: z.number().int().nonnegative().nullable(),
});
export type RepoGetFileMetadataOutputDto = z.infer<typeof repoGetFileMetadataOutputSchema>;

// ==============================================================================
// V10 Phase 146: Requirement & Test Intelligence Tools Contracts & DTOs
// ==============================================================================

// 1. requirements.list
export const reqListRequirementsInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  status: z.string().optional(),
  type: z.string().optional(),
  priority: z.string().optional(),
});
export type ReqListRequirementsInputDto = z.input<typeof reqListRequirementsInputSchema>;

export const reqListItemDtoSchema = z.object({
  id: z.string().uuid(),
  requirementKey: z.string(),
  title: z.string(),
  descriptionSummary: z.string(),
  status: z.string(),
  type: z.string(),
  priority: z.string(),
  latestVersion: z.number().int(),
  sourceType: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReqListItemDto = z.infer<typeof reqListItemDtoSchema>;

export const reqListRequirementsOutputSchema = z.object({
  items: z.array(reqListItemDtoSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type ReqListRequirementsOutputDto = z.infer<typeof reqListRequirementsOutputSchema>;

// 2. requirements.get
export const reqGetRequirementInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().min(1, 'Requirement ID or Key is required.'),
});
export type ReqGetRequirementInputDto = z.input<typeof reqGetRequirementInputSchema>;

export const reqGetRequirementOutputSchema = z.object({
  id: z.string().uuid(),
  requirementKey: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.string(),
  type: z.string(),
  priority: z.string(),
  versionNumber: z.number().int(),
  source: z
    .object({
      sourceId: z.string().nullable(),
      sourceType: z.string().nullable(),
      documentName: z.string().nullable(),
      rawExcerpt: z.string().nullable(),
    })
    .nullable()
    .optional(),
  tags: z.array(z.string()).default([]),
  tracedTestCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReqGetRequirementOutputDto = z.infer<typeof reqGetRequirementOutputSchema>;

// 3. requirements.search
export const reqSearchRequirementsInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  query: z.string().min(1, 'Search query cannot be empty.').max(500),
  limit: z.number().int().min(1).max(50).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
});
export type ReqSearchRequirementsInputDto = z.input<typeof reqSearchRequirementsInputSchema>;

export const reqSearchMatchDtoSchema = z.object({
  id: z.string().uuid(),
  requirementKey: z.string(),
  title: z.string(),
  snippet: z.string(),
  status: z.string(),
  priority: z.string(),
  matchScore: z.number().optional(),
});
export type ReqSearchMatchDto = z.infer<typeof reqSearchMatchDtoSchema>;

export const reqSearchRequirementsOutputSchema = z.object({
  query: z.string(),
  items: z.array(reqSearchMatchDtoSchema),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type ReqSearchRequirementsOutputDto = z.infer<typeof reqSearchRequirementsOutputSchema>;

// 4. tests.list
export const testListTestsInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  status: z.string().optional(),
  type: z.string().optional(),
  priority: z.string().optional(),
});
export type TestListTestsInputDto = z.input<typeof testListTestsInputSchema>;

export const testListItemDtoSchema = z.object({
  id: z.string().uuid(),
  testKey: z.string(),
  title: z.string(),
  summary: z.string(),
  status: z.string(),
  type: z.string(),
  priority: z.string(),
  stepCount: z.number().int().nonnegative(),
  requirementId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TestListItemDto = z.infer<typeof testListItemDtoSchema>;

export const testListTestsOutputSchema = z.object({
  items: z.array(testListItemDtoSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type TestListTestsOutputDto = z.infer<typeof testListTestsOutputSchema>;

// 5. tests.get
export const testGetTestInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  testCaseId: z.string().min(1, 'Test Case ID or Key is required.'),
});
export type TestGetTestInputDto = z.input<typeof testGetTestInputSchema>;

export const testGetTestOutputSchema = z.object({
  id: z.string().uuid(),
  testKey: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.string(),
  type: z.string(),
  priority: z.string(),
  preconditions: z.array(z.string()).default([]),
  steps: z.array(
    z.object({
      stepNumber: z.number().int().positive(),
      action: z.string(),
      expectedResult: z.string().nullable().optional(),
      testData: z.string().nullable().optional(),
    }),
  ),
  sourceRequirement: z
    .object({
      requirementId: z.string().uuid(),
      requirementKey: z.string(),
      title: z.string(),
      status: z.string(),
    })
    .nullable()
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TestGetTestOutputDto = z.infer<typeof testGetTestOutputSchema>;

// 6. tests.search
export const testSearchTestsInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  query: z.string().min(1, 'Search query cannot be empty.').max(500),
  limit: z.number().int().min(1).max(50).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
});
export type TestSearchTestsInputDto = z.input<typeof testSearchTestsInputSchema>;

export const testSearchMatchDtoSchema = z.object({
  id: z.string().uuid(),
  testKey: z.string(),
  title: z.string(),
  snippet: z.string(),
  status: z.string(),
  priority: z.string(),
});
export type TestSearchMatchDto = z.infer<typeof testSearchMatchDtoSchema>;

export const testSearchTestsOutputSchema = z.object({
  query: z.string(),
  items: z.array(testSearchMatchDtoSchema),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type TestSearchTestsOutputDto = z.infer<typeof testSearchTestsOutputSchema>;

// 7. tests.forRequirement
export const testForRequirementInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().min(1, 'Requirement ID or Key is required.'),
  limit: z.number().int().min(1).max(50).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});
export type TestForRequirementInputDto = z.input<typeof testForRequirementInputSchema>;

export const testForRequirementOutputSchema = z.object({
  requirementId: z.string(),
  requirementKey: z.string(),
  requirementTitle: z.string(),
  items: z.array(testListItemDtoSchema),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type TestForRequirementOutputDto = z.infer<typeof testForRequirementOutputSchema>;

// 8. traceability.get
export const traceabilityGetInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  requirementId: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});
export type TraceabilityGetInputDto = z.input<typeof traceabilityGetInputSchema>;

export const traceabilityToolMatrixItemDtoSchema = z.object({
  requirementId: z.string().uuid(),
  requirementKey: z.string(),
  requirementTitle: z.string(),
  status: z.string(),
  priority: z.string(),
  coverageStatus: z.string(),
  coveragePercentage: z.number().nullable(),
  linkedTestCount: z.number().int().nonnegative(),
  tests: z.array(
    z.object({
      testCaseId: z.string().uuid(),
      testCaseKey: z.string(),
      title: z.string(),
      status: z.string(),
      isCurrent: z.boolean().optional(),
    }),
  ),
});
export type TraceabilityToolMatrixItemDto = z.infer<typeof traceabilityToolMatrixItemDtoSchema>;

export const traceabilityGetOutputSchema = z.object({
  projectId: z.string().uuid(),
  items: z.array(traceabilityToolMatrixItemDtoSchema),
  total: z.number().int().nonnegative(),
  coveredCount: z.number().int().nonnegative(),
  uncoveredCount: z.number().int().nonnegative(),
  overallCoveragePercentage: z.number(),
  truncated: z.boolean(),
});
export type TraceabilityGetOutputDto = z.infer<typeof traceabilityGetOutputSchema>;

// ==============================================================================
// V10 Phase 147: Playwright Execution Tool Contracts & DTOs
// ==============================================================================

export const playwrightExecuteBrowserEngineSchema = z.enum(['chromium', 'firefox', 'webkit']);
export type PlaywrightExecuteBrowserEngine = z.infer<typeof playwrightExecuteBrowserEngineSchema>;

export const playwrightExecuteInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID.'),
  testCaseId: z.string().min(1, 'Test Case ID or Key is required.'),
  taskId: z.string().uuid().optional(),
  stepId: z.string().uuid().optional(),
  targetUrl: z.string().url().optional(),
  browserEngine: playwrightExecuteBrowserEngineSchema.optional().default('chromium'),
  headless: z.boolean().optional().default(true),
  timeoutMs: z.number().int().min(1000).max(120000).optional().default(30000),
  retryCount: z.number().int().min(0).max(3).optional().default(0),
  allowDestructive: z.boolean().optional().default(false),
  environmentId: z.string().uuid().optional(),
});
export type PlaywrightExecuteInputDto = z.input<typeof playwrightExecuteInputSchema>;

export const playwrightStepResultDtoSchema = z.object({
  stepId: z.string(),
  sequence: z.number().int(),
  action: z.string(),
  status: z.enum(['PASSED', 'FAILED', 'CANCELLED', 'SKIPPED']),
  durationMs: z.number().int().nonnegative(),
  errorMessage: z.string().nullable().optional(),
  assertionCount: z.number().int().nonnegative(),
});
export type PlaywrightStepResultDto = z.infer<typeof playwrightStepResultDtoSchema>;

export const playwrightEvidenceReferencesDtoSchema = z.object({
  bundleId: z.string().uuid().nullable().optional(),
  screenshotPaths: z.array(z.string()).default([]),
  tracePath: z.string().nullable().optional(),
  consoleLogCount: z.number().int().nonnegative().default(0),
  networkLogCount: z.number().int().nonnegative().default(0),
  domSnapshotCaptured: z.boolean().default(false),
});
export type PlaywrightEvidenceReferencesDto = z.infer<typeof playwrightEvidenceReferencesDtoSchema>;

export const playwrightFailureClassificationDtoSchema = z.object({
  category: z.string(),
  subcategory: z.string().nullable().optional(),
  reason: z.string(),
  isApplicationDefect: z.boolean(),
  isAutomationFailure: z.boolean(),
  isEnvironmentFailure: z.boolean(),
  isTestDataFailure: z.boolean(),
});
export type PlaywrightFailureClassificationDto = z.infer<
  typeof playwrightFailureClassificationDtoSchema
>;

export const playwrightExecuteOutputSchema = z.object({
  executionId: z.string().uuid(),
  testRunId: z.string().uuid(),
  taskId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  testCaseKey: z.string(),
  testCaseTitle: z.string(),
  status: z.enum(['PASSED', 'FAILED', 'CANCELLED']),
  passed: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  totalSteps: z.number().int().nonnegative(),
  passedSteps: z.number().int().nonnegative(),
  failedSteps: z.number().int().nonnegative(),
  stepResults: z.array(playwrightStepResultDtoSchema),
  failureClassification: playwrightFailureClassificationDtoSchema.nullable().optional(),
  evidence: playwrightEvidenceReferencesDtoSchema,
  summary: z.string(),
});
export type PlaywrightExecuteOutputDto = z.infer<typeof playwrightExecuteOutputSchema>;

// ============================================================================
// V10 Phase 148: Failure Intelligence Tool (failure_intelligence.analyze)
// ============================================================================

export const failureIntelligenceAnalyzeOptionsSchema = z.object({
  includeEvidenceDetails: z.boolean().optional().default(true),
  includeReproductionSummary: z.boolean().optional().default(true),
  includeRootCauseHypothesis: z.boolean().optional().default(true),
  includeDefectReport: z.boolean().optional().default(true),
  includeClustering: z.boolean().optional().default(true),
});
export type FailureIntelligenceAnalyzeOptionsDto = z.infer<
  typeof failureIntelligenceAnalyzeOptionsSchema
>;

export const failureIntelligenceAnalyzeInputSchema = z
  .object({
    projectId: z.string().uuid(),
    taskId: z.string().uuid().nullable().optional(),
    executionId: z.string().uuid().nullable().optional(),
    failureId: z.string().uuid().nullable().optional(),
    options: failureIntelligenceAnalyzeOptionsSchema.optional(),
  })
  .refine(data => data.executionId || data.failureId, {
    message: 'Either executionId or failureId must be provided for failure intelligence analysis.',
    path: ['executionId'],
  });
export type FailureIntelligenceAnalyzeInputDto = z.input<
  typeof failureIntelligenceAnalyzeInputSchema
>;

export const failureIntelligenceReproductionSummaryDtoSchema = z.object({
  status: z.string(),
  attemptCount: z.number().int().nonnegative(),
  reproducedCount: z.number().int().nonnegative(),
  reproducibilityRatio: z.number().min(0).max(1).nullable().optional(),
});
export type FailureIntelligenceReproductionSummaryDto = z.infer<
  typeof failureIntelligenceReproductionSummaryDtoSchema
>;

export const failureIntelligenceEvidenceItemDtoSchema = z.object({
  id: z.string(),
  artifactType: z.string(),
  logicalName: z.string(),
  mimeType: z.string().nullable().optional(),
  byteSize: z.number().int().nonnegative().nullable().optional(),
  sha256: z.string().nullable().optional(),
  integrityStatus: z.string().nullable().optional(),
});
export type FailureIntelligenceEvidenceItemDto = z.infer<
  typeof failureIntelligenceEvidenceItemDtoSchema
>;

export const failureIntelligenceRootCauseDtoSchema = z.object({
  rootCauseStatus: z.string(),
  probableLayer: z.string().nullable().optional(),
  probableComponent: z.string().nullable().optional(),
  probableCause: z.string().nullable().optional(),
  humanExplanation: z.string(),
  affectedExecutionPath: z.array(z.string()).default([]),
  contributingFactors: z.array(z.string()).default([]),
});
export type FailureIntelligenceRootCauseDto = z.infer<typeof failureIntelligenceRootCauseDtoSchema>;

export const failureIntelligenceDefectInfoDtoSchema = z.object({
  reportNumber: z.string().nullable().optional(),
  isApplicationDefect: z.boolean(),
  defectState: z.string(),
  severity: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  clusterKey: z.string().nullable().optional(),
  clusterMemberCount: z.number().int().nonnegative().nullable().optional(),
  reproductionSteps: z
    .array(
      z.object({
        stepNumber: z.number().int().positive(),
        action: z.string(),
        expectedResult: z.string().nullable().optional(),
      }),
    )
    .default([]),
});
export type FailureIntelligenceDefectInfoDto = z.infer<
  typeof failureIntelligenceDefectInfoDtoSchema
>;

export const failureIntelligenceAnalyzeOutputSchema = z.object({
  failureCaseId: z.string().uuid(),
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
  testRunId: z.string().uuid().nullable().optional(),
  testCaseId: z.string().uuid().nullable().optional(),
  testCaseKey: z.string().nullable().optional(),
  testCaseTitle: z.string().nullable().optional(),
  requirementId: z.string().uuid().nullable().optional(),
  requirementKey: z.string().nullable().optional(),
  status: z.string(),
  category: z.string(),
  subcategory: z.string().nullable().optional(),
  classificationStatus: z.string(),
  isApplicationDefect: z.boolean(),
  isAutomationFailure: z.boolean(),
  isEnvironmentFailure: z.boolean(),
  isTestDataFailure: z.boolean(),
  isFlaky: z.boolean().nullable().optional(),
  confidence: z.number().min(0).max(1),
  primaryRuleId: z.string().nullable().optional(),
  classificationRationale: z.string(),
  rootCause: failureIntelligenceRootCauseDtoSchema.nullable().optional(),
  reproduction: failureIntelligenceReproductionSummaryDtoSchema.nullable().optional(),
  evidence: z.array(failureIntelligenceEvidenceItemDtoSchema).default([]),
  defect: failureIntelligenceDefectInfoDtoSchema.nullable().optional(),
  recommendedNextAction: z.enum([
    'TRIAGE_APPLICATION_DEFECT',
    'UPDATE_AUTOMATION_TEST',
    'INSPECT_ENVIRONMENT',
    'FIX_TEST_DATA',
    'QUARANTINE_FLAKY_TEST',
    'COLLECT_MORE_EVIDENCE',
  ]),
  summary: z.string(),
});
export type FailureIntelligenceAnalyzeOutputDto = z.infer<
  typeof failureIntelligenceAnalyzeOutputSchema
>;

// ==============================================================================
// V10 Phase 149: Repair / Patch Tool Schemas & DTOs
// ==============================================================================

export const repairPatchStatusSchema = z.enum([
  'PROPOSED',
  'WAITING_FOR_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'APPLIED',
  'FAILED',
]);
export type RepairPatchStatus = z.infer<typeof repairPatchStatusSchema>;

export const repairPatchToolInputSchema = z
  .object({
    projectId: z.string().uuid(),
    taskId: z.string().uuid().optional(),
    failureId: z.string().uuid().optional(),
    defectId: z.string().optional(),
    targetFiles: z.array(z.string()).optional(),
    userGuidance: z.string().max(2000).optional(),
    proposedChanges: z.string().max(2000).optional(),
    reason: z.string().max(2000).optional(),
    forceRegenerate: z.boolean().optional().default(false),
  })
  .refine(data => Boolean(data.failureId || data.defectId), {
    message: 'Either failureId or defectId must be provided to repair_patch.',
    path: ['failureId'],
  });
export type RepairPatchToolInputDto = z.input<typeof repairPatchToolInputSchema>;

export const repairPatchToolOutputSchema = z.object({
  proposalId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid().nullable().optional(),
  failureId: z.string().uuid(),
  defectId: z.string().nullable().optional(),
  targetFiles: z.array(z.string()),
  primaryFilePath: z.string(),
  primarySymbolName: z.string().nullable().optional(),
  proposedChanges: z.string(),
  patch: z.string(),
  reason: z.string(),
  status: repairPatchStatusSchema,
  filesChangedCount: z.number().int(),
  linesAddedCount: z.number().int(),
  linesRemovedCount: z.number().int(),
  totalChangedLinesCount: z.number().int(),
  structuredEdits: z.array(structuredEditOperationSchema),
  isSyntacticallyValid: z.boolean(),
  riskLevel: z.string(),
  approvalId: z.string().uuid().nullable().optional(),
  auditId: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type RepairPatchToolOutputDto = z.infer<typeof repairPatchToolOutputSchema>;

export const repairPatchProposeInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  failureId: z.string().uuid().optional(),
  defectId: z.string().optional(),
  targetFiles: z.array(z.string()).optional(),
  userGuidance: z.string().max(2000).optional(),
  proposedChanges: z.string().max(2000).optional(),
  reason: z.string().max(2000).optional(),
  forceRegenerate: z.boolean().optional().default(false),
});
export type RepairPatchProposeInputDto = z.input<typeof repairPatchProposeInputSchema>;

export const repairPatchGetInputSchema = z.object({
  projectId: z.string().uuid(),
  proposalId: z.string().uuid().optional(),
  failureId: z.string().uuid().optional(),
});
export type RepairPatchGetInputDto = z.input<typeof repairPatchGetInputSchema>;

export const repairPatchApproveInputSchema = z.object({
  projectId: z.string().uuid(),
  proposalId: z.string().uuid(),
  reviewedBy: z.string().min(1).max(128).optional().default('HUMAN_REVIEWER'),
  reviewComment: z.string().max(2000).optional(),
});
export type RepairPatchApproveInputDto = z.input<typeof repairPatchApproveInputSchema>;

export const repairPatchRejectInputSchema = z.object({
  projectId: z.string().uuid(),
  proposalId: z.string().uuid(),
  rejectionReason: patchRejectionReasonSchema.optional().default('OTHER'),
  rejectionDetails: z.string().max(2000).optional(),
  reviewedBy: z.string().min(1).max(128).optional().default('HUMAN_REVIEWER'),
});
export type RepairPatchRejectInputDto = z.input<typeof repairPatchRejectInputSchema>;

export const repairPatchCancelInputSchema = z.object({
  projectId: z.string().uuid(),
  proposalId: z.string().uuid(),
  reason: z.string().min(1).max(1000).optional().default('Cancelled by user'),
});
export type RepairPatchCancelInputDto = z.input<typeof repairPatchCancelInputSchema>;

export const repairPatchApplyInputSchema = z.object({
  projectId: z.string().uuid(),
  proposalId: z.string().uuid(),
  appliedBy: z.string().min(1).max(128).optional().default('OPERATOR'),
});
export type RepairPatchApplyInputDto = z.input<typeof repairPatchApplyInputSchema>;

// ==============================================================================
// V10 Phase 150: Git Diff & Change Review Schemas & DTOs
// ==============================================================================

export const changeReviewStatusSchema = z.enum([
  'PENDING',
  'REVIEWED',
  'APPROVED',
  'REJECTED',
  'APPLIED',
]);
export type ChangeReviewStatus = z.infer<typeof changeReviewStatusSchema>;

export const gitFileChangeStatusSchema = z.enum([
  'MODIFIED',
  'ADDED',
  'DELETED',
  'RENAMED',
  'COPIED',
  'UNTRACKED',
]);
export type GitFileChangeStatus = z.infer<typeof gitFileChangeStatusSchema>;

export const gitFileChangeItemSchema = z.object({
  filePath: z.string(),
  status: gitFileChangeStatusSchema,
  staged: z.boolean(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  binary: z.boolean(),
  isDangerous: z.boolean(),
  dangerReason: z.string().nullable().optional(),
  isDependencyOrConfig: z.boolean(),
  isTestFile: z.boolean(),
  isGeneratedFile: z.boolean(),
});
export type GitFileChangeItemDto = z.infer<typeof gitFileChangeItemSchema>;

export const gitChangeAnalysisMetadataSchema = z.object({
  filesChangedCount: z.number().int().nonnegative(),
  linesAddedCount: z.number().int().nonnegative(),
  linesRemovedCount: z.number().int().nonnegative(),
  newFiles: z.array(z.string()),
  deletedFiles: z.array(z.string()),
  modifiedFiles: z.array(z.string()),
  potentiallyDangerousFiles: z.array(z.string()),
  dependencyConfigFiles: z.array(z.string()),
  testFiles: z.array(z.string()),
  generatedFiles: z.array(z.string()),
  hasSecretRedactions: z.boolean(),
  redactedSecretOccurrences: z.number().int().nonnegative(),
  safetyAssessment: z.string(),
});
export type GitChangeAnalysisMetadataDto = z.infer<typeof gitChangeAnalysisMetadataSchema>;

export const gitWorkingStatusSchema = z.object({
  isGitRepository: z.boolean(),
  repositoryRoot: z.string().nullable(),
  currentBranch: z.string().nullable(),
  headCommit: z.string().nullable(),
  isClean: z.boolean(),
  stagedFiles: z.array(gitFileChangeItemSchema),
  unstagedFiles: z.array(gitFileChangeItemSchema),
  untrackedFiles: z.array(gitFileChangeItemSchema),
  totalChangedFiles: z.number().int().nonnegative(),
});
export type GitWorkingStatusDto = z.infer<typeof gitWorkingStatusSchema>;

export const gitDiffResultSchema = z.object({
  diff: z.string(),
  staged: z.boolean(),
  commitBaseRef: z.string().nullable().optional(),
  commitTargetRef: z.string().nullable().optional(),
  files: z.array(gitFileChangeItemSchema),
  analysis: gitChangeAnalysisMetadataSchema,
  redacted: z.boolean(),
});
export type GitDiffResultDto = z.infer<typeof gitDiffResultSchema>;

export const agentGitChangeReviewSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  commitBaseRef: z.string().nullable(),
  status: changeReviewStatusSchema,
  changedFiles: z.array(z.string()),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  diffContent: z.string(),
  diffRef: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().or(z.date()).nullable(),
  decisionComment: z.string().nullable(),
  analysis: gitChangeAnalysisMetadataSchema,
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type AgentGitChangeReviewDto = z.infer<typeof agentGitChangeReviewSchema>;

export const gitDiffGetStatusInputSchema = z.object({
  projectId: z.string().uuid(),
});
export type GitDiffGetStatusInputDto = z.input<typeof gitDiffGetStatusInputSchema>;

export const gitDiffGetInputSchema = z.object({
  projectId: z.string().uuid(),
  staged: z.boolean().optional().default(false),
  commitBaseRef: z.string().max(128).optional(),
  commitTargetRef: z.string().max(128).optional(),
  filePaths: z.array(z.string()).optional(),
});
export type GitDiffGetInputDto = z.input<typeof gitDiffGetInputSchema>;

export const createGitChangeReviewInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  staged: z.boolean().optional().default(false),
  commitBaseRef: z.string().max(128).optional(),
  commitTargetRef: z.string().max(128).optional(),
  filePaths: z.array(z.string()).optional(),
  customDiff: z.string().optional(),
});
export type CreateGitChangeReviewInputDto = z.input<typeof createGitChangeReviewInputSchema>;

export const getGitChangeReviewInputSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
});
export type GetGitChangeReviewInputDto = z.input<typeof getGitChangeReviewInputSchema>;

export const approveGitChangeReviewInputSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  reviewedBy: z.string().min(1).max(128).optional().default('HUMAN_REVIEWER'),
  decisionComment: z.string().max(2000).optional(),
});
export type ApproveGitChangeReviewInputDto = z.input<typeof approveGitChangeReviewInputSchema>;

export const rejectGitChangeReviewInputSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  reviewedBy: z.string().min(1).max(128).optional().default('HUMAN_REVIEWER'),
  reason: z.string().min(1).max(2000),
});
export type RejectGitChangeReviewInputDto = z.input<typeof rejectGitChangeReviewInputSchema>;

// ==============================================================================
// V10 Phase 151: Sandboxed Terminal Command Gateway Contracts
// ==============================================================================

export const terminalExecutionStatusSchema = z.enum([
  'QUEUED',
  'WAITING_FOR_APPROVAL',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
  'BLOCKED',
]);
export type TerminalExecutionStatus = z.infer<typeof terminalExecutionStatusSchema>;

export const terminalCommandPolicyClassificationSchema = z.enum([
  'SAFE',
  'REQUIRES_APPROVAL',
  'BLOCKED',
]);
export type TerminalCommandPolicyClassification = z.infer<
  typeof terminalCommandPolicyClassificationSchema
>;

export const terminalExecuteInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  command: z.string().min(1).max(4096),
  workingDirectory: z.string().min(1).max(512).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional().default(30000),
  maxOutputBytes: z.number().int().min(1024).max(10485760).optional().default(524288), // default 512KB, max 10MB
  metadata: z.record(z.unknown()).optional().default({}),
});
export type TerminalExecuteInputDto = z.input<typeof terminalExecuteInputSchema>;

export const agentTerminalExecutionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  threadId: z.string().uuid(),
  stepId: z.string().uuid().nullable().optional(),
  command: z.string(),
  workingDirectory: z.string(),
  status: terminalExecutionStatusSchema,
  policyDecision: terminalCommandPolicyClassificationSchema,
  policyReason: z.string().nullable().optional(),
  exitCode: z.number().int().nullable().optional(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int().nullable().optional(),
  timedOut: z.boolean(),
  cancelled: z.boolean(),
  timeoutMs: z.number().int(),
  maxOutputBytes: z.number().int(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().or(z.date()).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  startedAt: z.string().or(z.date()).nullable().optional(),
  completedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type AgentTerminalExecutionDto = z.infer<typeof agentTerminalExecutionSchema>;

export const getTerminalExecutionInputSchema = z.object({
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
});
export type GetTerminalExecutionInputDto = z.input<typeof getTerminalExecutionInputSchema>;

export const listTerminalExecutionsInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  status: terminalExecutionStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type ListTerminalExecutionsInputDto = z.input<typeof listTerminalExecutionsInputSchema>;

export const approveTerminalExecutionInputSchema = z.object({
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
  approvedBy: z.string().min(1).max(128).optional().default('HUMAN_OPERATOR'),
  reason: z.string().max(2000).optional(),
});
export type ApproveTerminalExecutionInputDto = z.input<typeof approveTerminalExecutionInputSchema>;

export const rejectTerminalExecutionInputSchema = z.object({
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
  rejectedBy: z.string().min(1).max(128).optional().default('HUMAN_OPERATOR'),
  reason: z.string().min(1).max(2000),
});
export type RejectTerminalExecutionInputDto = z.input<typeof rejectTerminalExecutionInputSchema>;

export const cancelTerminalExecutionInputSchema = z.object({
  projectId: z.string().uuid(),
  executionId: z.string().uuid(),
  reason: z.string().max(2000).optional(),
});
export type CancelTerminalExecutionInputDto = z.input<typeof cancelTerminalExecutionInputSchema>;

// Agent-facing tool contract
export const terminalRunToolInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  command: z.string().min(1).max(4096),
  workingDirectory: z.string().min(1).max(512).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional().default(30000),
});
export type TerminalRunToolInputDto = z.input<typeof terminalRunToolInputSchema>;

export const terminalRunToolOutputSchema = z.object({
  executionId: z.string().uuid(),
  status: terminalExecutionStatusSchema,
  exitCode: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int().nullable(),
  timedOut: z.boolean(),
  cancelled: z.boolean(),
});
export type TerminalRunToolOutputDto = z.infer<typeof terminalRunToolOutputSchema>;

// ==============================================================================
// V10 Phase 152: Multi-Step Planning Schemas & DTOs
// ==============================================================================

export const agentPlanStatusSchema = z.enum([
  'DRAFT',
  'READY',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type AgentPlanExecutionStatus = z.infer<typeof agentPlanStatusSchema>;

export const agentPlanStepStatusSchema = z.enum([
  'PENDING',
  'READY',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
  'CANCELLED',
]);
export type AgentPlanStepExecutionStatus = z.infer<typeof agentPlanStepStatusSchema>;

export const agentPlanStepExecutionSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  sequence: z.number().int().positive(),
  title: z.string().min(1).max(255),
  objective: z.string().min(1),
  toolAction: z.string().min(1).max(128),
  structuredInput: z.record(z.unknown()).default({}),
  dependencies: z.array(z.string()).default([]),
  status: agentPlanStepStatusSchema,
  resultReference: z.string().nullable().optional(),
  errorInfo: z.string().nullable().optional(),
  startedAt: z.string().or(z.date()).nullable().optional(),
  completedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type AgentPlanStepExecutionDto = z.infer<typeof agentPlanStepExecutionSchema>;

export const agentPlanExecutionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  version: z.number().int().positive(),
  isActive: z.boolean(),
  status: agentPlanStatusSchema,
  summary: z.string().min(1),
  intent: z.string().min(1),
  totalSteps: z.number().int().nonnegative(),
  completedSteps: z.number().int().nonnegative(),
  requiresApproval: z.boolean(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  steps: z.array(agentPlanStepExecutionSchema).default([]),
});
export type AgentPlanExecutionDto = z.infer<typeof agentPlanExecutionSchema>;

export const plannedStepDefinitionSchema = z.object({
  stepId: z.string().min(1).max(128).optional(),
  sequence: z.number().int().positive().optional(),
  title: z.string().min(1).max(255),
  objective: z.string().min(1),
  toolAction: z.string().min(1).max(128),
  structuredInput: z.record(z.unknown()).default({}),
  dependencies: z.array(z.string()).default([]),
});
export type PlannedStepDefinitionDto = z.input<typeof plannedStepDefinitionSchema>;

export const createAgentPlanInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  summary: z.string().min(1).max(2000).optional(),
  intent: z.string().min(1).max(1000).optional(),
  steps: z.array(plannedStepDefinitionSchema).optional(),
  useAiPlanner: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional().default({}),
});
export type CreateAgentPlanInputDto = z.input<typeof createAgentPlanInputSchema>;

export const getAgentPlanInputSchema = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
});
export type GetAgentPlanInputDto = z.input<typeof getAgentPlanInputSchema>;

export const listAgentPlansInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type ListAgentPlansInputDto = z.input<typeof listAgentPlansInputSchema>;

export const getActiveAgentPlanInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type GetActiveAgentPlanInputDto = z.input<typeof getActiveAgentPlanInputSchema>;

export const addAgentPlanStepInputSchema = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
  step: plannedStepDefinitionSchema,
});
export type AddAgentPlanStepInputDto = z.input<typeof addAgentPlanStepInputSchema>;

export const removeAgentPlanStepInputSchema = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
  stepId: z.string().uuid(),
});
export type RemoveAgentPlanStepInputDto = z.input<typeof removeAgentPlanStepInputSchema>;

export const reorderAgentPlanStepsInputSchema = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
  stepIdsInOrder: z.array(z.string().uuid()).min(1),
});
export type ReorderAgentPlanStepsInputDto = z.input<typeof reorderAgentPlanStepsInputSchema>;

export const modifyAgentPlanStepInputSchema = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
  stepId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  objective: z.string().min(1).optional(),
  toolAction: z.string().min(1).max(128).optional(),
  structuredInput: z.record(z.unknown()).optional(),
  dependencies: z.array(z.string()).optional(),
});
export type ModifyAgentPlanStepInputDto = z.input<typeof modifyAgentPlanStepInputSchema>;

export const setAgentPlanStepStatusInputSchema = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
  stepId: z.string().uuid(),
  status: agentPlanStepStatusSchema,
  resultReference: z.string().optional(),
  errorInfo: z.string().optional(),
});
export type SetAgentPlanStepStatusInputDto = z.input<typeof setAgentPlanStepStatusInputSchema>;

export const setAgentPlanStatusInputSchema = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
  status: agentPlanStatusSchema,
});
export type SetAgentPlanStatusInputDto = z.input<typeof setAgentPlanStatusInputSchema>;

// ============================================================================
// V10 Phase 153: Agent Execution Loop Schemas & DTOs
// ============================================================================

export const agentLoopStatusSchema = z.enum([
  'IDLE',
  'STARTING',
  'PLANNING',
  'RUNNING',
  'WAITING_FOR_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'PAUSED',
  'STOPPED',
  'INTERRUPTED',
]);
export type AgentLoopStatus = z.infer<typeof agentLoopStatusSchema>;

export const agentLoopSafetyLimitsSchema = z.object({
  maxSteps: z.number().int().min(1).max(200).default(25),
  maxConsecutiveFailures: z.number().int().min(1).max(20).default(3),
  maxDurationMs: z.number().int().min(1000).max(3600000).default(300000),
  maxToolCalls: z.number().int().min(1).max(500).default(50),
});
export type AgentLoopSafetyLimits = z.infer<typeof agentLoopSafetyLimitsSchema>;
export type AgentLoopSafetyLimitsInput = z.input<typeof agentLoopSafetyLimitsSchema>;

export const startAgentLoopInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  planId: z.string().uuid().optional(),
  safetyLimits: agentLoopSafetyLimitsSchema.partial().optional(),
  autoApproveSafeTools: z.boolean().default(true).optional(),
});
export type StartAgentLoopInputDto = z.input<typeof startAgentLoopInputSchema>;

export const resumeAgentLoopInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  safetyLimits: agentLoopSafetyLimitsSchema.partial().optional(),
});
export type ResumeAgentLoopInputDto = z.input<typeof resumeAgentLoopInputSchema>;

export const cancelAgentLoopInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  reason: z.string().max(1000).optional(),
});
export type CancelAgentLoopInputDto = z.input<typeof cancelAgentLoopInputSchema>;

export const getAgentLoopStatusInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type GetAgentLoopStatusInputDto = z.input<typeof getAgentLoopStatusInputSchema>;

export const agentLoopObservationSchema = z.object({
  stepId: z.string(),
  toolName: z.string(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  timestamp: z.string().datetime(),
});
export type AgentLoopObservationDto = z.infer<typeof agentLoopObservationSchema>;

export const agentLoopStateSchema = z.object({
  taskId: z.string().uuid(),
  threadId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: agentLoopStatusSchema,
  currentStepSequence: z.number().int().nonnegative(),
  totalStepsExecuted: z.number().int().nonnegative(),
  toolCallsCount: z.number().int().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative(),
  activePlanId: z.string().uuid().nullable().optional(),
  activeStepId: z.string().nullable().optional(),
  activeToolName: z.string().nullable().optional(),
  pendingApprovalId: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});
export type AgentLoopStateDto = z.infer<typeof agentLoopStateSchema>;

export const agentLoopRunResultSchema = z.object({
  taskId: z.string().uuid(),
  status: agentThreadTaskStatusSchema,
  stepsCompleted: z.number().int().nonnegative(),
  toolCallsExecuted: z.number().int().nonnegative(),
  planStatus: agentPlanStatusSchema.optional(),
  pendingApprovalId: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative(),
});
export type AgentLoopRunResultDto = z.infer<typeof agentLoopRunResultSchema>;

// ============================================================================
// V10 Phase 154: Streaming Activity / Tool Progress UI Schemas & DTOs
// ============================================================================

export const agentActivityEventTypeSchema = z.enum([
  'TASK_STARTED',
  'STEP_STARTED',
  'STEP_UPDATED',
  'TOOL_STARTED',
  'TOOL_PROGRESS',
  'TOOL_COMPLETED',
  'TOOL_FAILED',
  'APPROVAL_REQUIRED',
  'TASK_COMPLETED',
  'TASK_FAILED',
  'TASK_CANCELLED',
]);
export type AgentActivityEventType = z.infer<typeof agentActivityEventTypeSchema>;

export const agentToolExecutionStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
]);
export type AgentToolExecutionStatus = z.infer<typeof agentToolExecutionStatusSchema>;

export const agentActivityEventSchema = z.object({
  eventId: z.string().uuid(),
  sequence: z.number().int().positive(),
  taskId: z.string().uuid(),
  threadId: z.string().uuid(),
  projectId: z.string().uuid(),
  type: agentActivityEventTypeSchema,
  timestamp: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});
export type AgentActivityEventDto = z.infer<typeof agentActivityEventSchema>;

export const agentActivityItemKindSchema = z.enum([
  'PLANNING',
  'TOOL_EXECUTION',
  'TOOL_RESULT',
  'ANALYSIS',
  'APPROVAL_WAITING',
  'COMPLETION',
  'FAILURE',
  'CANCELLATION',
]);
export type AgentActivityItemKind = z.infer<typeof agentActivityItemKindSchema>;

export const agentActivityItemSchema = z.object({
  id: z.string(),
  taskId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  kind: agentActivityItemKindSchema,
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  stepId: z.string().nullable().optional(),
  toolName: z.string().nullable().optional(),
  toolStatus: agentToolExecutionStatusSchema.nullable().optional(),
  inputSummary: z.record(z.string(), z.unknown()).nullable().optional(),
  resultSummary: z.unknown().nullable().optional(),
  error: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  timestamp: z.string().datetime(),
});
export type AgentActivityItemDto = z.infer<typeof agentActivityItemSchema>;

export const agentActivityTimelineSchema = z.object({
  taskId: z.string().uuid(),
  threadId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskTitle: z.string(),
  taskStatus: agentThreadTaskStatusSchema,
  currentStepSequence: z.number().int().nonnegative().optional(),
  activeStepTitle: z.string().nullable().optional(),
  activeToolName: z.string().nullable().optional(),
  activeToolStatus: agentToolExecutionStatusSchema.nullable().optional(),
  items: z.array(agentActivityItemSchema),
  totalSteps: z.number().int().nonnegative(),
  completedSteps: z.number().int().nonnegative(),
  toolCallsCount: z.number().int().nonnegative(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative(),
});
export type AgentActivityTimelineDto = z.infer<typeof agentActivityTimelineSchema>;

export const subscribeAgentActivityInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type SubscribeAgentActivityInputDto = z.input<typeof subscribeAgentActivityInputSchema>;

export const unsubscribeAgentActivityInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type UnsubscribeAgentActivityInputDto = z.input<typeof unsubscribeAgentActivityInputSchema>;

export const getAgentActivityTimelineInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type GetAgentActivityTimelineInputDto = z.input<typeof getAgentActivityTimelineInputSchema>;

// ==============================================================================
// V10 Phase 155: Human Approval Gates Schemas & DTOs
// ==============================================================================

export const approvalTypeSchema = z.enum([
  'FILE_WRITE',
  'FILE_DELETE',
  'CODE_PATCH',
  'GIT_CHANGE',
  'TERMINAL_COMMAND',
  'TEST_EXECUTION',
  'EXTERNAL_REQUEST',
  'RELEASE_ACTION',
  'CUSTOM',
]);
export type ApprovalType = z.infer<typeof approvalTypeSchema>;

export const approvalRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type ApprovalRiskLevel = z.infer<typeof approvalRiskLevelSchema>;

export const approvalRequestStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);
export type ApprovalRequestStatus = z.infer<typeof approvalRequestStatusSchema>;

export const approvalAuditEventTypeSchema = z.enum([
  'APPROVAL_CREATED',
  'APPROVAL_APPROVED',
  'APPROVAL_REJECTED',
  'APPROVAL_EXPIRED',
  'APPROVAL_CANCELLED',
  'APPROVAL_EXECUTION_STARTED',
  'APPROVAL_EXECUTION_COMPLETED',
  'APPROVAL_EXECUTION_FAILED',
]);
export type ApprovalAuditEventType = z.infer<typeof approvalAuditEventTypeSchema>;

export const approvalPolicyDecisionSchema = z.enum(['ALLOW', 'REQUIRE_APPROVAL', 'DENY']);
export type ApprovalPolicyDecision = z.infer<typeof approvalPolicyDecisionSchema>;

export const approvalRequestDtoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  executionStepId: z.string().uuid().nullable().optional(),
  approvalType: approvalTypeSchema,
  title: z.string(),
  description: z.string(),
  riskLevel: approvalRiskLevelSchema,
  requestedAction: z.string(),
  requestedInput: z.record(z.string(), z.unknown()),
  actionHash: z.string(),
  affectedFiles: z.array(z.string()),
  affectedTools: z.array(z.string()),
  status: approvalRequestStatusSchema,
  requestedAt: z.string(),
  respondedAt: z.string().nullable().optional(),
  respondedBy: z.string().uuid().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  responseReason: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ApprovalRequestDto = z.infer<typeof approvalRequestDtoSchema>;

export const approvalAuditLogDtoSchema = z.object({
  id: z.string().uuid(),
  approvalId: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  executionStepId: z.string().uuid().nullable().optional(),
  eventType: approvalAuditEventTypeSchema,
  actorType: z.string(),
  actorId: z.string(),
  transition: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  timestamp: z.string(),
});
export type ApprovalAuditLogDto = z.infer<typeof approvalAuditLogDtoSchema>;

export const createApprovalInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  executionStepId: z.string().uuid().optional(),
  approvalType: approvalTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  riskLevel: approvalRiskLevelSchema,
  requestedAction: z.string().min(1),
  requestedInput: z.record(z.string(), z.unknown()).default({}),
  affectedFiles: z.array(z.string()).default([]),
  affectedTools: z.array(z.string()).default([]),
  expiresInSeconds: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateApprovalInputDto = z.input<typeof createApprovalInputSchema>;

export const getApprovalInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
});
export type GetApprovalInputDto = z.input<typeof getApprovalInputSchema>;

export const listApprovalsInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  status: approvalRequestStatusSchema.optional(),
  approvalType: approvalTypeSchema.optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export type ListApprovalsInputDto = z.input<typeof listApprovalsInputSchema>;

export const approveApprovalInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
  actionHash: z.string().optional(),
  reason: z.string().optional(),
});
export type ApproveApprovalInputDto = z.input<typeof approveApprovalInputSchema>;

export const rejectApprovalInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
  reason: z.string().optional(),
});
export type RejectApprovalInputDto = z.input<typeof rejectApprovalInputSchema>;

export const cancelApprovalInputSchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().uuid(),
  reason: z.string().optional(),
});
export type CancelApprovalInputDto = z.input<typeof cancelApprovalInputSchema>;

export const getPendingApprovalInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
});
export type GetPendingApprovalInputDto = z.input<typeof getPendingApprovalInputSchema>;

export const structuredApprovalDecisionSchema = z.object({
  approvalId: z.string().uuid(),
  status: approvalRequestStatusSchema,
  decision: z.enum(['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED']),
  actionHash: z.string(),
  respondedAt: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});
export type StructuredApprovalDecisionDto = z.infer<typeof structuredApprovalDecisionSchema>;

// ==============================================================================
// V10 Phase 156: File & Diff Review Workspace Contracts
// ==============================================================================

export const FILE_REVIEW_STATUSES = [
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'APPLIED',
  'CANCELLED',
] as const;
export type FileReviewStatus = (typeof FILE_REVIEW_STATUSES)[number];
export const fileReviewStatusSchema = z.enum(FILE_REVIEW_STATUSES);

export const fileDiffReviewDtoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  approvalRequestId: z.string().uuid().nullable().optional(),
  title: z.string(),
  description: z.string(),
  affectedFiles: z.array(z.string()),
  originalDiff: z.string(),
  diffChecksum: z.string(),
  status: fileReviewStatusSchema,
  reviewedBy: z.string().uuid().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  decisionReason: z.string().nullable().optional(),
  appliedAt: z.string().nullable().optional(),
  appliedCommit: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FileDiffReviewDto = z.infer<typeof fileDiffReviewDtoSchema>;

export const createFileReviewInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  approvalRequestId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  affectedFiles: z.array(z.string()).default([]),
  originalDiff: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateFileReviewInputDto = z.input<typeof createFileReviewInputSchema>;

export const getFileReviewInputSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
});
export type GetFileReviewInputDto = z.input<typeof getFileReviewInputSchema>;

export const listFileReviewsInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  status: fileReviewStatusSchema.optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export type ListFileReviewsInputDto = z.input<typeof listFileReviewsInputSchema>;

export const approveFileReviewInputSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  reason: z.string().optional(),
});
export type ApproveFileReviewInputDto = z.input<typeof approveFileReviewInputSchema>;

export const rejectFileReviewInputSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  reason: z.string().optional(),
});
export type RejectFileReviewInputDto = z.input<typeof rejectFileReviewInputSchema>;

export const cancelFileReviewInputSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  reason: z.string().optional(),
});
export type CancelFileReviewInputDto = z.input<typeof cancelFileReviewInputSchema>;

export const applyFileReviewInputSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
});
export type ApplyFileReviewInputDto = z.input<typeof applyFileReviewInputSchema>;

export const applyFileReviewResultDtoSchema = z.object({
  reviewId: z.string().uuid(),
  status: fileReviewStatusSchema,
  appliedAt: z.string(),
  appliedCommit: z.string(),
  filesModifiedCount: z.number().int().nonnegative(),
  affectedFiles: z.array(z.string()),
  linesAdded: z.number().int().nonnegative(),
  linesRemoved: z.number().int().nonnegative(),
});
export type ApplyFileReviewResultDto = z.infer<typeof applyFileReviewResultDtoSchema>;

export const getFileReviewContentInputSchema = z.object({
  projectId: z.string().uuid(),
  filePath: z.string().min(1),
  maxSizeBytes: z.number().int().positive().optional(),
});
export type GetFileReviewContentInputDto = z.input<typeof getFileReviewContentInputSchema>;

export const fileReviewContentDtoSchema = z.object({
  filePath: z.string(),
  language: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: z.string(),
  isBinary: z.boolean(),
  content: z.string(),
  lineCount: z.number().int().nonnegative(),
});
export type FileReviewContentDto = z.infer<typeof fileReviewContentDtoSchema>;

// ==============================================================================
// V10 Phase 159: Full Autonomous Testing + Fix Workflow Contracts & DTOs
// ==============================================================================

export const AUTONOMOUS_WORKFLOW_STATUSES = [
  'PLANNING',
  'CONTEXT_COLLECTED',
  'TESTS_EXECUTED',
  'FAILURES_ANALYZED',
  'PATCH_PROPOSED',
  'WAITING_FOR_APPROVAL',
  'PATCH_APPROVED',
  'PATCH_REJECTED',
  'PATCH_APPLIED',
  'REVERIFIED',
  'RETESTED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type AutonomousWorkflowStatus = (typeof AUTONOMOUS_WORKFLOW_STATUSES)[number];
export const autonomousWorkflowStatusSchema = z.enum(AUTONOMOUS_WORKFLOW_STATUSES);

export const AUTONOMOUS_WORKFLOW_FINAL_STATUSES = [
  'FIXED_AND_VERIFIED',
  'NON_APPLICATION_FAILURE',
  'REVERIFICATION_FAILED',
  'REGRESSION_DETECTED',
  'APPROVAL_REJECTED',
  'PATCH_FAILED',
  'NO_FIX_NEEDED',
  'EXECUTION_FAILED',
  'CANCELLED',
] as const;
export type AutonomousWorkflowFinalStatus = (typeof AUTONOMOUS_WORKFLOW_FINAL_STATUSES)[number];
export const autonomousWorkflowFinalStatusSchema = z.enum(AUTONOMOUS_WORKFLOW_FINAL_STATUSES);

export const workflowTestExecutedSchema = z.object({
  testCaseId: z.string(),
  name: z.string(),
  status: z.string(),
  durationMs: z.number().int().optional(),
  error: z.string().optional(),
});
export type WorkflowTestExecutedDto = z.infer<typeof workflowTestExecutedSchema>;

export const workflowRequirementCoveredSchema = z.object({
  requirementId: z.string(),
  key: z.string().optional(),
  title: z.string(),
});
export type WorkflowRequirementCoveredDto = z.infer<typeof workflowRequirementCoveredSchema>;

export const workflowFailureFoundSchema = z.object({
  failureCaseId: z.string().optional(),
  testCaseId: z.string().optional(),
  title: z.string(),
  category: z.string().optional(),
  message: z.string(),
});
export type WorkflowFailureFoundDto = z.infer<typeof workflowFailureFoundSchema>;

export const workflowEvidenceReferencesSchema = z.object({
  screenshotUrls: z.array(z.string()).default([]),
  traceUrls: z.array(z.string()).default([]),
  consoleLogCount: z.number().int().default(0),
  networkEventCount: z.number().int().default(0),
});
export type WorkflowEvidenceReferencesDto = z.infer<typeof workflowEvidenceReferencesSchema>;

export const workflowFailureClassificationSchema = z.object({
  domain: z.string().optional(),
  classification: z.string().optional(),
  isFlaky: z.boolean().default(false),
  confidenceScore: z.number().min(0).max(1).optional(),
  explanation: z.string().optional(),
});
export type WorkflowFailureClassificationDto = z.infer<typeof workflowFailureClassificationSchema>;

export const workflowRootCauseSchema = z.object({
  hypothesis: z.string().optional(),
  affectedFiles: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
  errorStack: z.string().optional(),
});
export type WorkflowRootCauseDto = z.infer<typeof workflowRootCauseSchema>;

export const workflowProposedPatchSchema = z.object({
  proposalId: z.string().uuid().optional(),
  diff: z.string(),
  affectedFiles: z.array(z.string()),
  checksum: z.string().optional(),
});
export type WorkflowProposedPatchDto = z.infer<typeof workflowProposedPatchSchema>;

export const workflowApprovalDecisionSchema = z.object({
  approvalId: z.string().uuid().optional(),
  decision: z.enum(['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'PENDING']),
  approvedBy: z.string().optional(),
  decidedAt: z.string().optional(),
  reason: z.string().optional(),
});
export type WorkflowApprovalDecisionDto = z.infer<typeof workflowApprovalDecisionSchema>;

export const workflowBeforeAfterResultsSchema = z.object({
  beforeFailure: z.string(),
  afterResult: z.string(),
  reverificationPassed: z.boolean(),
});
export type WorkflowBeforeAfterResultsDto = z.infer<typeof workflowBeforeAfterResultsSchema>;

export const workflowRegressionResultsSchema = z.object({
  totalRun: z.number().int(),
  passed: z.number().int(),
  failed: z.number().int(),
  regressionFailures: z.array(z.string()).default([]),
});
export type WorkflowRegressionResultsDto = z.infer<typeof workflowRegressionResultsSchema>;

export const workflowAuditTrailEntrySchema = z.object({
  timestamp: z.string().or(z.date()),
  stage: z.string(),
  message: z.string(),
  metadata: z.record(z.unknown()).optional(),
});
export type WorkflowAuditTrailEntryDto = z.infer<typeof workflowAuditTrailEntrySchema>;

export const agentAutonomousWorkflowReportDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid(),
  userId: z.string().uuid(),
  workflowStatus: autonomousWorkflowStatusSchema,
  finalStatus: autonomousWorkflowFinalStatusSchema.nullable().optional(),
  releaseReady: z.boolean(),
  originalRequest: z.string(),
  planSummary: z.string().nullable().optional(),
  testsExecuted: z.array(workflowTestExecutedSchema).default([]),
  requirementsCovered: z.array(workflowRequirementCoveredSchema).default([]),
  failuresFound: z.array(workflowFailureFoundSchema).default([]),
  evidenceReferences: workflowEvidenceReferencesSchema.default({
    screenshotUrls: [],
    traceUrls: [],
    consoleLogCount: 0,
    networkEventCount: 0,
  }),
  failureClassification: workflowFailureClassificationSchema.nullable().optional(),
  rootCauseAnalysis: workflowRootCauseSchema.nullable().optional(),
  proposedPatch: workflowProposedPatchSchema.nullable().optional(),
  approvalDecision: workflowApprovalDecisionSchema.nullable().optional(),
  beforeAfterResults: workflowBeforeAfterResultsSchema.nullable().optional(),
  regressionResults: workflowRegressionResultsSchema.nullable().optional(),
  unresolvedIssues: z.array(z.string()).default([]),
  auditTrail: z.array(workflowAuditTrailEntrySchema).default([]),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type AgentAutonomousWorkflowReportDto = z.infer<typeof agentAutonomousWorkflowReportDtoSchema>;

export const executeAutonomousWorkflowInputSchema = z.object({
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  instruction: z.string().min(1).max(5000),
  targetTestId: z.string().optional(),
  targetUrl: z.string().url().optional(),
  autoApprove: z.boolean().optional().default(false),
});
export type ExecuteAutonomousWorkflowInputDto = z.input<typeof executeAutonomousWorkflowInputSchema>;

export const getAutonomousWorkflowReportInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type GetAutonomousWorkflowReportInputDto = z.input<typeof getAutonomousWorkflowReportInputSchema>;

export const approveWorkflowFixInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  decisionReason: z.string().optional(),
});
export type ApproveWorkflowFixInputDto = z.input<typeof approveWorkflowFixInputSchema>;

export const rejectWorkflowFixInputSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  rejectionReason: z.string().optional(),
});
export type RejectWorkflowFixInputDto = z.input<typeof rejectWorkflowFixInputSchema>;

