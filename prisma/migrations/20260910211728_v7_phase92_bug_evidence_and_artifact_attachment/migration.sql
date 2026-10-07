-- CreateEnum
CREATE TYPE "JiraAttachmentStatus" AS ENUM ('PENDING', 'ATTACHED', 'BLOCKED', 'FAILED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JiraAuditEventType" ADD VALUE 'EVIDENCE_ATTACHMENT_ATTEMPTED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'EVIDENCE_ATTACHED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'EVIDENCE_ATTACHMENT_FAILED';

-- CreateTable
CREATE TABLE "jira_evidence_attachments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "external_issue_id" UUID NOT NULL,
    "bug_report_id" UUID NOT NULL,
    "evidence_reference_id" UUID NOT NULL,
    "evidence_type" "EvidenceArtifactType" NOT NULL,
    "artifact_hash" VARCHAR(64) NOT NULL,
    "jira_attachment_id" VARCHAR(128),
    "jira_filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "JiraAttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "failure_code" VARCHAR(64),
    "failure_reason" TEXT,
    "is_derived_redacted" BOOLEAN NOT NULL DEFAULT false,
    "source_artifact_hash" VARCHAR(64),
    "redaction_version" VARCHAR(32),
    "uploaded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jira_evidence_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jira_evidence_attachments_project_id_idx" ON "jira_evidence_attachments"("project_id");

-- CreateIndex
CREATE INDEX "jira_evidence_attachments_external_issue_id_idx" ON "jira_evidence_attachments"("external_issue_id");

-- CreateIndex
CREATE INDEX "jira_evidence_attachments_bug_report_id_idx" ON "jira_evidence_attachments"("bug_report_id");

-- CreateIndex
CREATE INDEX "jira_evidence_attachments_evidence_reference_id_idx" ON "jira_evidence_attachments"("evidence_reference_id");

-- CreateIndex
CREATE INDEX "jira_evidence_attachments_status_idx" ON "jira_evidence_attachments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "jira_evidence_attachments_external_issue_id_evidence_refere_key" ON "jira_evidence_attachments"("external_issue_id", "evidence_reference_id");

-- AddForeignKey
ALTER TABLE "jira_evidence_attachments" ADD CONSTRAINT "jira_evidence_attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_evidence_attachments" ADD CONSTRAINT "jira_evidence_attachments_external_issue_id_fkey" FOREIGN KEY ("external_issue_id") REFERENCES "jira_external_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_evidence_attachments" ADD CONSTRAINT "jira_evidence_attachments_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "structured_bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_evidence_attachments" ADD CONSTRAINT "jira_evidence_attachments_evidence_reference_id_fkey" FOREIGN KEY ("evidence_reference_id") REFERENCES "failure_evidence_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;
