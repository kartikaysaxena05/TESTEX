-- CreateEnum
CREATE TYPE "ProductionSafetyPolicy" AS ENUM ('PROHIBITED', 'MANUAL_APPROVAL_REQUIRED', 'SAFE_MODE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EnvironmentType" ADD VALUE 'QA';
ALTER TYPE "EnvironmentType" ADD VALUE 'UAT';

-- DropIndex
DROP INDEX "vector_embeddings_vector_cosine_idx";

-- AlterTable
ALTER TABLE "project_environments" ADD COLUMN     "browser_engine" VARCHAR(32) NOT NULL DEFAULT 'chromium',
ADD COLUMN     "color_scheme" VARCHAR(20) NOT NULL DEFAULT 'light',
ADD COLUMN     "extra_headers" JSONB,
ADD COLUMN     "headless" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ignore_https_errors" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_production" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locale" VARCHAR(32),
ADD COLUMN     "notes" VARCHAR(2000),
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "production_safety_policy" "ProductionSafetyPolicy" NOT NULL DEFAULT 'PROHIBITED',
ADD COLUMN     "secret_references" JSONB,
ADD COLUMN     "target_application_id" UUID,
ADD COLUMN     "timezone_id" VARCHAR(64),
ADD COLUMN     "variables" JSONB,
ADD COLUMN     "viewport_height" INTEGER NOT NULL DEFAULT 720,
ADD COLUMN     "viewport_width" INTEGER NOT NULL DEFAULT 1280;

-- AlterTable
ALTER TABLE "test_case_validation_findings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "test_case_validations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vector_embeddings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "target_applications" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "default_environment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "target_applications_project_id_key" ON "target_applications"("project_id");

-- CreateIndex
CREATE INDEX "project_environments_target_application_id_idx" ON "project_environments"("target_application_id");

-- AddForeignKey
ALTER TABLE "target_applications" ADD CONSTRAINT "target_applications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_environments" ADD CONSTRAINT "project_environments_target_application_id_fkey" FOREIGN KEY ("target_application_id") REFERENCES "target_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "requirement_ai_analyses_project_id_input_sha256_context_s_idx" RENAME TO "requirement_ai_analyses_project_id_input_sha256_context_sha_idx";

-- RenameIndex
ALTER INDEX "requirement_ai_analyses_requirement_id_requirement_versio_idx" RENAME TO "requirement_ai_analyses_requirement_id_requirement_version__idx";

-- RenameIndex
ALTER INDEX "requirement_scenario_generations_project_id_input_fingerprint_i" RENAME TO "requirement_scenario_generations_project_id_input_fingerpri_idx";

-- RenameIndex
ALTER INDEX "requirement_scenario_generations_requirement_id_requirement_ver" RENAME TO "requirement_scenario_generations_requirement_id_requirement_idx";

-- RenameIndex
ALTER INDEX "requirement_test_designs_requirement_id_requirement_version_num" RENAME TO "requirement_test_designs_requirement_id_requirement_version_idx";
