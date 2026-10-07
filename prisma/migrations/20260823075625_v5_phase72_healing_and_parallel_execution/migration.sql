-- AlterTable
ALTER TABLE "step_execution_records" ADD COLUMN     "healed_target_json" JSONB,
ADD COLUMN     "healing_score" DOUBLE PRECISION,
ADD COLUMN     "healing_status" VARCHAR(32);

-- AlterTable
ALTER TABLE "test_case_executions" ADD COLUMN     "healing_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "healing_used" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "test_runs" ADD COLUMN     "healing_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "healing_used" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "locator_healing_attempts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_execution_id" UUID,
    "step_index" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "action_type" VARCHAR(64) NOT NULL,
    "original_target_json" JSONB NOT NULL,
    "original_selector" VARCHAR(1024) NOT NULL,
    "failure_reason" TEXT NOT NULL,
    "healing_result" VARCHAR(32) NOT NULL,
    "candidate_count" INTEGER NOT NULL DEFAULT 0,
    "selected_candidate_json" JSONB,
    "selected_score" DOUBLE PRECISION,
    "confidence_threshold" DOUBLE PRECISION NOT NULL,
    "scoring_model_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "policy_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "duration_ms" INTEGER,
    "candidates_evaluated_json" JSONB NOT NULL DEFAULT '[]',
    "action_attempted" BOOLEAN NOT NULL DEFAULT false,
    "action_succeeded" BOOLEAN NOT NULL DEFAULT false,
    "evidence_bundle_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locator_healing_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locator_healing_suggestions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "test_case_version_number" INTEGER NOT NULL,
    "step_index" INTEGER NOT NULL,
    "original_target_json" JSONB NOT NULL,
    "suggested_target_json" JSONB NOT NULL,
    "suggested_selector" VARCHAR(1024) NOT NULL,
    "reason" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "review_status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "discovered_in_run_id" UUID NOT NULL,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by" VARCHAR(100),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locator_healing_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_resource_locks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "resource_key" VARCHAR(128) NOT NULL,
    "test_run_id" UUID NOT NULL,
    "worker_id" VARCHAR(64) NOT NULL,
    "acquired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "execution_resource_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locator_healing_attempts_project_id_idx" ON "locator_healing_attempts"("project_id");

-- CreateIndex
CREATE INDEX "locator_healing_attempts_test_run_id_idx" ON "locator_healing_attempts"("test_run_id");

-- CreateIndex
CREATE INDEX "locator_healing_attempts_execution_id_idx" ON "locator_healing_attempts"("execution_id");

-- CreateIndex
CREATE INDEX "locator_healing_attempts_step_execution_id_idx" ON "locator_healing_attempts"("step_execution_id");

-- CreateIndex
CREATE INDEX "locator_healing_attempts_healing_result_idx" ON "locator_healing_attempts"("healing_result");

-- CreateIndex
CREATE INDEX "locator_healing_attempts_created_at_idx" ON "locator_healing_attempts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "locator_healing_attempts_execution_id_step_index_attempt_key" ON "locator_healing_attempts"("execution_id", "step_index", "attempt");

-- CreateIndex
CREATE INDEX "locator_healing_suggestions_project_id_idx" ON "locator_healing_suggestions"("project_id");

-- CreateIndex
CREATE INDEX "locator_healing_suggestions_test_case_id_idx" ON "locator_healing_suggestions"("test_case_id");

-- CreateIndex
CREATE INDEX "locator_healing_suggestions_discovered_in_run_id_idx" ON "locator_healing_suggestions"("discovered_in_run_id");

-- CreateIndex
CREATE INDEX "locator_healing_suggestions_review_status_idx" ON "locator_healing_suggestions"("review_status");

-- CreateIndex
CREATE INDEX "locator_healing_suggestions_created_at_idx" ON "locator_healing_suggestions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "locator_healing_suggestions_test_case_id_step_index_suggest_key" ON "locator_healing_suggestions"("test_case_id", "step_index", "suggested_selector");

-- CreateIndex
CREATE INDEX "execution_resource_locks_project_id_idx" ON "execution_resource_locks"("project_id");

-- CreateIndex
CREATE INDEX "execution_resource_locks_test_run_id_idx" ON "execution_resource_locks"("test_run_id");

-- CreateIndex
CREATE INDEX "execution_resource_locks_expires_at_idx" ON "execution_resource_locks"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "execution_resource_locks_project_id_resource_key_key" ON "execution_resource_locks"("project_id", "resource_key");

-- AddForeignKey
ALTER TABLE "locator_healing_attempts" ADD CONSTRAINT "locator_healing_attempts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locator_healing_attempts" ADD CONSTRAINT "locator_healing_attempts_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locator_healing_attempts" ADD CONSTRAINT "locator_healing_attempts_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "test_case_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locator_healing_attempts" ADD CONSTRAINT "locator_healing_attempts_step_execution_id_fkey" FOREIGN KEY ("step_execution_id") REFERENCES "step_execution_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locator_healing_suggestions" ADD CONSTRAINT "locator_healing_suggestions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locator_healing_suggestions" ADD CONSTRAINT "locator_healing_suggestions_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locator_healing_suggestions" ADD CONSTRAINT "locator_healing_suggestions_discovered_in_run_id_fkey" FOREIGN KEY ("discovered_in_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_resource_locks" ADD CONSTRAINT "execution_resource_locks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_resource_locks" ADD CONSTRAINT "execution_resource_locks_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
