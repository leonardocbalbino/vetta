import { Logger } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { TokensService } from '../auth/tokens.service';

export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Tempo real do sino: o cliente conecta com { auth: { token } } e entra na sala do usuário.
 * O worker emite "notification" nessa sala via Redis (adapter/emitter).
 */
@WebSocketGateway({ path: '/ws' })
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger('NotificationsGateway');
  constructor(private readonly tokens: TokensService) {}

  async handleConnection(client: Socket) {
    try {
      const raw =
        (client.handshake.auth as { token?: string } | undefined)?.token ??
        client.handshake.headers.authorization?.replace(/^Bearer /, '');
      if (!raw) throw new Error('sem token');
      const claims = await this.tokens.verifyAccess(raw);
      if (claims.typ !== 'user') throw new Error('admin');
      await client.join(userRoom(claims.sub));
      client.emit('ready', { userId: claims.sub });
    } catch (err) {
      this.logger.debug(`conexão recusada: ${(err as Error).message}`);
      client.emit('unauthorized');
      client.disconnect(true);
    }
  }
}
