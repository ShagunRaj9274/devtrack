import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Role } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { AccessService } from '../access/access.service';
import { AccessTokenPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { projectRoom, userRoom, WsEvents } from './events';
import { RealtimeService } from './realtime.service';

interface SocketUser {
  id: string;
  role: Role;
}

/**
 * Clients authenticate with the same access token as the REST API
 * (`io(url, { auth: { token } })`). Each socket joins its personal room for
 * notifications and explicitly joins project rooms it is allowed to see.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Authentication runs as Socket.IO middleware, i.e. before the connection is
   * accepted. Unauthenticated clients get a `connect_error` and never reach a room,
   * and there is no window where a connected socket has no user attached.
   */
  afterInit(server: Server): void {
    this.realtime.attach(server);
    server.use((socket, next) => {
      this.authenticate(socket)
        .then((user) => {
          socket.data.user = user;
          next();
        })
        .catch((err: Error) => {
          this.logger.debug(`Rejected socket ${socket.id}: ${err.message}`);
          next(new Error('Unauthorized'));
        });
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const user = client.data.user as SocketUser;
    await client.join(userRoom(user.id));
  }

  async authenticate(socket: Socket): Promise<SocketUser> {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) throw new Error('missing token');
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isActive: true },
    });
    if (!user?.isActive) throw new Error('inactive user');
    return { id: user.id, role: user.role };
  }

  @SubscribeMessage(WsEvents.JoinProject)
  async joinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { projectId?: string },
  ) {
    const user = client.data.user as SocketUser | undefined;
    const projectId = body?.projectId;
    if (!user || typeof projectId !== 'string') return { ok: false };
    const allowed = user.role === Role.ADMIN || (await this.access.isMember(projectId, user.id));
    if (!allowed) return { ok: false };
    await client.join(projectRoom(projectId));
    return { ok: true };
  }

  @SubscribeMessage(WsEvents.LeaveProject)
  async leaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { projectId?: string },
  ) {
    if (typeof body?.projectId === 'string') await client.leave(projectRoom(body.projectId));
    return { ok: true };
  }
}
