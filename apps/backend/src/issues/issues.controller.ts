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
import { CreateIssueDto } from './dto/create-issue.dto';
import { IssueFiltersDto, ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { IssuesService } from './issues.service';

@ApiTags('Issues')
@ApiBearerAuth()
@Controller('projects/:projectId')
export class ProjectIssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get('issues')
  @ApiOperation({ summary: 'Search, filter, sort and paginate issues in a project' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListIssuesQueryDto,
  ) {
    return this.issues.list(user, projectId, query);
  }

  @Post('issues')
  @ApiOperation({ summary: 'Create an issue' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateIssueDto,
  ) {
    return this.issues.create(user, projectId, dto);
  }

  @Get('board')
  @ApiOperation({ summary: 'Issues grouped by status for the Kanban board' })
  board(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() filters: IssueFiltersDto,
  ) {
    return this.issues.board(user, projectId, filters);
  }
}

@ApiTags('Issues')
@ApiBearerAuth()
@Controller('issues')
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get(':issueId')
  @ApiOperation({ summary: 'Issue details with my permissions' })
  get(@CurrentUser() user: AuthUser, @Param('issueId', ParseUUIDPipe) issueId: string) {
    return this.issues.get(user, issueId);
  }

  @Patch(':issueId')
  @ApiOperation({ summary: 'Update issue fields (only changed fields are recorded)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: UpdateIssueDto,
  ) {
    return this.issues.update(user, issueId, dto);
  }

  @Patch(':issueId/status')
  @ApiOperation({ summary: 'Move an issue to another status (board drag and drop)' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.issues.update(user, issueId, { status: dto.status });
  }

  @Delete(':issueId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an issue (admins and project managers)' })
  remove(@CurrentUser() user: AuthUser, @Param('issueId', ParseUUIDPipe) issueId: string) {
    return this.issues.remove(user, issueId);
  }

  @Get(':issueId/activity')
  @ApiOperation({ summary: 'Issue history, oldest first' })
  activity(@CurrentUser() user: AuthUser, @Param('issueId', ParseUUIDPipe) issueId: string) {
    return this.issues.activity(user, issueId);
  }
}
