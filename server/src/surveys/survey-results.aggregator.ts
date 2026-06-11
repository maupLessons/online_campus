import { toId } from '../common/utils/to-id.util';
import {
  ChoiceQuestionResultDto,
  RatingQuestionResultDto,
  SurveyQuestionResultDto,
  TextQuestionResultDto,
} from './dto';
import {
  SurveyQuestionDocument,
  SurveyQuestionType,
  SurveyResponseDocument,
} from './schemas';

export function aggregateSurveyQuestionResults(
  questions: SurveyQuestionDocument[],
  responses: SurveyResponseDocument[],
): SurveyQuestionResultDto[] {
  const answerValuesByQuestion = new Map<string, unknown[]>();

  for (const response of responses) {
    for (const answer of response.answers) {
      const questionId = toId(answer.question);
      const values = answerValuesByQuestion.get(questionId);
      if (values) {
        values.push(answer.value);
      } else {
        answerValuesByQuestion.set(questionId, [answer.value]);
      }
    }
  }

  return questions.map((question) => {
    const questionId = toId(question._id);
    const values = answerValuesByQuestion.get(questionId) ?? [];
    const base = {
      questionId,
      text: question.text,
      required: question.required,
      order: question.order,
      totalAnswers: values.length,
    };

    if (
      question.type === SurveyQuestionType.SINGLE ||
      question.type === SurveyQuestionType.MULTIPLE
    ) {
      const counts = new Map(question.options.map((option) => [option, 0]));
      for (const value of values) {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'string') {
              counts.set(item, (counts.get(item) ?? 0) + 1);
            }
          }
        } else if (typeof value === 'string') {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }

      const result: ChoiceQuestionResultDto = {
        ...base,
        type: question.type,
        options: question.options.map((option) => {
          const count = counts.get(option) ?? 0;
          return {
            value: option,
            count,
            percentage: percentage(count, values.length),
          };
        }),
      };
      return result;
    }

    if (question.type === SurveyQuestionType.RATING) {
      const ratings = values.filter(
        (value): value is number => typeof value === 'number',
      );
      const sum = ratings.reduce((acc, rating) => acc + rating, 0);

      const result: RatingQuestionResultDto = {
        ...base,
        type: SurveyQuestionType.RATING,
        average:
          ratings.length === 0
            ? null
            : Number((sum / ratings.length).toFixed(2)),
        min: ratings.length === 0 ? null : Math.min(...ratings),
        max: ratings.length === 0 ? null : Math.max(...ratings),
        distribution: [1, 2, 3, 4, 5].map((rating) => {
          const count = ratings.filter((value) => value === rating).length;
          return {
            rating,
            count,
            percentage: percentage(count, ratings.length),
          };
        }),
      };
      return result;
    }

    const result: TextQuestionResultDto = {
      ...base,
      type: SurveyQuestionType.TEXT,
      answers: values.filter(
        (value): value is string => typeof value === 'string',
      ),
    };
    return result;
  });
}

export function percentage(count: number, total: number): number {
  if (total === 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
}
