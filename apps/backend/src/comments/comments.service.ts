import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { policy } from '../access/policy';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AuthUser } from '../common/types';
import { Paginated, skipTake } from '../common/utils/paginated';
import { NotificationsQueue } from '../notifications/notifications.queue';
import { PrismaService } from '../prisma/prisma.service';
import { WsEvents } from '../realtime/events';
import { RealtimeService } from '../realtime/realtime.service';
import { userSummarySelect } from '../users/user.select';

const commentInclude = { author: { select: userSummarySelect } } satisfies Prisma.CommentInclude;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsQueue,
  ) {}

  async list(user: AuthUser, issueId: string, query: PaginationQueryDto) {
    const issue = await this.loadIssue(issueId);
    await this.access.requireProject(user, issue.projectId);
    const where = { issueId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        include: commentInclude,
        orderBy: { createdAt: 'asc' },
        ...skipTake(query.page, query.limit),
      }),
      this.prisma.comment.count({ where }),
    ]);
    return new Paginated(items, total, query.page, query.limit);
  }

  async create(user: AuthUser, issueId: string, body: string) {
    const issue = await this.loadIssue(issueId);
    const { isMember } = await this.access.requireProject(user, issue.projectId);
    this.access.assert(policy.canComment(user, isMember), 'You cannot comment in this project');

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { issueId, authorId: user.id, body },
        include: commentInclude,
      });
      await tx.activity.create({
        data: {
          issueId,
          projectId: issue.projectId,
          actorId: user.id,
          type: ActivityType.COMMENT_ADDED,
          meta: { commentId: created.id },
        },
      });
      return created;
    });

    this.realtime.emitToProject(issue.projectId, WsEvents.CommentCreated, {
      issueId,
      comment,
      actorId: user.id,
    });
    await this.notifications.enqueue({
      kind: 'comment.created',
      actorId: user.id,
      issueId,
      commentId: comment.id,
    });
    return comment;
  }

  async update(user: AuthUser, commentId: string, body: string) {
    const existing = await this.loadComment(commentId);
    await this.access.requireProject(user, existing.issue.projectId);
    this.access.assert(
      policy.canEditComment(user, existing),
      'You can only edit your own comments',
    );

    const comment = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body },
      include: commentInclude,
    });
    this.realtime.emitToProject(existing.issue.projectId, WsEvents.CommentUpdated, {
      issueId: existing.issueId,
      comment,
      actorId: user.id,
    });
    return comment;
  }

  async remove(user: AuthUser, commentId: string): Promise<void> {
    const existing = await this.loadComment(commentId);
    const { isMember } = await this.access.requireProject(user, existing.issue.projectId);
    this.access.assert(
      policy.canDeleteComment(user, isMember, existing),
      'You can only delete your own comments',
    );
    await this.prisma.comment.delete({ where: { id: commentId } });
    this.realtime.emitToProject(existing.issue.projectId, WsEvents.CommentDeleted, {
      issueId: existing.issueId,
      commentId,
      actorId: user.id,
    });
  }

  private async loadIssue(issueId: string) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, projectId: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  private async loadComment(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, issueId: true, issue: { select: { projectId: true } } },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }
}
