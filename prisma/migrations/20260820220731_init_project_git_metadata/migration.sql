-- CreateEnum
CREATE TYPE "GitSourceRelation" AS ENUM ('ROOT', 'NESTED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "project_git_metadata" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "is_git_repository" BOOLEAN NOT NULL,
    "repository_root" VARCHAR(4096),
    "source_relation_to_repository" "GitSourceRelation" NOT NULL DEFAULT 'UNKNOWN',
    "current_branch" VARCHAR(255),
    "head_commit" VARCHAR(64),
    "is_detached_head" BOOLEAN NOT NULL DEFAULT false,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_git_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_git_metadata_source_id_key" ON "project_git_metadata"("source_id");

-- AddForeignKey
ALTER TABLE "project_git_metadata" ADD CONSTRAINT "project_git_metadata_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
