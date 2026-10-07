-- CreateEnum
CREATE TYPE "JiraIssueCreationStatus" AS ENUM ('CREATED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JiraAuditEventType" ADD VALUE 'ISSUE_CREATION_ATTEMPTED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'ISSUE_CREATED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'ISSUE_CREATION_FAILED';

-- CreateTable
CREATE TABLE "jira_external_issues" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "bug_report_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "jira_project_id" VARCHAR(128) NOT NULL,
    "jira_project_key" VARCHAR(64) NOT NULL,
    "jira_issue_id" VARCHAR(128) NOT NULL,
    "jira_issue_key" VARCHAR(64) NOT NULL,
    "jira_issue_url" VARCHAR(512) NOT NULL,
    "issue_type" VARCHAR(128) NOT NULL,
    "summary" VARCHAR(255) NOT NULL,
    "priority" VARCHAR(64),
    "creation_status" "JiraIssueCreationStatus" NOT NULL DEFAULT 'CREATED',
    "request_fingerprint" VARCHAR(64) NOT NULL,
    "metadata_snapshot" JSONB,
    "created_by" VARCHAR(128) NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jira_external_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jira_external_issues_request_fingerprint_key" ON "jira_external_issues"("request_fingerprint");

-- CreateIndex
CREATE INDEX "jira_external_issues_project_id_idx" ON "jira_external_issues"("project_id");

-- CreateIndex
CREATE INDEX "jira_external_issues_failure_case_id_idx" ON "jira_external_issues"("failure_case_id");

-- CreateIndex
CREATE INDEX "jira_external_issues_bug_report_id_idx" ON "jira_external_issues"("bug_report_id");

-- CreateIndex
CREATE INDEX "jira_external_issues_connection_id_idx" ON "jira_external_issues"("connection_id");

-- CreateIndex
CREATE INDEX "jira_external_issues_jira_issue_key_idx" ON "jira_external_issues"("jira_issue_key");

-- CreateIndex
CREATE INDEX "jira_external_issues_request_fingerprint_idx" ON "jira_external_issues"("request_fingerprint");

-- AddForeignKey
ALTER TABLE "jira_external_issues" ADD CONSTRAINT "jira_external_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_external_issues" ADD CONSTRAINT "jira_external_issues_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_external_issues" ADD CONSTRAINT "jira_external_issues_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "structured_bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_external_issues" ADD CONSTRAINT "jira_external_issues_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "jira_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
