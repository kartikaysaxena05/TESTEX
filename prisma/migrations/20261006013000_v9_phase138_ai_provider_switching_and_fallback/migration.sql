-- CreateEnum
CREATE TYPE "AiFallbackPolicy" AS ENUM ('DISABLED', 'LOCAL_ONLY', 'CONFIGURED_PROVIDERS', 'ANY_ALLOWED_PROVIDER');

-- AlterEnum
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_PROVIDER_ROUTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_PROVIDER_FALLBACK_TRIGGERED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_PROVIDER_ATTEMPT_FAILED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_FALLBACK_POLICY_UPDATED';

-- CreateTable
CREATE TABLE "ai_fallback_settings" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "user_id" UUID,
    "preferred_provider" VARCHAR(64) NOT NULL DEFAULT 'OLLAMA',
    "preferred_model" VARCHAR(256),
    "fallback_policy" "AiFallbackPolicy" NOT NULL DEFAULT 'LOCAL_ONLY',
    "fallback_priority" JSONB NOT NULL DEFAULT '["OLLAMA"]',
    "max_retries" INTEGER NOT NULL DEFAULT 2,
    "request_timeout_ms" INTEGER NOT NULL DEFAULT 60000,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_fallback_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_fallback_settings_project_id_key" ON "ai_fallback_settings"("project_id");

-- CreateIndex
CREATE INDEX "ai_fallback_settings_project_id_idx" ON "ai_fallback_settings"("project_id");

-- CreateIndex
CREATE INDEX "ai_fallback_settings_user_id_idx" ON "ai_fallback_settings"("user_id");

-- CreateIndex
CREATE INDEX "ai_fallback_settings_fallback_policy_idx" ON "ai_fallback_settings"("fallback_policy");

-- AddForeignKey
ALTER TABLE "ai_fallback_settings" ADD CONSTRAINT "ai_fallback_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_fallback_settings" ADD CONSTRAINT "ai_fallback_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
