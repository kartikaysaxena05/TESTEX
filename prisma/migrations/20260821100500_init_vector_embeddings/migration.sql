-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "VectorSubjectType" AS ENUM ('REQUIREMENT', 'REQUIREMENT_VERSION', 'DOCUMENT_SECTION', 'REPOSITORY_ENTITY');

-- CreateEnum
CREATE TYPE "VectorEmbeddingStatus" AS ENUM ('CURRENT', 'STALE', 'INVALIDATED');

-- CreateTable
CREATE TABLE "vector_embeddings" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "subject_type" "VectorSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "source_version_id" UUID,
    "provider_id" VARCHAR(64) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "canonicalization_version" INTEGER NOT NULL,
    "input_sha256" VARCHAR(64) NOT NULL,
    "vector" vector(1536),
    "status" "VectorEmbeddingStatus" NOT NULL DEFAULT 'CURRENT',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stale_at" TIMESTAMPTZ(6),

    CONSTRAINT "vector_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "vector_embeddings_project_id_status_idx" ON "vector_embeddings"("project_id", "status");
CREATE INDEX "vector_embeddings_project_id_subject_type_subject_id_idx" ON "vector_embeddings"("project_id", "subject_type", "subject_id");
CREATE INDEX "vector_embeddings_project_id_subject_type_status_idx" ON "vector_embeddings"("project_id", "subject_type", "status");
CREATE INDEX "vector_embeddings_project_id_input_sha256_idx" ON "vector_embeddings"("project_id", "input_sha256");

-- Create HNSW Vector Index for Cosine Similarity
CREATE INDEX "vector_embeddings_vector_cosine_idx" ON "vector_embeddings" USING hnsw ("vector" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "vector_embeddings" ADD CONSTRAINT "vector_embeddings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
