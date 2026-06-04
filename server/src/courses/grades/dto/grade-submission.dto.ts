import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  IsOptional,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class GradeSubmissionDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  comment?: string;
}
