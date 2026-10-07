-- CreateEnum
CREATE TYPE "TaskControlAction" AS ENUM ('STOP', 'CANCEL', 'PAUSE', 'RESUME', 'RETRY');

-- CreateEnum
CREATE TYPE "TaskControlActorType" AS ENUM ('USER', 'SYSTEM', 'TIMEOUT');

-- AlterEnum
ALTER TYPE "AgentThreadTaskStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "AgentThreadTaskStatus" ADD VALUE IF NOT EXISTS 'STOPPED';

-- AlterTable
ALTER TABLE "agent_thread_tasks" ADD COLUMN IF NOT EXISTS "attempt_number" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "agent_thread_tasks" ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMPTZ(6);
ALTER TABLE "agent_thread_tasks" ADD COLUMN IF NOT EXISTS "stopped_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE IF NOT EXISTS "agent_task_control_audit_logs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" "TaskControlAction" NOT NULL,
    "previous_state" "AgentThreadTaskStatus" NOT NULL,
    "new_state" "AgentThreadTaskStatus" NOT NULL,
    "actor_type" "TaskControlActorType" NOT NULL DEFAULT 'USER',
    "actor_id" VARCHAR(128) NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_task_control_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_task_control_audit_logs_project_id_idx" ON "agent_task_control_audit_logs"("project_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_task_control_audit_logs_task_id_idx" ON "agent_task_control_audit_logs"("task_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_task_control_audit_logs_thread_id_idx" ON "agent_task_control_audit_logs"("thread_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_task_control_audit_logs_user_id_idx" ON "agent_task_control_audit_logs"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_task_control_audit_logs_timestamp_idx" ON "agent_task_control_audit_logs"("timestamp");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_task_control_audit_logs_project_id_fkey'
    ) THEN
        ALTER TABLE "agent_task_control_audit_logs" ADD CONSTRAINT "agent_task_control_audit_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_task_control_audit_logs_thread_id_fkey'
    ) THEN
        ALTER TABLE "agent_task_control_audit_logs" ADD CONSTRAINT "agent_task_control_audit_logs_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "agent_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_task_control_audit_logs_task_id_fkey'
    ) THEN
        ALTER TABLE "agent_task_control_audit_logs" ADD CONSTRAINT "agent_task_control_audit_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_task_control_audit_logs_user_id_fkey'
    ) THEN
        ALTER TABLE "agent_task_control_audit_logs" ADD CONSTRAINT "agent_task_control_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
