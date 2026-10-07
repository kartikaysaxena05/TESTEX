-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'SOCIAL_AUTH_STARTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'SOCIAL_AUTH_SUCCESS';
ALTER TYPE "AuthAuditAction" ADD VALUE 'SOCIAL_AUTH_FAILURE';
ALTER TYPE "AuthAuditAction" ADD VALUE 'SOCIAL_AUTH_CANCELLED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'SOCIAL_IDENTITY_LINKED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'ACCOUNT_LINK_CONFLICT';

-- CreateTable
CREATE TABLE "social_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_subject_id" VARCHAR(255) NOT NULL,
    "provider_email" VARCHAR(255),
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "profile_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_auth_attempts" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "state_hash" VARCHAR(64) NOT NULL,
    "nonce_hash" VARCHAR(64),
    "code_verifier" VARCHAR(128),
    "redirect_uri" VARCHAR(512) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "social_auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_identities_user_id_idx" ON "social_identities"("user_id");

-- CreateIndex
CREATE INDEX "social_identities_provider_idx" ON "social_identities"("provider");

-- CreateIndex
CREATE INDEX "social_identities_provider_email_idx" ON "social_identities"("provider_email");

-- CreateIndex
CREATE UNIQUE INDEX "social_identities_provider_provider_subject_id_key" ON "social_identities"("provider", "provider_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_auth_attempts_state_hash_key" ON "social_auth_attempts"("state_hash");

-- CreateIndex
CREATE INDEX "social_auth_attempts_state_hash_idx" ON "social_auth_attempts"("state_hash");

-- CreateIndex
CREATE INDEX "social_auth_attempts_status_idx" ON "social_auth_attempts"("status");

-- CreateIndex
CREATE INDEX "social_auth_attempts_expires_at_idx" ON "social_auth_attempts"("expires_at");

-- AddForeignKey
ALTER TABLE "social_identities" ADD CONSTRAINT "social_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
