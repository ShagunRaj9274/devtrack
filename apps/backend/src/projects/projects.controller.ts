import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateLabelDto } from './dto/create-label.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Projects I can access (admins see all)' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListProjectsQueryDto) {
    return this.projects.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a project (admins and project managers)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Project details with members, labels and my permissions' })
  get(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.get(user, projectId);
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Update name, description or status' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(user, projectId, dto);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a project and all its issues' })
  remove(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.remove(user, projectId);
  }

  @Get(':projectId/members')
  @ApiOperation({ summary: 'List project members' })
  members(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.listMembers(user, projectId);
  }

  @Post(':projectId/members')
  @ApiOperation({ summary: 'Add a member (notifies them)' })
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.projects.addMember(user, projectId, dto.userId);
  }

  @Delete(':projectId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member (their issues here become unassigned)' })
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.projects.removeMember(user, projectId, userId);
  }

  @Get(':projectId/labels')
  @ApiOperation({ summary: 'List labels' })
  labels(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.listLabels(user, projectId);
  }

  @Post(':projectId/labels')
  @ApiOperation({ summary: 'Create a label' })
  createLabel(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateLabelDto,
  ) {
    return this.projects.createLabel(user, projectId, dto);
  }

  @Delete(':projectId/labels/:labelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a label (removes it from issues)' })
  deleteLabel(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
  ) {
    return this.projects.deleteLabel(user, projectId, labelId);
  }
}
