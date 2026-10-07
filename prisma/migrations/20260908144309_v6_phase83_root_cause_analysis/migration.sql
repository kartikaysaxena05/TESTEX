-- CreateEnum
CREATE TYPE "RootCauseProbableLayer" AS ENUM ('FRONTEND', 'BACKEND', 'API', 'DATABASE', 'AUTHENTICATION', 'AUTHORIZATION', 'VALIDATION', 'BUSINESS_LOGIC', 'NETWORK', 'CONFIGURATION', 'INFRASTRUCTURE', 'TEST_AUTOMATION', 'TEST_DATA', 'ENVIRONMENT', 'THIRD_PARTY_DEPENDENCY', 'UNKNOWN', 'MULTI_LAYER');

-- CreateEnum
CREATE TYPE "RootCauseStatus" AS ENUM ('SUPPORTED_HYPOTHESIS', 'MULTIPLE_PLAUSIBLE_CAUSES', 'INSUFFICIENT_EVIDENCE', 'NO_REPOSITORY_CONTEXT', 'NOT_APPLICABLE', 'INCONCLUSIVE');

-- CreateTable
CREATE TABLE "failure_root_cause_analyses" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "test_case_version_number" INTEGER NOT NULL DEFAULT 1,
    "failure_analysis_run_id" UUID,
    "deterministic_classification_id" UUID,
    "technical_localization_id" UUID,
    "domain_separation_id" UUID,
    "ai_assessment_id" UUID,
    "root_cause_status" "RootCauseStatus" NOT NULL,
    "probable_layer" "RootCauseProbableLayer" NOT NULL,
    "probable_component" VARCHAR(255),
    "related_endpoint" VARCHAR(1024),
    "probable_cause" TEXT NOT NULL,
    "human_explanation" TEXT NOT NULL,
    "affected_execution_path" JSONB NOT NULL DEFAULT '[]',
    "supporting_evidence" JSONB NOT NULL DEFAULT '[]',
    "contradicting_evidence" JSONB NOT NULL DEFAULT '[]',
    "alternative_hypotheses" JSONB NOT NULL DEFAULT '[]',
    "repository_references" JSONB NOT NULL DEFAULT '[]',
    "repository_context_available" BOOLEAN NOT NULL DEFAULT false,
    "limitations" JSONB NOT NULL DEFAULT '[]',
    "uncertainties" JSONB NOT NULL DEFAULT '[]',
    "model_provider" VARCHAR(64) NOT NULL,
    "model_name" VARCHAR(128) NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "schema_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "root_cause_fingerprint" VARCHAR(64) NOT NULL,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "staleness_reason" TEXT,
    "reanalysis_count" INTEGER NOT NULL DEFAULT 0,
    "last_reanalyzed_at" TIMESTAMPTZ(6),
    "reanalysis_reason" TEXT,
    "superseded_by_id" UUID,
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_root_cause_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "failure_root_cause_analyses_project_id_idx" ON "failure_root_cause_analyses"("project_id");

-- CreateIndex
CREATE INDEX "failure_root_cause_analyses_failure_case_id_idx" ON "failure_root_cause_analyses"("failure_case_id");

-- CreateIndex
CREATE INDEX "failure_root_cause_analyses_test_case_id_idx" ON "failure_root_cause_analyses"("test_case_id");

-- CreateIndex
CREATE INDEX "failure_root_cause_analyses_root_cause_status_idx" ON "failure_root_cause_analyses"("root_cause_status");

-- CreateIndex
CREATE INDEX "failure_root_cause_analyses_probable_layer_idx" ON "failure_root_cause_analyses"("probable_layer");

-- CreateIndex
CREATE INDEX "failure_root_cause_analyses_is_authoritative_idx" ON "failure_root_cause_analyses"("is_authoritative");

-- CreateIndex
CREATE INDEX "failure_root_cause_analyses_root_cause_fingerprint_idx" ON "failure_root_cause_analyses"("root_cause_fingerprint");

-- CreateIndex
CREATE INDEX "failure_root_cause_analyses_analyzed_at_idx" ON "failure_root_cause_analyses"("analyzed_at");

-- CreateIndex
CREATE INDEX "failure_root_cause_analyses_created_at_idx" ON "failure_root_cause_analyses"("created_at");

-- AddForeignKey
ALTER TABLE "failure_root_cause_analyses" ADD CONSTRAINT "failure_root_cause_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_root_cause_analyses" ADD CONSTRAINT "failure_root_cause_analyses_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_root_cause_analyses" ADD CONSTRAINT "failure_root_cause_analyses_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_root_cause_analyses" ADD CONSTRAINT "failure_root_cause_analyses_failure_analysis_run_id_fkey" FOREIGN KEY ("failure_analysis_run_id") REFERENCES "failure_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_root_cause_analyses" ADD CONSTRAINT "failure_root_cause_analyses_deterministic_classification_i_fkey" FOREIGN KEY ("deterministic_classification_id") REFERENCES "failure_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_root_cause_analyses" ADD CONSTRAINT "failure_root_cause_analyses_technical_localization_id_fkey" FOREIGN KEY ("technical_localization_id") REFERENCES "failure_technical_localizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_root_cause_analyses" ADD CONSTRAINT "failure_root_cause_analyses_domain_separation_id_fkey" FOREIGN KEY ("domain_separation_id") REFERENCES "failure_domain_separations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_root_cause_analyses" ADD CONSTRAINT "failure_root_cause_analyses_ai_assessment_id_fkey" FOREIGN KEY ("ai_assessment_id") REFERENCES "failure_ai_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_root_cause_analyses" ADD CONSTRAINT "failure_root_cause_analyses_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "failure_root_cause_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
