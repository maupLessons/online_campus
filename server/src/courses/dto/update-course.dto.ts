import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCredits } from './credits.validator';
import { EXTERNAL_SUBJECT_ID_PATTERN } from './create-course.dto';

export class UpdateCourseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ description: '0.5..30, крок 0.5' })
  @IsOptional()
  @IsCredits()
  credits?: number;

  @ApiPropertyOptional({
    example: '1001',
    description: 'порожній рядок знімає поле',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(64)
  @Matches(EXTERNAL_SUBJECT_ID_PATTERN, {
    message: 'Ключ МАУП: лише латиниця, цифри, крапка, дефіс і підкреслення',
  })
  externalSubjectId?: string;
}
