import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ReturnSubmissionDto {
  @ApiProperty({
    example: 'Уточніть висновки та повторно завантажте виправлену роботу.',
  })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  comment: string;
}
