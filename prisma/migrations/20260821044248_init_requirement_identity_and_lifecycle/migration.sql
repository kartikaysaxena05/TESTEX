-- CreateTable
CREATE TABLE "project_requirement_sequences" (
    "project_id" UUID NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_requirement_sequences_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "project_requirement_sequences" ADD CONSTRAINT "project_requirement_sequences_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
