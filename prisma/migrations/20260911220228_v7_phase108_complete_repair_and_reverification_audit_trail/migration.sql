-- CreateEnum
CREATE TYPE "RepairAuditActorType" AS ENUM ('USER', 'AI', 'SYSTEM', 'TEST_ENGINE', 'JIRA_INTEGRATION', 'NOTIFICATION_SERVICE', 'REPAIR_ENGINE');

-- CreateEnum
CREATE TYPE "RepairAuditEventType" AS ENUM ('FAILURE_CREATED', 'BUG_REPORT_CREATED', 'JIRA_ISSUE_CREATED', 'JIRA_ISSUE_LINKED', 'ENGINEER_ASSIGNED', 'REVERIFICATION_STARTED', 'REVERIFICATION_COMPLETED', 'QUICK_FIX_EVALUATED', 'QUICK_FIX_APPROVED_FOR_GENERATION', 'DEFECT_LOCALIZED', 'PATCH_PROPOSED', 'PATCH_VALIDATION_STARTED', 'PATCH_VALIDATION_COMPLETED', 'PATCH_REJECTED', 'PATCH_APPROVED', 'PATCH_APPLIED', 'PATCH_APPLY_FAILED', 'RETEST_STARTED', 'RETEST_COMPLETED', 'ROLLBACK_STARTED', 'ROLLBACK_COMPLETED', 'CHANGE_IMPACT_ANALYZED', 'REGRESSION_SELECTION_CREATED', 'POST_FIX_STATUS_UPDATED', 'NOTIFICATION_SENT', 'REPAIR_SESSION_COMPLETED');

-- CreateEnum
CREATE TYPE "RepairSessionStatus" AS ENUM ('ACTIVE', 'PATCH_APPROVED', 'PATCH_APPLIED', 'VERIFIED', 'REVERTED', 'FAILED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "repair_sessions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "session_key" VARCHAR(64) NOT NULL,
    "status" "RepairSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "total_events_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_audit_events" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "repair_session_id" UUID,
    "sequence_number" INTEGER NOT NULL,
    "event_type" "RepairAuditEventType" NOT NULL,
    "actor_type" "RepairAuditActorType" NOT NULL,
    "actor_id" VARCHAR(128) NOT NULL,
    "source_component" VARCHAR(64) NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_state" VARCHAR(64),
    "new_state" VARCHAR(64),
    "evidence_references_json" JSONB NOT NULL DEFAULT '[]',
    "repository_state_json" JSONB NOT NULL DEFAULT '{}',
    "test_run_references_json" JSONB NOT NULL DEFAULT '[]',
    "jira_reference_json" JSONB NOT NULL DEFAULT '{}',
    "notification_reference_json" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "correlation_id" VARCHAR(128) NOT NULL,
    "causation_id" VARCHAR(128),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "schema_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repair_sessions_project_id_idx" ON "repair_sessions"("project_id");

-- CreateIndex
CREATE INDEX "repair_sessions_failure_case_id_idx" ON "repair_sessions"("failure_case_id");

-- CreateIndex
CREATE INDEX "repair_sessions_status_idx" ON "repair_sessions"("status");

-- CreateIndex
CREATE INDEX "repair_sessions_created_at_idx" ON "repair_sessions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "repair_sessions_project_id_session_key_key" ON "repair_sessions"("project_id", "session_key");

-- CreateIndex
CREATE UNIQUE INDEX "repair_audit_events_idempotency_key_key" ON "repair_audit_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "repair_audit_events_project_id_idx" ON "repair_audit_events"("project_id");

-- CreateIndex
CREATE INDEX "repair_audit_events_failure_case_id_idx" ON "repair_audit_events"("failure_case_id");

-- CreateIndex
CREATE INDEX "repair_audit_events_repair_session_id_idx" ON "repair_audit_events"("repair_session_id");

-- CreateIndex
CREATE INDEX "repair_audit_events_event_type_idx" ON "repair_audit_events"("event_type");

-- CreateIndex
CREATE INDEX "repair_audit_events_actor_type_idx" ON "repair_audit_events"("actor_type");

-- CreateIndex
CREATE INDEX "repair_audit_events_correlation_id_idx" ON "repair_audit_events"("correlation_id");

-- CreateIndex
CREATE INDEX "repair_audit_events_timestamp_idx" ON "repair_audit_events"("timestamp");

-- CreateIndex
CREATE INDEX "repair_audit_events_sequence_number_idx" ON "repair_audit_events"("sequence_number");

-- CreateIndex
CREATE INDEX "repair_audit_events_created_at_idx" ON "repair_audit_events"("created_at");

-- AddForeignKey
ALTER TABLE "repair_sessions" ADD CONSTRAINT "repair_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_sessions" ADD CONSTRAINT "repair_sessions_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_audit_events" ADD CONSTRAINT "repair_audit_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_audit_events" ADD CONSTRAINT "repair_audit_events_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_audit_events" ADD CONSTRAINT "repair_audit_events_repair_session_id_fkey" FOREIGN KEY ("repair_session_id") REFERENCES "repair_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
