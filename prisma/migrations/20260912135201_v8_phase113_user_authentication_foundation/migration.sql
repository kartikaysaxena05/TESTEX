-- CreateEnum
CREATE TYPE "UserAccountStatus" AS ENUM ('ACTIVE', 'UNVERIFIED', 'LOCKED', 'DISABLED', 'DELETED');

-- CreateEnum
CREATE TYPE "AuthAuditAction" AS ENUM ('CREDENTIAL_CREATED', 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'SESSION_ISSUED', 'SESSION_REVOKED', 'ALL_SESSIONS_REVOKED', 'ACCOUNT_LOCKED', 'ACCOUNT_DISABLED', 'PASSWORD_CHANGED', 'LOGOUT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "normalized_email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(128) NOT NULL,
    "account_status" "UserAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMPTZ(6),
    "last_authenticated_at" TIMESTAMPTZ(6),
    "security_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(512) NOT NULL,
    "algorithm" VARCHAR(64) NOT NULL DEFAULT 'scrypt',
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_token_hash" VARCHAR(64) NOT NULL,
    "device_info" VARCHAR(255),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason" VARCHAR(255),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_audit_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" "AuthAuditAction" NOT NULL,
    "actor_email" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(64),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_normalized_email_key" ON "users"("normalized_email");

-- CreateIndex
CREATE INDEX "users_normalized_email_idx" ON "users"("normalized_email");

-- CreateIndex
CREATE INDEX "users_account_status_idx" ON "users"("account_status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "password_credentials_user_id_idx" ON "password_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_session_token_hash_key" ON "auth_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_session_token_hash_idx" ON "auth_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_is_revoked_idx" ON "auth_sessions"("is_revoked");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "auth_audit_events_user_id_idx" ON "auth_audit_events"("user_id");

-- CreateIndex
CREATE INDEX "auth_audit_events_action_idx" ON "auth_audit_events"("action");

-- CreateIndex
CREATE INDEX "auth_audit_events_actor_email_idx" ON "auth_audit_events"("actor_email");

-- CreateIndex
CREATE INDEX "auth_audit_events_timestamp_idx" ON "auth_audit_events"("timestamp");

-- AddForeignKey
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_audit_events" ADD CONSTRAINT "auth_audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
