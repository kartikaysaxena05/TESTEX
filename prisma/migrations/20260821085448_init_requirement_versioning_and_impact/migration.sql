-- CreateEnum
CREATE TYPE "RequirementChangeKind" AS ENUM ('CREATED', 'BASELINE_CAPTURE', 'TEXT_CHANGED', 'TITLE_CHANGED', 'TYPE_CHANGED', 'PRIORITY_CHANGED', 'STATUS_CHANGED', 'MULTIPLE_FIELDS_CHANGED', 'RESTORED_VERSION');

-- CreateEnum
CREATE TYPE "RequirementImpactType" AS ENUM ('DEPENDENT_REQUIREMENT', 'PARENT_REQUIREMENT', 'CHILD_REQUIREMENT', 'CONSTRAINED_REQUIREMENT', 'RELATED_REQUIREMENT', 'CONFLICT_REVIEW', 'REPOSITORY_EVIDENCE', 'REPOSITORY_FILE', 'REPOSITORY_SYMBOL');

-- CreateEnum
CREATE TYPE "RequirementImpactStatus" AS ENUM ('OPEN', 'REVIEWED', 'NOT_IMPACTED', 'ACTION_REQUIRED');

-- CreateTable
CREATE TABLE "requirement_versions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "requirement_key_snapshot" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "original_text" TEXT NOT NULL,
    "type" "RequirementType" NOT NULL DEFAULT 'UNKNOWN',
    "priority" "RequirementPriority" NOT NULL DEFAULT 'UNSPECIFIED',
    "status" "RequirementStatus" NOT NULL DEFAULT 'DRAFT',
    "source_requirement_text_sha256" VARCHAR(64) NOT NULL,
    "change_kind" "RequirementChangeKind" NOT NULL DEFAULT 'CREATED',
    "change_reason" TEXT,
    "changed_fields" JSONB NOT NULL DEFAULT '[]',
    "created_by_actor_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_change_impacts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "requirement_version_id" UUID NOT NULL,
    "impact_type" "RequirementImpactType" NOT NULL,
    "target_requirement_id" UUID,
    "repository_evidence_id" UUID,
    "project_source_id" UUID,
    "indexed_file_id" UUID,
    "symbol_id" UUID,
    "reason_code" VARCHAR(64) NOT NULL,
    "status" "RequirementImpactStatus" NOT NULL DEFAULT 'OPEN',
    "review_rationale" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "requirement_change_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirement_versions_project_id_idx" ON "requirement_versions"("project_id");

-- CreateIndex
CREATE INDEX "requirement_versions_requirement_id_idx" ON "requirement_versions"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_versions_requirement_id_version_number_idx" ON "requirement_versions"("requirement_id", "version_number");

-- CreateIndex
CREATE INDEX "requirement_versions_change_kind_idx" ON "requirement_versions"("change_kind");

-- CreateIndex
CREATE INDEX "requirement_versions_created_at_idx" ON "requirement_versions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_versions_requirement_id_version_number_key" ON "requirement_versions"("requirement_id", "version_number");

-- CreateIndex
CREATE INDEX "requirement_change_impacts_project_id_idx" ON "requirement_change_impacts"("project_id");

-- CreateIndex
CREATE INDEX "requirement_change_impacts_requirement_id_idx" ON "requirement_change_impacts"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_change_impacts_requirement_version_id_idx" ON "requirement_change_impacts"("requirement_version_id");

-- CreateIndex
CREATE INDEX "requirement_change_impacts_target_requirement_id_idx" ON "requirement_change_impacts"("target_requirement_id");

-- CreateIndex
CREATE INDEX "requirement_change_impacts_status_idx" ON "requirement_change_impacts"("status");

-- CreateIndex
CREATE INDEX "requirement_change_impacts_impact_type_idx" ON "requirement_change_impacts"("impact_type");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_change_impacts_requirement_version_id_impact_ty_key" ON "requirement_change_impacts"("requirement_version_id", "impact_type", "target_requirement_id", "repository_evidence_id");

-- AddForeignKey
ALTER TABLE "requirement_versions" ADD CONSTRAINT "requirement_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_versions" ADD CONSTRAINT "requirement_versions_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_change_impacts" ADD CONSTRAINT "requirement_change_impacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_change_impacts" ADD CONSTRAINT "requirement_change_impacts_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_change_impacts" ADD CONSTRAINT "requirement_change_impacts_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "requirement_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_change_impacts" ADD CONSTRAINT "requirement_change_impacts_target_requirement_id_fkey" FOREIGN KEY ("target_requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_change_impacts" ADD CONSTRAINT "requirement_change_impacts_repository_evidence_id_fkey" FOREIGN KEY ("repository_evidence_id") REFERENCES "requirement_repository_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
