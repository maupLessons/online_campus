import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateElectiveDisciplineDto {
  @ApiPropertyOptional({ example: 'EL-CYB-01' })
  @IsOptional()
  @IsString()
  @Length(2, 24)
  code?: string;

  @ApiProperty({ example: 'Основи кібербезпеки' })
  @IsString()
  @Length(2, 160)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://maup.com.ua/assets/files/....pdf' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ protocols: ['https'], require_protocol: true })
  syllabusUrl?: string;

  @ApiProperty()
  @IsMongoId()
  departmentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  teacherId?: string;

  @ApiPropertyOptional({
    description: 'Id навчального періоду; за замовчуванням — поточний',
  })
  @IsOptional()
  @IsMongoId()
  termId?: string;

  @ApiProperty({ minimum: 1, maximum: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  credits: number;

  @ApiProperty({ minimum: 1, maximum: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity: number;
}
