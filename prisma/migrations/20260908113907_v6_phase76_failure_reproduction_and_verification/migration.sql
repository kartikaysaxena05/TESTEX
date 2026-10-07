-- CreateEnum
CREATE TYPE "FailureReproductionOutcome" AS ENUM ('REPRODUCED', 'NOT_REPRODUCED', 'BLOCKED', 'INCONCLUSIVE', 'CANCELLED', 'EXECUTION_ERROR');

-- CreateEnum
CREATE TYPE "EnvironmentEquivalenceStatus" AS ENUM ('EXACT', 'EQUIVALENT', 'DRIFTED', 'UNKNOWN', 'INCOMPATIBLE');

-- CreateTable
CREATE TABLE "failure_reproduction_attempts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "analysis_run_id" UUID,
    "original_execution_id" UUID NOT NULL,
    "reproduction_execution_id" UUID,
    "reproduction_test_run_id" UUID,
    "attempt_number" INTEGER NOT NULL,
    "test_case_id" UUID NOT NULL,
    "test_case_version_id" UUID,
    "test_case_version_number" INTEGER NOT NULL,
    "requirement_id" UUID,
    "requirement_version_number" INTEGER,
    "target_environment_id" UUID,
    "browser_engine" VARCHAR(32) NOT NULL DEFAULT 'chromium',
    "reproduction_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "status" "FailureReproductionOutcome" NOT NULL DEFAULT 'INCONCLUSIVE',
    "environment_equivalence" "EnvironmentEquivalenceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "original_failure_signature" VARCHAR(128),
    "reproduction_failure_signature" VARCHAR(128),
    "is_signature_match" BOOLEAN,
    "failed_step_index" INTEGER,
    "is_failed_step_match" BOOLEAN,
    "step_comparison_json" JSONB NOT NULL DEFAULT '{}',
    "assertion_comparison_json" JSONB NOT NULL DEFAULT '{}',
    "environment_comparison_json" JSONB NOT NULL DEFAULT '{}',
    "blocker_reason" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_reproduction_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "failure_reproduction_attempts_project_id_idx" ON "failure_reproduction_attempts"("project_id");

-- CreateIndex
CREATE INDEX "failure_reproduction_attempts_failure_case_id_idx" ON "failure_reproduction_attempts"("failure_case_id");

-- CreateIndex
CREATE INDEX "failure_reproduction_attempts_original_execution_id_idx" ON "failure_reproduction_attempts"("original_execution_id");

-- CreateIndex
CREATE INDEX "failure_reproduction_attempts_reproduction_execution_id_idx" ON "failure_reproduction_attempts"("reproduction_execution_id");

-- CreateIndex
CREATE INDEX "failure_reproduction_attempts_status_idx" ON "failure_reproduction_attempts"("status");

-- CreateIndex
CREATE INDEX "failure_reproduction_attempts_created_at_idx" ON "failure_reproduction_attempts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "failure_reproduction_attempts_failure_case_id_attempt_numbe_key" ON "failure_reproduction_attempts"("failure_case_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "failure_reproduction_attempts" ADD CONSTRAINT "failure_reproduction_attempts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_reproduction_attempts" ADD CONSTRAINT "failure_reproduction_attempts_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_reproduction_attempts" ADD CONSTRAINT "failure_reproduction_attempts_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "failure_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_reproduction_attempts" ADD CONSTRAINT "failure_reproduction_attempts_original_execution_id_fkey" FOREIGN KEY ("original_execution_id") REFERENCES "test_case_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_reproduction_attempts" ADD CONSTRAINT "failure_reproduction_attempts_reproduction_execution_id_fkey" FOREIGN KEY ("reproduction_execution_id") REFERENCES "test_case_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_reproduction_attempts" ADD CONSTRAINT "failure_reproduction_attempts_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_reproduction_attempts" ADD CONSTRAINT "failure_reproduction_attempts_test_case_version_id_fkey" FOREIGN KEY ("test_case_version_id") REFERENCES "test_case_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_reproduction_attempts" ADD CONSTRAINT "failure_reproduction_attempts_target_environment_id_fkey" FOREIGN KEY ("target_environment_id") REFERENCES "project_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
