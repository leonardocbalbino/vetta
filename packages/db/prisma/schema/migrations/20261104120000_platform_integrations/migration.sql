-- Integrações da plataforma configuradas no admin (SMS: textbee e Twilio).
CREATE TABLE "platform_integrations" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets_encrypted" TEXT,
    "last_test_at" TIMESTAMPTZ(3),
    "last_test_ok" BOOLEAN,
    "last_test_error" TEXT,
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_integrations_kind_provider_key" ON "platform_integrations"("kind", "provider");

-- Segredos de integração: inacessíveis ao papel de tenant.
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_integrations" TO vetta_platform;
REVOKE ALL ON "platform_integrations" FROM vetta_tenant;

-- textbee como SMS principal (aguardando a chave no admin) e Twilio de reserva.
INSERT INTO "platform_integrations" ("id", "kind", "provider", "enabled", "priority", "updated_at")
VALUES
  ('01a1a000-0000-7000-8000-000000000001', 'sms', 'textbee', true, 1, CURRENT_TIMESTAMP),
  ('01a1a000-0000-7000-8000-000000000002', 'sms', 'twilio', false, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("kind", "provider") DO NOTHING;
