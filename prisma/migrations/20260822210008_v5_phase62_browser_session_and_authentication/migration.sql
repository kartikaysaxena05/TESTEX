-- CreateEnum
CREATE TYPE "AuthenticationStrategy" AS ENUM ('NONE', 'FORM_LOGIN', 'STORAGE_STATE', 'HTTP_BASIC');

-- CreateEnum
CREATE TYPE "AuthenticationValidationType" AS ENUM ('NONE', 'URL_MATCH', 'ELEMENT_PRESENT', 'COOKIE_PRESENT');

-- CreateEnum
CREATE TYPE "AuthenticationProfileStatus" AS ENUM ('CONFIGURED', 'VALID', 'INVALID', 'STALE', 'UNSUPPORTED');

-- CreateTable
CREATE TABLE "authentication_profiles" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "environment_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "strategy" "AuthenticationStrategy" NOT NULL DEFAULT 'NONE',
    "status" "AuthenticationProfileStatus" NOT NULL DEFAULT 'CONFIGURED',
    "description" TEXT,
    "login_url" VARCHAR(2048),
    "username_field_selector" VARCHAR(255),
    "password_field_selector" VARCHAR(255),
    "submit_control_selector" VARCHAR(255),
    "success_validation_type" "AuthenticationValidationType" NOT NULL DEFAULT 'NONE',
    "success_validation_value" VARCHAR(2048),
    "credential_reference" VARCHAR(255),
    "storage_state_key" VARCHAR(255),
    "is_reusable" BOOLEAN NOT NULL DEFAULT false,
    "last_validated_at" TIMESTAMPTZ(6),
    "validation_error" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authentication_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "authentication_profiles_project_id_idx" ON "authentication_profiles"("project_id");

-- CreateIndex
CREATE INDEX "authentication_profiles_environment_id_idx" ON "authentication_profiles"("environment_id");

-- CreateIndex
CREATE INDEX "authentication_profiles_project_id_status_idx" ON "authentication_profiles"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "authentication_profiles_project_id_name_key" ON "authentication_profiles"("project_id", "name");

-- AddForeignKey
ALTER TABLE "authentication_profiles" ADD CONSTRAINT "authentication_profiles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authentication_profiles" ADD CONSTRAINT "authentication_profiles_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "project_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
