-- CreateEnum
CREATE TYPE "AnamnesisKind" AS ENUM ('PARQ', 'GENERAL_HEALTH', 'INJURIES', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AnamnesisStatus" AS ENUM ('PENDING', 'ANSWERED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BodyCompositionProtocol" AS ENUM ('POLLOCK_3', 'POLLOCK_7', 'JACKSON_POLLOCK', 'GUEDES', 'PETROSKI', 'FAULKNER', 'DURNIN_WOMERSLEY', 'BIOIMPEDANCE', 'NONE');

-- CreateEnum
CREATE TYPE "PhotoView" AS ENUM ('FRONT', 'BACK', 'LEFT', 'RIGHT');

-- CreateEnum
CREATE TYPE "MeasurementSource" AS ENUM ('MANUAL', 'ASSESSMENT', 'STUDENT');

-- CreateEnum
CREATE TYPE "StudentDocumentCategory" AS ENUM ('EXAM', 'MEAL_PLAN', 'CONTRACT', 'PRESCRIPTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AcademyContentType" AS ENUM ('COURSE', 'EBOOK', 'POST');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'AUDIO', 'IMAGE', 'VIDEO', 'FILE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CANCELED', 'DONE', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentProviderCode" AS ENUM ('ASAAS', 'PAGARME');

-- CreateEnum
CREATE TYPE "PaymentAccountStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StudentSubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "WalletEntryType" AS ENUM ('CREDIT', 'DEBIT', 'FEE', 'WITHDRAWAL', 'REFUND');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'ADMIN_OPERADOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TenantMemberRole" AS ENUM ('OWNER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "StudentLinkStatus" AS ENUM ('INVITED', 'ACTIVE', 'PAUSED', 'OVERDUE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('PASSWORD', 'GOOGLE', 'APPLE', 'MAGIC_LINK');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'MAGIC_LINK', 'STUDENT_INVITE', 'TWO_FACTOR_CHALLENGE');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS', 'PRIVACY', 'HEALTH_DATA', 'MARKETING');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CPF', 'CNPJ');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('STRENGTH', 'CARDIO', 'MOBILITY', 'STRETCHING', 'FUNCTIONAL', 'PLYOMETRIC', 'OTHER');

-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('exercise_video', 'exercise_image', 'progress_photo', 'posture_photo', 'document', 'chat_media', 'avatar', 'brand_logo', 'kyc_document', 'academy_content');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('TRAINING', 'CHAT', 'FINANCE', 'MARKETING', 'SECURITY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('FREE', 'PRO', 'PRO_PLUS');

-- CreateEnum
CREATE TYPE "FeatureType" AS ENUM ('BOOLEAN', 'LIMIT');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'BOLETO', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TrainingMethod" AS ENUM ('STANDARD', 'BI_SET', 'TRI_SET', 'CIRCUIT', 'DROP_SET', 'REST_PAUSE', 'PYRAMID', 'AMRAP', 'EMOM', 'CARDIO');

-- CreateEnum
CREATE TYPE "SetType" AS ENUM ('WARMUP', 'WORK', 'DROP', 'FAILURE', 'CARDIO');

-- CreateEnum
CREATE TYPE "RecordType" AS ENUM ('ONE_RM', 'MAX_LOAD', 'MAX_REPS', 'MAX_VOLUME');

-- CreateTable
CREATE TABLE "anamnesis_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "kind" "AnamnesisKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schema" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "anamnesis_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anamnesis_responses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "status" "AnamnesisStatus" NOT NULL DEFAULT 'PENDING',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "anamnesis_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_assessments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "assessor_member_id" UUID,
    "assessed_at" TIMESTAMPTZ(3) NOT NULL,
    "protocol" "BodyCompositionProtocol" NOT NULL DEFAULT 'NONE',
    "weight_kg" DECIMAL(6,2),
    "height_cm" DECIMAL(5,1),
    "skinfolds" JSONB NOT NULL DEFAULT '{}',
    "perimeters" JSONB NOT NULL DEFAULT '{}',
    "bioimpedance" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "physical_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posture_assessments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "assessed_at" TIMESTAMPTZ(3) NOT NULL,
    "findings" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "posture_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posture_photos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "posture_assessment_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "view" "PhotoView" NOT NULL,
    "markers" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "posture_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_photos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "view" "PhotoView",
    "taken_at" TIMESTAMPTZ(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "progress_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_measurements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "measured_at" TIMESTAMPTZ(3) NOT NULL,
    "source" "MeasurementSource" NOT NULL DEFAULT 'MANUAL',
    "weight_kg" DECIMAL(6,2),
    "body_fat_pct" DECIMAL(5,2),
    "measures" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_brands" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "logo_media_id" UUID,
    "primary_color" TEXT,
    "accent_color" TEXT,
    "custom_domain" TEXT,
    "custom_domain_verified_at" TIMESTAMPTZ(3),
    "email_from_name" TEXT,
    "email_from_address" TEXT,
    "email_domain_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_pages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "photo_media_id" UUID,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "seo_title" TEXT,
    "seo_description" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "sales_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" "StudentDocumentCategory" NOT NULL DEFAULT 'OTHER',
    "visible_to_student" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_contents" (
    "id" UUID NOT NULL,
    "type" "AcademyContentType" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "cover_media_id" UUID,
    "file_media_id" UUID,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "required_plan" "PlanCode",
    "tags" TEXT[],
    "published_at" TIMESTAMPTZ(3),
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "academy_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_lessons" (
    "id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "video_media_id" UUID,
    "duration_seconds" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "academy_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "position_sec" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "academy_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "last_message_at" TIMESTAMPTZ(3),
    "staff_last_read_at" TIMESTAMPTZ(3),
    "student_last_read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "media_id" UUID,
    "client_id" TEXT,
    "edited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "channels" "NotificationChannel"[],
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "recipients_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "student_link_id" UUID,
    "title" TEXT NOT NULL,
    "type" "AppointmentType" NOT NULL DEFAULT 'IN_PERSON',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "location" TEXT,
    "meeting_url" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "recurrence_rule" TEXT,
    "recurrence_parent_id" UUID,
    "google_event_id" TEXT,
    "confirmed_at" TIMESTAMPTZ(3),
    "reminder_sent_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_integrations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GOOGLE',
    "external_account_email" TEXT,
    "calendar_id" TEXT,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMPTZ(3),
    "sync_token" TEXT,
    "last_synced_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "calendar_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consulting_plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "benefits" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "consulting_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "consulting_plan_id" UUID NOT NULL,
    "status" "StudentSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "method" "PaymentMethod",
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "next_due_date" DATE,
    "canceled_at" TIMESTAMPTZ(3),
    "block_on_overdue" BOOLEAN NOT NULL DEFAULT true,
    "gateway_subscription_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "student_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "student_subscription_id" UUID,
    "description" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "platform_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "gateway_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "net_cents" INTEGER NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod",
    "due_date" DATE NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "provider" "PaymentProviderCode",
    "gateway_charge_id" TEXT,
    "pix_qr_code" TEXT,
    "pix_copy_paste" TEXT,
    "boleto_url" TEXT,
    "invoice_url" TEXT,
    "last_reminder_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" "PaymentProviderCode" NOT NULL DEFAULT 'ASAAS',
    "external_account_id" TEXT,
    "wallet_id" TEXT,
    "status" "PaymentAccountStatus" NOT NULL DEFAULT 'PENDING',
    "status_reason" TEXT,
    "api_key_encrypted" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL DEFAULT 0,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "pix_key" TEXT,
    "gateway_transfer_id" TEXT,
    "failure_reason" TEXT,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "invoice_id" UUID,
    "withdrawal_id" UUID,
    "description" TEXT NOT NULL,
    "available_at" TIMESTAMPTZ(3),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatar_media_id" UUID,
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "two_factor_secret" TEXT,
    "two_factor_enabled_at" TIMESTAMPTZ(3),
    "two_factor_recovery_codes" TEXT[],
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" TEXT NOT NULL DEFAULT '22:00',
    "quiet_hours_end" TEXT NOT NULL DEFAULT '07:00',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "two_factor_secret" TEXT,
    "two_factor_enabled_at" TIMESTAMPTZ(3),
    "two_factor_recovery_codes" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "cref" TEXT,
    "cref_state" CHAR(2),
    "legal_name" TEXT,
    "document_type" "DocumentType",
    "document_number" TEXT,
    "billing_email" TEXT,
    "phone" TEXT,
    "address_street" TEXT,
    "address_number" TEXT,
    "address_complement" TEXT,
    "address_district" TEXT,
    "address_city" TEXT,
    "address_state" CHAR(2),
    "address_zip" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "TenantMemberRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "invited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" "StudentLinkStatus" NOT NULL DEFAULT 'INVITED',
    "assistant_member_id" UUID,
    "birth_date" DATE,
    "sex" "Sex",
    "goal" TEXT,
    "notes" TEXT,
    "invited_at" TIMESTAMPTZ(3),
    "joined_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "archived_reason" TEXT,
    "last_activity_at" TIMESTAMPTZ(3),
    "last_workout_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "student_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "admin_user_id" UUID,
    "device_name" TEXT,
    "platform" "DevicePlatform" NOT NULL DEFAULT 'WEB',
    "ip" TEXT,
    "user_agent" TEXT,
    "auth_method" "AuthProvider" NOT NULL DEFAULT 'PASSWORD',
    "impersonator_admin_id" UUID,
    "impersonation_reason" TEXT,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "rotated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID,
    "admin_user_id" UUID,
    "tenant_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "push_token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "name" TEXT,
    "app_version" TEXT,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID,
    "type" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actor_user_id" UUID,
    "actor_admin_id" UUID,
    "impersonator_admin_id" UUID,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_folders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "exercise_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "folder_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "category" "ExerciseCategory" NOT NULL DEFAULT 'STRENGTH',
    "primary_muscles" TEXT[],
    "secondary_muscles" TEXT[],
    "equipment" TEXT[],
    "video_media_id" UUID,
    "image_media_id" UUID,
    "gif_media_id" UUID,
    "external_video_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_favorites" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "exercise_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "owner_user_id" UUID,
    "owner_admin_id" UUID,
    "student_link_id" UUID,
    "purpose" "UploadPurpose" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "bucket" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "detected_mime_type" TEXT,
    "size" BIGINT NOT NULL,
    "multipart_upload_id" TEXT,
    "variants" JSONB NOT NULL DEFAULT '{}',
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" DOUBLE PRECISION,
    "provider_asset_id" TEXT,
    "failure_reason" TEXT,
    "upload_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3),
    "processed_at" TIMESTAMPTZ(3),
    "purged_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_storage_usage" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bytes_used" BIGINT NOT NULL DEFAULT 0,
    "bytes_reserved" BIGINT NOT NULL DEFAULT 0,
    "warned_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_storage_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID,
    "event_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deep_link" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "group_key" TEXT,
    "group_count" INTEGER NOT NULL DEFAULT 1,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "event" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta_label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_logs" (
    "id" UUID NOT NULL,
    "notification_id" UUID,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID,
    "event_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "recipient" TEXT,
    "template_version" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "scheduled_for" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "opened_at" TIMESTAMPTZ(3),
    "clicked_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "features" (
    "key" TEXT NOT NULL,
    "type" "FeatureType" NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_value" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "features_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_prices" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "cycle" "BillingCycle" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "gateway_price_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "trial_ends_at" TIMESTAMPTZ(3),
    "trial_ending_notified_at" TIMESTAMPTZ(3),
    "current_period_start" TIMESTAMPTZ(3),
    "current_period_end" TIMESTAMPTZ(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMPTZ(3),
    "coupon_id" UUID,
    "gateway_customer_id" TEXT,
    "gateway_subscription_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_feature_overrides" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_feature_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL,
    "percent_off" INTEGER,
    "amount_off_cents" INTEGER,
    "duration_cycles" INTEGER,
    "max_redemptions" INTEGER,
    "redemptions_count" INTEGER NOT NULL DEFAULT 0,
    "plan_codes" "PlanCode"[],
    "valid_from" TIMESTAMPTZ(3),
    "valid_until" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "coupon_id" UUID,
    "amount_cents" INTEGER NOT NULL,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod",
    "due_date" DATE NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "gateway_invoice_id" TEXT,
    "invoice_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "platform_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "student_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_group_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "student_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_activities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "student_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_programs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID,
    "created_by_member_id" UUID,
    "source_program_id" UUID,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "description" TEXT,
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "is_extra" BOOLEAN NOT NULL DEFAULT false,
    "starts_on" DATE,
    "ends_on" DATE,
    "public_token" TEXT,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "workout_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_routines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "name" TEXT,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "workout_routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_exercises" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "routine_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "method" "TrainingMethod" NOT NULL DEFAULT 'STANDARD',
    "group_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "rest_seconds" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "routine_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_sets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "routine_exercise_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "type" "SetType" NOT NULL DEFAULT 'WORK',
    "reps" TEXT,
    "target_load_kg" DECIMAL(7,2),
    "duration_seconds" INTEGER,
    "distance_meters" INTEGER,
    "rest_seconds" INTEGER,
    "rpe" DECIMAL(3,1),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "exercise_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodizations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "periodizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodization_phases" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "periodization_id" UUID NOT NULL,
    "program_id" UUID,
    "name" TEXT NOT NULL,
    "focus" TEXT,
    "weeks" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "progression" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "periodization_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "program_id" UUID,
    "routine_id" UUID,
    "client_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "duration_seconds" INTEGER,
    "perceived_effort" INTEGER,
    "mood" TEXT,
    "feedback" TEXT,
    "is_extra" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_set_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "routine_exercise_id" UUID,
    "exercise_id" UUID NOT NULL,
    "set_order" INTEGER NOT NULL,
    "reps" INTEGER,
    "load_kg" DECIMAL(7,2),
    "duration_seconds" INTEGER,
    "distance_meters" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "session_set_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_link_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "session_id" UUID,
    "type" "RecordType" NOT NULL,
    "value" DECIMAL(9,2) NOT NULL,
    "achieved_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "personal_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anamnesis_templates_tenant_id_kind_idx" ON "anamnesis_templates"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "anamnesis_responses_tenant_id_student_link_id_idx" ON "anamnesis_responses"("tenant_id", "student_link_id");

-- CreateIndex
CREATE INDEX "physical_assessments_tenant_id_student_link_id_assessed_at_idx" ON "physical_assessments"("tenant_id", "student_link_id", "assessed_at");

-- CreateIndex
CREATE INDEX "posture_assessments_tenant_id_student_link_id_idx" ON "posture_assessments"("tenant_id", "student_link_id");

-- CreateIndex
CREATE INDEX "posture_photos_tenant_id_posture_assessment_id_idx" ON "posture_photos"("tenant_id", "posture_assessment_id");

-- CreateIndex
CREATE INDEX "progress_photos_tenant_id_student_link_id_taken_at_idx" ON "progress_photos"("tenant_id", "student_link_id", "taken_at");

-- CreateIndex
CREATE INDEX "body_measurements_tenant_id_student_link_id_measured_at_idx" ON "body_measurements"("tenant_id", "student_link_id", "measured_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_brands_tenant_id_key" ON "tenant_brands"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_brands_custom_domain_key" ON "tenant_brands"("custom_domain");

-- CreateIndex
CREATE UNIQUE INDEX "sales_pages_tenant_id_key" ON "sales_pages"("tenant_id");

-- CreateIndex
CREATE INDEX "student_documents_tenant_id_student_link_id_idx" ON "student_documents"("tenant_id", "student_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "academy_contents_slug_key" ON "academy_contents"("slug");

-- CreateIndex
CREATE INDEX "academy_contents_type_status_published_at_idx" ON "academy_contents"("type", "status", "published_at");

-- CreateIndex
CREATE INDEX "academy_lessons_content_id_sort_order_idx" ON "academy_lessons"("content_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "academy_progress_user_id_lesson_id_key" ON "academy_progress"("user_id", "lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_student_link_id_key" ON "conversations"("student_link_id");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_last_message_at_idx" ON "conversations"("tenant_id", "last_message_at");

-- CreateIndex
CREATE INDEX "messages_tenant_id_conversation_id_created_at_idx" ON "messages"("tenant_id", "conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_client_id_key" ON "messages"("conversation_id", "client_id");

-- CreateIndex
CREATE INDEX "broadcasts_tenant_id_status_idx" ON "broadcasts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_starts_at_idx" ON "appointments"("tenant_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_member_id_starts_at_idx" ON "appointments"("tenant_id", "member_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_student_link_id_starts_at_idx" ON "appointments"("tenant_id", "student_link_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_integrations_tenant_id_member_id_provider_key" ON "calendar_integrations"("tenant_id", "member_id", "provider");

-- CreateIndex
CREATE INDEX "consulting_plans_tenant_id_is_active_idx" ON "consulting_plans"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "student_subscriptions_gateway_subscription_id_key" ON "student_subscriptions"("gateway_subscription_id");

-- CreateIndex
CREATE INDEX "student_subscriptions_tenant_id_status_idx" ON "student_subscriptions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "student_subscriptions_tenant_id_student_link_id_idx" ON "student_subscriptions"("tenant_id", "student_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_gateway_charge_id_key" ON "invoices"("gateway_charge_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_due_date_idx" ON "invoices"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_student_link_id_idx" ON "invoices"("tenant_id", "student_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_tenant_id_key" ON "payment_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_gateway_transfer_id_key" ON "withdrawals"("gateway_transfer_id");

-- CreateIndex
CREATE INDEX "withdrawals_tenant_id_status_idx" ON "withdrawals"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "wallet_entries_tenant_id_occurred_at_idx" ON "wallet_entries"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_paid_on_idx" ON "expenses"("tenant_id", "paid_on");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_provider_user_id_key" ON "user_identities"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_owner_user_id_idx" ON "tenants"("owner_user_id");

-- CreateIndex
CREATE INDEX "tenant_members_user_id_idx" ON "tenant_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_members_tenant_id_user_id_key" ON "tenant_members"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "student_links_tenant_id_status_idx" ON "student_links"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "student_links_tenant_id_assistant_member_id_idx" ON "student_links"("tenant_id", "assistant_member_id");

-- CreateIndex
CREATE INDEX "student_links_user_id_idx" ON "student_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_links_tenant_id_user_id_key" ON "student_links"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_admin_user_id_idx" ON "sessions"("admin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "devices_push_token_key" ON "devices"("push_token");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "consents_user_id_type_idx" ON "consents"("user_id", "type");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_admin_id_created_at_idx" ON "audit_logs"("actor_admin_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "exercise_folders_tenant_id_parent_id_idx" ON "exercise_folders"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "exercises_tenant_id_name_idx" ON "exercises"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "exercises_folder_id_idx" ON "exercises"("folder_id");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_favorites_tenant_id_user_id_exercise_id_key" ON "exercise_favorites"("tenant_id", "user_id", "exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "media_tenant_id_purpose_idx" ON "media"("tenant_id", "purpose");

-- CreateIndex
CREATE INDEX "media_status_upload_expires_at_idx" ON "media"("status", "upload_expires_at");

-- CreateIndex
CREATE INDEX "media_deleted_at_idx" ON "media"("deleted_at");

-- CreateIndex
CREATE INDEX "media_owner_user_id_idx" ON "media"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_storage_usage_tenant_id_key" ON "tenant_storage_usage"("tenant_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_group_key_idx" ON "notifications"("user_id", "group_key");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_event_id_key" ON "notifications"("user_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_category_channel_key" ON "notification_preferences"("user_id", "category", "channel");

-- CreateIndex
CREATE INDEX "notification_templates_event_channel_locale_is_active_idx" ON "notification_templates"("event", "channel", "locale", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_event_channel_locale_version_tenant__key" ON "notification_templates"("event", "channel", "locale", "version", "tenant_id");

-- CreateIndex
CREATE INDEX "delivery_logs_provider_message_id_idx" ON "delivery_logs"("provider_message_id");

-- CreateIndex
CREATE INDEX "delivery_logs_status_created_at_idx" ON "delivery_logs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_logs_event_id_user_id_channel_key" ON "delivery_logs"("event_id", "user_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_plan_id_feature_key_key" ON "plan_features"("plan_id", "feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "plan_prices_plan_id_cycle_key" ON "plan_prices"("plan_id", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_subscriptions_tenant_id_key" ON "tenant_subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_subscriptions_status_trial_ends_at_idx" ON "tenant_subscriptions"("status", "trial_ends_at");

-- CreateIndex
CREATE INDEX "tenant_feature_overrides_expires_at_idx" ON "tenant_feature_overrides"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_feature_overrides_tenant_id_feature_key_key" ON "tenant_feature_overrides"("tenant_id", "feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_gateway_invoice_id_key" ON "platform_invoices"("gateway_invoice_id");

-- CreateIndex
CREATE INDEX "platform_invoices_tenant_id_status_idx" ON "platform_invoices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "student_groups_tenant_id_idx" ON "student_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "student_group_members_tenant_id_idx" ON "student_group_members"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_group_members_group_id_student_link_id_key" ON "student_group_members"("group_id", "student_link_id");

-- CreateIndex
CREATE INDEX "student_activities_tenant_id_student_link_id_occurred_at_idx" ON "student_activities"("tenant_id", "student_link_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "workout_programs_public_token_key" ON "workout_programs"("public_token");

-- CreateIndex
CREATE INDEX "workout_programs_tenant_id_student_link_id_status_idx" ON "workout_programs"("tenant_id", "student_link_id", "status");

-- CreateIndex
CREATE INDEX "workout_programs_tenant_id_is_template_idx" ON "workout_programs"("tenant_id", "is_template");

-- CreateIndex
CREATE INDEX "workout_routines_tenant_id_program_id_idx" ON "workout_routines"("tenant_id", "program_id");

-- CreateIndex
CREATE INDEX "routine_exercises_tenant_id_routine_id_idx" ON "routine_exercises"("tenant_id", "routine_id");

-- CreateIndex
CREATE INDEX "exercise_sets_tenant_id_routine_exercise_id_idx" ON "exercise_sets"("tenant_id", "routine_exercise_id");

-- CreateIndex
CREATE INDEX "periodizations_tenant_id_student_link_id_idx" ON "periodizations"("tenant_id", "student_link_id");

-- CreateIndex
CREATE INDEX "periodization_phases_tenant_id_periodization_id_idx" ON "periodization_phases"("tenant_id", "periodization_id");

-- CreateIndex
CREATE INDEX "workout_sessions_tenant_id_student_link_id_started_at_idx" ON "workout_sessions"("tenant_id", "student_link_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "workout_sessions_tenant_id_client_id_key" ON "workout_sessions"("tenant_id", "client_id");

-- CreateIndex
CREATE INDEX "session_set_logs_tenant_id_session_id_idx" ON "session_set_logs"("tenant_id", "session_id");

-- CreateIndex
CREATE INDEX "session_set_logs_tenant_id_exercise_id_idx" ON "session_set_logs"("tenant_id", "exercise_id");

-- CreateIndex
CREATE INDEX "personal_records_tenant_id_student_link_id_exercise_id_type_idx" ON "personal_records"("tenant_id", "student_link_id", "exercise_id", "type");

-- AddForeignKey
ALTER TABLE "anamnesis_templates" ADD CONSTRAINT "anamnesis_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamnesis_responses" ADD CONSTRAINT "anamnesis_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamnesis_responses" ADD CONSTRAINT "anamnesis_responses_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anamnesis_responses" ADD CONSTRAINT "anamnesis_responses_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "anamnesis_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_assessments" ADD CONSTRAINT "physical_assessments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_assessments" ADD CONSTRAINT "physical_assessments_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_assessments" ADD CONSTRAINT "physical_assessments_assessor_member_id_fkey" FOREIGN KEY ("assessor_member_id") REFERENCES "tenant_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posture_assessments" ADD CONSTRAINT "posture_assessments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posture_assessments" ADD CONSTRAINT "posture_assessments_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posture_photos" ADD CONSTRAINT "posture_photos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posture_photos" ADD CONSTRAINT "posture_photos_posture_assessment_id_fkey" FOREIGN KEY ("posture_assessment_id") REFERENCES "posture_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_brands" ADD CONSTRAINT "tenant_brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_pages" ADD CONSTRAINT "sales_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_lessons" ADD CONSTRAINT "academy_lessons_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "academy_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_progress" ADD CONSTRAINT "academy_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_progress" ADD CONSTRAINT "academy_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "academy_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "tenant_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_recurrence_parent_id_fkey" FOREIGN KEY ("recurrence_parent_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_integrations" ADD CONSTRAINT "calendar_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_integrations" ADD CONSTRAINT "calendar_integrations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "tenant_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulting_plans" ADD CONSTRAINT "consulting_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subscriptions" ADD CONSTRAINT "student_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subscriptions" ADD CONSTRAINT "student_subscriptions_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subscriptions" ADD CONSTRAINT "student_subscriptions_consulting_plan_id_fkey" FOREIGN KEY ("consulting_plan_id") REFERENCES "consulting_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_subscription_id_fkey" FOREIGN KEY ("student_subscription_id") REFERENCES "student_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_links" ADD CONSTRAINT "student_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_links" ADD CONSTRAINT "student_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_links" ADD CONSTRAINT "student_links_assistant_member_id_fkey" FOREIGN KEY ("assistant_member_id") REFERENCES "tenant_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonator_admin_id_fkey" FOREIGN KEY ("impersonator_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_folders" ADD CONSTRAINT "exercise_folders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_folders" ADD CONSTRAINT "exercise_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "exercise_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "exercise_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_favorites" ADD CONSTRAINT "exercise_favorites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_favorites" ADD CONSTRAINT "exercise_favorites_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_owner_admin_id_fkey" FOREIGN KEY ("owner_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_storage_usage" ADD CONSTRAINT "tenant_storage_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "features"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "features"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "tenant_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "student_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_members" ADD CONSTRAINT "student_group_members_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_activities" ADD CONSTRAINT "student_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_activities" ADD CONSTRAINT "student_activities_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_programs" ADD CONSTRAINT "workout_programs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_programs" ADD CONSTRAINT "workout_programs_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_programs" ADD CONSTRAINT "workout_programs_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "tenant_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_routines" ADD CONSTRAINT "workout_routines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_routines" ADD CONSTRAINT "workout_routines_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "workout_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "workout_routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_sets" ADD CONSTRAINT "exercise_sets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_sets" ADD CONSTRAINT "exercise_sets_routine_exercise_id_fkey" FOREIGN KEY ("routine_exercise_id") REFERENCES "routine_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodizations" ADD CONSTRAINT "periodizations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodizations" ADD CONSTRAINT "periodizations_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodization_phases" ADD CONSTRAINT "periodization_phases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodization_phases" ADD CONSTRAINT "periodization_phases_periodization_id_fkey" FOREIGN KEY ("periodization_id") REFERENCES "periodizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodization_phases" ADD CONSTRAINT "periodization_phases_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "workout_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "workout_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "workout_routines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_set_logs" ADD CONSTRAINT "session_set_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_set_logs" ADD CONSTRAINT "session_set_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_set_logs" ADD CONSTRAINT "session_set_logs_routine_exercise_id_fkey" FOREIGN KEY ("routine_exercise_id") REFERENCES "routine_exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_set_logs" ADD CONSTRAINT "session_set_logs_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_student_link_id_fkey" FOREIGN KEY ("student_link_id") REFERENCES "student_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
