import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, Matches } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Academic term id. Defaults to the current term, otherwise the newest term in the authorized scope.',
  })
  @IsOptional()
  @IsMongoId()
  termId?: string;

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
