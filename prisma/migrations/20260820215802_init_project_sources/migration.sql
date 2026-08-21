-- CreateEnum
CREATE TYPE "ProjectSourceKind" AS ENUM ('LOCAL_DIRECTORY');

-- CreateTable
CREATE TABLE "project_sources" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "ProjectSourceKind" NOT NULL DEFAULT 'LOCAL_DIRECTORY',
    "display_name" VARCHAR(255) NOT NULL,
    "root_path" VARCHAR(4096) NOT NULL,
    "last_validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_sources_project_id_key" ON "project_sources"("project_id");

-- AddForeignKey
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
