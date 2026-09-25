import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { NOTIFICATIONS_QUEUE } from './notification-events';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsQueue } from './notifications.queue';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsQueue, NotificationsProcessor],
  exports: [NotificationsQueue, NotificationsService],
})
export class NotificationsModule {}
