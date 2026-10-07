-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('IDLE', 'THINKING', 'PLANNING', 'RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('PENDING', 'PLANNING', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentApprovalState" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'AGENT_SESSION_CREATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AGENT_TASK_CREATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AGENT_PLAN_GENERATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AGENT_TOOL_REQUESTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AGENT_TOOL_APPROVED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AGENT_TOOL_REJECTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AGENT_RUN_STARTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AGENT_RUN_CANCELLED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AGENT_EVIDENCE_ACCESSED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AGENT_RESULT_GENERATED';

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT 'New Testing Session',
    "status" "AgentSessionStatus" NOT NULL DEFAULT 'IDLE',
    "approval_state" "AgentApprovalState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "active_run_id" UUID,
    "current_task_id" UUID,
    "context_snapshot" JSONB,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" "AgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "plan_json" JSONB,
    "tool_calls_json" JSONB,
    "tool_results_json" JSONB,
    "evidence_refs_json" JSONB,
    "run_id" UUID,
    "token_count" INTEGER,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tasks" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_prompt" TEXT NOT NULL,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "approval_state" "AgentApprovalState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "plan_json" JSONB,
    "active_run_id" UUID,
    "tool_history_json" JSONB DEFAULT '[]',
    "evidence_refs_json" JSONB DEFAULT '[]',
    "result_summary" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_sessions_project_id_created_at_idx" ON "agent_sessions"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_sessions_user_id_idx" ON "agent_sessions"("user_id");

-- CreateIndex
CREATE INDEX "agent_messages_session_id_created_at_idx" ON "agent_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_tasks_session_id_created_at_idx" ON "agent_tasks"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_tasks_project_id_idx" ON "agent_tasks"("project_id");

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
