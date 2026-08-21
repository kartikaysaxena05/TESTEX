-- CreateEnum
CREATE TYPE "StartupKind" AS ENUM ('PACKAGE_SCRIPT', 'RUNTIME_ENTRY', 'FRAMEWORK_COMMAND', 'CUSTOM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RunConfigSafety" AS ENUM ('SAFE_STRUCTURE', 'REQUIRES_REVIEW', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "RunConfigSource" AS ENUM ('DETECTED', 'USER_SELECTED');

-- CreateEnum
CREATE TYPE "RunConfigStatus" AS ENUM ('CONFIGURED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('MANUAL_BASELINE', 'INDEX_BASELINE');

-- CreateEnum
CREATE TYPE "FileChangeType" AS ENUM ('ADDED', 'MODIFIED', 'DELETED', 'RENAMED', 'UNCHANGED');

-- AlterTable
ALTER TABLE "project_sources" ADD COLUMN     "active_baseline_snapshot_id" UUID;

-- CreateTable
CREATE TABLE "project_run_configurations" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "application_unit_root" VARCHAR(1024) NOT NULL DEFAULT '.',
    "runtime" VARCHAR(64),
    "package_manager" VARCHAR(64),
    "startup_kind" "StartupKind" NOT NULL DEFAULT 'UNKNOWN',
    "executable" VARCHAR(255) NOT NULL,
    "args" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "working_directory" VARCHAR(1024) NOT NULL DEFAULT '.',
    "target_url" VARCHAR(2048),
    "environment_variable_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" "ArchitectureConfidence" NOT NULL DEFAULT 'LOW',
    "safety" "RunConfigSafety" NOT NULL DEFAULT 'SAFE_STRUCTURE',
    "source" "RunConfigSource" NOT NULL DEFAULT 'DETECTED',
    "status" "RunConfigStatus" NOT NULL DEFAULT 'CONFIGURED',
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "evidence_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_run_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_snapshots" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "index_run_id" UUID,
    "label" VARCHAR(255),
    "kind" "SnapshotKind" NOT NULL DEFAULT 'MANUAL_BASELINE',
    "status" "SnapshotStatus" NOT NULL DEFAULT 'COMPLETE',
    "snapshot_version" INTEGER NOT NULL DEFAULT 1,
    "fingerprint" VARCHAR(64) NOT NULL,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "source_file_count" INTEGER NOT NULL DEFAULT 0,
    "test_file_count" INTEGER NOT NULL DEFAULT 0,
    "git_head_commit" VARCHAR(64),
    "git_branch" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_snapshot_files" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "relative_path" VARCHAR(1024) NOT NULL,
    "content_hash" VARCHAR(64),
    "language" VARCHAR(64),
    "classification" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_snapshot_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_run_configurations_source_id_idx" ON "project_run_configurations"("source_id");

-- CreateIndex
CREATE INDEX "project_run_configurations_source_id_is_selected_idx" ON "project_run_configurations"("source_id", "is_selected");

-- CreateIndex
CREATE INDEX "repository_snapshots_source_id_idx" ON "repository_snapshots"("source_id");

-- CreateIndex
CREATE INDEX "repository_snapshots_source_id_created_at_idx" ON "repository_snapshots"("source_id", "created_at");

-- CreateIndex
CREATE INDEX "repository_snapshot_files_snapshot_id_idx" ON "repository_snapshot_files"("snapshot_id");

-- CreateIndex
CREATE INDEX "repository_snapshot_files_snapshot_id_content_hash_idx" ON "repository_snapshot_files"("snapshot_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "repository_snapshot_files_snapshot_id_relative_path_key" ON "repository_snapshot_files"("snapshot_id", "relative_path");

-- AddForeignKey
ALTER TABLE "project_run_configurations" ADD CONSTRAINT "project_run_configurations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_snapshots" ADD CONSTRAINT "repository_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_snapshots" ADD CONSTRAINT "repository_snapshots_index_run_id_fkey" FOREIGN KEY ("index_run_id") REFERENCES "repository_index_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_snapshot_files" ADD CONSTRAINT "repository_snapshot_files_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "repository_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
