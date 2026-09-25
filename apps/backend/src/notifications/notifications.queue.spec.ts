import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NotificationEvent } from './notification-events';
import { NotificationsQueue } from './notifications.queue';

const event: NotificationEvent = {
  kind: 'issue.assigned',
  actorId: 'a',
  issueId: 'i',
  assigneeId: 'u',
};

describe('NotificationsQueue', () => {
  it('enqueues with retries and bounded retention', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    await new NotificationsQueue({ add } as unknown as Queue<NotificationEvent>).enqueue(event);
    expect(add).toHaveBeenCalledWith(
      'issue.assigned',
      event,
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
  });

  it('does not fail the caller when Redis is unavailable', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const add = jest.fn().mockRejectedValue(new Error('down'));
    await expect(
      new NotificationsQueue({ add } as unknown as Queue<NotificationEvent>).enqueue(event),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('issue.assigned'));
  });
});
