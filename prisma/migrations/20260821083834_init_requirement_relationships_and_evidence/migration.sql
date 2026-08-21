-- CreateEnum
CREATE TYPE "RequirementRelationshipType" AS ENUM ('DEPENDS_ON', 'REQUIRED_BY', 'REFINES', 'REFINED_BY', 'PARENT_OF', 'CHILD_OF', 'CONSTRAINS', 'CONSTRAINED_BY', 'RELATED_TO', 'CONFLICTS_WITH', 'DUPLICATES', 'OVERLAPS_WITH');

-- CreateEnum
CREATE TYPE "RelationshipDetectionMethod" AS ENUM ('EXPLICIT_REFERENCE', 'SOURCE_HIERARCHY', 'DETERMINISTIC_RULE', 'MANUAL', 'DETERMINISTIC_REVIEWED');

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RepositoryEvidenceType" AS ENUM ('FILE', 'SYMBOL', 'ROUTE', 'API_ENDPOINT', 'COMPONENT', 'SERVICE', 'DATABASE_MODEL', 'CONFIGURATION', 'TEST_FILE', 'ENTRY_POINT', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceMatchMethod" AS ENUM ('EXACT_SYMBOL', 'EXACT_FILE_TOKEN', 'ROUTE_TOKEN_MATCH', 'DOMAIN_MATCH', 'ACTION_OBJECT_MATCH', 'TECHNICAL_IDENTIFIER', 'MANUAL', 'DETERMINISTIC_REVIEWED');

-- CreateEnum
CREATE TYPE "RepositoryEvidenceStatus" AS ENUM ('CANDIDATE', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "requirement_relationships" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_requirement_id" UUID NOT NULL,
    "target_requirement_id" UUID NOT NULL,
    "relationship_type" "RequirementRelationshipType" NOT NULL,
    "detection_method" "RelationshipDetectionMethod" NOT NULL DEFAULT 'DETERMINISTIC_RULE',
    "status" "RelationshipStatus" NOT NULL DEFAULT 'PROPOSED',
    "reason_codes" JSONB NOT NULL DEFAULT '[]',
    "evidence" TEXT,
    "source_requirement_text_sha256" VARCHAR(64) NOT NULL,
    "target_requirement_text_sha256" VARCHAR(64) NOT NULL,
    "analyzer_version" VARCHAR(64) NOT NULL DEFAULT 'requirement-relationship-analyzer-v1',
    "review_rationale" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_repository_evidence" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "project_source_id" UUID NOT NULL,
    "repository_snapshot_id" UUID,
    "indexed_file_id" UUID,
    "symbol_id" UUID,
    "evidence_type" "RepositoryEvidenceType" NOT NULL,
    "file_path" VARCHAR(1024) NOT NULL,
    "symbol_name" VARCHAR(255),
    "line_start" INTEGER,
    "line_end" INTEGER,
    "file_content_hash" VARCHAR(64),
    "evidence_score" INTEGER NOT NULL DEFAULT 0,
    "reason_codes" JSONB NOT NULL DEFAULT '[]',
    "match_method" "EvidenceMatchMethod" NOT NULL DEFAULT 'EXACT_FILE_TOKEN',
    "status" "RepositoryEvidenceStatus" NOT NULL DEFAULT 'CANDIDATE',
    "source_requirement_text_sha256" VARCHAR(64) NOT NULL,
    "matcher_version" VARCHAR(64) NOT NULL DEFAULT 'requirement-repository-matcher-v1',
    "review_rationale" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_repository_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirement_relationships_project_id_idx" ON "requirement_relationships"("project_id");

-- CreateIndex
CREATE INDEX "requirement_relationships_source_requirement_id_idx" ON "requirement_relationships"("source_requirement_id");

-- CreateIndex
CREATE INDEX "requirement_relationships_target_requirement_id_idx" ON "requirement_relationships"("target_requirement_id");

-- CreateIndex
CREATE INDEX "requirement_relationships_relationship_type_idx" ON "requirement_relationships"("relationship_type");

-- CreateIndex
CREATE INDEX "requirement_relationships_status_idx" ON "requirement_relationships"("status");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_relationships_source_requirement_id_target_requ_key" ON "requirement_relationships"("source_requirement_id", "target_requirement_id", "relationship_type");

-- CreateIndex
CREATE INDEX "requirement_repository_evidence_project_id_idx" ON "requirement_repository_evidence"("project_id");

-- CreateIndex
CREATE INDEX "requirement_repository_evidence_requirement_id_idx" ON "requirement_repository_evidence"("requirement_id");

-- CreateIndex
CREATE INDEX "requirement_repository_evidence_project_source_id_idx" ON "requirement_repository_evidence"("project_source_id");

-- CreateIndex
CREATE INDEX "requirement_repository_evidence_repository_snapshot_id_idx" ON "requirement_repository_evidence"("repository_snapshot_id");

-- CreateIndex
CREATE INDEX "requirement_repository_evidence_indexed_file_id_idx" ON "requirement_repository_evidence"("indexed_file_id");

-- CreateIndex
CREATE INDEX "requirement_repository_evidence_status_idx" ON "requirement_repository_evidence"("status");

-- CreateIndex
CREATE INDEX "requirement_repository_evidence_evidence_type_idx" ON "requirement_repository_evidence"("evidence_type");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_repository_evidence_requirement_id_project_sour_key" ON "requirement_repository_evidence"("requirement_id", "project_source_id", "file_path", "evidence_type", "symbol_name");

-- AddForeignKey
ALTER TABLE "requirement_relationships" ADD CONSTRAINT "requirement_relationships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_relationships" ADD CONSTRAINT "requirement_relationships_source_requirement_id_fkey" FOREIGN KEY ("source_requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_relationships" ADD CONSTRAINT "requirement_relationships_target_requirement_id_fkey" FOREIGN KEY ("target_requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_repository_evidence" ADD CONSTRAINT "requirement_repository_evidence_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_repository_evidence" ADD CONSTRAINT "requirement_repository_evidence_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_repository_evidence" ADD CONSTRAINT "requirement_repository_evidence_project_source_id_fkey" FOREIGN KEY ("project_source_id") REFERENCES "project_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_repository_evidence" ADD CONSTRAINT "requirement_repository_evidence_repository_snapshot_id_fkey" FOREIGN KEY ("repository_snapshot_id") REFERENCES "repository_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_repository_evidence" ADD CONSTRAINT "requirement_repository_evidence_indexed_file_id_fkey" FOREIGN KEY ("indexed_file_id") REFERENCES "repository_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_repository_evidence" ADD CONSTRAINT "requirement_repository_evidence_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "repository_symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
