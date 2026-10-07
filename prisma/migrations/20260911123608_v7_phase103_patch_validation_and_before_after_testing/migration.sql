-- CreateEnum
CREATE TYPE "PatchValidationOutcome" AS ENUM ('VALID', 'INVALID', 'INCONCLUSIVE', 'BLOCKED', 'CANCELLED', 'EXECUTION_ERROR');

-- CreateEnum
CREATE TYPE "PatchValidationStatus" AS ENUM ('PENDING', 'RUNNING_BEFORE', 'APPLYING_PATCH', 'RUNNING_AFTER', 'RUNNING_REGRESSION', 'RUNNING_QUALITY_GATES', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "defect_patch_validations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "patch_proposal_id" UUID NOT NULL,
    "sandbox_id" UUID NOT NULL,
    "repository_id" UUID,
    "test_case_id" UUID NOT NULL,
    "test_case_version_id" UUID,
    "test_case_version_number" INTEGER NOT NULL DEFAULT 1,
    "requirement_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PatchValidationStatus" NOT NULL DEFAULT 'PENDING',
    "validation_outcome" "PatchValidationOutcome" NOT NULL DEFAULT 'INCONCLUSIVE',
    "validation_reason" TEXT,
    "base_revision" VARCHAR(64) NOT NULL,
    "patch_hash" VARCHAR(64) NOT NULL,
    "original_repo_modified_count" INTEGER NOT NULL DEFAULT 0,
    "original_repo_clean" BOOLEAN NOT NULL DEFAULT true,
    "target_failure_fixed" BOOLEAN NOT NULL DEFAULT false,
    "before_status" VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
    "after_status" VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
    "before_failure_signature" VARCHAR(128),
    "after_failure_signature" VARCHAR(128),
    "before_expected" TEXT,
    "before_actual" TEXT,
    "after_expected" TEXT,
    "after_actual" TEXT,
    "same_test_case_verified" BOOLEAN NOT NULL DEFAULT true,
    "same_test_version_verified" BOOLEAN NOT NULL DEFAULT true,
    "regression_detected" BOOLEAN NOT NULL DEFAULT false,
    "targeted_regression_total" INTEGER NOT NULL DEFAULT 0,
    "targeted_regression_passed" INTEGER NOT NULL DEFAULT 0,
    "targeted_regression_failed" INTEGER NOT NULL DEFAULT 0,
    "new_regressions_count" INTEGER NOT NULL DEFAULT 0,
    "new_regressions_json" JSONB NOT NULL DEFAULT '[]',
    "pre_existing_failures_count" INTEGER NOT NULL DEFAULT 0,
    "pre_existing_failures_json" JSONB NOT NULL DEFAULT '[]',
    "unexpected_changes_detected" BOOLEAN NOT NULL DEFAULT false,
    "unexpected_files_json" JSONB NOT NULL DEFAULT '[]',
    "typecheck_status" VARCHAR(32) NOT NULL DEFAULT 'NOT_RUN',
    "lint_status" VARCHAR(32) NOT NULL DEFAULT 'NOT_RUN',
    "format_status" VARCHAR(32) NOT NULL DEFAULT 'NOT_RUN',
    "build_status" VARCHAR(32) NOT NULL DEFAULT 'NOT_RUN',
    "quality_gates_json" JSONB NOT NULL DEFAULT '{}',
    "before_execution_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "after_execution_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "before_evidence_json" JSONB NOT NULL DEFAULT '{}',
    "after_evidence_json" JSONB NOT NULL DEFAULT '{}',
    "comparison_summary_json" JSONB NOT NULL DEFAULT '{}',
    "validator_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "executed_by" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "execution_duration_ms" INTEGER,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_patch_validations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "defect_patch_validations_project_id_idx" ON "defect_patch_validations"("project_id");

-- CreateIndex
CREATE INDEX "defect_patch_validations_failure_case_id_idx" ON "defect_patch_validations"("failure_case_id");

-- CreateIndex
CREATE INDEX "defect_patch_validations_patch_proposal_id_idx" ON "defect_patch_validations"("patch_proposal_id");

-- CreateIndex
CREATE INDEX "defect_patch_validations_sandbox_id_idx" ON "defect_patch_validations"("sandbox_id");

-- CreateIndex
CREATE INDEX "defect_patch_validations_validation_outcome_idx" ON "defect_patch_validations"("validation_outcome");

-- CreateIndex
CREATE INDEX "defect_patch_validations_created_at_idx" ON "defect_patch_validations"("created_at");

-- AddForeignKey
ALTER TABLE "defect_patch_validations" ADD CONSTRAINT "defect_patch_validations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_validations" ADD CONSTRAINT "defect_patch_validations_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_validations" ADD CONSTRAINT "defect_patch_validations_patch_proposal_id_fkey" FOREIGN KEY ("patch_proposal_id") REFERENCES "defect_patch_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_validations" ADD CONSTRAINT "defect_patch_validations_sandbox_id_fkey" FOREIGN KEY ("sandbox_id") REFERENCES "defect_patch_sandboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_validations" ADD CONSTRAINT "defect_patch_validations_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "project_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_validations" ADD CONSTRAINT "defect_patch_validations_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
