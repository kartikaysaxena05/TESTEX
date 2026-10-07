-- AlterEnum
ALTER TYPE "AgentThreadTaskStatus" ADD VALUE IF NOT EXISTS 'INTERRUPTED';
ALTER TYPE "TaskControlAction" ADD VALUE IF NOT EXISTS 'CHECKPOINT_CREATED';
ALTER TYPE "TaskControlAction" ADD VALUE IF NOT EXISTS 'INTERRUPTION_DETECTED';
ALTER TYPE "TaskControlAction" ADD VALUE IF NOT EXISTS 'RECOVERY_ATTEMPTED';
ALTER TYPE "TaskControlAction" ADD VALUE IF NOT EXISTS 'RECOVERY_FAILED';

-- AlterTable
ALTER TABLE "agent_thread_tasks" ADD COLUMN IF NOT EXISTS "is_recoverable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agent_thread_tasks" ADD COLUMN IF NOT EXISTS "interrupted_at" TIMESTAMPTZ(6);
ALTER TABLE "agent_thread_tasks" ADD COLUMN IF NOT EXISTS "last_checkpoint_id" UUID;
ALTER TABLE "agent_thread_tasks" ADD COLUMN IF NOT EXISTS "last_checkpoint_seq" INTEGER;
ALTER TABLE "agent_thread_tasks" ADD COLUMN IF NOT EXISTS "max_retries" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE IF NOT EXISTS "agent_task_checkpoints" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "step_id" UUID,
    "sequence_number" INTEGER NOT NULL,
    "task_status" "AgentThreadTaskStatus" NOT NULL,
    "serialized_recovery_state" TEXT NOT NULL,
    "active_tool_call" VARCHAR(128),
    "completed_step_count" INTEGER NOT NULL DEFAULT 0,
    "pending_step_count" INTEGER NOT NULL DEFAULT 0,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "is_recoverable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_task_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "agent_task_checkpoints_task_id_sequence_number_key" ON "agent_task_checkpoints"("task_id", "sequence_number");
CREATE INDEX IF NOT EXISTS "agent_task_checkpoints_project_id_idx" ON "agent_task_checkpoints"("project_id");
CREATE INDEX IF NOT EXISTS "agent_task_checkpoints_thread_id_idx" ON "agent_task_checkpoints"("thread_id");
CREATE INDEX IF NOT EXISTS "agent_task_checkpoints_task_id_idx" ON "agent_task_checkpoints"("task_id");
CREATE INDEX IF NOT EXISTS "agent_task_checkpoints_user_id_idx" ON "agent_task_checkpoints"("user_id");
CREATE INDEX IF NOT EXISTS "agent_task_checkpoints_task_id_sequence_number_idx" ON "agent_task_checkpoints"("task_id", "sequence_number");
CREATE INDEX IF NOT EXISTS "agent_task_checkpoints_task_id_created_at_idx" ON "agent_task_checkpoints"("task_id", "created_at");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_task_checkpoints_project_id_fkey'
    ) THEN
        ALTER TABLE "agent_task_checkpoints" ADD CONSTRAINT "agent_task_checkpoints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_task_checkpoints_thread_id_fkey'
    ) THEN
        ALTER TABLE "agent_task_checkpoints" ADD CONSTRAINT "agent_task_checkpoints_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "agent_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_task_checkpoints_task_id_fkey'
    ) THEN
        ALTER TABLE "agent_task_checkpoints" ADD CONSTRAINT "agent_task_checkpoints_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_task_checkpoints_user_id_fkey'
    ) THEN
        ALTER TABLE "agent_task_checkpoints" ADD CONSTRAINT "agent_task_checkpoints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_task_checkpoints_step_id_fkey'
    ) THEN
        ALTER TABLE "agent_task_checkpoints" ADD CONSTRAINT "agent_task_checkpoints_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "agent_execution_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
