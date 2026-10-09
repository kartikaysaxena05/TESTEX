import electron, { type IpcMainInvokeEvent } from 'electron';
import crypto from 'node:crypto';
import { DESKTOP_CHANNELS, type DesktopResult, type DesktopErrorCode } from '@ai-quality/contracts';
import { getLogger } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';
import { getAppInfo } from './app-handlers.js';
import { getHealthStatus } from './health-handlers.js';
import { getDatabaseStatus } from './database-handlers.js';
import {
  handleListProjects,
  handleGetProject,
  handleCreateProject,
  handleUpdateProject,
  handleArchiveProject,
  handleRestoreProject,
  handleDeleteProject,
  handleCreateEnvironment,
  handleUpdateEnvironment,
  handleDeleteEnvironment,
  handleSetDefaultEnvironment,
  handleMarkProjectOpened,
} from './project-handlers.js';
import {
  handleGetSource,
  handlePickDirectory,
  handleAttachLocalDirectory,
  handleDetachSource,
  handleValidateSource,
  handleRefreshSourceMetadata,
} from './source-handlers.js';
import { handleGetGitStatus, handleRefreshGitMetadata } from './git-handlers.js';
import { handleGetSourceStructure, handleRefreshSourceStructure } from './structure-handlers.js';
import {
  handleGetTechnologyProfile,
  handleRefreshTechnologyProfile,
} from './technology-handlers.js';
import { handleGetFrameworkProfile, handleRefreshFrameworkProfile } from './framework-handlers.js';
import {
  handleGetClassificationProfile,
  handleRefreshClassificationProfile,
} from './classification-handlers.js';
import { handleGetSourceFileContent } from './content-handlers.js';
import {
  handleGetRepositoryIndexStatus,
  handleRefreshRepositoryIndex,
  handleListIndexedFiles,
  handleGetFileDetails,
  handleSearchSymbols,
} from './index-handlers.js';
import {
  handleGetArchitectureProfile,
  handleRefreshArchitectureProfile,
} from './architecture-handlers.js';
import {
  handleGetRunConfigurationProfile,
  handleDetectRunConfiguration,
  handleSelectRunConfiguration,
  handleUpdateTargetUrl,
} from './run-config-handlers.js';
import {
  handleListSnapshots,
  handleCreateSnapshot,
  handleSetBaseline,
  handleDeleteSnapshot,
} from './snapshot-handlers.js';
import { handleGetChanges, handleRefreshChanges } from './change-handlers.js';
import {
  handleListRequirements,
  handleGetRequirement,
  handleGetRequirementByKey,
  handleGetRequirementSummary,
  handleCreateRequirement,
  handleUpdateRequirement,
  handleActivateRequirement,
  handleDeprecateRequirement,
  handleDraftRequirement,
  handleArchiveRequirement,
  handleRestoreRequirement,
  handleDeleteRequirement,
  handleListRequirementSources,
  handleGetRequirementSource,
  handleParseBulkRequirements,
  handleImportBulkRequirements,
} from './requirement-handlers.js';
import {
  handleSelectAndIngestDocument,
  handleListRequirementDocuments,
  handleGetRequirementDocument,
  handleDeleteRequirementDocument,
  handleExtractRequirementDocument,
  handleGetRequirementDocumentExtraction,
} from './requirement-document-handlers.js';
import {
  handleDetectRequirementCandidates,
  handleListRequirementCandidates,
  handleUpdateRequirementCandidate,
  handleSetRequirementCandidateStatus,
  handleImportApprovedCandidates,
} from './requirement-candidate-handlers.js';
import {
  handleGetRequirementProvenance,
  handleGetRequirementSourceContext,
} from './requirement-provenance-handlers.js';
import {
  handleNormalizeRequirement,
  handleGetRequirementRepresentation,
  handleUpdateRequirementRepresentation,
  handleRegenerateRequirementRepresentation,
  handleBatchNormalizeRequirements,
} from './requirement-normalization-handlers.js';
import {
  handleClassifyRequirement,
  handleGetRequirementMetadata,
  handleUpdateRequirementMetadata,
  handleRegenerateRequirementMetadata,
  handleBatchClassifyRequirements,
} from './requirement-classification-handlers.js';
import {
  handleAnalyzeQuality,
  handleGetQualityAnalysis,
  handleReviewQualityFinding,
  handleReanalyzeQuality,
  handleBatchAnalyzeQuality,
} from './requirement-quality-handlers.js';
import {
  handleProposeRelationships,
  handleGetRelationships,
  handleGetRelationshipGraph,
  handleCreateManualRelationship,
  handleReviewRelationship,
  handleDeleteRelationship,
} from './requirement-relationship-handlers.js';
import {
  handleMatchRepositoryEvidence,
  handleGetRepositoryEvidence,
  handleReviewRepositoryEvidence,
  handleCreateManualRepositoryEvidence,
  handleDeleteRepositoryEvidence,
  handlePreviewRepositoryEvidence,
} from './requirement-evidence-handlers.js';
import {
  handleGetRequirementHistory,
  handleGetRequirementVersion,
  handleCompareRequirementVersions,
  handleUpdateRequirementVersioned,
  handleRestoreRequirementVersion,
  handleGetRequirementChangeImpact,
  handleReviewRequirementImpact,
} from './requirement-version-handlers.js';
import {
  handleGetAiProviderStatus,
  handleAiHealthCheck,
  handleAiGenerate,
  handleGetAiConfigDefaults,
  handleAiExecutePrompt,
} from './ai-handlers.js';
import {
  handleGetEmbeddingIndexStatus,
  handleIndexSubjects,
  handleVectorSearchSimilar,
  handleReindexStaleEmbeddings,
} from './embedding-handlers.js';
import { handleRetrieveRequirementContext, handleGetRagConfigDefaults } from './rag-handlers.js';
import {
  handleAnalyzeRequirement,
  handleGetCurrentAnalysis,
  handleGetAnalysisHistory,
  handleRegenerateAnalysis,
} from './analysis-handlers.js';
import {
  handleAnalyzeTestDesign,
  handleGetCurrentTestDesign,
  handleGetTestDesignHistory,
  handleRegenerateTestDesign,
} from './test-design-handlers.js';
import {
  handleGenerateScenarios,
  handleGetCurrentScenarios,
  handleGetScenariosHistory,
  handleRegenerateScenarios,
} from './scenario-handlers.js';
import {
  handleGenerateCategorizedTests,
  handleGetCategorizedTests,
} from './categorized-test-handlers.js';
import {
  handleEnrichTestSpecifications,
  handleGetEnrichedTestSpecifications,
} from './specification-handlers.js';
import {
  handleCreateTestCase,
  handleGetTestCaseById,
  handleListTestCases,
  handlePersistFromGeneration,
  handlePersistBatchFromGeneration,
  handleDeleteTestCase,
} from './test-case-handlers.js';
import {
  handleValidateTestCase,
  handleValidateSpecification,
  handleValidateBatch,
  handleGetLatestValidation,
  handleListValidationHistory,
} from './test-validation-handlers.js';
import {
  handleCreateTrace,
  handleDeleteTrace,
  handleGetTraceById,
  handleListProjectTraces,
  handleListTracesByRequirement,
  handleListTracesByTestCase,
} from './traceability-handlers.js';
import {
  handleGetOrphanTests,
  handleGetProjectCoverageSummary,
  handleGetRequirementCoverage,
  handleGetReverseTraceability,
  handleGetTraceabilityMatrix,
} from './coverage-handlers.js';
import {
  handleApproveTestVersion,
  handleCompareTestVersions,
  handleEditTestCase,
  handleGetTestHistory,
  handleGetTestReviewDetail,
  handleListTestReviewQueue,
  handleRegenerateTestCase,
  handleRejectTestVersion,
} from './test-review-handlers.js';
import {
  handleGetTargetApplication,
  handleUpdateTargetApplication,
  handleListEnvironments,
  handleGetEnvironment,
  handleCreateEnvironment as handleCreatePhase59Environment,
  handleUpdateEnvironment as handleUpdatePhase59Environment,
  handleDeleteEnvironment as handleDeletePhase59Environment,
  handleSetDefaultEnvironment as handleSetDefaultPhase59Environment,
  handleCheckEnvironmentReachability,
  handleResolveEnvironmentSnapshot,
} from './environment-handlers.js';
import {
  handleCompilePlan,
  handleGetPlan,
  handleGetPlanByTestCase,
  handleListPlans,
  handlePreviewPlan,
} from './plan-compiler-handlers.js';
import {
  handleEnqueueTestRun,
  handleGetTestRun,
  handleListTestRuns,
  handleCancelTestRun,
  handleGetTestRunQueueState,
} from './test-run-handlers.js';
import {
  handleCreateAuthProfile,
  handleGetAuthProfile,
  handleListAuthProfiles,
  handleUpdateAuthProfile,
  handleDeleteAuthProfile,
  handleValidateAuthProfile,
} from './auth-profile-handlers.js';
import {
  handleCreateAgentSession,
  handleGetAgentSession,
  handleListAgentSessions,
  handleDeleteAgentSession,
  handleSendAgentMessage,
  handleApproveAgentAction,
  handleAgentRunControl,
  handleGetAgentEvidence,
} from './conversational-agent-handlers.js';
import { handleReportRendererError } from './logging-handlers.js';
import {
  handleCreateAgentRuntimeTask,
  handleGetAgentRuntimeTask,
  handleCancelAgentRuntimeTask,
  handleGetAgentRuntimeTaskEvents,
} from './agent-runtime-handlers.js';
import {
  handleCreateAgentThread,
  handleListAgentThreads,
  handleGetAgentThread,
  handleArchiveAgentThread,
  handleCreateAgentThreadTask,
  handleGetAgentThreadTask,
  handleListAgentThreadTasks,
  handleCancelAgentThreadTask,
  handleRetryAgentThreadTask,
  handleResumeAgentThreadTask,
  handleStopAgentThreadTask,
  handlePauseAgentThreadTask,
  handleListAgentTaskControlAuditLogs,
  handleListAgentThreadMessages,
  handleListAgentExecutionSteps,
  handleListAgentToolCalls,
  handleGetTaskRecoveryState,
  handleListRecoverableTasks,
  handleListAgentTaskCheckpoints,
  handleExecuteAutonomousWorkflow,
  handleGetAutonomousWorkflowReport,
  handleApproveWorkflowFix,
  handleRejectWorkflowFix,
} from './agent-thread-handlers.js';
import {
  handleListAgentTools,
  handleGetAgentTool,
  handleInvokeAgentTool,
} from './agent-tool-handlers.js';
import {
  handleListToolApprovals,
  handleGetToolApproval,
  handleDecideToolApproval,
  handleListToolAuditLogs,
} from './agent-tool-permission-handlers.js';
import {
  handleProposeRepairPatch,
  handleGetRepairPatch,
  handleApproveRepairPatch,
  handleRejectRepairPatch,
  handleCancelRepairPatch,
  handleApplyRepairPatch,
} from './repair-patch-handlers.js';
import {
  handleGetGitWorkingStatus,
  handleGetGitDiff,
  handleCreateGitChangeReview,
  handleGetGitChangeReview,
  handleApproveGitChangeReview,
  handleRejectGitChangeReview,
} from './git-review-handlers.js';
import {
  handleExecuteTerminal,
  handleGetTerminalExecution,
  handleListTerminalExecutions,
  handleApproveTerminalExecution,
  handleRejectTerminalExecution,
  handleCancelTerminalExecution,
} from './terminal-handlers.js';
import {
  handlePlannerCreatePlan,
  handlePlannerGetPlan,
  handlePlannerListPlans,
  handlePlannerGetActivePlan,
  handlePlannerAddStep,
  handlePlannerRemoveStep,
  handlePlannerReorderSteps,
  handlePlannerModifyStep,
  handlePlannerSetStepStatus,
  handlePlannerSetPlanStatus,
} from './planner-handlers.js';
import {
  handleAgentLoopStart,
  handleAgentLoopResume,
  handleAgentLoopCancel,
  handleAgentLoopGetStatus,
} from './agent-loop-handlers.js';
import {
  handleSubscribeAgentActivity,
  handleUnsubscribeAgentActivity,
  handleGetAgentActivityTimeline,
} from './agent-activity-handlers.js';
import {
  handleCreateApproval,
  handleGetApproval,
  handleListApprovals,
  handleApproveApproval,
  handleRejectApproval,
  handleCancelApproval,
  handleGetPendingApproval,
  handleGetApprovalAuditHistory,
} from './approval-handlers.js';
import { registerFileReviewHandlers } from './file-review-handlers.js';
import {
  handleListWorkspaceSessions,
  handleGetWorkspaceSession,
  handleCreateWorkspaceSession,
  handleUpdateWorkspaceSession,
  handleDeleteWorkspaceSession,
  handleGetShellLayout,
  handleUpdateShellLayout,
} from './workspace-session-handlers.js';
import {
  handleGetAuthState,
  handleGetCurrentUser,
  handleLogin,
  handleSignup,
  handleForgotPassword,
  handleResetPassword,
  handleLogout,
  handleRevokeSession,
  handleRevokeAllSessions,
  handleSocialAuthStart,
  handleSocialAuthCallback,
  handleSocialAuthCancel,
  handleSocialAuthGetProviders,
} from './auth-handlers.js';
import {
  handleGetProfile,
  handleUpdateProfile,
  handleChangePassword,
  handleGetAuthMethods,
  handleGetSessions,
  handleGetPreferences,
  handleUpdatePreferences,
  handleDeleteAccount,
} from './settings-handlers.js';
import {
  handleCreateWebsiteTarget,
  handleGetWebsiteTarget,
  handleListWebsiteTargets,
  handleUpdateWebsiteTarget,
  handleDeleteWebsiteTarget,
  handleSetActiveWebsiteTarget,
  handleTestWebsiteTargetConnection,
  handleConfirmWebsiteTargetAuth,
  handleResolveWebsiteTargetSnapshot,
} from './website-target-handlers.js';
import {
  handleListRepositoryConnections,
  handleGetRepositoryConnection,
  handleCreateRepositoryConnection,
  handleUpdateRepositoryConnection,
  handleDeleteRepositoryConnection,
  handleSetActiveRepositoryConnection,
  handleVerifyRepositoryConnection,
  handleImportRepositoryConnection,
  handleCancelRepositoryImport,
  handleResolveRepositorySnapshot,
  handleVerifyGitProviderAuth,
  handleListGitProviderRepos,
  handleListGitProviderBranches,
} from './repository-connection-handlers.js';
import {
  handleConnectLocalFolder,
  handleDisconnectLocalFolder,
  handleValidateLocalFolder,
  handleGetLocalFolder,
  handleListProjectDirectory,
  handleReadProjectFile,
  handleSearchProjectFiles,
  handleCheckProjectFileExists,
  handleGetProjectFileMetadata,
  handleDetectProjectGit,
} from './local-folder-handlers.js';
import {
  handleGetTargetEnvironment,
  handleListTargetEnvironments,
  handleSaveTargetEnvironment,
  handleDeleteTargetEnvironment,
  handleSetActiveTargetEnvironment,
  handleTestTargetConnection,
  handleTestTargetAuth,
  handleResolveTargetEnvironment,
} from './target-env-handlers.js';
import {
  handleGetProjectContext,
  handleDetectProjectSources,
  handleRefreshProjectContext,
  handleInvalidateProjectContext,
  handleGetProjectContextStatus,
} from './project-context-handlers.js';
import {
  FAILURE_AND_DEFECT_ERROR_CODES,
  registerFailureAndDefectIpc,
  unregisterFailureAndDefectIpc,
} from './register-failure-and-defect-ipc.js';

