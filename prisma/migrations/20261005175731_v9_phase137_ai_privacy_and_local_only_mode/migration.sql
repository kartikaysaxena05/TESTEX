-- CreateEnum
CREATE TYPE "AiPrivacyMode" AS ENUM ('LOCAL_ONLY', 'REMOTE_ALLOWED');

-- CreateTable
CREATE TABLE "ai_privacy_settings" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "user_id" UUID,
    "privacy_mode" "AiPrivacyMode" NOT NULL DEFAULT 'LOCAL_ONLY',
    "allow_cloud_fallback" BOOLEAN NOT NULL DEFAULT false,
    "redact_secrets" BOOLEAN NOT NULL DEFAULT true,
    "strip_credentials" BOOLEAN NOT NULL DEFAULT true,
    "permitted_local_provider" VARCHAR(64) NOT NULL DEFAULT 'OLLAMA',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_privacy_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_privacy_settings_project_id_key" ON "ai_privacy_settings"("project_id");

-- CreateIndex
CREATE INDEX "ai_privacy_settings_project_id_idx" ON "ai_privacy_settings"("project_id");

-- CreateIndex
CREATE INDEX "ai_privacy_settings_user_id_idx" ON "ai_privacy_settings"("user_id");

-- CreateIndex
CREATE INDEX "ai_privacy_settings_privacy_mode_idx" ON "ai_privacy_settings"("privacy_mode");

-- AddForeignKey
ALTER TABLE "ai_privacy_settings" ADD CONSTRAINT "ai_privacy_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_privacy_settings" ADD CONSTRAINT "ai_privacy_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
