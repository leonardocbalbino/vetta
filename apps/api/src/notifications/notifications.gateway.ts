import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokensService } from '../auth/tokens.service';
import { PrismaService } from '../infra/prisma.service';

export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Tempo real: o cliente conecta com { auth: { token } } e entra na sala do usuário.
 * O worker emite "notification" nessa sala via Redis (adapter/emitter); o chat emite
 * "chat:message", "chat:read" e "chat:typing".
 */
@WebSocketGateway({ path: '/ws' })
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger('NotificationsGateway');
  @WebSocketServer() server?: Server;

  constructor(
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const raw =
        (client.handshake.auth as { token?: string } | undefined)?.token ??
        client.handshake.headers.authorization?.replace(/^Bearer /, '');
      if (!raw) throw new Error('sem token');
      const claims = await this.tokens.verifyAccess(raw);
      if (claims.typ !== 'user') throw new Error('admin');
      (client.data as { userId?: string }).userId = claims.sub;
      await client.join(userRoom(claims.sub));
      client.emit('ready', { userId: claims.sub });
    } catch (err) {
      this.logger.debug(`conexão recusada: ${(err as Error).message}`);
      client.emit('unauthorized');
      client.disconnect(true);
    }
  }

  /** Emite para as salas dos usuários (funciona entre instâncias pelo adapter Redis). */
  emitToUsers(userIds: readonly string[], event: string, data: unknown) {
    if (!this.server || !userIds.length) return;
    this.server.to(userIds.map(userRoom)).emit(event, data);
  }

  /** "Digitando…": repassa ao outro lado da conversa, se o usuário participa dela. */
  @SubscribeMessage('chat:typing')
  async typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId || typeof body?.conversationId !== 'string') return;
    const others = await chatParticipants(this.prisma, body.conversationId);
    if (!others || !others.all.includes(userId)) return;
    this.emitToUsers(
      others.all.filter((u) => u !== userId),
      'chat:typing',
      { conversationId: body.conversationId, userId },
    );
  }
}

/** Participantes de uma conversa: aluno + dono + assistente responsável. */
export async function chatParticipants(prisma: PrismaService, conversationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return null;
  const c = await prisma.system.conversation.findUnique({
    where: { id: conversationId },
    include: {
      studentLink: { include: { assistant: { select: { userId: true } } } },
      tenant: { select: { ownerUserId: true } },
    },
  });
  if (!c) return null;
  const staff = [c.tenant.ownerUserId, c.studentLink.assistant?.userId].filter(
    (x): x is string => !!x,
  );
  const student = c.studentLink.userId ? [c.studentLink.userId] : [];
  return { staff, student, all: [...staff, ...student] };
}
