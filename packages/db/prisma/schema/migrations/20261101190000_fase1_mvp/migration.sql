-- Busca sem acento por trigram (ver docs/plans/fase-1.md).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "LegalDocumentKind" AS ENUM ('TERMS', 'PRIVACY');

-- CreateEnum
CREATE TYPE "ExerciseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- AlterTable
ALTER TABLE "anamnesis_responses" ADD COLUMN     "due_at" TIMESTAMPTZ(3),
ADD COLUMN     "has_risk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "exercise_sets" ADD COLUMN     "cadence" TEXT,
ADD COLUMN     "rir" INTEGER;

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "aliases" TEXT[],
ADD COLUMN     "code" TEXT,
ADD COLUMN     "common_mistakes" TEXT,
ADD COLUMN     "level" "ExerciseLevel" NOT NULL DEFAULT 'BEGINNER',
ADD COLUMN     "search_text" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tips" TEXT;

-- AlterTable
ALTER TABLE "physical_assessments" ADD COLUMN     "equation" TEXT NOT NULL DEFAULT 'siri',
ADD COLUMN     "next_assessment_on" DATE,
ADD COLUMN     "pdf_media_id" UUID,
ADD COLUMN     "reminder_sent_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "session_set_logs" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "rpe" DECIMAL(3,1),
ADD COLUMN     "skipped" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "student_links" ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "inactivity_notified_at" TIMESTAMPTZ(3),
ADD COLUMN     "injuries" TEXT,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "restrictions" TEXT,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "whatsapp" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "blocked_at" TIMESTAMPTZ(3),
ADD COLUMN     "blocked_reason" TEXT,
ADD COLUMN     "inactivity_alert_days" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "onboarding_steps" TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "training_reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "training_reminder_time" TEXT;

-- AlterTable
ALTER TABLE "workout_programs" ADD COLUMN     "published_at" TIMESTAMPTZ(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "workout_sessions" ADD COLUMN     "critical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "feedback_read_at" TIMESTAMPTZ(3),
ADD COLUMN     "has_pain" BOOLEAN,
ADD COLUMN     "pain_location" TEXT,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "total_volume_kg" DECIMAL(10,1);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_kind_version_key" ON "legal_documents"("kind", "version");

-- CreateIndex
CREATE INDEX "exercises_search_text_trgm_idx" ON "exercises" USING GIN ("search_text" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "exercises_tenant_id_code_key" ON "exercises"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "workout_sessions_tenant_id_finished_at_idx" ON "workout_sessions"("tenant_id", "finished_at");

