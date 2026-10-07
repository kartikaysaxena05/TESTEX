-- CreateEnum
CREATE TYPE "RepositoryRevisionState" AS ENUM ('EXACT_REVISION', 'EQUIVALENT_REVISION', 'DRIFTED_REVISION', 'HISTORICAL_REVISION_UNAVAILABLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DefectCandidateType" AS ENUM ('FILE', 'CLASS', 'FUNCTION', 'METHOD', 'COMPONENT', 'API_HANDLER', 'ROUTE', 'CONTROLLER', 'SERVICE', 'REPOSITORY', 'DATABASE_QUERY', 'VALIDATION_SCHEMA', 'MIDDLEWARE', 'CONFIGURATION_FILE');

-- CreateTable
CREATE TABLE "repository_defect_localizations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "repository_id" UUID,
    "root_cause_analysis_id" UUID,
    "quick_fix_assessment_id" UUID,
    "repository_revision" VARCHAR(64) NOT NULL,
    "failure_time_revision" VARCHAR(64),
    "branch_name" VARCHAR(255),
    "revision_state" "RepositoryRevisionState" NOT NULL DEFAULT 'UNKNOWN',
    "is_drifted" BOOLEAN NOT NULL DEFAULT false,
    "drift_details" TEXT,
    "top_candidate_file_path" VARCHAR(1024),
    "top_candidate_symbol_name" VARCHAR(255),
    "top_candidate_score" DOUBLE PRECISION,
    "top_candidate_type" "DefectCandidateType",
    "candidate_files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ranked_candidates_json" JSONB NOT NULL DEFAULT '[]',
    "supporting_evidence_json" JSONB NOT NULL DEFAULT '[]',
    "contradicting_evidence_json" JSONB NOT NULL DEFAULT '[]',
    "traceability_json" JSONB NOT NULL DEFAULT '{}',
    "network_correlation_json" JSONB NOT NULL DEFAULT '{}',
    "ui_correlation_json" JSONB NOT NULL DEFAULT '{}',
    "stack_trace_json" JSONB NOT NULL DEFAULT '{}',
    "source_map_json" JSONB NOT NULL DEFAULT '{}',
    "symbol_graph_json" JSONB NOT NULL DEFAULT '{}',
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "localization_version" INTEGER NOT NULL DEFAULT 1,
    "relocalization_reason" TEXT,
    "superseded_by_id" UUID,
    "duration_ms" INTEGER,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_defect_localizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repository_defect_localizations_project_id_idx" ON "repository_defect_localizations"("project_id");

-- CreateIndex
CREATE INDEX "repository_defect_localizations_failure_case_id_idx" ON "repository_defect_localizations"("failure_case_id");

-- CreateIndex
CREATE INDEX "repository_defect_localizations_repository_id_idx" ON "repository_defect_localizations"("repository_id");

-- CreateIndex
CREATE INDEX "repository_defect_localizations_is_authoritative_idx" ON "repository_defect_localizations"("is_authoritative");

-- CreateIndex
CREATE INDEX "repository_defect_localizations_revision_state_idx" ON "repository_defect_localizations"("revision_state");

-- CreateIndex
CREATE INDEX "repository_defect_localizations_created_at_idx" ON "repository_defect_localizations"("created_at");

-- AddForeignKey
ALTER TABLE "repository_defect_localizations" ADD CONSTRAINT "repository_defect_localizations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_defect_localizations" ADD CONSTRAINT "repository_defect_localizations_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_defect_localizations" ADD CONSTRAINT "repository_defect_localizations_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "project_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_defect_localizations" ADD CONSTRAINT "repository_defect_localizations_root_cause_analysis_id_fkey" FOREIGN KEY ("root_cause_analysis_id") REFERENCES "failure_root_cause_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_defect_localizations" ADD CONSTRAINT "repository_defect_localizations_quick_fix_assessment_id_fkey" FOREIGN KEY ("quick_fix_assessment_id") REFERENCES "quick_fix_eligibility_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_defect_localizations" ADD CONSTRAINT "repository_defect_localizations_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "repository_defect_localizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