let isIpcRegistered = false;

const ALLOWED_ERROR_CODES: readonly DesktopErrorCode[] = [
  'PROJECT_NOT_FOUND',
  'PROJECT_ARCHIVED',
  'ENVIRONMENT_NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'INVALID_REQUEST',
  'UNAUTHORIZED_SENDER',
  'RATE_LIMITED',
  'SOURCE_NOT_FOUND',
  'SOURCE_UNAVAILABLE',
  'DIRECTORY_NOT_FOUND',
  'INVALID_DIRECTORY',
  'CONTENT_ACCESS_DENIED',
  'CONTENT_NOT_FOUND',
  'CONTENT_TOO_LARGE',
  'CONTENT_BINARY',
  'CONTENT_SENSITIVE',
  'CONTENT_FILTERED',
  'REQUIREMENT_NOT_FOUND',
  'REQUIREMENT_KEY_CONFLICT',
  'REQUIREMENT_SOURCE_NOT_FOUND',
  'INVALID_REQUIREMENT_TRANSITION',
  'DOCUMENT_NOT_FOUND',
  'DOCUMENT_INVALID_FORMAT',
  'DOCUMENT_TOO_LARGE',
  'DOCUMENT_DUPLICATE',
  'DOCUMENT_CORRUPT',
  'DOCUMENT_STORAGE_ERROR',
  'DOCUMENT_FILE_MISSING',
  'DOCUMENT_INTEGRITY_MISMATCH',
  'DOCUMENT_ENCRYPTED',
  'DOCUMENT_EXTRACTION_LIMIT_EXCEEDED',
  'DOCUMENT_EXTRACTION_FAILED',
  'CANDIDATE_NOT_FOUND',
  'EXTRACTION_NOT_FOUND',
  'NO_APPROVED_CANDIDATES',
  'CANDIDATE_ALREADY_IMPORTED',
  'PROVENANCE_NOT_FOUND',
  'DOCUMENT_IN_USE',
  'SOURCE_IN_USE',
  'REPRESENTATION_NOT_FOUND',
  'NORMALIZATION_FAILED',
  'METADATA_NOT_FOUND',
  'CLASSIFICATION_FAILED',
  'QUALITY_ANALYSIS_NOT_FOUND',
  'QUALITY_FINDING_NOT_FOUND',
  'QUALITY_ANALYSIS_FAILED',
  'RELATIONSHIP_NOT_FOUND',
  'RELATIONSHIP_ALREADY_EXISTS',
  'SELF_RELATIONSHIP_ERROR',
  'REPOSITORY_EVIDENCE_NOT_FOUND',
  'REPOSITORY_INDEX_NOT_AVAILABLE',
  'REPOSITORY_EVIDENCE_NOT_AUTHORIZED',
  'REQUIREMENT_VERSION_NOT_FOUND',
  'REQUIREMENT_VERSION_CONFLICT',
  'REQUIREMENT_IMPACT_NOT_FOUND',
  'INVALID_VERSION_COMPARISON',
  'PROVIDER_NOT_CONFIGURED',
  'AUTHENTICATION_FAILED',
  'PERMISSION_DENIED',
  'TIMEOUT',
  'CANCELLED',
  'PROVIDER_UNAVAILABLE',
  'NETWORK_ERROR',
  'INVALID_PROVIDER_RESPONSE',
  'UNKNOWN_PROVIDER_ERROR',
  'CONFIGURATION_INVALID',
  'PROMPT_NOT_FOUND',
  'PROMPT_VERSION_NOT_FOUND',
  'PROMPT_INPUT_INVALID',
  'PROMPT_RENDER_FAILED',
  'STRUCTURED_OUTPUT_PARSE_FAILED',
  'STRUCTURED_OUTPUT_SCHEMA_FAILED',
  'STRUCTURED_OUTPUT_RETRY_EXHAUSTED',
  'EMBEDDING_PROVIDER_NOT_CONFIGURED',
  'EMBEDDING_CAPABILITY_UNSUPPORTED',
  'EMBEDDING_INVALID_INPUT',
  'EMBEDDING_DIMENSION_MISMATCH',
  'EMBEDDING_VALIDATION_FAILED',
  'VECTOR_SEARCH_INVALID_QUERY',
  'VECTOR_SEARCH_PROJECT_MISMATCH',
  'VECTOR_INDEX_UNAVAILABLE',
  'RAG_PROJECT_MISMATCH',
  'RAG_REQUIREMENT_NOT_FOUND',
  'RAG_RETRIEVAL_FAILED',
  'RAG_INVALID_REQUEST',
  'RAG_BUDGET_EXCEEDED',
  'RAG_REQUIREMENT_CHANGED_DURING_RETRIEVAL',
  'RAG_VECTOR_INDEX_UNAVAILABLE',
  'AI_ANALYSIS_PROJECT_MISMATCH',
  'AI_ANALYSIS_REQUIREMENT_NOT_FOUND',
  'AI_ANALYSIS_FAILED',
  'AI_ANALYSIS_SCHEMA_VALIDATION_FAILED',
  'AI_ANALYSIS_GROUNDING_FAILED',
  'AI_ANALYSIS_REQUIREMENT_CHANGED',
  'TEST_DESIGN_PROJECT_MISMATCH',
  'TEST_DESIGN_REQUIREMENT_NOT_FOUND',
  'TEST_DESIGN_FAILED',
  'TEST_DESIGN_SCHEMA_VALIDATION_FAILED',
  'TEST_DESIGN_GROUNDING_FAILED',
  'TEST_DESIGN_REQUIREMENT_CHANGED',
  'SCENARIO_PROJECT_MISMATCH',
  'SCENARIO_REQUIREMENT_NOT_FOUND',
  'SCENARIO_GENERATION_FAILED',
  'SCENARIO_SCHEMA_VALIDATION_FAILED',
  'SCENARIO_GROUNDING_FAILED',
  'SCENARIO_REQUIREMENT_CHANGED',
  'CATEGORIZED_TESTS_PROJECT_MISMATCH',
  'CATEGORIZED_TESTS_REQUIREMENT_NOT_FOUND',
  'CATEGORIZED_TESTS_SCENARIO_NOT_FOUND',
  'CATEGORIZED_TESTS_GENERATION_FAILED',
  'CATEGORIZED_TESTS_SCHEMA_VALIDATION_FAILED',
  'CATEGORIZED_TESTS_GROUNDING_FAILED',
  'CATEGORIZED_TESTS_REQUIREMENT_CHANGED',
  'TEST_SPECIFICATIONS_PROJECT_MISMATCH',
  'TEST_SPECIFICATIONS_REQUIREMENT_NOT_FOUND',
  'TEST_SPECIFICATIONS_SCENARIO_NOT_FOUND',
  'TEST_SPECIFICATIONS_GENERATION_FAILED',
  'TEST_SPECIFICATIONS_SCHEMA_VALIDATION_FAILED',
  'TEST_SPECIFICATIONS_GROUNDING_FAILED',
  'TEST_SPECIFICATIONS_REQUIREMENT_CHANGED',
  'TEST_CASE_PROJECT_MISMATCH',
  'TEST_CASE_NOT_FOUND',
  'TEST_CASE_REQUIREMENT_NOT_FOUND',
  'TEST_CASE_VERSION_MISMATCH',
  'TEST_CASE_VALIDATION_FAILED',
  'TEST_CASE_DUPLICATE_KEY',
  'TEST_CASE_CONCURRENCY_ERROR',
  'TEST_CASE_PERSISTENCE_FAILED',
  'TEST_CASE_IDEMPOTENCY_CONFLICT',
  'TEST_VALIDATION_PROJECT_MISMATCH',
  'TEST_VALIDATION_NOT_FOUND',
  'TEST_VALIDATION_REQUIREMENT_NOT_FOUND',
  'TEST_VALIDATION_TEST_CASE_NOT_FOUND',
  'TEST_VALIDATION_VALIDATION_FAILED',
  'TEST_VALIDATION_STALE',
  'TRACEABILITY_PROJECT_MISMATCH',
  'TRACEABILITY_NOT_FOUND',
  'TRACEABILITY_REQUIREMENT_NOT_FOUND',
  'TRACEABILITY_TEST_CASE_NOT_FOUND',
  'TRACEABILITY_ALREADY_EXISTS',
  'TRACEABILITY_VALIDATION_FAILED',
  'COVERAGE_PROJECT_MISMATCH',
  'COVERAGE_REQUIREMENT_NOT_FOUND',
  'COVERAGE_TEST_CASE_NOT_FOUND',
  'COVERAGE_VALIDATION_FAILED',
  'TEST_REVIEW_PROJECT_MISMATCH',
  'TEST_REVIEW_NOT_FOUND',
  'TEST_VERSION_NOT_FOUND',
  'TEST_VERSION_CONFLICT',
  'TEST_REVIEW_INVALID_TRANSITION',
  'TEST_REGENERATION_FAILED',
  'TEST_REVIEW_VALIDATION_FAILED',
  'COMPILER_VALIDATION_ERROR',
  'TEST_RUN_NOT_FOUND',
  'TEST_RUN_ALREADY_TERMINAL',
  'TEST_RUN_INVALID_STATE_TRANSITION',
  'TEST_RUN_QUEUE_FULL',
  'TEST_RUN_CANCELLATION_REJECTED',
  'TEST_RUN_CONCURRENCY_ERROR',
  'TEST_RUN_VALIDATION_ERROR',
  'TEST_RUN_PLAN_NOT_FOUND',
  'TEST_RUN_PLAN_NOT_EXECUTABLE',
  'TEST_RUN_STALE_ERROR',
  'AUTH_PROFILE_NOT_FOUND',
  'AUTH_PROFILE_PROJECT_MISMATCH',
  'AUTH_PROFILE_DUPLICATE_NAME',
  'AUTH_PROFILE_VALIDATION_ERROR',
  'AGENT_SESSION_NOT_FOUND',
  'AGENT_INVALID_REQUEST',
  'AGENT_TOOL_FAILED',
  'AGENT_APPROVAL_REQUIRED',
  'AGENT_RUN_NOT_FOUND',
  'AGENT_EVIDENCE_NOT_FOUND',
  'AGENT_EXECUTION_FAILED',
  'INTERNAL_ERROR',
  'AGENT_TIMEOUT',
  'AGENT_CANCELLED',
  'AGENT_INVALID_STATE',
  'AGENT_MALFORMED_RESPONSE',
  'AGENT_RUNTIME_ERROR',
  'AGENT_UNAUTHORIZED_TOOL',
  'AI_CROSS_PROJECT_ACCESS',
  'AI_INVALID_REQUEST',
  'WORKSPACE_SESSION_NOT_FOUND',
  'WORKSPACE_SESSION_PROJECT_MISMATCH',
  'WORKSPACE_SESSION_VALIDATION_ERROR',
  'ACCOUNT_DISABLED',
  'ACCOUNT_LOCKED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'SESSION_NOT_FOUND',
  'INVALID_AUTH_INPUT',
  'AUTHENTICATION_UNAVAILABLE',
  'PASSWORD_POLICY_VIOLATION',
  'USER_ALREADY_EXISTS',
  'ACCOUNT_ALREADY_EXISTS',
  'USER_NOT_FOUND',
  'RESET_TOKEN_EXPIRED',
  'RESET_TOKEN_INVALID',
  'PASSWORD_MISMATCH',
  'UNAUTHORIZED',
  'SOCIAL_AUTH_CANCELLED',
  'SOCIAL_AUTH_EXPIRED',
  'SOCIAL_AUTH_STATE_INVALID',
  'SOCIAL_AUTH_PROVIDER_MISMATCH',
  'SOCIAL_AUTH_TOKEN_INVALID',
  'SOCIAL_AUTH_ACCOUNT_CONFLICT',
  'SOCIAL_AUTH_PROVIDER_UNAVAILABLE',
  'SOCIAL_AUTH_NETWORK_ERROR',
  'SOCIAL_AUTH_DUPLICATE_IDENTITY',
  'PROFILE_UPDATE_FAILED',
  'INVALID_DISPLAY_NAME',
  'CURRENT_PASSWORD_INCORRECT',
  'CANNOT_CHANGE_OAUTH_PASSWORD',
  'PREFERENCE_UPDATE_FAILED',
  'ACCOUNT_DELETION_FAILED',
  'REPOSITORY_NOT_FOUND',
  'REPOSITORY_ACCESS_DENIED',
  'REPOSITORY_ALREADY_CONNECTED',
  'REPOSITORY_IMPORT_FAILED',
  'REPOSITORY_IMPORT_CANCELLED',
  'REPOSITORY_IMPORT_TIMEOUT',
  'REPOSITORY_PATH_TRAVERSAL',
  'REPOSITORY_OVERSIZED',
  'GIT_PROVIDER_AUTH_FAILED',
  'LOCAL_FOLDER_NOT_FOUND',
  'LOCAL_FOLDER_ACCESS_DENIED',
  'LOCAL_FOLDER_NOT_CONFIGURED',
  'LOCAL_FOLDER_PATH_TRAVERSAL',
  'LOCAL_FOLDER_SYMLINK_ESCAPE',
  'LOCAL_FOLDER_PERMISSION_DENIED',
  'LOCAL_FOLDER_FILE_TOO_LARGE',
  'LOCAL_FOLDER_FILE_NOT_FOUND',
  'LOCAL_FOLDER_INVALID_PATH',
  'TARGET_ENV_NOT_FOUND',
  'TARGET_ENV_ACCESS_DENIED',
  'TARGET_ENV_VALIDATION_ERROR',
  'TARGET_ENV_UNREACHABLE',
  'TARGET_ENV_AUTH_FAILED',
  'TARGET_ENV_PROD_SAFETY_VIOLATION',
  'PROJECT_CONTEXT_NOT_FOUND',
  'PROJECT_CONTEXT_ACCESS_DENIED',
  ...FAILURE_AND_DEFECT_ERROR_CODES,
];

