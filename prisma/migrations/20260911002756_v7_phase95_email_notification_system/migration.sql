-- CreateEnum
CREATE TYPE "EmailProviderType" AS ENUM ('SMTP', 'SANDBOX', 'TEST_STREAM');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('BUG_CREATED', 'BUG_ASSIGNED', 'BUG_REASSIGNED', 'HIGH_SEVERITY_BUG_CREATED', 'CRITICAL_SEVERITY_BUG_CREATED', 'JIRA_ISSUE_CREATED', 'JIRA_ISSUE_LINKED', 'JIRA_ISSUE_CREATION_FAILED', 'TEST_REVERIFICATION_REQUIRED');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationDeliveryMode" AS ENUM ('REAL', 'TEST', 'SIMULATED');

-- CreateEnum
CREATE TYPE "NotificationAuditAction" AS ENUM ('NOTIFICATION_CREATED', 'DELIVERY_ATTEMPTED', 'DELIVERY_SUCCEEDED', 'DELIVERY_FAILED', 'DELIVERY_RETRIED', 'NOTIFICATION_SUPPRESSED', 'RESTART_RECOVERED');

-- CreateTable
CREATE TABLE "project_email_configs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "provider_type" "EmailProviderType" NOT NULL DEFAULT 'SMTP',
    "sender_name" VARCHAR(128) NOT NULL DEFAULT 'AI Quality Platform',
    "sender_address" VARCHAR(255) NOT NULL,
    "reply_to" VARCHAR(255),
    "smtp_host" VARCHAR(255),
    "smtp_port" INTEGER DEFAULT 587,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT false,
    "smtp_user" VARCHAR(255),
    "smtp_password_encrypted" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_test_mode" BOOLEAN NOT NULL DEFAULT false,
    "test_inbox_address" VARCHAR(255),
    "min_severity" VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    "notify_on_bug_created" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_bug_assigned" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_jira_action" BOOLEAN NOT NULL DEFAULT true,
    "qa_team_recipients" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_email_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_notifications" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "event_type" "NotificationEventType" NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID NOT NULL,
    "failure_case_id" UUID,
    "bug_report_id" UUID,
    "recipient_user_id" VARCHAR(128),
    "recipient_address" VARCHAR(255) NOT NULL,
    "recipient_name" VARCHAR(255),
    "recipient_role" VARCHAR(64),
    "subject" VARCHAR(512) NOT NULL,
    "body_text" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "template_id" VARCHAR(64) NOT NULL,
    "template_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "idempotency_key" VARCHAR(64) NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "delivery_mode" "NotificationDeliveryMode" NOT NULL DEFAULT 'REAL',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "provider" VARCHAR(64) NOT NULL DEFAULT 'SMTP',
    "provider_message_id" VARCHAR(255),
    "provider_response" TEXT,
    "last_error_code" VARCHAR(64),
    "last_error_message" TEXT,
    "suppression_reason" TEXT,
    "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "last_attempt_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_attempts" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "provider_message_id" VARCHAR(255),
    "provider_response" TEXT,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "is_transient" BOOLEAN NOT NULL DEFAULT false,
    "duration_ms" INTEGER,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_audits" (
    "id" UUID NOT NULL,
    "notification_id" UUID,
    "project_id" UUID NOT NULL,
    "action" "NotificationAuditAction" NOT NULL,
    "details" JSONB,
    "actor" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_email_configs_project_id_key" ON "project_email_configs"("project_id");

-- CreateIndex
CREATE INDEX "project_email_configs_project_id_idx" ON "project_email_configs"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_notifications_idempotency_key_key" ON "email_notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "email_notifications_project_id_idx" ON "email_notifications"("project_id");

-- CreateIndex
CREATE INDEX "email_notifications_failure_case_id_idx" ON "email_notifications"("failure_case_id");

-- CreateIndex
CREATE INDEX "email_notifications_bug_report_id_idx" ON "email_notifications"("bug_report_id");

-- CreateIndex
CREATE INDEX "email_notifications_event_type_idx" ON "email_notifications"("event_type");

-- CreateIndex
CREATE INDEX "email_notifications_status_idx" ON "email_notifications"("status");

-- CreateIndex
CREATE INDEX "email_notifications_idempotency_key_idx" ON "email_notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "email_notifications_created_at_idx" ON "email_notifications"("created_at");

-- CreateIndex
CREATE INDEX "notification_delivery_attempts_notification_id_idx" ON "notification_delivery_attempts"("notification_id");

-- CreateIndex
CREATE INDEX "notification_delivery_attempts_project_id_idx" ON "notification_delivery_attempts"("project_id");

-- CreateIndex
CREATE INDEX "notification_delivery_attempts_started_at_idx" ON "notification_delivery_attempts"("started_at");

-- CreateIndex
CREATE INDEX "notification_audits_project_id_idx" ON "notification_audits"("project_id");

-- CreateIndex
CREATE INDEX "notification_audits_notification_id_idx" ON "notification_audits"("notification_id");

-- CreateIndex
CREATE INDEX "notification_audits_action_idx" ON "notification_audits"("action");

-- CreateIndex
CREATE INDEX "notification_audits_created_at_idx" ON "notification_audits"("created_at");

-- AddForeignKey
ALTER TABLE "project_email_configs" ADD CONSTRAINT "project_email_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_notifications" ADD CONSTRAINT "email_notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_notifications" ADD CONSTRAINT "email_notifications_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_notifications" ADD CONSTRAINT "email_notifications_bug_report_id_fkey" FOREIGN KEY ("bug_report_id") REFERENCES "structured_bug_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "email_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_audits" ADD CONSTRAINT "notification_audits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_audits" ADD CONSTRAINT "notification_audits_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "email_notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
