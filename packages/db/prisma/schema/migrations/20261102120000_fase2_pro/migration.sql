-- CreateEnum
CREATE TYPE "TestimonialStatus" AS ENUM ('PENDING', 'APPROVED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ResultConsentStatus" AS ENUM ('REQUESTED', 'GRANTED', 'DENIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AttendeeStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'CANCELED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ConsultingPaymentMode" AS ENUM ('ONE_TIME', 'INSTALLMENTS', 'RECURRING');

-- CreateEnum
CREATE TYPE "ManualEntryKind" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "KycDocumentStatus" AS ENUM ('PENDING', 'SENT', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FiscalInvoiceStatus" AS ENUM ('PENDING', 'PENDING_CONFIG', 'PROCESSING', 'ISSUED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "PeriodizationModel" AS ENUM ('LINEAR', 'UNDULATING', 'BLOCK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StudentSubscriptionStatus" ADD VALUE 'PENDING';
ALTER TYPE "StudentSubscriptionStatus" ADD VALUE 'ENDED';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reminder_1h_sent_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "broadcasts" ADD COLUMN     "recipient_user_ids" TEXT[];

-- AlterTable
ALTER TABLE "consulting_plans" ADD COLUMN     "max_installments" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "methods" "PaymentMethod"[],
ADD COLUMN     "payment_mode" "ConsultingPaymentMode" NOT NULL DEFAULT 'RECURRING',
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tolerance_days" INTEGER;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "last_message_preview" TEXT;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "kind" "ManualEntryKind" NOT NULL DEFAULT 'EXPENSE';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "credit_at" TIMESTAMPTZ(3),
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "gateway_installment_id" TEXT,
ADD COLUMN     "installment_count" INTEGER,
ADD COLUMN     "installment_number" INTEGER,
ADD COLUMN     "refunded_at" TIMESTAMPTZ(3),
ADD COLUMN     "reminders_sent" INTEGER[];

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "from_staff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quote" JSONB;

-- AlterTable
ALTER TABLE "payment_accounts" ADD COLUMN     "bank_account" JSONB,
ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "company_type" TEXT,
ADD COLUMN     "cpf_cnpj" TEXT,
ADD COLUMN     "income_value_cents" INTEGER,
ADD COLUMN     "mobile_phone" TEXT,
ADD COLUMN     "onboarding_url" TEXT,
ADD COLUMN     "person_type" "DocumentType",
ADD COLUMN     "pix_key" TEXT,
ADD COLUMN     "pix_key_type" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "submitted_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "periodizations" ADD COLUMN     "active_phase_id" UUID,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "model" "PeriodizationModel" NOT NULL DEFAULT 'LINEAR';

-- AlterTable
ALTER TABLE "platform_invoices" ADD COLUMN     "boleto_url" TEXT,
ADD COLUMN     "credit_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cycle" "BillingCycle",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "failed_at" TIMESTAMPTZ(3),
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "pix_copy_paste" TEXT,
ADD COLUMN     "pix_qr_code" TEXT,
ADD COLUMN     "plan_id" UUID,
ADD COLUMN     "refunded_at" TIMESTAMPTZ(3),
ADD COLUMN     "refunded_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reminders_sent" INTEGER[];

-- AlterTable
ALTER TABLE "sales_pages" ADD COLUMN     "faq" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "social_links" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "specialties" TEXT[];

-- AlterTable
ALTER TABLE "student_subscriptions" ADD COLUMN     "blocked_at" TIMESTAMPTZ(3),
ADD COLUMN     "end_notice_sent_at" TIMESTAMPTZ(3),
ADD COLUMN     "ends_at" TIMESTAMPTZ(3),
ADD COLUMN     "gateway_customer_id" TEXT,
ADD COLUMN     "installments" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "payment_mode" "ConsultingPaymentMode" NOT NULL DEFAULT 'RECURRING',
ADD COLUMN     "platform_fee_bps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "price_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "tenant_subscriptions" ADD COLUMN     "card_brand" TEXT,
ADD COLUMN     "card_last4" TEXT,
ADD COLUMN     "card_token_encrypted" TEXT,
ADD COLUMN     "coupon_cycles_used" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "credit_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "grace_ends_at" TIMESTAMPTZ(3),
ADD COLUMN     "past_due_since" TIMESTAMPTZ(3),
ADD COLUMN     "payment_method" "PaymentMethod",
ADD COLUMN     "pending_cycle" "BillingCycle",
ADD COLUMN     "pending_plan_id" UUID;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "block_overdue_after_days" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "block_overdue_students" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "booking_min_hours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "cancel_min_hours" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "reassessment_days" INTEGER;

-- AlterTable
ALTER TABLE "wallet_entries" ADD COLUMN     "dedupe_key" TEXT;

-- CreateTable
CREATE TABLE "anamnesis_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "repeat_every_days" INTEGER NOT NULL,
    "next_due_on" DATE NOT NULL,
    "last_sent_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "anamnesis_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonials" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID,
    "author_name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "rating" INTEGER,
    "status" "TestimonialStatus" NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_page_results" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "before_photo_id" UUID NOT NULL,
    "after_photo_id" UUID NOT NULL,
    "caption" TEXT,
    "consent_status" "ResultConsentStatus" NOT NULL DEFAULT 'REQUESTED',
    "consent_at" TIMESTAMPTZ(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "sales_page_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_attendees" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "status" "AttendeeStatus" NOT NULL DEFAULT 'BOOKED',
    "booked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(3),
    "canceled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "appointment_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "slot_minutes" INTEGER NOT NULL DEFAULT 60,
    "type" "AppointmentType" NOT NULL DEFAULT 'IN_PERSON',
    "location" TEXT,
    "meeting_url" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_blocks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_account_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "KycDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "gateway_document_id" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkouts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "consulting_plan_id" UUID NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "buyer_name" TEXT NOT NULL,
    "buyer_email" TEXT NOT NULL,
    "buyer_phone" TEXT,
    "buyer_document" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "amount_cents" INTEGER NOT NULL,
    "gateway_customer_id" TEXT,
    "gateway_payment_id" TEXT,
    "gateway_subscription_id" TEXT,
    "gateway_installment_id" TEXT,
    "invoice_url" TEXT,
    "pix_qr_code" TEXT,
    "pix_copy_paste" TEXT,
    "boleto_url" TEXT,
    "failure_reason" TEXT,
    "student_link_id" UUID,
    "student_subscription_id" UUID,
    "terms_version" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform_invoice_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'NFEIO',
    "external_id" TEXT,
    "status" "FiscalInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "number" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "pdf_url" TEXT,
    "xml_url" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "fiscal_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "resource_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "checked" INTEGER NOT NULL DEFAULT 0,
    "fixed" INTEGER NOT NULL DEFAULT 0,
    "mismatches" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anamnesis_assignments_is_active_next_due_on_idx" ON "anamnesis_assignments"("is_active", "next_due_on");

-- CreateIndex
CREATE UNIQUE INDEX "anamnesis_assignments_student_link_id_template_id_key" ON "anamnesis_assignments"("student_link_id", "template_id");

-- CreateIndex
CREATE INDEX "testimonials_tenant_id_status_idx" ON "testimonials"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sales_page_results_tenant_id_consent_status_idx" ON "sales_page_results"("tenant_id", "consent_status");

-- CreateIndex
CREATE INDEX "appointment_attendees_tenant_id_student_link_id_idx" ON "appointment_attendees"("tenant_id", "student_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_attendees_appointment_id_student_link_id_key" ON "appointment_attendees"("appointment_id", "student_link_id");

-- CreateIndex
CREATE INDEX "availability_rules_tenant_id_member_id_idx" ON "availability_rules"("tenant_id", "member_id");

-- CreateIndex
CREATE INDEX "schedule_blocks_tenant_id_member_id_starts_at_idx" ON "schedule_blocks"("tenant_id", "member_id", "starts_at");

-- CreateIndex
CREATE INDEX "kyc_documents_tenant_id_payment_account_id_idx" ON "kyc_documents"("tenant_id", "payment_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_gateway_payment_id_key" ON "checkouts"("gateway_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_gateway_subscription_id_key" ON "checkouts"("gateway_subscription_id");

-- CreateIndex
CREATE INDEX "checkouts_tenant_id_status_idx" ON "checkouts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "checkouts_status_expires_at_idx" ON "checkouts"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_invoices_platform_invoice_id_key" ON "fiscal_invoices"("platform_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_invoices_external_id_key" ON "fiscal_invoices"("external_id");

-- CreateIndex
CREATE INDEX "fiscal_invoices_status_idx" ON "fiscal_invoices"("status");

-- CreateIndex
CREATE INDEX "webhook_events_status_received_at_idx" ON "webhook_events"("status", "received_at");

-- CreateIndex
CREATE INDEX "webhook_events_resource_id_idx" ON "webhook_events"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_runs_date_key" ON "reconciliation_runs"("date");

-- CreateIndex
CREATE INDEX "appointments_status_starts_at_idx" ON "appointments"("status", "starts_at");

-- CreateIndex
CREATE INDEX "broadcasts_status_scheduled_at_idx" ON "broadcasts"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");

-- CreateIndex
CREATE INDEX "payment_accounts_external_account_id_idx" ON "payment_accounts"("external_account_id");

-- CreateIndex
CREATE INDEX "platform_invoices_status_due_date_idx" ON "platform_invoices"("status", "due_date");

-- CreateIndex
CREATE INDEX "platform_invoices_paid_at_idx" ON "platform_invoices"("paid_at");

-- CreateIndex
CREATE INDEX "student_subscriptions_status_ends_at_idx" ON "student_subscriptions"("status", "ends_at");

-- CreateIndex
CREATE INDEX "tenant_subscriptions_status_grace_ends_at_idx" ON "tenant_subscriptions"("status", "grace_ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_dedupe_key_key" ON "wallet_entries"("dedupe_key");

-- AddForeignKey
ALTER TABLE "anamnesis_assignments" ADD CONSTRAINT "anamnesis_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamnesis_assignments" ADD CONSTRAINT "anamnesis_assignments_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamnesis_assignments" ADD CONSTRAINT "anamnesis_assignments_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "anamnesis_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_page_results" ADD CONSTRAINT "sales_page_results_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_page_results" ADD CONSTRAINT "sales_page_results_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "tenant_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "tenant_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "payment_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_consulting_plan_id_fkey" FOREIGN KEY ("consulting_plan_id") REFERENCES "consulting_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_student_subscription_id_fkey" FOREIGN KEY ("student_subscription_id") REFERENCES "student_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_pending_plan_id_fkey" FOREIGN KEY ("pending_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_platform_invoice_id_fkey" FOREIGN KEY ("platform_invoice_id") REFERENCES "platform_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

