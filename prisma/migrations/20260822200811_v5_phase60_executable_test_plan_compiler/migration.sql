-- CreateEnum
CREATE TYPE "PlanCompilationStatus" AS ENUM ('VALID', 'INVALID', 'STALE', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "executable_test_plans" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "test_case_version_id" UUID,
    "test_case_version_number" INTEGER NOT NULL,
    "environment_id" UUID,
    "target_application_id" UUID,
    "compiler_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "plan_schema_version" INTEGER NOT NULL DEFAULT 1,
    "status" "PlanCompilationStatus" NOT NULL DEFAULT 'VALID',
    "plan_fingerprint" VARCHAR(64) NOT NULL,
    "source_requirement_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_requirement_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "preconditions_json" JSONB NOT NULL DEFAULT '[]',
    "steps_json" JSONB NOT NULL DEFAULT '[]',
    "assertions_json" JSONB NOT NULL DEFAULT '[]',
    "postconditions_json" JSONB NOT NULL DEFAULT '[]',
    "diagnostics_json" JSONB NOT NULL DEFAULT '[]',
    "has_errors" BOOLEAN NOT NULL DEFAULT false,
    "has_warnings" BOOLEAN NOT NULL DEFAULT false,
    "is_executable" BOOLEAN NOT NULL DEFAULT true,
    "compiled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executable_test_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "executable_test_plans_project_id_idx" ON "executable_test_plans"("project_id");

-- CreateIndex
CREATE INDEX "executable_test_plans_test_case_id_idx" ON "executable_test_plans"("test_case_id");

-- CreateIndex
CREATE INDEX "executable_test_plans_test_case_id_test_case_version_number_idx" ON "executable_test_plans"("test_case_id", "test_case_version_number");

-- CreateIndex
CREATE INDEX "executable_test_plans_environment_id_idx" ON "executable_test_plans"("environment_id");

-- CreateIndex
CREATE INDEX "executable_test_plans_project_id_status_idx" ON "executable_test_plans"("project_id", "status");

-- CreateIndex
CREATE INDEX "executable_test_plans_plan_fingerprint_idx" ON "executable_test_plans"("plan_fingerprint");

-- AddForeignKey
ALTER TABLE "executable_test_plans" ADD CONSTRAINT "executable_test_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executable_test_plans" ADD CONSTRAINT "executable_test_plans_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executable_test_plans" ADD CONSTRAINT "executable_test_plans_test_case_version_id_fkey" FOREIGN KEY ("test_case_version_id") REFERENCES "test_case_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executable_test_plans" ADD CONSTRAINT "executable_test_plans_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "project_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executable_test_plans" ADD CONSTRAINT "executable_test_plans_target_application_id_fkey" FOREIGN KEY ("target_application_id") REFERENCES "target_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
