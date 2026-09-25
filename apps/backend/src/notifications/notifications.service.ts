import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { Paginated, skipTake } from '../common/utils/paginated';
import { PrismaService } from '../prisma/prisma.service';
import { WsEvents } from '../realtime/events';
import { RealtimeService } from '../realtime/realtime.service';
import { userSummarySelect } from '../users/user.select';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { extractMentions } from './mentions';
import { NotificationEvent } from './notification-events';

type Draft = Omit<Prisma.NotificationCreateManyInput, 'id' | 'createdAt' | 'readAt'>;

const notificationInclude = {
  actor: { select: userSummarySelect },
} satisfies Prisma.NotificationInclude;

const FIELD_LABELS: Record<string, string> = {
  status: 'status',
  priority: 'priority',
  title: 'title',
  description: 'description',
  type: 'type',
  dueDate: 'due date',
  labels: 'labels',
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  // ---------- reading ----------

  async list(userId: string, query: ListNotificationsQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      recipientId: userId,
      ...(query.unread ? { readAt: null } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: notificationInclude,
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.limit),
      }),
      this.prisma.notification.count({ where }),
    ]);
    return new Paginated(items, total, query.page, query.limit);
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return {
      count: await this.prisma.notification.count({ where: { recipientId: userId, readAt: null } }),
    };
  }

  async markRead(userId: string, id: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { id, recipientId: userId },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    return this.unreadCount(userId);
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: 0 };
  }

  // ---------- producing (runs in the BullMQ worker) ----------

  /** Turns a domain event into notification rows and pushes them to online users. Returns how many were created. */
  async handleEvent(event: NotificationEvent): Promise<number> {
    const drafts = await this.buildDrafts(event);
    // Never notify people about their own actions.
    const filtered = drafts.filter((d) => d.recipientId !== d.actorId);
    if (!filtered.length) return 0;

    const created = await this.prisma.notification.createManyAndReturn({
      data: filtered,
      include: notificationInclude,
    });
    for (const notification of created) {
      this.realtime.emitToUser(notification.recipientId, WsEvents.NotificationNew, notification);
    }
    return created.length;
  }

  private async buildDrafts(event: NotificationEvent): Promise<Draft[]> {
    switch (event.kind) {
      case 'project.member_added': {
        const [project, actor] = await Promise.all([
          this.prisma.project.findUnique({
            where: { id: event.projectId },
            select: { name: true, key: true },
          }),
          this.actorName(event.actorId),
        ]);
        if (!project) return [];
        return [
          {
            type: NotificationType.PROJECT_ADDED,
            recipientId: event.userId,
            actorId: event.actorId,
            projectId: event.projectId,
            title: `${actor} added you to ${project.name}`,
            body: `You now have access to the ${project.key} project.`,
          },
        ];
      }

      case 'issue.assigned': {
        const issue = await this.loadIssue(event.issueId);
        if (!issue) return [];
        const actor = await this.actorName(event.actorId);
        return [
          {
            type: NotificationType.ISSUE_ASSIGNED,
            recipientId: event.assigneeId,
            actorId: event.actorId,
            issueId: issue.id,
            projectId: issue.projectId,
            title: `${actor} assigned you ${issue.key}`,
            body: issue.title,
          },
        ];
      }

      case 'issue.updated': {
        const issue = await this.loadIssue(event.issueId);
        if (!issue?.assigneeId || !event.changes.length) return [];
        const actor = await this.actorName(event.actorId);
        const fields = event.changes.map((c) => FIELD_LABELS[c] ?? c).join(', ');
        return [
          {
            type: NotificationType.ISSUE_UPDATED,
            recipientId: issue.assigneeId,
            actorId: event.actorId,
            issueId: issue.id,
            projectId: issue.projectId,
            title: `${actor} updated ${issue.key}`,
            body: `Changed ${fields} on "${issue.title}"`,
          },
        ];
      }

      case 'comment.created': {
        const comment = await this.prisma.comment.findUnique({
          where: { id: event.commentId },
          select: { body: true, issueId: true },
        });
        const issue = await this.loadIssue(event.issueId);
        if (!comment || !issue) return [];
        const actor = await this.actorName(event.actorId);

        // Mentions only count for members of the project (or admins), so nobody
        // learns about a project they can't open.
        const usernames = extractMentions(comment.body);
        const mentioned = usernames.length
          ? await this.prisma.user.findMany({
              where: {
                username: { in: usernames },
                isActive: true,
                OR: [{ role: 'ADMIN' }, { memberships: { some: { projectId: issue.projectId } } }],
              },
              select: { id: true },
            })
          : [];
        const mentionedIds = new Set(mentioned.map((u) => u.id));

        // "Involved" = reporter, assignee and anyone who commented before.
        const previousCommenters = await this.prisma.comment.findMany({
          where: { issueId: issue.id },
          distinct: ['authorId'],
          select: { authorId: true },
        });
        const involved = new Set<string>([
          issue.reporterId,
          ...previousCommenters.map((c) => c.authorId),
        ]);
        if (issue.assigneeId) involved.add(issue.assigneeId);

        const preview =
          comment.body.length > 140 ? `${comment.body.slice(0, 137)}...` : comment.body;
        const drafts: Draft[] = [...mentionedIds].map((recipientId) => ({
          type: NotificationType.MENTIONED,
          recipientId,
          actorId: event.actorId,
          issueId: issue.id,
          projectId: issue.projectId,
          title: `${actor} mentioned you on ${issue.key}`,
          body: preview,
        }));
        for (const recipientId of involved) {
          if (mentionedIds.has(recipientId)) continue; // one notification per person
          drafts.push({
            type: NotificationType.COMMENT_ADDED,
            recipientId,
            actorId: event.actorId,
            issueId: issue.id,
            projectId: issue.projectId,
            title: `${actor} commented on ${issue.key}`,
            body: preview,
          });
        }
        return drafts;
      }
    }
  }

  private async loadIssue(issueId: string) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        title: true,
        number: true,
        projectId: true,
        assigneeId: true,
        reporterId: true,
        project: { select: { key: true } },
      },
    });
    return issue ? { ...issue, key: `${issue.project.key}-${issue.number}` } : null;
  }

  private async actorName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name ?? 'Someone';
  }
}
