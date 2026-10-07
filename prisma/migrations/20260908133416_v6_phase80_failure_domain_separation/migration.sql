-- CreateEnum
CREATE TYPE "FailureDomain" AS ENUM ('APPLICATION_DEFECT_CANDIDATE', 'AUTOMATION_FAILURE', 'TEST_DATA_FAILURE', 'ENVIRONMENT_FAILURE', 'BLOCKED', 'INCONCLUSIVE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "failure_domain_separations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "failure_analysis_run_id" UUID,
    "classification_id" UUID,
    "decision_integrity_id" UUID,
    "flakiness_analysis_id" UUID,
    "test_case_id" UUID NOT NULL,
    "domain" "FailureDomain" NOT NULL,
    "domain_subreason" VARCHAR(128),
    "separation_rules_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "primary_rationale" TEXT NOT NULL,
    "decision_explanation" TEXT NOT NULL,
    "matched_rule_ids" JSONB NOT NULL DEFAULT '[]',
    "excluded_domains" JSONB NOT NULL DEFAULT '[]',
    "exclusion_reasons" JSONB NOT NULL DEFAULT '{}',
    "conflicting_signals" JSONB NOT NULL DEFAULT '[]',
    "evidence_references" JSONB NOT NULL DEFAULT '[]',
    "reproduction_summary" JSONB NOT NULL DEFAULT '{}',
    "flakiness_summary" JSONB NOT NULL DEFAULT '{}',
    "separation_fingerprint" VARCHAR(64) NOT NULL,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "staleness_reason" TEXT,
    "reevaluation_count" INTEGER NOT NULL DEFAULT 0,
    "last_reevaluated_at" TIMESTAMPTZ(6),
    "reevaluation_reason" TEXT,
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_domain_separations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "failure_domain_separations_project_id_idx" ON "failure_domain_separations"("project_id");

-- CreateIndex
CREATE INDEX "failure_domain_separations_failure_case_id_idx" ON "failure_domain_separations"("failure_case_id");

-- CreateIndex
CREATE INDEX "failure_domain_separations_test_case_id_idx" ON "failure_domain_separations"("test_case_id");

-- CreateIndex
CREATE INDEX "failure_domain_separations_domain_idx" ON "failure_domain_separations"("domain");

-- CreateIndex
CREATE INDEX "failure_domain_separations_is_authoritative_idx" ON "failure_domain_separations"("is_authoritative");

-- CreateIndex
CREATE INDEX "failure_domain_separations_separation_fingerprint_idx" ON "failure_domain_separations"("separation_fingerprint");

-- CreateIndex
CREATE INDEX "failure_domain_separations_evaluated_at_idx" ON "failure_domain_separations"("evaluated_at");

-- CreateIndex
CREATE INDEX "failure_domain_separations_created_at_idx" ON "failure_domain_separations"("created_at");

-- AddForeignKey
ALTER TABLE "failure_domain_separations" ADD CONSTRAINT "failure_domain_separations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_domain_separations" ADD CONSTRAINT "failure_domain_separations_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_domain_separations" ADD CONSTRAINT "failure_domain_separations_failure_analysis_run_id_fkey" FOREIGN KEY ("failure_analysis_run_id") REFERENCES "failure_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_domain_separations" ADD CONSTRAINT "failure_domain_separations_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "failure_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_domain_separations" ADD CONSTRAINT "failure_domain_separations_decision_integrity_id_fkey" FOREIGN KEY ("decision_integrity_id") REFERENCES "classification_decision_integrities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_domain_separations" ADD CONSTRAINT "failure_domain_separations_flakiness_analysis_id_fkey" FOREIGN KEY ("flakiness_analysis_id") REFERENCES "failure_flakiness_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_domain_separations" ADD CONSTRAINT "failure_domain_separations_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
