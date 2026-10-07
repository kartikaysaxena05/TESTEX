-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'LOCAL_FOLDER_CONNECTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'LOCAL_FOLDER_DISCONNECTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'LOCAL_FOLDER_RECONNECTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'LOCAL_FOLDER_VALIDATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'LOCAL_FOLDER_SECURITY_VIOLATION';
