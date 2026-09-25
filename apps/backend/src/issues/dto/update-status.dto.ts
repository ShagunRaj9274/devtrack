import { ApiProperty } from '@nestjs/swagger';
import { IssueStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateStatusDto {
  @ApiProperty({ enum: IssueStatus })
  @IsEnum(IssueStatus)
  status: IssueStatus;
}
