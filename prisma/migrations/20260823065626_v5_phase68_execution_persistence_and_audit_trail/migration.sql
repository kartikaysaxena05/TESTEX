-- CreateEnum
CREATE TYPE "StepExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'BLOCKED', 'AUTOMATION_ERROR', 'SKIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "test_case_executions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "test_case_version_id" UUID,
    "test_case_version_number" INTEGER NOT NULL,
    "executable_test_plan_id" UUID NOT NULL,
    "environment_id" UUID,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "TestRunStatus" NOT NULL DEFAULT 'PREPARING',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "terminal_reason" TEXT,
    "error_message" TEXT,
    "error_code" VARCHAR(64),
    "browser_engine" VARCHAR(32) NOT NULL DEFAULT 'chromium',
    "environment_snapshot_json" JSONB NOT NULL DEFAULT '{}',
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_execution_records" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "source_step_id" UUID,
    "step_index" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "action_type" VARCHAR(64) NOT NULL,
    "status" "StepExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "target_summary" VARCHAR(500),
    "action_data_json" JSONB NOT NULL DEFAULT '{}',
    "expected_summary" TEXT,
    "actual_summary" TEXT,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "step_execution_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assertion_execution_records" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_execution_id" UUID NOT NULL,
    "source_assertion_id" UUID,
    "assertion_type" VARCHAR(64) NOT NULL,
    "operator" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "is_hard" BOOLEAN NOT NULL DEFAULT true,
    "target_summary" VARCHAR(500),
    "expected_value_json" JSONB,
    "actual_value_json" JSONB,
    "message" TEXT,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assertion_execution_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_execution_state_transitions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "from_status" "TestRunStatus",
    "to_status" "TestRunStatus" NOT NULL,
    "reason" VARCHAR(255),
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_execution_state_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_case_executions_project_id_idx" ON "test_case_executions"("project_id");

-- CreateIndex
CREATE INDEX "test_case_executions_test_run_id_idx" ON "test_case_executions"("test_run_id");

-- CreateIndex
CREATE INDEX "test_case_executions_test_case_id_idx" ON "test_case_executions"("test_case_id");

-- CreateIndex
CREATE INDEX "test_case_executions_test_case_id_test_case_version_number_idx" ON "test_case_executions"("test_case_id", "test_case_version_number");

-- CreateIndex
CREATE INDEX "test_case_executions_status_idx" ON "test_case_executions"("status");

-- CreateIndex
CREATE INDEX "test_case_executions_project_id_status_idx" ON "test_case_executions"("project_id", "status");

-- CreateIndex
CREATE INDEX "test_case_executions_created_at_idx" ON "test_case_executions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "test_case_executions_test_run_id_attempt_key" ON "test_case_executions"("test_run_id", "attempt");

-- CreateIndex
CREATE INDEX "step_execution_records_project_id_idx" ON "step_execution_records"("project_id");

-- CreateIndex
CREATE INDEX "step_execution_records_test_run_id_idx" ON "step_execution_records"("test_run_id");

-- CreateIndex
CREATE INDEX "step_execution_records_execution_id_idx" ON "step_execution_records"("execution_id");

-- CreateIndex
CREATE INDEX "step_execution_records_execution_id_step_index_idx" ON "step_execution_records"("execution_id", "step_index");

-- CreateIndex
CREATE INDEX "step_execution_records_status_idx" ON "step_execution_records"("status");

-- CreateIndex
CREATE INDEX "step_execution_records_created_at_idx" ON "step_execution_records"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "step_execution_records_execution_id_step_index_attempt_key" ON "step_execution_records"("execution_id", "step_index", "attempt");

-- CreateIndex
CREATE INDEX "assertion_execution_records_project_id_idx" ON "assertion_execution_records"("project_id");

-- CreateIndex
CREATE INDEX "assertion_execution_records_test_run_id_idx" ON "assertion_execution_records"("test_run_id");

-- CreateIndex
CREATE INDEX "assertion_execution_records_execution_id_idx" ON "assertion_execution_records"("execution_id");

-- CreateIndex
CREATE INDEX "assertion_execution_records_step_execution_id_idx" ON "assertion_execution_records"("step_execution_id");

-- CreateIndex
CREATE INDEX "assertion_execution_records_status_idx" ON "assertion_execution_records"("status");

-- CreateIndex
CREATE INDEX "assertion_execution_records_evaluated_at_idx" ON "assertion_execution_records"("evaluated_at");

-- CreateIndex
CREATE INDEX "test_execution_state_transitions_project_id_idx" ON "test_execution_state_transitions"("project_id");

-- CreateIndex
CREATE INDEX "test_execution_state_transitions_test_run_id_idx" ON "test_execution_state_transitions"("test_run_id");

-- CreateIndex
CREATE INDEX "test_execution_state_transitions_execution_id_idx" ON "test_execution_state_transitions"("execution_id");

-- CreateIndex
CREATE INDEX "test_execution_state_transitions_transitioned_at_idx" ON "test_execution_state_transitions"("transitioned_at");

-- AddForeignKey
ALTER TABLE "test_case_executions" ADD CONSTRAINT "test_case_executions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_executions" ADD CONSTRAINT "test_case_executions_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_executions" ADD CONSTRAINT "test_case_executions_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_executions" ADD CONSTRAINT "test_case_executions_test_case_version_id_fkey" FOREIGN KEY ("test_case_version_id") REFERENCES "test_case_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_executions" ADD CONSTRAINT "test_case_executions_executable_test_plan_id_fkey" FOREIGN KEY ("executable_test_plan_id") REFERENCES "executable_test_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_executions" ADD CONSTRAINT "test_case_executions_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "project_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_execution_records" ADD CONSTRAINT "step_execution_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_execution_records" ADD CONSTRAINT "step_execution_records_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_execution_records" ADD CONSTRAINT "step_execution_records_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "test_case_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assertion_execution_records" ADD CONSTRAINT "assertion_execution_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assertion_execution_records" ADD CONSTRAINT "assertion_execution_records_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assertion_execution_records" ADD CONSTRAINT "assertion_execution_records_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "test_case_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assertion_execution_records" ADD CONSTRAINT "assertion_execution_records_step_execution_id_fkey" FOREIGN KEY ("step_execution_id") REFERENCES "step_execution_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_execution_state_transitions" ADD CONSTRAINT "test_execution_state_transitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_execution_state_transitions" ADD CONSTRAINT "test_execution_state_transitions_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_execution_state_transitions" ADD CONSTRAINT "test_execution_state_transitions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "test_case_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
