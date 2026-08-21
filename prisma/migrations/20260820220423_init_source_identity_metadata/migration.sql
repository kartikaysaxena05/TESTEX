-- AlterTable
ALTER TABLE "project_sources" ADD COLUMN     "filesystem_created_at" TIMESTAMP(3),
ADD COLUMN     "filesystem_modified_at" TIMESTAMP(3),
ADD COLUMN     "identity_fingerprint" VARCHAR(64),
ADD COLUMN     "metadata_refreshed_at" TIMESTAMP(3);
