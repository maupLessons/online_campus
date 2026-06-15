import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACADEMIC_YEAR_PATTERN = /^\d{4}[/-]\d{4}$/;

export class ReportQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    example: '2025/2026',
    description:
      'Academic year in YYYY/YYYY or legacy YYYY-YYYY format. The latest available year in the authorized scope is used by default.',
  })
  @IsOptional()
  @Matches(ACADEMIC_YEAR_PATTERN)
  academicYear?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  semester?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  courseAssignmentId?: string;

  @ApiPropertyOptional({
    example: '2025-09-01',
    description:
      'Inclusive UTC date. Must be supplied together with to and cannot span more than 366 days.',
  })
  @IsOptional()
  @Matches(ISO_DATE_PATTERN)
  from?: string;

  @ApiPropertyOptional({
    example: '2026-01-31',
    description:
      'Inclusive UTC date. Must be supplied together with from and cannot span more than 366 days.',
  })
  @IsOptional()
  @Matches(ISO_DATE_PATTERN)
  to?: string;
}
