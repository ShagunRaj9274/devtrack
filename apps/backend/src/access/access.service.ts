import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { policy } from './policy';

export interface ProjectAccess {
  project: Project;
  isMember: boolean;
}

/**
 * Loads a project together with the caller's membership and enforces visibility.
 * Non-members receive 404 (not 403) so the existence of private projects isn't leaked.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async isMember(projectId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { userId: true },
    });
    return !!row;
  }

  async requireProject(user: AuthUser, projectId: string): Promise<ProjectAccess> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const isMember = await this.isMember(projectId, user.id);
    if (!policy.canViewProject(user, isMember)) throw new NotFoundException('Project not found');
    return { project, isMember };
  }

  /** Throws 403 with a readable message when a policy check fails. */
  assert(allowed: boolean, message: string): void {
    if (!allowed) throw new ForbiddenException(message);
  }
}
