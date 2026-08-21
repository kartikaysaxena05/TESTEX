-- CreateEnum
CREATE TYPE "CandidateReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IMPORTED');

-- CreateTable
CREATE TABLE "requirement_candidates" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_document_id" UUID NOT NULL,
    "extraction_id" UUID NOT NULL,
    "source_block_id" VARCHAR(64),
    "source_table_id" VARCHAR(64),
    "source_row_index" INTEGER,
    "source_text" TEXT NOT NULL,
    "reviewed_text" TEXT,
    "external_key" VARCHAR(64),
    "section_id" VARCHAR(64),
    "section_path" VARCHAR(512),
    "page_number" INTEGER,
    "line_start" INTEGER,
    "line_end" INTEGER,
    "start_offset" INTEGER,
    "end_offset" INTEGER,
    "detection_method" VARCHAR(64) NOT NULL DEFAULT 'RULE_BASED',
    "detection_reasons" JSONB NOT NULL DEFAULT '[]',
    "detection_score" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "review_status" "CandidateReviewStatus" NOT NULL DEFAULT 'PENDING',
    "imported_requirement_id" UUID,
    "detector_version" VARCHAR(32) NOT NULL DEFAULT 'requirement-detector-v1',
    "source_sha256" VARCHAR(64) NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirement_candidates_project_id_idx" ON "requirement_candidates"("project_id");

-- CreateIndex
CREATE INDEX "requirement_candidates_requirement_document_id_idx" ON "requirement_candidates"("requirement_document_id");

-- CreateIndex
CREATE INDEX "requirement_candidates_extraction_id_idx" ON "requirement_candidates"("extraction_id");

-- CreateIndex
CREATE INDEX "requirement_candidates_project_id_review_status_idx" ON "requirement_candidates"("project_id", "review_status");

-- CreateIndex
CREATE INDEX "requirement_candidates_imported_requirement_id_idx" ON "requirement_candidates"("imported_requirement_id");

-- AddForeignKey
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_requirement_document_id_fkey" FOREIGN KEY ("requirement_document_id") REFERENCES "requirement_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "requirement_document_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_imported_requirement_id_fkey" FOREIGN KEY ("imported_requirement_id") REFERENCES "requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
