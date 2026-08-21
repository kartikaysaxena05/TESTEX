-- CreateEnum
CREATE TYPE "IndexStatus" AS ENUM ('INDEXED', 'SKIPPED', 'ERROR', 'STALE');

-- CreateEnum
CREATE TYPE "IndexRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SymbolKind" AS ENUM ('FUNCTION', 'CLASS', 'INTERFACE', 'TYPE', 'ENUM', 'VARIABLE', 'CONSTANT', 'METHOD', 'MODULE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('LOCAL', 'EXTERNAL', 'DYNAMIC', 'UNKNOWN');

-- CreateTable
CREATE TABLE "repository_index_runs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "status" "IndexRunStatus" NOT NULL DEFAULT 'RUNNING',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "parser_version" INTEGER NOT NULL DEFAULT 1,
    "files_eligible" INTEGER NOT NULL DEFAULT 0,
    "files_indexed" INTEGER NOT NULL DEFAULT 0,
    "files_skipped" INTEGER NOT NULL DEFAULT 0,
    "files_failed" INTEGER NOT NULL DEFAULT 0,
    "symbols_indexed" INTEGER NOT NULL DEFAULT 0,
    "imports_indexed" INTEGER NOT NULL DEFAULT 0,
    "exports_indexed" INTEGER NOT NULL DEFAULT 0,
    "unsupported_language_files" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "repository_index_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_files" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "relative_path" VARCHAR(1024) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "extension" VARCHAR(64),
    "language" VARCHAR(64),
    "classification" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "content_hash" VARCHAR(64),
    "index_status" "IndexStatus" NOT NULL DEFAULT 'INDEXED',
    "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_symbols" (
    "id" UUID NOT NULL,
    "repository_file_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "kind" "SymbolKind" NOT NULL DEFAULT 'UNKNOWN',
    "start_line" INTEGER NOT NULL,
    "end_line" INTEGER NOT NULL,
    "is_exported" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_imports" (
    "id" UUID NOT NULL,
    "repository_file_id" UUID NOT NULL,
    "specifier" VARCHAR(1024) NOT NULL,
    "import_kind" "ImportKind" NOT NULL DEFAULT 'LOCAL',
    "resolved_relative_path" VARCHAR(1024),
    "is_external" BOOLEAN NOT NULL DEFAULT false,
    "line_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repository_index_runs_source_id_idx" ON "repository_index_runs"("source_id");

-- CreateIndex
CREATE INDEX "repository_index_runs_source_id_status_idx" ON "repository_index_runs"("source_id", "status");

-- CreateIndex
CREATE INDEX "repository_files_source_id_idx" ON "repository_files"("source_id");

-- CreateIndex
CREATE INDEX "repository_files_source_id_language_idx" ON "repository_files"("source_id", "language");

-- CreateIndex
CREATE INDEX "repository_files_source_id_classification_idx" ON "repository_files"("source_id", "classification");

-- CreateIndex
CREATE INDEX "repository_files_source_id_index_status_idx" ON "repository_files"("source_id", "index_status");

-- CreateIndex
CREATE UNIQUE INDEX "repository_files_source_id_relative_path_key" ON "repository_files"("source_id", "relative_path");

-- CreateIndex
CREATE INDEX "repository_symbols_repository_file_id_idx" ON "repository_symbols"("repository_file_id");

-- CreateIndex
CREATE INDEX "repository_symbols_name_idx" ON "repository_symbols"("name");

-- CreateIndex
CREATE INDEX "repository_symbols_repository_file_id_kind_idx" ON "repository_symbols"("repository_file_id", "kind");

-- CreateIndex
CREATE INDEX "repository_imports_repository_file_id_idx" ON "repository_imports"("repository_file_id");

-- CreateIndex
CREATE INDEX "repository_imports_repository_file_id_is_external_idx" ON "repository_imports"("repository_file_id", "is_external");

-- CreateIndex
CREATE INDEX "repository_imports_resolved_relative_path_idx" ON "repository_imports"("resolved_relative_path");

-- AddForeignKey
ALTER TABLE "repository_index_runs" ADD CONSTRAINT "repository_index_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_files" ADD CONSTRAINT "repository_files_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_symbols" ADD CONSTRAINT "repository_symbols_repository_file_id_fkey" FOREIGN KEY ("repository_file_id") REFERENCES "repository_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_imports" ADD CONSTRAINT "repository_imports_repository_file_id_fkey" FOREIGN KEY ("repository_file_id") REFERENCES "repository_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
