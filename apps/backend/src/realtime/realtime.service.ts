import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { projectRoom, userRoom } from './events';

/**
 * The only way the rest of the app pushes real-time events. Services call this
 * after a change has been committed to PostgreSQL, so clients never see state the
 * database doesn't have. With the Redis adapter, emits reach clients connected
 * to any API instance.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: Server;

  attach(server: Server): void {
    this.server = server;
  }

  emitToProject(projectId: string, event: string, payload: unknown): void {
    if (!this.server) return this.logger.debug(`Socket server not ready, dropped ${event}`);
    this.server.to(projectRoom(projectId)).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return this.logger.debug(`Socket server not ready, dropped ${event}`);
    this.server.to(userRoom(userId)).emit(event, payload);
  }
}
