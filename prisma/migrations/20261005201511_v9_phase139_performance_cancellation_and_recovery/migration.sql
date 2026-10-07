-- CreateEnum
CREATE TYPE "AiGenerationRequestState" AS ENUM ('QUEUED', 'STARTING', 'RUNNING', 'STREAMING', 'COMPLETED', 'CANCELLED', 'TIMEOUT', 'PROVIDER_ERROR', 'MODEL_ERROR', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'INTERRUPTED', 'RECOVERY_REQUIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_REQUEST_STARTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_REQUEST_CANCELLED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_REQUEST_TIMED_OUT';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_REQUEST_RECOVERED';

-- CreateTable
CREATE TABLE "ai_generation_requests" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "user_id" UUID,
    "provider_id" VARCHAR(64) NOT NULL,
    "model_id" VARCHAR(256) NOT NULL,
    "state" "AiGenerationRequestState" NOT NULL DEFAULT 'QUEUED',
    "prompt_length" INTEGER NOT NULL DEFAULT 0,
    "is_streaming" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "tokens_generated" INTEGER,
    "error_category" VARCHAR(64),
    "error_message" VARCHAR(1024),
    "cancellation_note" VARCHAR(256),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_generation_requests_project_id_idx" ON "ai_generation_requests"("project_id");

-- CreateIndex
CREATE INDEX "ai_generation_requests_user_id_idx" ON "ai_generation_requests"("user_id");

-- CreateIndex
CREATE INDEX "ai_generation_requests_state_idx" ON "ai_generation_requests"("state");

-- CreateIndex
CREATE INDEX "ai_generation_requests_started_at_idx" ON "ai_generation_requests"("started_at");

-- AddForeignKey
ALTER TABLE "ai_generation_requests" ADD CONSTRAINT "ai_generation_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_requests" ADD CONSTRAINT "ai_generation_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
