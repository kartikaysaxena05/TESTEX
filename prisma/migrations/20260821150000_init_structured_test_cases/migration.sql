-- CreateEnum
CREATE TYPE "TestCaseType" AS ENUM ('POSITIVE', 'NEGATIVE', 'BOUNDARY', 'VALIDATION', 'SECURITY', 'PERFORMANCE', 'ACCESSIBILITY', 'COMPATIBILITY', 'REGRESSION', 'SMOKE', 'EXPLORATORY', 'END_TO_END', 'INTEGRATION', 'UNIT', 'OTHER');

-- CreateEnum
CREATE TYPE "TestCasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "TestCaseStatus" AS ENUM ('DRAFT', 'GENERATED', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "TestCaseExecutionSuitability" AS ENUM ('AUTOMATED', 'MANUAL', 'SEMI_AUTOMATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PreconditionCategory" AS ENUM ('AUTHENTICATION', 'AUTHORIZATION', 'APPLICATION_STATE', 'DATA_STATE', 'ACCOUNT_STATE', 'RESOURCE_STATE', 'CONFIGURATION', 'FEATURE_FLAG', 'ENVIRONMENT', 'DEPENDENCY', 'SESSION_STATE', 'WORKFLOW_STATE', 'NONE', 'OTHER');

-- CreateTable
CREATE TABLE "project_test_case_sequences" (
    "project_id" UUID NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_test_case_sequences_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_case_key" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "objective" TEXT NOT NULL,
    "description" TEXT,
    "type" "TestCaseType" NOT NULL DEFAULT 'POSITIVE',
    "priority" "TestCasePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TestCaseStatus" NOT NULL DEFAULT 'GENERATED',
    "execution_suitability" "TestCaseExecutionSuitability" NOT NULL DEFAULT 'UNKNOWN',
    "source_requirement_id" UUID,
    "source_requirement_key" VARCHAR(64),
    "source_requirement_version_id" UUID,
    "source_requirement_version_number" INTEGER,
    "source_scenario_candidate_id" UUID,
    "source_scenario_key" VARCHAR(64),
    "generation_id" UUID,
    "input_fingerprint" VARCHAR(64),
    "provider_id" VARCHAR(64),
    "model" VARCHAR(128),
    "prompt_id" VARCHAR(64),
    "prompt_version" INTEGER,
    "overall_expected_result" TEXT,
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "unknowns" JSONB NOT NULL DEFAULT '[]',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_preconditions" (
    "id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "sequence_order" INTEGER NOT NULL,
    "category" "PreconditionCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "is_enforced" BOOLEAN NOT NULL DEFAULT true,
    "confidence" VARCHAR(32) NOT NULL DEFAULT 'HIGH',
    "source_evidence_refs_json" JSONB NOT NULL DEFAULT '[]',
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_preconditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_steps" (
    "id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "step_number" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "expected_result" TEXT,
    "test_data_summary" TEXT,
    "state_change_from" VARCHAR(255),
    "state_change_to" VARCHAR(255),
    "state_entity" VARCHAR(255),
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_test_data_items" (
    "id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "sequence_order" INTEGER NOT NULL DEFAULT 0,
    "name" VARCHAR(256) NOT NULL,
    "data_type" VARCHAR(64) NOT NULL DEFAULT 'STRING',
    "origin" VARCHAR(64) NOT NULL DEFAULT 'DERIVED',
    "value_json" JSONB,
    "generator" VARCHAR(512),
    "constraint" TEXT,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "unknown_reason" TEXT,
    "confidence" VARCHAR(32) NOT NULL DEFAULT 'HIGH',
    "source_evidence_refs_json" JSONB NOT NULL DEFAULT '[]',
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_test_data_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_project_id_test_case_key_key" ON "test_cases"("project_id", "test_case_key");

-- CreateIndex
CREATE INDEX "test_cases_project_id_idx" ON "test_cases"("project_id");

-- CreateIndex
CREATE INDEX "test_cases_project_id_status_idx" ON "test_cases"("project_id", "status");

-- CreateIndex
CREATE INDEX "test_cases_project_id_type_idx" ON "test_cases"("project_id", "type");

-- CreateIndex
CREATE INDEX "test_cases_source_requirement_id_idx" ON "test_cases"("source_requirement_id");

-- CreateIndex
CREATE INDEX "test_cases_source_requirement_id_source_requirement_version_idx" ON "test_cases"("source_requirement_id", "source_requirement_version_number");

-- CreateIndex
CREATE INDEX "test_cases_project_id_input_fingerprint_idx" ON "test_cases"("project_id", "input_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "test_case_preconditions_test_case_id_sequence_order_key" ON "test_case_preconditions"("test_case_id", "sequence_order");

-- CreateIndex
CREATE INDEX "test_case_preconditions_test_case_id_idx" ON "test_case_preconditions"("test_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_case_steps_test_case_id_step_number_key" ON "test_case_steps"("test_case_id", "step_number");

-- CreateIndex
CREATE INDEX "test_case_steps_test_case_id_idx" ON "test_case_steps"("test_case_id");

-- CreateIndex
CREATE INDEX "test_case_test_data_items_test_case_id_idx" ON "test_case_test_data_items"("test_case_id");

-- AddForeignKey
ALTER TABLE "project_test_case_sequences" ADD CONSTRAINT "project_test_case_sequences_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_source_requirement_id_fkey" FOREIGN KEY ("source_requirement_id") REFERENCES "requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_source_requirement_version_id_fkey" FOREIGN KEY ("source_requirement_version_id") REFERENCES "requirement_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_source_scenario_candidate_id_fkey" FOREIGN KEY ("source_scenario_candidate_id") REFERENCES "requirement_scenario_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_preconditions" ADD CONSTRAINT "test_case_preconditions_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_steps" ADD CONSTRAINT "test_case_steps_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_test_data_items" ADD CONSTRAINT "test_case_test_data_items_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
