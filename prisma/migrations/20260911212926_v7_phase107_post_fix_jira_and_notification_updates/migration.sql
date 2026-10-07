-- CreateEnum
CREATE TYPE "PostFixSyncOutcome" AS ENUM ('VERIFIED_FIXED', 'STILL_FAILING', 'REGRESSION_DETECTED', 'BLOCKED', 'INCONCLUSIVE', 'ROLLED_BACK', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PostFixSyncStatus" AS ENUM ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PostFixJiraUpdateStatus" AS ENUM ('COMMENT_POSTED', 'TRANSITIONED', 'TRANSITION_UNAVAILABLE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PostFixNotificationDeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED', 'SUPPRESSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationEventType" ADD VALUE 'POST_FIX_VERIFICATION_SUCCEEDED';
ALTER TYPE "NotificationEventType" ADD VALUE 'POST_FIX_VERIFICATION_FAILED';
ALTER TYPE "NotificationEventType" ADD VALUE 'POST_FIX_REGRESSION_DETECTED';
ALTER TYPE "NotificationEventType" ADD VALUE 'POST_FIX_VERIFICATION_BLOCKED';

-- CreateTable
CREATE TABLE "post_fix_sync_records" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "reverification_id" UUID NOT NULL,
    "jira_issue_link_id" UUID,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "outcome" "PostFixSyncOutcome" NOT NULL,
    "overall_status" "PostFixSyncStatus" NOT NULL,
    "jira_issue_key" VARCHAR(64),
    "jira_comment_status" "PostFixJiraUpdateStatus" NOT NULL DEFAULT 'SKIPPED',
    "jira_comment_id" VARCHAR(128),
    "jira_transition_status" "PostFixJiraUpdateStatus" NOT NULL DEFAULT 'SKIPPED',
    "jira_from_status" VARCHAR(128),
    "jira_to_status" VARCHAR(128),
    "jira_transition_id" VARCHAR(64),
    "jira_error" TEXT,
    "notification_status" "PostFixNotificationDeliveryStatus" NOT NULL DEFAULT 'SKIPPED',
    "notification_recipient" VARCHAR(255),
    "notification_subject" VARCHAR(512),
    "notification_error" TEXT,
    "evidence_count" INTEGER NOT NULL DEFAULT 0,
    "evidence_references_json" JSONB NOT NULL DEFAULT '[]',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "actor" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "custom_note" TEXT,
    "details_json" JSONB NOT NULL DEFAULT '{}',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_fix_sync_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_fix_sync_audits" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "sync_record_id" UUID NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "status" "PostFixSyncStatus" NOT NULL,
    "actor" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "details_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_fix_sync_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_fix_sync_records_idempotency_key_key" ON "post_fix_sync_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "post_fix_sync_records_project_id_idx" ON "post_fix_sync_records"("project_id");

-- CreateIndex
CREATE INDEX "post_fix_sync_records_failure_case_id_idx" ON "post_fix_sync_records"("failure_case_id");

-- CreateIndex
CREATE INDEX "post_fix_sync_records_reverification_id_idx" ON "post_fix_sync_records"("reverification_id");

-- CreateIndex
CREATE INDEX "post_fix_sync_records_jira_issue_link_id_idx" ON "post_fix_sync_records"("jira_issue_link_id");

-- CreateIndex
CREATE INDEX "post_fix_sync_records_outcome_idx" ON "post_fix_sync_records"("outcome");

-- CreateIndex
CREATE INDEX "post_fix_sync_records_overall_status_idx" ON "post_fix_sync_records"("overall_status");

-- CreateIndex
CREATE INDEX "post_fix_sync_records_created_at_idx" ON "post_fix_sync_records"("created_at");

-- CreateIndex
CREATE INDEX "post_fix_sync_audits_project_id_idx" ON "post_fix_sync_audits"("project_id");

-- CreateIndex
CREATE INDEX "post_fix_sync_audits_sync_record_id_idx" ON "post_fix_sync_audits"("sync_record_id");

-- CreateIndex
CREATE INDEX "post_fix_sync_audits_action_idx" ON "post_fix_sync_audits"("action");

-- CreateIndex
CREATE INDEX "post_fix_sync_audits_created_at_idx" ON "post_fix_sync_audits"("created_at");

-- AddForeignKey
ALTER TABLE "post_fix_sync_records" ADD CONSTRAINT "post_fix_sync_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_fix_sync_records" ADD CONSTRAINT "post_fix_sync_records_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_fix_sync_records" ADD CONSTRAINT "post_fix_sync_records_reverification_id_fkey" FOREIGN KEY ("reverification_id") REFERENCES "defect_reverifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_fix_sync_records" ADD CONSTRAINT "post_fix_sync_records_jira_issue_link_id_fkey" FOREIGN KEY ("jira_issue_link_id") REFERENCES "jira_issue_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_fix_sync_audits" ADD CONSTRAINT "post_fix_sync_audits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_fix_sync_audits" ADD CONSTRAINT "post_fix_sync_audits_sync_record_id_fkey" FOREIGN KEY ("sync_record_id") REFERENCES "post_fix_sync_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
