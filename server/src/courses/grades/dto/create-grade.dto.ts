import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class CreateGradeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  courseAssignmentId: string;

  @ApiProperty({ enum: ['current', 'module', 'exam', 'final'] })
  @IsEnum(['current', 'module', 'exam', 'final'])
  type: string;

  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  comment?: string;
}
