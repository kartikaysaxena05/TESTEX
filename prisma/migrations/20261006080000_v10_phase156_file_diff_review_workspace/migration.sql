-- CreateEnum
CREATE TYPE "FileReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED');

-- CreateTable
CREATE TABLE "file_diff_reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "approval_request_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "affected_files" TEXT[],
    "original_diff" TEXT NOT NULL,
    "diff_checksum" VARCHAR(64) NOT NULL,
    "status" "FileReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "decision_reason" TEXT,
    "applied_at" TIMESTAMPTZ(6),
    "applied_commit" VARCHAR(128),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_diff_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_diff_reviews_project_id_status_idx" ON "file_diff_reviews"("project_id", "status");

-- CreateIndex
CREATE INDEX "file_diff_reviews_task_id_status_idx" ON "file_diff_reviews"("task_id", "status");

-- CreateIndex
CREATE INDEX "file_diff_reviews_thread_id_idx" ON "file_diff_reviews"("thread_id");

-- CreateIndex
CREATE INDEX "file_diff_reviews_user_id_idx" ON "file_diff_reviews"("user_id");

-- CreateIndex
CREATE INDEX "file_diff_reviews_approval_request_id_idx" ON "file_diff_reviews"("approval_request_id");

-- CreateIndex
CREATE INDEX "file_diff_reviews_created_at_idx" ON "file_diff_reviews"("created_at");

-- AddForeignKey
ALTER TABLE "file_diff_reviews" ADD CONSTRAINT "file_diff_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_diff_reviews" ADD CONSTRAINT "file_diff_reviews_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "agent_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_diff_reviews" ADD CONSTRAINT "file_diff_reviews_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "agent_thread_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_diff_reviews" ADD CONSTRAINT "file_diff_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_diff_reviews" ADD CONSTRAINT "file_diff_reviews_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
