import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateMoodleUrlDto {
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  moodleUrl: string | null;

  @ApiPropertyOptional({
    description: 'Обовʼязково для admin, мінімум 10 символів',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;
}
