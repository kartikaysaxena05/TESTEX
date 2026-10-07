-- CreateEnum
CREATE TYPE "EvidenceBundleStatus" AS ENUM ('PENDING', 'COLLECTING', 'COMPLETE', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "EvidenceArtifactType" AS ENUM ('SCREENSHOT', 'PLAYWRIGHT_TRACE', 'CONSOLE_LOG', 'NETWORK_LOG', 'NETWORK_REQUEST', 'NETWORK_RESPONSE', 'DOM_SNAPSHOT', 'PAGE_METADATA', 'ASSERTION_CONTEXT', 'ERROR_CONTEXT');

-- CreateEnum
CREATE TYPE "EvidenceRedactionStatus" AS ENUM ('NONE', 'REDACTED', 'PARTIALLY_REDACTED');

-- CreateEnum
CREATE TYPE "EvidenceStorageRetentionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DELETED');

-- CreateTable
CREATE TABLE "execution_evidence_bundles" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_execution_id" UUID,
    "step_index" INTEGER,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "EvidenceBundleStatus" NOT NULL DEFAULT 'PENDING',
    "failure_timestamp" TIMESTAMPTZ(6),
    "collection_started_at" TIMESTAMPTZ(6),
    "collection_completed_at" TIMESTAMPTZ(6),
    "retention_status" "EvidenceStorageRetentionStatus" NOT NULL DEFAULT 'ACTIVE',
    "error_summary" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_evidence_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_evidence_artifacts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "bundle_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_execution_id" UUID,
    "artifact_type" "EvidenceArtifactType" NOT NULL,
    "storage_identity" VARCHAR(128) NOT NULL,
    "original_logical_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "redaction_status" "EvidenceRedactionStatus" NOT NULL DEFAULT 'NONE',
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "persisted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_evidence_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "execution_evidence_bundles_project_id_idx" ON "execution_evidence_bundles"("project_id");

-- CreateIndex
CREATE INDEX "execution_evidence_bundles_test_run_id_idx" ON "execution_evidence_bundles"("test_run_id");

-- CreateIndex
CREATE INDEX "execution_evidence_bundles_execution_id_idx" ON "execution_evidence_bundles"("execution_id");

-- CreateIndex
CREATE INDEX "execution_evidence_bundles_step_execution_id_idx" ON "execution_evidence_bundles"("step_execution_id");

-- CreateIndex
CREATE INDEX "execution_evidence_bundles_status_idx" ON "execution_evidence_bundles"("status");

-- CreateIndex
CREATE INDEX "execution_evidence_bundles_created_at_idx" ON "execution_evidence_bundles"("created_at");

-- CreateIndex
CREATE INDEX "execution_evidence_artifacts_project_id_idx" ON "execution_evidence_artifacts"("project_id");

-- CreateIndex
CREATE INDEX "execution_evidence_artifacts_bundle_id_idx" ON "execution_evidence_artifacts"("bundle_id");

-- CreateIndex
CREATE INDEX "execution_evidence_artifacts_test_run_id_idx" ON "execution_evidence_artifacts"("test_run_id");

-- CreateIndex
CREATE INDEX "execution_evidence_artifacts_execution_id_idx" ON "execution_evidence_artifacts"("execution_id");

-- CreateIndex
CREATE INDEX "execution_evidence_artifacts_step_execution_id_idx" ON "execution_evidence_artifacts"("step_execution_id");

-- CreateIndex
CREATE INDEX "execution_evidence_artifacts_artifact_type_idx" ON "execution_evidence_artifacts"("artifact_type");

-- CreateIndex
CREATE INDEX "execution_evidence_artifacts_captured_at_idx" ON "execution_evidence_artifacts"("captured_at");

-- AddForeignKey
ALTER TABLE "execution_evidence_bundles" ADD CONSTRAINT "execution_evidence_bundles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_evidence_bundles" ADD CONSTRAINT "execution_evidence_bundles_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_evidence_bundles" ADD CONSTRAINT "execution_evidence_bundles_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "test_case_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_evidence_bundles" ADD CONSTRAINT "execution_evidence_bundles_step_execution_id_fkey" FOREIGN KEY ("step_execution_id") REFERENCES "step_execution_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_evidence_artifacts" ADD CONSTRAINT "execution_evidence_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_evidence_artifacts" ADD CONSTRAINT "execution_evidence_artifacts_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "execution_evidence_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_evidence_artifacts" ADD CONSTRAINT "execution_evidence_artifacts_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_evidence_artifacts" ADD CONSTRAINT "execution_evidence_artifacts_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "test_case_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_evidence_artifacts" ADD CONSTRAINT "execution_evidence_artifacts_step_execution_id_fkey" FOREIGN KEY ("step_execution_id") REFERENCES "step_execution_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
