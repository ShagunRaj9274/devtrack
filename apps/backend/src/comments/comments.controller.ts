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
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AuthUser } from '../common/types';
import { CommentsService } from './comments.service';
import { CommentBodyDto } from './dto/comment-body.dto';

@ApiTags('Comments')
@ApiBearerAuth()
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('issues/:issueId/comments')
  @ApiOperation({ summary: 'Comments on an issue, oldest first' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.comments.list(user, issueId, query);
  }

  @Post('issues/:issueId/comments')
  @ApiOperation({ summary: 'Add a comment. @username mentions notify project members.' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: CommentBodyDto,
  ) {
    return this.comments.create(user, issueId, dto.body);
  }

  @Patch('comments/:commentId')
  @ApiOperation({ summary: 'Edit my comment' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: CommentBodyDto,
  ) {
    return this.comments.update(user, commentId, dto.body);
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my comment (managers can moderate)' })
  remove(@CurrentUser() user: AuthUser, @Param('commentId', ParseUUIDPipe) commentId: string) {
    return this.comments.remove(user, commentId);
  }
}
