-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AutonomousWorkflowStatus') THEN
        CREATE TYPE "AutonomousWorkflowStatus" AS ENUM (
            'PLANNING',
            'CONTEXT_COLLECTED',
            'TESTS_EXECUTED',
            'FAILURES_ANALYZED',
            'PATCH_PROPOSED',
            'WAITING_FOR_APPROVAL',
            'PATCH_APPROVED',
            'PATCH_REJECTED',
            'PATCH_APPLIED',
            'REVERIFIED',
            'RETESTED',
            'COMPLETED',
            'FAILED',
            'CANCELLED'
        );
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AutonomousWorkflowFinalStatus') THEN
        CREATE TYPE "AutonomousWorkflowFinalStatus" AS ENUM (
            'FIXED_AND_VERIFIED',
            'NON_APPLICATION_FAILURE',
            'REVERIFICATION_FAILED',
            'REGRESSION_DETECTED',
            'APPROVAL_REJECTED',
            'PATCH_FAILED',
            'NO_FIX_NEEDED',
            'EXECUTION_FAILED',
            'CANCELLED'
        );
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "agent_autonomous_workflow_reports" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workflow_status" "AutonomousWorkflowStatus" NOT NULL DEFAULT 'PLANNING',
    "final_status" "AutonomousWorkflowFinalStatus",
    "release_ready" BOOLEAN NOT NULL DEFAULT false,
    "original_request" TEXT NOT NULL,
    "plan_summary" TEXT,
    "tests_executed" JSONB NOT NULL DEFAULT '[]',
    "requirements_covered" JSONB NOT NULL DEFAULT '[]',
    "failures_found" JSONB NOT NULL DEFAULT '[]',
    "evidence_references" JSONB NOT NULL DEFAULT '{}',
    "failure_classification" JSONB,
    "root_cause_analysis" JSONB,
    "proposed_patch" JSONB,
    "approval_decision" JSONB,
    "before_after_results" JSONB,
    "regression_results" JSONB,
    "unresolved_issues" JSONB NOT NULL DEFAULT '[]',
    "audit_trail" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_autonomous_workflow_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "agent_autonomous_workflow_reports_task_id_key" ON "agent_autonomous_workflow_reports"("task_id");
CREATE INDEX IF NOT EXISTS "agent_autonomous_workflow_reports_project_id_workflow_status_idx" ON "agent_autonomous_workflow_reports"("project_id", "workflow_status");
CREATE INDEX IF NOT EXISTS "agent_autonomous_workflow_reports_task_id_idx" ON "agent_autonomous_workflow_reports"("task_id");
CREATE INDEX IF NOT EXISTS "agent_autonomous_workflow_reports_thread_id_idx" ON "agent_autonomous_workflow_reports"("thread_id");
CREATE INDEX IF NOT EXISTS "agent_autonomous_workflow_reports_user_id_idx" ON "agent_autonomous_workflow_reports"("user_id");
CREATE INDEX IF NOT EXISTS "agent_autonomous_workflow_reports_created_at_idx" ON "agent_autonomous_workflow_reports"("created_at");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_autonomous_workflow_reports_project_id_fkey'
    ) THEN
        ALTER TABLE "agent_autonomous_workflow_reports" ADD CONSTRAINT "agent_autonomous_workflow_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_autonomous_workflow_reports_thread_id_fkey'
    ) THEN
        ALTER TABLE "agent_autonomous_workflow_reports" ADD CONSTRAINT "agent_autonomous_workflow_reports_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "agent_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_autonomous_workflow_reports_task_id_fkey'
    ) THEN
        ALTER TABLE "agent_autonomous_workflow_reports" ADD CONSTRAINT "agent_autonomous_workflow_reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_autonomous_workflow_reports_user_id_fkey'
    ) THEN
        ALTER TABLE "agent_autonomous_workflow_reports" ADD CONSTRAINT "agent_autonomous_workflow_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
