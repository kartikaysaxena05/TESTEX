-- CreateEnum
CREATE TYPE "TargetAuthorizationState" AS ENUM ('UNVERIFIED', 'USER_CONFIRMED', 'VERIFIED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TargetConnectionStatus" AS ENUM ('CONFIGURED', 'VERIFIED_REACHABLE', 'UNREACHABLE', 'BLOCKED', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'WEBSITE_TARGET_CREATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'WEBSITE_TARGET_UPDATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'WEBSITE_TARGET_ENVIRONMENT_CHANGED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'WEBSITE_TARGET_AUTH_CONFIRMED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'WEBSITE_TARGET_SAFE_MODE_CHANGED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'WEBSITE_TARGET_CONNECTION_CHECKED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'WEBSITE_TARGET_ACTIVATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'WEBSITE_TARGET_REMOVED';

-- CreateTable
CREATE TABLE "website_targets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "base_url" VARCHAR(2048) NOT NULL,
    "canonical_url" VARCHAR(2048) NOT NULL,
    "environment_type" "EnvironmentType" NOT NULL DEFAULT 'LOCAL',
    "authorization_state" "TargetAuthorizationState" NOT NULL DEFAULT 'UNVERIFIED',
    "authorization_confirmed_at" TIMESTAMP(3),
    "authorization_confirmed_by" UUID,
    "safe_mode_enabled" BOOLEAN NOT NULL DEFAULT true,
    "requires_auth" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "connection_status" "TargetConnectionStatus" NOT NULL DEFAULT 'CONFIGURED',
    "last_checked_at" TIMESTAMP(3),
    "last_reachable_at" TIMESTAMP(3),
    "last_failure_reason" VARCHAR(1000),
    "last_status_code" INTEGER,
    "last_response_time_ms" INTEGER,
    "resolved_final_url" VARCHAR(2048),
    "redirect_count" INTEGER NOT NULL DEFAULT 0,
    "tls_valid" BOOLEAN,
    "notes" VARCHAR(2000),
    "environment_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_targets_project_id_idx" ON "website_targets"("project_id");

-- CreateIndex
CREATE INDEX "website_targets_project_id_is_active_idx" ON "website_targets"("project_id", "is_active");

-- CreateIndex
CREATE INDEX "website_targets_project_id_environment_type_idx" ON "website_targets"("project_id", "environment_type");

-- CreateIndex
CREATE INDEX "website_targets_environment_id_idx" ON "website_targets"("environment_id");

-- CreateIndex
CREATE INDEX "website_targets_deleted_at_idx" ON "website_targets"("deleted_at");

-- AddForeignKey
ALTER TABLE "website_targets" ADD CONSTRAINT "website_targets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_targets" ADD CONSTRAINT "website_targets_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "project_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