/**
 * Higher-order IPC handler wrapper enforcing sender validation, request correlation, and strict error sanitization.
 */
export function createSafeIpcHandler<T, A extends unknown[] = unknown[]>(
  channelOrFn: string | ((event: IpcMainInvokeEvent, ...args: A) => T | Promise<T>),
  maybeFn?: (event: IpcMainInvokeEvent, ...args: A) => T | Promise<T>,
): (event: IpcMainInvokeEvent, ...args: A) => Promise<DesktopResult<T>> {
  const channelName = typeof channelOrFn === 'string' ? channelOrFn : 'ipc.anonymous';
  const handlerFn = typeof channelOrFn === 'function' ? channelOrFn : maybeFn!;

  return async (event: IpcMainInvokeEvent, ...args: A): Promise<DesktopResult<T>> => {
    const requestId = crypto.randomUUID();
    const startTime = performance.now();

    // 1. Sender Security Validation
    if (!isTrustedIpcSender(event)) {
      getLogger().warn('ipc.unauthorized_sender', {
        channel: channelName,
        requestId,
      });
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED_SENDER',
          message: 'Unauthorized IPC sender.',
        },
      };
    }

    // 2. Safe Execution and Error Sanitization
    try {
      const data = await handlerFn(event, ...args);
      const durationMs = Math.round(performance.now() - startTime);

      getLogger().debug('ipc.request_success', {
        channel: channelName,
        requestId,
        durationMs,
      });

      if (
        data !== null &&
        typeof data === 'object' &&
        'ok' in data &&
        typeof (data as { ok: unknown }).ok === 'boolean'
      ) {
        return data as DesktopResult<T>;
      }

      return {
        ok: true,
        data,
      };
    } catch (error: unknown) {
      const durationMs = Math.round(performance.now() - startTime);

      // Check if this is a known, controlled domain error
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof (error as { code: unknown }).code === 'string'
      ) {
        const domainCode = (error as { code: string }).code as DesktopErrorCode;
        if (ALLOWED_ERROR_CODES.includes(domainCode)) {
          const errObj = error as { message?: unknown };
          getLogger().debug('ipc.request_controlled_error', {
            channel: channelName,
            requestId,
            durationMs,
            code: domainCode,
          });

          return {
            ok: false,
            error: {
              code: domainCode,
              message: typeof errObj.message === 'string' ? errObj.message : 'Operation failed.',
            },
          };
        }
      }

      // Log unexpected internal error with requestId and duration in privileged logs
      getLogger().error('ipc.request_failed', error, {
        channel: channelName,
        requestId,
        durationMs,
      });

      // Return strictly sanitized error envelope to renderer
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The desktop operation failed.',
        },
      };
    }
  };
}

/**
 * Register all desktop IPC handlers. Idempotent to prevent duplicate registration errors.
 */
