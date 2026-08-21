-- CreateTable
CREATE TABLE "requirement_documents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_source_id" UUID NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "file_extension" VARCHAR(16) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_documents_requirement_source_id_key" ON "requirement_documents"("requirement_source_id");

-- CreateIndex
CREATE INDEX "requirement_documents_project_id_idx" ON "requirement_documents"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_documents_project_id_sha256_key" ON "requirement_documents"("project_id", "sha256");

-- AddForeignKey
ALTER TABLE "requirement_documents" ADD CONSTRAINT "requirement_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_documents" ADD CONSTRAINT "requirement_documents_requirement_source_id_fkey" FOREIGN KEY ("requirement_source_id") REFERENCES "requirement_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
