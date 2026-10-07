-- CreateEnum
CREATE TYPE "PatchRollbackStatus" AS ENUM ('PENDING', 'PLANNING', 'RECOVERY_POINT_CREATED', 'APPLYING', 'COMPLETED', 'FAILED', 'CONFLICT_BLOCKED', 'RECOVERY_REQUIRED');

-- CreateEnum
CREATE TYPE "PatchRollbackConflictType" AS ENUM ('OVERLAPPING_USER_CHANGES', 'SAME_FILE_CONFLICT', 'FILE_DELETED', 'FILE_MOVED', 'NEWER_PATCH_CONFLICT', 'DRIFT_DETECTED');

-- AlterEnum
ALTER TYPE "PatchApprovalStatus" ADD VALUE 'ROLLED_BACK';

-- CreateTable
CREATE TABLE "defect_patch_rollbacks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "patch_proposal_id" UUID NOT NULL,
    "patch_approval_id" UUID NOT NULL,
    "repository_id" UUID,
    "rollback_requested_by" VARCHAR(128) NOT NULL DEFAULT 'HUMAN_OPERATOR',
    "rollback_reason" TEXT,
    "status" "PatchRollbackStatus" NOT NULL DEFAULT 'PENDING',
    "conflict_type" "PatchRollbackConflictType",
    "conflict_details" JSONB,
    "target_pre_patch_hashes" JSONB NOT NULL,
    "pre_rollback_hashes" JSONB NOT NULL,
    "post_rollback_hashes" JSONB,
    "target_files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restored_files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preserved_unrelated_files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recovery_point_id" VARCHAR(64),
    "recovery_point_snapshot" JSONB,
    "reverse_diff" TEXT,
    "structured_reverse_edits" JSONB,
    "dry_run_only" BOOLEAN NOT NULL DEFAULT false,
    "dry_run_success" BOOLEAN,
    "dry_run_conflicts" JSONB,
    "integrity_verified" BOOLEAN NOT NULL DEFAULT false,
    "integrity_details" JSONB,
    "post_rollback_test_run_id" UUID,
    "post_rollback_test_passed" BOOLEAN,
    "original_failure_reoccurred" BOOLEAN,
    "audit_trail_json" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_patch_rollbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "defect_patch_rollbacks_project_id_idx" ON "defect_patch_rollbacks"("project_id");

-- CreateIndex
CREATE INDEX "defect_patch_rollbacks_failure_case_id_idx" ON "defect_patch_rollbacks"("failure_case_id");

-- CreateIndex
CREATE INDEX "defect_patch_rollbacks_patch_proposal_id_idx" ON "defect_patch_rollbacks"("patch_proposal_id");

-- CreateIndex
CREATE INDEX "defect_patch_rollbacks_patch_approval_id_idx" ON "defect_patch_rollbacks"("patch_approval_id");

-- CreateIndex
CREATE INDEX "defect_patch_rollbacks_status_idx" ON "defect_patch_rollbacks"("status");

-- CreateIndex
CREATE INDEX "defect_patch_rollbacks_created_at_idx" ON "defect_patch_rollbacks"("created_at");

-- AddForeignKey
ALTER TABLE "defect_patch_rollbacks" ADD CONSTRAINT "defect_patch_rollbacks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_rollbacks" ADD CONSTRAINT "defect_patch_rollbacks_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_rollbacks" ADD CONSTRAINT "defect_patch_rollbacks_patch_proposal_id_fkey" FOREIGN KEY ("patch_proposal_id") REFERENCES "defect_patch_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_rollbacks" ADD CONSTRAINT "defect_patch_rollbacks_patch_approval_id_fkey" FOREIGN KEY ("patch_approval_id") REFERENCES "defect_patch_approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_rollbacks" ADD CONSTRAINT "defect_patch_rollbacks_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "project_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
