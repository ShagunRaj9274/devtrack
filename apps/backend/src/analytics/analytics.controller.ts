import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('analytics/me')
  @ApiOperation({ summary: 'Personal dashboard: my open work across projects' })
  me(@CurrentUser() user: AuthUser) {
    return this.analytics.me(user);
  }

  @Get('projects/:projectId/analytics')
  @ApiOperation({ summary: 'Project dashboard metrics (cached for 60s, evicted on change)' })
  project(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.analytics.project(user, projectId);
  }

  @Get('projects/:projectId/activity')
  @ApiOperation({ summary: 'Recent activity in a project, newest first' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  activity(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.analytics.recentActivity(user, projectId, Math.min(Math.max(limit, 1), 50));
  }
}
