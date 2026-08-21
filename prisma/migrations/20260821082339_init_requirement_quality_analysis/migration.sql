-- CreateEnum
CREATE TYPE "RequirementTestabilityStatus" AS ENUM ('TESTABLE', 'PARTIALLY_TESTABLE', 'NOT_TESTABLE', 'UNDETERMINED');

-- CreateEnum
CREATE TYPE "QualityAnalysisMethod" AS ENUM ('DETERMINISTIC', 'DETERMINISTIC_REVIEWED', 'MANUAL');

-- CreateEnum
CREATE TYPE "QualityFindingSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "QualityFindingReviewStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "QualityFindingCategory" AS ENUM ('AMBIGUITY', 'COMPLETENESS', 'TESTABILITY', 'SPECIFICITY', 'MEASURABILITY', 'CONSISTENCY', 'ATOMICITY');

-- CreateTable
CREATE TABLE "requirement_quality_analyses" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "source_requirement_text_sha256" VARCHAR(64) NOT NULL,
    "analyzer_version" VARCHAR(64) NOT NULL DEFAULT 'requirement-quality-analyzer-v1',
    "testability_status" "RequirementTestabilityStatus" NOT NULL,
    "quality_score" INTEGER,
    "analysis_method" "QualityAnalysisMethod" NOT NULL DEFAULT 'DETERMINISTIC',
    "findings_count" INTEGER NOT NULL DEFAULT 0,
    "open_findings_count" INTEGER NOT NULL DEFAULT 0,
    "clarification_questions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_quality_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_quality_findings" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "category" "QualityFindingCategory" NOT NULL,
    "severity" "QualityFindingSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "evidence_text" TEXT,
    "start_offset" INTEGER,
    "end_offset" INTEGER,
    "suggested_clarification" TEXT,
    "review_status" "QualityFindingReviewStatus" NOT NULL DEFAULT 'OPEN',
    "review_rationale" TEXT,
    "clarification_response" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_quality_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_quality_analyses_requirement_id_key" ON "requirement_quality_analyses"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_quality_analyses_project_id_idx" ON "requirement_quality_analyses"("project_id");

-- CreateIndex
CREATE INDEX "requirement_quality_analyses_requirement_id_idx" ON "requirement_quality_analyses"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_quality_analyses_testability_status_idx" ON "requirement_quality_analyses"("testability_status");

-- CreateIndex
CREATE INDEX "requirement_quality_findings_analysis_id_idx" ON "requirement_quality_findings"("analysis_id");

-- CreateIndex
CREATE INDEX "requirement_quality_findings_project_id_idx" ON "requirement_quality_findings"("project_id");

-- CreateIndex
CREATE INDEX "requirement_quality_findings_requirement_id_idx" ON "requirement_quality_findings"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_quality_findings_code_idx" ON "requirement_quality_findings"("code");

-- CreateIndex
CREATE INDEX "requirement_quality_findings_review_status_idx" ON "requirement_quality_findings"("review_status");

-- CreateIndex
CREATE INDEX "requirement_quality_findings_severity_idx" ON "requirement_quality_findings"("severity");

-- AddForeignKey
ALTER TABLE "requirement_quality_analyses" ADD CONSTRAINT "requirement_quality_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_quality_analyses" ADD CONSTRAINT "requirement_quality_analyses_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_quality_findings" ADD CONSTRAINT "requirement_quality_findings_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "requirement_quality_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_quality_findings" ADD CONSTRAINT "requirement_quality_findings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_quality_findings" ADD CONSTRAINT "requirement_quality_findings_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
