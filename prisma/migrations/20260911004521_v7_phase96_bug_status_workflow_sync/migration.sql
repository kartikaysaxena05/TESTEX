-- CreateEnum
CREATE TYPE "InternalBugStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'REOPENED', 'CLOSED', 'BLOCKED', 'WONT_FIX', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "DefectVerificationStatus" AS ENUM ('NOT_VERIFIED', 'VERIFICATION_PENDING', 'VERIFIED_FIXED', 'REVERIFICATION_FAILED');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('INTERNAL_TO_EXTERNAL', 'EXTERNAL_TO_INTERNAL', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "SyncConflictPolicy" AS ENUM ('MANUAL_REVIEW', 'INTERNAL_WINS', 'EXTERNAL_WINS', 'LATEST_VALID_CHANGE');

-- CreateEnum
CREATE TYPE "SyncResultStatus" AS ENUM ('SYNCED', 'NO_CHANGE', 'BLOCKED', 'CONFLICT', 'FAILED', 'UNMAPPED', 'UNAUTHORIZED', 'EXTERNAL_NOT_FOUND', 'RATE_LIMITED');

-- CreateTable
CREATE TABLE "bug_workflow_states" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "bug_report_id" UUID,
    "current_status" "InternalBugStatus" NOT NULL DEFAULT 'OPEN',
    "verification_status" "DefectVerificationStatus" NOT NULL DEFAULT 'NOT_VERIFIED',
    "status_reason" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution_reason" TEXT,
    "reopened_at" TIMESTAMPTZ(6),
    "reopen_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "last_changed_by" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "workflow_version" INTEGER NOT NULL DEFAULT 1,
    "last_external_status" VARCHAR(128),
    "last_external_status_id" VARCHAR(64),
    "last_synced_internal_status" "InternalBugStatus",
    "last_synced_external_status" VARCHAR(128),
    "last_synced_at" TIMESTAMPTZ(6),
    "last_external_updated_at" TIMESTAMPTZ(6),
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "last_sync_result" "SyncResultStatus",
    "last_sync_error" TEXT,
    "conflict_state" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_workflow_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_status_mappings" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "connection_id" UUID,
    "external_system" VARCHAR(64) NOT NULL DEFAULT 'JIRA',
    "external_status_id" VARCHAR(64) NOT NULL DEFAULT '*',
    "external_status_name" VARCHAR(128) NOT NULL,
    "internal_status" "InternalBugStatus" NOT NULL,
    "direction" "SyncDirection" NOT NULL DEFAULT 'BIDIRECTIONAL',
    "conflict_policy" "SyncConflictPolicy" NOT NULL DEFAULT 'MANUAL_REVIEW',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_status_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_sync_events" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workflow_state_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "bug_report_id" UUID,
    "connection_id" UUID,
    "external_issue_id" VARCHAR(128),
    "external_issue_key" VARCHAR(64),
    "direction" "SyncDirection" NOT NULL,
    "source_status" VARCHAR(128) NOT NULL,
    "target_status" VARCHAR(128),
    "mapped_status" VARCHAR(128),
    "sync_result" "SyncResultStatus" NOT NULL,
    "conflict_details" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "external_updated_at" TIMESTAMPTZ(6),
    "internal_updated_at" TIMESTAMPTZ(6),
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "actor" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bug_workflow_states_failure_case_id_key" ON "bug_workflow_states"("failure_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "bug_workflow_states_bug_report_id_key" ON "bug_workflow_states"("bug_report_id");

-- CreateIndex
CREATE INDEX "bug_workflow_states_project_id_idx" ON "bug_workflow_states"("project_id");

-- CreateIndex
CREATE INDEX "bug_workflow_states_failure_case_id_idx" ON "bug_workflow_states"("failure_case_id");

-- CreateIndex
CREATE INDEX "bug_workflow_states_bug_report_id_idx" ON "bug_workflow_states"("bug_report_id");

-- CreateIndex
CREATE INDEX "bug_workflow_states_current_status_idx" ON "bug_workflow_states"("current_status");

-- CreateIndex
CREATE INDEX "bug_workflow_states_verification_status_idx" ON "bug_workflow_states"("verification_status");

-- CreateIndex
CREATE INDEX "bug_workflow_states_last_sync_result_idx" ON "bug_workflow_states"("last_sync_result");

-- CreateIndex
CREATE INDEX "bug_workflow_states_last_synced_at_idx" ON "bug_workflow_states"("last_synced_at");

-- CreateIndex
CREATE INDEX "workflow_status_mappings_project_id_idx" ON "workflow_status_mappings"("project_id");

-- CreateIndex
CREATE INDEX "workflow_status_mappings_connection_id_idx" ON "workflow_status_mappings"("connection_id");

-- CreateIndex
CREATE INDEX "workflow_status_mappings_is_enabled_idx" ON "workflow_status_mappings"("is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_status_mappings_project_id_external_system_externa_key" ON "workflow_status_mappings"("project_id", "external_system", "external_status_name");

-- CreateIndex
CREATE INDEX "workflow_sync_events_project_id_idx" ON "workflow_sync_events"("project_id");

-- CreateIndex
CREATE INDEX "workflow_sync_events_workflow_state_id_idx" ON "workflow_sync_events"("workflow_state_id");

-- CreateIndex
CREATE INDEX "workflow_sync_events_failure_case_id_idx" ON "workflow_sync_events"("failure_case_id");

-- CreateIndex
CREATE INDEX "workflow_sync_events_bug_report_id_idx" ON "workflow_sync_events"("bug_report_id");

-- CreateIndex
CREATE INDEX "workflow_sync_events_sync_result_idx" ON "workflow_sync_events"("sync_result");

-- CreateIndex
CREATE INDEX "workflow_sync_events_started_at_idx" ON "workflow_sync_events"("started_at");

-- AddForeignKey
ALTER TABLE "bug_workflow_states" ADD CONSTRAINT "bug_workflow_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_workflow_states" ADD CONSTRAINT "bug_workflow_states_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_workflow_states" ADD CONSTRAINT "bug_workflow_states_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "structured_bug_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_status_mappings" ADD CONSTRAINT "workflow_status_mappings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_status_mappings" ADD CONSTRAINT "workflow_status_mappings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "jira_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_sync_events" ADD CONSTRAINT "workflow_sync_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_sync_events" ADD CONSTRAINT "workflow_sync_events_workflow_state_id_fkey" FOREIGN KEY ("workflow_state_id") REFERENCES "bug_workflow_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_sync_events" ADD CONSTRAINT "workflow_sync_events_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_sync_events" ADD CONSTRAINT "workflow_sync_events_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "structured_bug_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_sync_events" ADD CONSTRAINT "workflow_sync_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "jira_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
