-- CreateEnum
CREATE TYPE "ChangeSourceType" AS ENUM ('REQUIREMENT_CHANGE', 'SOURCE_CODE_CHANGE', 'APPROVED_PATCH', 'MANUAL_FILE_CHANGE', 'COMMIT_DIFF', 'BRANCH_DIFF', 'CONFIGURATION_CHANGE', 'API_CONTRACT_CHANGE');

-- CreateEnum
CREATE TYPE "TestSelectionState" AS ENUM ('MANDATORY', 'RECOMMENDED', 'OPTIONAL', 'NOT_IMPACTED', 'UNKNOWN', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "ImpactCategory" AS ENUM ('DIRECT', 'INDIRECT', 'TRANSITIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ImpactConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RetestPlanStatus" AS ENUM ('DRAFT', 'ANALYZING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "change_snapshots" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_type" "ChangeSourceType" NOT NULL,
    "source_entity_id" VARCHAR(255),
    "base_revision" VARCHAR(64),
    "target_revision" VARCHAR(64),
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "changed_files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "changed_symbols_json" JSONB NOT NULL DEFAULT '[]',
    "changed_requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "changed_apis_json" JSONB NOT NULL DEFAULT '[]',
    "changed_configuration" JSONB NOT NULL DEFAULT '{}',
    "diff_text" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retest_plans" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "change_snapshot_id" UUID NOT NULL,
    "status" "RetestPlanStatus" NOT NULL DEFAULT 'COMPLETED',
    "base_revision" VARCHAR(64),
    "target_revision" VARCHAR(64),
    "selection_policy_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "risk_policy_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "impact_engine_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "full_regression_required" BOOLEAN NOT NULL DEFAULT false,
    "full_regression_reason" TEXT,
    "total_tests_count" INTEGER NOT NULL DEFAULT 0,
    "mandatory_count" INTEGER NOT NULL DEFAULT 0,
    "recommended_count" INTEGER NOT NULL DEFAULT 0,
    "optional_count" INTEGER NOT NULL DEFAULT 0,
    "unknown_count" INTEGER NOT NULL DEFAULT 0,
    "excluded_count" INTEGER NOT NULL DEFAULT 0,
    "impact_graph_json" JSONB NOT NULL DEFAULT '{}',
    "selected_tests_json" JSONB NOT NULL DEFAULT '[]',
    "audit_trail_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retest_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_snapshots_project_id_idx" ON "change_snapshots"("project_id");

-- CreateIndex
CREATE INDEX "change_snapshots_source_type_idx" ON "change_snapshots"("source_type");

-- CreateIndex
CREATE INDEX "change_snapshots_created_at_idx" ON "change_snapshots"("created_at");

-- CreateIndex
CREATE INDEX "retest_plans_project_id_idx" ON "retest_plans"("project_id");

-- CreateIndex
CREATE INDEX "retest_plans_change_snapshot_id_idx" ON "retest_plans"("change_snapshot_id");

-- CreateIndex
CREATE INDEX "retest_plans_status_idx" ON "retest_plans"("status");

-- CreateIndex
CREATE INDEX "retest_plans_created_at_idx" ON "retest_plans"("created_at");

-- AddForeignKey
ALTER TABLE "change_snapshots" ADD CONSTRAINT "change_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retest_plans" ADD CONSTRAINT "retest_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retest_plans" ADD CONSTRAINT "retest_plans_change_snapshot_id_fkey" FOREIGN KEY ("change_snapshot_id") REFERENCES "change_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
