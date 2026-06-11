import { toId } from '../common/utils/to-id.util';
import { SurveyDto, SurveyQuestionDto, SurveyResponseDto } from './dto';
import {
  SurveyDocument,
  SurveyQuestionDocument,
  SurveyResponseDocument,
} from './schemas';

export function mapSurveyToDto(
  survey: SurveyDocument,
  questions: SurveyQuestionDocument[] = [],
  completed?: boolean,
): SurveyDto {
  const description = survey.description?.trim() || undefined;

  return {
    id: toId(survey._id),
    title: survey.title,
    ...(description ? { description } : {}),
    status: survey.status,
    anonymous: survey.anonymous,
    targetType: survey.targetType,
    targetIds: [...survey.targetIds],
    createdBy: toId(survey.createdBy),
    ...(survey.startDate ? { startDate: survey.startDate.toISOString() } : {}),
    ...(survey.endDate ? { endDate: survey.endDate.toISOString() } : {}),
    ...(survey.publishedAt
      ? { publishedAt: survey.publishedAt.toISOString() }
      : {}),
    ...(survey.closedAt ? { closedAt: survey.closedAt.toISOString() } : {}),
    ...(survey.expectedRecipients === undefined
      ? {}
      : { expectedRecipients: survey.expectedRecipients }),
    ...(survey.createdAt ? { createdAt: survey.createdAt.toISOString() } : {}),
    ...(survey.updatedAt ? { updatedAt: survey.updatedAt.toISOString() } : {}),
    ...(completed === undefined ? {} : { completed }),
    questions: questions.map(mapSurveyQuestionToDto),
  };
}

export function mapSurveyQuestionToDto(
  question: SurveyQuestionDocument,
): SurveyQuestionDto {
  return {
    id: toId(question._id),
    type: question.type,
    text: question.text,
    options: [...question.options],
    required: question.required,
    order: question.order,
  };
}

export function mapSurveyResponseToDto(
  response: SurveyResponseDocument,
): SurveyResponseDto {
  return {
    id: toId(response._id),
    surveyId: toId(response.survey),
    answers: response.answers.map((answer) => ({
      questionId: toId(answer.question),
      value: answer.value,
    })),
    submittedAt: response.submittedAt.toISOString(),
  };
}
