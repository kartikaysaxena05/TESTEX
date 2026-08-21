-- CreateEnum
CREATE TYPE "TestReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TestCaseVersionSource" AS ENUM ('INITIAL_AI_GENERATION', 'AI_REGENERATION', 'HUMAN_EDIT', 'SYSTEM_MIGRATION', 'IMPORT');

-- CreateEnum
CREATE TYPE "TestReviewAction" AS ENUM ('SUBMITTED_FOR_REVIEW', 'APPROVED', 'REJECTED', 'EDITED', 'REGENERATED');

-- CreateEnum
CREATE TYPE "TestCaseRejectionReason" AS ENUM ('INVALID_EXPECTED_RESULT', 'UNSUPPORTED_ASSUMPTION', 'DUPLICATE_TEST', 'INCORRECT_PRECONDITION', 'POOR_TEST_DATA', 'NOT_RELEVANT', 'INSUFFICIENT_COVERAGE', 'REQUIREMENT_AMBIGUOUS', 'OTHER');

-- AlterTable
ALTER TABLE "test_cases" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by_actor_id" VARCHAR(255),
ADD COLUMN     "approved_version_number" INTEGER,
ADD COLUMN     "current_version_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "latest_rejection_reason" "TestCaseRejectionReason",
ADD COLUMN     "latest_review_comment" TEXT,
ADD COLUMN     "review_status" "TestReviewStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "test_case_versions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "source_type" "TestCaseVersionSource" NOT NULL DEFAULT 'INITIAL_AI_GENERATION',
    "title" VARCHAR(255) NOT NULL,
    "objective" TEXT NOT NULL,
    "description" TEXT,
    "type" "TestCaseType" NOT NULL DEFAULT 'POSITIVE',
    "priority" "TestCasePriority" NOT NULL DEFAULT 'MEDIUM',
    "execution_suitability" "TestCaseExecutionSuitability" NOT NULL DEFAULT 'UNKNOWN',
    "review_status" "TestReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "change_reason" TEXT,
    "changed_fields" JSONB NOT NULL DEFAULT '[]',
    "source_requirement_id" UUID,
    "source_requirement_key" VARCHAR(64),
    "source_requirement_version_number" INTEGER,
    "source_scenario_candidate_id" UUID,
    "source_scenario_key" VARCHAR(64),
    "generation_metadata" JSONB NOT NULL DEFAULT '{}',
    "preconditions_json" JSONB NOT NULL DEFAULT '[]',
    "steps_json" JSONB NOT NULL DEFAULT '[]',
    "test_data_json" JSONB NOT NULL DEFAULT '[]',
    "assumptions_json" JSONB NOT NULL DEFAULT '[]',
    "unknowns_json" JSONB NOT NULL DEFAULT '[]',
    "overall_expected_result" TEXT,
    "created_by_actor_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_review_events" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "action" "TestReviewAction" NOT NULL,
    "from_status" "TestReviewStatus" NOT NULL,
    "to_status" "TestReviewStatus" NOT NULL,
    "rejection_reason" "TestCaseRejectionReason",
    "comment" TEXT,
    "actor_id" VARCHAR(255),
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_case_versions_project_id_idx" ON "test_case_versions"("project_id");

-- CreateIndex
CREATE INDEX "test_case_versions_test_case_id_idx" ON "test_case_versions"("test_case_id");

-- CreateIndex
CREATE INDEX "test_case_versions_test_case_id_version_number_idx" ON "test_case_versions"("test_case_id", "version_number");

-- CreateIndex
CREATE INDEX "test_case_versions_review_status_idx" ON "test_case_versions"("review_status");

-- CreateIndex
CREATE INDEX "test_case_versions_created_at_idx" ON "test_case_versions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "test_case_versions_test_case_id_version_number_key" ON "test_case_versions"("test_case_id", "version_number");

-- CreateIndex
CREATE INDEX "test_case_review_events_project_id_idx" ON "test_case_review_events"("project_id");

-- CreateIndex
CREATE INDEX "test_case_review_events_test_case_id_idx" ON "test_case_review_events"("test_case_id");

-- CreateIndex
CREATE INDEX "test_case_review_events_test_case_id_version_number_idx" ON "test_case_review_events"("test_case_id", "version_number");

-- CreateIndex
CREATE INDEX "test_case_review_events_created_at_idx" ON "test_case_review_events"("created_at");

-- CreateIndex
CREATE INDEX "test_cases_project_id_review_status_idx" ON "test_cases"("project_id", "review_status");

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_review_events" ADD CONSTRAINT "test_case_review_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_review_events" ADD CONSTRAINT "test_case_review_events_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill baseline v1 for any existing test cases that don't have a version yet
INSERT INTO "test_case_versions" (
    "id",
    "project_id",
    "test_case_id",
    "version_number",
    "source_type",
    "title",
    "objective",
    "description",
    "type",
    "priority",
    "execution_suitability",
    "review_status",
    "change_reason",
    "changed_fields",
    "source_requirement_id",
    "source_requirement_key",
    "source_requirement_version_number",
    "source_scenario_candidate_id",
    "source_scenario_key",
    "generation_metadata",
    "overall_expected_result",
    "created_at"
)
SELECT
    gen_random_uuid(),
    tc."project_id",
    tc."id",
    1,
    'INITIAL_AI_GENERATION',
    tc."title",
    tc."objective",
    tc."description",
    tc."type",
    tc."priority",
    tc."execution_suitability",
    'DRAFT',
    'Baseline v1 at Phase 56 migration',
    '[]'::jsonb,
    tc."source_requirement_id",
    tc."source_requirement_key",
    tc."source_requirement_version_number",
    tc."source_scenario_candidate_id",
    tc."source_scenario_key",
    jsonb_build_object(
        'providerId', tc."provider_id",
        'model', tc."model",
        'promptId', tc."prompt_id",
        'promptVersion', tc."prompt_version",
        'generationId', tc."generation_id",
        'inputFingerprint', tc."input_fingerprint"
    ),
    tc."overall_expected_result",
    tc."created_at"
FROM "test_cases" tc
WHERE NOT EXISTS (
    SELECT 1 FROM "test_case_versions" tcv WHERE tcv."test_case_id" = tc."id"
);
