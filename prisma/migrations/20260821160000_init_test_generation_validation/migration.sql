-- CreateEnum
CREATE TYPE "TestValidationStatus" AS ENUM ('VALID', 'REVIEW_REQUIRED', 'REJECTED', 'VALIDATION_ERROR');

-- CreateEnum
CREATE TYPE "TestValidationSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'BLOCKER');

-- CreateTable
CREATE TABLE "test_case_validations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "test_case_id" UUID,
    "requirement_id" UUID NOT NULL,
    "requirement_version_number" INTEGER,
    "validator_version" VARCHAR(64) NOT NULL DEFAULT 'test-validation-v1',
    "status" "TestValidationStatus" NOT NULL DEFAULT 'VALID',
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "stale_reason" TEXT,
    "test_content_hash" VARCHAR(64) NOT NULL,
    "requirement_content_hash" VARCHAR(64),
    "summary" TEXT,
    "metrics_json" JSONB NOT NULL DEFAULT '{}',
    "provenance_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_validation_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "validation_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "severity" "TestValidationSeverity" NOT NULL DEFAULT 'WARNING',
    "field_path" VARCHAR(255),
    "message" TEXT NOT NULL,
    "evidence" TEXT,
    "source" VARCHAR(64),
    "suggested_action" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_validation_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_case_validations_project_id_idx" ON "test_case_validations"("project_id");

-- CreateIndex
CREATE INDEX "test_case_validations_test_case_id_idx" ON "test_case_validations"("test_case_id");

-- CreateIndex
CREATE INDEX "test_case_validations_requirement_id_idx" ON "test_case_validations"("requirement_id");

-- CreateIndex
CREATE INDEX "test_case_validations_project_id_status_idx" ON "test_case_validations"("project_id", "status");

-- CreateIndex
CREATE INDEX "test_case_validations_project_id_is_stale_idx" ON "test_case_validations"("project_id", "is_stale");

-- CreateIndex
CREATE INDEX "test_case_validation_findings_validation_id_idx" ON "test_case_validation_findings"("validation_id");

-- CreateIndex
CREATE INDEX "test_case_validation_findings_validation_id_severity_idx" ON "test_case_validation_findings"("validation_id", "severity");

-- CreateIndex
CREATE INDEX "test_case_validation_findings_code_idx" ON "test_case_validation_findings"("code");

-- AddForeignKey
ALTER TABLE "test_case_validations" ADD CONSTRAINT "test_case_validations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_validations" ADD CONSTRAINT "test_case_validations_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_validations" ADD CONSTRAINT "test_case_validations_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_validation_findings" ADD CONSTRAINT "test_case_validation_findings_validation_id_fkey" FOREIGN KEY ("validation_id") REFERENCES "test_case_validations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
