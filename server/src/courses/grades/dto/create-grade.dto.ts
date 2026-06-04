import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsMongoId,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGradeDto {
  @ApiProperty()
  @IsMongoId()
  studentId: string;

  @ApiProperty()
  @IsMongoId()
  courseAssignmentId: string;

  @ApiProperty({ enum: ['current', 'module', 'exam', 'final'] })
  @IsEnum(['current', 'module', 'exam', 'final'])
  type: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  value: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  comment?: string;
}
