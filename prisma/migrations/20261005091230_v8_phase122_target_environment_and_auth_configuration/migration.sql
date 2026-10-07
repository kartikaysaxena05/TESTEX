-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'TARGET_ENVIRONMENT_CONFIGURED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'TARGET_ENVIRONMENT_SWITCHED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'BROWSER_CONFIGURATION_CHANGED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AUTH_CONFIGURATION_CHANGED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'AUTH_TEST_RESULT';

-- AlterTable
ALTER TABLE "authentication_profiles" ADD COLUMN     "encrypted_password" TEXT,
ADD COLUMN     "password_preview" VARCHAR(32),
ADD COLUMN     "username" VARCHAR(255);

-- AlterTable
ALTER TABLE "project_environments" ADD COLUMN     "api_url" VARCHAR(2048);
