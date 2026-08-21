-- CreateEnum
CREATE TYPE "ApplicationKind" AS ENUM ('WEB_FRONTEND', 'WEB_BACKEND', 'FULL_STACK_WEB', 'CLI', 'LIBRARY', 'DESKTOP', 'MOBILE', 'SERVICE', 'MULTI_APPLICATION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EntryPointKind" AS ENUM ('APPLICATION', 'SERVER', 'CLIENT', 'CLI', 'LIBRARY', 'FRAMEWORK_ENTRY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ArchitectureConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ArchitectureAnalysisStatus" AS ENUM ('CURRENT', 'STALE', 'NOT_ANALYZED');

-- CreateEnum
CREATE TYPE "ArchitectureSignalKind" AS ENUM ('LAYERED_STRUCTURE', 'MVC_LIKE_STRUCTURE', 'FEATURE_BASED_STRUCTURE', 'MONOREPO_STRUCTURE', 'FRONTEND_BACKEND_SPLIT', 'DOMAIN_ORIENTED_STRUCTURE', 'FRAMEWORK_CONVENTIONAL_STRUCTURE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "repository_architecture_analyses" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "index_run_id" UUID,
    "status" "ArchitectureAnalysisStatus" NOT NULL DEFAULT 'CURRENT',
    "architecture_version" INTEGER NOT NULL DEFAULT 1,
    "primary_kind" "ApplicationKind" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" "ArchitectureConfidence" NOT NULL DEFAULT 'LOW',
    "application_kinds_json" JSONB NOT NULL,
    "application_units_json" JSONB NOT NULL,
    "entry_candidates_json" JSONB NOT NULL,
    "structural_areas_json" JSONB NOT NULL,
    "signals_json" JSONB NOT NULL,
    "module_hubs_json" JSONB NOT NULL,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_architecture_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repository_architecture_analyses_source_id_key" ON "repository_architecture_analyses"("source_id");

-- CreateIndex
CREATE INDEX "repository_architecture_analyses_source_id_idx" ON "repository_architecture_analyses"("source_id");

-- CreateIndex
CREATE INDEX "repository_architecture_analyses_index_run_id_idx" ON "repository_architecture_analyses"("index_run_id");

-- AddForeignKey
ALTER TABLE "repository_architecture_analyses" ADD CONSTRAINT "repository_architecture_analyses_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_architecture_analyses" ADD CONSTRAINT "repository_architecture_analyses_index_run_id_fkey" FOREIGN KEY ("index_run_id") REFERENCES "repository_index_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
