-- CreateEnum
CREATE TYPE "ReleaseReadinessVerdict" AS ENUM ('READY', 'READY_WITH_RISK', 'NOT_READY', 'BLOCKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "QaReportStatus" AS ENUM ('DRAFT', 'FINAL', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "QaReportAuditAction" AS ENUM ('REPORT_GENERATED', 'REPORT_FINALIZED', 'REPORT_SUPERSEDED', 'POLICY_EVALUATED', 'EXPORT_GENERATED');

-- CreateTable
CREATE TABLE "final_qa_reports" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "environment_id" UUID,
    "report_key" VARCHAR(64) NOT NULL,
    "release_identifier" VARCHAR(128) NOT NULL,
    "build_identifier" VARCHAR(128),
    "commit_sha" VARCHAR(64),
    "branch" VARCHAR(128),
    "environment_name" VARCHAR(80),
    "report_version" INTEGER NOT NULL DEFAULT 1,
    "status" "QaReportStatus" NOT NULL DEFAULT 'DRAFT',
    "verdict" "ReleaseReadinessVerdict" NOT NULL DEFAULT 'UNKNOWN',
    "policy_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "policy_rules_evaluated" JSONB NOT NULL DEFAULT '[]',
    "policy_rules_passed" JSONB NOT NULL DEFAULT '[]',
    "policy_rules_failed" JSONB NOT NULL DEFAULT '[]',
    "blocking_rules" JSONB NOT NULL DEFAULT '[]',
    "warning_rules" JSONB NOT NULL DEFAULT '[]',
    "readiness_score" DOUBLE PRECISION,
    "readiness_explanation" TEXT NOT NULL,
    "executive_summary" TEXT NOT NULL,
    "overall_recommendation" TEXT NOT NULL,
    "requirement_summary_json" JSONB NOT NULL DEFAULT '{}',
    "test_execution_summary_json" JSONB NOT NULL DEFAULT '{}',
    "failure_domain_summary_json" JSONB NOT NULL DEFAULT '{}',
    "defect_summary_json" JSONB NOT NULL DEFAULT '{}',
    "reverification_summary_json" JSONB NOT NULL DEFAULT '{}',
    "regression_summary_json" JSONB NOT NULL DEFAULT '{}',
    "flakiness_summary_json" JSONB NOT NULL DEFAULT '{}',
    "automation_health_json" JSONB NOT NULL DEFAULT '{}',
    "environment_health_json" JSONB NOT NULL DEFAULT '{}',
    "test_data_health_json" JSONB NOT NULL DEFAULT '{}',
    "security_findings_json" JSONB NOT NULL DEFAULT '[]',
    "release_blockers_json" JSONB NOT NULL DEFAULT '[]',
    "residual_risks_json" JSONB NOT NULL DEFAULT '[]',
    "known_limitations_json" JSONB NOT NULL DEFAULT '[]',
    "traceability_matrix_json" JSONB NOT NULL DEFAULT '[]',
    "evidence_references_json" JSONB NOT NULL DEFAULT '[]',
    "source_snapshot_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ(6),
    "generated_by_actor_id" VARCHAR(128) NOT NULL DEFAULT 'SYSTEM',
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "stale_reason" TEXT,
    "checksum_sha256" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "final_qa_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_report_audit_events" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "action" "QaReportAuditAction" NOT NULL,
    "actor_id" VARCHAR(128) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qa_report_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "final_qa_reports_project_id_idx" ON "final_qa_reports"("project_id");

-- CreateIndex
CREATE INDEX "final_qa_reports_environment_id_idx" ON "final_qa_reports"("environment_id");

-- CreateIndex
CREATE INDEX "final_qa_reports_release_identifier_idx" ON "final_qa_reports"("release_identifier");

-- CreateIndex
CREATE INDEX "final_qa_reports_status_idx" ON "final_qa_reports"("status");

-- CreateIndex
CREATE INDEX "final_qa_reports_verdict_idx" ON "final_qa_reports"("verdict");

-- CreateIndex
CREATE INDEX "final_qa_reports_created_at_idx" ON "final_qa_reports"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "final_qa_reports_project_id_release_identifier_report_versi_key" ON "final_qa_reports"("project_id", "release_identifier", "report_version");

-- CreateIndex
CREATE UNIQUE INDEX "final_qa_reports_project_id_report_key_key" ON "final_qa_reports"("project_id", "report_key");

-- CreateIndex
CREATE INDEX "qa_report_audit_events_project_id_idx" ON "qa_report_audit_events"("project_id");

-- CreateIndex
CREATE INDEX "qa_report_audit_events_report_id_idx" ON "qa_report_audit_events"("report_id");

-- CreateIndex
CREATE INDEX "qa_report_audit_events_action_idx" ON "qa_report_audit_events"("action");

-- CreateIndex
CREATE INDEX "qa_report_audit_events_timestamp_idx" ON "qa_report_audit_events"("timestamp");

-- AddForeignKey
ALTER TABLE "final_qa_reports" ADD CONSTRAINT "final_qa_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_qa_reports" ADD CONSTRAINT "final_qa_reports_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "project_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_report_audit_events" ADD CONSTRAINT "qa_report_audit_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_report_audit_events" ADD CONSTRAINT "qa_report_audit_events_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "final_qa_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