export function registerIpcHandlers(): void {
  if (isIpcRegistered) {
    return;
  }

  const ipcMain = electron?.ipcMain;
  if (!ipcMain) {
    return;
  }

  ipcMain.handle(
    DESKTOP_CHANNELS.APP_GET_INFO,
    createSafeIpcHandler(DESKTOP_CHANNELS.APP_GET_INFO, () => getAppInfo()),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.HEALTH_CHECK,
    createSafeIpcHandler(DESKTOP_CHANNELS.HEALTH_CHECK, () => getHealthStatus()),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.DATABASE_GET_STATUS,
    createSafeIpcHandler(DESKTOP_CHANNELS.DATABASE_GET_STATUS, () => getDatabaseStatus()),
  );

  // Project Management
  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_LIST,
      (event: IpcMainInvokeEvent, input: unknown) => handleListProjects(event, input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_GET,
      (event: IpcMainInvokeEvent, projectId: unknown) => handleGetProject(event, projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_CREATE,
      (event: IpcMainInvokeEvent, input: unknown) => handleCreateProject(event, input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_UPDATE,
      (event: IpcMainInvokeEvent, input: unknown) => handleUpdateProject(event, input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_ARCHIVE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_ARCHIVE,
      (event: IpcMainInvokeEvent, projectId: unknown) => handleArchiveProject(event, projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_RESTORE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_RESTORE,
      (event: IpcMainInvokeEvent, projectId: unknown) => handleRestoreProject(event, projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_DELETE,
      (event: IpcMainInvokeEvent, projectId: unknown) => handleDeleteProject(event, projectId),
    ),
  );

  // Environment Management
  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_CREATE,
      (_event: IpcMainInvokeEvent, input: unknown) => handleCreateEnvironment(input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_UPDATE,
      (_event: IpcMainInvokeEvent, input: unknown) => handleUpdateEnvironment(input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_DELETE,
      (_event: IpcMainInvokeEvent, input: unknown) => handleDeleteEnvironment(input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_SET_DEFAULT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_SET_DEFAULT,
      (_event: IpcMainInvokeEvent, input: unknown) => handleSetDefaultEnvironment(input),
    ),
  );

  // Source Attachment Management (V2 Phases 15–24)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_GET,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleGetSource(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_PICK_DIRECTORY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_PICK_DIRECTORY,
      (_event: IpcMainInvokeEvent) => handlePickDirectory(),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_ATTACH_LOCAL_DIRECTORY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_ATTACH_LOCAL_DIRECTORY,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleAttachLocalDirectory(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_DETACH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_DETACH,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleDetachSource(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_VALIDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_VALIDATE,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleValidateSource(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_REFRESH_METADATA,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_REFRESH_METADATA,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleRefreshSourceMetadata(projectId),
    ),
  );

  // Git Repository Detection (V2 Phase 17)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_GIT_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_GIT_GET,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleGetGitStatus(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_GIT_REFRESH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_GIT_REFRESH,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleRefreshGitMetadata(projectId),
    ),
  );

  // Structure Discovery (V2 Phases 18 & 19)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_STRUCTURE_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_STRUCTURE_GET,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleGetSourceStructure(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_STRUCTURE_REFRESH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_STRUCTURE_REFRESH,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleRefreshSourceStructure(projectId),
    ),
  );

  // Technology Profiling (V2 Phase 20)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_TECHNOLOGY_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_TECHNOLOGY_GET,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleGetTechnologyProfile(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_TECHNOLOGY_REFRESH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_TECHNOLOGY_REFRESH,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleRefreshTechnologyProfile(projectId),
    ),
  );

  // Framework & Dependency Profiling (V2 Phase 21)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_FRAMEWORKS_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_FRAMEWORKS_GET,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleGetFrameworkProfile(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_FRAMEWORKS_REFRESH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_FRAMEWORKS_REFRESH,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleRefreshFrameworkProfile(projectId),
    ),
  );

  // Source File Classification (V2 Phase 22)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_CLASSIFICATION_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_CLASSIFICATION_GET,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleGetClassificationProfile(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_CLASSIFICATION_REFRESH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_CLASSIFICATION_REFRESH,
      (_event: IpcMainInvokeEvent, projectId: unknown) =>
        handleRefreshClassificationProfile(projectId),
    ),
  );

  // Secure Source Content Access (V2 Phase 23)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_CONTENT_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_CONTENT_GET,
      (_event: IpcMainInvokeEvent, input: unknown) => handleGetSourceFileContent(input),
    ),
  );

  // Repository Index & Source Intelligence (V2 Phase 24)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_INDEX_GET_STATUS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_INDEX_GET_STATUS,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleGetRepositoryIndexStatus(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_INDEX_REFRESH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_INDEX_REFRESH,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleRefreshRepositoryIndex(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_INDEX_LIST_FILES,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_INDEX_LIST_FILES,
      (_event: IpcMainInvokeEvent, input: unknown) => handleListIndexedFiles(input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_INDEX_GET_FILE_DETAILS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_INDEX_GET_FILE_DETAILS,
      (_event: IpcMainInvokeEvent, input: unknown) => handleGetFileDetails(input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_INDEX_SEARCH_SYMBOLS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_INDEX_SEARCH_SYMBOLS,
      (_event: IpcMainInvokeEvent, input: unknown) => handleSearchSymbols(input),
    ),
  );

  // Application Architecture & Entry-Point Discovery (V2 Phase 25)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_ARCHITECTURE_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_ARCHITECTURE_GET,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleGetArchitectureProfile(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_ARCHITECTURE_REFRESH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_ARCHITECTURE_REFRESH,
      (_event: IpcMainInvokeEvent, projectId: unknown) =>
        handleRefreshArchitectureProfile(projectId),
    ),
  );

  // Application Run & Startup Configuration (V2 Phase 26)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_GET,
      (_event: IpcMainInvokeEvent, projectId: unknown) =>
        handleGetRunConfigurationProfile(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_DETECT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_DETECT,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleDetectRunConfiguration(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_SELECT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_SELECT,
      (_event: IpcMainInvokeEvent, input: unknown) => handleSelectRunConfiguration(input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_UPDATE_TARGET_URL,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_UPDATE_TARGET_URL,
      (_event: IpcMainInvokeEvent, input: unknown) => handleUpdateTargetUrl(input),
    ),
  );

  // Repository Snapshots & Change Detection (V2 Phase 27)
  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_LIST,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleListSnapshots(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_CREATE,
      (_event: IpcMainInvokeEvent, input: unknown) => handleCreateSnapshot(input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_SET_BASELINE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_SET_BASELINE,
      (_event: IpcMainInvokeEvent, input: unknown) => handleSetBaseline(input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_DELETE,
      (_event: IpcMainInvokeEvent, input: unknown) => handleDeleteSnapshot(input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_CHANGES_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_CHANGES_GET,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleGetChanges(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SOURCES_CHANGES_REFRESH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SOURCES_CHANGES_REFRESH,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleRefreshChanges(projectId),
    ),
  );

  // Requirement Intelligence Channels (V3 Phases 29–30)
  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_LIST,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleListRequirements(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_BY_KEY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_BY_KEY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementByKey(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_SUMMARY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_SUMMARY,
      (_event: IpcMainInvokeEvent, projectId: unknown) => handleGetRequirementSummary(projectId),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_CREATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleCreateRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_UPDATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleUpdateRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_ACTIVATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_ACTIVATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleActivateRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_DEPRECATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_DEPRECATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleDeprecateRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_DRAFT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_DRAFT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleDraftRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_ARCHIVE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_ARCHIVE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleArchiveRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_RESTORE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_RESTORE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleRestoreRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_DELETE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleDeleteRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_PARSE_BULK,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_PARSE_BULK,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleParseBulkRequirements(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_IMPORT_BULK,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_IMPORT_BULK,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleImportBulkRequirements(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_SOURCES_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_SOURCES_LIST,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleListRequirementSources(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_SOURCES_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_SOURCES_GET,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementSource(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_SELECT_AND_INGEST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_SELECT_AND_INGEST,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleSelectAndIngestDocument(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_LIST,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleListRequirementDocuments(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_GET,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementDocument(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_DELETE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleDeleteRequirementDocument(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_EXTRACT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_EXTRACT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleExtractRequirementDocument(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_GET_EXTRACTION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_GET_EXTRACTION,
      (_event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetRequirementDocumentExtraction(payload),
    ),
  );

  // Requirement Candidate Channels (V3 Phase 35)
  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_DETECT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_DETECT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleDetectRequirementCandidates(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_LIST,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleListRequirementCandidates(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_UPDATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleUpdateRequirementCandidate(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_SET_STATUS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_SET_STATUS,
      (_event: IpcMainInvokeEvent, payload: unknown) =>
        handleSetRequirementCandidateStatus(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_IMPORT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_IMPORT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleImportApprovedCandidates(payload),
    ),
  );

  // Requirement Source Provenance & Auditability (V3 Phase 36)
  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_PROVENANCE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_PROVENANCE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementProvenance(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_SOURCE_CONTEXT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_SOURCE_CONTEXT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementSourceContext(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_NORMALIZE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_NORMALIZE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleNormalizeRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_REPRESENTATION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_REPRESENTATION,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementRepresentation(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_REPRESENTATION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_REPRESENTATION,
      (_event: IpcMainInvokeEvent, payload: unknown) =>
        handleUpdateRequirementRepresentation(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_REGENERATE_REPRESENTATION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_REGENERATE_REPRESENTATION,
      (_event: IpcMainInvokeEvent, payload: unknown) =>
        handleRegenerateRequirementRepresentation(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_BATCH_NORMALIZE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_BATCH_NORMALIZE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleBatchNormalizeRequirements(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_CLASSIFY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_CLASSIFY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleClassifyRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_METADATA,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_METADATA,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementMetadata(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_METADATA,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_METADATA,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleUpdateRequirementMetadata(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_REGENERATE_METADATA,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_REGENERATE_METADATA,
      (_event: IpcMainInvokeEvent, payload: unknown) =>
        handleRegenerateRequirementMetadata(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_BATCH_CLASSIFY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_BATCH_CLASSIFY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleBatchClassifyRequirements(payload),
    ),
  );

  // Requirement Quality, Testability, Ambiguity & Clarification Analysis Channels (V3 Phase 39)
  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_ANALYZE_QUALITY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_ANALYZE_QUALITY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleAnalyzeQuality(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_QUALITY_ANALYSIS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_QUALITY_ANALYSIS,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetQualityAnalysis(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_QUALITY_FINDING,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_QUALITY_FINDING,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleReviewQualityFinding(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_REANALYZE_QUALITY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_REANALYZE_QUALITY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleReanalyzeQuality(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_BATCH_ANALYZE_QUALITY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_BATCH_ANALYZE_QUALITY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleBatchAnalyzeQuality(payload),
    ),
  );

  // Requirement Dependency, Relationship & Repository Evidence Mapping Channels (V3 Phase 40)
  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_PROPOSE_RELATIONSHIPS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_PROPOSE_RELATIONSHIPS,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleProposeRelationships(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_RELATIONSHIPS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_RELATIONSHIPS,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRelationships(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_RELATIONSHIP_GRAPH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_RELATIONSHIP_GRAPH,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRelationshipGraph(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_CREATE_MANUAL_RELATIONSHIP,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_CREATE_MANUAL_RELATIONSHIP,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleCreateManualRelationship(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_RELATIONSHIP,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_RELATIONSHIP,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleReviewRelationship(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_DELETE_RELATIONSHIP,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_DELETE_RELATIONSHIP,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleDeleteRelationship(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_MATCH_REPOSITORY_EVIDENCE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_MATCH_REPOSITORY_EVIDENCE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleMatchRepositoryEvidence(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_REPOSITORY_EVIDENCE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_REPOSITORY_EVIDENCE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRepositoryEvidence(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_REPOSITORY_EVIDENCE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_REPOSITORY_EVIDENCE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleReviewRepositoryEvidence(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_CREATE_MANUAL_REPOSITORY_EVIDENCE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_CREATE_MANUAL_REPOSITORY_EVIDENCE,
      (_event: IpcMainInvokeEvent, payload: unknown) =>
        handleCreateManualRepositoryEvidence(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_DELETE_REPOSITORY_EVIDENCE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_DELETE_REPOSITORY_EVIDENCE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleDeleteRepositoryEvidence(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_PREVIEW_REPOSITORY_EVIDENCE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_PREVIEW_REPOSITORY_EVIDENCE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handlePreviewRepositoryEvidence(payload),
    ),
  );

  // Requirement Versioning, Change Detection & Impact Foundation Channels (V3 Phase 41)
  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_HISTORY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_HISTORY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementHistory(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_VERSION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_VERSION,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementVersion(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_COMPARE_VERSIONS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_COMPARE_VERSIONS,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleCompareRequirementVersions(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_VERSIONED,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_VERSIONED,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleUpdateRequirementVersioned(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_RESTORE_VERSION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_RESTORE_VERSION,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleRestoreRequirementVersion(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_GET_CHANGE_IMPACT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_GET_CHANGE_IMPACT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementChangeImpact(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_CHANGE_IMPACT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_CHANGE_IMPACT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleReviewRequirementImpact(payload),
    ),
  );

  // AI Provider Gateway Handlers (V4 Phase 43)
  ipcMain.handle(
    DESKTOP_CHANNELS.AI_GET_PROVIDER_STATUS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_GET_PROVIDER_STATUS,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetAiProviderStatus(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AI_HEALTH_CHECK,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_HEALTH_CHECK,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleAiHealthCheck(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AI_GENERATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_GENERATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleAiGenerate(payload),
    ),
  );

  // Agent Runtime Foundation Handlers (V10 Phase 141)
  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_CREATE,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleCreateAgentRuntimeTask(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_GET,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleGetAgentRuntimeTask(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_CANCEL,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleCancelAgentRuntimeTask(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_GET_EVENTS,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleGetAgentRuntimeTaskEvents(event, payload);
    },
  );

  // Task / Conversation / Thread Model Handlers (V10 Phase 142)
  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_CREATE,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleCreateAgentThread(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_LIST,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleListAgentThreads(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_GET,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleGetAgentThread(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_ARCHIVE,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleArchiveAgentThread(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_TASK_CREATE,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleCreateAgentThreadTask(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_TASK_GET,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleGetAgentThreadTask(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_TASK_LIST,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleListAgentThreadTasks(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_TASK_CANCEL,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleCancelAgentThreadTask(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_TASK_RETRY,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleRetryAgentThreadTask(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_TASK_RESUME,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleResumeAgentThreadTask(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_TASK_STOP,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleStopAgentThreadTask(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_TASK_PAUSE,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handlePauseAgentThreadTask(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_TASK_CONTROL_AUDIT_LOGS_LIST,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleListAgentTaskControlAuditLogs(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_TASK_GET_RECOVERY_STATE,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleGetTaskRecoveryState(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_TASK_LIST_RECOVERABLE,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleListRecoverableTasks(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_TASK_CHECKPOINTS_LIST,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleListAgentTaskCheckpoints(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_WORKFLOW_EXECUTE,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleExecuteAutonomousWorkflow(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_WORKFLOW_GET_REPORT,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleGetAutonomousWorkflowReport(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_WORKFLOW_APPROVE_FIX,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleApproveWorkflowFix(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_WORKFLOW_REJECT_FIX,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleRejectWorkflowFix(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_THREAD_MESSAGE_LIST,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleListAgentThreadMessages(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_EXECUTION_STEP_LIST,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleListAgentExecutionSteps(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_TOOL_CALL_LIST,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleListAgentToolCalls(event, payload);
    },
  );

  // Tool Registry & Invocation Channels (V10 Phase 143)
  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_TOOL_REGISTRY_LIST,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleListAgentTools(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_TOOL_REGISTRY_GET,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleGetAgentTool(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_TOOL_REGISTRY_INVOKE,
    async (event: IpcMainInvokeEvent, payload: unknown) => {
      return handleInvokeAgentTool(event, payload);
    },
  );

  // Tool Permission & Approval Channels (V10 Phase 144)
  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_TOOL_APPROVAL_LIST,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleListToolApprovals(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_TOOL_APPROVAL_GET,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetToolApproval(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_TOOL_APPROVAL_DECIDE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleDecideToolApproval(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_TOOL_AUDIT_LOG_LIST,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleListToolAuditLogs(event, payload);
    },
  );

  // Repair / Patch Tool Channels (V10 Phase 149)
  ipcMain.handle(
    DESKTOP_CHANNELS.REPAIR_PATCH_PROPOSE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleProposeRepairPatch(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REPAIR_PATCH_GET,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetRepairPatch(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REPAIR_PATCH_APPROVE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleApproveRepairPatch(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REPAIR_PATCH_REJECT,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleRejectRepairPatch(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REPAIR_PATCH_CANCEL,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleCancelRepairPatch(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.REPAIR_PATCH_APPLY,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleApplyRepairPatch(event, payload);
    },
  );

  // Git Diff & Change Review Channels (V10 Phase 150)
  ipcMain.handle(
    DESKTOP_CHANNELS.GIT_DIFF_GET_STATUS,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetGitWorkingStatus(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.GIT_DIFF_GET,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetGitDiff(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_CREATE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleCreateGitChangeReview(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_GET,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetGitChangeReview(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_APPROVE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleApproveGitChangeReview(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_REJECT,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleRejectGitChangeReview(event, payload);
    },
  );

  // V10 Phase 151: Terminal Gateway Channels
  ipcMain.handle(
    DESKTOP_CHANNELS.TERMINAL_EXECUTE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleExecuteTerminal(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TERMINAL_GET_EXECUTION,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetTerminalExecution(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TERMINAL_LIST_EXECUTIONS,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleListTerminalExecutions(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TERMINAL_APPROVE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleApproveTerminalExecution(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TERMINAL_REJECT,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleRejectTerminalExecution(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TERMINAL_CANCEL,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleCancelTerminalExecution(event, payload);
    },
  );

  // V10 Phase 152: Multi-Step Planning Channels
  ipcMain.handle(
    DESKTOP_CHANNELS.PLANNER_CREATE_PLAN,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handlePlannerCreatePlan(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLANNER_GET_PLAN,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handlePlannerGetPlan(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLANNER_LIST_PLANS,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handlePlannerListPlans(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLANNER_GET_ACTIVE_PLAN,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handlePlannerGetActivePlan(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLANNER_ADD_STEP,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handlePlannerAddStep(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLANNER_REMOVE_STEP,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handlePlannerRemoveStep(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLANNER_REORDER_STEPS,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handlePlannerReorderSteps(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLANNER_MODIFY_STEP,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handlePlannerModifyStep(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLANNER_SET_STEP_STATUS,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handlePlannerSetStepStatus(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLANNER_SET_PLAN_STATUS,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handlePlannerSetPlanStatus(event, payload);
    },
  );

  // Agent Execution Loop Channels (V10 Phase 153)
  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_LOOP_START,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleAgentLoopStart(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_LOOP_RESUME,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleAgentLoopResume(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_LOOP_CANCEL,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleAgentLoopCancel(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_LOOP_GET_STATUS,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleAgentLoopGetStatus(event, payload);
    },
  );

  // Streaming Activity / Tool Progress Channels (V10 Phase 154)
  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_ACTIVITY_SUBSCRIBE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleSubscribeAgentActivity(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_ACTIVITY_UNSUBSCRIBE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleUnsubscribeAgentActivity(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_ACTIVITY_GET_TIMELINE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetAgentActivityTimeline(event, payload);
    },
  );

  // V10 Phase 155 — Human Approval Gates Channels
  ipcMain.handle(
    DESKTOP_CHANNELS.APPROVAL_CREATE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleCreateApproval(event, payload);
    },
  );
  ipcMain.handle(
    'approval.create',
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleCreateApproval(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.APPROVAL_GET,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetApproval(event, payload);
    },
  );
  ipcMain.handle(
    'approval.get',
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetApproval(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.APPROVAL_LIST,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleListApprovals(event, payload);
    },
  );
  ipcMain.handle(
    'approval.list',
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleListApprovals(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.APPROVAL_APPROVE,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleApproveApproval(event, payload);
    },
  );
  ipcMain.handle(
    'approval.approve',
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleApproveApproval(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.APPROVAL_REJECT,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleRejectApproval(event, payload);
    },
  );
  ipcMain.handle(
    'approval.reject',
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleRejectApproval(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.APPROVAL_CANCEL,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleCancelApproval(event, payload);
    },
  );
  ipcMain.handle(
    'approval.cancel',
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleCancelApproval(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.APPROVAL_GET_PENDING,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetPendingApproval(event, payload);
    },
  );
  ipcMain.handle(
    'approval.getPending',
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetPendingApproval(event, payload);
    },
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.APPROVAL_GET_AUDIT_HISTORY,
    async (event: IpcMainInvokeEvent, payload: any) => {
      return handleGetApprovalAuditHistory(event, payload);
    },
  );

  // V10 Phase 156: File & Diff Review Workspace Handlers
  registerFileReviewHandlers(ipcMain);

  // AI Configuration & Prompt Execution Channels (V4 Phase 44)
  ipcMain.handle(
    DESKTOP_CHANNELS.AI_CONFIG_GET_DEFAULTS,
    createSafeIpcHandler(DESKTOP_CHANNELS.AI_CONFIG_GET_DEFAULTS, () =>
      handleGetAiConfigDefaults(),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AI_EXECUTE_PROMPT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_EXECUTE_PROMPT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleAiExecutePrompt(payload),
    ),
  );

  // Embedding & Vector Retrieval Channels (V4 Phase 45)
  ipcMain.handle(
    DESKTOP_CHANNELS.AI_EMBEDDING_GET_STATUS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_EMBEDDING_GET_STATUS,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetEmbeddingIndexStatus(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AI_EMBEDDING_INDEX_SUBJECTS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_EMBEDDING_INDEX_SUBJECTS,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleIndexSubjects(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AI_EMBEDDING_SEARCH_SIMILAR,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_EMBEDDING_SEARCH_SIMILAR,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleVectorSearchSimilar(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AI_EMBEDDING_REINDEX_STALE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_EMBEDDING_REINDEX_STALE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleReindexStaleEmbeddings(payload),
    ),
  );

  // RAG & Requirement Context Retrieval Channels (V4 Phase 46)
  ipcMain.handle(
    DESKTOP_CHANNELS.AI_RAG_RETRIEVE_REQUIREMENT_CONTEXT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_RAG_RETRIEVE_REQUIREMENT_CONTEXT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleRetrieveRequirementContext(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AI_RAG_GET_CONFIG_DEFAULTS,
    createSafeIpcHandler(DESKTOP_CHANNELS.AI_RAG_GET_CONFIG_DEFAULTS, () =>
      handleGetRagConfigDefaults(),
    ),
  );

  // LLM Requirement Analysis & Context-Aware Reasoning (V4 Phase 47)
  ipcMain.handle(
    DESKTOP_CHANNELS.AI_ANALYSIS_ANALYZE_REQUIREMENT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_ANALYSIS_ANALYZE_REQUIREMENT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleAnalyzeRequirement(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AI_ANALYSIS_GET_CURRENT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_ANALYSIS_GET_CURRENT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetCurrentAnalysis(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AI_ANALYSIS_GET_HISTORY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_ANALYSIS_GET_HISTORY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetAnalysisHistory(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AI_ANALYSIS_REGENERATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AI_ANALYSIS_REGENERATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleRegenerateAnalysis(payload),
    ),
  );

  // Test Design Intelligence Foundation Channels (V4 Phase 48)
  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_DESIGN_ANALYZE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_DESIGN_ANALYZE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleAnalyzeTestDesign(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_DESIGN_GET_CURRENT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_DESIGN_GET_CURRENT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetCurrentTestDesign(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_DESIGN_GET_HISTORY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_DESIGN_GET_HISTORY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetTestDesignHistory(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_DESIGN_REGENERATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_DESIGN_REGENERATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleRegenerateTestDesign(payload),
    ),
  );

  // Requirement-to-Test Scenario Generation Channels (V4 Phase 49)
  ipcMain.handle(
    DESKTOP_CHANNELS.SCENARIOS_GENERATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SCENARIOS_GENERATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGenerateScenarios(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SCENARIOS_GET_CURRENT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SCENARIOS_GET_CURRENT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetCurrentScenarios(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SCENARIOS_GET_HISTORY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SCENARIOS_GET_HISTORY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetScenariosHistory(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.SCENARIOS_REGENERATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SCENARIOS_REGENERATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleRegenerateScenarios(payload),
    ),
  );

  // Categorized Test Generation Channels (V4 Phase 50)
  ipcMain.handle(
    DESKTOP_CHANNELS.CATEGORIZED_TESTS_GENERATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.CATEGORIZED_TESTS_GENERATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGenerateCategorizedTests(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.CATEGORIZED_TESTS_GET_CURRENT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.CATEGORIZED_TESTS_GET_CURRENT,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetCategorizedTests(payload),
    ),
  );

  // Preconditions, Test Data & Expected Result Enrichment Channels (V4 Phase 51)
  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_SPECIFICATIONS_ENRICH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_SPECIFICATIONS_ENRICH,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleEnrichTestSpecifications(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_SPECIFICATIONS_GET_CURRENT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_SPECIFICATIONS_GET_CURRENT,
      (_event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetEnrichedTestSpecifications(payload),
    ),
  );

  // Structured Test Cases (V4 Phase 52)
  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_CASES_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_CASES_CREATE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleCreateTestCase(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_CASES_GET_BY_ID,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_CASES_GET_BY_ID,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetTestCaseById(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_CASES_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_CASES_LIST,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleListTestCases(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_CASES_PERSIST_FROM_GENERATION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_CASES_PERSIST_FROM_GENERATION,
      (_event: IpcMainInvokeEvent, payload: unknown) => handlePersistFromGeneration(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_CASES_PERSIST_BATCH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_CASES_PERSIST_BATCH,
      (_event: IpcMainInvokeEvent, payload: unknown) => handlePersistBatchFromGeneration(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_CASES_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_CASES_DELETE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleDeleteTestCase(payload),
    ),
  );

  // AI Test Generation Validation & Hallucination Control Handlers (V4 Phase 53)
  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_TEST_CASE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_TEST_CASE,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleValidateTestCase(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_SPECIFICATION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_SPECIFICATION,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleValidateSpecification(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_BATCH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_BATCH,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleValidateBatch(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_VALIDATION_GET_LATEST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_VALIDATION_GET_LATEST,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleGetLatestValidation(payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_VALIDATION_LIST_HISTORY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_VALIDATION_LIST_HISTORY,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleListValidationHistory(payload),
    ),
  );

  // Requirement-to-Test Traceability Handlers (V4 Phase 54)
  ipcMain.handle(
    DESKTOP_CHANNELS.TRACEABILITY_CREATE_TRACE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TRACEABILITY_CREATE_TRACE,
      (event: IpcMainInvokeEvent, payload: unknown) => handleCreateTrace(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TRACEABILITY_DELETE_TRACE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TRACEABILITY_DELETE_TRACE,
      (event: IpcMainInvokeEvent, payload: unknown) => handleDeleteTrace(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TRACEABILITY_GET_BY_ID,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TRACEABILITY_GET_BY_ID,
      (event: IpcMainInvokeEvent, payload: unknown) => handleGetTraceById(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TRACEABILITY_LIST_BY_REQUIREMENT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TRACEABILITY_LIST_BY_REQUIREMENT,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleListTracesByRequirement(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TRACEABILITY_LIST_BY_TEST_CASE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TRACEABILITY_LIST_BY_TEST_CASE,
      (event: IpcMainInvokeEvent, payload: unknown) => handleListTracesByTestCase(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TRACEABILITY_LIST_PROJECT_TRACES,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TRACEABILITY_LIST_PROJECT_TRACES,
      (event: IpcMainInvokeEvent, payload: unknown) => handleListProjectTraces(event, payload),
    ),
  );

  // Coverage Analysis & Traceability Matrix Handlers (V4 Phase 55)
  ipcMain.handle(
    DESKTOP_CHANNELS.COVERAGE_GET_PROJECT_SUMMARY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.COVERAGE_GET_PROJECT_SUMMARY,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetProjectCoverageSummary(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.COVERAGE_GET_REQUIREMENT_COVERAGE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.COVERAGE_GET_REQUIREMENT_COVERAGE,
      (event: IpcMainInvokeEvent, payload: unknown) => handleGetRequirementCoverage(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.COVERAGE_GET_TRACEABILITY_MATRIX,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.COVERAGE_GET_TRACEABILITY_MATRIX,
      (event: IpcMainInvokeEvent, payload: unknown) => handleGetTraceabilityMatrix(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.COVERAGE_GET_REVERSE_TRACEABILITY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.COVERAGE_GET_REVERSE_TRACEABILITY,
      (event: IpcMainInvokeEvent, payload: unknown) => handleGetReverseTraceability(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.COVERAGE_GET_ORPHAN_TESTS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.COVERAGE_GET_ORPHAN_TESTS,
      (event: IpcMainInvokeEvent, payload: unknown) => handleGetOrphanTests(event, payload),
    ),
  );

  // Test Review, Approval, Regeneration & Versioning (Phase 56)
  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_REVIEW_LIST_QUEUE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_REVIEW_LIST_QUEUE,
      (event: IpcMainInvokeEvent, payload: unknown) => handleListTestReviewQueue(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_REVIEW_GET_DETAIL,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_REVIEW_GET_DETAIL,
      (event: IpcMainInvokeEvent, payload: unknown) => handleGetTestReviewDetail(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_REVIEW_APPROVE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_REVIEW_APPROVE,
      (event: IpcMainInvokeEvent, payload: unknown) => handleApproveTestVersion(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_REVIEW_REJECT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_REVIEW_REJECT,
      (event: IpcMainInvokeEvent, payload: unknown) => handleRejectTestVersion(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_REVIEW_EDIT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_REVIEW_EDIT,
      (event: IpcMainInvokeEvent, payload: unknown) => handleEditTestCase(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_REVIEW_REGENERATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_REVIEW_REGENERATE,
      (event: IpcMainInvokeEvent, payload: unknown) => handleRegenerateTestCase(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_REVIEW_GET_HISTORY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_REVIEW_GET_HISTORY,
      (event: IpcMainInvokeEvent, payload: unknown) => handleGetTestHistory(event, payload),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_REVIEW_COMPARE_VERSIONS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_REVIEW_COMPARE_VERSIONS,
      (event: IpcMainInvokeEvent, payload: unknown) => handleCompareTestVersions(event, payload),
    ),
  );

  // V5 Phase 59: Target Application & Environments
  ipcMain.handle(
    DESKTOP_CHANNELS.TARGET_APP_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TARGET_APP_GET,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetTargetApplication(
          event,
          typeof payload === 'string' ? payload : (payload as { projectId: string })?.projectId,
        ),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TARGET_APP_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TARGET_APP_UPDATE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleUpdateTargetApplication(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.ENVIRONMENT_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.ENVIRONMENT_LIST,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleListEnvironments(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.ENVIRONMENT_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.ENVIRONMENT_GET,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetEnvironment(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.ENVIRONMENT_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.ENVIRONMENT_CREATE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleCreatePhase59Environment(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.ENVIRONMENT_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.ENVIRONMENT_UPDATE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleUpdatePhase59Environment(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.ENVIRONMENT_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.ENVIRONMENT_DELETE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleDeletePhase59Environment(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.ENVIRONMENT_SET_DEFAULT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.ENVIRONMENT_SET_DEFAULT,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleSetDefaultPhase59Environment(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.ENVIRONMENT_CHECK_REACHABILITY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.ENVIRONMENT_CHECK_REACHABILITY,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleCheckEnvironmentReachability(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.ENVIRONMENT_RESOLVE_SNAPSHOT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.ENVIRONMENT_RESOLVE_SNAPSHOT,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleResolveEnvironmentSnapshot(event, payload as any),
    ),
  );

  // V5 Phase 60: Executable Test Plan Compiler
  ipcMain.handle(
    DESKTOP_CHANNELS.PLAN_COMPILER_COMPILE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PLAN_COMPILER_COMPILE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleCompilePlan(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLAN_COMPILER_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PLAN_COMPILER_GET,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetPlan(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLAN_COMPILER_GET_BY_TEST_CASE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PLAN_COMPILER_GET_BY_TEST_CASE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetPlanByTestCase(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLAN_COMPILER_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PLAN_COMPILER_LIST,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleListPlans(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PLAN_COMPILER_PREVIEW,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PLAN_COMPILER_PREVIEW,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handlePreviewPlan(event, payload as any),
    ),
  );

  // V5 Phase 61: Test Run Orchestration, Queue & Execution
  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_RUN_ENQUEUE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_RUN_ENQUEUE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleEnqueueTestRun(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_RUN_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_RUN_GET,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetTestRun(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_RUN_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_RUN_LIST,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleListTestRuns(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_RUN_CANCEL,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_RUN_CANCEL,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleCancelTestRun(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.TEST_RUN_GET_QUEUE_STATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TEST_RUN_GET_QUEUE_STATE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetTestRunQueueState(event, payload as any),
    ),
  );

  // V5 Phase 62: Browser Session & Authentication Profiles
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_PROFILE_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_PROFILE_CREATE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleCreateAuthProfile(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_PROFILE_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_PROFILE_GET,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetAuthProfile(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_PROFILE_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_PROFILE_LIST,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleListAuthProfiles(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_PROFILE_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_PROFILE_UPDATE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleUpdateAuthProfile(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_PROFILE_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_PROFILE_DELETE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleDeleteAuthProfile(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_PROFILE_VALIDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_PROFILE_VALIDATE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleValidateAuthProfile(event, payload as any),
    ),
  );

  // V8 Phase 124: Conversational AI Testing Agent
  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_SESSION_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AGENT_SESSION_CREATE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleCreateAgentSession(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_SESSION_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AGENT_SESSION_GET,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetAgentSession(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_SESSION_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AGENT_SESSION_LIST,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleListAgentSessions(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_SESSION_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AGENT_SESSION_DELETE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleDeleteAgentSession(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_SEND_MESSAGE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AGENT_SEND_MESSAGE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleSendAgentMessage(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_APPROVE_ACTION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AGENT_APPROVE_ACTION,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleApproveAgentAction(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_RUN_CONTROL,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AGENT_RUN_CONTROL,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleAgentRunControl(event, payload as any),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.AGENT_GET_EVIDENCE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AGENT_GET_EVIDENCE,
      (event: IpcMainInvokeEvent, payload: unknown) =>
        handleGetAgentEvidence(event, payload as any),
    ),
  );

  // Renderer Diagnostic Error Reporting (Narrow IPC)
  ipcMain.handle(
    DESKTOP_CHANNELS.LOGGING_REPORT_RENDERER_ERROR,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOGGING_REPORT_RENDERER_ERROR,
      (_event: IpcMainInvokeEvent, payload: unknown) => handleReportRendererError(payload),
    ),
  );

  // V8 Phase 111 — Shell Layout & Workspace Sessions
  ipcMain.handle(
    DESKTOP_CHANNELS.SHELL_LAYOUT_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SHELL_LAYOUT_GET,
      () => handleGetShellLayout(),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.SHELL_LAYOUT_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SHELL_LAYOUT_UPDATE,
      (_event: IpcMainInvokeEvent, input: unknown) => handleUpdateShellLayout(input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WORKSPACE_SESSIONS_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WORKSPACE_SESSIONS_LIST,
      (_event: IpcMainInvokeEvent, input: unknown) => handleListWorkspaceSessions(input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WORKSPACE_SESSIONS_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WORKSPACE_SESSIONS_GET,
      (_event: IpcMainInvokeEvent, input: unknown) => handleGetWorkspaceSession(input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WORKSPACE_SESSIONS_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WORKSPACE_SESSIONS_CREATE,
      (_event: IpcMainInvokeEvent, input: unknown) => handleCreateWorkspaceSession(input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WORKSPACE_SESSIONS_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WORKSPACE_SESSIONS_UPDATE,
      (_event: IpcMainInvokeEvent, input: unknown) => handleUpdateWorkspaceSession(input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WORKSPACE_SESSIONS_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WORKSPACE_SESSIONS_DELETE,
      (_event: IpcMainInvokeEvent, input: unknown) => handleDeleteWorkspaceSession(input),
    ),
  );

  // V8 Phase 113, 114, 115 — User Authentication & Social Authentication
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_GET_STATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_GET_STATE,
      (event: IpcMainInvokeEvent) => handleGetAuthState(event),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_GET_CURRENT_USER,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_GET_CURRENT_USER,
      (event: IpcMainInvokeEvent) => handleGetCurrentUser(event),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_LOGIN,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_LOGIN,
      (event: IpcMainInvokeEvent, input: any) => handleLogin(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_SIGNUP,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_SIGNUP,
      (event: IpcMainInvokeEvent, input: any) => handleSignup(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_FORGOT_PASSWORD,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_FORGOT_PASSWORD,
      (event: IpcMainInvokeEvent, input: any) => handleForgotPassword(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_RESET_PASSWORD,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_RESET_PASSWORD,
      (event: IpcMainInvokeEvent, input: any) => handleResetPassword(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_LOGOUT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_LOGOUT,
      (event: IpcMainInvokeEvent) => handleLogout(event),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_REVOKE_SESSION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_REVOKE_SESSION,
      (event: IpcMainInvokeEvent, input: any) => handleRevokeSession(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_REVOKE_ALL_SESSIONS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_REVOKE_ALL_SESSIONS,
      (event: IpcMainInvokeEvent, input: any) => handleRevokeAllSessions(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_SOCIAL_START,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_SOCIAL_START,
      (event: IpcMainInvokeEvent, input: any) => handleSocialAuthStart(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_SOCIAL_CALLBACK,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_SOCIAL_CALLBACK,
      (event: IpcMainInvokeEvent, input: any) => handleSocialAuthCallback(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_SOCIAL_CANCEL,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_SOCIAL_CANCEL,
      (event: IpcMainInvokeEvent, input: any) => handleSocialAuthCancel(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.AUTH_SOCIAL_GET_PROVIDERS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.AUTH_SOCIAL_GET_PROVIDERS,
      (event: IpcMainInvokeEvent) => handleSocialAuthGetProviders(event),
    ),
  );

  // V8 Phase 116 — User Profile, Account Settings & Preferences
  ipcMain.handle(
    DESKTOP_CHANNELS.SETTINGS_GET_PROFILE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SETTINGS_GET_PROFILE,
      (event: IpcMainInvokeEvent) => handleGetProfile(event),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.SETTINGS_UPDATE_PROFILE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SETTINGS_UPDATE_PROFILE,
      (event: IpcMainInvokeEvent, input: any) => handleUpdateProfile(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.SETTINGS_CHANGE_PASSWORD,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SETTINGS_CHANGE_PASSWORD,
      (event: IpcMainInvokeEvent, input: any) => handleChangePassword(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.SETTINGS_GET_AUTH_METHODS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SETTINGS_GET_AUTH_METHODS,
      (event: IpcMainInvokeEvent) => handleGetAuthMethods(event),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.SETTINGS_GET_SESSIONS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SETTINGS_GET_SESSIONS,
      (event: IpcMainInvokeEvent) => handleGetSessions(event),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.SETTINGS_GET_PREFERENCES,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SETTINGS_GET_PREFERENCES,
      (event: IpcMainInvokeEvent) => handleGetPreferences(event),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.SETTINGS_UPDATE_PREFERENCES,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SETTINGS_UPDATE_PREFERENCES,
      (event: IpcMainInvokeEvent, input: any) => handleUpdatePreferences(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.SETTINGS_DELETE_ACCOUNT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.SETTINGS_DELETE_ACCOUNT,
      (event: IpcMainInvokeEvent, input: any) => handleDeleteAccount(event, input),
    ),
  );

  // V8 Phase 119 — Website Targets & Production Safety
  ipcMain.handle(
    DESKTOP_CHANNELS.WEBSITE_TARGETS_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WEBSITE_TARGETS_CREATE,
      (event: IpcMainInvokeEvent, input: any) => handleCreateWebsiteTarget(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WEBSITE_TARGETS_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WEBSITE_TARGETS_GET,
      (event: IpcMainInvokeEvent, input: any) => handleGetWebsiteTarget(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WEBSITE_TARGETS_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WEBSITE_TARGETS_LIST,
      (event: IpcMainInvokeEvent, input: any) => handleListWebsiteTargets(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WEBSITE_TARGETS_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WEBSITE_TARGETS_UPDATE,
      (event: IpcMainInvokeEvent, input: any) => handleUpdateWebsiteTarget(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WEBSITE_TARGETS_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WEBSITE_TARGETS_DELETE,
      (event: IpcMainInvokeEvent, input: any) => handleDeleteWebsiteTarget(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WEBSITE_TARGETS_SET_ACTIVE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WEBSITE_TARGETS_SET_ACTIVE,
      (event: IpcMainInvokeEvent, input: any) => handleSetActiveWebsiteTarget(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WEBSITE_TARGETS_TEST_CONNECTION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WEBSITE_TARGETS_TEST_CONNECTION,
      (event: IpcMainInvokeEvent, input: any) => handleTestWebsiteTargetConnection(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WEBSITE_TARGETS_CONFIRM_AUTH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WEBSITE_TARGETS_CONFIRM_AUTH,
      (event: IpcMainInvokeEvent, input: any) => handleConfirmWebsiteTargetAuth(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.WEBSITE_TARGETS_RESOLVE_SNAPSHOT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.WEBSITE_TARGETS_RESOLVE_SNAPSHOT,
      (event: IpcMainInvokeEvent, input: any) => handleResolveWebsiteTargetSnapshot(event, input),
    ),
  );

  // V8 Phase 120 — Repository Connections & Git Providers
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_LIST,
      (event: IpcMainInvokeEvent, input: any) => handleListRepositoryConnections(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_GET,
      (event: IpcMainInvokeEvent, input: any) => handleGetRepositoryConnection(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_CREATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_CREATE,
      (event: IpcMainInvokeEvent, input: any) => handleCreateRepositoryConnection(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_UPDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_UPDATE,
      (event: IpcMainInvokeEvent, input: any) => handleUpdateRepositoryConnection(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_DELETE,
      (event: IpcMainInvokeEvent, input: any) => handleDeleteRepositoryConnection(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_SET_ACTIVE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_SET_ACTIVE,
      (event: IpcMainInvokeEvent, input: any) => handleSetActiveRepositoryConnection(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_VERIFY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_VERIFY,
      (event: IpcMainInvokeEvent, input: any) => handleVerifyRepositoryConnection(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_IMPORT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_IMPORT,
      (event: IpcMainInvokeEvent, input: any) => handleImportRepositoryConnection(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_CANCEL_IMPORT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_CANCEL_IMPORT,
      (event: IpcMainInvokeEvent, input: any) => handleCancelRepositoryImport(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_RESOLVE_SNAPSHOT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_RESOLVE_SNAPSHOT,
      (event: IpcMainInvokeEvent, input: any) => handleResolveRepositorySnapshot(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_PROVIDER_VERIFY_AUTH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_PROVIDER_VERIFY_AUTH,
      (event: IpcMainInvokeEvent, input: any) => handleVerifyGitProviderAuth(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_PROVIDER_LIST_REPOS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_PROVIDER_LIST_REPOS,
      (event: IpcMainInvokeEvent, input: any) => handleListGitProviderRepos(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.REPOSITORY_PROVIDER_LIST_BRANCHES,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.REPOSITORY_PROVIDER_LIST_BRANCHES,
      (event: IpcMainInvokeEvent, input: any) => handleListGitProviderBranches(event, input),
    ),
  );

  // V8 Phase 121 — Local Folder Attachment & File Access
  ipcMain.handle(
    DESKTOP_CHANNELS.LOCAL_FOLDER_CONNECT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOCAL_FOLDER_CONNECT,
      (event: IpcMainInvokeEvent, input: any) => handleConnectLocalFolder(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.LOCAL_FOLDER_DISCONNECT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOCAL_FOLDER_DISCONNECT,
      (event: IpcMainInvokeEvent, input: any) => handleDisconnectLocalFolder(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.LOCAL_FOLDER_VALIDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOCAL_FOLDER_VALIDATE,
      (event: IpcMainInvokeEvent, input: any) => handleValidateLocalFolder(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.LOCAL_FOLDER_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOCAL_FOLDER_GET,
      (event: IpcMainInvokeEvent, input: any) => handleGetLocalFolder(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.LOCAL_FOLDER_LIST_DIRECTORY,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOCAL_FOLDER_LIST_DIRECTORY,
      (event: IpcMainInvokeEvent, input: any) => handleListProjectDirectory(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.LOCAL_FOLDER_READ_FILE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOCAL_FOLDER_READ_FILE,
      (event: IpcMainInvokeEvent, input: any) => handleReadProjectFile(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.LOCAL_FOLDER_SEARCH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOCAL_FOLDER_SEARCH,
      (event: IpcMainInvokeEvent, input: any) => handleSearchProjectFiles(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.LOCAL_FOLDER_CHECK_EXISTS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOCAL_FOLDER_CHECK_EXISTS,
      (event: IpcMainInvokeEvent, input: any) => handleCheckProjectFileExists(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.LOCAL_FOLDER_GET_METADATA,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOCAL_FOLDER_GET_METADATA,
      (event: IpcMainInvokeEvent, input: any) => handleGetProjectFileMetadata(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.LOCAL_FOLDER_DETECT_GIT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.LOCAL_FOLDER_DETECT_GIT,
      (event: IpcMainInvokeEvent, input: any) => handleDetectProjectGit(event, input),
    ),
  );

  // V8 Phase 122 — Target Environment Configuration
  ipcMain.handle(
    DESKTOP_CHANNELS.TARGET_ENV_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TARGET_ENV_GET,
      (event: IpcMainInvokeEvent, input: any) => handleGetTargetEnvironment(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.TARGET_ENV_LIST,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TARGET_ENV_LIST,
      (event: IpcMainInvokeEvent, input: any) => handleListTargetEnvironments(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.TARGET_ENV_SAVE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TARGET_ENV_SAVE,
      (event: IpcMainInvokeEvent, input: any) => handleSaveTargetEnvironment(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.TARGET_ENV_DELETE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TARGET_ENV_DELETE,
      (event: IpcMainInvokeEvent, input: any) => handleDeleteTargetEnvironment(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.TARGET_ENV_SET_ACTIVE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TARGET_ENV_SET_ACTIVE,
      (event: IpcMainInvokeEvent, input: any) => handleSetActiveTargetEnvironment(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.TARGET_ENV_TEST_CONNECTION,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TARGET_ENV_TEST_CONNECTION,
      (event: IpcMainInvokeEvent, input: any) => handleTestTargetConnection(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.TARGET_ENV_TEST_AUTH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TARGET_ENV_TEST_AUTH,
      (event: IpcMainInvokeEvent, input: any) => handleTestTargetAuth(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.TARGET_ENV_RESOLVE_TARGET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.TARGET_ENV_RESOLVE_TARGET,
      (event: IpcMainInvokeEvent, input: any) => handleResolveTargetEnvironment(event, input),
    ),
  );

  // V8 Phase 123 — Project Context
  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECT_CONTEXT_GET,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECT_CONTEXT_GET,
      (event: IpcMainInvokeEvent, input: any) => handleGetProjectContext(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECT_CONTEXT_DETECT,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECT_CONTEXT_DETECT,
      (event: IpcMainInvokeEvent, input: any) => handleDetectProjectSources(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECT_CONTEXT_REFRESH,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECT_CONTEXT_REFRESH,
      (event: IpcMainInvokeEvent, input: any) => handleRefreshProjectContext(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECT_CONTEXT_INVALIDATE,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECT_CONTEXT_INVALIDATE,
      (event: IpcMainInvokeEvent, input: any) => handleInvalidateProjectContext(event, input),
    ),
  );
  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECT_CONTEXT_STATUS,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECT_CONTEXT_STATUS,
      (event: IpcMainInvokeEvent, input: any) => handleGetProjectContextStatus(event, input),
    ),
  );

  ipcMain.handle(
    DESKTOP_CHANNELS.PROJECTS_MARK_OPENED,
    createSafeIpcHandler(
      DESKTOP_CHANNELS.PROJECTS_MARK_OPENED,
      (event: IpcMainInvokeEvent, projectId: any) => handleMarkProjectOpened(event, projectId),
    ),
  );

  // V6-V7 Failure Intelligence, Jira Integration & Defect Remediation
  registerFailureAndDefectIpc(ipcMain, createSafeIpcHandler);

  isIpcRegistered = true;
}

/**
 * Unregister IPC handlers for test teardown or clean shutdown.
 */
export function unregisterIpcHandlers(): void {
  if (!isIpcRegistered) {
    return;
  }

  const ipcMain = electron?.ipcMain;
  if (ipcMain) {
    ipcMain.removeHandler(DESKTOP_CHANNELS.APP_GET_INFO);
    ipcMain.removeHandler(DESKTOP_CHANNELS.HEALTH_CHECK);
    ipcMain.removeHandler(DESKTOP_CHANNELS.DATABASE_GET_STATUS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_ARCHIVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_RESTORE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_SET_DEFAULT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_PICK_DIRECTORY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_ATTACH_LOCAL_DIRECTORY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_DETACH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_VALIDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_REFRESH_METADATA);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_GIT_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_GIT_REFRESH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_STRUCTURE_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_STRUCTURE_REFRESH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_TECHNOLOGY_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_TECHNOLOGY_REFRESH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_FRAMEWORKS_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_FRAMEWORKS_REFRESH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_CLASSIFICATION_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_CLASSIFICATION_REFRESH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_CONTENT_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_INDEX_GET_STATUS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_INDEX_REFRESH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_INDEX_LIST_FILES);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_INDEX_GET_FILE_DETAILS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_INDEX_SEARCH_SYMBOLS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_ARCHITECTURE_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_ARCHITECTURE_REFRESH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_DETECT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_SELECT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_UPDATE_TARGET_URL);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_SET_BASELINE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_CHANGES_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SOURCES_CHANGES_REFRESH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_BY_KEY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_SUMMARY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_ACTIVATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_DEPRECATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_DRAFT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_ARCHIVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_RESTORE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_SOURCES_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_SOURCES_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_PARSE_BULK);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_IMPORT_BULK);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_PROVENANCE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_SOURCE_CONTEXT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_NORMALIZE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_REPRESENTATION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_REPRESENTATION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_REGENERATE_REPRESENTATION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_BATCH_NORMALIZE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_CLASSIFY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_METADATA);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_METADATA);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_REGENERATE_METADATA);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_BATCH_CLASSIFY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_ANALYZE_QUALITY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_QUALITY_ANALYSIS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_QUALITY_FINDING);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_REANALYZE_QUALITY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_BATCH_ANALYZE_QUALITY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_PROPOSE_RELATIONSHIPS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_RELATIONSHIPS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_RELATIONSHIP_GRAPH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_CREATE_MANUAL_RELATIONSHIP);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_RELATIONSHIP);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_DELETE_RELATIONSHIP);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_MATCH_REPOSITORY_EVIDENCE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_REPOSITORY_EVIDENCE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_REPOSITORY_EVIDENCE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_CREATE_MANUAL_REPOSITORY_EVIDENCE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_DELETE_REPOSITORY_EVIDENCE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_PREVIEW_REPOSITORY_EVIDENCE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_SOURCES_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_SOURCES_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_SELECT_AND_INGEST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_EXTRACT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_GET_EXTRACTION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_DETECT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_SET_STATUS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_IMPORT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_HISTORY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_VERSION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_COMPARE_VERSIONS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_VERSIONED);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_RESTORE_VERSION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_GET_CHANGE_IMPACT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_CHANGE_IMPACT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_GET_PROVIDER_STATUS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_HEALTH_CHECK);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_GENERATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_CONFIG_GET_DEFAULTS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_EXECUTE_PROMPT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_EMBEDDING_GET_STATUS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_EMBEDDING_INDEX_SUBJECTS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_EMBEDDING_SEARCH_SIMILAR);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_EMBEDDING_REINDEX_STALE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_RAG_RETRIEVE_REQUIREMENT_CONTEXT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_RAG_GET_CONFIG_DEFAULTS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_ANALYSIS_ANALYZE_REQUIREMENT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_ANALYSIS_GET_CURRENT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_ANALYSIS_GET_HISTORY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AI_ANALYSIS_REGENERATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_DESIGN_ANALYZE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_DESIGN_GET_CURRENT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_DESIGN_GET_HISTORY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_DESIGN_REGENERATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SCENARIOS_GENERATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SCENARIOS_GET_CURRENT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SCENARIOS_GET_HISTORY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SCENARIOS_REGENERATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.CATEGORIZED_TESTS_GENERATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.CATEGORIZED_TESTS_GET_CURRENT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_SPECIFICATIONS_ENRICH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_SPECIFICATIONS_GET_CURRENT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_CASES_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_CASES_GET_BY_ID);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_CASES_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_CASES_PERSIST_FROM_GENERATION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_CASES_PERSIST_BATCH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_CASES_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_TEST_CASE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_SPECIFICATION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_BATCH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_VALIDATION_GET_LATEST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_VALIDATION_LIST_HISTORY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TRACEABILITY_CREATE_TRACE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TRACEABILITY_DELETE_TRACE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TRACEABILITY_GET_BY_ID);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TRACEABILITY_LIST_BY_REQUIREMENT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TRACEABILITY_LIST_BY_TEST_CASE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TRACEABILITY_LIST_PROJECT_TRACES);
    ipcMain.removeHandler(DESKTOP_CHANNELS.COVERAGE_GET_PROJECT_SUMMARY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.COVERAGE_GET_REQUIREMENT_COVERAGE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.COVERAGE_GET_TRACEABILITY_MATRIX);
    ipcMain.removeHandler(DESKTOP_CHANNELS.COVERAGE_GET_REVERSE_TRACEABILITY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.COVERAGE_GET_ORPHAN_TESTS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_REVIEW_LIST_QUEUE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_REVIEW_GET_DETAIL);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_REVIEW_APPROVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_REVIEW_REJECT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_REVIEW_EDIT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_REVIEW_REGENERATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_REVIEW_GET_HISTORY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_REVIEW_COMPARE_VERSIONS);

    // Phase 59: Target Application & Environments
    ipcMain.removeHandler(DESKTOP_CHANNELS.TARGET_APP_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TARGET_APP_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.ENVIRONMENT_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.ENVIRONMENT_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.ENVIRONMENT_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.ENVIRONMENT_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.ENVIRONMENT_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.ENVIRONMENT_SET_DEFAULT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.ENVIRONMENT_CHECK_REACHABILITY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.ENVIRONMENT_RESOLVE_SNAPSHOT);

    // Phase 60: Plan Compiler
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLAN_COMPILER_COMPILE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLAN_COMPILER_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLAN_COMPILER_GET_BY_TEST_CASE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLAN_COMPILER_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLAN_COMPILER_PREVIEW);

    // Phase 61: Test Run Orchestration
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_RUN_ENQUEUE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_RUN_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_RUN_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_RUN_CANCEL);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TEST_RUN_GET_QUEUE_STATE);

    // Phase 62: Auth Profiles
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_PROFILE_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_PROFILE_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_PROFILE_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_PROFILE_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_PROFILE_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_PROFILE_VALIDATE);

    // Phase 124: Conversational Testing Agent
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_SESSION_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_SESSION_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_SESSION_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_SESSION_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_SEND_MESSAGE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_APPROVE_ACTION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_RUN_CONTROL);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_GET_EVIDENCE);

    ipcMain.removeHandler(DESKTOP_CHANNELS.LOGGING_REPORT_RENDERER_ERROR);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_CANCEL);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_GET_EVENTS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_ARCHIVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_TASK_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_TASK_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_TASK_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_TASK_CANCEL);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_TASK_RETRY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_TASK_RESUME);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_TASK_STOP);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_TASK_PAUSE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_TASK_CONTROL_AUDIT_LOGS_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_TASK_GET_RECOVERY_STATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_TASK_LIST_RECOVERABLE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_TASK_CHECKPOINTS_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_THREAD_MESSAGE_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_EXECUTION_STEP_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_TOOL_CALL_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_TOOL_REGISTRY_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_TOOL_REGISTRY_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_TOOL_REGISTRY_INVOKE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_TOOL_APPROVAL_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_TOOL_APPROVAL_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_TOOL_APPROVAL_DECIDE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_TOOL_AUDIT_LOG_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPAIR_PATCH_PROPOSE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPAIR_PATCH_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPAIR_PATCH_APPROVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPAIR_PATCH_REJECT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPAIR_PATCH_CANCEL);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPAIR_PATCH_APPLY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.GIT_DIFF_GET_STATUS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.GIT_DIFF_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_APPROVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_REJECT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TERMINAL_EXECUTE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TERMINAL_GET_EXECUTION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TERMINAL_LIST_EXECUTIONS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TERMINAL_APPROVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TERMINAL_REJECT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TERMINAL_CANCEL);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLANNER_CREATE_PLAN);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLANNER_GET_PLAN);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLANNER_LIST_PLANS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLANNER_GET_ACTIVE_PLAN);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLANNER_ADD_STEP);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLANNER_REMOVE_STEP);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLANNER_REORDER_STEPS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLANNER_MODIFY_STEP);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLANNER_SET_STEP_STATUS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PLANNER_SET_PLAN_STATUS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_LOOP_START);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_LOOP_RESUME);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_LOOP_CANCEL);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_LOOP_GET_STATUS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_ACTIVITY_SUBSCRIBE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_ACTIVITY_UNSUBSCRIBE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AGENT_ACTIVITY_GET_TIMELINE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.APPROVAL_CREATE);
    ipcMain.removeHandler('approval.create');
    ipcMain.removeHandler(DESKTOP_CHANNELS.APPROVAL_GET);
    ipcMain.removeHandler('approval.get');
    ipcMain.removeHandler(DESKTOP_CHANNELS.APPROVAL_LIST);
    ipcMain.removeHandler('approval.list');
    ipcMain.removeHandler(DESKTOP_CHANNELS.APPROVAL_APPROVE);
    ipcMain.removeHandler('approval.approve');
    ipcMain.removeHandler(DESKTOP_CHANNELS.APPROVAL_REJECT);
    ipcMain.removeHandler('approval.reject');
    ipcMain.removeHandler(DESKTOP_CHANNELS.APPROVAL_CANCEL);
    ipcMain.removeHandler('approval.cancel');
    ipcMain.removeHandler(DESKTOP_CHANNELS.APPROVAL_GET_PENDING);
    ipcMain.removeHandler('approval.getPending');
    ipcMain.removeHandler(DESKTOP_CHANNELS.APPROVAL_GET_AUDIT_HISTORY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.FILE_REVIEW_CREATE);
    ipcMain.removeHandler('fileReview.create');
    ipcMain.removeHandler(DESKTOP_CHANNELS.FILE_REVIEW_GET);
    ipcMain.removeHandler('fileReview.get');
    ipcMain.removeHandler(DESKTOP_CHANNELS.FILE_REVIEW_LIST);
    ipcMain.removeHandler('fileReview.list');
    ipcMain.removeHandler(DESKTOP_CHANNELS.FILE_REVIEW_APPROVE);
    ipcMain.removeHandler('fileReview.approve');
    ipcMain.removeHandler(DESKTOP_CHANNELS.FILE_REVIEW_REJECT);
    ipcMain.removeHandler('fileReview.reject');
    ipcMain.removeHandler(DESKTOP_CHANNELS.FILE_REVIEW_CANCEL);
    ipcMain.removeHandler('fileReview.cancel');
    ipcMain.removeHandler(DESKTOP_CHANNELS.FILE_REVIEW_APPLY);
    ipcMain.removeHandler('fileReview.apply');
    ipcMain.removeHandler(DESKTOP_CHANNELS.FILE_REVIEW_GET_FILE_CONTENT);
    ipcMain.removeHandler('fileReview.getFileContent');

    // V8 Phase 111 — Shell Layout & Workspace Sessions
    ipcMain.removeHandler(DESKTOP_CHANNELS.SHELL_LAYOUT_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SHELL_LAYOUT_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WORKSPACE_SESSIONS_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WORKSPACE_SESSIONS_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WORKSPACE_SESSIONS_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WORKSPACE_SESSIONS_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WORKSPACE_SESSIONS_DELETE);

    // V8 Phase 113, 114, 115 — User Authentication & Social Authentication
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_GET_STATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_GET_CURRENT_USER);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_LOGIN);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_SIGNUP);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_FORGOT_PASSWORD);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_RESET_PASSWORD);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_LOGOUT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_REVOKE_SESSION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_REVOKE_ALL_SESSIONS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_SOCIAL_START);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_SOCIAL_CALLBACK);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_SOCIAL_CANCEL);
    ipcMain.removeHandler(DESKTOP_CHANNELS.AUTH_SOCIAL_GET_PROVIDERS);

    // V8 Phase 116 — User Profile, Account Settings & Preferences
    ipcMain.removeHandler(DESKTOP_CHANNELS.SETTINGS_GET_PROFILE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SETTINGS_UPDATE_PROFILE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SETTINGS_CHANGE_PASSWORD);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SETTINGS_GET_AUTH_METHODS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SETTINGS_GET_SESSIONS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SETTINGS_GET_PREFERENCES);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SETTINGS_UPDATE_PREFERENCES);
    ipcMain.removeHandler(DESKTOP_CHANNELS.SETTINGS_DELETE_ACCOUNT);

    // V8 Phase 119 — Website Targets & Production Safety
    ipcMain.removeHandler(DESKTOP_CHANNELS.WEBSITE_TARGETS_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WEBSITE_TARGETS_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WEBSITE_TARGETS_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WEBSITE_TARGETS_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WEBSITE_TARGETS_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WEBSITE_TARGETS_SET_ACTIVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WEBSITE_TARGETS_TEST_CONNECTION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WEBSITE_TARGETS_CONFIRM_AUTH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.WEBSITE_TARGETS_RESOLVE_SNAPSHOT);

    // V8 Phase 120 — Repository Connections & Git Providers
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_CREATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_UPDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_SET_ACTIVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_VERIFY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_IMPORT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_CANCEL_IMPORT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_RESOLVE_SNAPSHOT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_PROVIDER_VERIFY_AUTH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_PROVIDER_LIST_REPOS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.REPOSITORY_PROVIDER_LIST_BRANCHES);

    // V8 Phase 121 — Local Folder Attachment & File Access
    ipcMain.removeHandler(DESKTOP_CHANNELS.LOCAL_FOLDER_CONNECT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.LOCAL_FOLDER_DISCONNECT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.LOCAL_FOLDER_VALIDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.LOCAL_FOLDER_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.LOCAL_FOLDER_LIST_DIRECTORY);
    ipcMain.removeHandler(DESKTOP_CHANNELS.LOCAL_FOLDER_READ_FILE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.LOCAL_FOLDER_SEARCH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.LOCAL_FOLDER_CHECK_EXISTS);
    ipcMain.removeHandler(DESKTOP_CHANNELS.LOCAL_FOLDER_GET_METADATA);
    ipcMain.removeHandler(DESKTOP_CHANNELS.LOCAL_FOLDER_DETECT_GIT);

    // V8 Phase 122 — Target Environment Configuration
    ipcMain.removeHandler(DESKTOP_CHANNELS.TARGET_ENV_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TARGET_ENV_LIST);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TARGET_ENV_SAVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TARGET_ENV_DELETE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TARGET_ENV_SET_ACTIVE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TARGET_ENV_TEST_CONNECTION);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TARGET_ENV_TEST_AUTH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.TARGET_ENV_RESOLVE_TARGET);

    // V8 Phase 123 — Project Context
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECT_CONTEXT_GET);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECT_CONTEXT_DETECT);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECT_CONTEXT_REFRESH);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECT_CONTEXT_INVALIDATE);
    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECT_CONTEXT_STATUS);

    ipcMain.removeHandler(DESKTOP_CHANNELS.PROJECTS_MARK_OPENED);

    // V6-V7 Failure Intelligence, Jira Integration & Defect Remediation
    unregisterFailureAndDefectIpc(ipcMain);
  }

  isIpcRegistered = false;
}

