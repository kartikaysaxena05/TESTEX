-- CreateEnum
CREATE TYPE "FailureCaseStatus" AS ENUM ('PENDING', 'READY', 'ANALYZING', 'COMPLETED', 'FAILED', 'BLOCKED', 'STALE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FailureAnalysisRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "failure_cases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "test_case_version_number" INTEGER NOT NULL,
    "test_run_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_execution_id" UUID,
    "step_index" INTEGER,
    "triggering_execution_status" "TestRunStatus" NOT NULL,
    "status" "FailureCaseStatus" NOT NULL DEFAULT 'PENDING',
    "is_eligible" BOOLEAN NOT NULL DEFAULT true,
    "ineligibility_reason" VARCHAR(255),
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "staleness_reason" VARCHAR(255),
    "stale_at" TIMESTAMPTZ(6),
    "current_analysis_run_id" UUID,
    "analysis_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "title" VARCHAR(255) NOT NULL,
    "failure_summary" TEXT,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "environment_id" UUID,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_analysis_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "analyzer_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "status" "FailureAnalysisRunStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "trigger_source" VARCHAR(64) NOT NULL DEFAULT 'MANUAL',
    "input_snapshot_json" JSONB NOT NULL DEFAULT '{}',
    "failure_reason" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_evidence_references" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "analysis_run_id" UUID,
    "execution_id" UUID NOT NULL,
    "bundle_id" UUID,
    "artifact_type" "EvidenceArtifactType" NOT NULL,
    "source_artifact_id" UUID,
    "step_execution_id" UUID,
    "storage_identity" VARCHAR(128),
    "logical_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100),
    "byte_size" INTEGER,
    "sha256" VARCHAR(64),
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "attached_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_evidence_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "failure_cases_execution_id_key" ON "failure_cases"("execution_id");

-- CreateIndex
CREATE INDEX "failure_cases_project_id_idx" ON "failure_cases"("project_id");

-- CreateIndex
CREATE INDEX "failure_cases_test_case_id_idx" ON "failure_cases"("test_case_id");

-- CreateIndex
CREATE INDEX "failure_cases_test_run_id_idx" ON "failure_cases"("test_run_id");

-- CreateIndex
CREATE INDEX "failure_cases_execution_id_idx" ON "failure_cases"("execution_id");

-- CreateIndex
CREATE INDEX "failure_cases_status_idx" ON "failure_cases"("status");

-- CreateIndex
CREATE INDEX "failure_cases_project_id_status_idx" ON "failure_cases"("project_id", "status");

-- CreateIndex
CREATE INDEX "failure_cases_is_stale_idx" ON "failure_cases"("is_stale");

-- CreateIndex
CREATE INDEX "failure_cases_created_at_idx" ON "failure_cases"("created_at");

-- CreateIndex
CREATE INDEX "failure_analysis_runs_project_id_idx" ON "failure_analysis_runs"("project_id");

-- CreateIndex
CREATE INDEX "failure_analysis_runs_failure_case_id_idx" ON "failure_analysis_runs"("failure_case_id");

-- CreateIndex
CREATE INDEX "failure_analysis_runs_status_idx" ON "failure_analysis_runs"("status");

-- CreateIndex
CREATE INDEX "failure_analysis_runs_created_at_idx" ON "failure_analysis_runs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "failure_analysis_runs_failure_case_id_attempt_number_key" ON "failure_analysis_runs"("failure_case_id", "attempt_number");

-- CreateIndex
CREATE INDEX "failure_evidence_references_project_id_idx" ON "failure_evidence_references"("project_id");

-- CreateIndex
CREATE INDEX "failure_evidence_references_failure_case_id_idx" ON "failure_evidence_references"("failure_case_id");

-- CreateIndex
CREATE INDEX "failure_evidence_references_analysis_run_id_idx" ON "failure_evidence_references"("analysis_run_id");

-- CreateIndex
CREATE INDEX "failure_evidence_references_execution_id_idx" ON "failure_evidence_references"("execution_id");

-- CreateIndex
CREATE INDEX "failure_evidence_references_source_artifact_id_idx" ON "failure_evidence_references"("source_artifact_id");

-- CreateIndex
CREATE INDEX "failure_evidence_references_artifact_type_idx" ON "failure_evidence_references"("artifact_type");

-- AddForeignKey
ALTER TABLE "failure_cases" ADD CONSTRAINT "failure_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_cases" ADD CONSTRAINT "failure_cases_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_cases" ADD CONSTRAINT "failure_cases_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_cases" ADD CONSTRAINT "failure_cases_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "test_case_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_cases" ADD CONSTRAINT "failure_cases_step_execution_id_fkey" FOREIGN KEY ("step_execution_id") REFERENCES "step_execution_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_cases" ADD CONSTRAINT "failure_cases_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "project_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_analysis_runs" ADD CONSTRAINT "failure_analysis_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_analysis_runs" ADD CONSTRAINT "failure_analysis_runs_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_evidence_references" ADD CONSTRAINT "failure_evidence_references_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_evidence_references" ADD CONSTRAINT "failure_evidence_references_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_evidence_references" ADD CONSTRAINT "failure_evidence_references_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "failure_analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_evidence_references" ADD CONSTRAINT "failure_evidence_references_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "test_case_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_evidence_references" ADD CONSTRAINT "failure_evidence_references_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "execution_evidence_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_evidence_references" ADD CONSTRAINT "failure_evidence_references_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "execution_evidence_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
