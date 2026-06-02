import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsMongoId,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateElectivePeriodDto {
  @ApiProperty({ example: 'Вибір дисциплін на осінній семестр' })
  @IsString()
  @Length(2, 160)
  title: string;

  @ApiProperty({ example: '2026/2027' })
  @IsString()
  @Matches(/^\d{4}\/\d{4}$/)
  academicYear: string;

  @ApiProperty({ minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  semester: number;

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
