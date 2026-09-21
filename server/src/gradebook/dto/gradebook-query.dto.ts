import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class GradebookQueryDto {
  @ApiPropertyOptional({ example: '2026/2027' })
  @IsOptional()
  @Matches(/^\d{4}\/\d{4}$/)
  academicYear?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  semester?: number;
}
