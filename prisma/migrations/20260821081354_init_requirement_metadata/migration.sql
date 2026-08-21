-- CreateEnum
CREATE TYPE "RequirementCategory" AS ENUM ('FUNCTIONAL', 'NON_FUNCTIONAL', 'BUSINESS_RULE', 'INTERFACE', 'DATA', 'COMPLIANCE', 'CONSTRAINT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RequirementSubCategory" AS ENUM ('PERFORMANCE', 'SECURITY', 'USABILITY', 'RELIABILITY', 'AVAILABILITY', 'SCALABILITY', 'MAINTAINABILITY', 'ACCESSIBILITY', 'COMPATIBILITY', 'PORTABILITY', 'OBSERVABILITY', 'RECOVERABILITY', 'RETENTION', 'INTEGRATION', 'TECHNICAL_CONSTRAINT', 'BUSINESS_LOGIC');

-- CreateEnum
CREATE TYPE "RequirementRiskLevel" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "RequirementCriticality" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "ClassificationMethod" AS ENUM ('DETERMINISTIC', 'MANUAL', 'DETERMINISTIC_REVIEWED');

-- CreateEnum
CREATE TYPE "ClassificationReviewStatus" AS ENUM ('GENERATED', 'REVIEWED');

-- CreateTable
CREATE TABLE "requirement_metadata" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "category" "RequirementCategory" NOT NULL DEFAULT 'UNKNOWN',
    "sub_category" "RequirementSubCategory",
    "domain" VARCHAR(100),
    "module" VARCHAR(100),
    "business_capability" VARCHAR(255),
    "actors" JSONB NOT NULL DEFAULT '[]',
    "security_relevant" BOOLEAN NOT NULL DEFAULT false,
    "performance_relevant" BOOLEAN NOT NULL DEFAULT false,
    "compliance_relevant" BOOLEAN NOT NULL DEFAULT false,
    "compliance_standards" JSONB NOT NULL DEFAULT '[]',
    "priority" "RequirementPriority" NOT NULL DEFAULT 'UNSPECIFIED',
    "risk_level" "RequirementRiskLevel" NOT NULL DEFAULT 'UNSPECIFIED',
    "criticality" "RequirementCriticality" NOT NULL DEFAULT 'UNSPECIFIED',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "classification_method" "ClassificationMethod" NOT NULL DEFAULT 'DETERMINISTIC',
    "classifier_version" VARCHAR(64) NOT NULL DEFAULT 'requirement-classifier-v1',
    "review_status" "ClassificationReviewStatus" NOT NULL DEFAULT 'GENERATED',
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "source_requirement_text_sha256" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_metadata_requirement_id_key" ON "requirement_metadata"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_metadata_project_id_idx" ON "requirement_metadata"("project_id");

-- CreateIndex
CREATE INDEX "requirement_metadata_requirement_id_idx" ON "requirement_metadata"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_metadata_category_idx" ON "requirement_metadata"("category");

-- CreateIndex
CREATE INDEX "requirement_metadata_priority_idx" ON "requirement_metadata"("priority");

-- CreateIndex
CREATE INDEX "requirement_metadata_risk_level_idx" ON "requirement_metadata"("risk_level");

-- AddForeignKey
ALTER TABLE "requirement_metadata" ADD CONSTRAINT "requirement_metadata_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_metadata" ADD CONSTRAINT "requirement_metadata_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
