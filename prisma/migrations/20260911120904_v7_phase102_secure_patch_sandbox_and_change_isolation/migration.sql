-- CreateEnum
CREATE TYPE "PatchSandboxStatus" AS ENUM ('CREATING', 'READY', 'PATCH_APPLYING', 'PATCH_APPLIED', 'PATCH_REJECTED', 'FAILED', 'DESTROYING', 'DESTROYED', 'EXPIRED');

-- CreateTable
CREATE TABLE "defect_patch_sandboxes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "patch_proposal_id" UUID NOT NULL,
    "sandbox_status" "PatchSandboxStatus" NOT NULL DEFAULT 'CREATING',
    "source_revision" VARCHAR(64) NOT NULL,
    "sandbox_revision" VARCHAR(64),
    "branch_name" VARCHAR(255),
    "sandbox_root" TEXT NOT NULL,
    "isolation_strategy" VARCHAR(64) NOT NULL DEFAULT 'SNAPSHOT_COPY_ISOLATION',
    "isolation_version" INTEGER NOT NULL DEFAULT 1,
    "original_repo_head_commit" VARCHAR(64) NOT NULL,
    "original_repo_clean" BOOLEAN NOT NULL DEFAULT true,
    "original_repo_integrity_verified" BOOLEAN NOT NULL DEFAULT false,
    "original_repo_modified_count" INTEGER NOT NULL DEFAULT 0,
    "applied_patch_proposal_version" INTEGER,
    "patch_applied" BOOLEAN NOT NULL DEFAULT false,
    "patch_applied_at" TIMESTAMPTZ(6),
    "claimed_files_count" INTEGER NOT NULL DEFAULT 0,
    "claimed_lines_added" INTEGER NOT NULL DEFAULT 0,
    "claimed_lines_removed" INTEGER NOT NULL DEFAULT 0,
    "actual_files_modified" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actual_files_created" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actual_files_deleted" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actual_files_renamed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actual_lines_added" INTEGER NOT NULL DEFAULT 0,
    "actual_lines_removed" INTEGER NOT NULL DEFAULT 0,
    "actual_total_changed_lines" INTEGER NOT NULL DEFAULT 0,
    "actual_unified_diff" TEXT,
    "change_set_hash" VARCHAR(64),
    "claimed_vs_actual_diff_match" BOOLEAN,
    "file_hashes_before_json" JSONB NOT NULL DEFAULT '{}',
    "file_hashes_after_json" JSONB NOT NULL DEFAULT '{}',
    "security_checks_json" JSONB NOT NULL DEFAULT '{}',
    "failure_reason" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "destroyed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_patch_sandboxes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "defect_patch_sandboxes_project_id_idx" ON "defect_patch_sandboxes"("project_id");

-- CreateIndex
CREATE INDEX "defect_patch_sandboxes_failure_case_id_idx" ON "defect_patch_sandboxes"("failure_case_id");

-- CreateIndex
CREATE INDEX "defect_patch_sandboxes_repository_id_idx" ON "defect_patch_sandboxes"("repository_id");

-- CreateIndex
CREATE INDEX "defect_patch_sandboxes_patch_proposal_id_idx" ON "defect_patch_sandboxes"("patch_proposal_id");

-- CreateIndex
CREATE INDEX "defect_patch_sandboxes_sandbox_status_idx" ON "defect_patch_sandboxes"("sandbox_status");

-- CreateIndex
CREATE INDEX "defect_patch_sandboxes_created_at_idx" ON "defect_patch_sandboxes"("created_at");

-- AddForeignKey
ALTER TABLE "defect_patch_sandboxes" ADD CONSTRAINT "defect_patch_sandboxes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_sandboxes" ADD CONSTRAINT "defect_patch_sandboxes_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_sandboxes" ADD CONSTRAINT "defect_patch_sandboxes_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_sandboxes" ADD CONSTRAINT "defect_patch_sandboxes_patch_proposal_id_fkey" FOREIGN KEY ("patch_proposal_id") REFERENCES "defect_patch_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
