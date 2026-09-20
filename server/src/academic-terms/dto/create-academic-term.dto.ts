import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateAcademicTermDto {
  @ApiProperty({ example: '2026/2027' })
  @IsString()
  @Matches(/^\d{4}\/\d{4}$/, { message: 'academicYear має формат РРРР/РРРР' })
  academicYear: string;

  @ApiProperty({ enum: [1, 2] })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  termNumber: 1 | 2;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ example: '2027-01-31' })
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({ description: 'Перевизначення року для MAUP API' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maupAcademicYear?: number;

  @ApiPropertyOptional({ enum: [1, 2] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  maupSemester?: number;
}
