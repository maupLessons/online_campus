import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsMongoId,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitSurveyAnswerDto {
  @ApiProperty()
  @IsMongoId()
  questionId: string;

  @ApiProperty({
    description:
      'Answer value. single/text: string, multiple: string[], rating: number 1..5.',
  })
  @IsDefined()
  value: unknown;
}

export class SubmitSurveyResponseDto {
  @ApiProperty({ type: [SubmitSurveyAnswerDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SubmitSurveyAnswerDto)
  answers: SubmitSurveyAnswerDto[];
}
