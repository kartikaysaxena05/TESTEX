-- CreateEnum
CREATE TYPE "JiraDeploymentType" AS ENUM ('JIRA_CLOUD', 'JIRA_DATA_CENTER', 'JIRA_SERVER');

-- CreateEnum
CREATE TYPE "JiraAuthenticationType" AS ENUM ('API_TOKEN', 'BASIC_AUTH', 'PERSONAL_ACCESS_TOKEN', 'OAUTH2');

-- CreateEnum
CREATE TYPE "JiraConnectionStatus" AS ENUM ('UNVALIDATED', 'CONNECTED', 'AUTHENTICATION_FAILED', 'UNREACHABLE', 'PERMISSION_DENIED', 'INVALID_CONFIGURATION', 'RATE_LIMITED', 'TIMEOUT', 'UNKNOWN_ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "JiraAuditEventType" AS ENUM ('CONNECTION_CREATED', 'CONNECTION_UPDATED', 'CREDENTIALS_REPLACED', 'VALIDATION_ATTEMPTED', 'VALIDATION_SUCCEEDED', 'VALIDATION_FAILED', 'CONNECTION_DELETED');

-- CreateTable
CREATE TABLE "jira_connections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "display_name" VARCHAR(128) NOT NULL,
    "deployment_type" "JiraDeploymentType" NOT NULL DEFAULT 'JIRA_CLOUD',
    "base_url" VARCHAR(512) NOT NULL,
    "authentication_type" "JiraAuthenticationType" NOT NULL DEFAULT 'API_TOKEN',
    "account_identifier" VARCHAR(255) NOT NULL,
    "secret_reference" VARCHAR(255) NOT NULL,
    "encrypted_credentials" TEXT,
    "connection_status" "JiraConnectionStatus" NOT NULL DEFAULT 'UNVALIDATED',
    "last_validated_at" TIMESTAMPTZ(6),
    "last_validation_result" JSONB,
    "created_by" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jira_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jira_connection_audits" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "event_type" "JiraAuditEventType" NOT NULL,
    "previous_status" "JiraConnectionStatus",
    "new_status" "JiraConnectionStatus",
    "details" JSONB,
    "actor" VARCHAR(128) NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jira_connection_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jira_connections_project_id_key" ON "jira_connections"("project_id");

-- CreateIndex
CREATE INDEX "jira_connections_project_id_idx" ON "jira_connections"("project_id");

-- CreateIndex
CREATE INDEX "jira_connections_connection_status_idx" ON "jira_connections"("connection_status");

-- CreateIndex
CREATE INDEX "jira_connection_audits_connection_id_idx" ON "jira_connection_audits"("connection_id");

-- CreateIndex
CREATE INDEX "jira_connection_audits_project_id_idx" ON "jira_connection_audits"("project_id");

-- CreateIndex
CREATE INDEX "jira_connection_audits_event_type_idx" ON "jira_connection_audits"("event_type");

-- CreateIndex
CREATE INDEX "jira_connection_audits_created_at_idx" ON "jira_connection_audits"("created_at");

-- AddForeignKey
ALTER TABLE "jira_connections" ADD CONSTRAINT "jira_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_connection_audits" ADD CONSTRAINT "jira_connection_audits_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "jira_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_connection_audits" ADD CONSTRAINT "jira_connection_audits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
