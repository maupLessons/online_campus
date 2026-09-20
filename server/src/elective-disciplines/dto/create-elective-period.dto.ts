import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateElectivePeriodDto {
  @ApiProperty({ example: 'Вибір дисциплін на осінній семестр' })
  @IsString()
  @Length(2, 160)
  title: string;

  @ApiPropertyOptional({
    description: 'Id навчального періоду; за замовчуванням — поточний',
  })
  @IsOptional()
  @IsMongoId()
  termId?: string;

  @ApiProperty()
  @IsDateString()
  startsAt: string;

  @ApiProperty()
  @IsDateString()
  endsAt: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  targetGroupIds: string[];

  @ApiProperty({ minimum: 1, maximum: 5, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  requiredChoices: number = 1;
}
