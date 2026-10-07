-- Migration for V10 Phase 144: Tool Permission System

-- CreateEnums
DO $$ BEGIN
  CREATE TYPE "ToolPermissionLevel" AS ENUM ('DENIED', 'READ_ONLY', 'EXECUTE', 'APPROVAL_REQUIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ToolApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ToolDecision" AS ENUM ('PERMITTED', 'DENIED', 'APPROVAL_REQUESTED', 'APPROVAL_GRANTED', 'APPROVAL_REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable agent_tool_approvals
CREATE TABLE IF NOT EXISTS "agent_tool_approvals" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tool_name" VARCHAR(128) NOT NULL,
    "requested_operation" VARCHAR(255) NOT NULL,
    "permission_level" "ToolPermissionLevel" NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    "status" "ToolApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "input_payload" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "decision_reason" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tool_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable agent_tool_audit_logs
CREATE TABLE IF NOT EXISTS "agent_tool_audit_logs" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tool_name" VARCHAR(128) NOT NULL,
    "requested_operation" VARCHAR(255) NOT NULL,
    "permission_level" "ToolPermissionLevel" NOT NULL,
    "decision" "ToolDecision" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tool_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes for agent_tool_approvals
CREATE INDEX IF NOT EXISTS "agent_tool_approvals_task_id_status_idx" ON "agent_tool_approvals"("task_id", "status");
CREATE INDEX IF NOT EXISTS "agent_tool_approvals_thread_id_idx" ON "agent_tool_approvals"("thread_id");
CREATE INDEX IF NOT EXISTS "agent_tool_approvals_project_id_idx" ON "agent_tool_approvals"("project_id");
CREATE INDEX IF NOT EXISTS "agent_tool_approvals_user_id_idx" ON "agent_tool_approvals"("user_id");

-- CreateIndexes for agent_tool_audit_logs
CREATE INDEX IF NOT EXISTS "agent_tool_audit_logs_task_id_idx" ON "agent_tool_audit_logs"("task_id");
CREATE INDEX IF NOT EXISTS "agent_tool_audit_logs_thread_id_idx" ON "agent_tool_audit_logs"("thread_id");
CREATE INDEX IF NOT EXISTS "agent_tool_audit_logs_project_id_idx" ON "agent_tool_audit_logs"("project_id");
CREATE INDEX IF NOT EXISTS "agent_tool_audit_logs_user_id_idx" ON "agent_tool_audit_logs"("user_id");
CREATE INDEX IF NOT EXISTS "agent_tool_audit_logs_tool_name_idx" ON "agent_tool_audit_logs"("tool_name");
CREATE INDEX IF NOT EXISTS "agent_tool_audit_logs_timestamp_idx" ON "agent_tool_audit_logs"("timestamp");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "agent_tool_approvals" ADD CONSTRAINT "agent_tool_approvals_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_tool_audit_logs" ADD CONSTRAINT "agent_tool_audit_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
