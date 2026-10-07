-- CreateEnum
CREATE TYPE "JiraProjectConfigStatus" AS ENUM ('CONFIGURED', 'STALE', 'NEEDS_REVIEW', 'INVALID');

-- CreateEnum
CREATE TYPE "JiraAssigneeStrategy" AS ENUM ('UNASSIGNED', 'SPECIFIC_USER', 'AUTOMATIC');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JiraAuditEventType" ADD VALUE 'PROJECT_SELECTED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'CONFIGURATION_SAVED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'METADATA_REFRESHED';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'CONFIGURATION_STALE';
ALTER TYPE "JiraAuditEventType" ADD VALUE 'HEALTH_CHECKED';

-- CreateTable
CREATE TABLE "jira_project_configs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "jira_project_id" VARCHAR(128) NOT NULL,
    "jira_project_key" VARCHAR(64) NOT NULL,
    "jira_project_name" VARCHAR(255) NOT NULL,
    "selected_issue_type_id" VARCHAR(128) NOT NULL,
    "selected_issue_type_name" VARCHAR(128) NOT NULL,
    "default_priority_id" VARCHAR(128),
    "default_priority_name" VARCHAR(128),
    "default_component_id" VARCHAR(128),
    "default_component_name" VARCHAR(255),
    "assignee_strategy" "JiraAssigneeStrategy" NOT NULL DEFAULT 'UNASSIGNED',
    "default_assignee_id" VARCHAR(255),
    "default_assignee_name" VARCHAR(255),
    "field_mappings" JSONB,
    "config_status" "JiraProjectConfigStatus" NOT NULL DEFAULT 'CONFIGURED',
    "stale_reason" TEXT,
    "metadata_snapshot" JSONB,
    "last_refreshed_at" TIMESTAMPTZ(6),
    "created_by" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jira_project_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jira_project_configs_project_id_key" ON "jira_project_configs"("project_id");

-- CreateIndex
CREATE INDEX "jira_project_configs_project_id_idx" ON "jira_project_configs"("project_id");

-- CreateIndex
CREATE INDEX "jira_project_configs_connection_id_idx" ON "jira_project_configs"("connection_id");

-- CreateIndex
CREATE INDEX "jira_project_configs_config_status_idx" ON "jira_project_configs"("config_status");

-- AddForeignKey
ALTER TABLE "jira_project_configs" ADD CONSTRAINT "jira_project_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
