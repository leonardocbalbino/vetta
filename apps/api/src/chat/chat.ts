import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  BroadcastInputSchema,
  MessagesQuerySchema,
  SendMessageSchema,
  type BroadcastInput,
  type SendMessageInput,
} from '@vetta/contracts';
import type { Prisma } from '@vetta/db';
import {
  audienceWhere,
  deliverBroadcast,
  type EventPublisher,
  type StorageProvider,
} from '@vetta/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Can, RequireFeature } from '../access/decorators';
import { badRequest, conflict, notFound } from '../common/errors';
import { signedMediaUrl } from '../common/media';
import {
  CurrentTenant,
  CurrentUser,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { assertStudentInScope, isStaff, studentScope } from '../common/scope';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { EVENTS, STORAGE } from '../infra/infra.module';
import { PrismaService } from '../infra/prisma.service';
import { chatParticipants, NotificationsGateway } from '../notifications/notifications.gateway';

class SendDto extends createZodDto(SendMessageSchema) {}
class MessagesQueryDto extends createZodDto(MessagesQuerySchema) {}
class ConversationsQueryDto extends createZodDto(
  z.object({ q: z.string().trim().max(100).optional() }),
) {}
class BroadcastDto extends createZodDto(BroadcastInputSchema) {}
class AudienceDto extends createZodDto(BroadcastInputSchema.pick({ audience: true })) {}

const MEDIA_TYPES = { AUDIO: 'audio/', IMAGE: 'image/', VIDEO: 'video/' } as const;

type MessageRow = Prisma.MessageGetPayload<object>;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly gateway: NotificationsGateway,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(EVENTS) private readonly events: EventPublisher,
  ) {}

  /** Conversa no escopo do usuário (aluno: só a dele; assistente: alunos atribuídos). */
  private async conversation(t: TenantAccess, id: string) {
    const c = await this.prisma.tenant(t.tenantId).conversation.findFirst({
      where: { id, deletedAt: null, studentLink: studentScope(t) },
      include: { studentLink: { select: { id: true, displayName: true, userId: true } } },
    });
    if (!c) throw notFound('Conversa não encontrada.');
    return c;
  }

  async ensureForStudent(t: TenantAccess, studentLinkId: string) {
    await assertStudentInScope(this.prisma, t, studentLinkId);
    const db = this.prisma.tenant(t.tenantId);
    const existing = await db.conversation.findFirst({ where: { studentLinkId } });
    if (existing) return existing;
    return db.conversation
      .create({ data: { studentLinkId } as never })
      .catch(() => db.conversation.findFirstOrThrow({ where: { studentLinkId } }));
  }

  /** Total de mensagens não lidas do usuário no vínculo (badge do menu e alerta do início). */
  async unread(t: TenantAccess): Promise<{ total: number; conversations: number }> {
    const db = this.prisma.tenant(t.tenantId);
    const staff = isStaff(t);
    const convs = await db.conversation.findMany({
      where: {
        deletedAt: null,
        ...(staff ? { studentLink: studentScope(t) } : { studentLinkId: t.studentLinkId! }),
      },
      select: { id: true, staffLastReadAt: true, studentLastReadAt: true },
      take: 500,
    });
    const counts = await Promise.all(
      convs.map((c) => {
        const lastRead = staff ? c.staffLastReadAt : c.studentLastReadAt;
        return db.message.count({
          where: {
            conversationId: c.id,
            fromStaff: !staff,
            deletedAt: null,
            ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
          },
        });
      }),
    );
    return {
      total: counts.reduce((a, b) => a + b, 0),
      conversations: counts.filter((n) => n > 0).length,
    };
  }

  async list(t: TenantAccess, q?: string) {
    const db = this.prisma.tenant(t.tenantId);
    if (t.role === 'ALUNO') {
      const c = await this.ensureForStudent(t, t.studentLinkId!);
      return [await this.summary(t, c.id)];
    }
    const items = await db.conversation.findMany({
      where: {
        deletedAt: null,
        studentLink: {
          ...studentScope(t),
          ...(q ? { displayName: { contains: q, mode: 'insensitive' } } : {}),
        },
      },
      include: {
        studentLink: { select: { id: true, displayName: true, userId: true, status: true } },
      },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      take: 200,
    });
    return Promise.all(
      items.map(async (c) => ({
        id: c.id,
        studentLink: c.studentLink,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        unread: await db.message.count({
          where: {
            conversationId: c.id,
            fromStaff: false,
            deletedAt: null,
            ...(c.staffLastReadAt ? { createdAt: { gt: c.staffLastReadAt } } : {}),
          },
        }),
      })),
    );
  }

  private async summary(t: TenantAccess, id: string) {
    const c = await this.conversation(t, id);
    const mine = isStaff(t);
    const lastRead = mine ? c.staffLastReadAt : c.studentLastReadAt;
    const unread = await this.prisma.tenant(t.tenantId).message.count({
      where: {
        conversationId: id,
        fromStaff: !mine,
        deletedAt: null,
        ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
      },
    });
    const tenant = await this.prisma
      .tenant(t.tenantId)
      .tenant.findFirstOrThrow({ where: { id: t.tenantId }, select: { name: true } });
    return {
      id: c.id,
      studentLink: { id: c.studentLink.id, displayName: c.studentLink.displayName },
      tenantName: tenant.name,
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview,
      unread,
      otherLastReadAt: mine ? c.studentLastReadAt : c.staffLastReadAt,
    };
  }

  private async view(t: TenantAccess, m: MessageRow, otherLastReadAt: Date | null) {
    let media: {
      url: string;
      thumbnailUrl: string | null;
      mimeType: string;
      durationSeconds: number | null;
    } | null = null;
    if (m.mediaId) {
      const row = await this.prisma.system.media.findUnique({ where: { id: m.mediaId } });
      if (row && row.status !== 'DELETED') {
        const v = (row.variants ?? {}) as Record<string, { key?: string }>;
        media = {
          url: await signedMediaUrl(this.storage, row, m.type === 'IMAGE' ? 'webp' : 'original'),
          thumbnailUrl: v.thumbnail?.key
            ? await signedMediaUrl(this.storage, row, 'thumbnail')
            : null,
          mimeType: row.detectedMimeType ?? row.mimeType,
          durationSeconds: row.durationSeconds,
        };
      }
    }
    const mine = isStaff(t) === m.fromStaff;
    return {
      id: m.id,
      clientId: m.clientId,
      type: m.type,
      body: m.body,
      fromStaff: m.fromStaff,
      mine,
      senderUserId: m.senderUserId,
      quote: m.quote,
      media,
      createdAt: m.createdAt,
      /** Enviado e lido: lido quando o outro lado abriu a conversa depois da mensagem. */
      status: mine ? (otherLastReadAt && otherLastReadAt >= m.createdAt ? 'READ' : 'SENT') : null,
    };
  }

  async messages(t: TenantAccess, id: string, q: z.infer<typeof MessagesQuerySchema>) {
    const c = await this.conversation(t, id);
    const db = this.prisma.tenant(t.tenantId);
    let before: Date | undefined;
    if (q.before) {
      const ref = await db.message.findFirst({ where: { id: q.before, conversationId: id } });
      before = ref?.createdAt;
    }
    const rows = await db.message.findMany({
      where: {
        conversationId: id,
        deletedAt: null,
        ...(before ? { createdAt: { lt: before } } : {}),
        ...(q.q ? { body: { contains: q.q, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: q.limit + 1,
    });
    const more = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    const otherRead = isStaff(t) ? c.studentLastReadAt : c.staffLastReadAt;
    return {
      items: await Promise.all(page.map((m) => this.view(t, m, otherRead))),
      /** Paginação infinita: passe como ?before= para carregar as mais antigas. */
      nextBefore: more ? page[page.length - 1]!.id : null,
    };
  }

  async send(t: TenantAccess, userId: string, conversationId: string, dto: SendMessageInput) {
    const c = await this.conversation(t, conversationId);
    const db = this.prisma.tenant(t.tenantId);
    const dup = await db.message.findFirst({ where: { conversationId, clientId: dto.clientId } });
    if (dup) return this.view(t, dup, null);

    if (dto.type !== 'TEXT') {
      // FREE: chat só texto.
      await this.entitlements.assertFeature(t.tenantId, 'comms.chat_media');
      const media = await this.prisma.system.media.findFirst({
        where: {
          id: dto.mediaId,
          tenantId: t.tenantId,
          purpose: 'chat_media',
          ownerUserId: userId,
          deletedAt: null,
        },
      });
      if (!media || !['UPLOADED', 'PROCESSING', 'READY'].includes(media.status))
        throw badRequest('Envie o arquivo antes.');
      const mime = media.detectedMimeType ?? media.mimeType;
      if (!mime.startsWith(MEDIA_TYPES[dto.type]))
        throw badRequest('Tipo de arquivo não confere com a mensagem.');
    }
    let quote: Prisma.InputJsonValue | undefined;
    if (dto.quote) {
      const s = await db.workoutSession.findFirst({
        where: { id: dto.quote.sessionId, studentLinkId: c.studentLink.id },
        include: { routine: { select: { label: true, name: true } } },
      });
      if (!s) throw badRequest('Treino citado não encontrado.');
      quote = {
        kind: 'workout_session',
        sessionId: s.id,
        title: s.routine
          ? `Treino ${s.routine.label}${s.routine.name ? ` – ${s.routine.name}` : ''}`
          : 'Treino',
        rating: s.rating,
        comment: s.feedback ?? null,
        finishedAt: s.finishedAt?.toISOString() ?? null,
      };
    }
    const fromStaff = isStaff(t);
    const now = new Date();
    const preview =
      dto.type === 'TEXT'
        ? dto.body!.slice(0, 120)
        : { AUDIO: '🎤 Áudio', IMAGE: '📷 Foto', VIDEO: '🎬 Vídeo' }[dto.type];
    const m = await db.message
      .create({
        data: {
          conversationId,
          senderUserId: userId,
          fromStaff,
          type: dto.type,
          body: dto.body?.trim() || null,
          mediaId: dto.mediaId ?? null,
          clientId: dto.clientId,
          ...(quote ? { quote } : {}),
        } as never,
      })
      .catch(async (err) => {
        // Reenvio simultâneo do mesmo clientId (offline/retry).
        const again = await db.message.findFirst({
          where: { conversationId, clientId: dto.clientId },
        });
        if (again) return again;
        throw err;
      });
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: now,
        lastMessagePreview: preview,
        ...(fromStaff ? { staffLastReadAt: now } : { studentLastReadAt: now }),
      },
    });
    const parts = await chatParticipants(this.prisma, conversationId);
    const other = (fromStaff ? parts?.student : parts?.staff) ?? [];
    const view = await this.view(t, m, null);
    this.gateway.emitToUsers(parts?.all ?? [], 'chat:message', {
      conversationId,
      message: { ...view, mine: undefined },
    });
    if (other.length) {
      const sender = await this.prisma.system.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true },
      });
      await this.events.publish('chat.message_created', {
        tenantId: t.tenantId,
        actorId: userId,
        payload: { userIds: other, conversationId, senderName: sender.name, preview },
      });
    }
    return view;
  }

  async read(t: TenantAccess, conversationId: string) {
    await this.conversation(t, conversationId);
    const now = new Date();
    const staff = isStaff(t);
    await this.prisma.tenant(t.tenantId).conversation.update({
      where: { id: conversationId },
      data: staff ? { staffLastReadAt: now } : { studentLastReadAt: now },
    });
    const parts = await chatParticipants(this.prisma, conversationId);
    this.gateway.emitToUsers((staff ? parts?.student : parts?.staff) ?? [], 'chat:read', {
      conversationId,
      readAt: now,
      by: staff ? 'staff' : 'student',
    });
    return { ok: true as const, readAt: now };
  }

  async typing(t: TenantAccess, userId: string, conversationId: string) {
    await this.conversation(t, conversationId);
    const parts = await chatParticipants(this.prisma, conversationId);
    this.gateway.emitToUsers(
      (parts?.all ?? []).filter((u) => u !== userId),
      'chat:typing',
      { conversationId, userId },
    );
    return { ok: true as const };
  }

  async deleteMessage(t: TenantAccess, userId: string, conversationId: string, messageId: string) {
    await this.conversation(t, conversationId);
    const db = this.prisma.tenant(t.tenantId);
    const m = await db.message.findFirst({
      where: { id: messageId, conversationId, senderUserId: userId, deletedAt: null },
    });
    if (!m) throw notFound('Mensagem não encontrada.');
    await db.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    const parts = await chatParticipants(this.prisma, conversationId);
    this.gateway.emitToUsers(parts?.all ?? [], 'chat:deleted', { conversationId, messageId });
    return { ok: true as const };
  }

  // ─── Comunicados ───────────────────────────────────────────────────────────

  async broadcasts(tenantId: string) {
    const items = await this.prisma.tenant(tenantId).broadcast.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return Promise.all(items.map((b) => this.broadcastView(b)));
  }

  private async broadcastView(b: Prisma.BroadcastGetPayload<object>) {
    const opened =
      b.status === 'SENT'
        ? await this.prisma.system.notification.count({
            where: { eventId: `broadcast:${b.id}`, readAt: { not: null } },
          })
        : 0;
    return {
      id: b.id,
      title: b.title,
      body: b.body,
      audience: b.audience,
      channels: b.channels,
      status: b.status,
      scheduledAt: b.scheduledAt,
      sentAt: b.sentAt,
      recipientsCount: b.recipientsCount,
      openedCount: opened,
      openRate: b.recipientsCount ? Math.round((opened / b.recipientsCount) * 1000) / 10 : 0,
      createdAt: b.createdAt,
    };
  }

  /** Quantos alunos recebem (prévia antes de enviar). */
  async audienceCount(tenantId: string, audience: BroadcastInput['audience']) {
    return {
      count: await this.prisma
        .tenant(tenantId)
        .studentLink.count({ where: audienceWhere(tenantId, audience) }),
    };
  }

  async createBroadcast(t: TenantAccess, userId: string, dto: BroadcastInput) {
    const db = this.prisma.tenant(t.tenantId);
    const scheduled = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (scheduled && scheduled.getTime() < Date.now() - 60_000)
      throw badRequest('Agende para uma data futura.');
    const b = await db.broadcast.create({
      data: {
        createdByUserId: userId,
        title: dto.title,
        body: dto.body,
        audience: dto.audience,
        channels: dto.channels,
        status: scheduled ? 'SCHEDULED' : 'DRAFT',
        scheduledAt: scheduled,
      } as never,
    });
    if (!scheduled)
      await deliverBroadcast({ db: this.prisma.system, publisher: this.events }, b.id);
    return this.broadcastView(await db.broadcast.findFirstOrThrow({ where: { id: b.id } }));
  }

  async getBroadcast(tenantId: string, id: string) {
    const b = await this.prisma
      .tenant(tenantId)
      .broadcast.findFirst({ where: { id, deletedAt: null } });
    if (!b) throw notFound('Comunicado não encontrado.');
    return this.broadcastView(b);
  }

  async cancelBroadcast(tenantId: string, id: string) {
    const db = this.prisma.tenant(tenantId);
    const b = await db.broadcast.findFirst({ where: { id, deletedAt: null } });
    if (!b) throw notFound('Comunicado não encontrado.');
    if (b.status !== 'SCHEDULED') throw conflict('Só é possível cancelar comunicados agendados.');
    await db.broadcast.update({ where: { id }, data: { status: 'CANCELED' } });
    return this.getBroadcast(tenantId, id);
  }
}

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('unread')
  @Can('read', 'chat')
  @RequireFeature('comms.chat')
  unread(@CurrentTenant() t: TenantAccess) {
    return this.chat.unread(t);
  }

  @Get('conversations')
  @Can('read', 'chat')
  @RequireFeature('comms.chat')
  list(@CurrentTenant() t: TenantAccess, @Query() q: ConversationsQueryDto) {
    return this.chat.list(t, q.q);
  }

  @Post('students/:studentLinkId')
  @HttpCode(200)
  @Can('create', 'chat')
  @RequireFeature('comms.chat')
  open(@CurrentTenant() t: TenantAccess, @Param('studentLinkId', ParseUUIDPipe) id: string) {
    return this.chat.ensureForStudent(t, id);
  }

  @Get('conversations/:id/messages')
  @Can('read', 'chat')
  @RequireFeature('comms.chat')
  messages(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: MessagesQueryDto,
  ) {
    return this.chat.messages(t, id, q);
  }

  @Post('conversations/:id/messages')
  @Can('create', 'chat')
  @RequireFeature('comms.chat')
  send(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendDto,
  ) {
    return this.chat.send(t, u.userId, id, dto);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  @Can('update', 'chat')
  @RequireFeature('comms.chat')
  read(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.read(t, id);
  }

  @Post('conversations/:id/typing')
  @HttpCode(200)
  @Can('update', 'chat')
  @RequireFeature('comms.chat')
  typing(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.typing(t, u.userId, id);
  }

  @Delete('conversations/:id/messages/:messageId')
  @Can('delete', 'chat')
  @RequireFeature('comms.chat')
  remove(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.chat.deleteMessage(t, u.userId, id, messageId);
  }
}

@ApiTags('broadcasts')
@Controller('broadcasts')
export class BroadcastsController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @Can('read', 'broadcasts')
  @RequireFeature('comms.broadcast')
  list(@CurrentTenant() t: TenantAccess) {
    return this.chat.broadcasts(t.tenantId);
  }

  @Post('audience')
  @HttpCode(200)
  @Can('read', 'broadcasts')
  @RequireFeature('comms.broadcast')
  audience(@CurrentTenant() t: TenantAccess, @Body() dto: AudienceDto) {
    return this.chat.audienceCount(t.tenantId, dto.audience);
  }

  @Post()
  @Can('create', 'broadcasts')
  @RequireFeature('comms.broadcast')
  create(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Body() dto: BroadcastDto,
  ) {
    return this.chat.createBroadcast(t, u.userId, dto);
  }

  @Get(':id')
  @Can('read', 'broadcasts')
  @RequireFeature('comms.broadcast')
  get(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.getBroadcast(t.tenantId, id);
  }

  @Patch(':id/cancel')
  @Can('update', 'broadcasts')
  @RequireFeature('comms.broadcast')
  cancel(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.cancelBroadcast(t.tenantId, id);
  }
}
