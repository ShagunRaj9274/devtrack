import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE, NotificationEvent } from './notification-events';

@Injectable()
export class NotificationsQueue {
  private readonly logger = new Logger(NotificationsQueue.name);

  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue<NotificationEvent>) {}

  /**
   * Fire-and-forget from the caller's point of view: the primary change is
   * already committed, so a Redis hiccup is logged rather than failing the request.
   */
  async enqueue(event: NotificationEvent): Promise<void> {
    try {
      await this.queue.add(event.kind, event, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 500,
      });
    } catch (err) {
      this.logger.error(`Failed to enqueue ${event.kind}: ${(err as Error).message}`);
    }
  }
}
