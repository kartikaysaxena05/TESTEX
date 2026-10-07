-- CreateEnum
CREATE TYPE "DefectAssignmentSource" AS ENUM ('MANUAL', 'DETERMINISTIC_RULES', 'JIRA_SYNCHRONIZED');

-- CreateEnum
CREATE TYPE "JiraAssigneeSyncStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'SYNCHRONIZED', 'JIRA_SYNC_FAILED', 'CONFLICT_DETECTED');

-- CreateEnum
CREATE TYPE "DefectOwnershipAction" AS ENUM ('ASSIGNED', 'REASSIGNED', 'UNASSIGNED', 'JIRA_SYNC_UPDATED', 'JIRA_SYNC_FAILED', 'CONFLICT_RESOLVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JiraAuditEventType" ADD VALUE 'DEFECT_ASSIGNED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'DEFECT_REASSIGNED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'DEFECT_UNASSIGNED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'JIRA_ASSIGNEE_SYNCED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'JIRA_ASSIGNEE_SYNC_FAILED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'OWNERSHIP_CONFLICT_DETECTED';

-- CreateTable
CREATE TABLE "project_engineers" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" VARCHAR(128) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "jira_account_id" VARCHAR(128),
    "jira_username" VARCHAR(128),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "routing_tags" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_engineers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_ownerships" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "bug_report_id" UUID NOT NULL,
    "jira_issue_link_id" UUID,
    "assigned_engineer_id" UUID,
    "assignment_source" "DefectAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "assignment_reason" TEXT,
    "rule_id" VARCHAR(64),
    "jira_assignee_sync_status" "JiraAssigneeSyncStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "last_jira_sync_error" TEXT,
    "last_jira_sync_at" TIMESTAMPTZ(6),
    "ownership_version" INTEGER NOT NULL DEFAULT 1,
    "assigned_by_user_id" VARCHAR(128),
    "assigned_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_ownership_histories" (
    "id" UUID NOT NULL,
    "ownership_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "bug_report_id" UUID NOT NULL,
    "action" "DefectOwnershipAction" NOT NULL,
    "previous_engineer_id" UUID,
    "new_engineer_id" UUID,
    "assignment_source" "DefectAssignmentSource" NOT NULL,
    "assignment_reason" TEXT,
    "rule_id" VARCHAR(64),
    "jira_assignee_sync_status" "JiraAssigneeSyncStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "sync_error_message" TEXT,
    "ownership_version" INTEGER NOT NULL,
    "actor_user_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_ownership_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_engineers_project_id_idx" ON "project_engineers"("project_id");

-- CreateIndex
CREATE INDEX "project_engineers_user_id_idx" ON "project_engineers"("user_id");

-- CreateIndex
CREATE INDEX "project_engineers_jira_account_id_idx" ON "project_engineers"("jira_account_id");

-- CreateIndex
CREATE INDEX "project_engineers_is_active_idx" ON "project_engineers"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "project_engineers_project_id_user_id_key" ON "project_engineers"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "defect_ownerships_bug_report_id_key" ON "defect_ownerships"("bug_report_id");

-- CreateIndex
CREATE INDEX "defect_ownerships_project_id_idx" ON "defect_ownerships"("project_id");

-- CreateIndex
CREATE INDEX "defect_ownerships_failure_case_id_idx" ON "defect_ownerships"("failure_case_id");

-- CreateIndex
CREATE INDEX "defect_ownerships_bug_report_id_idx" ON "defect_ownerships"("bug_report_id");

-- CreateIndex
CREATE INDEX "defect_ownerships_jira_issue_link_id_idx" ON "defect_ownerships"("jira_issue_link_id");

-- CreateIndex
CREATE INDEX "defect_ownerships_assigned_engineer_id_idx" ON "defect_ownerships"("assigned_engineer_id");

-- CreateIndex
CREATE INDEX "defect_ownerships_assignment_source_idx" ON "defect_ownerships"("assignment_source");

-- CreateIndex
CREATE INDEX "defect_ownerships_jira_assignee_sync_status_idx" ON "defect_ownerships"("jira_assignee_sync_status");

-- CreateIndex
CREATE INDEX "defect_ownership_histories_ownership_id_idx" ON "defect_ownership_histories"("ownership_id");

-- CreateIndex
CREATE INDEX "defect_ownership_histories_project_id_idx" ON "defect_ownership_histories"("project_id");

-- CreateIndex
CREATE INDEX "defect_ownership_histories_bug_report_id_idx" ON "defect_ownership_histories"("bug_report_id");

-- CreateIndex
CREATE INDEX "defect_ownership_histories_action_idx" ON "defect_ownership_histories"("action");

-- CreateIndex
CREATE INDEX "defect_ownership_histories_created_at_idx" ON "defect_ownership_histories"("created_at");

-- AddForeignKey
ALTER TABLE "project_engineers" ADD CONSTRAINT "project_engineers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_ownerships" ADD CONSTRAINT "defect_ownerships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_ownerships" ADD CONSTRAINT "defect_ownerships_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_ownerships" ADD CONSTRAINT "defect_ownerships_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "structured_bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_ownerships" ADD CONSTRAINT "defect_ownerships_jira_issue_link_id_fkey" FOREIGN KEY ("jira_issue_link_id") REFERENCES "jira_issue_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_ownerships" ADD CONSTRAINT "defect_ownerships_assigned_engineer_id_fkey" FOREIGN KEY ("assigned_engineer_id") REFERENCES "project_engineers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_ownership_histories" ADD CONSTRAINT "defect_ownership_histories_ownership_id_fkey" FOREIGN KEY ("ownership_id") REFERENCES "defect_ownerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_ownership_histories" ADD CONSTRAINT "defect_ownership_histories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_ownership_histories" ADD CONSTRAINT "defect_ownership_histories_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "structured_bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_ownership_histories" ADD CONSTRAINT "defect_ownership_histories_new_engineer_id_fkey" FOREIGN KEY ("new_engineer_id") REFERENCES "project_engineers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
