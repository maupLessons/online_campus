import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ReferenceImportMode } from '../reference.types';

export class ReferenceImportQueryDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  dryRun: boolean = true;

  @ApiPropertyOptional({
    enum: ReferenceImportMode,
    default: ReferenceImportMode.UPSERT,
  })
  @IsOptional()
  @IsEnum(ReferenceImportMode)
  mode: ReferenceImportMode = ReferenceImportMode.UPSERT;
}
