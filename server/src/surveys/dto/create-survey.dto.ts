import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SurveyQuestionType, SurveyTargetType } from '../schemas';

export class CreateSurveyQuestionDto {
  @ApiProperty({ enum: SurveyQuestionType })
  @IsEnum(SurveyQuestionType)
  type: SurveyQuestionType;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  text: string;

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  options?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateSurveyDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @ApiPropertyOptional({
    enum: SurveyTargetType,
    default: SurveyTargetType.ALL,
  })
  @IsOptional()
  @IsEnum(SurveyTargetType)
  targetType?: SurveyTargetType;

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsMongoId({ each: true })
  @MaxLength(80, { each: true })
  targetIds?: string[];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  startDate: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  endDate: string;

  @ApiProperty({ type: [CreateSurveyQuestionDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateSurveyQuestionDto)
  questions: CreateSurveyQuestionDto[];
}
