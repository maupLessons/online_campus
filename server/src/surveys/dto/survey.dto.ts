import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import { SurveyQuestionType, SurveyStatus, SurveyTargetType } from '../schemas';

export class SurveyQuestionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: SurveyQuestionType })
  type: SurveyQuestionType;

  @ApiProperty()
  text: string;

  @ApiProperty({ type: [String] })
  options: string[];

  @ApiProperty()
  required: boolean;

  @ApiProperty()
  order: number;
}

export class SurveyDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: SurveyStatus })
  status: SurveyStatus;

  @ApiProperty()
  anonymous: boolean;

  @ApiProperty({ enum: SurveyTargetType })
  targetType: SurveyTargetType;

  @ApiProperty({ type: [String] })
  targetIds: string[];

  @ApiProperty()
  createdBy: string;

  @ApiPropertyOptional({ format: 'date-time' })
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  endDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  publishedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  closedAt?: string;

  @ApiPropertyOptional()
  expectedRecipients?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  createdAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  updatedAt?: string;

  @ApiPropertyOptional()
  completed?: boolean;

  @ApiProperty({ type: [SurveyQuestionDto] })
  questions: SurveyQuestionDto[];
}

export class SurveyAnswerDto {
  @ApiProperty()
  questionId: string;

  @ApiProperty()
  value: unknown;
}

export class SurveyResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  surveyId: string;

  @ApiProperty({ type: [SurveyAnswerDto] })
  answers: SurveyAnswerDto[];

  @ApiProperty({ format: 'date-time' })
  submittedAt: string;
}

export class SurveyResponseStateDto {
  @ApiProperty()
  completed: boolean;

  @ApiProperty()
  anonymous: boolean;

  @ApiPropertyOptional({ type: SurveyResponseDto, nullable: true })
  response: SurveyResponseDto | null;
}

export class SurveySubmissionResultDto {
  @ApiProperty({ enum: [true] })
  success: true;

  @ApiProperty()
  anonymous: boolean;

  @ApiProperty({ format: 'date-time' })
  submittedAt: string;
}

export class SurveyDeleteResultDto {
  @ApiProperty({ enum: [true] })
  success: true;
}

export class ChoiceOptionResultDto {
  @ApiProperty()
  value: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: number;
}

export class RatingDistributionResultDto {
  @ApiProperty()
  rating: number;

  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: number;
}

export class BaseQuestionResultDto {
  @ApiProperty()
  questionId: string;

  @ApiProperty({ enum: SurveyQuestionType })
  type: SurveyQuestionType;

  @ApiProperty()
  text: string;

  @ApiProperty()
  required: boolean;

  @ApiProperty()
  order: number;

  @ApiProperty()
  totalAnswers: number;
}

export class ChoiceQuestionResultDto extends BaseQuestionResultDto {
  declare type: SurveyQuestionType.SINGLE | SurveyQuestionType.MULTIPLE;

  @ApiProperty({ type: [ChoiceOptionResultDto] })
  options: ChoiceOptionResultDto[];
}

export class RatingQuestionResultDto extends BaseQuestionResultDto {
  declare type: SurveyQuestionType.RATING;

  @ApiPropertyOptional({ nullable: true })
  average: number | null;

  @ApiPropertyOptional({ nullable: true })
  min: number | null;

  @ApiPropertyOptional({ nullable: true })
  max: number | null;

  @ApiProperty({ type: [RatingDistributionResultDto] })
  distribution: RatingDistributionResultDto[];
}

export class TextQuestionResultDto extends BaseQuestionResultDto {
  declare type: SurveyQuestionType.TEXT;

  @ApiProperty({ type: [String] })
  answers: string[];
}

export type SurveyQuestionResultDto =
  ChoiceQuestionResultDto | RatingQuestionResultDto | TextQuestionResultDto;

@ApiExtraModels(
  ChoiceQuestionResultDto,
  RatingQuestionResultDto,
  TextQuestionResultDto,
)
export class SurveyResultsDto {
  @ApiProperty({ type: SurveyDto })
  survey: SurveyDto;

  @ApiProperty()
  anonymous: boolean;

  @ApiProperty()
  totalResponses: number;

  @ApiProperty()
  totalCompletions: number;

  @ApiProperty()
  expectedRecipients: number;

  @ApiProperty()
  completionRate: number;

  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(ChoiceQuestionResultDto) },
        { $ref: getSchemaPath(RatingQuestionResultDto) },
        { $ref: getSchemaPath(TextQuestionResultDto) },
      ],
    },
  })
  questions: SurveyQuestionResultDto[];
}
