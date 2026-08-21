-- CreateEnum
CREATE TYPE "TraceOrigin" AS ENUM ('GENERATED', 'MANUAL', 'DERIVED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "TraceStatus" AS ENUM ('CURRENT', 'STALE', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "requirement_test_traces" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "requirement_version_id" UUID,
    "requirement_version_number" INTEGER NOT NULL,
    "test_case_id" UUID NOT NULL,
    "scenario_candidate_id" UUID,
    "scenario_key" VARCHAR(64),
    "generation_run_id" UUID,
    "origin" "TraceOrigin" NOT NULL DEFAULT 'GENERATED',
    "status" "TraceStatus" NOT NULL DEFAULT 'CURRENT',
    "stale_reason" VARCHAR(255),
    "provenance_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_test_traces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_test_traces_requirement_id_test_case_id_key" ON "requirement_test_traces"("requirement_id", "test_case_id");

-- CreateIndex
CREATE INDEX "requirement_test_traces_project_id_idx" ON "requirement_test_traces"("project_id");

-- CreateIndex
CREATE INDEX "requirement_test_traces_requirement_id_idx" ON "requirement_test_traces"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_test_traces_test_case_id_idx" ON "requirement_test_traces"("test_case_id");

-- CreateIndex
CREATE INDEX "requirement_test_traces_status_idx" ON "requirement_test_traces"("status");

-- CreateIndex
CREATE INDEX "requirement_test_traces_project_id_status_idx" ON "requirement_test_traces"("project_id", "status");

-- AddForeignKey
ALTER TABLE "requirement_test_traces" ADD CONSTRAINT "requirement_test_traces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_test_traces" ADD CONSTRAINT "requirement_test_traces_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_test_traces" ADD CONSTRAINT "requirement_test_traces_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "requirement_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_test_traces" ADD CONSTRAINT "requirement_test_traces_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_test_traces" ADD CONSTRAINT "requirement_test_traces_scenario_candidate_id_fkey" FOREIGN KEY ("scenario_candidate_id") REFERENCES "requirement_scenario_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
