-- Migration for V10 Phase 142: Task / Conversation / Thread Model

-- CreateEnums
DO $$ BEGIN
  CREATE TYPE "AgentThreadStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentThreadTaskStatus" AS ENUM ('QUEUED', 'PLANNING', 'RUNNING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentThreadMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentExecutionStepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'WAITING');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentToolCallStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Alter AuthAuditAction enum
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'AGENT_THREAD_CREATED';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'AGENT_THREAD_ARCHIVED';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'AGENT_TASK_QUEUED';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'AGENT_TASK_CANCELLED';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'AGENT_TASK_RETRIED';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'AGENT_TASK_RESUMED';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'AGENT_STEP_STARTED';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'AGENT_STEP_COMPLETED';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'AGENT_STEP_FAILED';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'AGENT_TOOL_CALL_RECORDED';

-- CreateTable
CREATE TABLE IF NOT EXISTS "agent_threads" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT 'New Thread',
    "status" "AgentThreadStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "agent_thread_tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "instruction" TEXT NOT NULL,
    "status" "AgentThreadTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "failure_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "parent_task_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_thread_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "agent_thread_messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "task_id" UUID,
    "role" "AgentThreadMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_thread_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "agent_execution_steps" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "step_type" VARCHAR(64) NOT NULL,
    "status" "AgentExecutionStepStatus" NOT NULL DEFAULT 'PENDING',
    "title" VARCHAR(255) NOT NULL,
    "input_reference" TEXT,
    "output_reference" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "agent_execution_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "agent_tool_call_records" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "step_id" UUID,
    "tool_name" VARCHAR(128) NOT NULL,
    "status" "AgentToolCallStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "agent_tool_call_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "agent_threads_project_id_status_idx" ON "agent_threads"("project_id", "status");
CREATE INDEX IF NOT EXISTS "agent_threads_project_id_last_activity_at_idx" ON "agent_threads"("project_id", "last_activity_at");
CREATE INDEX IF NOT EXISTS "agent_threads_user_id_idx" ON "agent_threads"("user_id");

CREATE INDEX IF NOT EXISTS "agent_thread_tasks_project_id_status_idx" ON "agent_thread_tasks"("project_id", "status");
CREATE INDEX IF NOT EXISTS "agent_thread_tasks_thread_id_created_at_idx" ON "agent_thread_tasks"("thread_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_thread_tasks_user_id_idx" ON "agent_thread_tasks"("user_id");
CREATE INDEX IF NOT EXISTS "agent_thread_tasks_parent_task_id_idx" ON "agent_thread_tasks"("parent_task_id");

CREATE INDEX IF NOT EXISTS "agent_thread_messages_thread_id_sequence_idx" ON "agent_thread_messages"("thread_id", "sequence");
CREATE INDEX IF NOT EXISTS "agent_thread_messages_task_id_idx" ON "agent_thread_messages"("task_id");

CREATE INDEX IF NOT EXISTS "agent_execution_steps_task_id_sequence_idx" ON "agent_execution_steps"("task_id", "sequence");

CREATE INDEX IF NOT EXISTS "agent_tool_call_records_task_id_idx" ON "agent_tool_call_records"("task_id");
CREATE INDEX IF NOT EXISTS "agent_tool_call_records_step_id_idx" ON "agent_tool_call_records"("step_id");

-- AddForeignKeys
DO $$ BEGIN
  ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_thread_tasks" ADD CONSTRAINT "agent_thread_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_thread_tasks" ADD CONSTRAINT "agent_thread_tasks_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "agent_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_thread_tasks" ADD CONSTRAINT "agent_thread_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_thread_tasks" ADD CONSTRAINT "agent_thread_tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_thread_messages" ADD CONSTRAINT "agent_thread_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "agent_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_thread_messages" ADD CONSTRAINT "agent_thread_messages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_execution_steps" ADD CONSTRAINT "agent_execution_steps_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_tool_call_records" ADD CONSTRAINT "agent_tool_call_records_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_tool_call_records" ADD CONSTRAINT "agent_tool_call_records_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "agent_execution_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
