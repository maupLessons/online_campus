import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateElectiveDisciplineDto {
  @ApiProperty({ example: 'EL-CYB-01' })
  @IsString()
  @Length(2, 24)
  code: string;

  @ApiProperty({ example: 'Основи кібербезпеки' })
  @IsString()
  @Length(2, 160)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty()
  @IsMongoId()
  departmentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  teacherId?: string;

  @ApiProperty({ minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  semester: number;

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
