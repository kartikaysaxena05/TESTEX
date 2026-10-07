-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('FILE_WRITE', 'FILE_DELETE', 'CODE_PATCH', 'GIT_CHANGE', 'TERMINAL_COMMAND', 'TEST_EXECUTION', 'EXTERNAL_REQUEST', 'RELEASE_ACTION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ApprovalAuditEventType" AS ENUM ('APPROVAL_CREATED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'APPROVAL_EXPIRED', 'APPROVAL_CANCELLED', 'APPROVAL_EXECUTION_STARTED', 'APPROVAL_EXECUTION_COMPLETED', 'APPROVAL_EXECUTION_FAILED');

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "execution_step_id" UUID,
    "approval_type" "ApprovalType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "risk_level" "ApprovalRiskLevel" NOT NULL,
    "requested_action" VARCHAR(255) NOT NULL,
    "requested_input" JSONB NOT NULL DEFAULT '{}',
    "action_hash" VARCHAR(128) NOT NULL,
    "affected_files" JSONB NOT NULL DEFAULT '[]',
    "affected_tools" JSONB NOT NULL DEFAULT '[]',
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),
    "responded_by" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "response_reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_audit_logs" (
    "id" UUID NOT NULL,
    "approval_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "execution_step_id" UUID,
    "event_type" "ApprovalAuditEventType" NOT NULL,
    "actor_type" VARCHAR(64) NOT NULL,
    "actor_id" VARCHAR(128) NOT NULL,
    "transition" VARCHAR(128) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_requests_project_id_status_idx" ON "approval_requests"("project_id", "status");

-- CreateIndex
CREATE INDEX "approval_requests_task_id_status_idx" ON "approval_requests"("task_id", "status");

-- CreateIndex
CREATE INDEX "approval_requests_thread_id_idx" ON "approval_requests"("thread_id");

-- CreateIndex
CREATE INDEX "approval_requests_user_id_idx" ON "approval_requests"("user_id");

-- CreateIndex
CREATE INDEX "approval_requests_expires_at_idx" ON "approval_requests"("expires_at");

-- CreateIndex
CREATE INDEX "approval_requests_created_at_idx" ON "approval_requests"("created_at");

-- CreateIndex
CREATE INDEX "approval_audit_logs_approval_id_idx" ON "approval_audit_logs"("approval_id");

-- CreateIndex
CREATE INDEX "approval_audit_logs_project_id_idx" ON "approval_audit_logs"("project_id");

-- CreateIndex
CREATE INDEX "approval_audit_logs_task_id_idx" ON "approval_audit_logs"("task_id");

-- CreateIndex
CREATE INDEX "approval_audit_logs_timestamp_idx" ON "approval_audit_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "agent_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_execution_step_id_fkey" FOREIGN KEY ("execution_step_id") REFERENCES "agent_execution_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_audit_logs" ADD CONSTRAINT "approval_audit_logs_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
