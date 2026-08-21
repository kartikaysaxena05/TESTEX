-- CreateEnum
CREATE TYPE "TestDesignStatus" AS ENUM ('CURRENT', 'STALE', 'FAILED', 'REQUIRES_REVIEW', 'INSUFFICIENT_INFORMATION');

-- CreateEnum
CREATE TYPE "TestDesignApplicability" AS ENUM ('APPLICABLE', 'PARTIALLY_APPLICABLE', 'INSUFFICIENT_INFORMATION', 'NOT_TESTABLE', 'REQUIRES_CLARIFICATION');

-- CreateEnum
CREATE TYPE "AutomationSuitability" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');

-- CreateTable
CREATE TABLE "requirement_test_designs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "requirement_version_id" UUID,
    "requirement_version_number" INTEGER NOT NULL,
    "status" "TestDesignStatus" NOT NULL DEFAULT 'CURRENT',
    "applicability" "TestDesignApplicability" NOT NULL DEFAULT 'APPLICABLE',
    "automation_suitability" "AutomationSuitability" NOT NULL DEFAULT 'UNKNOWN',
    "input_fingerprint" VARCHAR(64) NOT NULL,
    "engine_version" VARCHAR(64) NOT NULL,
    "prompt_template_version" INTEGER,
    "provider_id" VARCHAR(64) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "structured_design_json" JSONB NOT NULL,
    "usage_json" JSONB NOT NULL DEFAULT '{}',
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stale_at" TIMESTAMPTZ(6),

    CONSTRAINT "requirement_test_designs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirement_test_designs_project_id_idx" ON "requirement_test_designs"("project_id");

-- CreateIndex
CREATE INDEX "requirement_test_designs_requirement_id_idx" ON "requirement_test_designs"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_test_designs_requirement_id_status_idx" ON "requirement_test_designs"("requirement_id", "status");

-- CreateIndex
CREATE INDEX "requirement_test_designs_requirement_id_requirement_version_number_idx" ON "requirement_test_designs"("requirement_id", "requirement_version_number");

-- CreateIndex
CREATE INDEX "requirement_test_designs_project_id_input_fingerprint_idx" ON "requirement_test_designs"("project_id", "input_fingerprint");

-- AddForeignKey
ALTER TABLE "requirement_test_designs" ADD CONSTRAINT "requirement_test_designs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_test_designs" ADD CONSTRAINT "requirement_test_designs_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_test_designs" ADD CONSTRAINT "requirement_test_designs_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "requirement_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
