-- AlterEnum
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_MODEL_SELECTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_MODEL_CAPABILITY_VERIFIED';

-- CreateTable
CREATE TABLE "ai_model_selections" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "user_id" UUID,
    "provider_id" VARCHAR(64) NOT NULL,
    "model_id" VARCHAR(256) NOT NULL,
    "selection_type" VARCHAR(64) NOT NULL DEFAULT 'DEFAULT',
    "capability_snapshot" JSONB,
    "last_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_selections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_model_selections_project_id_idx" ON "ai_model_selections"("project_id");

-- CreateIndex
CREATE INDEX "ai_model_selections_user_id_idx" ON "ai_model_selections"("user_id");

-- CreateIndex
CREATE INDEX "ai_model_selections_provider_id_idx" ON "ai_model_selections"("provider_id");

-- CreateIndex
CREATE INDEX "ai_model_selections_model_id_idx" ON "ai_model_selections"("model_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_selections_project_id_selection_type_key" ON "ai_model_selections"("project_id", "selection_type");

-- AddForeignKey
ALTER TABLE "ai_model_selections" ADD CONSTRAINT "ai_model_selections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_selections" ADD CONSTRAINT "ai_model_selections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
