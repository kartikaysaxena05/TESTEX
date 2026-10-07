-- CreateEnum
CREATE TYPE "BugReportStatus" AS ENUM ('DRAFT', 'READY', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ApplicationDefectState" AS ENUM ('CONFIRMED_APPLICATION_DEFECT', 'SUPPORTED_APPLICATION_DEFECT', 'AUTOMATION_FAILURE', 'TEST_DATA_FAILURE', 'ENVIRONMENT_FAILURE', 'FLAKY_UNSTABLE_FAILURE', 'INCONCLUSIVE', 'UNKNOWN', 'BLOCKED');

-- CreateTable
CREATE TABLE "structured_bug_reports" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "failure_analysis_run_id" UUID,
    "report_number" VARCHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "status" "BugReportStatus" NOT NULL DEFAULT 'READY',
    "application_defect_state" "ApplicationDefectState" NOT NULL,
    "is_application_defect" BOOLEAN NOT NULL,
    "supersedes_id" UUID,
    "superseded_by_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "summary" TEXT NOT NULL,
    "requirement_id" UUID,
    "requirement_key" VARCHAR(64),
    "requirement_version_number" INTEGER,
    "requirement_text_reference" TEXT,
    "test_case_id" UUID NOT NULL,
    "test_case_key" VARCHAR(64) NOT NULL,
    "test_case_version_number" INTEGER NOT NULL,
    "test_case_title" VARCHAR(255) NOT NULL,
    "test_case_type" VARCHAR(64),
    "original_execution_id" UUID NOT NULL,
    "triggering_status" VARCHAR(32) NOT NULL,
    "failed_step_index" INTEGER,
    "failed_step_action" VARCHAR(255),
    "preconditions_json" JSONB NOT NULL DEFAULT '[]',
    "reproduction_steps_json" JSONB NOT NULL DEFAULT '[]',
    "expected_result" TEXT NOT NULL,
    "actual_result" TEXT NOT NULL,
    "classification_category" VARCHAR(64),
    "classification_subcategory" VARCHAR(128),
    "reproducibility_state" VARCHAR(64),
    "reproduction_attempts" INTEGER NOT NULL DEFAULT 0,
    "reproduction_success_count" INTEGER NOT NULL DEFAULT 0,
    "reproducibility_ratio" DOUBLE PRECISION,
    "probable_layer" VARCHAR(64),
    "probable_component" VARCHAR(128),
    "root_cause_summary" TEXT,
    "is_root_cause_hypothesis" BOOLEAN NOT NULL DEFAULT true,
    "severity" VARCHAR(32),
    "priority" VARCHAR(32),
    "impact_summary" TEXT,
    "duplicate_cluster_id" UUID,
    "duplicate_cluster_key" VARCHAR(64),
    "related_failure_count" INTEGER NOT NULL DEFAULT 0,
    "overall_confidence" DOUBLE PRECISION,
    "confidence_band" VARCHAR(32),
    "environment_json" JSONB NOT NULL DEFAULT '{}',
    "evidence_references_json" JSONB NOT NULL DEFAULT '[]',
    "known_limitations_json" JSONB NOT NULL DEFAULT '[]',
    "unknowns_json" JSONB NOT NULL DEFAULT '[]',
    "markdown_report" TEXT NOT NULL,
    "report_fingerprint" VARCHAR(64) NOT NULL,
    "report_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "generator_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "regeneration_reason" TEXT,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "structured_bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "structured_bug_reports_project_id_idx" ON "structured_bug_reports"("project_id");

-- CreateIndex
CREATE INDEX "structured_bug_reports_failure_case_id_idx" ON "structured_bug_reports"("failure_case_id");

-- CreateIndex
CREATE INDEX "structured_bug_reports_report_number_idx" ON "structured_bug_reports"("report_number");

-- CreateIndex
CREATE INDEX "structured_bug_reports_is_authoritative_idx" ON "structured_bug_reports"("is_authoritative");

-- CreateIndex
CREATE INDEX "structured_bug_reports_status_idx" ON "structured_bug_reports"("status");

-- CreateIndex
CREATE INDEX "structured_bug_reports_application_defect_state_idx" ON "structured_bug_reports"("application_defect_state");

-- CreateIndex
CREATE INDEX "structured_bug_reports_generated_at_idx" ON "structured_bug_reports"("generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "structured_bug_reports_failure_case_id_revision_key" ON "structured_bug_reports"("failure_case_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "structured_bug_reports_project_id_report_number_revision_key" ON "structured_bug_reports"("project_id", "report_number", "revision");

-- AddForeignKey
ALTER TABLE "structured_bug_reports" ADD CONSTRAINT "structured_bug_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_bug_reports" ADD CONSTRAINT "structured_bug_reports_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_bug_reports" ADD CONSTRAINT "structured_bug_reports_failure_analysis_run_id_fkey" FOREIGN KEY ("failure_analysis_run_id") REFERENCES "failure_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_bug_reports" ADD CONSTRAINT "structured_bug_reports_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "structured_bug_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
