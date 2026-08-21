-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('CURRENT', 'STALE', 'FAILED');

-- CreateTable
CREATE TABLE "requirement_ai_analyses" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "requirement_version_id" UUID,
    "requirement_version_number" INTEGER NOT NULL,
    "status" "AiAnalysisStatus" NOT NULL DEFAULT 'CURRENT',
    "provider_id" VARCHAR(64) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "prompt_id" VARCHAR(64) NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "input_sha256" VARCHAR(64) NOT NULL,
    "context_sha256" VARCHAR(64) NOT NULL,
    "structured_analysis_json" JSONB NOT NULL,
    "grounding_summary_json" JSONB NOT NULL DEFAULT '{}',
    "usage_json" JSONB NOT NULL DEFAULT '{}',
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stale_at" TIMESTAMPTZ(6),

    CONSTRAINT "requirement_ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirement_ai_analyses_project_id_idx" ON "requirement_ai_analyses"("project_id");

-- CreateIndex
CREATE INDEX "requirement_ai_analyses_requirement_id_idx" ON "requirement_ai_analyses"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_ai_analyses_requirement_id_status_idx" ON "requirement_ai_analyses"("requirement_id", "status");

-- CreateIndex
CREATE INDEX "requirement_ai_analyses_requirement_id_requirement_versio_idx" ON "requirement_ai_analyses"("requirement_id", "requirement_version_number");

-- CreateIndex
CREATE INDEX "requirement_ai_analyses_project_id_input_sha256_context_s_idx" ON "requirement_ai_analyses"("project_id", "input_sha256", "context_sha256");

-- AddForeignKey
ALTER TABLE "requirement_ai_analyses" ADD CONSTRAINT "requirement_ai_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_ai_analyses" ADD CONSTRAINT "requirement_ai_analyses_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_ai_analyses" ADD CONSTRAINT "requirement_ai_analyses_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "requirement_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
