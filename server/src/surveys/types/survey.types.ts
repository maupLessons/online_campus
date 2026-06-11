import { Types } from 'mongoose';
import { SurveyQuestionType, SurveyTargetType } from '../schemas';

export type NormalizedSurveyQuestion = {
  type: SurveyQuestionType;
  text: string;
  options: string[];
  required: boolean;
  order: number;
};

export type NormalizedAnswerValue = string | string[] | number | undefined;

export type NormalizedSurveyAnswer = {
  question: Types.ObjectId;
  value: unknown;
};

export type SurveyDraftSnapshot = {
  title: string;
  description?: string;
  anonymous: boolean;
  targetType: SurveyTargetType;
  targetIds: string[];
  startDate?: Date;
  endDate?: Date;
};
