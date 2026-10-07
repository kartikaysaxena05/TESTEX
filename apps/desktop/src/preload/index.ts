/**
 * @file apps/desktop/src/preload/index.ts
 * Sandboxed preload script exposing the strongly typed DesktopBridge API.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Node.js process and filesystem APIs are NEVER directly exposed to window.
 * 2. IPC invocations are constrained strictly to the channels defined in DESKTOP_CHANNELS.
 * 3. All operations return strongly typed DesktopResult<T> envelopes.
 */

import { contextBridge, ipcRenderer } from 'electron';
import {
  DESKTOP_CHANNELS,
  type DesktopBridge,
  type DesktopResult,
  type AppInfo,
  type HealthInfo,
  type DatabaseStatus,
  type ProjectSummary,
  type ProjectDetails,
  type ProjectEnvironmentDto,
  type ProjectSourceDto,
  type AttachLocalDirectoryResult,
  type PickDirectoryResult,
  type DetachSourceResult,
  type GitStatusDto,
  type SourceStructureDto,
  type TechnologyProfileDto,
  type FrameworkProfileDto,
  type ClassificationProfileDto,
  type SourceFileContentInput,
  type SourceFileContentDto,
  type RepositoryIndexStatusDto,
  type RepositoryFileDto,
  type RepositoryFileDetailsDto,
  type RepositorySymbolDto,
  type ListIndexedFilesInput,
  type SearchSymbolsInput,
  type RepositoryFileDetailsInput,
  type ApplicationArchitectureProfileDto,
  type RunConfigurationProfileDto,
  type ApplicationRunConfigurationDto,
  type SelectRunConfigInput,
  type UpdateTargetUrlInput,
  type RepositorySnapshotDto,
  type RepositoryChangeSetDto,
  type CreateSnapshotInput,
  type SetBaselineInput,
  type DeleteSnapshotInput,
  type PaginatedResult,
  type ListProjectsInput,
  type CreateProjectInput,
  type UpdateProjectInput,
  type MarkProjectOpenedInput,
  type CreateEnvironmentInput,
  type UpdateEnvironmentInput,
  type DeleteEnvironmentInput,
  type SetDefaultEnvironmentInput,
  type RendererErrorReport,
  type RendererErrorReportResult,
  type RequirementDto,
  type RequirementSummaryDto,
  type RequirementSourceDto,
  type ListRequirementsInput,
  type GetRequirementInput,
  type GetRequirementByKeyInput,
  type CreateRequirementInput,
  type UpdateRequirementInput,
  type ActivateRequirementInput,
  type DeprecateRequirementInput,
  type DraftRequirementInput,
  type ArchiveRequirementInput,
  type RestoreRequirementInput,
  type DeleteRequirementInput,
  type ListRequirementSourcesInput,
  type GetRequirementSourceInput,
  type ParseBulkRequirementsInput,
  type ParseBulkRequirementsResult,
  type ImportBulkRequirementsInput,
  type ImportBulkRequirementsResult,
  type RequirementDocumentDto,
  type SelectAndIngestDocumentInput,
  type SelectAndIngestDocumentResult,
  type ListRequirementDocumentsInput,
  type GetRequirementDocumentInput,
  type DeleteRequirementDocumentInput,
  type RequirementDocumentExtractionDto,
  type ExtractRequirementDocumentInput,
  type GetRequirementDocumentExtractionInput,
  type RequirementCandidateDto,
  type RequirementCandidateListDto,
  type DetectRequirementCandidatesInput,
  type ListRequirementCandidatesInput,
  type UpdateRequirementCandidateInput,
  type SetRequirementCandidateStatusInput,
  type ImportApprovedCandidatesInput,
  type ImportCandidatesResultDto,
  type GetRequirementProvenanceInput,
  type RequirementProvenanceDto,
  type GetRequirementSourceContextInput,
  type RequirementSourceContextDto,
  type NormalizeRequirementInput,
  type RequirementRepresentationDto,
  type GetRequirementRepresentationInput,
  type UpdateRequirementRepresentationInput,
  type RegenerateRequirementRepresentationInput,
  type BatchNormalizeRequirementsInput,
  type BatchNormalizeRequirementsResultDto,
  type ClassifyRequirementInput,
  type RequirementMetadataDto,
  type GetRequirementMetadataInput,
  type UpdateRequirementMetadataInput,
  type RegenerateRequirementMetadataInput,
  type BatchClassifyRequirementsInput,
  type BatchClassifyRequirementsResultDto,
  type AnalyzeRequirementQualityInput,
  type RequirementQualityAnalysisDto,
  type GetRequirementQualityAnalysisInput,
  type ReviewRequirementQualityFindingInput,
  type RequirementQualityFindingDto,
  type ReanalyzeRequirementQualityInput,
  type BatchAnalyzeRequirementQualityInput,
  type BatchAnalyzeQualityResultDto,
  type ProposeRelationshipsInput,
  type ProposeRelationshipsResultDto,
  type RequirementRelationshipDto,
  type GetRelationshipsInput,
  type GetRelationshipGraphInput,
  type RelationshipGraphDto,
  type CreateManualRelationshipInput,
  type ReviewRelationshipInput,
  type DeleteRelationshipInput,
  type MatchRepositoryEvidenceInput,
  type MatchRepositoryEvidenceResultDto,
  type RequirementRepositoryEvidenceDto,
  type GetRepositoryEvidenceInput,
  type ReviewRepositoryEvidenceInput,
  type CreateManualRepositoryEvidenceInput,
  type DeleteRepositoryEvidenceInput,
  type PreviewRepositoryEvidenceInput,
  type EvidencePreviewDto,
  type GetRequirementHistoryInput,
  type RequirementHistoryDto,
  type GetRequirementVersionInput,
  type RequirementVersionDto,
  type CompareRequirementVersionsInput,
  type RequirementDiffDto,
  type UpdateRequirementVersionedInput,
  type RestoreRequirementVersionInput,
  type GetRequirementChangeImpactInput,
  type RequirementImpactsResultDto,
  type ReviewRequirementImpactInput,
  type RequirementImpactCandidateDto,
  type AiProviderStatusDto,
  type GetAiProviderStatusInput,
  type AiHealthCheckInput,
  type AiGenerationRequestDto,
  type AiGenerationResultDto,
  type AiGenerationConfigDto,
  type AiPromptExecutionInputDto,
  type AiStructuredResultDto,
  type EmbeddingIndexStatusDto,
  type IndexSubjectsInputDto,
  type IndexSubjectsResultDto,
  type VectorSearchQueryDto,
  type VectorMatchDto,
  type RetrieveRequirementContextInputDto,
  type RequirementContextPackDto,
  type RagRetrievalConfigDto,
  type AnalyzeRequirementInputDto,
  type RequirementAiAnalysisDto,
  type GetRequirementAnalysisInputDto,
  type GetRequirementAnalysisHistoryInputDto,
  type RegenerateRequirementAnalysisInputDto,
  type AnalyzeTestDesignInputDto,
  type TestDesignPlanDto,
  type GetTestDesignInputDto,
  type GetTestDesignHistoryInputDto,
  type RegenerateTestDesignInputDto,
  type GenerateScenariosInputDto,
  type RequirementScenarioGenerationDto,
  type GetRequirementScenariosInputDto,
  type GetRequirementScenariosHistoryInputDto,
  type RegenerateRequirementScenariosInputDto,
  type GenerateCategorizedTestsInputDto,
  type GetCategorizedTestsInputDto,
  type CategorizedTestGenerationResultDto,
  type EnrichTestSpecificationInputDto,
  type GetEnrichedTestSpecificationsInputDto,
  type TestSpecificationEnrichmentResultDto,
  type CreateTestCaseInputDto,
  type GetTestCaseByIdInputDto,
  type ListTestCasesInputDto,
  type PersistGeneratedTestCaseInputDto,
  type PersistGeneratedTestCasesBatchInputDto,
  type DeleteTestCaseInputDto,
  type TestCaseDetailDto,
  type TestCaseListResultDto,
  type BatchPersistTestCasesResultDto,
  type ValidateTestCaseInputDto,
  type ValidateSpecificationInputDto,
  type ValidateTestBatchInputDto,
  type GetLatestValidationInputDto,
  type ListValidationHistoryInputDto,
  type TestCaseValidationDto,
  type BatchValidationResultDto,
  type CreateRequirementTestTraceInputDto,
  type DeleteRequirementTestTraceInputDto,
  type GetTraceByIdInputDto,
  type ListTracesByRequirementInputDto,
  type ListTracesByTestCaseInputDto,
  type ListProjectTracesInputDto,
  type RequirementTestTraceDto,
  type ListTracesResultDto,
  type GetProjectCoverageInputDto,
  type GetRequirementCoverageInputDto,
  type GetTraceabilityMatrixInputDto,
  type GetReverseTraceabilityInputDto,
  type GetOrphanTestsInputDto,
  type ProjectCoverageSummaryDto,
  type RequirementCoverageDetailDto,
  type TraceabilityMatrixResultDto,
  type ReverseTraceabilityResultDto,
  type OrphanTestsResultDto,
  type ListTestReviewQueueInputDto,
  type GetTestReviewDetailInputDto,
  type ApproveTestVersionInputDto,
  type RejectTestVersionInputDto,
  type EditTestCaseInputDto,
  type RegenerateTestCaseInputDto,
  type GetTestHistoryInputDto,
  type CompareTestVersionsInputDto,
  type TestReviewQueueResultDto,
  type TestReviewDetailDto,
  type TestHistoryResultDto,
  type TestVersionDiffDto,
  type ExecutionCapabilitiesDto,
  type RuntimeSmokeInputDto,
  type RuntimeSmokeResultDto,
  type ValidateTestEligibilityInputDto,
  type TestEligibilityDto,
  type TargetApplicationDto,
  type UpdateTargetApplicationInputDto,
  type GetEnvironmentInputDto,
  type ListEnvironmentsInputDto,
  type CheckEnvironmentReachabilityInputDto,
  type EnvironmentReachabilityResultDto,
  type ResolveEnvironmentSnapshotInputDto,
  type ExecutionEnvironmentSnapshotDto,
  type ExecutableTestPlanDto,
  type CompileTestPlanInputDto,
  type GetExecutablePlanInputDto,
  type GetExecutablePlanByTestCaseInputDto,
  type ListExecutablePlansInputDto,
  type PreviewTestPlanInputDto,
  type TestRunDto,
  type EnqueueTestRunInputDto,
  type GetTestRunInputDto,
  type ListTestRunsInputDto,
  type CancelTestRunInputDto,
  type TestRunQueueStateDto,
  type AuthProfileDto,
  type CreateAuthProfileInputDto,
  type UpdateAuthProfileInputDto,
  type GetAuthProfileInputDto,
  type ListAuthProfilesInputDto,
  type DeleteAuthProfileInputDto,
  type ValidateAuthProfileInputDto,
  type AuthValidationResultDto,
  type ActionResultDto,
  type StepExecutionResultDto,
  type ExecuteActionInputDto,
  type ExecuteStepInputDto,
  type LocatorResolutionResultDto,
  type ResolveLocatorInputDto,
  type SynchronizationResultDto,
  type SynchronizeStepInputDto,
  type AssertionResultDto,
  type StepAssertionEvaluationResultDto,
  type AssertInputDto,
  type EvaluateStepAssertionsInputDto,
  type TestCaseExecutionDto,
  type StepExecutionRecordDto,
  type ExecutionAuditTimelineDto,
  type GetExecutionInputDto,
  type ListExecutionsInputDto,
  type GetExecutionStepsInputDto,
  type GetExecutionAuditTimelineInputDto,
  type ReconcileOrphanedExecutionsInputDto,
  type ExecutionEvidenceBundleDto,
  type ExecutionEvidenceArtifactDto,
  type CreateEvidenceBundleInputDto,
  type AddEvidenceArtifactInputDto,
  type FinalizeEvidenceBundleInputDto,
  type GetEvidenceBundleInputDto,
  type ListEvidenceBundlesInputDto,
  type ListEvidenceArtifactsInputDto,
  type GetEvidenceArtifactMetadataInputDto,
  type GetEvidenceArtifactContentInputDto,
  type EvidenceArtifactContentDto,
  type VerifyEvidenceArtifactIntegrityInputDto,
  type GetExecutionAttemptsInputDto,
  type ExecutionAttemptSummaryDto,
  type EvaluateExecutionReliabilityInputDto,
  type ExecutionReliabilityReportDto,
  type GetHealingAttemptsInputDto,
  type LocatorHealingAttemptDto,
  type ListHealingSuggestionsInputDto,
  type LocatorHealingSuggestionDto,
  type ReviewHealingSuggestionInputDto,
  type GetParallelPoolStateInputDto,
  type ParallelWorkerPoolStateDto,
  type FailureCaseDto,
  type FailureAnalysisRunDto,
  type FailureEvidenceReferenceDto,
  type CreateFailureCaseInputDto,
  type EnsureFailureCaseInputDto,
  type GetFailureCaseInputDto,
  type ListFailureCasesInputDto,
  type StartFailureAnalysisInputDto,
  type CompleteFailureAnalysisInputDto,
  type FailFailureAnalysisInputDto,
  type CancelFailureAnalysisInputDto,
  type MarkFailureCaseStaleInputDto,
  type ListFailureAnalysisRunsInputDto,
  type ListFailureEvidenceReferencesInputDto,
  type FailureEvidencePackageDto,
  type FailureEvidenceIntegrityReportDto,
  type FailureEvidenceArtifactContentDto,
  type IngestFailureEvidenceInputDto,
  type GetFailureEvidencePackageInputDto,
  type VerifyEvidenceIntegrityInputDto,
  type GetFailureEvidenceArtifactContentInputDto,
  type FailureReproductionAttemptDto,
  type ReproducibilitySummaryDto,
  type ExecuteReproductionInputDto,
  type GetReproductionAttemptsInputDto,
  type GetReproducibilitySummaryInputDto,
  type CancelReproductionInputDto,
  type FailureClassificationDto,
  type ClassifyFailureInputDto,
  type GetFailureClassificationInputDto,
  type ReclassifyFailureInputDto,
  type ListFailureClassificationsInputDto,
  type ClassificationDecisionIntegrityDto,
  type EvaluateDecisionIntegrityInputDto,
  type GetDecisionIntegrityInputDto,
  type RecomputeDecisionIntegrityInputDto,
  type ListDecisionIntegrityHistoryInputDto,
  type FlakinessAnalysisDto,
  type AnalyzeFlakinessInputDto,
  type GetFlakinessAnalysisInputDto,
  type ReanalyzeFlakinessInputDto,
  type ListFlakinessHistoryInputDto,
  type FailureDomainSeparationDto,
  type SeparateFailureDomainInputDto,
  type GetDomainSeparationInputDto,
  type ReevaluateDomainSeparationInputDto,
  type ListDomainSeparationHistoryInputDto,
  type FailureTechnicalLocalizationDto,
  type LocalizeTechnicalCauseInputDto,
  type GetTechnicalLocalizationInputDto,
  type RelocalizeTechnicalCauseInputDto,
  type ListLocalizationHistoryInputDto,
  type FailureAiAssessmentDto,
  type AssessFailureWithAiInputDto,
  type GetFailureAiAssessmentInputDto,
  type ReassessFailureWithAiInputDto,
  type ListFailureAiAssessmentHistoryInputDto,
  type FailureRootCauseAnalysisDto,
  type AnalyzeRootCauseInputDto,
  type GetRootCauseAnalysisInputDto,
  type ReanalyzeRootCauseInputDto,
  type ListRootCauseHistoryInputDto,
  type FailureImpactAssessmentDto,
  type AssessImpactInputDto,
  type GetImpactAssessmentInputDto,
  type ReassessImpactInputDto,
  type ListImpactHistoryInputDto,
  type DefectClusterDto,
  type DefectClusterMembershipDto,
  type DefectClusterHistoryDto,
  type DuplicateComparisonResultDto,
  type CompareDuplicatesInputDto,
  type ClusterDefectsInputDto,
  type GetClusterInputDto,
  type ListClustersInputDto,
  type GetFailureMembershipInputDto,
  type MergeClustersInputDto,
  type SplitClusterInputDto,
  type OverrideMembershipInputDto,
  type ListClusterHistoryInputDto,
  type ConfidenceAssessmentDto,
  type EvidenceAttributionDto,
  type AssessConfidenceInputDto,
  type GetConfidenceInputDto,
  type ReassessConfidenceInputDto,
  type ListConfidenceHistoryInputDto,
  type ListEvidenceAttributionsInputDto,
  type StructuredBugReportDto,
  type CreateBugReportInputDto,
  type GetBugReportInputDto,
  type ListBugReportsInputDto,
  type RegenerateBugReportInputDto,
  type ListBugReportHistoryInputDto,
  type JiraConnectionDto,
  type JiraValidationResultDto,
  type JiraConnectionAuditDto,
  type CreateJiraConnectionInputDto,
  type UpdateJiraConnectionInputDto,
  type GetJiraConnectionInputDto,
  type DeleteJiraConnectionInputDto,
  type ValidateJiraConnectionInputDto,
  type ListJiraAuditLogInputDto,
  type JiraDiscoveredSiteDto,
  type JiraDiscoveredProjectDto,
  type JiraDiscoveredIssueTypeDto,
  type JiraDiscoveredPriorityDto,
  type JiraDiscoveredFieldDto,
  type JiraDiscoveredComponentDto,
  type JiraDiscoveredAssigneeDto,
  type JiraHealthCheckResultDto,
  type JiraProjectConfigDto,
  type DiscoverJiraSitesInputDto,
  type DiscoverJiraProjectsInputDto,
  type DiscoverJiraIssueTypesInputDto,
  type DiscoverJiraPrioritiesInputDto,
  type DiscoverJiraFieldsInputDto,
  type DiscoverJiraComponentsInputDto,
  type DiscoverJiraAssigneesInputDto,
  type GetJiraProjectConfigInputDto,
  type SaveJiraProjectConfigInputDto,
  type RefreshJiraProjectConfigInputDto,
  type TestJiraConnectionHealthInputDto,
  type JiraExternalIssueDto,
  type CreateJiraIssueInputDto,
  type GetJiraIssueInputDto,
  type ListAttachableEvidenceInputDto,
  type JiraAttachableEvidenceItemDto,
  type AttachEvidenceInputDto,
  type JiraAttachmentBatchResultDto,
  type GetAttachmentStatusInputDto,
  type JiraEvidenceAttachmentDto,
  type JiraDuplicateEvaluationDto,
  type JiraIssueLinkDto,
  type EvaluateDuplicateInputDto,
  type LinkExistingIssueInputDto,
  type GetIssueLinkInputDto,
  type ProjectEngineerDto,
  type RegisterProjectEngineerInputDto,
  type ListEligibleEngineersInputDto,
  type DefectOwnershipDto,
  type GetDefectOwnershipInputDto,
  type AssignEngineerInputDto,
  type UnassignEngineerInputDto,
  type SyncOwnershipFromJiraInputDto,
  type RetryJiraSyncInputDto,
  type ProjectEmailConfigDto,
  type SaveProjectEmailConfigInputDto,
  type TestEmailConnectionInputDto,
  type TestEmailConnectionResultDto,
  type EmailNotificationDto,
  type ListEmailNotificationsInputDto,
  type GetEmailNotificationInputDto,
  type RetryEmailNotificationInputDto,
  type SendWorkflowNotificationInputDto,
  type BugWorkflowStateDto,
  type WorkflowStatusMappingDto,
  type WorkflowSyncEventDto,
  type GetWorkflowStateInputDto,
  type UpdateInternalStatusInputDto,
  type GetWorkflowStatusMappingsInputDto,
  type SaveWorkflowStatusMappingInputDto,
  type DeleteWorkflowStatusMappingInputDto,
  type SyncWorkflowNowInputDto,
  type ResolveWorkflowConflictInputDto,
  type ListWorkflowSyncEventsInputDto,
  type DefectReverificationDto,
  type ReverificationAuditEventDto,
  type EvaluateReverificationEligibilityOutputDto,
  type GetReverificationStateInputDto,
  type EvaluateReverificationEligibilityInputDto,
  type CreateReverificationRequestInputDto,
  type GenerateReverificationPlanInputDto,
  type CancelReverificationInputDto,
  type ListReverificationAuditEventsInputDto,
  type DefectVerificationAttemptDto,
  type VerificationSummaryDto,
  type ExecuteVerificationInputDto,
  type GetVerificationAttemptsInputDto,
  type GetVerificationComparisonInputDto,
  type CancelVerificationInputDto,
  type QuickFixEligibilityAssessmentDto,
  type EvaluateQuickFixEligibilityInputDto,
  type GetQuickFixAssessmentInputDto,
  type ListQuickFixAssessmentsInputDto,
  type RepositoryDefectLocalizationDto,
  type LocalizeDefectInputDto,
  type GetDefectLocalizationInputDto,
  type ListDefectLocalizationsInputDto,
  type InspectCandidateSourceInputDto,
  type CandidateSourceContentDto,
  type DefectPatchProposalDto,
  type GeneratePatchProposalInputDto,
  type GetPatchProposalInputDto,
  type ListPatchProposalsInputDto,
  type WithdrawPatchProposalInputDto,
  type DefectPatchSandboxDto,
  type CreatePatchSandboxInputDto,
  type ApplyPatchToSandboxInputDto,
  type GetPatchSandboxInputDto,
  type ListPatchSandboxesInputDto,
  type DestroyPatchSandboxInputDto,
  type DefectPatchValidationDto,
  type ExecutePatchValidationInputDto,
  type GetPatchValidationInputDto,
  type ListPatchValidationsInputDto,
  type CancelPatchValidationInputDto,
  type DefectPatchApprovalDto,
  type GetPatchApprovalInputDto,
  type ListPatchApprovalsInputDto,
  type ApprovePatchInputDto,
  type RejectPatchInputDto,
  type ApplyPatchInputDto,
  type RepairPatchToolOutputDto,
  type RepairPatchProposeInputDto,
  type RepairPatchGetInputDto,
  type RepairPatchApproveInputDto,
  type RepairPatchRejectInputDto,
  type RepairPatchCancelInputDto,
  type RepairPatchApplyInputDto,
  type GitWorkingStatusDto,
  type GitDiffResultDto,
  type AgentGitChangeReviewDto,
  type GitDiffGetStatusInputDto,
  type GitDiffGetInputDto,
  type CreateGitChangeReviewInputDto,
  type GetGitChangeReviewInputDto,
  type ApproveGitChangeReviewInputDto,
  type RejectGitChangeReviewInputDto,
  type AgentTerminalExecutionDto,
  type TerminalExecuteInputDto,
  type GetTerminalExecutionInputDto,
  type ListTerminalExecutionsInputDto,
  type ApproveTerminalExecutionInputDto,
  type RejectTerminalExecutionInputDto,
  type CancelTerminalExecutionInputDto,
  type AgentPlanExecutionDto,
  type CreateAgentPlanInputDto,
  type GetAgentPlanInputDto,
  type ListAgentPlansInputDto,
  type GetActiveAgentPlanInputDto,
  type AddAgentPlanStepInputDto,
  type RemoveAgentPlanStepInputDto,
  type ReorderAgentPlanStepsInputDto,
  type ModifyAgentPlanStepInputDto,
  type SetAgentPlanStepStatusInputDto,
  type SetAgentPlanStatusInputDto,
  type StartAgentLoopInputDto,
  type ResumeAgentLoopInputDto,
  type CancelAgentLoopInputDto,
  type GetAgentLoopStatusInputDto,
  type AgentLoopRunResultDto,
  type AgentLoopStateDto,
  type SubscribeAgentActivityInputDto,
  type UnsubscribeAgentActivityInputDto,
  type GetAgentActivityTimelineInputDto,
  type AgentActivityTimelineDto,
  type AgentActivityEventDto,
  type ApprovalRequestDto,
  type ApprovalAuditLogDto,
  type CreateApprovalInputDto,
  type GetApprovalInputDto,
  type ListApprovalsInputDto,
  type ApproveApprovalInputDto,
  type RejectApprovalInputDto,
  type CancelApprovalInputDto,
  type GetPendingApprovalInputDto,
  type FileDiffReviewDto,
  type CreateFileReviewInputDto,
  type GetFileReviewInputDto,
  type ListFileReviewsInputDto,
  type ApproveFileReviewInputDto,
  type RejectFileReviewInputDto,
  type CancelFileReviewInputDto,
  type ApplyFileReviewInputDto,
  type ApplyFileReviewResultDto,
  type GetFileReviewContentInputDto,
  type FileReviewContentDto,
  type DefectPatchRollbackDto,
  type PatchRollbackPlanResultDto,
  type PlanPatchRollbackInputDto,
  type ExecutePatchRollbackInputDto,
  type GetPatchRollbackInputDto,
  type ListPatchRollbacksInputDto,
  type ResumePatchRollbackRecoveryInputDto,
  type ChangeSnapshotDto,
  type CreateChangeSnapshotInputDto,
  type RetestPlanDto,
  type PlanRetestInputDto,
  type GetRetestPlanInputDto,
  type ListRetestPlansInputDto,
  type ExplainTestSelectionInputDto,
  type ExplainTestSelectionResultDto,
  type ExecutePostFixSyncInputDto,
  type RetryPostFixSyncInputDto,
  type GetPostFixSyncStatusInputDto,
  type ListPostFixSyncHistoryInputDto,
  type PostFixSyncRecordDto,
  type GetRepairTimelineInputDto,
  type GetRepairSessionInputDto,
  type ListRepairSessionsInputDto,
  type ExportRepairTimelineInputDto,
  type RecordRepairAuditEventInputDto,
  type RepairAuditTimelineDto,
  type RepairSessionDto,
  type RepairAuditEventDto,
  type ExportRepairTimelineResultDto,
  type GenerateQaReportInputDto,
  type GetQaReportInputDto,
  type ListQaReportsInputDto,
  type FinalizeQaReportInputDto,
  type ExportQaReportInputDto,
  type EvaluateReleasePolicyInputDto,
  type CheckQaReportStalenessInputDto,
  type FinalQaReportDto,
  type ExportQaReportResultDto,
  type ReleasePolicyEvaluationResultDto,
  type QaReportStalenessResultDto,
  type ListWorkspaceSessionsInputDto,
  type GetWorkspaceSessionInputDto,
  type CreateWorkspaceSessionInputDto,
  type UpdateWorkspaceSessionInputDto,
  type DeleteWorkspaceSessionInputDto,
  type WorkspaceSessionSummaryDto,
  type WorkspaceSessionDto,
  type ShellLayoutPreferencesDto,
  type UpdateShellLayoutInputDto,
  type AuthStateDto,
  type AuthenticatedUserContextDto,
  type LoginInputDto,
  type SignupInputDto,
  type ForgotPasswordInputDto,
  type ResetPasswordInputDto,
  type PasswordResetResponseDto,
  type RevokeSessionInputDto,
  type RevokeAllSessionsInputDto,
  type SocialAuthStartInputDto,
  type SocialAuthStartResponseDto,
  type SocialAuthCallbackInputDto,
  type SocialAuthCancelInputDto,
  type SocialProviderStatusDto,
  type UserProfileDto,
  type UpdateProfileInputDto,
  type ChangePasswordInputDto,
  type UserAuthMethodsDto,
  type SessionSummaryDto,
  type UserPreferencesDto,
  type UpdateUserPreferencesInputDto,
  type DeleteAccountInputDto,
  type CreateWebsiteTargetInput,
  type UpdateWebsiteTargetInput,
  type DeleteWebsiteTargetInput,
  type SetActiveWebsiteTargetInput,
  type TestWebsiteTargetConnectionInput,
  type ConfirmWebsiteTargetAuthInput,
  type GetWebsiteTargetInput,
  type ListWebsiteTargetsInput,
  type ResolveWebsiteTargetSnapshotInput,
  type WebsiteTargetDetails,
  type WebsiteTargetSummary,
  type WebsiteTargetSnapshot,
  type ConnectivityCheckResultDto,
  type CreateRepositoryConnectionInput,
  type UpdateRepositoryConnectionInput,
  type DeleteRepositoryConnectionInput,
  type SetActiveRepositoryConnectionInput,
  type VerifyRepositoryConnectionInput,
  type ImportRepositoryConnectionInput,
  type CancelRepositoryImportInput,
  type ResolveRepositorySnapshotInput,
  type GetRepositoryConnectionInput,
  type ListRepositoryConnectionsInput,
  type VerifyGitProviderAuthInput,
  type ListGitProviderReposInput,
  type ListGitProviderBranchesInput,
  type RepositoryConnectionDetails,
  type RepositoryConnectionSummary,
  type RepositoryConnectionSnapshot,
  type RepositoryImportResultDto,
  type RepositoryVerificationResultDto,
  type GitProviderAccountDto,
  type GitProviderRepositoryDto,
  type GitBranchDto,
  type ConnectLocalFolderInput,
  type DisconnectLocalFolderInput,
  type ValidateLocalFolderInput,
  type ListProjectDirectoryInput,
  type ReadProjectFileInput,
  type SearchProjectFilesInput,
  type CheckProjectFileExistsInput,
  type GetProjectFileMetadataInput,
  type DetectProjectGitInput,
  type LocalFolderConnectionDto,
  type ProjectDirectoryListingDto,
  type ProjectFileContentDto,
  type ProjectFileSearchResultDto,
  type ProjectFileExistsResultDto,
  type ProjectFileMetadataDto,
  type ProjectGitDetectionDto,
  type GetTargetEnvironmentInput,
  type ListTargetEnvironmentsInput,
  type SaveTargetEnvironmentInput,
  type SetActiveTargetEnvironmentInput,
  type DeleteTargetEnvironmentInput,
  type TestTargetConnectionInput,
  type TestTargetAuthInput,
  type ResolveTargetEnvironmentInput,
  type TargetEnvironmentConfigDto,
  type TargetConnectionTestResultDto,
  type TargetAuthTestResultDto,
  type TargetExecutionSnapshotDto,
  type GetProjectContextInputDto,
  type DetectProjectSourcesInputDto,
  type RefreshProjectContextInputDto,
  type InvalidateProjectContextInputDto,
  type GetProjectContextStatusInputDto,
  type ProjectContextDto,
  type DetectedProjectSourcesDto,
  type ProjectContextStatusDto,
  type CreateAgentSessionInputDto,
  type GetAgentSessionInputDto,
  type ListAgentSessionsInputDto,
  type DeleteAgentSessionInputDto,
  type SendAgentMessageInputDto,
  type ApproveAgentActionInputDto,
  type AgentRunControlInputDto,
  type GetAgentEvidenceInputDto,
  type AgentSessionDto,
  type AgentMessageResponseDto,
  type AgentActionApprovalResultDto,
  type AgentRunControlResultDto,
  type AgentEvidenceQueryResultDto,
  type ListAiProvidersInputDto,
  type GetAiProviderInputDto,
  type AiProviderDescriptorDto,
  type ValidateAiRequestInputDto,
  type NormalizedAiRequestDto,
  type AiProviderConfigDto,
  type UpdateAiProviderConfigInput,
  type OllamaStatusDto,
  type OllamaHealthDiagnosticDto,
  type OllamaConfigDto,
  type GetOllamaStatusInputDto,
  type HealthCheckOllamaInputDto,
  type GetOllamaConfigInputDto,
  type SetOllamaConfigInputDto,
  type AiModelDto,
  type AiModelListDto,
  type ListAiModelsInputDto,
  type RefreshAiModelsInputDto,
  type GetAiModelInputDto,
  type ModelCapabilitiesProfileDto,
  type ModelSelectionResultDto,
  type GetModelCapabilitiesInputDto,
  type VerifyModelCapabilitiesInputDto,
  type SelectModelInputDto,
  type GetModelSelectionInputDto,
  type ResolveModelForTaskInputDto,
  type LocalGenerationRequestInputDto,
  type LocalGenerationResultDto,
  type LocalGenerationStatusDto,
  type CancelGenerationInputDto,
  type GetGenerationStatusInputDto,
  type AiStreamEventDto,
  type StructuredGenerationRequestInputDto,
  type StructuredGenerationResultDto,
  type ValidateStructuredInputDto,
  type StructuredValidationResultDto,
  type GetStructuredCapabilitiesInputDto,
  type StructuredCapabilitiesDto,
  type AiToolDefinitionDto,
  type NormalizedAiToolCallDto,
  type ValidatedAiToolCallResultDto,
  type AiToolCapabilitiesDto,
  type GenerateAiToolCallsInputDto,
  type GenerateAiToolCallsResultDto,
  type GetAiToolCapabilitiesInputDto,
  type ListAiToolsInputDto,
  type GetAiToolInputDto,
  type ParseAiToolCallsInputDto,
  type ValidateAiToolCallInputDto,
  type EstimateTokensInputDto,
  type TokenEstimationResultDto,
  type CalculateContextBudgetInputDto,
  type ContextBudgetDto,
  type OptimizeContextSelectionInputDto,
  type OptimizedContextSelectionResultDto,
  type GetModelContextCapabilitiesInputDto,
  type ModelContextCapabilitiesDto,
  type AiPrivacySettingsDto,
  type GetAiPrivacySettingsInputDto,
  type UpdateAiPrivacySettingsInputDto,
  type CheckAiContextFirewallInputDto,
  type AiContextFirewallResultDto,
  type AssembleRequirementTestContextInputDto,
  type RequirementTestContextResultDto,
  type AiFallbackSettingsDto,
  type GetAiFallbackSettingsInputDto,
  type UpdateAiFallbackSettingsInputDto,
  type GetAiProviderRegistryStatusInputDto,
  type AiProviderRegistryItemDto,
  type AiProviderSelectionCriteriaDto,
  type AiProviderSelectionResultDto,
  type AiActiveRequestDto,
  type AiRuntimeMetricsDto,
  type RecoverInterruptedRequestsInputDto,
  type RecoverInterruptedRequestsResultDto,
  type AgentRuntimeTaskDto,
  type CreateAgentRuntimeTaskInputDto,
  type GetAgentRuntimeTaskInputDto,
  type CancelAgentRuntimeTaskInputDto,
  type GetAgentRuntimeTaskEventsInputDto,
  type AgentRuntimeTaskEventDto,
  type AgentThreadDto,
  type CreateAgentThreadInputDto,
  type ListAgentThreadsInputDto,
  type GetAgentThreadInputDto,
  type ArchiveAgentThreadInputDto,
  type AgentThreadTaskDto,
  type CreateAgentThreadTaskInputDto,
  type GetAgentThreadTaskInputDto,
  type ListAgentThreadTasksInputDto,
  type CancelAgentThreadTaskInputDto,
  type RetryAgentThreadTaskInputDto,
  type ResumeAgentThreadTaskInputDto,
  type StopAgentThreadTaskInputDto,
  type PauseAgentThreadTaskInputDto,
  type ListAgentTaskControlAuditLogsInputDto,
  type AgentTaskControlAuditLogDto,
  type AgentThreadMessageDto,
  type ListAgentThreadMessagesInputDto,
  type AgentExecutionStepDto,
  type ListAgentExecutionStepsInputDto,
  type AgentToolCallRecordDto,
  type ListAgentToolCallsInputDto,
  type GetTaskRecoveryStateInputDto,
  type TaskRecoverySummaryDto,
  type ListRecoverableTasksInputDto,
  type ListAgentTaskCheckpointsInputDto,
  type AgentTaskCheckpointDto,
  type AgentAutonomousWorkflowReportDto,
  type ExecuteAutonomousWorkflowInputDto,
  type GetAutonomousWorkflowReportInputDto,
  type ApproveWorkflowFixInputDto,
  type RejectWorkflowFixInputDto,
  type AgentToolDefinitionDto,
  type AgentToolInvocationResultDto,
  type ListAgentToolsInputDto,
  type GetAgentToolInputDto,
  type InvokeAgentToolInputDto,
  type AgentToolApprovalDto,
  type AgentToolAuditLogDto,
  type ListAgentToolApprovalsInputDto,
  type GetAgentToolApprovalInputDto,
  type DecideAgentToolApprovalInputDto,
  type ListAgentToolAuditLogsInputDto,
} from '@ai-quality/contracts';

