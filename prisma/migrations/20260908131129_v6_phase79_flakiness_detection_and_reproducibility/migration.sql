-- CreateEnum
CREATE TYPE "FlakinessState" AS ENUM ('STABLE_FAILURE', 'STABLE_PASS', 'FLAKY_CANDIDATE', 'CONFIRMED_FLAKY', 'INCONCLUSIVE', 'INSUFFICIENT_EVIDENCE', 'ENVIRONMENT_VARIABILITY', 'EXECUTION_VARIABILITY');

-- CreateEnum
CREATE TYPE "StabilityState" AS ENUM ('STABLE', 'INTERMITTENT', 'UNSTABLE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "failure_flakiness_analyses" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "classification_id" UUID,
    "decision_integrity_id" UUID,
    "test_case_id" UUID NOT NULL,
    "test_case_version_id" UUID,
    "test_case_version_number" INTEGER NOT NULL,
    "analysis_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "flakiness_policy_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "flakiness_state" "FlakinessState" NOT NULL,
    "stability_state" "StabilityState" NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "valid_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "pass_count" INTEGER NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "blocked_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_count" INTEGER NOT NULL DEFAULT 0,
    "execution_error_count" INTEGER NOT NULL DEFAULT 0,
    "equivalent_failure_count" INTEGER NOT NULL DEFAULT 0,
    "different_failure_count" INTEGER NOT NULL DEFAULT 0,
    "same_step_failure_count" INTEGER NOT NULL DEFAULT 0,
    "different_step_failure_count" INTEGER NOT NULL DEFAULT 0,
    "environment_comparable_count" INTEGER NOT NULL DEFAULT 0,
    "environment_drift_count" INTEGER NOT NULL DEFAULT 0,
    "reproducibility_ratio" DOUBLE PRECISION,
    "pass_rate" DOUBLE PRECISION,
    "failure_rate" DOUBLE PRECISION,
    "dominant_failure_signature" VARCHAR(128),
    "analysis_fingerprint" VARCHAR(64) NOT NULL,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "staleness_reason" TEXT,
    "analysis_explanation" TEXT,
    "attempt_timeline_json" JSONB NOT NULL DEFAULT '[]',
    "warnings_json" JSONB NOT NULL DEFAULT '[]',
    "evidence_gaps_json" JSONB NOT NULL DEFAULT '[]',
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_flakiness_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "failure_flakiness_analyses_project_id_idx" ON "failure_flakiness_analyses"("project_id");

-- CreateIndex
CREATE INDEX "failure_flakiness_analyses_failure_case_id_idx" ON "failure_flakiness_analyses"("failure_case_id");

-- CreateIndex
CREATE INDEX "failure_flakiness_analyses_test_case_id_idx" ON "failure_flakiness_analyses"("test_case_id");

-- CreateIndex
CREATE INDEX "failure_flakiness_analyses_flakiness_state_idx" ON "failure_flakiness_analyses"("flakiness_state");

-- CreateIndex
CREATE INDEX "failure_flakiness_analyses_stability_state_idx" ON "failure_flakiness_analyses"("stability_state");

-- CreateIndex
CREATE INDEX "failure_flakiness_analyses_is_authoritative_idx" ON "failure_flakiness_analyses"("is_authoritative");

-- CreateIndex
CREATE INDEX "failure_flakiness_analyses_analysis_fingerprint_idx" ON "failure_flakiness_analyses"("analysis_fingerprint");

-- CreateIndex
CREATE INDEX "failure_flakiness_analyses_evaluated_at_idx" ON "failure_flakiness_analyses"("evaluated_at");

-- CreateIndex
CREATE INDEX "failure_flakiness_analyses_created_at_idx" ON "failure_flakiness_analyses"("created_at");

-- AddForeignKey
ALTER TABLE "failure_flakiness_analyses" ADD CONSTRAINT "failure_flakiness_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_flakiness_analyses" ADD CONSTRAINT "failure_flakiness_analyses_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_flakiness_analyses" ADD CONSTRAINT "failure_flakiness_analyses_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "failure_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_flakiness_analyses" ADD CONSTRAINT "failure_flakiness_analyses_decision_integrity_id_fkey" FOREIGN KEY ("decision_integrity_id") REFERENCES "classification_decision_integrities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_flakiness_analyses" ADD CONSTRAINT "failure_flakiness_analyses_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_flakiness_analyses" ADD CONSTRAINT "failure_flakiness_analyses_test_case_version_id_fkey" FOREIGN KEY ("test_case_version_id") REFERENCES "test_case_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
