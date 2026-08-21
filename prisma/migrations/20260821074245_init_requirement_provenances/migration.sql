-- CreateEnum
CREATE TYPE "ProvenanceSourceKind" AS ENUM ('MANUAL', 'PASTED_TEXT', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "ProvenanceLocationKind" AS ENUM ('NONE', 'PASTE_LINE', 'DOCUMENT_BLOCK', 'TABLE_ROW', 'PDF_PAGE');

-- CreateEnum
CREATE TYPE "ProvenanceCompleteness" AS ENUM ('COMPLETE', 'PARTIAL', 'MINIMAL');

-- CreateEnum
CREATE TYPE "SourceIntegrityStatus" AS ENUM ('VERIFIED', 'MISSING_FILE', 'HASH_MISMATCH', 'PARTIAL', 'SOURCE_RECORD_MISSING');

-- CreateTable
CREATE TABLE "requirement_provenances" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "requirement_source_id" UUID NOT NULL,
    "source_kind" "ProvenanceSourceKind" NOT NULL,
    "location_kind" "ProvenanceLocationKind" NOT NULL DEFAULT 'NONE',
    "candidate_id" UUID,
    "document_id" UUID,
    "extraction_id" UUID,
    "source_block_id" VARCHAR(64),
    "source_table_id" VARCHAR(64),
    "source_row_index" INTEGER,
    "section_id" VARCHAR(64),
    "section_path" VARCHAR(512),
    "page_number" INTEGER,
    "line_start" INTEGER,
    "line_end" INTEGER,
    "start_offset" INTEGER,
    "end_offset" INTEGER,
    "source_text" TEXT,
    "reviewed_text" TEXT,
    "external_requirement_key" VARCHAR(64),
    "source_sha256" VARCHAR(64),
    "extractor_version" VARCHAR(32),
    "detector_version" VARCHAR(32),
    "detection_reasons" JSONB NOT NULL DEFAULT '[]',
    "detection_score" INTEGER,
    "completeness" "ProvenanceCompleteness" NOT NULL DEFAULT 'MINIMAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_provenances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_provenances_requirement_id_key" ON "requirement_provenances"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_provenances_project_id_idx" ON "requirement_provenances"("project_id");

-- CreateIndex
CREATE INDEX "requirement_provenances_requirement_id_idx" ON "requirement_provenances"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_provenances_requirement_source_id_idx" ON "requirement_provenances"("requirement_source_id");

-- CreateIndex
CREATE INDEX "requirement_provenances_document_id_idx" ON "requirement_provenances"("document_id");

-- CreateIndex
CREATE INDEX "requirement_provenances_candidate_id_idx" ON "requirement_provenances"("candidate_id");

-- AddForeignKey
ALTER TABLE "requirement_provenances" ADD CONSTRAINT "requirement_provenances_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_provenances" ADD CONSTRAINT "requirement_provenances_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_provenances" ADD CONSTRAINT "requirement_provenances_requirement_source_id_fkey" FOREIGN KEY ("requirement_source_id") REFERENCES "requirement_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_provenances" ADD CONSTRAINT "requirement_provenances_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "requirement_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_provenances" ADD CONSTRAINT "requirement_provenances_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "requirement_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_provenances" ADD CONSTRAINT "requirement_provenances_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "requirement_document_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
