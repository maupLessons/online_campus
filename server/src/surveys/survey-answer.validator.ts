import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { toId } from '../common/utils/to-id.util';
import { CreateSurveyQuestionDto, SubmitSurveyResponseDto } from './dto';
import { SurveyQuestionDocument, SurveyQuestionType } from './schemas';
import {
  NormalizedAnswerValue,
  NormalizedSurveyAnswer,
  NormalizedSurveyQuestion,
} from './types';

export function normalizeSurveyQuestions(
  questions: CreateSurveyQuestionDto[],
): NormalizedSurveyQuestion[] {
  const usedOrders = new Set<number>();

  return questions.map((question, index) => {
    const order = question.order ?? index;
    if (usedOrders.has(order)) {
      throw new BadRequestException('Порядок питань не може повторюватися');
    }
    usedOrders.add(order);

    const text = trimRequired(question.text, 'Текст питання обовʼязковий');
    const options = (question.options ?? [])
      .map((option) => option.trim())
      .filter(Boolean);
    const uniqueOptions = [...new Set(options)];

    if (uniqueOptions.length !== options.length) {
      throw new BadRequestException(
        'Варіанти відповіді не можуть повторюватися',
      );
    }

    if (
      question.type === SurveyQuestionType.SINGLE ||
      question.type === SurveyQuestionType.MULTIPLE
    ) {
      if (uniqueOptions.length < 2) {
        throw new BadRequestException(
          'Питання з варіантами повинно мати щонайменше два варіанти',
        );
      }
    } else if (uniqueOptions.length > 0) {
      throw new BadRequestException(
        'Питання типу rating/text не повинні містити варіанти відповіді',
      );
    }

    return {
      type: question.type,
      text,
      options: uniqueOptions,
      required: question.required ?? true,
      order,
    };
  });
}

export function validateAndNormalizeSurveyAnswers(
  questions: SurveyQuestionDocument[],
  dto: SubmitSurveyResponseDto,
): NormalizedSurveyAnswer[] {
  const questionById = new Map(
    questions.map((question) => [toId(question._id), question]),
  );
  const answerByQuestion = new Map<string, unknown>();

  for (const answer of dto.answers) {
    if (answerByQuestion.has(answer.questionId)) {
      throw new BadRequestException('Питання не може мати декілька відповідей');
    }
    if (!questionById.has(answer.questionId)) {
      throw new BadRequestException('Відповідь містить невідоме питання');
    }
    answerByQuestion.set(answer.questionId, answer.value);
  }

  const normalizedAnswers: NormalizedSurveyAnswer[] = [];
  for (const question of questions) {
    const questionId = toId(question._id);
    const hasAnswer = answerByQuestion.has(questionId);
    const normalized = hasAnswer
      ? normalizeAnswerValue(question, answerByQuestion.get(questionId))
      : undefined;

    if (normalized === undefined) {
      if (question.required) {
        throw new BadRequestException('Заповніть усі обовʼязкові питання');
      }
      continue;
    }

    normalizedAnswers.push({
      question: new Types.ObjectId(questionId),
      value: normalized,
    });
  }

  return normalizedAnswers;
}

function normalizeAnswerValue(
  question: SurveyQuestionDocument,
  value: unknown,
): NormalizedAnswerValue {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (question.type === SurveyQuestionType.SINGLE) {
    if (typeof value !== 'string') {
      throw new BadRequestException('Оберіть один варіант відповіді');
    }
    const normalized = value.trim();
    if (!normalized) return undefined;
    if (!question.options.includes(normalized)) {
      throw new BadRequestException('Некоректний варіант відповіді');
    }
    return normalized;
  }

  if (question.type === SurveyQuestionType.MULTIPLE) {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Оберіть один або декілька варіантів');
    }

    const normalized = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);

    if (normalized.length === 0) return undefined;
    if (normalized.length !== value.length) {
      throw new BadRequestException('Некоректний формат відповіді');
    }
    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException(
        'Варіанти відповіді не можуть повторюватися',
      );
    }
    if (!normalized.every((item) => question.options.includes(item))) {
      throw new BadRequestException('Некоректний варіант відповіді');
    }

    return normalized;
  }

  if (question.type === SurveyQuestionType.RATING) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new BadRequestException('Оцінка повинна бути цілим числом');
    }
    if (value < 1 || value > 5) {
      throw new BadRequestException('Оцінка повинна бути від 1 до 5');
    }
    return value;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('Текстова відповідь повинна бути рядком');
  }

  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > 5000) {
    throw new BadRequestException('Текстова відповідь занадто довга');
  }
  return normalized;
}

function trimRequired(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException(message);
  }
  return normalized;
}
