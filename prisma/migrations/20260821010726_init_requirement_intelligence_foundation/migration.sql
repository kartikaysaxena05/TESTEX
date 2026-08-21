-- CreateEnum
CREATE TYPE "RequirementSourceType" AS ENUM ('MANUAL', 'PASTED_TEXT', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "RequirementSourceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('FUNCTIONAL', 'NON_FUNCTIONAL', 'BUSINESS_RULE', 'SECURITY', 'PERFORMANCE', 'USABILITY', 'DATA', 'INTEGRATION', 'CONSTRAINT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RequirementPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "requirement_sources" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "source_type" "RequirementSourceType" NOT NULL DEFAULT 'MANUAL',
    "status" "RequirementSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_source_id" UUID,
    "requirement_key" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "original_text" TEXT NOT NULL,
    "type" "RequirementType" NOT NULL DEFAULT 'UNKNOWN',
    "priority" "RequirementPriority" NOT NULL DEFAULT 'UNSPECIFIED',
    "status" "RequirementStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirement_sources_project_id_idx" ON "requirement_sources"("project_id");

-- CreateIndex
CREATE INDEX "requirement_sources_project_id_status_idx" ON "requirement_sources"("project_id", "status");

-- CreateIndex
CREATE INDEX "requirements_project_id_idx" ON "requirements"("project_id");

-- CreateIndex
CREATE INDEX "requirements_project_id_status_idx" ON "requirements"("project_id", "status");

-- CreateIndex
CREATE INDEX "requirements_project_id_type_idx" ON "requirements"("project_id", "type");

-- CreateIndex
CREATE INDEX "requirements_requirement_source_id_idx" ON "requirements"("requirement_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirements_project_id_requirement_key_key" ON "requirements"("project_id", "requirement_key");

-- AddForeignKey
ALTER TABLE "requirement_sources" ADD CONSTRAINT "requirement_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_requirement_source_id_fkey" FOREIGN KEY ("requirement_source_id") REFERENCES "requirement_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
