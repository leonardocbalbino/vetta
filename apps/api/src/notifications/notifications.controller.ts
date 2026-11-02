import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  DEFAULT_QUIET_HOURS,
  MANDATORY_CATEGORIES,
  NotificationCategory,
  NotificationChannel,
  type NotificationPreferences,
} from '@vetta/contracts';
import { defaultPreference, toNotificationDto } from '@vetta/server';
import {
  CursorQueryDto,
  NotificationDto,
  NotificationPreferencesDto,
  RegisterDeviceDto,
} from '../common/dto';
import { badRequest, notFound } from '../common/errors';
import { CurrentUser, type UserPrincipal } from '../common/request';
import { PrismaService } from '../infra/prisma.service';

@ApiTags('notifications')
@ApiSecurity('bearer')
@Controller()
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('notifications')
  async list(@CurrentUser() u: UserPrincipal, @Query() q: CursorQueryDto) {
    const items = await this.prisma.system.notification.findMany({
      where: { userId: u.userId, deletedAt: null },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const more = items.length > q.limit;
    return {
      items: items.slice(0, q.limit).map(toNotificationDto),
      nextCursor: more ? items[q.limit - 1]!.id : null,
    };
  }

  @Get('notifications/unread-count')
  async unread(@CurrentUser() u: UserPrincipal) {
    return {
      count: await this.prisma.system.notification.count({
        where: { userId: u.userId, readAt: null, deletedAt: null },
      }),
    };
  }

  @Patch('notifications/:id/read')
  @ApiOkResponse({ type: NotificationDto })
  async read(@CurrentUser() u: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const n = await this.prisma.system.notification.findFirst({ where: { id, userId: u.userId } });
    if (!n) throw notFound('Notificação não encontrada.');
    const updated = n.readAt
      ? n
      : await this.prisma.system.notification.update({
          where: { id },
          data: { readAt: new Date() },
        });
    // Comunicado da plataforma lido = aberto (métrica de abertura no admin).
    const broadcastId = (n.data as { broadcastId?: unknown } | null)?.broadcastId;
    if (n.event === 'platform.broadcast' && typeof broadcastId === 'string') {
      await this.prisma.system.platformBroadcastRecipient.updateMany({
        where: { broadcastId, userId: u.userId, openedAt: null },
        data: { openedAt: new Date() },
      });
    }
    return toNotificationDto(updated);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() u: UserPrincipal) {
    const r = await this.prisma.system.notification.updateMany({
      where: { userId: u.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true as const, updated: r.count };
  }

  @Get('notifications/preferences')
  @ApiOkResponse({ type: NotificationPreferencesDto })
  async preferences(@CurrentUser() u: UserPrincipal): Promise<NotificationPreferences> {
    const user = await this.prisma.system.user.findUniqueOrThrow({
      where: { id: u.userId },
      include: { notificationPreferences: true },
    });
    const saved = new Map(
      user.notificationPreferences.map((p) => [`${p.category}:${p.channel}`, p.enabled]),
    );
    return {
      items: NotificationCategory.flatMap((category) =>
        NotificationChannel.filter((c) => c !== 'SMS').map((channel) => ({
          category,
          channel,
          enabled: MANDATORY_CATEGORIES.includes(category)
            ? true
            : (saved.get(`${category}:${channel}`) ?? defaultPreference(category, channel)),
        })),
      ),
      quietHours: user
        ? { enabled: user.quietHoursEnabled, start: user.quietHoursStart, end: user.quietHoursEnd }
        : DEFAULT_QUIET_HOURS,
    };
  }

  @Put('notifications/preferences')
  async updatePreferences(
    @CurrentUser() u: UserPrincipal,
    @Body() dto: NotificationPreferencesDto,
  ) {
    for (const item of dto.items) {
      if (MANDATORY_CATEGORIES.includes(item.category) && !item.enabled) {
        throw badRequest('Avisos de segurança não podem ser desligados.');
      }
    }
    await this.prisma.system.$transaction([
      ...dto.items.map((i) =>
        this.prisma.system.notificationPreference.upsert({
          where: {
            userId_category_channel: { userId: u.userId, category: i.category, channel: i.channel },
          },
          create: {
            userId: u.userId,
            category: i.category,
            channel: i.channel,
            enabled: i.enabled,
          },
          update: { enabled: i.enabled },
        }),
      ),
      this.prisma.system.user.update({
        where: { id: u.userId },
        data: {
          quietHoursEnabled: dto.quietHours.enabled,
          quietHoursStart: dto.quietHours.start,
          quietHoursEnd: dto.quietHours.end,
        },
      }),
    ]);
    return this.preferences(u);
  }

  /** Registra o token de push do dispositivo (Expo). Um token pertence a um único usuário. */
  @Post('devices')
  async registerDevice(@CurrentUser() u: UserPrincipal, @Body() dto: RegisterDeviceDto) {
    const d = await this.prisma.system.device.upsert({
      where: { pushToken: dto.pushToken },
      create: {
        userId: u.userId,
        pushToken: dto.pushToken,
        platform: dto.platform,
        name: dto.name ?? null,
        appVersion: dto.appVersion ?? null,
      },
      update: {
        userId: u.userId,
        platform: dto.platform,
        name: dto.name ?? null,
        appVersion: dto.appVersion ?? null,
        disabledAt: null,
        lastSeenAt: new Date(),
      },
    });
    return { id: d.id, platform: d.platform, name: d.name, createdAt: d.createdAt.toISOString() };
  }

  @Delete('devices/:id')
  async removeDevice(@CurrentUser() u: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.system.device.deleteMany({ where: { id, userId: u.userId } });
    if (!r.count) throw notFound('Dispositivo não encontrado.');
    return { ok: true as const };
  }
}
