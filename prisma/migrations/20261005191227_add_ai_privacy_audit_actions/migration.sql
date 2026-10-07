-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_PRIVACY_MODE_CHANGED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_REMOTE_PROVIDER_BLOCKED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AI_SECRET_REDACTION_APPLIED';
