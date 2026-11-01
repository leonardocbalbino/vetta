-- Gerado por packages/db/scripts/generate-rls.ts. Não edite à mão.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetta_tenant') THEN
    CREATE ROLE vetta_tenant NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetta_platform') THEN
    CREATE ROLE vetta_platform NOLOGIN;
  END IF;
END
$$;

GRANT vetta_tenant TO CURRENT_USER;
GRANT vetta_platform TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO vetta_tenant, vetta_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vetta_tenant, vetta_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vetta_tenant, vetta_platform;

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $fn$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $fn$;

-- Tabelas sensíveis: inacessíveis ao papel de tenant.
REVOKE ALL ON "admin_users" FROM vetta_tenant;
REVOKE ALL ON "sessions" FROM vetta_tenant;
REVOKE ALL ON "refresh_tokens" FROM vetta_tenant;
REVOKE ALL ON "auth_tokens" FROM vetta_tenant;
REVOKE ALL ON "user_identities" FROM vetta_tenant;
REVOKE ALL ON "audit_logs" FROM vetta_tenant;
REVOKE ALL ON "delivery_logs" FROM vetta_tenant;

-- Tenant: cada tenant enxerga apenas a própria linha.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenants";
CREATE POLICY tenant_isolation ON "tenants" TO vetta_tenant USING (id = app_current_tenant()) WITH CHECK (id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "tenants";
CREATE POLICY platform_access ON "tenants" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "tenants";

-- AnamnesisTemplate
ALTER TABLE "anamnesis_templates" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "anamnesis_templates";
CREATE POLICY tenant_isolation ON "anamnesis_templates" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "anamnesis_templates";
CREATE POLICY platform_access ON "anamnesis_templates" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "anamnesis_templates";
CREATE POLICY shared_read ON "anamnesis_templates" FOR SELECT TO vetta_tenant USING (tenant_id IS NULL);

-- AnamnesisResponse
ALTER TABLE "anamnesis_responses" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "anamnesis_responses";
CREATE POLICY tenant_isolation ON "anamnesis_responses" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "anamnesis_responses";
CREATE POLICY platform_access ON "anamnesis_responses" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "anamnesis_responses";

-- PhysicalAssessment
ALTER TABLE "physical_assessments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "physical_assessments";
CREATE POLICY tenant_isolation ON "physical_assessments" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "physical_assessments";
CREATE POLICY platform_access ON "physical_assessments" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "physical_assessments";

-- PostureAssessment
ALTER TABLE "posture_assessments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "posture_assessments";
CREATE POLICY tenant_isolation ON "posture_assessments" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "posture_assessments";
CREATE POLICY platform_access ON "posture_assessments" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "posture_assessments";

-- PosturePhoto
ALTER TABLE "posture_photos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "posture_photos";
CREATE POLICY tenant_isolation ON "posture_photos" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "posture_photos";
CREATE POLICY platform_access ON "posture_photos" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "posture_photos";

-- ProgressPhoto
ALTER TABLE "progress_photos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "progress_photos";
CREATE POLICY tenant_isolation ON "progress_photos" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "progress_photos";
CREATE POLICY platform_access ON "progress_photos" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "progress_photos";

-- BodyMeasurement
ALTER TABLE "body_measurements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "body_measurements";
CREATE POLICY tenant_isolation ON "body_measurements" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "body_measurements";
CREATE POLICY platform_access ON "body_measurements" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "body_measurements";

-- TenantBrand
ALTER TABLE "tenant_brands" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenant_brands";
CREATE POLICY tenant_isolation ON "tenant_brands" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "tenant_brands";
CREATE POLICY platform_access ON "tenant_brands" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "tenant_brands";

-- SalesPage
ALTER TABLE "sales_pages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "sales_pages";
CREATE POLICY tenant_isolation ON "sales_pages" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "sales_pages";
CREATE POLICY platform_access ON "sales_pages" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "sales_pages";

-- StudentDocument
ALTER TABLE "student_documents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_documents";
CREATE POLICY tenant_isolation ON "student_documents" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "student_documents";
CREATE POLICY platform_access ON "student_documents" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "student_documents";

-- Conversation
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "conversations";
CREATE POLICY tenant_isolation ON "conversations" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "conversations";
CREATE POLICY platform_access ON "conversations" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "conversations";

-- Message
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "messages";
CREATE POLICY tenant_isolation ON "messages" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "messages";
CREATE POLICY platform_access ON "messages" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "messages";

-- Broadcast
ALTER TABLE "broadcasts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "broadcasts";
CREATE POLICY tenant_isolation ON "broadcasts" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "broadcasts";
CREATE POLICY platform_access ON "broadcasts" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "broadcasts";

-- Appointment
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "appointments";
CREATE POLICY tenant_isolation ON "appointments" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "appointments";
CREATE POLICY platform_access ON "appointments" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "appointments";

-- CalendarIntegration
ALTER TABLE "calendar_integrations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "calendar_integrations";
CREATE POLICY tenant_isolation ON "calendar_integrations" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "calendar_integrations";
CREATE POLICY platform_access ON "calendar_integrations" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "calendar_integrations";

-- ConsultingPlan
ALTER TABLE "consulting_plans" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "consulting_plans";
CREATE POLICY tenant_isolation ON "consulting_plans" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "consulting_plans";
CREATE POLICY platform_access ON "consulting_plans" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "consulting_plans";

-- StudentSubscription
ALTER TABLE "student_subscriptions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_subscriptions";
CREATE POLICY tenant_isolation ON "student_subscriptions" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "student_subscriptions";
CREATE POLICY platform_access ON "student_subscriptions" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "student_subscriptions";

-- Invoice
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "invoices";
CREATE POLICY tenant_isolation ON "invoices" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "invoices";
CREATE POLICY platform_access ON "invoices" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "invoices";

-- PaymentAccount
ALTER TABLE "payment_accounts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payment_accounts";
CREATE POLICY tenant_isolation ON "payment_accounts" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "payment_accounts";
CREATE POLICY platform_access ON "payment_accounts" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "payment_accounts";

-- Withdrawal
ALTER TABLE "withdrawals" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "withdrawals";
CREATE POLICY tenant_isolation ON "withdrawals" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "withdrawals";
CREATE POLICY platform_access ON "withdrawals" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "withdrawals";

-- WalletEntry
ALTER TABLE "wallet_entries" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "wallet_entries";
CREATE POLICY tenant_isolation ON "wallet_entries" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "wallet_entries";
CREATE POLICY platform_access ON "wallet_entries" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "wallet_entries";

-- Expense
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "expenses";
CREATE POLICY tenant_isolation ON "expenses" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "expenses";
CREATE POLICY platform_access ON "expenses" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "expenses";

-- TenantMember
ALTER TABLE "tenant_members" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenant_members";
CREATE POLICY tenant_isolation ON "tenant_members" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "tenant_members";
CREATE POLICY platform_access ON "tenant_members" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "tenant_members";

-- StudentLink
ALTER TABLE "student_links" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_links";
CREATE POLICY tenant_isolation ON "student_links" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "student_links";
CREATE POLICY platform_access ON "student_links" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "student_links";

-- ExerciseFolder
ALTER TABLE "exercise_folders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exercise_folders";
CREATE POLICY tenant_isolation ON "exercise_folders" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "exercise_folders";
CREATE POLICY platform_access ON "exercise_folders" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "exercise_folders";

-- Exercise
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exercises";
CREATE POLICY tenant_isolation ON "exercises" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "exercises";
CREATE POLICY platform_access ON "exercises" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "exercises";
CREATE POLICY shared_read ON "exercises" FOR SELECT TO vetta_tenant USING (tenant_id IS NULL);

-- ExerciseFavorite
ALTER TABLE "exercise_favorites" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exercise_favorites";
CREATE POLICY tenant_isolation ON "exercise_favorites" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "exercise_favorites";
CREATE POLICY platform_access ON "exercise_favorites" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "exercise_favorites";

-- Media
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "media";
CREATE POLICY tenant_isolation ON "media" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "media";
CREATE POLICY platform_access ON "media" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "media";
CREATE POLICY shared_read ON "media" FOR SELECT TO vetta_tenant USING (tenant_id IS NULL);

-- TenantStorageUsage
ALTER TABLE "tenant_storage_usage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenant_storage_usage";
CREATE POLICY tenant_isolation ON "tenant_storage_usage" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "tenant_storage_usage";
CREATE POLICY platform_access ON "tenant_storage_usage" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "tenant_storage_usage";

-- TenantSubscription
ALTER TABLE "tenant_subscriptions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenant_subscriptions";
CREATE POLICY tenant_isolation ON "tenant_subscriptions" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "tenant_subscriptions";
CREATE POLICY platform_access ON "tenant_subscriptions" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "tenant_subscriptions";

-- TenantFeatureOverride
ALTER TABLE "tenant_feature_overrides" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenant_feature_overrides";
CREATE POLICY tenant_isolation ON "tenant_feature_overrides" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "tenant_feature_overrides";
CREATE POLICY platform_access ON "tenant_feature_overrides" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "tenant_feature_overrides";

-- PlatformInvoice
ALTER TABLE "platform_invoices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "platform_invoices";
CREATE POLICY tenant_isolation ON "platform_invoices" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "platform_invoices";
CREATE POLICY platform_access ON "platform_invoices" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "platform_invoices";

-- StudentGroup
ALTER TABLE "student_groups" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_groups";
CREATE POLICY tenant_isolation ON "student_groups" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "student_groups";
CREATE POLICY platform_access ON "student_groups" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "student_groups";

-- StudentGroupMember
ALTER TABLE "student_group_members" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_group_members";
CREATE POLICY tenant_isolation ON "student_group_members" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "student_group_members";
CREATE POLICY platform_access ON "student_group_members" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "student_group_members";

-- StudentActivity
ALTER TABLE "student_activities" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_activities";
CREATE POLICY tenant_isolation ON "student_activities" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "student_activities";
CREATE POLICY platform_access ON "student_activities" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "student_activities";

-- WorkoutProgram
ALTER TABLE "workout_programs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "workout_programs";
CREATE POLICY tenant_isolation ON "workout_programs" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "workout_programs";
CREATE POLICY platform_access ON "workout_programs" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "workout_programs";

-- WorkoutRoutine
ALTER TABLE "workout_routines" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "workout_routines";
CREATE POLICY tenant_isolation ON "workout_routines" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "workout_routines";
CREATE POLICY platform_access ON "workout_routines" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "workout_routines";

-- RoutineExercise
ALTER TABLE "routine_exercises" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "routine_exercises";
CREATE POLICY tenant_isolation ON "routine_exercises" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "routine_exercises";
CREATE POLICY platform_access ON "routine_exercises" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "routine_exercises";

-- ExerciseSet
ALTER TABLE "exercise_sets" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "exercise_sets";
CREATE POLICY tenant_isolation ON "exercise_sets" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "exercise_sets";
CREATE POLICY platform_access ON "exercise_sets" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "exercise_sets";

-- Periodization
ALTER TABLE "periodizations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "periodizations";
CREATE POLICY tenant_isolation ON "periodizations" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "periodizations";
CREATE POLICY platform_access ON "periodizations" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "periodizations";

-- PeriodizationPhase
ALTER TABLE "periodization_phases" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "periodization_phases";
CREATE POLICY tenant_isolation ON "periodization_phases" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "periodization_phases";
CREATE POLICY platform_access ON "periodization_phases" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "periodization_phases";

-- WorkoutSession
ALTER TABLE "workout_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "workout_sessions";
CREATE POLICY tenant_isolation ON "workout_sessions" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "workout_sessions";
CREATE POLICY platform_access ON "workout_sessions" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "workout_sessions";

-- SessionSetLog
ALTER TABLE "session_set_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "session_set_logs";
CREATE POLICY tenant_isolation ON "session_set_logs" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "session_set_logs";
CREATE POLICY platform_access ON "session_set_logs" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "session_set_logs";

-- PersonalRecord
ALTER TABLE "personal_records" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "personal_records";
CREATE POLICY tenant_isolation ON "personal_records" TO vetta_tenant USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS platform_access ON "personal_records";
CREATE POLICY platform_access ON "personal_records" TO vetta_platform USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS shared_read ON "personal_records";
