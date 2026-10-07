-- CreateEnum
CREATE TYPE "EvidenceIntegrityStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'MISSING', 'CORRUPT', 'MISMATCH', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "EvidenceCompletenessStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'MINIMAL', 'INSUFFICIENT');

-- AlterTable
ALTER TABLE "failure_cases" ADD COLUMN     "evidence_completeness" "EvidenceCompletenessStatus",
ADD COLUMN     "failure_signature" VARCHAR(128);

-- AlterTable
ALTER TABLE "failure_evidence_references" ADD COLUMN     "integrity_details" TEXT,
ADD COLUMN     "integrity_status" "EvidenceIntegrityStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "last_verified_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "failure_cases_failure_signature_idx" ON "failure_cases"("failure_signature");

-- CreateIndex
CREATE INDEX "failure_evidence_references_integrity_status_idx" ON "failure_evidence_references"("integrity_status");
