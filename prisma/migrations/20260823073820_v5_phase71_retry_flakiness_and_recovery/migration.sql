-- AlterTable
ALTER TABLE "test_case_executions" ADD COLUMN     "passed_after_retry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reliability_status" VARCHAR(32) NOT NULL DEFAULT 'NOT_EVALUATED',
ADD COLUMN     "retry_eligibility_json" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "retry_reason" VARCHAR(128);

-- AlterTable
ALTER TABLE "test_runs" ADD COLUMN     "passed_after_retry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reliability_status" VARCHAR(32) NOT NULL DEFAULT 'NOT_EVALUATED',
ADD COLUMN     "total_attempts" INTEGER NOT NULL DEFAULT 1;
