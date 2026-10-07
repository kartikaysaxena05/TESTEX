-- CreateEnum
CREATE TYPE "TerminalExecutionStatus" AS ENUM ('QUEUED', 'WAITING_FOR_APPROVAL', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TerminalCommandPolicyClassification" AS ENUM ('SAFE', 'REQUIRES_APPROVAL', 'BLOCKED');

-- CreateTable
CREATE TABLE "agent_terminal_executions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "step_id" UUID,
    "command" TEXT NOT NULL,
    "working_directory" VARCHAR(512) NOT NULL,
    "status" "TerminalExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "policy_decision" "TerminalCommandPolicyClassification" NOT NULL,
    "policy_reason" TEXT,
    "exit_code" INTEGER,
    "stdout" TEXT NOT NULL DEFAULT '',
    "stderr" TEXT NOT NULL DEFAULT '',
    "duration_ms" INTEGER,
    "timed_out" BOOLEAN NOT NULL DEFAULT false,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "max_output_bytes" INTEGER NOT NULL DEFAULT 524288,
    "approved_by" VARCHAR(128),
    "approved_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_terminal_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_terminal_executions_project_id_status_idx" ON "agent_terminal_executions"("project_id", "status");

-- CreateIndex
CREATE INDEX "agent_terminal_executions_task_id_idx" ON "agent_terminal_executions"("task_id");

-- CreateIndex
CREATE INDEX "agent_terminal_executions_thread_id_idx" ON "agent_terminal_executions"("thread_id");

-- CreateIndex
CREATE INDEX "agent_terminal_executions_created_at_idx" ON "agent_terminal_executions"("created_at");

-- AddForeignKey
ALTER TABLE "agent_terminal_executions" ADD CONSTRAINT "agent_terminal_executions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_terminal_executions" ADD CONSTRAINT "agent_terminal_executions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
