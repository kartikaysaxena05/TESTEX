-- CreateEnum
CREATE TYPE "ReverificationStatus" AS ENUM ('DRAFT', 'ELIGIBILITY_CHECK', 'READY', 'BLOCKED', 'PENDING_EXECUTION', 'EXECUTING', 'COMPLETED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReverificationEligibility" AS ENUM ('ELIGIBLE', 'NOT_ELIGIBLE', 'BLOCKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReverificationTriggerType" AS ENUM ('EXTERNAL_ISSUE_FIXED', 'EXTERNAL_ISSUE_RESOLVED', 'MANUAL_REQUEST', 'PATCH_APPLIED', 'SOURCE_CHANGE_DETECTED', 'BUG_STATUS_CHANGED');

-- CreateTable
CREATE TABLE "defect_reverifications" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "failure_analysis_id" UUID,
    "bug_report_id" UUID,
    "external_issue_link_id" UUID,
    "original_test_run_id" UUID NOT NULL,
    "original_execution_id" UUID NOT NULL,
    "original_test_case_id" UUID NOT NULL,
    "original_test_case_version_id" UUID,
    "original_test_case_version_number" INTEGER NOT NULL,
    "selected_test_case_id" UUID NOT NULL,
    "selected_test_case_version_id" UUID,
    "selected_test_case_version_number" INTEGER NOT NULL,
    "test_version_selection_reason" TEXT,
    "requirement_id" UUID,
    "requirement_key" VARCHAR(64),
    "requirement_version_id" UUID,
    "requirement_version_number" INTEGER,
    "status" "ReverificationStatus" NOT NULL DEFAULT 'DRAFT',
    "eligibility" "ReverificationEligibility" NOT NULL DEFAULT 'UNKNOWN',
    "eligibility_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trigger_type" "ReverificationTriggerType" NOT NULL,
    "trigger_reference" VARCHAR(255),
    "original_environment_id" UUID,
    "target_environment_id" UUID NOT NULL,
    "environment_snapshot_json" JSONB NOT NULL DEFAULT '{}',
    "fix_reference" VARCHAR(255),
    "fix_provenance_json" JSONB NOT NULL DEFAULT '{}',
    "baseline_failure_json" JSONB NOT NULL DEFAULT '{}',
    "expected_verification_json" JSONB NOT NULL DEFAULT '{}',
    "execution_plan_json" JSONB NOT NULL DEFAULT '{}',
    "safety_status" VARCHAR(64) NOT NULL DEFAULT 'UNKNOWN',
    "safety_reason" TEXT,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "superseded_by_id" UUID,
    "superseded_at" TIMESTAMPTZ(6),
    "supersede_reason" TEXT,
    "cancelled_by_id" VARCHAR(128),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "requested_by" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_reverifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reverification_audit_events" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "reverification_id" UUID NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "from_status" "ReverificationStatus",
    "to_status" "ReverificationStatus",
    "actor" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "reason" TEXT,
    "details_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reverification_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "defect_reverifications_project_id_idx" ON "defect_reverifications"("project_id");

-- CreateIndex
CREATE INDEX "defect_reverifications_failure_case_id_idx" ON "defect_reverifications"("failure_case_id");

-- CreateIndex
CREATE INDEX "defect_reverifications_bug_report_id_idx" ON "defect_reverifications"("bug_report_id");

-- CreateIndex
CREATE INDEX "defect_reverifications_external_issue_link_id_idx" ON "defect_reverifications"("external_issue_link_id");

-- CreateIndex
CREATE INDEX "defect_reverifications_target_environment_id_idx" ON "defect_reverifications"("target_environment_id");

-- CreateIndex
CREATE INDEX "defect_reverifications_status_idx" ON "defect_reverifications"("status");

-- CreateIndex
CREATE INDEX "defect_reverifications_eligibility_idx" ON "defect_reverifications"("eligibility");

-- CreateIndex
CREATE INDEX "defect_reverifications_is_authoritative_idx" ON "defect_reverifications"("is_authoritative");

-- CreateIndex
CREATE INDEX "defect_reverifications_created_at_idx" ON "defect_reverifications"("created_at");

-- CreateIndex
CREATE INDEX "reverification_audit_events_project_id_idx" ON "reverification_audit_events"("project_id");

-- CreateIndex
CREATE INDEX "reverification_audit_events_reverification_id_idx" ON "reverification_audit_events"("reverification_id");

-- CreateIndex
CREATE INDEX "reverification_audit_events_action_idx" ON "reverification_audit_events"("action");

-- CreateIndex
CREATE INDEX "reverification_audit_events_created_at_idx" ON "reverification_audit_events"("created_at");

-- AddForeignKey
ALTER TABLE "defect_reverifications" ADD CONSTRAINT "defect_reverifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_reverifications" ADD CONSTRAINT "defect_reverifications_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_reverifications" ADD CONSTRAINT "defect_reverifications_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "structured_bug_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_reverifications" ADD CONSTRAINT "defect_reverifications_external_issue_link_id_fkey" FOREIGN KEY ("external_issue_link_id") REFERENCES "jira_issue_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_reverifications" ADD CONSTRAINT "defect_reverifications_target_environment_id_fkey" FOREIGN KEY ("target_environment_id") REFERENCES "project_environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_reverifications" ADD CONSTRAINT "defect_reverifications_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "defect_reverifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reverification_audit_events" ADD CONSTRAINT "reverification_audit_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reverification_audit_events" ADD CONSTRAINT "reverification_audit_events_reverification_id_fkey" FOREIGN KEY ("reverification_id") REFERENCES "defect_reverifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
