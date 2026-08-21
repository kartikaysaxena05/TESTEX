-- CreateEnum
CREATE TYPE "RequirementModality" AS ENUM ('SHALL', 'MUST', 'SHALL_NOT', 'MUST_NOT', 'SHOULD', 'MAY', 'REQUIRED_TO', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "NormalizationStatus" AS ENUM ('NOT_NORMALIZED', 'NORMALIZED', 'REVIEWED', 'STALE');

-- CreateEnum
CREATE TYPE "NormalizationMethod" AS ENUM ('DETERMINISTIC', 'MANUAL', 'DETERMINISTIC_REVIEWED');

-- CreateEnum
CREATE TYPE "RepresentationReviewStatus" AS ENUM ('GENERATED', 'REVIEWED');

-- CreateTable
CREATE TABLE "requirement_representations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "normalized_text" TEXT NOT NULL,
    "actor" VARCHAR(255),
    "modality" "RequirementModality" NOT NULL DEFAULT 'UNSPECIFIED',
    "negated" BOOLEAN NOT NULL DEFAULT false,
    "action" VARCHAR(255),
    "object" TEXT,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "constraints" JSONB NOT NULL DEFAULT '[]',
    "quantitative_values" JSONB NOT NULL DEFAULT '[]',
    "expected_outcome" TEXT,
    "source_requirement_text_sha256" VARCHAR(64) NOT NULL,
    "normalization_status" "NormalizationStatus" NOT NULL DEFAULT 'NORMALIZED',
    "normalization_method" "NormalizationMethod" NOT NULL DEFAULT 'DETERMINISTIC',
    "normalizer_version" VARCHAR(32) NOT NULL DEFAULT 'requirement-normalizer-v1',
    "review_status" "RepresentationReviewStatus" NOT NULL DEFAULT 'GENERATED',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_representations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_representations_requirement_id_key" ON "requirement_representations"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_representations_project_id_idx" ON "requirement_representations"("project_id");

-- CreateIndex
CREATE INDEX "requirement_representations_requirement_id_idx" ON "requirement_representations"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_representations_normalization_status_idx" ON "requirement_representations"("normalization_status");

-- AddForeignKey
ALTER TABLE "requirement_representations" ADD CONSTRAINT "requirement_representations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_representations" ADD CONSTRAINT "requirement_representations_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
