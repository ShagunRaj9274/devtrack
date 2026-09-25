import { Injectable } from '@nestjs/common';
import { IssuePriority, IssueStatus, IssueType, Prisma, Role } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { userSummarySelect } from '../users/user.select';
import { ANALYTICS_TTL_SECONDS, projectAnalyticsKey } from './analytics-cache';

const DAY_MS = 24 * 60 * 60 * 1000;
export const TREND_DAYS = 14;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Project dashboard numbers. Computed with a handful of GROUP BY queries and
   * cached in Redis for a minute; any issue write in the project evicts the cache.
   */
  async project(user: AuthUser, projectId: string) {
    await this.access.requireProject(user, projectId);
    const cacheKey = projectAnalyticsKey(projectId);
    const cached = await this.redis.getJson<ProjectAnalytics>(cacheKey);
    if (cached) return { ...cached, cached: true };

    const fresh = await this.computeProject(projectId);
    await this.redis.setJson(cacheKey, fresh, ANALYTICS_TTL_SECONDS);
    return { ...fresh, cached: false };
  }

  async computeProject(projectId: string) {
    const now = new Date();
    const since = new Date(now.getTime() - (TREND_DAYS - 1) * DAY_MS);
    since.setUTCHours(0, 0, 0, 0);
    const where: Prisma.IssueWhereInput = { projectId };

    const [byStatus, byPriority, byType, byAssignee, overdue, created, completed] =
      await Promise.all([
        this.prisma.issue.groupBy({ by: ['status'], where, _count: { _all: true } }),
        this.prisma.issue.groupBy({
          by: ['priority'],
          where: { ...where, status: { not: 'DONE' } },
          _count: { _all: true },
        }),
        this.prisma.issue.groupBy({ by: ['type'], where, _count: { _all: true } }),
        this.prisma.issue.groupBy({ by: ['assigneeId', 'status'], where, _count: { _all: true } }),
        this.prisma.issue.count({
          where: { ...where, status: { not: 'DONE' }, dueDate: { lt: now } },
        }),
        this.prisma.issue.findMany({
          where: { ...where, createdAt: { gte: since } },
          select: { createdAt: true },
        }),
        this.prisma.activity.findMany({
          where: {
            projectId,
            type: 'STATUS_CHANGED',
            createdAt: { gte: since },
            meta: { path: ['to'], equals: 'DONE' },
          },
          select: { createdAt: true },
        }),
      ]);

    const statusCount = (s: IssueStatus) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    const total = byStatus.reduce((sum, r) => sum + r._count._all, 0);

    // Assignee breakdown: total and open per person, including "Unassigned".
    const perAssignee = new Map<string | null, { total: number; open: number }>();
    for (const row of byAssignee) {
      const entry = perAssignee.get(row.assigneeId) ?? { total: 0, open: 0 };
      entry.total += row._count._all;
      if (row.status !== 'DONE') entry.open += row._count._all;
      perAssignee.set(row.assigneeId, entry);
    }
    const ids = [...perAssignee.keys()].filter((id): id is string => id !== null);
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: userSummarySelect })
      : [];
    const assignees = [...perAssignee.entries()]
      .map(([id, counts]) => ({ user: users.find((u) => u.id === id) ?? null, ...counts }))
      .sort((a, b) => b.open - a.open || b.total - a.total);

    // Daily created vs completed for the last TREND_DAYS days.
    const trend = Array.from({ length: TREND_DAYS }, (_, i) => ({
      date: dayKey(new Date(since.getTime() + i * DAY_MS)),
      created: 0,
      completed: 0,
    }));
    const index = new Map(trend.map((t, i) => [t.date, i]));
    for (const c of created) {
      const i = index.get(dayKey(c.createdAt));
      if (i !== undefined) trend[i].created++;
    }
    for (const c of completed) {
      const i = index.get(dayKey(c.createdAt));
      if (i !== undefined) trend[i].completed++;
    }

    return {
      totals: {
        total,
        open: total - statusCount('DONE'),
        todo: statusCount('TODO'),
        inProgress: statusCount('IN_PROGRESS'),
        inReview: statusCount('IN_REVIEW'),
        done: statusCount('DONE'),
        overdue,
      },
      byStatus: Object.values(IssueStatus).map((status) => ({
        status,
        count: statusCount(status),
      })),
      // Priority counts only open issues: that's what needs attention.
      openByPriority: Object.values(IssuePriority).map((priority) => ({
        priority,
        count: byPriority.find((r) => r.priority === priority)?._count._all ?? 0,
      })),
      byType: Object.values(IssueType).map((type) => ({
        type,
        count: byType.find((r) => r.type === type)?._count._all ?? 0,
      })),
      byAssignee: assignees,
      trend,
      generatedAt: now.toISOString(),
    };
  }

  async recentActivity(user: AuthUser, projectId: string, limit: number) {
    await this.access.requireProject(user, projectId);
    const rows = await this.prisma.activity.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: userSummarySelect },
        issue: {
          select: { id: true, number: true, title: true, project: { select: { key: true } } },
        },
      },
    });
    return rows.map(({ issue, ...a }) => ({
      ...a,
      issue: { id: issue.id, title: issue.title, key: `${issue.project.key}-${issue.number}` },
    }));
  }

  /** Personal dashboard: what's on my plate across every project I can see. */
  async me(user: AuthUser) {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * DAY_MS);
    const mine: Prisma.IssueWhereInput = { assigneeId: user.id, status: { not: 'DONE' } };
    const projectScope: Prisma.ProjectWhereInput =
      user.role === Role.ADMIN ? {} : { members: { some: { userId: user.id } } };

    const [byStatus, overdue, dueSoon, focus, projectCount] = await Promise.all([
      this.prisma.issue.groupBy({ by: ['status'], where: mine, _count: { _all: true } }),
      this.prisma.issue.count({ where: { ...mine, dueDate: { lt: now } } }),
      this.prisma.issue.count({ where: { ...mine, dueDate: { gte: now, lte: weekAhead } } }),
      this.prisma.issue.findMany({
        where: mine,
        orderBy: [{ priority: 'desc' }, { dueDate: { sort: 'asc', nulls: 'last' } }],
        take: 8,
        include: { project: { select: { key: true, name: true } } },
      }),
      this.prisma.project.count({ where: projectScope }),
    ]);

    return {
      assignedOpen: byStatus.reduce((s, r) => s + r._count._all, 0),
      byStatus: Object.values(IssueStatus)
        .filter((s) => s !== 'DONE')
        .map((status) => ({
          status,
          count: byStatus.find((r) => r.status === status)?._count._all ?? 0,
        })),
      overdue,
      dueSoon,
      projectCount,
      focus: focus.map(({ project, ...i }) => ({
        ...i,
        key: `${project.key}-${i.number}`,
        projectName: project.name,
      })),
    };
  }
}

export type ProjectAnalytics = Awaited<ReturnType<AnalyticsService['computeProject']>>;
