-- CreateEnum
CREATE TYPE "PatchProposalStatus" AS ENUM ('PROPOSED', 'SUPERSEDED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PatchRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "defect_patch_proposals" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "repository_id" UUID,
    "quick_fix_assessment_id" UUID,
    "defect_localization_id" UUID,
    "root_cause_analysis_id" UUID,
    "repository_revision" VARCHAR(64) NOT NULL,
    "branch_name" VARCHAR(255),
    "source_file_sha256" VARCHAR(64),
    "is_drifted" BOOLEAN NOT NULL DEFAULT false,
    "status" "PatchProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "riskLevel" "PatchRiskLevel" NOT NULL DEFAULT 'LOW',
    "target_files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primary_file_path" VARCHAR(1024),
    "primary_symbol_name" VARCHAR(255),
    "start_line" INTEGER,
    "end_line" INTEGER,
    "files_changed_count" INTEGER NOT NULL DEFAULT 1,
    "lines_added_count" INTEGER NOT NULL DEFAULT 0,
    "lines_removed_count" INTEGER NOT NULL DEFAULT 0,
    "total_changed_lines_count" INTEGER NOT NULL DEFAULT 0,
    "unified_diff" TEXT NOT NULL,
    "structured_edits_json" JSONB NOT NULL DEFAULT '[]',
    "rationale" TEXT NOT NULL,
    "expected_behavior_change" TEXT NOT NULL,
    "assumptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risk_factors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uncertainties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence_references_json" JSONB NOT NULL DEFAULT '[]',
    "test_references_json" JSONB NOT NULL DEFAULT '[]',
    "traceability_json" JSONB NOT NULL DEFAULT '{}',
    "model_provider" VARCHAR(64) NOT NULL,
    "model_name" VARCHAR(128) NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "patch_fingerprint" VARCHAR(64) NOT NULL,
    "duration_ms" INTEGER,
    "generation_attempt" INTEGER NOT NULL DEFAULT 1,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "proposal_version" INTEGER NOT NULL DEFAULT 1,
    "superseded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_patch_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "defect_patch_proposals_project_id_idx" ON "defect_patch_proposals"("project_id");

-- CreateIndex
CREATE INDEX "defect_patch_proposals_failure_case_id_idx" ON "defect_patch_proposals"("failure_case_id");

-- CreateIndex
CREATE INDEX "defect_patch_proposals_repository_id_idx" ON "defect_patch_proposals"("repository_id");

-- CreateIndex
CREATE INDEX "defect_patch_proposals_is_authoritative_idx" ON "defect_patch_proposals"("is_authoritative");

-- CreateIndex
CREATE INDEX "defect_patch_proposals_status_idx" ON "defect_patch_proposals"("status");

-- CreateIndex
CREATE INDEX "defect_patch_proposals_created_at_idx" ON "defect_patch_proposals"("created_at");

-- AddForeignKey
ALTER TABLE "defect_patch_proposals" ADD CONSTRAINT "defect_patch_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_proposals" ADD CONSTRAINT "defect_patch_proposals_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_proposals" ADD CONSTRAINT "defect_patch_proposals_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "project_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_proposals" ADD CONSTRAINT "defect_patch_proposals_quick_fix_assessment_id_fkey" FOREIGN KEY ("quick_fix_assessment_id") REFERENCES "quick_fix_eligibility_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_proposals" ADD CONSTRAINT "defect_patch_proposals_defect_localization_id_fkey" FOREIGN KEY ("defect_localization_id") REFERENCES "repository_defect_localizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_proposals" ADD CONSTRAINT "defect_patch_proposals_root_cause_analysis_id_fkey" FOREIGN KEY ("root_cause_analysis_id") REFERENCES "failure_root_cause_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_patch_proposals" ADD CONSTRAINT "defect_patch_proposals_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "defect_patch_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
