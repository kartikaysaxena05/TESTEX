-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('VERIFIED_FIXED', 'STILL_FAILING', 'DIFFERENT_FAILURE', 'BLOCKED', 'INCONCLUSIVE', 'CANCELLED', 'EXECUTION_ERROR');

-- CreateEnum
CREATE TYPE "VerificationMode" AS ENUM ('HISTORICAL', 'CURRENT');

-- AlterTable
ALTER TABLE "defect_reverifications" ADD COLUMN     "latest_outcome" "VerificationOutcome";

-- CreateTable
CREATE TABLE "defect_verification_attempts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "reverification_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "structured_bug_report_id" UUID,
    "original_execution_id" UUID NOT NULL,
    "verification_execution_id" UUID,
    "verification_test_run_id" UUID,
    "verification_mode" "VerificationMode" NOT NULL DEFAULT 'HISTORICAL',
    "test_case_id" UUID NOT NULL,
    "original_test_case_version_id" UUID,
    "original_test_case_version_number" INTEGER NOT NULL,
    "verification_test_case_version_id" UUID,
    "verification_test_case_version_number" INTEGER NOT NULL,
    "test_version_difference" TEXT,
    "original_requirement_version_number" INTEGER,
    "verification_requirement_version_number" INTEGER,
    "attempt_number" INTEGER NOT NULL,
    "target_environment_id" UUID,
    "browser_engine" VARCHAR(32) NOT NULL DEFAULT 'chromium',
    "status" "VerificationOutcome" NOT NULL DEFAULT 'INCONCLUSIVE',
    "original_failure_signature" VARCHAR(128),
    "verification_failure_signature" VARCHAR(128),
    "is_signature_match" BOOLEAN,
    "failed_step_index" INTEGER,
    "original_failed_step_action" TEXT,
    "verification_failed_step_action" TEXT,
    "step_comparison_json" JSONB NOT NULL DEFAULT '{}',
    "assertion_comparison_json" JSONB NOT NULL DEFAULT '{}',
    "environment_comparison_json" JSONB NOT NULL DEFAULT '{}',
    "environment_equivalence" "EnvironmentEquivalenceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "environment_drift_details" TEXT,
    "original_build_commit" VARCHAR(64),
    "verification_build_commit" VARCHAR(64),
    "blocker_reason" TEXT,
    "execution_duration_ms" INTEGER,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_verification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "defect_verification_attempts_project_id_idx" ON "defect_verification_attempts"("project_id");

-- CreateIndex
CREATE INDEX "defect_verification_attempts_reverification_id_idx" ON "defect_verification_attempts"("reverification_id");

-- CreateIndex
CREATE INDEX "defect_verification_attempts_failure_case_id_idx" ON "defect_verification_attempts"("failure_case_id");

-- CreateIndex
CREATE INDEX "defect_verification_attempts_original_execution_id_idx" ON "defect_verification_attempts"("original_execution_id");

-- CreateIndex
CREATE INDEX "defect_verification_attempts_verification_execution_id_idx" ON "defect_verification_attempts"("verification_execution_id");

-- CreateIndex
CREATE INDEX "defect_verification_attempts_status_idx" ON "defect_verification_attempts"("status");

-- CreateIndex
CREATE INDEX "defect_verification_attempts_created_at_idx" ON "defect_verification_attempts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "defect_verification_attempts_reverification_id_attempt_numb_key" ON "defect_verification_attempts"("reverification_id", "attempt_number");

-- CreateIndex
CREATE INDEX "defect_reverifications_latest_outcome_idx" ON "defect_reverifications"("latest_outcome");

-- AddForeignKey
ALTER TABLE "defect_verification_attempts" ADD CONSTRAINT "defect_verification_attempts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_verification_attempts" ADD CONSTRAINT "defect_verification_attempts_reverification_id_fkey" FOREIGN KEY ("reverification_id") REFERENCES "defect_reverifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_verification_attempts" ADD CONSTRAINT "defect_verification_attempts_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_verification_attempts" ADD CONSTRAINT "defect_verification_attempts_structured_bug_report_id_fkey" FOREIGN KEY ("structured_bug_report_id") REFERENCES "structured_bug_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_verification_attempts" ADD CONSTRAINT "defect_verification_attempts_original_execution_id_fkey" FOREIGN KEY ("original_execution_id") REFERENCES "test_case_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_verification_attempts" ADD CONSTRAINT "defect_verification_attempts_verification_execution_id_fkey" FOREIGN KEY ("verification_execution_id") REFERENCES "test_case_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_verification_attempts" ADD CONSTRAINT "defect_verification_attempts_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_verification_attempts" ADD CONSTRAINT "defect_verification_attempts_original_test_case_version_id_fkey" FOREIGN KEY ("original_test_case_version_id") REFERENCES "test_case_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_verification_attempts" ADD CONSTRAINT "defect_verification_attempts_verification_test_case_versio_fkey" FOREIGN KEY ("verification_test_case_version_id") REFERENCES "test_case_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_verification_attempts" ADD CONSTRAINT "defect_verification_attempts_target_environment_id_fkey" FOREIGN KEY ("target_environment_id") REFERENCES "project_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
