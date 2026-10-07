-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'PROFILE_UPDATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'PREFERENCE_UPDATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'ACCOUNT_DELETED';

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "theme" VARCHAR(32) NOT NULL DEFAULT 'system',
    "density" VARCHAR(32) NOT NULL DEFAULT 'comfortable',
    "time_format" VARCHAR(32) NOT NULL DEFAULT 'system',
    "production_safe_mode" BOOLEAN NOT NULL DEFAULT true,
    "default_browser" VARCHAR(32) NOT NULL DEFAULT 'chromium',
    "confirm_destructive_actions" BOOLEAN NOT NULL DEFAULT true,
    "open_external_links_safely" BOOLEAN NOT NULL DEFAULT true,
    "desktop_notifications" BOOLEAN NOT NULL DEFAULT true,
    "notify_test_run_complete" BOOLEAN NOT NULL DEFAULT true,
    "notify_critical_defect" BOOLEAN NOT NULL DEFAULT true,
    "notify_repair_approval" BOOLEAN NOT NULL DEFAULT true,
    "notify_release_readiness" BOOLEAN NOT NULL DEFAULT true,
    "email_notifications" BOOLEAN NOT NULL DEFAULT false,
    "email_critical_defect" BOOLEAN NOT NULL DEFAULT false,
    "email_release_readiness" BOOLEAN NOT NULL DEFAULT false,
    "telemetry_enabled" BOOLEAN NOT NULL DEFAULT false,
    "crash_reports_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE INDEX "user_preferences_user_id_idx" ON "user_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
