-- CreateEnum
CREATE TYPE "TechnicalLayer" AS ENUM ('FRONTEND_UI', 'FRONTEND_STATE', 'FRONTEND_NETWORK_CLIENT', 'BACKEND_API', 'BACKEND_SERVICE', 'DATABASE', 'AUTHENTICATION', 'AUTHORIZATION', 'EXTERNAL_SERVICE', 'BROWSER_AUTOMATION', 'TEST_INFRASTRUCTURE', 'TEST_DATA', 'ENVIRONMENT', 'UNKNOWN', 'MULTI_LAYER');

-- CreateEnum
CREATE TYPE "LocalizationTargetType" AS ENUM ('TEST_STEP', 'ASSERTION', 'DOM_ELEMENT', 'FRONTEND_ROUTE', 'FRONTEND_COMPONENT', 'FRONTEND_EVENT_HANDLER', 'NETWORK_REQUEST', 'API_ENDPOINT', 'BACKEND_ROUTE', 'BACKEND_CONTROLLER', 'BACKEND_SERVICE', 'REPOSITORY_FILE', 'REPOSITORY_SYMBOL', 'DATABASE_OPERATION', 'EXTERNAL_SERVICE', 'ENVIRONMENT_DEPENDENCY', 'BROWSER_SUBSYSTEM');

-- CreateEnum
CREATE TYPE "SignalStrength" AS ENUM ('DIRECT', 'STRONG', 'SUPPORTING', 'WEAK', 'UNKNOWN');

-- CreateTable
CREATE TABLE "failure_technical_localizations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "failure_case_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "failure_analysis_run_id" UUID,
    "domain_separation_id" UUID,
    "primary_layer" "TechnicalLayer" NOT NULL,
    "secondary_layers" JSONB NOT NULL DEFAULT '[]',
    "primary_target_type" "LocalizationTargetType" NOT NULL,
    "primary_target_identifier" VARCHAR(512) NOT NULL,
    "secondary_targets" JSONB NOT NULL DEFAULT '[]',
    "repository_file_id" UUID,
    "repository_symbol_id" UUID,
    "matched_file_path" VARCHAR(1024),
    "matched_symbol_name" VARCHAR(255),
    "matched_line_number" INTEGER,
    "http_endpoint" VARCHAR(1024),
    "http_method" VARCHAR(16),
    "http_status_code" INTEGER,
    "dom_selector" VARCHAR(1024),
    "ui_component_name" VARCHAR(255),
    "route_path" VARCHAR(1024),
    "timeline_summary" JSONB NOT NULL DEFAULT '[]',
    "correlation_signals" JSONB NOT NULL DEFAULT '[]',
    "conflicting_signals" JSONB NOT NULL DEFAULT '[]',
    "localization_rationale" TEXT NOT NULL,
    "evidence_references" JSONB NOT NULL DEFAULT '[]',
    "localization_fingerprint" VARCHAR(64) NOT NULL,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT true,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "staleness_reason" TEXT,
    "relocalization_count" INTEGER NOT NULL DEFAULT 0,
    "last_relocalized_at" TIMESTAMPTZ(6),
    "relocalization_reason" TEXT,
    "localized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_technical_localizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "failure_technical_localizations_project_id_idx" ON "failure_technical_localizations"("project_id");

-- CreateIndex
CREATE INDEX "failure_technical_localizations_failure_case_id_idx" ON "failure_technical_localizations"("failure_case_id");

-- CreateIndex
CREATE INDEX "failure_technical_localizations_test_case_id_idx" ON "failure_technical_localizations"("test_case_id");

-- CreateIndex
CREATE INDEX "failure_technical_localizations_primary_layer_idx" ON "failure_technical_localizations"("primary_layer");

-- CreateIndex
CREATE INDEX "failure_technical_localizations_primary_target_type_idx" ON "failure_technical_localizations"("primary_target_type");

-- CreateIndex
CREATE INDEX "failure_technical_localizations_repository_file_id_idx" ON "failure_technical_localizations"("repository_file_id");

-- CreateIndex
CREATE INDEX "failure_technical_localizations_repository_symbol_id_idx" ON "failure_technical_localizations"("repository_symbol_id");

-- CreateIndex
CREATE INDEX "failure_technical_localizations_is_authoritative_idx" ON "failure_technical_localizations"("is_authoritative");

-- CreateIndex
CREATE INDEX "failure_technical_localizations_localization_fingerprint_idx" ON "failure_technical_localizations"("localization_fingerprint");

-- CreateIndex
CREATE INDEX "failure_technical_localizations_localized_at_idx" ON "failure_technical_localizations"("localized_at");

-- CreateIndex
CREATE INDEX "failure_technical_localizations_created_at_idx" ON "failure_technical_localizations"("created_at");

-- AddForeignKey
ALTER TABLE "failure_technical_localizations" ADD CONSTRAINT "failure_technical_localizations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_technical_localizations" ADD CONSTRAINT "failure_technical_localizations_failure_case_id_fkey" FOREIGN KEY ("failure_case_id") REFERENCES "failure_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_technical_localizations" ADD CONSTRAINT "failure_technical_localizations_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_technical_localizations" ADD CONSTRAINT "failure_technical_localizations_failure_analysis_run_id_fkey" FOREIGN KEY ("failure_analysis_run_id") REFERENCES "failure_analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_technical_localizations" ADD CONSTRAINT "failure_technical_localizations_domain_separation_id_fkey" FOREIGN KEY ("domain_separation_id") REFERENCES "failure_domain_separations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_technical_localizations" ADD CONSTRAINT "failure_technical_localizations_repository_file_id_fkey" FOREIGN KEY ("repository_file_id") REFERENCES "repository_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_technical_localizations" ADD CONSTRAINT "failure_technical_localizations_repository_symbol_id_fkey" FOREIGN KEY ("repository_symbol_id") REFERENCES "repository_symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