const desktopBridge: DesktopBridge = {
  app: {
    getInfo: (): Promise<DesktopResult<AppInfo>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.APP_GET_INFO),
  },

  health: {
    check: (): Promise<DesktopResult<HealthInfo>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.HEALTH_CHECK),
  },

  database: {
    getStatus: (): Promise<DesktopResult<DatabaseStatus>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.DATABASE_GET_STATUS),
  },

  projects: {
    list: (input?: ListProjectsInput): Promise<DesktopResult<readonly ProjectSummary[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_LIST, input),

    get: (projectId: string): Promise<DesktopResult<ProjectDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_GET, projectId),

    create: (input: CreateProjectInput): Promise<DesktopResult<ProjectDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_CREATE, input),

    update: (input: UpdateProjectInput): Promise<DesktopResult<ProjectDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_UPDATE, input),

    archive: (projectId: string): Promise<DesktopResult<ProjectDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_ARCHIVE, projectId),

    restore: (projectId: string): Promise<DesktopResult<ProjectDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_RESTORE, projectId),

    delete: (projectId: string): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_DELETE, projectId),

    markOpened: (
      input: MarkProjectOpenedInput,
    ): Promise<DesktopResult<{ readonly success: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_MARK_OPENED, input),

    environments: {
      list: (
        input: ListEnvironmentsInputDto,
      ): Promise<DesktopResult<readonly ProjectEnvironmentDto[]>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_LIST, input),

      get: (input: GetEnvironmentInputDto): Promise<DesktopResult<ProjectEnvironmentDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_GET, input),

      create: (input: CreateEnvironmentInput): Promise<DesktopResult<ProjectEnvironmentDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_CREATE, input),

      update: (input: UpdateEnvironmentInput): Promise<DesktopResult<ProjectEnvironmentDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_UPDATE, input),

      delete: (input: DeleteEnvironmentInput): Promise<DesktopResult<{ readonly deleted: true }>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_DELETE, input),

      setDefault: (
        input: SetDefaultEnvironmentInput,
      ): Promise<DesktopResult<ProjectEnvironmentDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_SET_DEFAULT, input),

      checkReachability: (
        input: CheckEnvironmentReachabilityInputDto,
      ): Promise<DesktopResult<EnvironmentReachabilityResultDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_CHECK_REACHABILITY, input),

      resolveSnapshot: (
        input: ResolveEnvironmentSnapshotInputDto,
      ): Promise<DesktopResult<ExecutionEnvironmentSnapshotDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_RESOLVE_SNAPSHOT, input),
    },
  },

  websiteTargets: {
    create: (input: CreateWebsiteTargetInput): Promise<DesktopResult<WebsiteTargetDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WEBSITE_TARGETS_CREATE, input),

    get: (input: GetWebsiteTargetInput): Promise<DesktopResult<WebsiteTargetDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WEBSITE_TARGETS_GET, input),

    list: (
      input: ListWebsiteTargetsInput,
    ): Promise<DesktopResult<readonly WebsiteTargetSummary[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WEBSITE_TARGETS_LIST, input),

    update: (input: UpdateWebsiteTargetInput): Promise<DesktopResult<WebsiteTargetDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WEBSITE_TARGETS_UPDATE, input),

    delete: (input: DeleteWebsiteTargetInput): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WEBSITE_TARGETS_DELETE, input),

    setActive: (input: SetActiveWebsiteTargetInput): Promise<DesktopResult<WebsiteTargetDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WEBSITE_TARGETS_SET_ACTIVE, input),

    testConnection: (
      input: TestWebsiteTargetConnectionInput,
    ): Promise<DesktopResult<ConnectivityCheckResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WEBSITE_TARGETS_TEST_CONNECTION, input),

    confirmAuth: (
      input: ConfirmWebsiteTargetAuthInput,
    ): Promise<DesktopResult<WebsiteTargetDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WEBSITE_TARGETS_CONFIRM_AUTH, input),

    resolveSnapshot: (
      input: ResolveWebsiteTargetSnapshotInput,
    ): Promise<DesktopResult<WebsiteTargetSnapshot>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WEBSITE_TARGETS_RESOLVE_SNAPSHOT, input),
  },

  repositoryConnections: {
    list: (
      input: ListRepositoryConnectionsInput,
    ): Promise<DesktopResult<readonly RepositoryConnectionSummary[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_LIST, input),

    get: (
      input: GetRepositoryConnectionInput,
    ): Promise<DesktopResult<RepositoryConnectionDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_GET, input),

    create: (
      input: CreateRepositoryConnectionInput,
    ): Promise<DesktopResult<RepositoryConnectionDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_CREATE, input),

    update: (
      input: UpdateRepositoryConnectionInput,
    ): Promise<DesktopResult<RepositoryConnectionDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_UPDATE, input),

    delete: (
      input: DeleteRepositoryConnectionInput,
    ): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_DELETE, input),

    setActive: (
      input: SetActiveRepositoryConnectionInput,
    ): Promise<DesktopResult<RepositoryConnectionDetails>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_SET_ACTIVE, input),

    verify: (
      input: VerifyRepositoryConnectionInput,
    ): Promise<DesktopResult<RepositoryVerificationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_VERIFY, input),

    import: (
      input: ImportRepositoryConnectionInput,
    ): Promise<DesktopResult<RepositoryImportResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_IMPORT, input),

    cancelImport: (
      input: CancelRepositoryImportInput,
    ): Promise<DesktopResult<{ readonly cancelled: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_CANCEL_IMPORT, input),

    resolveSnapshot: (
      input: ResolveRepositorySnapshotInput,
    ): Promise<DesktopResult<RepositoryConnectionSnapshot>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_RESOLVE_SNAPSHOT, input),
  },

  gitProvider: {
    verifyAuth: (
      input: VerifyGitProviderAuthInput,
    ): Promise<DesktopResult<GitProviderAccountDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_PROVIDER_VERIFY_AUTH, input),

    listRepos: (
      input: ListGitProviderReposInput,
    ): Promise<DesktopResult<readonly GitProviderRepositoryDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_PROVIDER_LIST_REPOS, input),

    listBranches: (
      input: ListGitProviderBranchesInput,
    ): Promise<DesktopResult<readonly GitBranchDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPOSITORY_PROVIDER_LIST_BRANCHES, input),
  },

  localFolder: {
    connect: (input: ConnectLocalFolderInput): Promise<DesktopResult<LocalFolderConnectionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOCAL_FOLDER_CONNECT, input),

    disconnect: (input: DisconnectLocalFolderInput): Promise<DesktopResult<boolean>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOCAL_FOLDER_DISCONNECT, input),

    validate: (input: ValidateLocalFolderInput): Promise<DesktopResult<LocalFolderConnectionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOCAL_FOLDER_VALIDATE, input),

    get: (projectId: string): Promise<DesktopResult<LocalFolderConnectionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOCAL_FOLDER_GET, projectId),

    listDirectory: (
      input: ListProjectDirectoryInput,
    ): Promise<DesktopResult<ProjectDirectoryListingDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOCAL_FOLDER_LIST_DIRECTORY, input),

    readFile: (input: ReadProjectFileInput): Promise<DesktopResult<ProjectFileContentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOCAL_FOLDER_READ_FILE, input),

    search: (input: SearchProjectFilesInput): Promise<DesktopResult<ProjectFileSearchResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOCAL_FOLDER_SEARCH, input),

    checkExists: (
      input: CheckProjectFileExistsInput,
    ): Promise<DesktopResult<ProjectFileExistsResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOCAL_FOLDER_CHECK_EXISTS, input),

    getMetadata: (
      input: GetProjectFileMetadataInput,
    ): Promise<DesktopResult<ProjectFileMetadataDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOCAL_FOLDER_GET_METADATA, input),

    detectGit: (input: DetectProjectGitInput): Promise<DesktopResult<ProjectGitDetectionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOCAL_FOLDER_DETECT_GIT, input),
  },

  targetEnvironment: {
    get: (input: GetTargetEnvironmentInput): Promise<DesktopResult<TargetEnvironmentConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TARGET_ENV_GET, input),

    list: (
      input: ListTargetEnvironmentsInput,
    ): Promise<DesktopResult<readonly TargetEnvironmentConfigDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TARGET_ENV_LIST, input),

    save: (input: SaveTargetEnvironmentInput): Promise<DesktopResult<TargetEnvironmentConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TARGET_ENV_SAVE, input),

    setActive: (
      input: SetActiveTargetEnvironmentInput,
    ): Promise<DesktopResult<TargetEnvironmentConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TARGET_ENV_SET_ACTIVE, input),

    delete: (input: DeleteTargetEnvironmentInput): Promise<DesktopResult<boolean>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TARGET_ENV_DELETE, input),

    testConnection: (
      input: TestTargetConnectionInput,
    ): Promise<DesktopResult<TargetConnectionTestResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TARGET_ENV_TEST_CONNECTION, input),

    testAuth: (input: TestTargetAuthInput): Promise<DesktopResult<TargetAuthTestResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TARGET_ENV_TEST_AUTH, input),

    resolveTarget: (
      input: ResolveTargetEnvironmentInput,
    ): Promise<DesktopResult<TargetExecutionSnapshotDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TARGET_ENV_RESOLVE_TARGET, input),
  },

  projectContext: {
    get: (input: GetProjectContextInputDto): Promise<DesktopResult<ProjectContextDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_CONTEXT_GET, input),

    detect: (
      input: DetectProjectSourcesInputDto,
    ): Promise<DesktopResult<DetectedProjectSourcesDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_CONTEXT_DETECT, input),

    refresh: (input: RefreshProjectContextInputDto): Promise<DesktopResult<ProjectContextDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_CONTEXT_REFRESH, input),

    invalidate: (
      input: InvalidateProjectContextInputDto,
    ): Promise<DesktopResult<ProjectContextDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_CONTEXT_INVALIDATE, input),

    getStatus: (
      input: GetProjectContextStatusInputDto,
    ): Promise<DesktopResult<ProjectContextStatusDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_CONTEXT_STATUS, input),
  },

  conversationalAgent: {
    createSession: (input: CreateAgentSessionInputDto): Promise<DesktopResult<AgentSessionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_SESSION_CREATE, input),

    getSession: (input: GetAgentSessionInputDto): Promise<DesktopResult<AgentSessionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_SESSION_GET, input),

    listSessions: (
      input: ListAgentSessionsInputDto,
    ): Promise<DesktopResult<readonly AgentSessionDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_SESSION_LIST, input),

    deleteSession: (
      input: DeleteAgentSessionInputDto,
    ): Promise<DesktopResult<{ readonly success: boolean; readonly sessionId: string }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_SESSION_DELETE, input),

    sendMessage: (
      input: SendAgentMessageInputDto,
    ): Promise<DesktopResult<AgentMessageResponseDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_SEND_MESSAGE, input),

    approveAction: (
      input: ApproveAgentActionInputDto,
    ): Promise<DesktopResult<AgentActionApprovalResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_APPROVE_ACTION, input),

    runControl: (
      input: AgentRunControlInputDto,
    ): Promise<DesktopResult<AgentRunControlResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_RUN_CONTROL, input),

    getEvidence: (
      input: GetAgentEvidenceInputDto,
    ): Promise<DesktopResult<AgentEvidenceQueryResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_GET_EVIDENCE, input),
  },

  aiProvider: {
    listProviders: (
      input?: ListAiProvidersInputDto,
    ): Promise<DesktopResult<readonly AiProviderDescriptorDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_PROVIDER_LIST, input),

    getProvider: (input: GetAiProviderInputDto): Promise<DesktopResult<AiProviderDescriptorDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_PROVIDER_GET, input),

    validateRequest: (
      input: ValidateAiRequestInputDto,
    ): Promise<DesktopResult<NormalizedAiRequestDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_REQUEST_VALIDATE, input),

    getConfig: (input: {
      projectId?: string | null;
      providerId: string;
    }): Promise<DesktopResult<AiProviderConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_CONFIG_GET, input),

    updateConfig: (
      input: UpdateAiProviderConfigInput,
    ): Promise<DesktopResult<AiProviderConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_CONFIG_UPDATE, input),
  },

  ollama: {
    getStatus: (input?: GetOllamaStatusInputDto): Promise<DesktopResult<OllamaStatusDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_OLLAMA_GET_STATUS, input),

    healthCheck: (
      input?: HealthCheckOllamaInputDto,
    ): Promise<DesktopResult<OllamaHealthDiagnosticDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_OLLAMA_HEALTH_CHECK, input),

    getConfig: (input?: GetOllamaConfigInputDto): Promise<DesktopResult<OllamaConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_OLLAMA_GET_CONFIG, input),

    setConfig: (input: SetOllamaConfigInputDto): Promise<DesktopResult<OllamaConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_OLLAMA_SET_CONFIG, input),
  },

  aiModels: {
    list: (input?: ListAiModelsInputDto): Promise<DesktopResult<AiModelListDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_MODELS_LIST, input),

    refresh: (input?: RefreshAiModelsInputDto): Promise<DesktopResult<AiModelListDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_MODELS_REFRESH, input),

    get: (input: GetAiModelInputDto): Promise<DesktopResult<AiModelDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_MODELS_GET, input),

    getCapabilities: (
      input: GetModelCapabilitiesInputDto,
    ): Promise<DesktopResult<ModelCapabilitiesProfileDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_MODELS_GET_CAPABILITIES, input),

    verifyCapabilities: (
      input: VerifyModelCapabilitiesInputDto,
    ): Promise<DesktopResult<ModelCapabilitiesProfileDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_MODELS_VERIFY_CAPABILITIES, input),

    select: (input: SelectModelInputDto): Promise<DesktopResult<ModelSelectionResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_MODELS_SELECT, input),

    getSelection: (
      input: GetModelSelectionInputDto,
    ): Promise<DesktopResult<ModelSelectionResultDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_MODELS_GET_SELECTION, input),

    resolveForTask: (
      input: ResolveModelForTaskInputDto,
    ): Promise<DesktopResult<ModelSelectionResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_MODELS_RESOLVE_FOR_TASK, input),
  },

  aiGeneration: {
    generate: (
      input: LocalGenerationRequestInputDto,
    ): Promise<DesktopResult<LocalGenerationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_GENERATION_GENERATE, input),

    generateStream: async (
      input: LocalGenerationRequestInputDto,
      onEvent: (event: AiStreamEventDto) => void,
    ): Promise<() => void> => {
      const requestId = input.requestId || crypto.randomUUID();
      const requestWithId = { ...input, requestId };

      let cleanedUp = false;
      const listener = (_: unknown, event: AiStreamEventDto) => {
        if (!cleanedUp && event.requestId === requestId) {
          onEvent(event);
          if (event.done) {
            cleanup();
          }
        }
      };

      const cleanup = () => {
        if (!cleanedUp) {
          cleanedUp = true;
          ipcRenderer.removeListener(DESKTOP_CHANNELS.AI_STREAM_EVENT, listener);
        }
      };

      ipcRenderer.on(DESKTOP_CHANNELS.AI_STREAM_EVENT, listener);

      try {
        const invokeRes = (await ipcRenderer.invoke(
          DESKTOP_CHANNELS.AI_GENERATION_STREAM,
          requestWithId,
        )) as DesktopResult<{ readonly requestId: string }>;

        if (!invokeRes.ok) {
          cleanup();
          onEvent({
            requestId,
            projectId: input.projectId,
            sequence: 0,
            type: 'ERROR',
            done: true,
            error: invokeRes.error?.message ?? 'Failed to initiate stream',
          });
        }
      } catch (err: unknown) {
        cleanup();
        onEvent({
          requestId,
          projectId: input.projectId,
          sequence: 0,
          type: 'ERROR',
          done: true,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return cleanup;
    },

    cancel: (
      input: CancelGenerationInputDto,
    ): Promise<DesktopResult<{ readonly cancelled: boolean; readonly requestId: string }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_GENERATION_CANCEL, input),

    getStatus: (
      input: GetGenerationStatusInputDto,
    ): Promise<DesktopResult<LocalGenerationStatusDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_GENERATION_GET_STATUS, input),

    generateStructured: (
      input: StructuredGenerationRequestInputDto,
    ): Promise<DesktopResult<StructuredGenerationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_STRUCTURED_GENERATE, input),

    validateStructured: (
      input: ValidateStructuredInputDto,
    ): Promise<DesktopResult<StructuredValidationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_STRUCTURED_VALIDATE, input),

    getStructuredCapabilities: (
      input?: GetStructuredCapabilitiesInputDto,
    ): Promise<DesktopResult<StructuredCapabilitiesDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_STRUCTURED_GET_CAPABILITIES, input),
  },

  aiTool: {
    listTools: (
      input?: ListAiToolsInputDto,
    ): Promise<DesktopResult<readonly AiToolDefinitionDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_TOOL_LIST, input),

    getTool: (input: GetAiToolInputDto): Promise<DesktopResult<AiToolDefinitionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_TOOL_GET, input),

    parseCalls: (
      input: ParseAiToolCallsInputDto,
    ): Promise<DesktopResult<readonly NormalizedAiToolCallDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_TOOL_PARSE_CALL, input),

    validateCall: (
      input: ValidateAiToolCallInputDto,
    ): Promise<DesktopResult<ValidatedAiToolCallResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_TOOL_VALIDATE_CALL, input),

    generateCalls: (
      input: GenerateAiToolCallsInputDto,
    ): Promise<DesktopResult<GenerateAiToolCallsResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_TOOL_GENERATE_CALLS, input),

    getCapabilities: (
      input?: GetAiToolCapabilitiesInputDto,
    ): Promise<DesktopResult<AiToolCapabilitiesDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_TOOL_GET_CAPABILITIES, input),
  },

  aiContext: {
    estimateTokens: (
      input: EstimateTokensInputDto,
    ): Promise<DesktopResult<TokenEstimationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_CONTEXT_ESTIMATE_TOKENS, input),

    calculateBudget: (
      input: CalculateContextBudgetInputDto,
    ): Promise<DesktopResult<ContextBudgetDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_CONTEXT_CALCULATE_BUDGET, input),

    optimizeSelection: (
      input: OptimizeContextSelectionInputDto,
    ): Promise<DesktopResult<OptimizedContextSelectionResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_CONTEXT_OPTIMIZE_SELECTION, input),

    getCapabilities: (
      input: GetModelContextCapabilitiesInputDto,
    ): Promise<DesktopResult<ModelContextCapabilitiesDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_CONTEXT_GET_CAPABILITIES, input),

    assembleRequirementTestContext: (
      input: AssembleRequirementTestContextInputDto,
    ): Promise<DesktopResult<RequirementTestContextResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_CONTEXT_ASSEMBLE_REQ_TEST, input),
  },

  aiPrivacy: {
    getSettings: (
      input?: GetAiPrivacySettingsInputDto,
    ): Promise<DesktopResult<AiPrivacySettingsDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_PRIVACY_GET_SETTINGS, input),

    updateSettings: (
      input: UpdateAiPrivacySettingsInputDto,
    ): Promise<DesktopResult<AiPrivacySettingsDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_PRIVACY_UPDATE_SETTINGS, input),

    checkFirewall: (
      input: CheckAiContextFirewallInputDto,
    ): Promise<DesktopResult<AiContextFirewallResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_PRIVACY_CHECK_FIREWALL, input),
  },

  aiRouter: {
    getFallbackSettings: (
      input?: GetAiFallbackSettingsInputDto,
    ): Promise<DesktopResult<AiFallbackSettingsDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_FALLBACK_GET_POLICY, input),

    updateFallbackSettings: (
      input: UpdateAiFallbackSettingsInputDto,
    ): Promise<DesktopResult<AiFallbackSettingsDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_FALLBACK_SET_POLICY, input),

    listProviders: (
      input?: GetAiProviderRegistryStatusInputDto,
    ): Promise<DesktopResult<readonly AiProviderRegistryItemDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_PROVIDERS_LIST, input),

    getProviderStatus: (input: {
      readonly providerId: string;
      readonly projectId?: string | null;
    }): Promise<DesktopResult<AiProviderRegistryItemDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_PROVIDERS_STATUS, input),

    selectProvider: (
      input: AiProviderSelectionCriteriaDto,
    ): Promise<DesktopResult<AiProviderSelectionResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_PROVIDERS_SELECT, input),
  },

  aiLifecycle: {
    getActiveRequests: (
      projectId?: string | null,
    ): Promise<DesktopResult<readonly AiActiveRequestDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_LIFECYCLE_GET_ACTIVE_REQUESTS, { projectId }),

    getMetrics: (): Promise<DesktopResult<AiRuntimeMetricsDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_LIFECYCLE_GET_METRICS),

    recoverInterrupted: (
      input?: RecoverInterruptedRequestsInputDto,
    ): Promise<DesktopResult<RecoverInterruptedRequestsResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_LIFECYCLE_RECOVER_INTERRUPTED, input),
  },

  agentRuntime: {
    createTask: (
      input: CreateAgentRuntimeTaskInputDto,
    ): Promise<DesktopResult<AgentRuntimeTaskDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_CREATE, input),

    getTask: (
      input: GetAgentRuntimeTaskInputDto,
    ): Promise<DesktopResult<AgentRuntimeTaskDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_GET, input),

    cancelTask: (
      input: CancelAgentRuntimeTaskInputDto,
    ): Promise<DesktopResult<AgentRuntimeTaskDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_CANCEL, input),

    getTaskEvents: (
      input: GetAgentRuntimeTaskEventsInputDto,
    ): Promise<DesktopResult<readonly AgentRuntimeTaskEventDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_RUNTIME_TASK_GET_EVENTS, input),
  },

  agentThread: {
    createThread: (input: CreateAgentThreadInputDto): Promise<DesktopResult<AgentThreadDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_CREATE, input),

    listThreads: (
      input: ListAgentThreadsInputDto,
    ): Promise<DesktopResult<readonly AgentThreadDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_LIST, input),

    getThread: (input: GetAgentThreadInputDto): Promise<DesktopResult<AgentThreadDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_GET, input),

    archiveThread: (input: ArchiveAgentThreadInputDto): Promise<DesktopResult<AgentThreadDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_ARCHIVE, input),

    createTask: (
      input: CreateAgentThreadTaskInputDto,
    ): Promise<DesktopResult<AgentThreadTaskDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_TASK_CREATE, input),

    getTask: (
      input: GetAgentThreadTaskInputDto,
    ): Promise<DesktopResult<AgentThreadTaskDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_TASK_GET, input),

    listTasks: (
      input: ListAgentThreadTasksInputDto,
    ): Promise<DesktopResult<readonly AgentThreadTaskDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_TASK_LIST, input),

    cancelTask: (
      input: CancelAgentThreadTaskInputDto,
    ): Promise<DesktopResult<AgentThreadTaskDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_TASK_CANCEL, input),

    retryTask: (input: RetryAgentThreadTaskInputDto): Promise<DesktopResult<AgentThreadTaskDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_TASK_RETRY, input),

    resumeTask: (
      input: ResumeAgentThreadTaskInputDto,
    ): Promise<DesktopResult<AgentThreadTaskDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_TASK_RESUME, input),

    stopTask: (input: StopAgentThreadTaskInputDto): Promise<DesktopResult<AgentThreadTaskDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_TASK_STOP, input),

    pauseTask: (input: PauseAgentThreadTaskInputDto): Promise<DesktopResult<AgentThreadTaskDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_TASK_PAUSE, input),

    listControlAuditLogs: (
      input: ListAgentTaskControlAuditLogsInputDto,
    ): Promise<DesktopResult<readonly AgentTaskControlAuditLogDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_TASK_CONTROL_AUDIT_LOGS_LIST, input),

    listMessages: (
      input: ListAgentThreadMessagesInputDto,
    ): Promise<DesktopResult<readonly AgentThreadMessageDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_MESSAGE_LIST, input),

    listExecutionSteps: (
      input: ListAgentExecutionStepsInputDto,
    ): Promise<DesktopResult<readonly AgentExecutionStepDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_EXECUTION_STEP_LIST, input),

    listToolCalls: (
      input: ListAgentToolCallsInputDto,
    ): Promise<DesktopResult<readonly AgentToolCallRecordDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_TOOL_CALL_LIST, input),

    getRecoveryState: (
      input: GetTaskRecoveryStateInputDto,
    ): Promise<DesktopResult<TaskRecoverySummaryDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_TASK_GET_RECOVERY_STATE, input),

    listRecoverableTasks: (
      input: ListRecoverableTasksInputDto,
    ): Promise<DesktopResult<readonly TaskRecoverySummaryDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_THREAD_TASK_LIST_RECOVERABLE, input),

    listCheckpoints: (
      input: ListAgentTaskCheckpointsInputDto,
    ): Promise<DesktopResult<readonly AgentTaskCheckpointDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_TASK_CHECKPOINTS_LIST, input),

    executeAutonomousWorkflow: (
      input: ExecuteAutonomousWorkflowInputDto,
    ): Promise<DesktopResult<AgentAutonomousWorkflowReportDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_WORKFLOW_EXECUTE, input),

    getAutonomousWorkflowReport: (
      input: GetAutonomousWorkflowReportInputDto,
    ): Promise<DesktopResult<AgentAutonomousWorkflowReportDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_WORKFLOW_GET_REPORT, input),

    approveWorkflowFix: (
      input: ApproveWorkflowFixInputDto,
    ): Promise<DesktopResult<AgentAutonomousWorkflowReportDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_WORKFLOW_APPROVE_FIX, input),

    rejectWorkflowFix: (
      input: RejectWorkflowFixInputDto,
    ): Promise<DesktopResult<AgentAutonomousWorkflowReportDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_WORKFLOW_REJECT_FIX, input),
  },

  agentToolRegistry: {
    listTools: (
      input: ListAgentToolsInputDto,
    ): Promise<DesktopResult<readonly AgentToolDefinitionDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_TOOL_REGISTRY_LIST, input),

    getTool: (input: GetAgentToolInputDto): Promise<DesktopResult<AgentToolDefinitionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_TOOL_REGISTRY_GET, input),

    invokeTool: (
      input: InvokeAgentToolInputDto,
    ): Promise<DesktopResult<AgentToolInvocationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_TOOL_REGISTRY_INVOKE, input),
  },

  agentToolPermissions: {
    listApprovals: (
      input: ListAgentToolApprovalsInputDto,
    ): Promise<DesktopResult<readonly AgentToolApprovalDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_TOOL_APPROVAL_LIST, input),

    getApproval: (
      input: GetAgentToolApprovalInputDto,
    ): Promise<DesktopResult<AgentToolApprovalDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_TOOL_APPROVAL_GET, input),

    decideApproval: (
      input: DecideAgentToolApprovalInputDto,
    ): Promise<DesktopResult<AgentToolApprovalDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_TOOL_APPROVAL_DECIDE, input),

    listAuditLogs: (
      input: ListAgentToolAuditLogsInputDto,
    ): Promise<DesktopResult<readonly AgentToolAuditLogDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_TOOL_AUDIT_LOG_LIST, input),
  },

  targetApplications: {
    get: (projectId: string): Promise<DesktopResult<TargetApplicationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TARGET_APP_GET, projectId),

    update: (
      input: UpdateTargetApplicationInputDto,
    ): Promise<DesktopResult<TargetApplicationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TARGET_APP_UPDATE, input),
  },

  environments: {
    list: (
      input: ListEnvironmentsInputDto,
    ): Promise<DesktopResult<readonly ProjectEnvironmentDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_LIST, input),

    get: (input: GetEnvironmentInputDto): Promise<DesktopResult<ProjectEnvironmentDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_GET, input),

    create: (input: CreateEnvironmentInput): Promise<DesktopResult<ProjectEnvironmentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_CREATE, input),

    update: (input: UpdateEnvironmentInput): Promise<DesktopResult<ProjectEnvironmentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_UPDATE, input),

    delete: (input: DeleteEnvironmentInput): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_DELETE, input),

    setDefault: (
      input: SetDefaultEnvironmentInput,
    ): Promise<DesktopResult<ProjectEnvironmentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_SET_DEFAULT, input),

    checkReachability: (
      input: CheckEnvironmentReachabilityInputDto,
    ): Promise<DesktopResult<EnvironmentReachabilityResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_CHECK_REACHABILITY, input),

    resolveSnapshot: (
      input: ResolveEnvironmentSnapshotInputDto,
    ): Promise<DesktopResult<ExecutionEnvironmentSnapshotDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.ENVIRONMENT_RESOLVE_SNAPSHOT, input),
  },

  sources: {
    get: (projectId: string): Promise<DesktopResult<ProjectSourceDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_GET, projectId),

    pickDirectory: (): Promise<DesktopResult<PickDirectoryResult>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_PICK_DIRECTORY),

    attachLocalDirectory: (
      projectId: string,
      directoryPath?: string,
    ): Promise<DesktopResult<AttachLocalDirectoryResult>> =>
      ipcRenderer.invoke(
        DESKTOP_CHANNELS.SOURCES_ATTACH_LOCAL_DIRECTORY,
        directoryPath ? { projectId, directoryPath } : projectId,
      ),

    detach: (projectId: string): Promise<DesktopResult<DetachSourceResult>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_DETACH, projectId),

    validate: (projectId: string): Promise<DesktopResult<ProjectSourceDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_VALIDATE, projectId),

    refreshMetadata: (projectId: string): Promise<DesktopResult<ProjectSourceDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_REFRESH_METADATA, projectId),

    git: {
      get: (projectId: string): Promise<DesktopResult<GitStatusDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_GIT_GET, projectId),

      refresh: (projectId: string): Promise<DesktopResult<GitStatusDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_GIT_REFRESH, projectId),
    },

    structure: {
      get: (projectId: string): Promise<DesktopResult<SourceStructureDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_STRUCTURE_GET, projectId),

      refresh: (projectId: string): Promise<DesktopResult<SourceStructureDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_STRUCTURE_REFRESH, projectId),
    },

    technology: {
      get: (projectId: string): Promise<DesktopResult<TechnologyProfileDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_TECHNOLOGY_GET, projectId),

      refresh: (projectId: string): Promise<DesktopResult<TechnologyProfileDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_TECHNOLOGY_REFRESH, projectId),
    },

    frameworks: {
      get: (projectId: string): Promise<DesktopResult<FrameworkProfileDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_FRAMEWORKS_GET, projectId),

      refresh: (projectId: string): Promise<DesktopResult<FrameworkProfileDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_FRAMEWORKS_REFRESH, projectId),
    },

    classification: {
      get: (projectId: string): Promise<DesktopResult<ClassificationProfileDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_CLASSIFICATION_GET, projectId),

      refresh: (projectId: string): Promise<DesktopResult<ClassificationProfileDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_CLASSIFICATION_REFRESH, projectId),
    },

    content: {
      get: (input: SourceFileContentInput): Promise<DesktopResult<SourceFileContentDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_CONTENT_GET, input),
    },

    index: {
      getStatus: (projectId: string): Promise<DesktopResult<RepositoryIndexStatusDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_INDEX_GET_STATUS, projectId),

      refresh: (projectId: string): Promise<DesktopResult<RepositoryIndexStatusDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_INDEX_REFRESH, projectId),

      listFiles: (
        input: ListIndexedFilesInput,
      ): Promise<DesktopResult<PaginatedResult<RepositoryFileDto>>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_INDEX_LIST_FILES, input),

      getFileDetails: (
        input: RepositoryFileDetailsInput,
      ): Promise<DesktopResult<RepositoryFileDetailsDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_INDEX_GET_FILE_DETAILS, input),

      searchSymbols: (
        input: SearchSymbolsInput,
      ): Promise<DesktopResult<readonly RepositorySymbolDto[]>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_INDEX_SEARCH_SYMBOLS, input),
    },

    architecture: {
      get: (projectId: string): Promise<DesktopResult<ApplicationArchitectureProfileDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_ARCHITECTURE_GET, projectId),

      refresh: (projectId: string): Promise<DesktopResult<ApplicationArchitectureProfileDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_ARCHITECTURE_REFRESH, projectId),
    },

    runConfiguration: {
      get: (projectId: string): Promise<DesktopResult<RunConfigurationProfileDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_GET, projectId),

      detect: (projectId: string): Promise<DesktopResult<RunConfigurationProfileDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_DETECT, projectId),

      select: (
        input: SelectRunConfigInput,
      ): Promise<DesktopResult<ApplicationRunConfigurationDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_SELECT, input),

      updateTargetUrl: (
        input: UpdateTargetUrlInput,
      ): Promise<DesktopResult<ApplicationRunConfigurationDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_RUN_CONFIG_UPDATE_TARGET_URL, input),
    },

    snapshots: {
      list: (projectId: string): Promise<DesktopResult<readonly RepositorySnapshotDto[]>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_LIST, projectId),

      create: (input: CreateSnapshotInput): Promise<DesktopResult<RepositorySnapshotDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_CREATE, input),

      setBaseline: (input: SetBaselineInput): Promise<DesktopResult<RepositorySnapshotDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_SET_BASELINE, input),

      delete: (input: DeleteSnapshotInput): Promise<DesktopResult<{ readonly deleted: true }>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_SNAPSHOTS_DELETE, input),
    },

    changes: {
      get: (projectId: string): Promise<DesktopResult<RepositoryChangeSetDto | null>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_CHANGES_GET, projectId),

      refresh: (projectId: string): Promise<DesktopResult<RepositoryChangeSetDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_CHANGES_REFRESH, projectId),
    },
  },

  requirements: {
    list: (input: ListRequirementsInput): Promise<DesktopResult<PaginatedResult<RequirementDto>>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_LIST, input),

    get: (input: GetRequirementInput): Promise<DesktopResult<RequirementDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET, input),

    getByKey: (input: GetRequirementByKeyInput): Promise<DesktopResult<RequirementDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_BY_KEY, input),

    getSummary: (projectId: string): Promise<DesktopResult<RequirementSummaryDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_SUMMARY, projectId),

    create: (input: CreateRequirementInput): Promise<DesktopResult<RequirementDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_CREATE, input),

    update: (input: UpdateRequirementInput): Promise<DesktopResult<RequirementDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_UPDATE, input),

    activate: (input: ActivateRequirementInput): Promise<DesktopResult<RequirementDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_ACTIVATE, input),

    deprecate: (input: DeprecateRequirementInput): Promise<DesktopResult<RequirementDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_DEPRECATE, input),

    draft: (input: DraftRequirementInput): Promise<DesktopResult<RequirementDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_DRAFT, input),

    archive: (input: ArchiveRequirementInput): Promise<DesktopResult<RequirementDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_ARCHIVE, input),

    restore: (input: RestoreRequirementInput): Promise<DesktopResult<RequirementDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_RESTORE, input),

    delete: (input: DeleteRequirementInput): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_DELETE, input),

    parseBulk: (
      input: ParseBulkRequirementsInput,
    ): Promise<DesktopResult<ParseBulkRequirementsResult>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_PARSE_BULK, input),

    importBulk: (
      input: ImportBulkRequirementsInput,
    ): Promise<DesktopResult<ImportBulkRequirementsResult>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_IMPORT_BULK, input),

    getProvenance: (
      input: GetRequirementProvenanceInput,
    ): Promise<DesktopResult<RequirementProvenanceDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_PROVENANCE, input),

    getSourceContext: (
      input: GetRequirementSourceContextInput,
    ): Promise<DesktopResult<RequirementSourceContextDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_SOURCE_CONTEXT, input),

    normalize: (
      input: NormalizeRequirementInput,
    ): Promise<DesktopResult<RequirementRepresentationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_NORMALIZE, input),

    getRepresentation: (
      input: GetRequirementRepresentationInput,
    ): Promise<DesktopResult<RequirementRepresentationDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_REPRESENTATION, input),

    updateRepresentation: (
      input: UpdateRequirementRepresentationInput,
    ): Promise<DesktopResult<RequirementRepresentationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_REPRESENTATION, input),

    regenerateRepresentation: (
      input: RegenerateRequirementRepresentationInput,
    ): Promise<DesktopResult<RequirementRepresentationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_REGENERATE_REPRESENTATION, input),

    batchNormalize: (
      input: BatchNormalizeRequirementsInput,
    ): Promise<DesktopResult<BatchNormalizeRequirementsResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_BATCH_NORMALIZE, input),

    classify: (input: ClassifyRequirementInput): Promise<DesktopResult<RequirementMetadataDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_CLASSIFY, input),

    getMetadata: (
      input: GetRequirementMetadataInput,
    ): Promise<DesktopResult<RequirementMetadataDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_METADATA, input),

    updateMetadata: (
      input: UpdateRequirementMetadataInput,
    ): Promise<DesktopResult<RequirementMetadataDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_METADATA, input),

    regenerateMetadata: (
      input: RegenerateRequirementMetadataInput,
    ): Promise<DesktopResult<RequirementMetadataDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_REGENERATE_METADATA, input),

    batchClassify: (
      input: BatchClassifyRequirementsInput,
    ): Promise<DesktopResult<BatchClassifyRequirementsResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_BATCH_CLASSIFY, input),

    analyzeQuality: (
      input: AnalyzeRequirementQualityInput,
    ): Promise<DesktopResult<RequirementQualityAnalysisDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_ANALYZE_QUALITY, input),

    getQualityAnalysis: (
      input: GetRequirementQualityAnalysisInput,
    ): Promise<DesktopResult<RequirementQualityAnalysisDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_QUALITY_ANALYSIS, input),

    reviewQualityFinding: (
      input: ReviewRequirementQualityFindingInput,
    ): Promise<DesktopResult<RequirementQualityFindingDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_QUALITY_FINDING, input),

    reanalyzeQuality: (
      input: ReanalyzeRequirementQualityInput,
    ): Promise<DesktopResult<RequirementQualityAnalysisDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_REANALYZE_QUALITY, input),

    batchAnalyzeQuality: (
      input: BatchAnalyzeRequirementQualityInput,
    ): Promise<DesktopResult<BatchAnalyzeQualityResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_BATCH_ANALYZE_QUALITY, input),

    proposeRelationships: (
      input: ProposeRelationshipsInput,
    ): Promise<DesktopResult<ProposeRelationshipsResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_PROPOSE_RELATIONSHIPS, input),

    getRelationships: (
      input: GetRelationshipsInput,
    ): Promise<DesktopResult<readonly RequirementRelationshipDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_RELATIONSHIPS, input),

    getRelationshipGraph: (
      input: GetRelationshipGraphInput,
    ): Promise<DesktopResult<RelationshipGraphDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_RELATIONSHIP_GRAPH, input),

    createManualRelationship: (
      input: CreateManualRelationshipInput,
    ): Promise<DesktopResult<RequirementRelationshipDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_CREATE_MANUAL_RELATIONSHIP, input),

    reviewRelationship: (
      input: ReviewRelationshipInput,
    ): Promise<DesktopResult<RequirementRelationshipDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_RELATIONSHIP, input),

    deleteRelationship: (
      input: DeleteRelationshipInput,
    ): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_DELETE_RELATIONSHIP, input),

    matchRepositoryEvidence: (
      input: MatchRepositoryEvidenceInput,
    ): Promise<DesktopResult<MatchRepositoryEvidenceResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_MATCH_REPOSITORY_EVIDENCE, input),

    getRepositoryEvidence: (
      input: GetRepositoryEvidenceInput,
    ): Promise<DesktopResult<readonly RequirementRepositoryEvidenceDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_REPOSITORY_EVIDENCE, input),

    reviewRepositoryEvidence: (
      input: ReviewRepositoryEvidenceInput,
    ): Promise<DesktopResult<RequirementRepositoryEvidenceDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_REPOSITORY_EVIDENCE, input),

    createManualRepositoryEvidence: (
      input: CreateManualRepositoryEvidenceInput,
    ): Promise<DesktopResult<RequirementRepositoryEvidenceDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_CREATE_MANUAL_REPOSITORY_EVIDENCE, input),

    deleteRepositoryEvidence: (
      input: DeleteRepositoryEvidenceInput,
    ): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_DELETE_REPOSITORY_EVIDENCE, input),

    previewRepositoryEvidence: (
      input: PreviewRepositoryEvidenceInput,
    ): Promise<DesktopResult<EvidencePreviewDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_PREVIEW_REPOSITORY_EVIDENCE, input),

    getHistory: (
      input: GetRequirementHistoryInput,
    ): Promise<DesktopResult<RequirementHistoryDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_HISTORY, input),

    getVersion: (
      input: GetRequirementVersionInput,
    ): Promise<DesktopResult<RequirementVersionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_VERSION, input),

    compareVersions: (
      input: CompareRequirementVersionsInput,
    ): Promise<DesktopResult<RequirementDiffDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_COMPARE_VERSIONS, input),

    updateVersioned: (
      input: UpdateRequirementVersionedInput,
    ): Promise<
      DesktopResult<{
        readonly requirement: RequirementDto;
        readonly version: RequirementVersionDto;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_UPDATE_VERSIONED, input),

    restoreVersion: (
      input: RestoreRequirementVersionInput,
    ): Promise<
      DesktopResult<{
        readonly requirement: RequirementDto;
        readonly newVersion: RequirementVersionDto;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_RESTORE_VERSION, input),

    getChangeImpact: (
      input: GetRequirementChangeImpactInput,
    ): Promise<DesktopResult<RequirementImpactsResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_GET_CHANGE_IMPACT, input),

    reviewChangeImpact: (
      input: ReviewRequirementImpactInput,
    ): Promise<DesktopResult<RequirementImpactCandidateDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENTS_REVIEW_CHANGE_IMPACT, input),
  },

  requirementSources: {
    list: (
      input: ListRequirementSourcesInput,
    ): Promise<DesktopResult<readonly RequirementSourceDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_SOURCES_LIST, input),

    get: (input: GetRequirementSourceInput): Promise<DesktopResult<RequirementSourceDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_SOURCES_GET, input),
  },

  requirementDocuments: {
    selectAndIngest: (
      input: SelectAndIngestDocumentInput,
    ): Promise<DesktopResult<SelectAndIngestDocumentResult>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_SELECT_AND_INGEST, input),

    list: (
      input: ListRequirementDocumentsInput,
    ): Promise<DesktopResult<readonly RequirementDocumentDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_LIST, input),

    get: (
      input: GetRequirementDocumentInput,
    ): Promise<DesktopResult<RequirementDocumentDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_GET, input),

    delete: (
      input: DeleteRequirementDocumentInput,
    ): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_DELETE, input),

    extract: (
      input: ExtractRequirementDocumentInput,
    ): Promise<DesktopResult<RequirementDocumentExtractionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_EXTRACT, input),

    getExtraction: (
      input: GetRequirementDocumentExtractionInput,
    ): Promise<DesktopResult<RequirementDocumentExtractionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_DOCUMENTS_GET_EXTRACTION, input),
  },

  requirementCandidates: {
    detect: (
      input: DetectRequirementCandidatesInput,
    ): Promise<DesktopResult<readonly RequirementCandidateDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_DETECT, input),

    list: (
      input: ListRequirementCandidatesInput,
    ): Promise<DesktopResult<RequirementCandidateListDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_LIST, input),

    update: (
      input: UpdateRequirementCandidateInput,
    ): Promise<DesktopResult<RequirementCandidateDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_UPDATE, input),

    setStatus: (
      input: SetRequirementCandidateStatusInput,
    ): Promise<DesktopResult<readonly RequirementCandidateDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_SET_STATUS, input),

    import: (
      input: ImportApprovedCandidatesInput,
    ): Promise<DesktopResult<ImportCandidatesResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REQUIREMENT_CANDIDATES_IMPORT, input),
  },

  ai: {
    getProviderStatus: (
      input?: GetAiProviderStatusInput,
    ): Promise<DesktopResult<readonly AiProviderStatusDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_GET_PROVIDER_STATUS, input),

    healthCheck: (input: AiHealthCheckInput): Promise<DesktopResult<AiProviderStatusDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_HEALTH_CHECK, input),

    generate: (input: AiGenerationRequestDto): Promise<DesktopResult<AiGenerationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_GENERATE, input),

    getConfigDefaults: (): Promise<DesktopResult<AiGenerationConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_CONFIG_GET_DEFAULTS),

    executePrompt: (
      input: AiPromptExecutionInputDto,
    ): Promise<DesktopResult<AiStructuredResultDto<unknown>>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_EXECUTE_PROMPT, input),

    getEmbeddingIndexStatus: (input: {
      readonly projectId: string;
    }): Promise<DesktopResult<EmbeddingIndexStatusDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_EMBEDDING_GET_STATUS, input),

    indexSubjects: (input: IndexSubjectsInputDto): Promise<DesktopResult<IndexSubjectsResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_EMBEDDING_INDEX_SUBJECTS, input),

    searchSimilar: (
      input: VectorSearchQueryDto,
    ): Promise<DesktopResult<readonly VectorMatchDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_EMBEDDING_SEARCH_SIMILAR, input),

    reindexStale: (input: {
      readonly projectId: string;
    }): Promise<DesktopResult<IndexSubjectsResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_EMBEDDING_REINDEX_STALE, input),

    retrieveRequirementContext: (
      input: RetrieveRequirementContextInputDto,
    ): Promise<DesktopResult<RequirementContextPackDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_RAG_RETRIEVE_REQUIREMENT_CONTEXT, input),

    getRagConfigDefaults: (): Promise<DesktopResult<RagRetrievalConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_RAG_GET_CONFIG_DEFAULTS),

    analyzeRequirement: (
      input: AnalyzeRequirementInputDto,
    ): Promise<DesktopResult<RequirementAiAnalysisDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_ANALYSIS_ANALYZE_REQUIREMENT, input),

    getRequirementAnalysis: (
      input: GetRequirementAnalysisInputDto,
    ): Promise<DesktopResult<RequirementAiAnalysisDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_ANALYSIS_GET_CURRENT, input),

    getRequirementAnalysisHistory: (
      input: GetRequirementAnalysisHistoryInputDto,
    ): Promise<DesktopResult<readonly RequirementAiAnalysisDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_ANALYSIS_GET_HISTORY, input),

    regenerateRequirementAnalysis: (
      input: RegenerateRequirementAnalysisInputDto,
    ): Promise<DesktopResult<RequirementAiAnalysisDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AI_ANALYSIS_REGENERATE, input),
  },

  testDesign: {
    analyze: (input: AnalyzeTestDesignInputDto): Promise<DesktopResult<TestDesignPlanDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_DESIGN_ANALYZE, input),

    getCurrent: (input: GetTestDesignInputDto): Promise<DesktopResult<TestDesignPlanDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_DESIGN_GET_CURRENT, input),

    getHistory: (
      input: GetTestDesignHistoryInputDto,
    ): Promise<DesktopResult<readonly TestDesignPlanDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_DESIGN_GET_HISTORY, input),

    regenerate: (input: RegenerateTestDesignInputDto): Promise<DesktopResult<TestDesignPlanDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_DESIGN_REGENERATE, input),
  },

  scenarios: {
    generate: (
      input: GenerateScenariosInputDto,
    ): Promise<DesktopResult<RequirementScenarioGenerationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SCENARIOS_GENERATE, input),

    getCurrent: (
      input: GetRequirementScenariosInputDto,
    ): Promise<DesktopResult<RequirementScenarioGenerationDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SCENARIOS_GET_CURRENT, input),

    getHistory: (
      input: GetRequirementScenariosHistoryInputDto,
    ): Promise<DesktopResult<readonly RequirementScenarioGenerationDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SCENARIOS_GET_HISTORY, input),

    regenerate: (
      input: RegenerateRequirementScenariosInputDto,
    ): Promise<DesktopResult<RequirementScenarioGenerationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SCENARIOS_REGENERATE, input),
  },

  categorizedTests: {
    generate: (
      input: GenerateCategorizedTestsInputDto,
    ): Promise<DesktopResult<CategorizedTestGenerationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.CATEGORIZED_TESTS_GENERATE, input),

    getCurrent: (
      input: GetCategorizedTestsInputDto,
    ): Promise<DesktopResult<CategorizedTestGenerationResultDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.CATEGORIZED_TESTS_GET_CURRENT, input),
  },

  testSpecifications: {
    enrich: (
      input: EnrichTestSpecificationInputDto,
    ): Promise<DesktopResult<TestSpecificationEnrichmentResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_SPECIFICATIONS_ENRICH, input),

    getCurrent: (
      input: GetEnrichedTestSpecificationsInputDto,
    ): Promise<DesktopResult<TestSpecificationEnrichmentResultDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_SPECIFICATIONS_GET_CURRENT, input),
  },

  testCases: {
    create: (input: CreateTestCaseInputDto): Promise<DesktopResult<TestCaseDetailDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_CASES_CREATE, input),

    getById: (input: GetTestCaseByIdInputDto): Promise<DesktopResult<TestCaseDetailDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_CASES_GET_BY_ID, input),

    list: (input: ListTestCasesInputDto): Promise<DesktopResult<TestCaseListResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_CASES_LIST, input),

    persistFromGeneration: (
      input: PersistGeneratedTestCaseInputDto,
    ): Promise<DesktopResult<TestCaseDetailDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_CASES_PERSIST_FROM_GENERATION, input),

    persistBatchFromGeneration: (
      input: PersistGeneratedTestCasesBatchInputDto,
    ): Promise<DesktopResult<BatchPersistTestCasesResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_CASES_PERSIST_BATCH, input),

    delete: (input: DeleteTestCaseInputDto): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_CASES_DELETE, input),
  },

  testValidation: {
    validateTestCase: (
      input: ValidateTestCaseInputDto,
    ): Promise<DesktopResult<TestCaseValidationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_TEST_CASE, input),

    validateSpecification: (
      input: ValidateSpecificationInputDto,
    ): Promise<DesktopResult<TestCaseValidationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_SPECIFICATION, input),

    validateBatch: (
      input: ValidateTestBatchInputDto,
    ): Promise<DesktopResult<BatchValidationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_VALIDATION_VALIDATE_BATCH, input),

    getLatest: (
      input: GetLatestValidationInputDto,
    ): Promise<DesktopResult<TestCaseValidationDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_VALIDATION_GET_LATEST, input),

    listHistory: (
      input: ListValidationHistoryInputDto,
    ): Promise<DesktopResult<readonly TestCaseValidationDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_VALIDATION_LIST_HISTORY, input),
  },

  traceability: {
    createTrace: (
      input: CreateRequirementTestTraceInputDto,
    ): Promise<DesktopResult<RequirementTestTraceDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TRACEABILITY_CREATE_TRACE, input),

    deleteTrace: (
      input: DeleteRequirementTestTraceInputDto,
    ): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TRACEABILITY_DELETE_TRACE, input),

    getById: (
      input: GetTraceByIdInputDto,
    ): Promise<DesktopResult<RequirementTestTraceDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TRACEABILITY_GET_BY_ID, input),

    listByRequirement: (
      input: ListTracesByRequirementInputDto,
    ): Promise<DesktopResult<ListTracesResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TRACEABILITY_LIST_BY_REQUIREMENT, input),

    listByTestCase: (
      input: ListTracesByTestCaseInputDto,
    ): Promise<DesktopResult<ListTracesResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TRACEABILITY_LIST_BY_TEST_CASE, input),

    listProjectTraces: (
      input: ListProjectTracesInputDto,
    ): Promise<DesktopResult<ListTracesResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TRACEABILITY_LIST_PROJECT_TRACES, input),
  },

  coverage: {
    getProjectSummary: (
      input: GetProjectCoverageInputDto,
    ): Promise<DesktopResult<ProjectCoverageSummaryDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.COVERAGE_GET_PROJECT_SUMMARY, input),

    getRequirementCoverage: (
      input: GetRequirementCoverageInputDto,
    ): Promise<DesktopResult<RequirementCoverageDetailDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.COVERAGE_GET_REQUIREMENT_COVERAGE, input),

    getTraceabilityMatrix: (
      input: GetTraceabilityMatrixInputDto,
    ): Promise<DesktopResult<TraceabilityMatrixResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.COVERAGE_GET_TRACEABILITY_MATRIX, input),

    getReverseTraceability: (
      input: GetReverseTraceabilityInputDto,
    ): Promise<DesktopResult<ReverseTraceabilityResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.COVERAGE_GET_REVERSE_TRACEABILITY, input),

    getOrphanTests: (input: GetOrphanTestsInputDto): Promise<DesktopResult<OrphanTestsResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.COVERAGE_GET_ORPHAN_TESTS, input),
  },

  testReview: {
    listQueue: (
      input: ListTestReviewQueueInputDto,
    ): Promise<DesktopResult<TestReviewQueueResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_REVIEW_LIST_QUEUE, input),

    getDetail: (input: GetTestReviewDetailInputDto): Promise<DesktopResult<TestReviewDetailDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_REVIEW_GET_DETAIL, input),

    approve: (input: ApproveTestVersionInputDto): Promise<DesktopResult<TestReviewDetailDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_REVIEW_APPROVE, input),

    reject: (input: RejectTestVersionInputDto): Promise<DesktopResult<TestReviewDetailDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_REVIEW_REJECT, input),

    edit: (input: EditTestCaseInputDto): Promise<DesktopResult<TestReviewDetailDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_REVIEW_EDIT, input),

    regenerate: (input: RegenerateTestCaseInputDto): Promise<DesktopResult<TestReviewDetailDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_REVIEW_REGENERATE, input),

    getHistory: (input: GetTestHistoryInputDto): Promise<DesktopResult<TestHistoryResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_REVIEW_GET_HISTORY, input),

    compareVersions: (
      input: CompareTestVersionsInputDto,
    ): Promise<DesktopResult<TestVersionDiffDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_REVIEW_COMPARE_VERSIONS, input),
  },

  execution: {
    getCapabilities: (): Promise<DesktopResult<ExecutionCapabilitiesDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_GET_CAPABILITIES),

    runRuntimeSmoke: (
      input?: RuntimeSmokeInputDto,
    ): Promise<DesktopResult<RuntimeSmokeResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_RUNTIME_SMOKE, input),

    validateEligibility: (
      input: ValidateTestEligibilityInputDto,
    ): Promise<DesktopResult<TestEligibilityDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_VALIDATE_ELIGIBILITY, input),
  },

  planCompiler: {
    compile: (input: CompileTestPlanInputDto): Promise<DesktopResult<ExecutableTestPlanDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLAN_COMPILER_COMPILE, input),

    get: (input: GetExecutablePlanInputDto): Promise<DesktopResult<ExecutableTestPlanDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLAN_COMPILER_GET, input),

    getByTestCase: (
      input: GetExecutablePlanByTestCaseInputDto,
    ): Promise<DesktopResult<ExecutableTestPlanDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLAN_COMPILER_GET_BY_TEST_CASE, input),

    list: (
      input: ListExecutablePlansInputDto,
    ): Promise<DesktopResult<readonly ExecutableTestPlanDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLAN_COMPILER_LIST, input),

    preview: (input: PreviewTestPlanInputDto): Promise<DesktopResult<ExecutableTestPlanDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLAN_COMPILER_PREVIEW, input),
  },

  testRuns: {
    enqueue: (input: EnqueueTestRunInputDto): Promise<DesktopResult<TestRunDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_RUN_ENQUEUE, input),

    get: (input: GetTestRunInputDto): Promise<DesktopResult<TestRunDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_RUN_GET, input),

    list: (input: ListTestRunsInputDto): Promise<DesktopResult<readonly TestRunDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_RUN_LIST, input),

    cancel: (input: CancelTestRunInputDto): Promise<DesktopResult<TestRunDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_RUN_CANCEL, input),

    getQueueState: (input: {
      readonly projectId: string;
    }): Promise<DesktopResult<TestRunQueueStateDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TEST_RUN_GET_QUEUE_STATE, input),
  },

  authProfiles: {
    create: (input: CreateAuthProfileInputDto): Promise<DesktopResult<AuthProfileDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_PROFILE_CREATE, input),

    get: (input: GetAuthProfileInputDto): Promise<DesktopResult<AuthProfileDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_PROFILE_GET, input),

    list: (input: ListAuthProfilesInputDto): Promise<DesktopResult<readonly AuthProfileDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_PROFILE_LIST, input),

    update: (input: UpdateAuthProfileInputDto): Promise<DesktopResult<AuthProfileDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_PROFILE_UPDATE, input),

    delete: (
      input: DeleteAuthProfileInputDto,
    ): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_PROFILE_DELETE, input),

    validate: (
      input: ValidateAuthProfileInputDto,
    ): Promise<DesktopResult<AuthValidationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_PROFILE_VALIDATE, input),
  },

  actions: {
    executeAction: (input: ExecuteActionInputDto): Promise<DesktopResult<ActionResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_EXECUTE_ACTION, input),

    executeStep: (input: ExecuteStepInputDto): Promise<DesktopResult<StepExecutionResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_EXECUTE_STEP, input),
  },

  locators: {
    resolveLocator: (
      input: ResolveLocatorInputDto,
    ): Promise<DesktopResult<LocatorResolutionResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_RESOLVE_LOCATOR, input),
  },

  synchronization: {
    synchronize: (
      input: SynchronizeStepInputDto,
    ): Promise<DesktopResult<SynchronizationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_SYNCHRONIZE, input),
  },

  assertions: {
    assert: (input: AssertInputDto): Promise<DesktopResult<AssertionResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_ASSERT, input),

    evaluateStepAssertions: (
      input: EvaluateStepAssertionsInputDto,
    ): Promise<DesktopResult<StepAssertionEvaluationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_EVALUATE_ASSERTIONS, input),
  },

  executionHistory: {
    getExecution: (input: GetExecutionInputDto): Promise<DesktopResult<TestCaseExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_HISTORY_GET_EXECUTION, input),

    listExecutions: (
      input: ListExecutionsInputDto,
    ): Promise<
      DesktopResult<{
        readonly items: readonly TestCaseExecutionDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_HISTORY_LIST_EXECUTIONS, input),

    getExecutionSteps: (
      input: GetExecutionStepsInputDto,
    ): Promise<
      DesktopResult<{
        readonly items: readonly StepExecutionRecordDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_HISTORY_GET_STEPS, input),

    getExecutionTimeline: (
      input: GetExecutionAuditTimelineInputDto,
    ): Promise<DesktopResult<ExecutionAuditTimelineDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_HISTORY_GET_TIMELINE, input),

    reconcileOrphaned: (
      input?: ReconcileOrphanedExecutionsInputDto,
    ): Promise<DesktopResult<{ readonly reconciledCount: number }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_HISTORY_RECONCILE, input),

    getAttempts: (
      input: GetExecutionAttemptsInputDto,
    ): Promise<DesktopResult<readonly ExecutionAttemptSummaryDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_GET_ATTEMPTS, input),

    evaluateReliability: (
      input: EvaluateExecutionReliabilityInputDto,
    ): Promise<DesktopResult<ExecutionReliabilityReportDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_EVALUATE_RELIABILITY, input),

    getHealingAttempts: (
      input: GetHealingAttemptsInputDto,
    ): Promise<DesktopResult<readonly LocatorHealingAttemptDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_GET_HEALING_ATTEMPTS, input),

    listHealingSuggestions: (
      input: ListHealingSuggestionsInputDto,
    ): Promise<DesktopResult<readonly LocatorHealingSuggestionDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_LIST_HEALING_SUGGESTIONS, input),

    reviewHealingSuggestion: (
      input: ReviewHealingSuggestionInputDto,
    ): Promise<DesktopResult<LocatorHealingSuggestionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_REVIEW_HEALING_SUGGESTION, input),
  },

  executionPool: {
    getPoolState: (
      input?: GetParallelPoolStateInputDto,
    ): Promise<DesktopResult<ParallelWorkerPoolStateDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EXECUTION_GET_PARALLEL_POOL_STATE, input),
  },

  evidence: {
    createBundle: (
      input: CreateEvidenceBundleInputDto,
    ): Promise<DesktopResult<ExecutionEvidenceBundleDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EVIDENCE_CREATE_BUNDLE, input),

    addArtifact: (
      input: AddEvidenceArtifactInputDto,
    ): Promise<DesktopResult<ExecutionEvidenceArtifactDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EVIDENCE_ADD_ARTIFACT, input),

    finalizeBundle: (
      input: FinalizeEvidenceBundleInputDto,
    ): Promise<DesktopResult<ExecutionEvidenceBundleDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EVIDENCE_FINALIZE_BUNDLE, input),

    getBundle: (
      input: GetEvidenceBundleInputDto,
    ): Promise<DesktopResult<ExecutionEvidenceBundleDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EVIDENCE_GET_BUNDLE, input),

    listBundles: (
      input: ListEvidenceBundlesInputDto,
    ): Promise<
      DesktopResult<{
        readonly items: readonly ExecutionEvidenceBundleDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.EVIDENCE_LIST_BUNDLES, input),

    listArtifacts: (
      input: ListEvidenceArtifactsInputDto,
    ): Promise<
      DesktopResult<{
        readonly items: readonly ExecutionEvidenceArtifactDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.EVIDENCE_LIST_ARTIFACTS, input),

    getArtifactMetadata: (
      input: GetEvidenceArtifactMetadataInputDto,
    ): Promise<DesktopResult<ExecutionEvidenceArtifactDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EVIDENCE_GET_ARTIFACT_METADATA, input),

    getArtifactContent: (
      input: GetEvidenceArtifactContentInputDto,
    ): Promise<DesktopResult<EvidenceArtifactContentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EVIDENCE_GET_ARTIFACT_CONTENT, input),

    verifyIntegrity: (
      input: VerifyEvidenceArtifactIntegrityInputDto,
    ): Promise<
      DesktopResult<{
        readonly isValid: boolean;
        readonly expectedSha256: string;
        readonly actualSha256: string;
        readonly byteSize: number;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.EVIDENCE_VERIFY_INTEGRITY, input),
  },

  logging: {
    reportRendererError: (
      report: RendererErrorReport,
    ): Promise<DesktopResult<RendererErrorReportResult>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOGGING_REPORT_RENDERER_ERROR, report),
  },

  failures: {
    createCase: (input: CreateFailureCaseInputDto): Promise<DesktopResult<FailureCaseDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_CREATE_CASE, input),

    ensureCase: (input: EnsureFailureCaseInputDto): Promise<DesktopResult<FailureCaseDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_ENSURE_CASE, input),

    getCase: (input: GetFailureCaseInputDto): Promise<DesktopResult<FailureCaseDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_CASE, input),

    listCases: (
      input: ListFailureCasesInputDto,
    ): Promise<
      DesktopResult<{
        readonly items: readonly FailureCaseDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_CASES, input),

    startAnalysis: (
      input: StartFailureAnalysisInputDto,
    ): Promise<DesktopResult<FailureAnalysisRunDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_START_ANALYSIS, input),

    completeAnalysis: (
      input: CompleteFailureAnalysisInputDto,
    ): Promise<DesktopResult<FailureAnalysisRunDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_COMPLETE_ANALYSIS, input),

    failAnalysis: (
      input: FailFailureAnalysisInputDto,
    ): Promise<DesktopResult<FailureAnalysisRunDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_FAIL_ANALYSIS, input),

    cancelAnalysis: (
      input: CancelFailureAnalysisInputDto,
    ): Promise<DesktopResult<FailureCaseDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_CANCEL_ANALYSIS, input),

    markStale: (input: MarkFailureCaseStaleInputDto): Promise<DesktopResult<FailureCaseDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_MARK_STALE, input),

    listRuns: (
      input: ListFailureAnalysisRunsInputDto,
    ): Promise<DesktopResult<readonly FailureAnalysisRunDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_RUNS, input),

    listEvidenceReferences: (
      input: ListFailureEvidenceReferencesInputDto,
    ): Promise<DesktopResult<readonly FailureEvidenceReferenceDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_EVIDENCE_REFERENCES, input),

    ingestEvidence: (
      input: IngestFailureEvidenceInputDto,
    ): Promise<DesktopResult<FailureEvidencePackageDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_INGEST_EVIDENCE, input),

    getEvidencePackage: (
      input: GetFailureEvidencePackageInputDto,
    ): Promise<DesktopResult<FailureEvidencePackageDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_EVIDENCE_PACKAGE, input),

    verifyEvidenceIntegrity: (
      input: VerifyEvidenceIntegrityInputDto,
    ): Promise<DesktopResult<FailureEvidenceIntegrityReportDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_VERIFY_EVIDENCE_INTEGRITY, input),

    getEvidenceArtifactContent: (
      input: GetFailureEvidenceArtifactContentInputDto,
    ): Promise<DesktopResult<FailureEvidenceArtifactContentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_EVIDENCE_ARTIFACT_CONTENT, input),

    executeReproduction: (
      input: ExecuteReproductionInputDto,
    ): Promise<DesktopResult<ReproducibilitySummaryDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_EXECUTE_REPRODUCTION, input),

    getReproductionAttempts: (
      input: GetReproductionAttemptsInputDto,
    ): Promise<DesktopResult<readonly FailureReproductionAttemptDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_REPRODUCTION_ATTEMPTS, input),

    getReproducibilitySummary: (
      input: GetReproducibilitySummaryInputDto,
    ): Promise<DesktopResult<ReproducibilitySummaryDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_REPRODUCIBILITY_SUMMARY, input),

    cancelReproduction: (
      input: CancelReproductionInputDto,
    ): Promise<DesktopResult<{ readonly cancelled: boolean }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_CANCEL_REPRODUCTION, input),

    classify: (input: ClassifyFailureInputDto): Promise<DesktopResult<FailureClassificationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_CLASSIFY, input),

    getClassification: (
      input: GetFailureClassificationInputDto,
    ): Promise<DesktopResult<FailureClassificationDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_CLASSIFICATION, input),

    reclassify: (
      input: ReclassifyFailureInputDto,
    ): Promise<DesktopResult<FailureClassificationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_RECLASSIFY, input),

    listClassificationHistory: (
      input: ListFailureClassificationsInputDto,
    ): Promise<DesktopResult<readonly FailureClassificationDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_CLASSIFICATION_HISTORY, input),

    evaluateDecisionIntegrity: (
      input: EvaluateDecisionIntegrityInputDto,
    ): Promise<DesktopResult<ClassificationDecisionIntegrityDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_EVALUATE_DECISION_INTEGRITY, input),

    getDecisionIntegrity: (
      input: GetDecisionIntegrityInputDto,
    ): Promise<DesktopResult<ClassificationDecisionIntegrityDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_DECISION_INTEGRITY, input),

    recomputeDecisionIntegrity: (
      input: RecomputeDecisionIntegrityInputDto,
    ): Promise<DesktopResult<ClassificationDecisionIntegrityDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_RECOMPUTE_DECISION_INTEGRITY, input),

    listDecisionIntegrityHistory: (
      input: ListDecisionIntegrityHistoryInputDto,
    ): Promise<DesktopResult<readonly ClassificationDecisionIntegrityDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_DECISION_INTEGRITY_HISTORY, input),

    analyzeFlakiness: (
      input: AnalyzeFlakinessInputDto,
    ): Promise<DesktopResult<FlakinessAnalysisDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_ANALYZE_FLAKINESS, input),

    getFlakinessAnalysis: (
      input: GetFlakinessAnalysisInputDto,
    ): Promise<DesktopResult<FlakinessAnalysisDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_FLAKINESS_ANALYSIS, input),

    reanalyzeFlakiness: (
      input: ReanalyzeFlakinessInputDto,
    ): Promise<DesktopResult<FlakinessAnalysisDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_REANALYZE_FLAKINESS, input),

    listFlakinessHistory: (
      input: ListFlakinessHistoryInputDto,
    ): Promise<DesktopResult<readonly FlakinessAnalysisDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_FLAKINESS_HISTORY, input),

    separateFailureDomain: (
      input: SeparateFailureDomainInputDto,
    ): Promise<DesktopResult<FailureDomainSeparationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_SEPARATE_FAILURE_DOMAIN, input),

    getDomainSeparation: (
      input: GetDomainSeparationInputDto,
    ): Promise<DesktopResult<FailureDomainSeparationDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_DOMAIN_SEPARATION, input),

    reevaluateDomainSeparation: (
      input: ReevaluateDomainSeparationInputDto,
    ): Promise<DesktopResult<FailureDomainSeparationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_REEVALUATE_DOMAIN_SEPARATION, input),

    listDomainSeparationHistory: (
      input: ListDomainSeparationHistoryInputDto,
    ): Promise<DesktopResult<readonly FailureDomainSeparationDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_DOMAIN_SEPARATION_HISTORY, input),

    localizeTechnicalCause: (
      input: LocalizeTechnicalCauseInputDto,
    ): Promise<DesktopResult<FailureTechnicalLocalizationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LOCALIZE_TECHNICAL_CAUSE, input),

    getTechnicalLocalization: (
      input: GetTechnicalLocalizationInputDto,
    ): Promise<DesktopResult<FailureTechnicalLocalizationDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_TECHNICAL_LOCALIZATION, input),

    relocalizeTechnicalCause: (
      input: RelocalizeTechnicalCauseInputDto,
    ): Promise<DesktopResult<FailureTechnicalLocalizationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_RELOCALIZE_TECHNICAL_CAUSE, input),

    listLocalizationHistory: (
      input: ListLocalizationHistoryInputDto,
    ): Promise<DesktopResult<readonly FailureTechnicalLocalizationDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_LOCALIZATION_HISTORY, input),

    assessWithAi: (
      input: AssessFailureWithAiInputDto,
    ): Promise<DesktopResult<FailureAiAssessmentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_ASSESS_WITH_AI, input),

    getAiAssessment: (
      input: GetFailureAiAssessmentInputDto,
    ): Promise<DesktopResult<FailureAiAssessmentDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_AI_ASSESSMENT, input),

    reassessWithAi: (
      input: ReassessFailureWithAiInputDto,
    ): Promise<DesktopResult<FailureAiAssessmentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_REASSESS_WITH_AI, input),

    listAiAssessmentHistory: (
      input: ListFailureAiAssessmentHistoryInputDto,
    ): Promise<DesktopResult<readonly FailureAiAssessmentDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_AI_ASSESSMENT_HISTORY, input),

    analyzeRootCause: (
      input: AnalyzeRootCauseInputDto,
    ): Promise<DesktopResult<FailureRootCauseAnalysisDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_ANALYZE_ROOT_CAUSE, input),

    getRootCauseAnalysis: (
      input: GetRootCauseAnalysisInputDto,
    ): Promise<DesktopResult<FailureRootCauseAnalysisDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_ROOT_CAUSE_ANALYSIS, input),

    reanalyzeRootCause: (
      input: ReanalyzeRootCauseInputDto,
    ): Promise<DesktopResult<FailureRootCauseAnalysisDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_REANALYZE_ROOT_CAUSE, input),

    listRootCauseHistory: (
      input: ListRootCauseHistoryInputDto,
    ): Promise<DesktopResult<readonly FailureRootCauseAnalysisDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_ROOT_CAUSE_HISTORY, input),

    assessImpact: (
      input: AssessImpactInputDto,
    ): Promise<DesktopResult<FailureImpactAssessmentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_ASSESS_IMPACT, input),

    getImpactAssessment: (
      input: GetImpactAssessmentInputDto,
    ): Promise<DesktopResult<FailureImpactAssessmentDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_IMPACT_ASSESSMENT, input),

    reassessImpact: (
      input: ReassessImpactInputDto,
    ): Promise<DesktopResult<FailureImpactAssessmentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_REASSESS_IMPACT, input),

    listImpactHistory: (
      input: ListImpactHistoryInputDto,
    ): Promise<DesktopResult<readonly FailureImpactAssessmentDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_IMPACT_HISTORY, input),

    compareDuplicates: (
      input: CompareDuplicatesInputDto,
    ): Promise<DesktopResult<DuplicateComparisonResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_COMPARE_DUPLICATE, input),

    clusterDefects: (
      input: ClusterDefectsInputDto,
    ): Promise<DesktopResult<readonly DefectClusterDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_CLUSTER_DEFECTS, input),

    getCluster: (input: GetClusterInputDto): Promise<DesktopResult<DefectClusterDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_CLUSTER, input),

    listClusters: (
      input: ListClustersInputDto,
    ): Promise<DesktopResult<readonly DefectClusterDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_CLUSTERS, input),

    getFailureMembership: (
      input: GetFailureMembershipInputDto,
    ): Promise<DesktopResult<DefectClusterMembershipDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_FAILURE_MEMBERSHIP, input),

    mergeClusters: (input: MergeClustersInputDto): Promise<DesktopResult<DefectClusterDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_MERGE_CLUSTERS, input),

    splitCluster: (
      input: SplitClusterInputDto,
    ): Promise<
      DesktopResult<{
        readonly remainingCluster: DefectClusterDto;
        readonly newCluster: DefectClusterDto;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_SPLIT_CLUSTER, input),

    overrideMembership: (
      input: OverrideMembershipInputDto,
    ): Promise<DesktopResult<DefectClusterMembershipDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_OVERRIDE_MEMBERSHIP, input),

    listClusterHistory: (
      input: ListClusterHistoryInputDto,
    ): Promise<DesktopResult<readonly DefectClusterHistoryDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_CLUSTER_HISTORY, input),

    assessConfidence: (
      input: AssessConfidenceInputDto,
    ): Promise<DesktopResult<ConfidenceAssessmentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_ASSESS_CONFIDENCE, input),

    getConfidence: (
      input: GetConfidenceInputDto,
    ): Promise<DesktopResult<ConfidenceAssessmentDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_CONFIDENCE, input),

    reassessConfidence: (
      input: ReassessConfidenceInputDto,
    ): Promise<DesktopResult<ConfidenceAssessmentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_REASSESS_CONFIDENCE, input),

    listConfidenceHistory: (
      input: ListConfidenceHistoryInputDto,
    ): Promise<DesktopResult<readonly ConfidenceAssessmentDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_CONFIDENCE_HISTORY, input),

    listEvidenceAttributions: (
      input: ListEvidenceAttributionsInputDto,
    ): Promise<DesktopResult<readonly EvidenceAttributionDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_EVIDENCE_ATTRIBUTIONS, input),

    createBugReport: (
      input: CreateBugReportInputDto,
    ): Promise<DesktopResult<StructuredBugReportDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_CREATE_BUG_REPORT, input),

    getBugReport: (
      input: GetBugReportInputDto,
    ): Promise<DesktopResult<StructuredBugReportDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_GET_BUG_REPORT, input),

    listBugReports: (
      input: ListBugReportsInputDto,
    ): Promise<
      DesktopResult<{
        readonly items: readonly StructuredBugReportDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_BUG_REPORTS, input),

    regenerateBugReport: (
      input: RegenerateBugReportInputDto,
    ): Promise<DesktopResult<StructuredBugReportDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_REGENERATE_BUG_REPORT, input),

    listBugReportHistory: (
      input: ListBugReportHistoryInputDto,
    ): Promise<DesktopResult<readonly StructuredBugReportDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FAILURES_LIST_BUG_REPORT_HISTORY, input),
  },

  jira: {
    createConnection: (
      input: CreateJiraConnectionInputDto,
    ): Promise<DesktopResult<JiraConnectionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_CREATE_CONNECTION, input),

    updateConnection: (
      input: UpdateJiraConnectionInputDto,
    ): Promise<DesktopResult<JiraConnectionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_UPDATE_CONNECTION, input),

    getConnection: (
      input: GetJiraConnectionInputDto,
    ): Promise<DesktopResult<JiraConnectionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_GET_CONNECTION, input),

    deleteConnection: (
      input: DeleteJiraConnectionInputDto,
    ): Promise<DesktopResult<{ readonly deleted: boolean }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_DELETE_CONNECTION, input),

    validateConnection: (
      input: ValidateJiraConnectionInputDto,
    ): Promise<DesktopResult<JiraValidationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_VALIDATE_CONNECTION, input),

    listAuditLog: (
      input: ListJiraAuditLogInputDto,
    ): Promise<DesktopResult<readonly JiraConnectionAuditDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_LIST_AUDIT_LOG, input),

    discoverSites: (
      input: DiscoverJiraSitesInputDto,
    ): Promise<DesktopResult<readonly JiraDiscoveredSiteDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_DISCOVER_SITES, input),

    discoverProjects: (
      input: DiscoverJiraProjectsInputDto,
    ): Promise<DesktopResult<readonly JiraDiscoveredProjectDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_DISCOVER_PROJECTS, input),

    discoverIssueTypes: (
      input: DiscoverJiraIssueTypesInputDto,
    ): Promise<DesktopResult<readonly JiraDiscoveredIssueTypeDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_DISCOVER_ISSUE_TYPES, input),

    discoverPriorities: (
      input: DiscoverJiraPrioritiesInputDto,
    ): Promise<DesktopResult<readonly JiraDiscoveredPriorityDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_DISCOVER_PRIORITIES, input),

    discoverFields: (
      input: DiscoverJiraFieldsInputDto,
    ): Promise<DesktopResult<readonly JiraDiscoveredFieldDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_DISCOVER_FIELDS, input),

    discoverComponents: (
      input: DiscoverJiraComponentsInputDto,
    ): Promise<DesktopResult<readonly JiraDiscoveredComponentDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_DISCOVER_COMPONENTS, input),

    discoverAssignees: (
      input: DiscoverJiraAssigneesInputDto,
    ): Promise<DesktopResult<readonly JiraDiscoveredAssigneeDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_DISCOVER_ASSIGNEES, input),

    getProjectConfig: (
      input: GetJiraProjectConfigInputDto,
    ): Promise<DesktopResult<JiraProjectConfigDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_GET_PROJECT_CONFIG, input),

    saveProjectConfig: (
      input: SaveJiraProjectConfigInputDto,
    ): Promise<DesktopResult<JiraProjectConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_SAVE_PROJECT_CONFIG, input),

    refreshProjectConfig: (
      input: RefreshJiraProjectConfigInputDto,
    ): Promise<DesktopResult<JiraProjectConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_REFRESH_PROJECT_CONFIG, input),

    testConnectionHealth: (
      input: TestJiraConnectionHealthInputDto,
    ): Promise<DesktopResult<JiraHealthCheckResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_TEST_CONNECTION_HEALTH, input),

    createIssue: (input: CreateJiraIssueInputDto): Promise<DesktopResult<JiraExternalIssueDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_CREATE_ISSUE, input),

    getIssue: (input: GetJiraIssueInputDto): Promise<DesktopResult<JiraExternalIssueDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_GET_ISSUE, input),

    listAttachableEvidence: (
      input: ListAttachableEvidenceInputDto,
    ): Promise<DesktopResult<readonly JiraAttachableEvidenceItemDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_LIST_ATTACHABLE_EVIDENCE, input),

    attachEvidence: (
      input: AttachEvidenceInputDto,
    ): Promise<DesktopResult<JiraAttachmentBatchResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_ATTACH_EVIDENCE, input),

    getAttachmentStatus: (
      input: GetAttachmentStatusInputDto,
    ): Promise<DesktopResult<readonly JiraEvidenceAttachmentDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_GET_ATTACHMENT_STATUS, input),

    evaluateDuplicate: (
      input: EvaluateDuplicateInputDto,
    ): Promise<DesktopResult<JiraDuplicateEvaluationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_EVALUATE_DUPLICATE, input),

    linkExistingIssue: (
      input: LinkExistingIssueInputDto,
    ): Promise<DesktopResult<JiraIssueLinkDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_LINK_EXISTING_ISSUE, input),

    getIssueLink: (input: GetIssueLinkInputDto): Promise<DesktopResult<JiraIssueLinkDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_GET_ISSUE_LINK, input),

    registerProjectEngineer: (
      input: RegisterProjectEngineerInputDto,
    ): Promise<DesktopResult<ProjectEngineerDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_REGISTER_PROJECT_ENGINEER, input),

    listEligibleEngineers: (
      input: ListEligibleEngineersInputDto,
    ): Promise<DesktopResult<readonly ProjectEngineerDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_LIST_ELIGIBLE_ENGINEERS, input),

    getDefectOwnership: (
      input: GetDefectOwnershipInputDto,
    ): Promise<DesktopResult<DefectOwnershipDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_GET_DEFECT_OWNERSHIP, input),

    assignEngineer: (input: AssignEngineerInputDto): Promise<DesktopResult<DefectOwnershipDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_ASSIGN_ENGINEER, input),

    unassignEngineer: (
      input: UnassignEngineerInputDto,
    ): Promise<DesktopResult<DefectOwnershipDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_UNASSIGN_ENGINEER, input),

    syncOwnershipFromJira: (
      input: SyncOwnershipFromJiraInputDto,
    ): Promise<DesktopResult<DefectOwnershipDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_SYNC_OWNERSHIP_FROM_JIRA, input),

    retryJiraSync: (input: RetryJiraSyncInputDto): Promise<DesktopResult<DefectOwnershipDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.JIRA_RETRY_JIRA_SYNC, input),
  },

  email: {
    getConfig: (input: {
      readonly projectId: string;
    }): Promise<DesktopResult<ProjectEmailConfigDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EMAIL_GET_CONFIG, input),

    saveConfig: (
      input: SaveProjectEmailConfigInputDto,
    ): Promise<DesktopResult<ProjectEmailConfigDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EMAIL_SAVE_CONFIG, input),

    testConnection: (
      input: TestEmailConnectionInputDto,
    ): Promise<DesktopResult<TestEmailConnectionResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EMAIL_TEST_CONNECTION, input),

    listNotifications: (
      input: ListEmailNotificationsInputDto,
    ): Promise<
      DesktopResult<{
        readonly items: readonly EmailNotificationDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.EMAIL_LIST_NOTIFICATIONS, input),

    getNotification: (
      input: GetEmailNotificationInputDto,
    ): Promise<DesktopResult<EmailNotificationDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EMAIL_GET_NOTIFICATION, input),

    retryNotification: (
      input: RetryEmailNotificationInputDto,
    ): Promise<DesktopResult<EmailNotificationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EMAIL_RETRY_NOTIFICATION, input),

    sendWorkflowNotification: (
      input: SendWorkflowNotificationInputDto,
    ): Promise<DesktopResult<readonly EmailNotificationDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.EMAIL_SEND_WORKFLOW_NOTIFICATION, input),
  },

  workflow: {
    getState: (input: GetWorkflowStateInputDto): Promise<DesktopResult<BugWorkflowStateDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKFLOW_GET_STATE, input),

    updateInternalStatus: (
      input: UpdateInternalStatusInputDto,
    ): Promise<DesktopResult<BugWorkflowStateDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKFLOW_UPDATE_INTERNAL_STATUS, input),

    getStatusMappings: (
      input: GetWorkflowStatusMappingsInputDto,
    ): Promise<DesktopResult<readonly WorkflowStatusMappingDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKFLOW_GET_STATUS_MAPPINGS, input),

    saveStatusMapping: (
      input: SaveWorkflowStatusMappingInputDto,
    ): Promise<DesktopResult<WorkflowStatusMappingDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKFLOW_SAVE_STATUS_MAPPING, input),

    deleteStatusMapping: (
      input: DeleteWorkflowStatusMappingInputDto,
    ): Promise<DesktopResult<{ readonly deleted: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKFLOW_DELETE_STATUS_MAPPING, input),

    syncNow: (input: SyncWorkflowNowInputDto): Promise<DesktopResult<BugWorkflowStateDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKFLOW_SYNC_NOW, input),

    resolveConflict: (
      input: ResolveWorkflowConflictInputDto,
    ): Promise<DesktopResult<BugWorkflowStateDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKFLOW_RESOLVE_CONFLICT, input),

    listSyncEvents: (
      input: ListWorkflowSyncEventsInputDto,
    ): Promise<
      DesktopResult<{
        readonly items: readonly WorkflowSyncEventDto[];
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
      }>
    > => ipcRenderer.invoke(DESKTOP_CHANNELS.WORKFLOW_LIST_SYNC_EVENTS, input),
  },

  reverification: {
    getState: (
      input: GetReverificationStateInputDto,
    ): Promise<DesktopResult<DefectReverificationDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REVERIFICATION_GET_STATE, input),

    evaluateEligibility: (
      input: EvaluateReverificationEligibilityInputDto,
    ): Promise<DesktopResult<EvaluateReverificationEligibilityOutputDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REVERIFICATION_EVALUATE_ELIGIBILITY, input),

    createRequest: (
      input: CreateReverificationRequestInputDto,
    ): Promise<DesktopResult<DefectReverificationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REVERIFICATION_CREATE_REQUEST, input),

    generatePlan: (
      input: GenerateReverificationPlanInputDto,
    ): Promise<DesktopResult<DefectReverificationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REVERIFICATION_GENERATE_PLAN, input),

    cancel: (
      input: CancelReverificationInputDto,
    ): Promise<DesktopResult<DefectReverificationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REVERIFICATION_CANCEL, input),

    listAuditEvents: (
      input: ListReverificationAuditEventsInputDto,
    ): Promise<DesktopResult<readonly ReverificationAuditEventDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REVERIFICATION_LIST_AUDIT_EVENTS, input),
  },

  verification: {
    execute: (input: ExecuteVerificationInputDto): Promise<DesktopResult<VerificationSummaryDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.VERIFICATION_EXECUTE, input),

    getAttempts: (
      input: GetVerificationAttemptsInputDto,
    ): Promise<DesktopResult<readonly DefectVerificationAttemptDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.VERIFICATION_GET_ATTEMPTS, input),

    getComparison: (
      input: GetVerificationComparisonInputDto,
    ): Promise<DesktopResult<DefectVerificationAttemptDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.VERIFICATION_GET_COMPARISON, input),

    cancel: (
      input: CancelVerificationInputDto,
    ): Promise<DesktopResult<{ readonly cancelled: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.VERIFICATION_CANCEL, input),
  },

  quickFix: {
    evaluateEligibility: (
      input: EvaluateQuickFixEligibilityInputDto,
    ): Promise<DesktopResult<QuickFixEligibilityAssessmentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.QUICK_FIX_EVALUATE_ELIGIBILITY, input),

    getAssessment: (
      input: GetQuickFixAssessmentInputDto,
    ): Promise<DesktopResult<QuickFixEligibilityAssessmentDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.QUICK_FIX_GET_ASSESSMENT, input),

    listAssessments: (
      input: ListQuickFixAssessmentsInputDto,
    ): Promise<DesktopResult<readonly QuickFixEligibilityAssessmentDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.QUICK_FIX_LIST_ASSESSMENTS, input),
  },

  defectLocalization: {
    localize: (
      input: LocalizeDefectInputDto,
    ): Promise<DesktopResult<RepositoryDefectLocalizationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.DEFECT_LOCALIZATION_LOCALIZE, input),

    getLocalization: (
      input: GetDefectLocalizationInputDto,
    ): Promise<DesktopResult<RepositoryDefectLocalizationDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.DEFECT_LOCALIZATION_GET, input),

    listLocalizations: (
      input: ListDefectLocalizationsInputDto,
    ): Promise<DesktopResult<readonly RepositoryDefectLocalizationDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.DEFECT_LOCALIZATION_LIST, input),

    inspectCandidateSource: (
      input: InspectCandidateSourceInputDto,
    ): Promise<DesktopResult<CandidateSourceContentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.DEFECT_LOCALIZATION_INSPECT_SOURCE, input),
  },

  patchProposal: {
    generate: (
      input: GeneratePatchProposalInputDto,
    ): Promise<DesktopResult<DefectPatchProposalDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_PROPOSAL_GENERATE, input),

    get: (input: GetPatchProposalInputDto): Promise<DesktopResult<DefectPatchProposalDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_PROPOSAL_GET, input),

    list: (
      input: ListPatchProposalsInputDto,
    ): Promise<DesktopResult<readonly DefectPatchProposalDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_PROPOSAL_LIST, input),

    withdraw: (
      input: WithdrawPatchProposalInputDto,
    ): Promise<DesktopResult<DefectPatchProposalDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_PROPOSAL_WITHDRAW, input),
  },

  patchSandbox: {
    create: (input: CreatePatchSandboxInputDto): Promise<DesktopResult<DefectPatchSandboxDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_SANDBOX_CREATE, input),

    apply: (input: ApplyPatchToSandboxInputDto): Promise<DesktopResult<DefectPatchSandboxDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_SANDBOX_APPLY, input),

    get: (input: GetPatchSandboxInputDto): Promise<DesktopResult<DefectPatchSandboxDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_SANDBOX_GET, input),

    list: (
      input: ListPatchSandboxesInputDto,
    ): Promise<DesktopResult<readonly DefectPatchSandboxDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_SANDBOX_LIST, input),

    destroy: (input: DestroyPatchSandboxInputDto): Promise<DesktopResult<DefectPatchSandboxDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_SANDBOX_DESTROY, input),
  },

  patchValidation: {
    execute: (
      input: ExecutePatchValidationInputDto,
    ): Promise<DesktopResult<DefectPatchValidationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_VALIDATION_EXECUTE, input),

    get: (
      input: GetPatchValidationInputDto,
    ): Promise<DesktopResult<DefectPatchValidationDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_VALIDATION_GET, input),

    list: (
      input: ListPatchValidationsInputDto,
    ): Promise<DesktopResult<readonly DefectPatchValidationDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_VALIDATION_LIST, input),

    cancel: (
      input: CancelPatchValidationInputDto,
    ): Promise<DesktopResult<DefectPatchValidationDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_VALIDATION_CANCEL, input),
  },

  patchApproval: {
    get: (input: GetPatchApprovalInputDto): Promise<DesktopResult<DefectPatchApprovalDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_APPROVAL_GET, input),

    list: (
      input: ListPatchApprovalsInputDto,
    ): Promise<DesktopResult<readonly DefectPatchApprovalDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_APPROVAL_LIST, input),

    approve: (input: ApprovePatchInputDto): Promise<DesktopResult<DefectPatchApprovalDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_APPROVAL_APPROVE, input),

    reject: (input: RejectPatchInputDto): Promise<DesktopResult<DefectPatchApprovalDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_APPROVAL_REJECT, input),

    apply: (input: ApplyPatchInputDto): Promise<DesktopResult<DefectPatchApprovalDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_APPROVAL_APPLY, input),
  },

  repairPatch: {
    propose: (
      input: RepairPatchProposeInputDto,
    ): Promise<DesktopResult<RepairPatchToolOutputDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPAIR_PATCH_PROPOSE, input),

    get: (input: RepairPatchGetInputDto): Promise<DesktopResult<RepairPatchToolOutputDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPAIR_PATCH_GET, input),

    approve: (
      input: RepairPatchApproveInputDto,
    ): Promise<DesktopResult<RepairPatchToolOutputDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPAIR_PATCH_APPROVE, input),

    reject: (input: RepairPatchRejectInputDto): Promise<DesktopResult<RepairPatchToolOutputDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPAIR_PATCH_REJECT, input),

    cancel: (input: RepairPatchCancelInputDto): Promise<DesktopResult<RepairPatchToolOutputDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPAIR_PATCH_CANCEL, input),

    apply: (input: RepairPatchApplyInputDto): Promise<DesktopResult<RepairPatchToolOutputDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.REPAIR_PATCH_APPLY, input),
  },

  gitReview: {
    getStatus: (input: GitDiffGetStatusInputDto): Promise<DesktopResult<GitWorkingStatusDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.GIT_DIFF_GET_STATUS, input),

    getDiff: (input: GitDiffGetInputDto): Promise<DesktopResult<GitDiffResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.GIT_DIFF_GET, input),

    createReview: (
      input: CreateGitChangeReviewInputDto,
    ): Promise<DesktopResult<AgentGitChangeReviewDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_CREATE, input),

    getReview: (
      input: GetGitChangeReviewInputDto,
    ): Promise<DesktopResult<AgentGitChangeReviewDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_GET, input),

    approveReview: (
      input: ApproveGitChangeReviewInputDto,
    ): Promise<DesktopResult<AgentGitChangeReviewDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_APPROVE, input),

    rejectReview: (
      input: RejectGitChangeReviewInputDto,
    ): Promise<DesktopResult<AgentGitChangeReviewDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.GIT_CHANGE_REVIEW_REJECT, input),
  },

  terminal: {
    execute: (input: TerminalExecuteInputDto): Promise<DesktopResult<AgentTerminalExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TERMINAL_EXECUTE, input),

    getExecution: (
      input: GetTerminalExecutionInputDto,
    ): Promise<DesktopResult<AgentTerminalExecutionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TERMINAL_GET_EXECUTION, input),

    listExecutions: (
      input: ListTerminalExecutionsInputDto,
    ): Promise<DesktopResult<readonly AgentTerminalExecutionDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TERMINAL_LIST_EXECUTIONS, input),

    approve: (
      input: ApproveTerminalExecutionInputDto,
    ): Promise<DesktopResult<AgentTerminalExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TERMINAL_APPROVE, input),

    reject: (
      input: RejectTerminalExecutionInputDto,
    ): Promise<DesktopResult<AgentTerminalExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TERMINAL_REJECT, input),

    cancel: (
      input: CancelTerminalExecutionInputDto,
    ): Promise<DesktopResult<AgentTerminalExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.TERMINAL_CANCEL, input),
  },

  planner: {
    createPlan: (input: CreateAgentPlanInputDto): Promise<DesktopResult<AgentPlanExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLANNER_CREATE_PLAN, input),

    getPlan: (input: GetAgentPlanInputDto): Promise<DesktopResult<AgentPlanExecutionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLANNER_GET_PLAN, input),

    listPlans: (
      input: ListAgentPlansInputDto,
    ): Promise<DesktopResult<readonly AgentPlanExecutionDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLANNER_LIST_PLANS, input),

    getActivePlan: (
      input: GetActiveAgentPlanInputDto,
    ): Promise<DesktopResult<AgentPlanExecutionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLANNER_GET_ACTIVE_PLAN, input),

    addStep: (input: AddAgentPlanStepInputDto): Promise<DesktopResult<AgentPlanExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLANNER_ADD_STEP, input),

    removeStep: (
      input: RemoveAgentPlanStepInputDto,
    ): Promise<DesktopResult<AgentPlanExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLANNER_REMOVE_STEP, input),

    reorderSteps: (
      input: ReorderAgentPlanStepsInputDto,
    ): Promise<DesktopResult<AgentPlanExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLANNER_REORDER_STEPS, input),

    modifyStep: (
      input: ModifyAgentPlanStepInputDto,
    ): Promise<DesktopResult<AgentPlanExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLANNER_MODIFY_STEP, input),

    setStepStatus: (
      input: SetAgentPlanStepStatusInputDto,
    ): Promise<DesktopResult<AgentPlanExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLANNER_SET_STEP_STATUS, input),

    setPlanStatus: (
      input: SetAgentPlanStatusInputDto,
    ): Promise<DesktopResult<AgentPlanExecutionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PLANNER_SET_PLAN_STATUS, input),
  },

  agentLoop: {
    start: (input: StartAgentLoopInputDto): Promise<DesktopResult<AgentLoopRunResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_LOOP_START, input),

    resume: (input: ResumeAgentLoopInputDto): Promise<DesktopResult<AgentLoopRunResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_LOOP_RESUME, input),

    cancel: (input: CancelAgentLoopInputDto): Promise<DesktopResult<AgentLoopRunResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_LOOP_CANCEL, input),

    getStatus: (
      input: GetAgentLoopStatusInputDto,
    ): Promise<DesktopResult<AgentLoopStateDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_LOOP_GET_STATUS, input),
  },

  agentActivity: {
    subscribe: async (
      input: SubscribeAgentActivityInputDto,
      onEvent: (event: AgentActivityEventDto) => void,
    ): Promise<DesktopResult<{ readonly subscribed: true }>> => {
      const listener = (_e: unknown, activityEvent: AgentActivityEventDto) => {
        if (activityEvent && activityEvent.taskId === input.taskId) {
          onEvent(activityEvent);
        }
      };
      ipcRenderer.on(DESKTOP_CHANNELS.AGENT_ACTIVITY_EVENT, listener);

      const res = (await ipcRenderer.invoke(
        DESKTOP_CHANNELS.AGENT_ACTIVITY_SUBSCRIBE,
        input,
      )) as DesktopResult<{ readonly subscribed: true }>;

      if (!res.ok) {
        ipcRenderer.removeListener(DESKTOP_CHANNELS.AGENT_ACTIVITY_EVENT, listener);
      }
      return res;
    },

    unsubscribe: async (
      input: UnsubscribeAgentActivityInputDto,
    ): Promise<DesktopResult<{ readonly unsubscribed: true }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_ACTIVITY_UNSUBSCRIBE, input),

    getTimeline: (
      input: GetAgentActivityTimelineInputDto,
    ): Promise<DesktopResult<AgentActivityTimelineDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AGENT_ACTIVITY_GET_TIMELINE, input),
  },

  approval: {
    create: (input: CreateApprovalInputDto): Promise<DesktopResult<ApprovalRequestDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.APPROVAL_CREATE, input),
    get: (input: GetApprovalInputDto): Promise<DesktopResult<ApprovalRequestDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.APPROVAL_GET, input),
    list: (input: ListApprovalsInputDto): Promise<DesktopResult<readonly ApprovalRequestDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.APPROVAL_LIST, input),
    approve: (input: ApproveApprovalInputDto): Promise<DesktopResult<ApprovalRequestDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.APPROVAL_APPROVE, input),
    reject: (input: RejectApprovalInputDto): Promise<DesktopResult<ApprovalRequestDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.APPROVAL_REJECT, input),
    cancel: (input: CancelApprovalInputDto): Promise<DesktopResult<ApprovalRequestDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.APPROVAL_CANCEL, input),
    getPending: (input: GetPendingApprovalInputDto): Promise<DesktopResult<ApprovalRequestDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.APPROVAL_GET_PENDING, input),
    getAuditHistory: (input: GetApprovalInputDto): Promise<DesktopResult<readonly ApprovalAuditLogDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.APPROVAL_GET_AUDIT_HISTORY, input),
  },

  fileReview: {
    create: (input: CreateFileReviewInputDto): Promise<DesktopResult<FileDiffReviewDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FILE_REVIEW_CREATE, input),
    get: (input: GetFileReviewInputDto): Promise<DesktopResult<FileDiffReviewDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FILE_REVIEW_GET, input),
    list: (input: ListFileReviewsInputDto): Promise<DesktopResult<readonly FileDiffReviewDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FILE_REVIEW_LIST, input),
    approve: (input: ApproveFileReviewInputDto): Promise<DesktopResult<FileDiffReviewDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FILE_REVIEW_APPROVE, input),
    reject: (input: RejectFileReviewInputDto): Promise<DesktopResult<FileDiffReviewDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FILE_REVIEW_REJECT, input),
    cancel: (input: CancelFileReviewInputDto): Promise<DesktopResult<FileDiffReviewDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FILE_REVIEW_CANCEL, input),
    apply: (input: ApplyFileReviewInputDto): Promise<DesktopResult<ApplyFileReviewResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FILE_REVIEW_APPLY, input),
    getFileContent: (
      input: GetFileReviewContentInputDto,
    ): Promise<DesktopResult<FileReviewContentDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.FILE_REVIEW_GET_FILE_CONTENT, input),
  },

  patchRollback: {
    plan: (input: PlanPatchRollbackInputDto): Promise<DesktopResult<PatchRollbackPlanResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_ROLLBACK_PLAN, input),

    execute: (
      input: ExecutePatchRollbackInputDto,
    ): Promise<DesktopResult<DefectPatchRollbackDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_ROLLBACK_EXECUTE, input),

    get: (input: GetPatchRollbackInputDto): Promise<DesktopResult<DefectPatchRollbackDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_ROLLBACK_GET, input),

    list: (
      input: ListPatchRollbacksInputDto,
    ): Promise<DesktopResult<readonly DefectPatchRollbackDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_ROLLBACK_LIST, input),

    resumeRecovery: (
      input: ResumePatchRollbackRecoveryInputDto,
    ): Promise<DesktopResult<DefectPatchRollbackDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.PATCH_ROLLBACK_RESUME_RECOVERY, input),
  },

  retest: {
    createSnapshot: (
      input: CreateChangeSnapshotInputDto,
    ): Promise<DesktopResult<ChangeSnapshotDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.RETEST_CREATE_SNAPSHOT, input),

    planRetest: (input: PlanRetestInputDto): Promise<DesktopResult<RetestPlanDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.RETEST_PLAN, input),

    getRetestPlan: (input: GetRetestPlanInputDto): Promise<DesktopResult<RetestPlanDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.RETEST_GET_PLAN, input),

    listRetestPlans: (
      input: ListRetestPlansInputDto,
    ): Promise<DesktopResult<readonly RetestPlanDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.RETEST_LIST_PLANS, input),

    explainTestSelection: (
      input: ExplainTestSelectionInputDto,
    ): Promise<DesktopResult<ExplainTestSelectionResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.RETEST_EXPLAIN_TEST, input),
  },

  postFix: {
    execute: (input: ExecutePostFixSyncInputDto): Promise<DesktopResult<PostFixSyncRecordDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.POST_FIX_SYNC_EXECUTE, input),

    retry: (input: RetryPostFixSyncInputDto): Promise<DesktopResult<PostFixSyncRecordDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.POST_FIX_SYNC_RETRY, input),

    getStatus: (
      input: GetPostFixSyncStatusInputDto,
    ): Promise<DesktopResult<PostFixSyncRecordDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.POST_FIX_SYNC_GET_STATUS, input),

    listHistory: (
      input: ListPostFixSyncHistoryInputDto,
    ): Promise<DesktopResult<readonly PostFixSyncRecordDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.POST_FIX_SYNC_LIST_HISTORY, input),
  },

  audit: {
    getTimeline: (
      input: GetRepairTimelineInputDto,
    ): Promise<DesktopResult<RepairAuditTimelineDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUDIT_GET_TIMELINE, input),

    getSession: (
      input: GetRepairSessionInputDto,
    ): Promise<DesktopResult<RepairSessionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUDIT_GET_SESSION, input),

    listSessions: (
      input: ListRepairSessionsInputDto,
    ): Promise<DesktopResult<readonly RepairSessionDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUDIT_LIST_SESSIONS, input),

    exportTimeline: (
      input: ExportRepairTimelineInputDto,
    ): Promise<DesktopResult<ExportRepairTimelineResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUDIT_EXPORT_TIMELINE, input),

    recordEvent: (
      input: RecordRepairAuditEventInputDto,
    ): Promise<DesktopResult<RepairAuditEventDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUDIT_RECORD_EVENT, input),
  },

  qaReport: {
    generate: (input: GenerateQaReportInputDto): Promise<DesktopResult<FinalQaReportDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.QA_REPORT_GENERATE, input),

    get: (input: GetQaReportInputDto): Promise<DesktopResult<FinalQaReportDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.QA_REPORT_GET, input),

    list: (input: ListQaReportsInputDto): Promise<DesktopResult<readonly FinalQaReportDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.QA_REPORT_LIST, input),

    finalize: (input: FinalizeQaReportInputDto): Promise<DesktopResult<FinalQaReportDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.QA_REPORT_FINALIZE, input),

    export: (input: ExportQaReportInputDto): Promise<DesktopResult<ExportQaReportResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.QA_REPORT_EXPORT, input),

    evaluatePolicy: (
      input: EvaluateReleasePolicyInputDto,
    ): Promise<DesktopResult<ReleasePolicyEvaluationResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.QA_REPORT_EVALUATE_POLICY, input),

    checkStaleness: (
      input: CheckQaReportStalenessInputDto,
    ): Promise<DesktopResult<QaReportStalenessResultDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.QA_REPORT_CHECK_STALENESS, input),
  },

  workspaceSessions: {
    list: (
      input: ListWorkspaceSessionsInputDto,
    ): Promise<DesktopResult<readonly WorkspaceSessionSummaryDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKSPACE_SESSIONS_LIST, input),

    get: (input: GetWorkspaceSessionInputDto): Promise<DesktopResult<WorkspaceSessionDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKSPACE_SESSIONS_GET, input),

    create: (input: CreateWorkspaceSessionInputDto): Promise<DesktopResult<WorkspaceSessionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKSPACE_SESSIONS_CREATE, input),

    update: (input: UpdateWorkspaceSessionInputDto): Promise<DesktopResult<WorkspaceSessionDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKSPACE_SESSIONS_UPDATE, input),

    delete: (
      input: DeleteWorkspaceSessionInputDto,
    ): Promise<DesktopResult<{ readonly deleted: boolean }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.WORKSPACE_SESSIONS_DELETE, input),
  },

  shellLayout: {
    get: (): Promise<DesktopResult<ShellLayoutPreferencesDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SHELL_LAYOUT_GET),

    update: (input: UpdateShellLayoutInputDto): Promise<DesktopResult<ShellLayoutPreferencesDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SHELL_LAYOUT_UPDATE, input),
  },

  auth: {
    getAuthState: (): Promise<DesktopResult<AuthStateDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_GET_STATE),

    getCurrentUser: (): Promise<DesktopResult<AuthenticatedUserContextDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_GET_CURRENT_USER),

    login: (input: LoginInputDto): Promise<DesktopResult<AuthenticatedUserContextDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_LOGIN, input),

    signup: (input: SignupInputDto): Promise<DesktopResult<AuthenticatedUserContextDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_SIGNUP, input),

    forgotPassword: (
      input: ForgotPasswordInputDto,
    ): Promise<DesktopResult<PasswordResetResponseDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_FORGOT_PASSWORD, input),

    resetPassword: (
      input: ResetPasswordInputDto,
    ): Promise<DesktopResult<{ readonly success: boolean }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_RESET_PASSWORD, input),

    logout: (): Promise<DesktopResult<{ readonly success: boolean }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_LOGOUT),

    revokeSession: (
      input: RevokeSessionInputDto,
    ): Promise<DesktopResult<{ readonly revoked: boolean }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_REVOKE_SESSION, input),

    revokeAllSessions: (
      input: RevokeAllSessionsInputDto,
    ): Promise<DesktopResult<{ readonly revokedCount: number }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_REVOKE_ALL_SESSIONS, input),

    startSocialAuth: (
      input: SocialAuthStartInputDto,
    ): Promise<DesktopResult<SocialAuthStartResponseDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_SOCIAL_START, input),

    completeSocialAuth: (
      input: SocialAuthCallbackInputDto,
    ): Promise<DesktopResult<AuthenticatedUserContextDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_SOCIAL_CALLBACK, input),

    cancelSocialAuth: (
      input: SocialAuthCancelInputDto,
    ): Promise<DesktopResult<{ readonly cancelled: boolean }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_SOCIAL_CANCEL, input),

    getSocialProviders: (): Promise<DesktopResult<readonly SocialProviderStatusDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.AUTH_SOCIAL_GET_PROVIDERS),
  },

  settings: {
    getProfile: (): Promise<DesktopResult<UserProfileDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SETTINGS_GET_PROFILE),

    updateProfile: (input: UpdateProfileInputDto): Promise<DesktopResult<UserProfileDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SETTINGS_UPDATE_PROFILE, input),

    changePassword: (
      input: ChangePasswordInputDto,
    ): Promise<DesktopResult<{ readonly success: boolean }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SETTINGS_CHANGE_PASSWORD, input),

    getAuthMethods: (): Promise<DesktopResult<UserAuthMethodsDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SETTINGS_GET_AUTH_METHODS),

    getSessions: (): Promise<DesktopResult<readonly SessionSummaryDto[]>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SETTINGS_GET_SESSIONS),

    getPreferences: (): Promise<DesktopResult<UserPreferencesDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SETTINGS_GET_PREFERENCES),

    updatePreferences: (
      input: UpdateUserPreferencesInputDto,
    ): Promise<DesktopResult<UserPreferencesDto>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SETTINGS_UPDATE_PREFERENCES, input),

    deleteAccount: (
      input: DeleteAccountInputDto,
    ): Promise<DesktopResult<{ readonly success: boolean }>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SETTINGS_DELETE_ACCOUNT, input),
  },
};

// Expose safe desktop bridge to renderer process under window.desktop and window.desktopBridge
contextBridge.exposeInMainWorld('desktop', desktopBridge);
contextBridge.exposeInMainWorld('desktopBridge', desktopBridge);
