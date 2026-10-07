-- CreateEnum
CREATE TYPE "ConfidenceBand" AS ENUM ('VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "ConclusionType" AS ENUM ('CLASSIFICATION', 'REPRODUCIBILITY', 'ROOT_CAUSE', 'SEVERITY', 'DUPLICATE_CLUSTER', 'OVERALL');

-- CreateEnum
CREATE TYPE "AttributionRelationship" AS ENUM ('SUPPORTS', 'CONTRADICTS', 'NEUTRAL', 'REQUIRED', 'MISSING');

-- CreateEnum
CREATE TYPE "AttributionSupportStrength" AS ENUM ('DECISIVE', 'STRONG', 'SUPPORTING', 'WEAK', 'NONE');

-- CreateEnum
CREATE TYPE "SourceSubsystem" AS ENUM ('V5_EXECUTION', 'PHASE_75_EVIDENCE', 'PHASE_76_REPRODUCTION', 'PHASE_77_CLASSIFICATION', 'PHASE_78_DECISION_INTEGRITY', 'PHASE_79_FLAKINESS', 'PHASE_80_DOMAIN_SEPARATION', 'PHASE_81_CAUSE_LOCALIZATION', 'PHASE_82_AI_CLASSIFICATION', 'PHASE_83_ROOT_CAUSE', 'PHASE_84_SEVERITY', 'PHASE_85_DUPLICATE_CLUSTER');

-- CreateEnum
CREATE TYPE "EpistemicType" AS ENUM ('FACT', 'DETERMINISTIC_INFERENCE', 'AI_INFERENCE', 'UNKNOWN', 'CONTRADICTORY');

-- CreateTable
CREATE TABLE "confidence_assessments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "failure_analysis_run_id" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "superseded_by_id" UUID,
    "supersedes_id" UUID,
    "overall_confidence" DOUBLE PRECISION NOT NULL,
    "confidence_band" "ConfidenceBand" NOT NULL,
    "classification_confidence" DOUBLE PRECISION,
    "reproducibility_confidence" DOUBLE PRECISION,
    "root_cause_confidence" DOUBLE PRECISION,
    "severity_confidence" DOUBLE PRECISION,
    "duplicate_confidence" DOUBLE PRECISION,
    "component_breakdown_json" JSONB NOT NULL DEFAULT '{}',
    "supporting_factors" JSONB NOT NULL DEFAULT '[]',
    "penalties" JSONB NOT NULL DEFAULT '[]',
    "missing_factors" JSONB NOT NULL DEFAULT '[]',
    "contradictions" JSONB NOT NULL DEFAULT '[]',
    "deterministic_facts" JSONB NOT NULL DEFAULT '[]',
    "ai_inferences" JSONB NOT NULL DEFAULT '[]',
    "human_explanation" TEXT NOT NULL,
    "confidence_fingerprint" VARCHAR(64) NOT NULL,
    "confidence_engine_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "scoring_policy_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "explanation_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "staleness_reason" TEXT,
    "recalculation_reason" TEXT,
    "assessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confidence_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_attributions" (
    "id" UUID NOT NULL,
    "confidence_assessment_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "conclusion_type" "ConclusionType" NOT NULL,
    "conclusion_value" VARCHAR(255) NOT NULL,
    "evidence_reference_id" UUID,
    "evidence_type" VARCHAR(64) NOT NULL,
    "relationship" "AttributionRelationship" NOT NULL,
    "support_strength" "AttributionSupportStrength" NOT NULL DEFAULT 'SUPPORTING',
    "source_subsystem" "SourceSubsystem" NOT NULL,
    "reason" TEXT NOT NULL,
    "epistemic_type" "EpistemicType" NOT NULL DEFAULT 'FACT',
    "canonical_evidence_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "confidence_assessments_project_id_idx" ON "confidence_assessments"("project_id");

-- CreateIndex
CREATE INDEX "confidence_assessments_failure_case_id_idx" ON "confidence_assessments"("failure_case_id");

-- CreateIndex
CREATE INDEX "confidence_assessments_is_authoritative_idx" ON "confidence_assessments"("is_authoritative");

-- CreateIndex
CREATE INDEX "confidence_assessments_confidence_band_idx" ON "confidence_assessments"("confidence_band");

-- CreateIndex
CREATE INDEX "confidence_assessments_assessed_at_idx" ON "confidence_assessments"("assessed_at");

-- CreateIndex
CREATE INDEX "confidence_assessments_created_at_idx" ON "confidence_assessments"("created_at");

-- CreateIndex
CREATE INDEX "evidence_attributions_confidence_assessment_id_idx" ON "evidence_attributions"("confidence_assessment_id");

-- CreateIndex
CREATE INDEX "evidence_attributions_project_id_idx" ON "evidence_attributions"("project_id");

-- CreateIndex
CREATE INDEX "evidence_attributions_failure_case_id_idx" ON "evidence_attributions"("failure_case_id");

-- CreateIndex
CREATE INDEX "evidence_attributions_conclusion_type_idx" ON "evidence_attributions"("conclusion_type");

-- CreateIndex
CREATE INDEX "evidence_attributions_relationship_idx" ON "evidence_attributions"("relationship");

-- CreateIndex
CREATE INDEX "evidence_attributions_source_subsystem_idx" ON "evidence_attributions"("source_subsystem");

-- CreateIndex
CREATE INDEX "evidence_attributions_canonical_evidence_key_idx" ON "evidence_attributions"("canonical_evidence_key");

-- CreateIndex
CREATE INDEX "evidence_attributions_created_at_idx" ON "evidence_attributions"("created_at");

-- AddForeignKey
ALTER TABLE "confidence_assessments" ADD CONSTRAINT "confidence_assessments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confidence_assessments" ADD CONSTRAINT "confidence_assessments_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confidence_assessments" ADD CONSTRAINT "confidence_assessments_failure_analysis_run_id_fkey" FOREIGN KEY ("failure_analysis_run_id") REFERENCES "failure_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confidence_assessments" ADD CONSTRAINT "confidence_assessments_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "confidence_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_attributions" ADD CONSTRAINT "evidence_attributions_confidence_assessment_id_fkey" FOREIGN KEY ("confidence_assessment_id") REFERENCES "confidence_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_attributions" ADD CONSTRAINT "evidence_attributions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_attributions" ADD CONSTRAINT "evidence_attributions_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
