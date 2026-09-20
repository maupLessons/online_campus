import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class StudentProfileInputDto {
  @ApiProperty({ description: 'MAUP student_id' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  externalStudentId: string;

  @ApiProperty() @IsMongoId() groupId: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  recordBookNumber: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  year: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  studyForm?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  institute?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  specialty?: string;
}
