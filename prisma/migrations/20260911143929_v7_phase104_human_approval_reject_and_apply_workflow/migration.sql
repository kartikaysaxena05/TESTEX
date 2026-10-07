-- CreateEnum
CREATE TYPE "PatchApprovalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'APPLYING', 'APPLIED', 'APPLY_FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PatchRejectionReason" AS ENUM ('INCORRECT_FIX', 'TOO_RISKY', 'WRONG_ROOT_CAUSE', 'UNNECESSARY_CHANGE', 'NEEDS_MANUAL_REPAIR', 'ARCHITECTURE_CONCERN', 'OTHER');

-- CreateTable
CREATE TABLE "defect_patch_approvals" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "patch_proposal_id" UUID NOT NULL,
    "validation_id" UUID NOT NULL,
    "repository_id" UUID,
    "status" "PatchApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewed_patch_hash" VARCHAR(64) NOT NULL,
    "applied_patch_hash" VARCHAR(64),
    "base_revision" VARCHAR(64) NOT NULL,
    "applied_revision" VARCHAR(64),
    "reviewed_by" VARCHAR(128),
    "reviewed_at" TIMESTAMPTZ(6),
    "review_comment" TEXT,
    "rejection_reason" "PatchRejectionReason",
    "rejection_details" TEXT,
    "apply_requested_at" TIMESTAMPTZ(6),
    "apply_started_at" TIMESTAMPTZ(6),
    "applied_at" TIMESTAMPTZ(6),
    "applied_by" VARCHAR(128),
    "apply_error" TEXT,
    "apply_error_category" VARCHAR(64),
    "affected_files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "files_modified_count" INTEGER NOT NULL DEFAULT 0,
    "lines_added" INTEGER NOT NULL DEFAULT 0,
    "lines_removed" INTEGER NOT NULL DEFAULT 0,
    "applied_unified_diff" TEXT,
    "audit_trail_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_patch_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "defect_patch_approvals_project_id_idx" ON "defect_patch_approvals"("project_id");

-- CreateIndex
CREATE INDEX "defect_patch_approvals_failure_case_id_idx" ON "defect_patch_approvals"("failure_case_id");

-- CreateIndex
CREATE INDEX "defect_patch_approvals_patch_proposal_id_idx" ON "defect_patch_approvals"("patch_proposal_id");

-- CreateIndex
CREATE INDEX "defect_patch_approvals_validation_id_idx" ON "defect_patch_approvals"("validation_id");

-- CreateIndex
CREATE INDEX "defect_patch_approvals_status_idx" ON "defect_patch_approvals"("status");

-- CreateIndex
CREATE INDEX "defect_patch_approvals_created_at_idx" ON "defect_patch_approvals"("created_at");

-- AddForeignKey
ALTER TABLE "defect_patch_approvals" ADD CONSTRAINT "defect_patch_approvals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_approvals" ADD CONSTRAINT "defect_patch_approvals_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_approvals" ADD CONSTRAINT "defect_patch_approvals_patch_proposal_id_fkey" FOREIGN KEY ("patch_proposal_id") REFERENCES "defect_patch_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_approvals" ADD CONSTRAINT "defect_patch_approvals_validation_id_fkey" FOREIGN KEY ("validation_id") REFERENCES "defect_patch_validations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_approvals" ADD CONSTRAINT "defect_patch_approvals_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "project_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
