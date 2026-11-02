import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  decryptSecrets,
  encryptSecrets,
  providerFromRow,
  SMS_PROVIDERS,
  type SmsProviderCode,
} from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AdminOnly } from '../access/decorators';
import { AuditService } from '../audit/audit.service';
import { badRequest, integrationFailed, notFound } from '../common/errors';
import { CurrentAdmin, type AdminPrincipal } from '../common/request';
import { type ApiEnv, ENV } from '../config/env';
import { PrismaService } from '../infra/prisma.service';

const e164 = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use o formato +5511999999999.');
const opt = z.string().trim().max(200).optional();

/** Campo secreto: vazio/ausente mantém o valor salvo. */
const SmsUpdateSchema = z.object({
  enabled: z.boolean(),
  priority: z.number().int().min(1).max(99),
  config: z
    .object({
      deviceId: opt,
      baseUrl: z.url().optional().or(z.literal('')),
      accountSid: opt,
      from: opt,
    })
    .default({}),
  secrets: z.object({ apiKey: opt, authToken: opt }).default({}),
});
class SmsUpdateDto extends createZodDto(SmsUpdateSchema) {}
class SmsTestDto extends createZodDto(z.object({ to: e164 })) {}

/** Campos de cada provedor (o que é configuração e o que é segredo). */
const FIELDS: Record<SmsProviderCode, { config: string[]; secrets: string[] }> = {
  textbee: { config: ['deviceId', 'baseUrl'], secrets: ['apiKey'] },
  twilio: { config: ['accountSid', 'from'], secrets: ['authToken'] },
};

const mask = (v: string | undefined) => (v ? `••••${v.slice(-4)}` : null);

@Injectable()
export class AdminIntegrationsService {
  constructor(
    @Inject(ENV) private readonly env: ApiEnv,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async row(provider: string) {
    if (!(SMS_PROVIDERS as readonly string[]).includes(provider))
      throw notFound('Provedor de SMS não encontrado.');
    return this.prisma.system.platformIntegration.upsert({
      where: { kind_provider: { kind: 'sms', provider } },
      create: { kind: 'sms', provider, priority: provider === 'textbee' ? 1 : 2 },
      update: {},
    });
  }

  /** Lista os provedores com segredos mascarados e se estão prontos para enviar. */
  async listSms() {
    for (const p of SMS_PROVIDERS) await this.row(p);
    const rows = await this.prisma.system.platformIntegration.findMany({
      where: { kind: 'sms' },
      orderBy: { priority: 'asc' },
    });
    return rows.map((r) => {
      const secrets = decryptSecrets(r, this.env.APP_ENCRYPTION_KEY);
      const fields = FIELDS[r.provider as SmsProviderCode];
      return {
        provider: r.provider,
        enabled: r.enabled,
        priority: r.priority,
        config: r.config,
        secrets: Object.fromEntries((fields?.secrets ?? []).map((k) => [k, mask(secrets[k])])),
        ready: !!providerFromRow(r, this.env.APP_ENCRYPTION_KEY),
        lastTestAt: r.lastTestAt,
        lastTestOk: r.lastTestOk,
        lastTestError: r.lastTestError,
      };
    });
  }

  async updateSms(admin: AdminPrincipal, provider: string, dto: SmsUpdateDto) {
    const current = await this.row(provider);
    const fields = FIELDS[provider as SmsProviderCode];
    const config = Object.fromEntries(
      fields.config.map((k) => [k, (dto.config as Record<string, string | undefined>)[k] ?? '']),
    );
    const secrets = decryptSecrets(current, this.env.APP_ENCRYPTION_KEY);
    for (const k of fields.secrets) {
      const v = (dto.secrets as Record<string, string | undefined>)[k];
      if (v) secrets[k] = v;
    }
    const next = {
      provider,
      enabled: dto.enabled,
      priority: dto.priority,
      config,
      secretsEncrypted: Object.keys(secrets).length
        ? encryptSecrets(secrets, this.env.APP_ENCRYPTION_KEY)
        : null,
    };
    if (dto.enabled && !providerFromRow(next, this.env.APP_ENCRYPTION_KEY)) {
      throw badRequest(
        provider === 'textbee'
          ? 'Informe a chave de API do textbee para ativar.'
          : 'Informe Account SID, remetente e Auth Token do Twilio para ativar.',
      );
    }
    await this.prisma.system.platformIntegration.update({
      where: { id: current.id },
      data: {
        enabled: next.enabled,
        priority: next.priority,
        config: next.config,
        secretsEncrypted: next.secretsEncrypted,
        updatedByAdminId: admin.adminId,
      },
    });
    // Sem segredos no log: só o que mudou de configuração.
    await this.audit.log(admin, null, {
      action: 'platform.integration_updated',
      resource: 'platform_integration',
      resourceId: current.id,
      metadata: { kind: 'sms', provider, enabled: dto.enabled, priority: dto.priority, config },
    });
    return (await this.listSms()).find((p) => p.provider === provider);
  }

  /** Envia um SMS de teste por um provedor específico e guarda o resultado. */
  async testSms(provider: string, to: string) {
    const r = await this.row(provider);
    const p = providerFromRow(r, this.env.APP_ENCRYPTION_KEY);
    if (!p) throw badRequest('Configure as credenciais antes de testar.');
    try {
      const res = await p.send({ to, body: 'Vetta: SMS de teste. Se chegou, está tudo certo.' });
      await this.prisma.system.platformIntegration.update({
        where: { id: r.id },
        data: { lastTestAt: new Date(), lastTestOk: true, lastTestError: null },
      });
      return { ok: true, id: res.id };
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 300) : 'falha';
      await this.prisma.system.platformIntegration.update({
        where: { id: r.id },
        data: { lastTestAt: new Date(), lastTestOk: false, lastTestError: message },
      });
      throw integrationFailed(`O ${provider} recusou o envio: ${message}`);
    }
  }
}

@ApiTags('admin')
@Controller('admin/integrations/sms')
export class AdminIntegrationsController {
  constructor(private readonly svc: AdminIntegrationsService) {}

  @Get()
  @AdminOnly('SUPER_ADMIN')
  list() {
    return this.svc.listSms();
  }

  @Put(':provider')
  @AdminOnly('SUPER_ADMIN')
  update(
    @CurrentAdmin() a: AdminPrincipal,
    @Param('provider') provider: string,
    @Body() dto: SmsUpdateDto,
  ) {
    return this.svc.updateSms(a, provider, dto);
  }

  @Post(':provider/test')
  @HttpCode(200)
  @AdminOnly('SUPER_ADMIN')
  test(@Param('provider') provider: string, @Body() dto: SmsTestDto) {
    return this.svc.testSms(provider, dto.to);
  }
}
