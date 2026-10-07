-- CreateEnum
CREATE TYPE "GitProviderType" AS ENUM ('GITHUB', 'GITLAB', 'BITBUCKET', 'LOCAL_GIT');

-- CreateEnum
CREATE TYPE "RepositoryConnectionStatus" AS ENUM ('CONFIGURED', 'CONNECTED', 'ACCESSIBLE', 'UNREACHABLE', 'UNAUTHORIZED', 'BLOCKED', 'IMPORTING', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "RepositoryImportStatus" AS ENUM ('NOT_IMPORTED', 'PENDING', 'IMPORTING', 'IMPORTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepositoryVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'INTERNAL', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_CONNECTION_CREATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_CONNECTION_UPDATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_AUTHORIZED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_VERIFIED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_BRANCH_CHANGED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_REVISION_CHANGED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_IMPORT_STARTED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_IMPORT_COMPLETED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_IMPORT_FAILED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_IMPORT_CANCELLED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_ACTIVATED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'REPOSITORY_DISCONNECTED';

-- CreateTable
CREATE TABLE "repository_connections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "provider" "GitProviderType" NOT NULL DEFAULT 'GITHUB',
    "repository_identifier" VARCHAR(255) NOT NULL,
    "repository_name" VARCHAR(255) NOT NULL,
    "owner" VARCHAR(255) NOT NULL,
    "repository_url" VARCHAR(2048) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "visibility" "RepositoryVisibility" NOT NULL DEFAULT 'PUBLIC',
    "default_branch" VARCHAR(255) NOT NULL DEFAULT 'main',
    "selected_branch" VARCHAR(255) NOT NULL DEFAULT 'main',
    "selected_revision" VARCHAR(64),
    "imported_revision" VARCHAR(64),
    "connection_status" "RepositoryConnectionStatus" NOT NULL DEFAULT 'CONFIGURED',
    "import_status" "RepositoryImportStatus" NOT NULL DEFAULT 'NOT_IMPORTED',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "encrypted_credentials" TEXT,
    "local_path" VARCHAR(4096),
    "last_verified_at" TIMESTAMP(3),
    "last_imported_at" TIMESTAMP(3),
    "last_failure_reason" VARCHAR(1000),
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "total_size_bytes" BIGINT NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_import_records" (
    "id" UUID NOT NULL,
    "repository_connection_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "branch" VARCHAR(255) NOT NULL,
    "revision" VARCHAR(64) NOT NULL,
    "status" "RepositoryImportStatus" NOT NULL DEFAULT 'PENDING',
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "total_size_bytes" BIGINT NOT NULL DEFAULT 0,
    "storage_path" VARCHAR(4096),
    "error_message" VARCHAR(1000),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,

    CONSTRAINT "repository_import_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repository_connections_project_id_idx" ON "repository_connections"("project_id");

-- CreateIndex
CREATE INDEX "repository_connections_project_id_is_active_idx" ON "repository_connections"("project_id", "is_active");

-- CreateIndex
CREATE INDEX "repository_connections_project_id_provider_repository_ident_idx" ON "repository_connections"("project_id", "provider", "repository_identifier");

-- CreateIndex
CREATE INDEX "repository_connections_deleted_at_idx" ON "repository_connections"("deleted_at");

-- CreateIndex
CREATE INDEX "repository_import_records_repository_connection_id_idx" ON "repository_import_records"("repository_connection_id");

-- CreateIndex
CREATE INDEX "repository_import_records_project_id_idx" ON "repository_import_records"("project_id");

-- AddForeignKey
ALTER TABLE "repository_connections" ADD CONSTRAINT "repository_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_import_records" ADD CONSTRAINT "repository_import_records_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
