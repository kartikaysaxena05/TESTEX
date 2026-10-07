-- CreateEnum
CREATE TYPE "QuickFixEligibilityDecision" AS ENUM ('ELIGIBLE', 'NOT_ELIGIBLE', 'NEEDS_HUMAN_REVIEW', 'INSUFFICIENT_EVIDENCE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "QuickFixRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "quick_fix_eligibility_assessments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "repository_id" UUID,
    "root_cause_analysis_id" UUID,
    "decision" "QuickFixEligibilityDecision" NOT NULL DEFAULT 'INSUFFICIENT_EVIDENCE',
    "primary_reason" TEXT NOT NULL,
    "policy_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "assessment_count" INTEGER NOT NULL DEFAULT 1,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "reassessment_reason" TEXT,
    "superseded_by_id" UUID,
    "candidate_files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "candidate_symbols_json" JSONB NOT NULL DEFAULT '[]',
    "matched_rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blocking_rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "safety_warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "human_review_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unknown_factors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risk_factors_json" JSONB NOT NULL DEFAULT '{}',
    "blast_radius_json" JSONB NOT NULL DEFAULT '{}',
    "required_tests_json" JSONB NOT NULL DEFAULT '[]',
    "git_state_json" JSONB NOT NULL DEFAULT '{}',
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_fix_eligibility_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_fix_eligibility_assessments_project_id_idx" ON "quick_fix_eligibility_assessments"("project_id");

-- CreateIndex
CREATE INDEX "quick_fix_eligibility_assessments_failure_case_id_idx" ON "quick_fix_eligibility_assessments"("failure_case_id");

-- CreateIndex
CREATE INDEX "quick_fix_eligibility_assessments_repository_id_idx" ON "quick_fix_eligibility_assessments"("repository_id");

-- CreateIndex
CREATE INDEX "quick_fix_eligibility_assessments_decision_idx" ON "quick_fix_eligibility_assessments"("decision");

-- CreateIndex
CREATE INDEX "quick_fix_eligibility_assessments_is_authoritative_idx" ON "quick_fix_eligibility_assessments"("is_authoritative");

-- CreateIndex
CREATE INDEX "quick_fix_eligibility_assessments_created_at_idx" ON "quick_fix_eligibility_assessments"("created_at");

-- AddForeignKey
ALTER TABLE "quick_fix_eligibility_assessments" ADD CONSTRAINT "quick_fix_eligibility_assessments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_fix_eligibility_assessments" ADD CONSTRAINT "quick_fix_eligibility_assessments_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_fix_eligibility_assessments" ADD CONSTRAINT "quick_fix_eligibility_assessments_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "project_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_fix_eligibility_assessments" ADD CONSTRAINT "quick_fix_eligibility_assessments_root_cause_analysis_id_fkey" FOREIGN KEY ("root_cause_analysis_id") REFERENCES "failure_root_cause_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_fix_eligibility_assessments" ADD CONSTRAINT "quick_fix_eligibility_assessments_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "quick_fix_eligibility_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
