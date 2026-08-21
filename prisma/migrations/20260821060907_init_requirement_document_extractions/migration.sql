-- CreateTable
CREATE TABLE "requirement_document_extractions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_document_id" UUID NOT NULL,
    "source_sha256" VARCHAR(64) NOT NULL,
    "extractor_version" VARCHAR(32) NOT NULL,
    "format" VARCHAR(16) NOT NULL,
    "plain_text" TEXT NOT NULL,
    "character_count" INTEGER NOT NULL,
    "line_count" INTEGER NOT NULL,
    "page_count" INTEGER,
    "block_count" INTEGER NOT NULL,
    "heading_count" INTEGER NOT NULL,
    "section_count" INTEGER NOT NULL,
    "table_count" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "pages" JSONB NOT NULL DEFAULT '[]',
    "headings" JSONB NOT NULL DEFAULT '[]',
    "sections" JSONB NOT NULL DEFAULT '[]',
    "tables" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_document_extractions_requirement_document_id_key" ON "requirement_document_extractions"("requirement_document_id");

-- CreateIndex
CREATE INDEX "requirement_document_extractions_project_id_idx" ON "requirement_document_extractions"("project_id");

-- CreateIndex
CREATE INDEX "requirement_document_extractions_requirement_document_id_idx" ON "requirement_document_extractions"("requirement_document_id");

-- AddForeignKey
ALTER TABLE "requirement_document_extractions" ADD CONSTRAINT "requirement_document_extractions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_document_extractions" ADD CONSTRAINT "requirement_document_extractions_requirement_document_id_fkey" FOREIGN KEY ("requirement_document_id") REFERENCES "requirement_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
