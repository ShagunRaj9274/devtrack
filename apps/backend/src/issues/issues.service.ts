import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, IssueStatus, Prisma, Role } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { policy } from '../access/policy';
import { projectAnalyticsKey } from '../analytics/analytics-cache';
import { AuthUser } from '../common/types';
import { Paginated, skipTake } from '../common/utils/paginated';
import { NotificationsQueue } from '../notifications/notifications.queue';
import { PrismaService } from '../prisma/prisma.service';
import { WsEvents } from '../realtime/events';
import { RealtimeService } from '../realtime/realtime.service';
import { RedisService } from '../redis/redis.service';
import { userSummarySelect } from '../users/user.select';
import { CreateIssueDto } from './dto/create-issue.dto';
import { IssueFiltersDto, ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';

export const issueInclude = {
  assignee: { select: userSummarySelect },
  reporter: { select: userSummarySelect },
  labels: { select: { label: true } },
  project: { select: { key: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.IssueInclude;

type IssueRow = Prisma.IssueGetPayload<{ include: typeof issueInclude }>;

/** API shape: adds the human-readable key (WEB-12) and flattens labels. */
export function toIssueDto(issue: IssueRow) {
  const { project, labels, _count, ...rest } = issue;
  return {
    ...rest,
    key: `${project.key}-${issue.number}`,
    labels: labels.map((l) => l.label),
    commentCount: _count.comments,
  };
}
export type IssueDto = ReturnType<typeof toIssueDto>;

export const BOARD_COLUMN_LIMIT = 100;
const STATUSES: IssueStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

interface Change {
  field: string;
  activity: ActivityType;
  meta: Prisma.InputJsonValue;
}

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsQueue,
    private readonly redis: RedisService,
  ) {}

  // ---------- queries ----------

  async list(
    user: AuthUser,
    projectId: string,
    query: ListIssuesQueryDto,
  ): Promise<Paginated<IssueDto>> {
    await this.access.requireProject(user, projectId);
    const where: Prisma.IssueWhereInput = {
      ...this.buildWhere(user, projectId, query),
      ...(query.status?.length ? { status: { in: query.status } } : {}),
    };
    const direction = query.sortOrder;
    const primary: Prisma.IssueOrderByWithRelationInput =
      query.sortBy === 'dueDate'
        ? { dueDate: { sort: direction, nulls: 'last' } }
        : { [query.sortBy]: direction };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.issue.findMany({
        where,
        include: issueInclude,
        // Secondary key keeps pagination stable when many rows share a value.
        orderBy: [primary, { number: 'desc' }],
        ...skipTake(query.page, query.limit),
      }),
      this.prisma.issue.count({ where }),
    ]);
    return new Paginated(rows.map(toIssueDto), total, query.page, query.limit);
  }

  /** Kanban columns. Each column returns up to BOARD_COLUMN_LIMIT issues plus its true total. */
  async board(user: AuthUser, projectId: string, filters: IssueFiltersDto) {
    await this.access.requireProject(user, projectId);
    const base = this.buildWhere(user, projectId, filters);
    const [columns, counts] = await Promise.all([
      Promise.all(
        STATUSES.map((status) =>
          this.prisma.issue.findMany({
            where: { ...base, status },
            include: issueInclude,
            orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
            take: BOARD_COLUMN_LIMIT,
          }),
        ),
      ),
      this.prisma.issue.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    const countByStatus = new Map(counts.map((c) => [c.status, c._count._all]));
    return STATUSES.map((status, i) => ({
      status,
      total: countByStatus.get(status) ?? 0,
      issues: columns[i].map(toIssueDto),
    }));
  }

  async get(user: AuthUser, issueId: string) {
    const issue = await this.findOrThrow(issueId);
    const { isMember } = await this.access.requireProject(user, issue.projectId);
    return {
      ...toIssueDto(issue),
      permissions: {
        canEdit: policy.canEditIssue(user, isMember, issue),
        canAssignOthers: policy.canAssignAnyone(user, isMember),
        canSelfAssign: policy.canAssignIssue(user, isMember, issue, user.id),
        canDelete: policy.canDeleteIssue(user, isMember),
        canComment: policy.canComment(user, isMember),
      },
    };
  }

  async activity(user: AuthUser, issueId: string) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { projectId: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');
    await this.access.requireProject(user, issue.projectId);
    return this.prisma.activity.findMany({
      where: { issueId },
      include: { actor: { select: userSummarySelect } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---------- commands ----------

  async create(user: AuthUser, projectId: string, dto: CreateIssueDto): Promise<IssueDto> {
    const { isMember } = await this.access.requireProject(user, projectId);
    this.access.assert(
      policy.canCreateIssue(user, isMember),
      'You cannot create issues in this project',
    );

    const assigneeId = dto.assigneeId ?? null;
    this.access.assert(
      policy.canSetInitialAssignee(user, assigneeId),
      'Developers can only assign new issues to themselves',
    );
    if (assigneeId) await this.assertAssignable(projectId, assigneeId);
    const labelIds = dto.labelIds ?? [];
    await this.assertLabelsBelong(projectId, labelIds);

    const issue = await this.prisma.$transaction(async (tx) => {
      // Atomic counter per project gives gap-free, human-friendly numbers (WEB-1, WEB-2...).
      const { issueCounter } = await tx.project.update({
        where: { id: projectId },
        data: { issueCounter: { increment: 1 } },
        select: { issueCounter: true },
      });
      const created = await tx.issue.create({
        data: {
          projectId,
          number: issueCounter,
          title: dto.title,
          description: dto.description,
          type: dto.type,
          status: dto.status,
          priority: dto.priority,
          assigneeId,
          reporterId: user.id,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          labels: { create: labelIds.map((labelId) => ({ labelId })) },
        },
        include: issueInclude,
      });
      await tx.activity.create({
        data: {
          issueId: created.id,
          projectId,
          actorId: user.id,
          type: ActivityType.ISSUE_CREATED,
        },
      });
      return created;
    });

    const dto_ = toIssueDto(issue);
    await this.afterWrite(projectId);
    this.realtime.emitToProject(projectId, WsEvents.IssueCreated, {
      issue: dto_,
      actorId: user.id,
    });
    if (assigneeId) {
      await this.notifications.enqueue({
        kind: 'issue.assigned',
        actorId: user.id,
        issueId: issue.id,
        assigneeId,
      });
    }
    return dto_;
  }

  async update(user: AuthUser, issueId: string, dto: UpdateIssueDto): Promise<IssueDto> {
    const current = await this.findOrThrow(issueId);
    const { isMember } = await this.access.requireProject(user, current.projectId);
    const { changes, data, labelIds, newAssigneeId } = await this.diff(current, dto);

    if (!changes.length) return toIssueDto(current);

    const assigneeChanged = newAssigneeId !== undefined;
    const otherChanges = changes.filter((c) => c.field !== 'assignee');
    if (assigneeChanged) {
      this.access.assert(
        policy.canAssignIssue(user, isMember, current, newAssigneeId),
        user.role === Role.DEVELOPER
          ? 'Developers can only assign unassigned issues to themselves'
          : 'You cannot change the assignee of this issue',
      );
    }
    if (otherChanges.length) {
      this.access.assert(
        policy.canEditIssue(user, isMember, current),
        user.role === Role.VIEWER
          ? 'Viewers cannot modify issues'
          : 'You can only edit issues assigned to or reported by you',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (labelIds) {
        await tx.issueLabel.deleteMany({ where: { issueId } });
        if (labelIds.length) {
          await tx.issueLabel.createMany({
            data: labelIds.map((labelId) => ({ issueId, labelId })),
          });
        }
      }
      const row = await tx.issue.update({ where: { id: issueId }, data, include: issueInclude });
      await tx.activity.createMany({
        data: changes.map((c) => ({
          issueId,
          projectId: current.projectId,
          actorId: user.id,
          type: c.activity,
          meta: c.meta,
        })),
      });
      return row;
    });

    const result = toIssueDto(updated);
    await this.afterWrite(current.projectId);
    this.realtime.emitToProject(current.projectId, WsEvents.IssueUpdated, {
      issue: result,
      changes: changes.map((c) => c.field),
      actorId: user.id,
    });

    if (newAssigneeId) {
      await this.notifications.enqueue({
        kind: 'issue.assigned',
        actorId: user.id,
        issueId,
        assigneeId: newAssigneeId,
      });
    }
    // A freshly assigned person already gets the "assigned" notification.
    if (otherChanges.length && !newAssigneeId) {
      await this.notifications.enqueue({
        kind: 'issue.updated',
        actorId: user.id,
        issueId,
        changes: otherChanges.map((c) => c.field),
      });
    }
    return result;
  }

  async remove(user: AuthUser, issueId: string): Promise<void> {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { projectId: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');
    const { isMember } = await this.access.requireProject(user, issue.projectId);
    this.access.assert(
      policy.canDeleteIssue(user, isMember),
      'Only admins and project managers can delete issues',
    );
    await this.prisma.issue.delete({ where: { id: issueId } });
    await this.afterWrite(issue.projectId);
    this.realtime.emitToProject(issue.projectId, WsEvents.IssueDeleted, {
      issueId,
      actorId: user.id,
    });
  }

  // ---------- helpers ----------

  private buildWhere(
    user: AuthUser,
    projectId: string,
    f: IssueFiltersDto,
  ): Prisma.IssueWhereInput {
    const where: Prisma.IssueWhereInput = { projectId };
    if (f.priority?.length) where.priority = { in: f.priority };
    if (f.type?.length) where.type = { in: f.type };
    if (f.assigneeId === 'unassigned') where.assigneeId = null;
    else if (f.assigneeId === 'me') where.assigneeId = user.id;
    else if (f.assigneeId) where.assigneeId = f.assigneeId;
    if (f.labelId) where.labels = { some: { labelId: f.labelId } };
    if (f.search) {
      const or: Prisma.IssueWhereInput[] = [
        { title: { contains: f.search, mode: 'insensitive' } },
        { description: { contains: f.search, mode: 'insensitive' } },
      ];
      // "WEB-12" or "12" jumps straight to the issue number.
      const numberMatch = /^(?:[a-z][a-z0-9]*-)?(\d{1,9})$/i.exec(f.search);
      if (numberMatch) or.push({ number: Number(numberMatch[1]) });
      where.OR = or;
    }
    return where;
  }

  /** Compares the request with the stored issue and returns only what actually changed. */
  private async diff(current: IssueRow, dto: UpdateIssueDto) {
    const changes: Change[] = [];
    const data: Prisma.IssueUncheckedUpdateInput = {};
    let labelIds: string[] | undefined;
    let newAssigneeId: string | null | undefined;

    const simple = [
      ['title', ActivityType.TITLE_CHANGED],
      ['status', ActivityType.STATUS_CHANGED],
      ['priority', ActivityType.PRIORITY_CHANGED],
      ['type', ActivityType.TYPE_CHANGED],
    ] as const;
    for (const [field, activity] of simple) {
      const next = dto[field];
      if (next !== undefined && next !== current[field]) {
        changes.push({ field, activity, meta: { from: current[field], to: next } });
        data[field] = next;
      }
    }

    if (dto.description !== undefined && (dto.description ?? null) !== current.description) {
      changes.push({ field: 'description', activity: ActivityType.DESCRIPTION_CHANGED, meta: {} });
      data.description = dto.description;
    }

    if (dto.dueDate !== undefined) {
      const next = dto.dueDate ? new Date(dto.dueDate) : null;
      if ((next?.getTime() ?? null) !== (current.dueDate?.getTime() ?? null)) {
        changes.push({
          field: 'dueDate',
          activity: ActivityType.DUE_DATE_CHANGED,
          meta: { from: current.dueDate?.toISOString() ?? null, to: next?.toISOString() ?? null },
        });
        data.dueDate = next;
      }
    }

    if (dto.assigneeId !== undefined && (dto.assigneeId ?? null) !== current.assigneeId) {
      newAssigneeId = dto.assigneeId ?? null;
      let to: { id: string; name: string } | null = null;
      if (newAssigneeId) {
        const assignee = await this.assertAssignable(current.projectId, newAssigneeId);
        to = { id: assignee.id, name: assignee.name };
      }
      changes.push({
        field: 'assignee',
        activity: ActivityType.ASSIGNEE_CHANGED,
        meta: {
          from: current.assignee ? { id: current.assignee.id, name: current.assignee.name } : null,
          to,
        },
      });
      data.assigneeId = newAssigneeId;
    }

    if (dto.labelIds !== undefined) {
      const before = new Set(current.labels.map((l) => l.label.id));
      const after = new Set(dto.labelIds);
      const added = [...after].filter((id) => !before.has(id));
      const removed = current.labels.filter((l) => !after.has(l.label.id)).map((l) => l.label.name);
      if (added.length || removed.length) {
        const addedLabels = await this.assertLabelsBelong(current.projectId, added);
        labelIds = [...after];
        changes.push({
          field: 'labels',
          activity: ActivityType.LABELS_CHANGED,
          meta: { added: addedLabels.map((l) => l.name), removed },
        });
      }
    }

    return { changes, data, labelIds, newAssigneeId };
  }

  private async findOrThrow(issueId: string): Promise<IssueRow> {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      include: issueInclude,
    });
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  private async assertAssignable(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { user: { select: { id: true, name: true, isActive: true } } },
    });
    if (!member || !member.user.isActive) {
      throw new BadRequestException('Assignee must be an active member of this project');
    }
    return member.user;
  }

  private async assertLabelsBelong(projectId: string, labelIds: string[]) {
    if (!labelIds.length) return [];
    const labels = await this.prisma.label.findMany({ where: { id: { in: labelIds }, projectId } });
    if (labels.length !== labelIds.length) {
      throw new BadRequestException('One or more labels do not belong to this project');
    }
    return labels;
  }

  private async afterWrite(projectId: string): Promise<void> {
    await Promise.all([
      this.redis.del(projectAnalyticsKey(projectId)),
      // Keeps "recently updated" project ordering meaningful.
      this.prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } }),
    ]);
  }
}
