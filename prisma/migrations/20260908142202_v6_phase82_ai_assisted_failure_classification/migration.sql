-- CreateEnum
CREATE TYPE "ClassificationAgreement" AS ENUM ('AGREES', 'DISAGREES', 'PARTIAL_AGREEMENT', 'NOT_COMPARABLE');

-- CreateEnum
CREATE TYPE "AiConfidenceLevel" AS ENUM ('VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateTable
CREATE TABLE "failure_ai_assessments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "test_case_version_number" INTEGER NOT NULL DEFAULT 1,
    "failure_analysis_run_id" UUID,
    "deterministic_classification_id" UUID,
    "technical_localization_id" UUID,
    "domain_separation_id" UUID,
    "ai_category" "FailureCategory" NOT NULL,
    "ai_subcategory" "FailureSubcategory",
    "agreement_state" "ClassificationAgreement" NOT NULL,
    "confidence_level" "AiConfidenceLevel" NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "confidence_basis" JSONB NOT NULL DEFAULT '[]',
    "primary_reasoning" TEXT NOT NULL,
    "human_explanation" TEXT NOT NULL,
    "supporting_evidence" JSONB NOT NULL DEFAULT '[]',
    "contradicting_evidence" JSONB NOT NULL DEFAULT '[]',
    "alternative_hypotheses" JSONB NOT NULL DEFAULT '[]',
    "uncertainties" JSONB NOT NULL DEFAULT '[]',
    "model_provider" VARCHAR(64) NOT NULL,
    "model_name" VARCHAR(128) NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "schema_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "assessment_fingerprint" VARCHAR(64) NOT NULL,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "staleness_reason" TEXT,
    "reanalysis_count" INTEGER NOT NULL DEFAULT 0,
    "last_reanalyzed_at" TIMESTAMPTZ(6),
    "reanalysis_reason" TEXT,
    "superseded_by_id" UUID,
    "assessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_ai_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "failure_ai_assessments_project_id_idx" ON "failure_ai_assessments"("project_id");

-- CreateIndex
CREATE INDEX "failure_ai_assessments_failure_case_id_idx" ON "failure_ai_assessments"("failure_case_id");

-- CreateIndex
CREATE INDEX "failure_ai_assessments_test_case_id_idx" ON "failure_ai_assessments"("test_case_id");

-- CreateIndex
CREATE INDEX "failure_ai_assessments_deterministic_classification_id_idx" ON "failure_ai_assessments"("deterministic_classification_id");

-- CreateIndex
CREATE INDEX "failure_ai_assessments_ai_category_idx" ON "failure_ai_assessments"("ai_category");

-- CreateIndex
CREATE INDEX "failure_ai_assessments_agreement_state_idx" ON "failure_ai_assessments"("agreement_state");

-- CreateIndex
CREATE INDEX "failure_ai_assessments_is_authoritative_idx" ON "failure_ai_assessments"("is_authoritative");

-- CreateIndex
CREATE INDEX "failure_ai_assessments_assessment_fingerprint_idx" ON "failure_ai_assessments"("assessment_fingerprint");

-- CreateIndex
CREATE INDEX "failure_ai_assessments_assessed_at_idx" ON "failure_ai_assessments"("assessed_at");

-- CreateIndex
CREATE INDEX "failure_ai_assessments_created_at_idx" ON "failure_ai_assessments"("created_at");

-- AddForeignKey
ALTER TABLE "failure_ai_assessments" ADD CONSTRAINT "failure_ai_assessments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_ai_assessments" ADD CONSTRAINT "failure_ai_assessments_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_ai_assessments" ADD CONSTRAINT "failure_ai_assessments_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_ai_assessments" ADD CONSTRAINT "failure_ai_assessments_failure_analysis_run_id_fkey" FOREIGN KEY ("failure_analysis_run_id") REFERENCES "failure_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_ai_assessments" ADD CONSTRAINT "failure_ai_assessments_deterministic_classification_id_fkey" FOREIGN KEY ("deterministic_classification_id") REFERENCES "failure_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_ai_assessments" ADD CONSTRAINT "failure_ai_assessments_technical_localization_id_fkey" FOREIGN KEY ("technical_localization_id") REFERENCES "failure_technical_localizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_ai_assessments" ADD CONSTRAINT "failure_ai_assessments_domain_separation_id_fkey" FOREIGN KEY ("domain_separation_id") REFERENCES "failure_domain_separations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_ai_assessments" ADD CONSTRAINT "failure_ai_assessments_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "failure_ai_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
