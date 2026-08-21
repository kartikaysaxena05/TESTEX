-- CreateEnum
CREATE TYPE "ScenarioGenerationStatus" AS ENUM ('GENERATED', 'NO_SCENARIOS', 'INSUFFICIENT_INFORMATION', 'FAILED', 'STALE');

-- CreateTable
CREATE TABLE "requirement_scenario_generations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "requirement_version_id" UUID,
    "requirement_version_number" INTEGER NOT NULL,
    "status" "ScenarioGenerationStatus" NOT NULL DEFAULT 'GENERATED',
    "input_fingerprint" VARCHAR(64) NOT NULL,
    "provider_id" VARCHAR(64) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "prompt_id" VARCHAR(64) NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "scenario_count" INTEGER NOT NULL DEFAULT 0,
    "warnings_json" JSONB NOT NULL DEFAULT '[]',
    "usage_json" JSONB NOT NULL DEFAULT '{}',
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stale_at" TIMESTAMPTZ(6),

    CONSTRAINT "requirement_scenario_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_scenario_candidates" (
    "id" UUID NOT NULL,
    "generation_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "scenario_key" VARCHAR(64),
    "title" VARCHAR(255) NOT NULL,
    "objective" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "requirement_aspect" TEXT NOT NULL,
    "test_level" VARCHAR(64),
    "test_intent" VARCHAR(64),
    "applicability" VARCHAR(64),
    "assumptions_json" JSONB NOT NULL DEFAULT '[]',
    "source_evidence_refs_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_scenario_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirement_scenario_generations_project_id_idx" ON "requirement_scenario_generations"("project_id");

-- CreateIndex
CREATE INDEX "requirement_scenario_generations_requirement_id_idx" ON "requirement_scenario_generations"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_scenario_generations_requirement_id_status_idx" ON "requirement_scenario_generations"("requirement_id", "status");

-- CreateIndex
CREATE INDEX "requirement_scenario_generations_requirement_id_requirement_version_number_idx" ON "requirement_scenario_generations"("requirement_id", "requirement_version_number");

-- CreateIndex
CREATE INDEX "requirement_scenario_generations_project_id_input_fingerprint_idx" ON "requirement_scenario_generations"("project_id", "input_fingerprint");

-- CreateIndex
CREATE INDEX "requirement_scenario_candidates_generation_id_idx" ON "requirement_scenario_candidates"("generation_id");

-- CreateIndex
CREATE INDEX "requirement_scenario_candidates_project_id_idx" ON "requirement_scenario_candidates"("project_id");

-- CreateIndex
CREATE INDEX "requirement_scenario_candidates_requirement_id_idx" ON "requirement_scenario_candidates"("requirement_id");

-- AddForeignKey
ALTER TABLE "requirement_scenario_generations" ADD CONSTRAINT "requirement_scenario_generations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_scenario_generations" ADD CONSTRAINT "requirement_scenario_generations_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_scenario_generations" ADD CONSTRAINT "requirement_scenario_generations_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "requirement_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_scenario_candidates" ADD CONSTRAINT "requirement_scenario_candidates_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "requirement_scenario_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_scenario_candidates" ADD CONSTRAINT "requirement_scenario_candidates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_scenario_candidates" ADD CONSTRAINT "requirement_scenario_candidates_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
