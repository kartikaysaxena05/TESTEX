-- CreateEnum
CREATE TYPE "JiraLinkSource" AS ENUM ('EXACT_EXISTING_LINK', 'SAME_BUG_REPORT', 'SAME_FAILURE', 'SAME_DEFECT_CLUSTER', 'EXTERNAL_EXACT_MATCH', 'USER_CONFIRMED_LINK');

-- CreateEnum
CREATE TYPE "JiraDuplicateDecision" AS ENUM ('CREATE_NEW', 'USE_EXISTING', 'BLOCKED', 'INCONCLUSIVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JiraAuditEventType" ADD VALUE 'DUPLICATE_CHECK_STARTED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'DUPLICATE_MATCH_FOUND';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'EXISTING_ISSUE_LINKED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'NEW_ISSUE_ALLOWED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'LINK_INVALIDATED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'EXTERNAL_ISSUE_MISSING';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'DEDUPLICATION_CONFLICT';

-- CreateTable
CREATE TABLE "jira_issue_links" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "bug_report_id" UUID,
    "defect_cluster_id" UUID,
    "external_issue_id" UUID,
    "jira_connection_id" UUID NOT NULL,
    "jira_project_key" VARCHAR(64) NOT NULL,
    "jira_issue_id" VARCHAR(128) NOT NULL,
    "jira_issue_key" VARCHAR(64) NOT NULL,
    "jira_issue_url" VARCHAR(512) NOT NULL,
    "link_reason" TEXT NOT NULL,
    "link_source" "JiraLinkSource" NOT NULL DEFAULT 'EXACT_EXISTING_LINK',
    "rule_id" VARCHAR(64),
    "decision" "JiraDuplicateDecision" NOT NULL DEFAULT 'USE_EXISTING',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "invalidation_reason" TEXT,
    "superseded_by_id" UUID,
    "metadata_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jira_issue_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jira_issue_links_project_id_idx" ON "jira_issue_links"("project_id");

-- CreateIndex
CREATE INDEX "jira_issue_links_failure_case_id_idx" ON "jira_issue_links"("failure_case_id");

-- CreateIndex
CREATE INDEX "jira_issue_links_bug_report_id_idx" ON "jira_issue_links"("bug_report_id");

-- CreateIndex
CREATE INDEX "jira_issue_links_defect_cluster_id_idx" ON "jira_issue_links"("defect_cluster_id");

-- CreateIndex
CREATE INDEX "jira_issue_links_jira_connection_id_idx" ON "jira_issue_links"("jira_connection_id");

-- CreateIndex
CREATE INDEX "jira_issue_links_jira_issue_id_idx" ON "jira_issue_links"("jira_issue_id");

-- CreateIndex
CREATE INDEX "jira_issue_links_jira_issue_key_idx" ON "jira_issue_links"("jira_issue_key");

-- CreateIndex
CREATE INDEX "jira_issue_links_is_active_idx" ON "jira_issue_links"("is_active");

-- CreateIndex
CREATE INDEX "jira_issue_links_created_at_idx" ON "jira_issue_links"("created_at");

-- AddForeignKey
ALTER TABLE "jira_issue_links" ADD CONSTRAINT "jira_issue_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_issue_links" ADD CONSTRAINT "jira_issue_links_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_issue_links" ADD CONSTRAINT "jira_issue_links_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "structured_bug_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_issue_links" ADD CONSTRAINT "jira_issue_links_defect_cluster_id_fkey" FOREIGN KEY ("defect_cluster_id") REFERENCES "defect_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_issue_links" ADD CONSTRAINT "jira_issue_links_external_issue_id_fkey" FOREIGN KEY ("external_issue_id") REFERENCES "jira_external_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_issue_links" ADD CONSTRAINT "jira_issue_links_jira_connection_id_fkey" FOREIGN KEY ("jira_connection_id") REFERENCES "jira_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_issue_links" ADD CONSTRAINT "jira_issue_links_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "jira_issue_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
