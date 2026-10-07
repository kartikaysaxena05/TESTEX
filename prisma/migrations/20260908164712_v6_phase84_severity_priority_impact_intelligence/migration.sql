-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "DefectPriority" AS ENUM ('P0_IMMEDIATE', 'P1_URGENT', 'P2_NORMAL', 'P3_LOW', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReleaseRecommendation" AS ENUM ('BLOCK_RELEASE', 'REVIEW_REQUIRED', 'NON_BLOCKING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DataImpact" AS ENUM ('NO_DATA_IMPACT', 'DISPLAY_ONLY', 'INCORRECT_READ', 'FAILED_WRITE', 'INCORRECT_WRITE', 'DUPLICATE_WRITE', 'PARTIAL_WRITE', 'DATA_INCONSISTENCY', 'DATA_CORRUPTION', 'DATA_LOSS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SecurityImpact" AS ENUM ('NONE_PROVEN', 'AUTHENTICATION_BYPASS', 'AUTHORIZATION_BYPASS', 'SESSION_EXPOSURE', 'CREDENTIAL_LEAK', 'PRIVILEGE_ESCALATION', 'DATA_EXPOSURE', 'SUSPECTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "UserImpactScope" AS ENUM ('ALL_USERS', 'MULTIPLE_USERS', 'SPECIFIC_ROLE', 'SINGLE_USER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AvailabilityImpact" AS ENUM ('FULL_OUTAGE', 'DEGRADED', 'SERVICE_UNAVAILABLE', 'MODULE_UNAVAILABLE', 'PAGE_UNAVAILABLE', 'ACTION_UNAVAILABLE', 'NONE_AFFECTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BlastRadius" AS ENUM ('PROJECT_WIDE', 'MULTIPLE_MODULES', 'SINGLE_MODULE', 'SINGLE_FEATURE', 'SINGLE_REQUIREMENT', 'SINGLE_TEST', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WorkaroundStatus" AS ENUM ('WORKAROUND_AVAILABLE', 'WORKAROUND_PARTIAL', 'NO_WORKAROUND', 'UNKNOWN');

-- CreateTable
CREATE TABLE "failure_impact_assessments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "test_case_version_number" INTEGER NOT NULL DEFAULT 1,
    "failure_analysis_run_id" UUID,
    "deterministic_classification_id" UUID,
    "technical_localization_id" UUID,
    "domain_separation_id" UUID,
    "ai_assessment_id" UUID,
    "root_cause_analysis_id" UUID,
    "severity" "DefectSeverity" NOT NULL,
    "severity_rule_id" VARCHAR(64) NOT NULL,
    "severity_rationale" TEXT NOT NULL,
    "severity_reasons" JSONB NOT NULL DEFAULT '[]',
    "priority" "DefectPriority" NOT NULL,
    "priority_rule_id" VARCHAR(64) NOT NULL,
    "priority_rationale" TEXT NOT NULL,
    "priority_reasons" JSONB NOT NULL DEFAULT '[]',
    "release_recommendation" "ReleaseRecommendation" NOT NULL,
    "release_recommendation_rationale" TEXT NOT NULL,
    "user_impact" "UserImpactScope" NOT NULL,
    "user_impact_details" TEXT,
    "functional_impact" TEXT NOT NULL,
    "business_impact" TEXT NOT NULL,
    "business_criticality" VARCHAR(64) NOT NULL DEFAULT 'UNKNOWN',
    "data_impact" "DataImpact" NOT NULL,
    "data_impact_details" TEXT,
    "security_impact" "SecurityImpact" NOT NULL,
    "security_impact_details" TEXT,
    "availability_impact" "AvailabilityImpact" NOT NULL,
    "integration_impact" TEXT NOT NULL,
    "blast_radius" "BlastRadius" NOT NULL,
    "workaround_status" "WorkaroundStatus" NOT NULL,
    "workaround_details" TEXT,
    "supporting_evidence" JSONB NOT NULL DEFAULT '[]',
    "conflicting_signals" JSONB NOT NULL DEFAULT '[]',
    "unknown_factors" JSONB NOT NULL DEFAULT '[]',
    "severity_model_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "priority_model_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "impact_model_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "assessment_fingerprint" VARCHAR(64) NOT NULL,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "staleness_reason" TEXT,
    "reassessment_count" INTEGER NOT NULL DEFAULT 0,
    "last_reassessed_at" TIMESTAMPTZ(6),
    "reassessment_reason" TEXT,
    "superseded_by_id" UUID,
    "assessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_impact_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "failure_impact_assessments_project_id_idx" ON "failure_impact_assessments"("project_id");

-- CreateIndex
CREATE INDEX "failure_impact_assessments_failure_case_id_idx" ON "failure_impact_assessments"("failure_case_id");

-- CreateIndex
CREATE INDEX "failure_impact_assessments_test_case_id_idx" ON "failure_impact_assessments"("test_case_id");

-- CreateIndex
CREATE INDEX "failure_impact_assessments_severity_idx" ON "failure_impact_assessments"("severity");

-- CreateIndex
CREATE INDEX "failure_impact_assessments_priority_idx" ON "failure_impact_assessments"("priority");

-- CreateIndex
CREATE INDEX "failure_impact_assessments_release_recommendation_idx" ON "failure_impact_assessments"("release_recommendation");

-- CreateIndex
CREATE INDEX "failure_impact_assessments_is_authoritative_idx" ON "failure_impact_assessments"("is_authoritative");

-- CreateIndex
CREATE INDEX "failure_impact_assessments_assessment_fingerprint_idx" ON "failure_impact_assessments"("assessment_fingerprint");

-- CreateIndex
CREATE INDEX "failure_impact_assessments_assessed_at_idx" ON "failure_impact_assessments"("assessed_at");

-- CreateIndex
CREATE INDEX "failure_impact_assessments_created_at_idx" ON "failure_impact_assessments"("created_at");

-- AddForeignKey
ALTER TABLE "failure_impact_assessments" ADD CONSTRAINT "failure_impact_assessments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_impact_assessments" ADD CONSTRAINT "failure_impact_assessments_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_impact_assessments" ADD CONSTRAINT "failure_impact_assessments_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_impact_assessments" ADD CONSTRAINT "failure_impact_assessments_failure_analysis_run_id_fkey" FOREIGN KEY ("failure_analysis_run_id") REFERENCES "failure_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_impact_assessments" ADD CONSTRAINT "failure_impact_assessments_deterministic_classification_id_fkey" FOREIGN KEY ("deterministic_classification_id") REFERENCES "failure_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_impact_assessments" ADD CONSTRAINT "failure_impact_assessments_technical_localization_id_fkey" FOREIGN KEY ("technical_localization_id") REFERENCES "failure_technical_localizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_impact_assessments" ADD CONSTRAINT "failure_impact_assessments_domain_separation_id_fkey" FOREIGN KEY ("domain_separation_id") REFERENCES "failure_domain_separations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_impact_assessments" ADD CONSTRAINT "failure_impact_assessments_ai_assessment_id_fkey" FOREIGN KEY ("ai_assessment_id") REFERENCES "failure_ai_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_impact_assessments" ADD CONSTRAINT "failure_impact_assessments_root_cause_analysis_id_fkey" FOREIGN KEY ("root_cause_analysis_id") REFERENCES "failure_root_cause_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_impact_assessments" ADD CONSTRAINT "failure_impact_assessments_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "failure_impact_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
