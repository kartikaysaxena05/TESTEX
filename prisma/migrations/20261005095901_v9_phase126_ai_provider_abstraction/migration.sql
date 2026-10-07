-- AlterEnum
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_PROVIDER_CONFIG_UPDATED';

-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "user_id" UUID,
    "provider_id" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "base_url" VARCHAR(2048) NOT NULL DEFAULT 'http://127.0.0.1:11434',
    "default_model" VARCHAR(128) NOT NULL DEFAULT 'llama3',
    "request_timeout_ms" INTEGER NOT NULL DEFAULT 60000,
    "streaming_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_provider_configs_project_id_idx" ON "ai_provider_configs"("project_id");

-- CreateIndex
CREATE INDEX "ai_provider_configs_user_id_idx" ON "ai_provider_configs"("user_id");

-- CreateIndex
CREATE INDEX "ai_provider_configs_provider_id_idx" ON "ai_provider_configs"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_configs_project_id_provider_id_key" ON "ai_provider_configs"("project_id", "provider_id");

-- AddForeignKey
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
