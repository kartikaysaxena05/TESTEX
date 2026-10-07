-- CreateEnum
CREATE TYPE "AgentPlanStatus" AS ENUM ('DRAFT', 'READY', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentPlanStepStatus" AS ENUM ('PENDING', 'READY', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "agent_plans" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "status" "AgentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "total_steps" INTEGER NOT NULL DEFAULT 0,
    "completed_steps" INTEGER NOT NULL DEFAULT 0,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_plan_steps" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "objective" TEXT NOT NULL,
    "tool_action" VARCHAR(128) NOT NULL,
    "structured_input" JSONB NOT NULL DEFAULT '{}',
    "dependencies" JSONB NOT NULL DEFAULT '[]',
    "status" "AgentPlanStepStatus" NOT NULL DEFAULT 'PENDING',
    "result_reference" TEXT,
    "error_info" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_plan_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_plans_task_id_version_key" ON "agent_plans"("task_id", "version");

-- CreateIndex
CREATE INDEX "agent_plans_project_id_status_idx" ON "agent_plans"("project_id", "status");

-- CreateIndex
CREATE INDEX "agent_plans_thread_id_idx" ON "agent_plans"("thread_id");

-- CreateIndex
CREATE INDEX "agent_plans_task_id_is_active_idx" ON "agent_plans"("task_id", "is_active");

-- CreateIndex
CREATE INDEX "agent_plans_created_at_idx" ON "agent_plans"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_plan_steps_plan_id_sequence_key" ON "agent_plan_steps"("plan_id", "sequence");

-- CreateIndex
CREATE INDEX "agent_plan_steps_plan_id_status_idx" ON "agent_plan_steps"("plan_id", "status");

-- CreateIndex
CREATE INDEX "agent_plan_steps_sequence_idx" ON "agent_plan_steps"("sequence");

-- AddForeignKey
ALTER TABLE "agent_plans" ADD CONSTRAINT "agent_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_plans" ADD CONSTRAINT "agent_plans_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_plan_steps" ADD CONSTRAINT "agent_plan_steps_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "agent_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
