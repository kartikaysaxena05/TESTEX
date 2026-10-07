-- CreateEnum
CREATE TYPE "DefectClusterStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'RECURRED', 'MERGED', 'SPLIT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DuplicateRelationshipType" AS ENUM ('EXACT_DUPLICATE', 'PROBABLE_DUPLICATE', 'RELATED_FAILURE', 'DISTINCT_FAILURE', 'INCONCLUSIVE', 'INSUFFICIENT_EVIDENCE');

-- CreateEnum
CREATE TYPE "ClusterRelationshipStrength" AS ENUM ('EXACT', 'STRONG', 'MODERATE', 'WEAK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ClusterEventType" AS ENUM ('CREATED', 'MEMBER_ADDED', 'MEMBER_REMOVED', 'REPRESENTATIVE_CHANGED', 'MERGED', 'SPLIT', 'STATUS_CHANGED', 'MANUAL_OVERRIDE', 'REANALYZED');

-- CreateTable
CREATE TABLE "defect_clusters" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "cluster_key" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "cluster_status" "DefectClusterStatus" NOT NULL DEFAULT 'ACTIVE',
    "representative_failure_id" UUID NOT NULL,
    "member_count" INTEGER NOT NULL DEFAULT 1,
    "relationship_strength" "ClusterRelationshipStrength" NOT NULL DEFAULT 'EXACT',
    "classification_summary" VARCHAR(64),
    "probable_layer" VARCHAR(64),
    "root_cause_summary" TEXT,
    "severity_summary" "DefectSeverity",
    "priority_summary" "DefectPriority",
    "affected_requirements" JSONB NOT NULL DEFAULT '[]',
    "affected_routes" JSONB NOT NULL DEFAULT '[]',
    "affected_builds" JSONB NOT NULL DEFAULT '[]',
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cluster_fingerprint" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "merged_into_cluster_id" UUID,
    "split_from_cluster_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_cluster_memberships" (
    "id" UUID NOT NULL,
    "cluster_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "relationship_type" "DuplicateRelationshipType" NOT NULL,
    "relationship_strength" "ClusterRelationshipStrength" NOT NULL,
    "similarity_score" DOUBLE PRECISION NOT NULL,
    "matched_signals" JSONB NOT NULL DEFAULT '[]',
    "contradictory_signals" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL,
    "is_representative" BOOLEAN NOT NULL DEFAULT false,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "manual_override_reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_cluster_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_cluster_histories" (
    "id" UUID NOT NULL,
    "cluster_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "event_type" "ClusterEventType" NOT NULL,
    "failure_case_id" UUID,
    "previous_state" JSONB,
    "new_state" JSONB,
    "reason" TEXT NOT NULL,
    "actor" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_cluster_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "defect_clusters_project_id_idx" ON "defect_clusters"("project_id");

-- CreateIndex
CREATE INDEX "defect_clusters_cluster_status_idx" ON "defect_clusters"("cluster_status");

-- CreateIndex
CREATE INDEX "defect_clusters_representative_failure_id_idx" ON "defect_clusters"("representative_failure_id");

-- CreateIndex
CREATE INDEX "defect_clusters_relationship_strength_idx" ON "defect_clusters"("relationship_strength");

-- CreateIndex
CREATE INDEX "defect_clusters_severity_summary_idx" ON "defect_clusters"("severity_summary");

-- CreateIndex
CREATE INDEX "defect_clusters_priority_summary_idx" ON "defect_clusters"("priority_summary");

-- CreateIndex
CREATE INDEX "defect_clusters_cluster_fingerprint_idx" ON "defect_clusters"("cluster_fingerprint");

-- CreateIndex
CREATE INDEX "defect_clusters_first_seen_at_idx" ON "defect_clusters"("first_seen_at");

-- CreateIndex
CREATE INDEX "defect_clusters_last_seen_at_idx" ON "defect_clusters"("last_seen_at");

-- CreateIndex
CREATE INDEX "defect_clusters_created_at_idx" ON "defect_clusters"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "defect_clusters_project_id_cluster_key_key" ON "defect_clusters"("project_id", "cluster_key");

-- CreateIndex
CREATE INDEX "defect_cluster_memberships_cluster_id_idx" ON "defect_cluster_memberships"("cluster_id");

-- CreateIndex
CREATE INDEX "defect_cluster_memberships_failure_case_id_idx" ON "defect_cluster_memberships"("failure_case_id");

-- CreateIndex
CREATE INDEX "defect_cluster_memberships_project_id_idx" ON "defect_cluster_memberships"("project_id");

-- CreateIndex
CREATE INDEX "defect_cluster_memberships_relationship_type_idx" ON "defect_cluster_memberships"("relationship_type");

-- CreateIndex
CREATE INDEX "defect_cluster_memberships_relationship_strength_idx" ON "defect_cluster_memberships"("relationship_strength");

-- CreateIndex
CREATE INDEX "defect_cluster_memberships_is_active_idx" ON "defect_cluster_memberships"("is_active");

-- CreateIndex
CREATE INDEX "defect_cluster_memberships_is_representative_idx" ON "defect_cluster_memberships"("is_representative");

-- CreateIndex
CREATE INDEX "defect_cluster_memberships_created_at_idx" ON "defect_cluster_memberships"("created_at");

-- CreateIndex
CREATE INDEX "defect_cluster_histories_cluster_id_idx" ON "defect_cluster_histories"("cluster_id");

-- CreateIndex
CREATE INDEX "defect_cluster_histories_project_id_idx" ON "defect_cluster_histories"("project_id");

-- CreateIndex
CREATE INDEX "defect_cluster_histories_event_type_idx" ON "defect_cluster_histories"("event_type");

-- CreateIndex
CREATE INDEX "defect_cluster_histories_failure_case_id_idx" ON "defect_cluster_histories"("failure_case_id");

-- CreateIndex
CREATE INDEX "defect_cluster_histories_created_at_idx" ON "defect_cluster_histories"("created_at");

-- AddForeignKey
ALTER TABLE "defect_clusters" ADD CONSTRAINT "defect_clusters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_clusters" ADD CONSTRAINT "defect_clusters_representative_failure_id_fkey" FOREIGN KEY ("representative_failure_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_clusters" ADD CONSTRAINT "defect_clusters_merged_into_cluster_id_fkey" FOREIGN KEY ("merged_into_cluster_id") REFERENCES "defect_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_clusters" ADD CONSTRAINT "defect_clusters_split_from_cluster_id_fkey" FOREIGN KEY ("split_from_cluster_id") REFERENCES "defect_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_cluster_memberships" ADD CONSTRAINT "defect_cluster_memberships_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "defect_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_cluster_memberships" ADD CONSTRAINT "defect_cluster_memberships_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_cluster_memberships" ADD CONSTRAINT "defect_cluster_memberships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_cluster_histories" ADD CONSTRAINT "defect_cluster_histories_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "defect_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_cluster_histories" ADD CONSTRAINT "defect_cluster_histories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_cluster_histories" ADD CONSTRAINT "defect_cluster_histories_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
