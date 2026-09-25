import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IssuePriority, IssueStatus, IssueType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** Accepts `status=TODO&status=DONE` or `status=TODO,DONE`. */
const toArray = ({ value }: { value: unknown }) => {
  if (value === undefined || value === '') return undefined;
  const list = Array.isArray(value) ? value : String(value).split(',');
  return list.map((v) => String(v).trim()).filter(Boolean);
};

export const ISSUE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'priority',
  'dueDate',
  'title',
  'status',
] as const;
export type IssueSortField = (typeof ISSUE_SORT_FIELDS)[number];

export class IssueFiltersDto {
  @ApiPropertyOptional({
    description: 'Searches title, description and issue number (e.g. "WEB-12")',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: IssuePriority, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(IssuePriority, { each: true })
  priority?: IssuePriority[];

  @ApiPropertyOptional({ enum: IssueType, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(IssueType, { each: true })
  type?: IssueType[];

  @ApiPropertyOptional({ description: 'A user id, "me" or "unassigned"' })
  @IsOptional()
  @Matches(/^(me|unassigned|[0-9a-fA-F-]{36})$/, {
    message: 'assigneeId must be a UUID, "me" or "unassigned"',
  })
  assigneeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  labelId?: string;
}

export class ListIssuesQueryDto extends IntersectionType(PaginationQueryDto, IssueFiltersDto) {
  @ApiPropertyOptional({ enum: IssueStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(IssueStatus, { each: true })
  status?: IssueStatus[];

  @ApiPropertyOptional({ enum: ISSUE_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(ISSUE_SORT_FIELDS)
  sortBy: IssueSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
