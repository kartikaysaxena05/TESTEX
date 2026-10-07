-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'PROJECT_CREATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'PROJECT_RENAMED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'PROJECT_ARCHIVED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'PROJECT_RESTORED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'PROJECT_DELETED';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "archived_at" TIMESTAMPTZ(6),
ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "is_favorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_opened_at" TIMESTAMPTZ(6),
ADD COLUMN     "user_id" UUID;

-- CreateIndex
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

-- CreateIndex
CREATE INDEX "projects_last_opened_at_idx" ON "projects"("last_opened_at");

-- CreateIndex
CREATE INDEX "projects_deleted_at_idx" ON "projects"("deleted_at");

-- CreateIndex
CREATE INDEX "projects_user_id_status_idx" ON "projects"("user_id", "status");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
