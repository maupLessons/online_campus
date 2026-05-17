import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional } from 'class-validator';

export class GradeSubmissionDto {
  @ApiProperty()
  @IsNumber()
  score: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  comment?: string;
}
