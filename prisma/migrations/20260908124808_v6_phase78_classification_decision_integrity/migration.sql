-- CreateEnum
CREATE TYPE "DecisionIntegrityState" AS ENUM ('VALID', 'STALE', 'INVALIDATED', 'CONFLICTED', 'INSUFFICIENT', 'BLOCKED');

-- CreateEnum
CREATE TYPE "EvidenceFreshnessState" AS ENUM ('CURRENT', 'STALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DecisionConsistencyState" AS ENUM ('CONSISTENT', 'INCONSISTENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DecisionArbitrationState" AS ENUM ('SUPPORTED', 'OVERRIDDEN', 'CONFLICTED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "classification_decision_integrities" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "classification_id" UUID NOT NULL,
    "classifier_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "taxonomy_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "evidence_package_identity" VARCHAR(128) NOT NULL,
    "evidence_package_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "evidence_integrity_state" "EvidenceIntegrityStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "reproduction_snapshot_identity" VARCHAR(128) NOT NULL,
    "reproduction_summary_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "decision_fingerprint" VARCHAR(64) NOT NULL,
    "decision_state" "DecisionIntegrityState" NOT NULL,
    "evidence_freshness_state" "EvidenceFreshnessState" NOT NULL,
    "consistency_state" "DecisionConsistencyState" NOT NULL,
    "arbitration_state" "DecisionArbitrationState" NOT NULL,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "blocking_reasons" JSONB NOT NULL DEFAULT '[]',
    "warning_reasons" JSONB NOT NULL DEFAULT '[]',
    "conflict_details_json" JSONB NOT NULL DEFAULT '{}',
    "material_changes_json" JSONB NOT NULL DEFAULT '[]',
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classification_decision_integrities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "classification_decision_integrities_project_id_idx" ON "classification_decision_integrities"("project_id");

-- CreateIndex
CREATE INDEX "classification_decision_integrities_failure_case_id_idx" ON "classification_decision_integrities"("failure_case_id");

-- CreateIndex
CREATE INDEX "classification_decision_integrities_classification_id_idx" ON "classification_decision_integrities"("classification_id");

-- CreateIndex
CREATE INDEX "classification_decision_integrities_decision_state_idx" ON "classification_decision_integrities"("decision_state");

-- CreateIndex
CREATE INDEX "classification_decision_integrities_decision_fingerprint_idx" ON "classification_decision_integrities"("decision_fingerprint");

-- CreateIndex
CREATE INDEX "classification_decision_integrities_is_authoritative_idx" ON "classification_decision_integrities"("is_authoritative");

-- CreateIndex
CREATE INDEX "classification_decision_integrities_evaluated_at_idx" ON "classification_decision_integrities"("evaluated_at");

-- CreateIndex
CREATE INDEX "classification_decision_integrities_created_at_idx" ON "classification_decision_integrities"("created_at");

-- AddForeignKey
ALTER TABLE "classification_decision_integrities" ADD CONSTRAINT "classification_decision_integrities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classification_decision_integrities" ADD CONSTRAINT "classification_decision_integrities_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classification_decision_integrities" ADD CONSTRAINT "classification_decision_integrities_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "failure_classifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
