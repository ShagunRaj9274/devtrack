import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IssueStatus, Prisma, Role } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { policy } from '../access/policy';
import { projectAnalyticsKey } from '../analytics/analytics-cache';
import { AuthUser } from '../common/types';
import { Paginated, skipTake } from '../common/utils/paginated';
import { NotificationsQueue } from '../notifications/notifications.queue';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { userSummarySelect } from '../users/user.select';
import { CreateLabelDto } from './dto/create-label.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const memberSelect = {
  joinedAt: true,
  user: { select: { ...userSummarySelect, email: true, role: true } },
} satisfies Prisma.ProjectMemberSelect;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsQueue,
    private readonly redis: RedisService,
  ) {}

  async list(user: AuthUser, query: ListProjectsQueryDto) {
    const where: Prisma.ProjectWhereInput = {
      ...(user.role === Role.ADMIN ? {} : { members: { some: { userId: user.id } } }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { key: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: userSummarySelect },
          _count: { select: { members: true, issues: true } },
        },
        ...skipTake(query.page, query.limit),
      }),
      this.prisma.project.count({ where }),
    ]);

    // One grouped query for open-issue counts instead of N queries.
    const open = projects.length
      ? await this.prisma.issue.groupBy({
          by: ['projectId'],
          where: {
            projectId: { in: projects.map((p) => p.id) },
            status: { not: IssueStatus.DONE },
          },
          _count: { _all: true },
        })
      : [];
    const openByProject = new Map(open.map((row) => [row.projectId, row._count._all]));
    const items = projects.map(({ _count, ...p }) => ({
      ...p,
      memberCount: _count.members,
      issueCount: _count.issues,
      openIssueCount: openByProject.get(p.id) ?? 0,
    }));
    return new Paginated(items, total, query.page, query.limit);
  }

  async create(user: AuthUser, dto: CreateProjectDto) {
    this.access.assert(
      policy.canCreateProject(user),
      'Only admins and project managers can create projects',
    );
    const exists = await this.prisma.project.findUnique({
      where: { key: dto.key },
      select: { id: true },
    });
    if (exists) throw new ConflictException(`Project key ${dto.key} is already in use`);

    return this.prisma.project.create({
      data: {
        name: dto.name,
        key: dto.key,
        description: dto.description,
        ownerId: user.id,
        members: { create: { userId: user.id } },
      },
      include: { owner: { select: userSummarySelect } },
    });
  }

  async get(user: AuthUser, projectId: string) {
    const { isMember } = await this.access.requireProject(user, projectId);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        owner: { select: userSummarySelect },
        members: { select: memberSelect, orderBy: { joinedAt: 'asc' } },
        labels: { orderBy: { name: 'asc' } },
      },
    });
    return {
      ...project,
      // Lets the UI hide controls the user can't use (the API still enforces them).
      permissions: {
        canManage: policy.canManageProject(user, isMember),
        canDelete: policy.canDeleteProject(user, project.ownerId),
        canCreateIssue: policy.canCreateIssue(user, isMember),
        canDeleteIssues: policy.canDeleteIssue(user, isMember),
        canComment: policy.canComment(user, isMember),
      },
    };
  }

  async update(user: AuthUser, projectId: string, dto: UpdateProjectDto) {
    const { isMember } = await this.access.requireProject(user, projectId);
    this.access.assert(policy.canManageProject(user, isMember), 'You cannot edit this project');
    return this.prisma.project.update({
      where: { id: projectId },
      data: dto,
      include: { owner: { select: userSummarySelect } },
    });
  }

  async remove(user: AuthUser, projectId: string): Promise<void> {
    const { project } = await this.access.requireProject(user, projectId);
    this.access.assert(
      policy.canDeleteProject(user, project.ownerId),
      'Only admins or the project owner can delete a project',
    );
    await this.prisma.project.delete({ where: { id: projectId } });
    await this.redis.del(projectAnalyticsKey(projectId));
  }

  // ---------- members ----------

  async listMembers(user: AuthUser, projectId: string) {
    await this.access.requireProject(user, projectId);
    return this.prisma.projectMember.findMany({
      where: { projectId },
      select: memberSelect,
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addMember(user: AuthUser, projectId: string, userId: string) {
    const { isMember } = await this.access.requireProject(user, projectId);
    this.access.assert(
      policy.canManageProject(user, isMember),
      'You cannot manage members of this project',
    );

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!target || !target.isActive) throw new NotFoundException('User not found');
    if (await this.access.isMember(projectId, userId)) {
      throw new ConflictException('User is already a member of this project');
    }
    const member = await this.prisma.projectMember.create({
      data: { projectId, userId },
      select: memberSelect,
    });
    await this.notifications.enqueue({
      kind: 'project.member_added',
      actorId: user.id,
      projectId,
      userId,
    });
    return member;
  }

  /**
   * Removing a member also un-assigns their issues in this project, so no issue
   * stays assigned to someone who can no longer see it.
   */
  async removeMember(user: AuthUser, projectId: string, userId: string): Promise<void> {
    const { project, isMember } = await this.access.requireProject(user, projectId);
    this.access.assert(
      policy.canManageProject(user, isMember),
      'You cannot manage members of this project',
    );
    if (project.ownerId === userId)
      throw new BadRequestException('The project owner cannot be removed');

    const [, removed] = await this.prisma.$transaction([
      this.prisma.issue.updateMany({
        where: { projectId, assigneeId: userId },
        data: { assigneeId: null },
      }),
      this.prisma.projectMember.deleteMany({ where: { projectId, userId } }),
    ]);
    if (removed.count === 0) throw new NotFoundException('User is not a member of this project');
    await this.redis.del(projectAnalyticsKey(projectId));
  }

  // ---------- labels ----------

  async listLabels(user: AuthUser, projectId: string) {
    await this.access.requireProject(user, projectId);
    return this.prisma.label.findMany({ where: { projectId }, orderBy: { name: 'asc' } });
  }

  async createLabel(user: AuthUser, projectId: string, dto: CreateLabelDto) {
    const { isMember } = await this.access.requireProject(user, projectId);
    this.access.assert(
      policy.canManageLabels(user, isMember),
      'You cannot manage labels in this project',
    );
    return this.prisma.label.create({ data: { projectId, name: dto.name, color: dto.color } });
  }

  async deleteLabel(user: AuthUser, projectId: string, labelId: string): Promise<void> {
    const { isMember } = await this.access.requireProject(user, projectId);
    this.access.assert(
      policy.canManageLabels(user, isMember),
      'You cannot manage labels in this project',
    );
    const { count } = await this.prisma.label.deleteMany({ where: { id: labelId, projectId } });
    if (count === 0) throw new NotFoundException('Label not found');
  }
}
