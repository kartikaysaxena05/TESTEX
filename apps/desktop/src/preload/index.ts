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

    environments: {
      create: (input: CreateEnvironmentInput): Promise<DesktopResult<ProjectEnvironmentDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_CREATE, input),

      update: (input: UpdateEnvironmentInput): Promise<DesktopResult<ProjectEnvironmentDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_UPDATE, input),

      delete: (input: DeleteEnvironmentInput): Promise<DesktopResult<{ readonly deleted: true }>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_DELETE, input),

      setDefault: (
        input: SetDefaultEnvironmentInput,
      ): Promise<DesktopResult<ProjectEnvironmentDto>> =>
        ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECTS_ENVIRONMENTS_SET_DEFAULT, input),
    },
  },

  sources: {
    get: (projectId: string): Promise<DesktopResult<ProjectSourceDto | null>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_GET, projectId),

    attachLocalDirectory: (projectId: string): Promise<DesktopResult<AttachLocalDirectoryResult>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.SOURCES_ATTACH_LOCAL_DIRECTORY, projectId),

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

  logging: {
    reportRendererError: (
      report: RendererErrorReport,
    ): Promise<DesktopResult<RendererErrorReportResult>> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.LOGGING_REPORT_RENDERER_ERROR, report),
  },
};

// Expose safe desktop bridge to renderer process under window.desktop
contextBridge.exposeInMainWorld('desktop', desktopBridge);
