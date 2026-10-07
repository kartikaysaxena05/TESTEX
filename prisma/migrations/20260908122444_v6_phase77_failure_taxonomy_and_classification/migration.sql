-- CreateEnum
CREATE TYPE "FailureCategory" AS ENUM ('APPLICATION_FAILURE', 'AUTOMATION_FAILURE', 'TEST_DATA_FAILURE', 'ENVIRONMENT_FAILURE', 'REQUIREMENT_AMBIGUITY', 'INVALID_TEST', 'BLOCKED_EXECUTION', 'UNKNOWN', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "FailureSubcategory" AS ENUM ('ASSERTION_MISMATCH', 'HTTP_ERROR_RESPONSE', 'UNEXPECTED_UI_STATE', 'MISSING_EXPECTED_ELEMENT', 'APPLICATION_CRASH', 'APPLICATION_CONSOLE_ERROR', 'LOCATOR_NOT_FOUND', 'AMBIGUOUS_LOCATOR', 'BROWSER_CRASH', 'PLAYWRIGHT_ERROR', 'TIMEOUT', 'ACTION_EXECUTION_ERROR', 'UNSUPPORTED_BROWSER', 'AUTOMATION_INFRASTRUCTURE_ERROR', 'MISSING_TEST_DATA', 'INVALID_TEST_DATA', 'EXPIRED_TEST_DATA', 'DATA_PRECONDITION_FAILURE', 'TARGET_UNREACHABLE', 'ENVIRONMENT_CONFIGURATION_MISSING', 'INCOMPATIBLE_RUNTIME', 'ENVIRONMENT_DRIFT', 'DEPENDENCY_UNAVAILABLE', 'REQUIREMENT_INCONSISTENCY', 'TEST_DEFINITION_INVALID', 'UNSPECIFIED_FAILURE');

-- CreateTable
CREATE TABLE "failure_classifications" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "analysis_run_id" UUID,
    "category" "FailureCategory" NOT NULL,
    "subcategory" "FailureSubcategory",
    "classifier_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "taxonomy_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "primary_rule_id" VARCHAR(64) NOT NULL,
    "matched_rule_ids" JSONB NOT NULL DEFAULT '[]',
    "rule_explanations_json" JSONB NOT NULL DEFAULT '[]',
    "conflicting_rule_ids" JSONB NOT NULL DEFAULT '[]',
    "evidence_references_json" JSONB NOT NULL DEFAULT '[]',
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "reclassification_reason" TEXT,
    "superseded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "failure_classifications_project_id_idx" ON "failure_classifications"("project_id");

-- CreateIndex
CREATE INDEX "failure_classifications_failure_case_id_idx" ON "failure_classifications"("failure_case_id");

-- CreateIndex
CREATE INDEX "failure_classifications_category_idx" ON "failure_classifications"("category");

-- CreateIndex
CREATE INDEX "failure_classifications_is_authoritative_idx" ON "failure_classifications"("is_authoritative");

-- CreateIndex
CREATE INDEX "failure_classifications_project_id_is_authoritative_idx" ON "failure_classifications"("project_id", "is_authoritative");

-- CreateIndex
CREATE INDEX "failure_classifications_created_at_idx" ON "failure_classifications"("created_at");

-- AddForeignKey
ALTER TABLE "failure_classifications" ADD CONSTRAINT "failure_classifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_classifications" ADD CONSTRAINT "failure_classifications_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_classifications" ADD CONSTRAINT "failure_classifications_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "failure_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_classifications" ADD CONSTRAINT "failure_classifications_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "failure_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
