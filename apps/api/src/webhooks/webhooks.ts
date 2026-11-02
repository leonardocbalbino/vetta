import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Prisma } from '@vetta/db';
import {
  processWebhookEvent,
  WebhookAuthError,
  type BillingDeps,
  type PaymentProvider,
} from '@vetta/server';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../access/decorators';
import { AppException, paymentNotConfigured } from '../common/errors';
import { BILLING, PAYMENTS } from '../infra/infra.module';

/**
 * Webhooks do gateway. Autenticados pelo token (asaas-access-token), gravados em
 * webhook_events (único por id do evento) e processados na hora; falhas ficam
 * FAILED e o worker reprocessa. Responde 200 assim que o evento está gravado,
 * para o gateway não pausar a fila.
 */
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  private readonly log = new Logger('Webhooks');

  constructor(
    @Inject(PAYMENTS) private readonly provider: PaymentProvider | null,
    @Inject(BILLING) private readonly billing: BillingDeps,
  ) {}

  @Post('asaas')
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  async asaas(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    if (!this.provider) throw paymentNotConfigured();
    let event;
    try {
      event = this.provider.parseWebhook(headers, body);
    } catch (err) {
      if (err instanceof WebhookAuthError)
        throw new AppException('WEBHOOK_INVALID', err.message, HttpStatus.UNAUTHORIZED);
      throw err;
    }
    const db = this.billing.db;
    const existing = await db.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'ASAAS', eventId: event.id } },
    });
    if (existing && existing.status !== 'FAILED' && existing.status !== 'RECEIVED')
      return { received: true, duplicate: true };
    const row =
      existing ??
      (await db.webhookEvent
        .create({
          data: {
            provider: 'ASAAS',
            eventId: event.id,
            type: event.type,
            resourceId: event.resourceId,
            payload: body as Prisma.InputJsonValue,
          },
        })
        .catch(async () =>
          // Corrida entre duas entregas do mesmo evento: a outra já gravou.
          db.webhookEvent.findUniqueOrThrow({
            where: { provider_eventId: { provider: 'ASAAS', eventId: event.id } },
          }),
        ));
    try {
      const status = await processWebhookEvent(this.billing, row.id, event);
      return { received: true, status };
    } catch (err) {
      this.log.error({ eventId: event.id, err: (err as Error).message }, 'webhook falhou');
      return { received: true, status: 'FAILED' };
    }
  }
}
