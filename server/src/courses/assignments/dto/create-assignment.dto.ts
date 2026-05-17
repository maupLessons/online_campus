import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class CreateAssignmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsString({ each: true })
  fileIds?: string[];

  @ApiProperty()
  @IsDateString()
  dueDate: string;

  @ApiProperty()
  @IsNumber()
  maxScore: number;
}
