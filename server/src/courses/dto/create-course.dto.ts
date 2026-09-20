import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCredits } from './credits.validator';

// §4.1a: trim before writing, 1..64, only [A-Za-z0-9._-];
// an empty string is allowed — it REMOVES the field ($unset), rather than writing null
export const EXTERNAL_SUBJECT_ID_PATTERN = /^[A-Za-z0-9._-]*$/;

export class CreateCourseDto {
  @ApiProperty({ example: 'CS101' })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(/^[A-Za-zА-Яа-яІіЇїЄє0-9_-]+$/, {
    message: 'Код може містити літери, цифри, - та _',
  })
  code: string;

  @ApiProperty({ example: 'Основи програмування' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty()
  @IsMongoId()
  departmentId: string;

  @ApiProperty({ example: 4, description: '0.5..30, крок 0.5' })
  @IsCredits()
  credits: number;

  @ApiPropertyOptional({
    example: '1001',
    description: 'subject_id бази МАУП; порожній рядок знімає поле',
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

  @ApiPropertyOptional({
    example: 'https://dist.maup.com.ua/course/view.php?id=1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  moodleUrl?: string;
}
