-- Migration for V10 Phase 150: Git Diff & Change Review

-- CreateEnum ChangeReviewStatus
DO $$ BEGIN
  CREATE TYPE "ChangeReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'APPROVED', 'REJECTED', 'APPLIED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable agent_git_change_reviews
CREATE TABLE IF NOT EXISTS "agent_git_change_reviews" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "commit_base_ref" VARCHAR(128),
    "status" "ChangeReviewStatus" NOT NULL DEFAULT 'PENDING',
    "changed_files" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "diff_content" TEXT NOT NULL,
    "diff_ref" VARCHAR(255),
    "reviewed_by" VARCHAR(128),
    "reviewed_at" TIMESTAMPTZ(6),
    "decision_comment" TEXT,
    "analysis_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_git_change_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_git_change_reviews_project_id_status_idx" ON "agent_git_change_reviews"("project_id", "status");
CREATE INDEX IF NOT EXISTS "agent_git_change_reviews_task_id_idx" ON "agent_git_change_reviews"("task_id");
CREATE INDEX IF NOT EXISTS "agent_git_change_reviews_created_at_idx" ON "agent_git_change_reviews"("created_at");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "agent_git_change_reviews" ADD CONSTRAINT "agent_git_change_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "agent_git_change_reviews" ADD CONSTRAINT "agent_git_change_reviews_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
