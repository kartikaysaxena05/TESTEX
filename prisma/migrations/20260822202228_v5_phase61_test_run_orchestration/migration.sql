-- CreateEnum
CREATE TYPE "TestRunStatus" AS ENUM ('QUEUED', 'PREPARING', 'RUNNING', 'PASSED', 'FAILED', 'BLOCKED', 'AUTOMATION_ERROR', 'CANCELLED');

-- CreateTable
CREATE TABLE "test_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "test_case_version_id" UUID,
    "test_case_version_number" INTEGER NOT NULL,
    "executable_test_plan_id" UUID NOT NULL,
    "environment_id" UUID,
    "target_application_id" UUID,
    "status" "TestRunStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotency_key" VARCHAR(128),
    "worker_id" VARCHAR(64),
    "lease_expires_at" TIMESTAMPTZ(6),
    "heartbeat_at" TIMESTAMPTZ(6),
    "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancel_requested_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "terminal_reason" TEXT,
    "error_message" TEXT,
    "execution_duration_ms" INTEGER,
    "plan_fingerprint" VARCHAR(64) NOT NULL,
    "test_case_title" VARCHAR(255) NOT NULL,
    "environment_name" VARCHAR(80),
    "browser_engine" VARCHAR(32) NOT NULL DEFAULT 'chromium',
    "headless" BOOLEAN NOT NULL DEFAULT true,
    "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "diagnostics_json" JSONB NOT NULL DEFAULT '[]',
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_runs_project_id_idx" ON "test_runs"("project_id");

-- CreateIndex
CREATE INDEX "test_runs_test_case_id_idx" ON "test_runs"("test_case_id");

-- CreateIndex
CREATE INDEX "test_runs_test_case_id_test_case_version_number_idx" ON "test_runs"("test_case_id", "test_case_version_number");

-- CreateIndex
CREATE INDEX "test_runs_executable_test_plan_id_idx" ON "test_runs"("executable_test_plan_id");

-- CreateIndex
CREATE INDEX "test_runs_status_idx" ON "test_runs"("status");

-- CreateIndex
CREATE INDEX "test_runs_project_id_status_idx" ON "test_runs"("project_id", "status");

-- CreateIndex
CREATE INDEX "test_runs_queued_at_idx" ON "test_runs"("queued_at");

-- CreateIndex
CREATE INDEX "test_runs_worker_id_idx" ON "test_runs"("worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_runs_project_id_idempotency_key_key" ON "test_runs"("project_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_test_case_version_id_fkey" FOREIGN KEY ("test_case_version_id") REFERENCES "test_case_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_executable_test_plan_id_fkey" FOREIGN KEY ("executable_test_plan_id") REFERENCES "executable_test_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "project_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_target_application_id_fkey" FOREIGN KEY ("target_application_id") REFERENCES "target_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
