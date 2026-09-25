import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CommentBodyDto {
  @ApiProperty({ example: 'Reproduced on Safari 17. @maria can you take a look?' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Comment cannot be empty' })
  @MaxLength(5000)
  body: string;
}
