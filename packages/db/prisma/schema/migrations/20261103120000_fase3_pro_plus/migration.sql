-- CreateEnum
CREATE TYPE "AiGenerationKind" AS ENUM ('PROGRAM', 'LOAD_SUGGESTION', 'WEEKLY_SUMMARY');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CustomDomainStatus" AS ENUM ('PENDING', 'VERIFYING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "HealthSampleType" AS ENUM ('STEPS', 'HEART_RATE', 'WEIGHT', 'WORKOUT');

-- CreateEnum
CREATE TYPE "HealthSource" AS ENUM ('HEALTHKIT', 'HEALTH_CONNECT');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'WAITING_USER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PlatformBroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELED');

-- AlterEnum
ALTER TYPE "ConsentType" ADD VALUE 'WHATSAPP';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "google_updated_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "calendar_integrations" ADD COLUMN     "channel_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "channel_id" TEXT,
ADD COLUMN     "channel_resource_id" TEXT,
ADD COLUMN     "channel_token" TEXT,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "oauth_state" TEXT;

-- AlterTable
ALTER TABLE "schedule_blocks" ADD COLUMN     "google_event_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "schedule_blocks_member_id_google_event_id_key" ON "schedule_blocks"("member_id", "google_event_id");

-- AlterTable
ALTER TABLE "tenant_brands" ADD COLUMN     "custom_domain_checked_at" TIMESTAMPTZ(3),
ADD COLUMN     "custom_domain_error" TEXT,
ADD COLUMN     "custom_domain_provider_id" TEXT,
ADD COLUMN     "custom_domain_status" "CustomDomainStatus",
ADD COLUMN     "display_name" TEXT;

-- AlterTable
ALTER TABLE "tenant_members" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY['prescribe', 'assess', 'chat']::TEXT[];

-- CreateTable
CREATE TABLE "ai_generations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID,
    "student_link_id" UUID,
    "kind" "AiGenerationKind" NOT NULL,
    "status" "AiGenerationStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "program_id" UUID,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micro_usd" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "tool_calls" INTEGER NOT NULL DEFAULT 0,
    "output" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_samples" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "HealthSource" NOT NULL,
    "type" "HealthSampleType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "value" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "health_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL',
    "plan_code" "PlanCode" NOT NULL,
    "page_url" TEXT,
    "assigned_admin_id" UUID,
    "first_response_due_at" TIMESTAMPTZ(3) NOT NULL,
    "resolution_due_at" TIMESTAMPTZ(3) NOT NULL,
    "first_responded_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "sla_breached_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "author_user_id" UUID,
    "author_admin_id" UUID,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_broadcasts" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "channels" "NotificationChannel"[],
    "segment" JSONB NOT NULL DEFAULT '{}',
    "status" "PlatformBroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "platform_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_broadcast_recipients" (
    "id" UUID NOT NULL,
    "broadcast_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delivered_at" TIMESTAMPTZ(3),
    "opened_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_broadcast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_generations_tenant_id_kind_created_at_idx" ON "ai_generations"("tenant_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "ai_generations_created_at_idx" ON "ai_generations"("created_at");

-- CreateIndex
CREATE INDEX "health_samples_user_id_type_start_at_idx" ON "health_samples"("user_id", "type", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "health_samples_user_id_source_external_id_key" ON "health_samples"("user_id", "source", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets"("number");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_created_at_idx" ON "support_tickets"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_status_first_response_due_at_idx" ON "support_tickets"("status", "first_response_due_at");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_broadcasts_status_scheduled_at_idx" ON "platform_broadcasts"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "platform_broadcast_recipients_user_id_idx" ON "platform_broadcast_recipients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_broadcast_recipients_broadcast_id_user_id_key" ON "platform_broadcast_recipients"("broadcast_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_integrations_channel_id_key" ON "calendar_integrations"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_integrations_oauth_state_key" ON "calendar_integrations"("oauth_state");

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_samples" ADD CONSTRAINT "health_samples_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_broadcast_recipients" ADD CONSTRAINT "platform_broadcast_recipients_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "platform_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

