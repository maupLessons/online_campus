import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { CoursesService } from '../courses/courses/courses.service';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { UserDto } from '../users/dto/user.dto';
import { UsersService } from '../users/users.service';
import {
  CreateSurveyDto,
  CreateSurveyQuestionDto,
} from './dto/create-survey.dto';
import { SubmitSurveyResponseDto } from './dto/submit-survey-response.dto';
import { SurveyQueryDto } from './dto/survey-query.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import {
  Survey,
  SurveyCompletion,
  SurveyCompletionDocument,
  SurveyDocument,
  SurveyQuestion,
  SurveyQuestionDocument,
  SurveyQuestionType,
  SurveyResponse,
  SurveyResponseDocument,
  SurveyStatus,
  SurveyTargetType,
} from './schemas';

export interface SurveyQuestionView {
  id: string;
  type: SurveyQuestionType;
  text: string;
  options: string[];
  required: boolean;
  order: number;
}

export interface SurveyView {
  id: string;
  title: string;
  description?: string;
  status: SurveyStatus;
  anonymous: boolean;
  targetType: SurveyTargetType;
  targetIds: string[];
  createdBy: string;
  startDate?: string;
  endDate?: string;
  publishedAt?: string;
  closedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  questions?: SurveyQuestionView[];
}

export interface SurveyAnswerView {
  questionId: string;
  value: unknown;
}

export interface SurveyResponseView {
  id: string;
  surveyId: string;
  answers: SurveyAnswerView[];
  submittedAt: string;
}

export interface ChoiceOptionResult {
  value: string;
  count: number;
  percentage: number;
}

export interface RatingDistributionResult {
  rating: number;
  count: number;
  percentage: number;
}

export interface BaseQuestionResult {
  questionId: string;
  type: SurveyQuestionType;
  text: string;
  required: boolean;
  order: number;
  totalAnswers: number;
}

export interface ChoiceQuestionResult extends BaseQuestionResult {
  type: SurveyQuestionType.SINGLE | SurveyQuestionType.MULTIPLE;
  options: ChoiceOptionResult[];
}

export interface RatingQuestionResult extends BaseQuestionResult {
  type: SurveyQuestionType.RATING;
  average: number | null;
  min: number | null;
  max: number | null;
  distribution: RatingDistributionResult[];
}

export interface TextQuestionResult extends BaseQuestionResult {
  type: SurveyQuestionType.TEXT;
  answers: string[];
}

export type QuestionResult =
  | ChoiceQuestionResult
  | RatingQuestionResult
  | TextQuestionResult;

export interface SurveyResultsView {
  survey: SurveyView;
  anonymous: boolean;
  totalResponses: number;
  totalCompletions: number;
  questions: QuestionResult[];
}

type NormalizedSurveyQuestion = {
  type: SurveyQuestionType;
  text: string;
  options: string[];
  required: boolean;
  order: number;
};

type NormalizedAnswerValue = string | string[] | number | undefined;

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);
  private readonly manageableRoles = new Set<Role>([
    Role.ADMIN,
    Role.RECTOR,
    Role.PRESIDENT,
  ]);
  private readonly resultRoles = new Set<Role>([
    Role.ADMIN,
    Role.DEAN,
    Role.RECTOR,
    Role.PRESIDENT,
  ]);

  constructor(
    @InjectModel(Survey.name)
    private readonly surveyModel: Model<SurveyDocument>,
    @InjectModel(SurveyQuestion.name)
    private readonly questionModel: Model<SurveyQuestionDocument>,
    @InjectModel(SurveyResponse.name)
    private readonly responseModel: Model<SurveyResponseDocument>,
    @InjectModel(SurveyCompletion.name)
    private readonly completionModel: Model<SurveyCompletionDocument>,
    private readonly usersService: UsersService,
    private readonly coursesService: CoursesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    dto: CreateSurveyDto,
    user: AuthenticatedUser,
  ): Promise<SurveyView> {
    const dates = this.normalizeSurveyDates(dto.startDate, dto.endDate);
    const createdBy = this.toObjectId(user.sub);
    const questionPayload = this.normalizeQuestions(dto.questions);
    const targetType = dto.targetType ?? SurveyTargetType.ALL;

    const survey = await this.surveyModel.create({
      title: this.trimRequired(dto.title, 'Назва опитування обовʼязкова'),
      description: this.trimOptional(dto.description),
      anonymous: dto.anonymous ?? false,
      status: SurveyStatus.DRAFT,
      targetType,
      targetIds: this.normalizeTargetIds(targetType, dto.targetIds),
      createdBy,
      startDate: dates.startDate,
      endDate: dates.endDate,
    });

    try {
      const questions = await this.questionModel.insertMany(
        questionPayload.map((question) => ({
          ...question,
          survey: survey._id,
        })),
        { ordered: true },
      );

      return this.formatSurvey(survey, questions);
    } catch (error) {
      await this.surveyModel.deleteOne({ _id: survey._id }).exec();
      throw error;
    }
  }

  async findAll(query: SurveyQueryDto): Promise<SurveyView[]> {
    await this.closeExpiredSurveys();

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.targetType) filter.targetType = query.targetType;

    const surveys = await this.surveyModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
    const questionsBySurvey = await this.loadQuestionsForSurveys(surveys);

    return surveys.map((survey) =>
      this.formatSurvey(
        survey,
        questionsBySurvey.get(this.idToString(survey._id)) ?? [],
      ),
    );
  }

  async findActiveForUser(user: AuthenticatedUser): Promise<SurveyView[]> {
    await this.closeExpiredSurveys();

    const profile = await this.usersService.findOne(user.sub);
    const now = new Date();
    const surveys = await this.surveyModel
      .find({
        status: SurveyStatus.ACTIVE,
        $and: [
          {
            $or: [
              { startDate: { $exists: false } },
              { startDate: { $lte: now } },
            ],
          },
          {
            $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }],
          },
        ],
      })
      .sort({ createdAt: -1 })
      .exec();

    const visibleSurveys: SurveyDocument[] = [];
    for (const survey of surveys) {
      if (await this.isSurveyTargetedToUser(survey, user, profile)) {
        visibleSurveys.push(survey);
      }
    }
    const questionsBySurvey =
      await this.loadQuestionsForSurveys(visibleSurveys);

    return visibleSurveys.map((survey) =>
      this.formatSurvey(
        survey,
        questionsBySurvey.get(this.idToString(survey._id)) ?? [],
      ),
    );
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<SurveyView> {
    await this.closeExpiredSurveys();

    const survey = await this.getSurveyOrThrow(id);
    const canView = await this.canViewSurvey(survey, user);
    if (!canView) {
      throw new ForbiddenException('Немає доступу до цього опитування');
    }

    const questions = await this.getQuestionsForSurvey(survey._id);
    return this.formatSurvey(survey, questions);
  }

  async update(
    id: string,
    dto: UpdateSurveyDto,
    user: AuthenticatedUser,
  ): Promise<SurveyView> {
    const survey = await this.getSurveyOrThrow(id);
    this.ensureCanManageSurvey(survey, user);
    this.ensureDraftSurvey(survey);

    const updateData: Partial<Survey> = {};

    if (dto.title !== undefined) {
      updateData.title = this.trimRequired(
        dto.title,
        'Назва опитування обовʼязкова',
      );
    }
    if (dto.description !== undefined) {
      updateData.description = this.trimOptional(dto.description);
    }
    if (dto.anonymous !== undefined) {
      updateData.anonymous = dto.anonymous;
    }

    const nextTargetType = dto.targetType ?? survey.targetType;
    if (dto.targetType !== undefined || dto.targetIds !== undefined) {
      updateData.targetType = nextTargetType;
      updateData.targetIds = this.normalizeTargetIds(
        nextTargetType,
        dto.targetIds ?? survey.targetIds,
      );
    }

    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const dates = this.normalizeSurveyDates(
        dto.startDate ?? survey.startDate?.toISOString(),
        dto.endDate ?? survey.endDate?.toISOString(),
      );
      updateData.startDate = dates.startDate;
      updateData.endDate = dates.endDate;
    }

    Object.assign(survey, updateData);
    const savedSurvey = await survey.save();

    let questions = await this.getQuestionsForSurvey(savedSurvey._id);
    if (dto.questions !== undefined) {
      const normalizedQuestions = this.normalizeQuestions(dto.questions);
      await this.questionModel.deleteMany({ survey: savedSurvey._id }).exec();
      questions = await this.questionModel.insertMany(
        normalizedQuestions.map((question) => ({
          ...question,
          survey: savedSurvey._id,
        })),
        { ordered: true },
      );
    }

    return this.formatSurvey(savedSurvey, questions);
  }

  async publish(id: string, user: AuthenticatedUser): Promise<SurveyView> {
    const survey = await this.getSurveyOrThrow(id);
    this.ensureCanManageSurvey(survey, user);

    if (survey.status !== SurveyStatus.DRAFT) {
      throw new BadRequestException('Опублікувати можна лише чернетку');
    }

    const questions = await this.getQuestionsForSurvey(survey._id);
    if (questions.length === 0) {
      throw new BadRequestException('Опитування повинно містити питання');
    }

    const now = new Date();
    if (survey.endDate && survey.endDate <= now) {
      throw new BadRequestException('Дата завершення вже минула');
    }

    survey.status = SurveyStatus.ACTIVE;
    if (!survey.startDate || survey.startDate > now) {
      survey.startDate = now;
    }
    survey.publishedAt = now;
    survey.closedAt = undefined;

    const savedSurvey = await survey.save();
    await this.notifySurveyPublished(savedSurvey);

    return this.formatSurvey(savedSurvey, questions);
  }

  async close(id: string, user: AuthenticatedUser): Promise<SurveyView> {
    const survey = await this.getSurveyOrThrow(id);
    this.ensureCanManageSurvey(survey, user);

    if (survey.status === SurveyStatus.CLOSED) {
      throw new BadRequestException('Опитування вже закрите');
    }

    survey.status = SurveyStatus.CLOSED;
    survey.closedAt = new Date();
    const savedSurvey = await survey.save();
    const questions = await this.getQuestionsForSurvey(savedSurvey._id);

    return this.formatSurvey(savedSurvey, questions);
  }

  async remove(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Видаляти опитування може лише адміністратор',
      );
    }

    const survey = await this.getSurveyOrThrow(id);
    this.ensureDraftSurvey(survey);

    await Promise.all([
      this.questionModel.deleteMany({ survey: survey._id }).exec(),
      this.responseModel.deleteMany({ survey: survey._id }).exec(),
      this.completionModel.deleteMany({ survey: survey._id }).exec(),
      survey.deleteOne(),
    ]);

    return { success: true };
  }

  async respond(
    id: string,
    dto: SubmitSurveyResponseDto,
    user: AuthenticatedUser,
  ): Promise<{
    success: true;
    anonymous: boolean;
    submittedAt: string;
  }> {
    await this.closeExpiredSurveys();

    const survey = await this.getSurveyOrThrow(id);
    await this.ensureCanRespond(survey, user);

    const questions = await this.getQuestionsForSurvey(survey._id);
    const answers = this.validateAndNormalizeAnswers(questions, dto);
    const userId = this.toObjectId(user.sub);
    const submittedAt = new Date();

    try {
      await this.completionModel.create({
        survey: survey._id,
        user: userId,
        completedAt: submittedAt,
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Ви вже проходили це опитування');
      }
      throw error;
    }

    try {
      await this.responseModel.create({
        survey: survey._id,
        user: survey.anonymous ? null : userId,
        answers,
        submittedAt,
      });
    } catch (error) {
      await this.completionModel
        .deleteOne({ survey: survey._id, user: userId })
        .exec();

      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Ви вже проходили це опитування');
      }
      throw error;
    }

    return {
      success: true,
      anonymous: survey.anonymous,
      submittedAt: submittedAt.toISOString(),
    };
  }

  async getMyResponse(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{
    completed: boolean;
    anonymous: boolean;
    response: SurveyResponseView | null;
  }> {
    await this.closeExpiredSurveys();

    const survey = await this.getSurveyOrThrow(id);
    await this.ensureCanRespondOrViewOwnState(survey, user);

    const userId = this.toObjectId(user.sub);
    const completion = await this.completionModel
      .findOne({ survey: survey._id, user: userId })
      .exec();

    if (!completion) {
      return {
        completed: false,
        anonymous: survey.anonymous,
        response: null,
      };
    }

    if (survey.anonymous) {
      return {
        completed: true,
        anonymous: true,
        response: null,
      };
    }

    const response = await this.responseModel
      .findOne({ survey: survey._id, user: userId })
      .exec();

    return {
      completed: true,
      anonymous: false,
      response: response ? this.formatResponse(response) : null,
    };
  }

  async getResults(
    id: string,
    user: AuthenticatedUser,
  ): Promise<SurveyResultsView> {
    await this.closeExpiredSurveys();

    const survey = await this.getSurveyOrThrow(id);
    this.ensureCanViewResults(user);

    const questions = await this.getQuestionsForSurvey(survey._id);
    const [responses, totalCompletions] = await Promise.all([
      this.responseModel
        .find({ survey: survey._id })
        .sort({ submittedAt: 1 })
        .exec(),
      this.completionModel.countDocuments({ survey: survey._id }).exec(),
    ]);

    return {
      survey: this.formatSurvey(survey, questions),
      anonymous: survey.anonymous,
      totalResponses: responses.length,
      totalCompletions,
      questions: this.aggregateQuestionResults(questions, responses),
    };
  }

  async exportResultsCsv(id: string, user: AuthenticatedUser): Promise<string> {
    const results = await this.getResults(id, user);
    const rows = [
      [
        'question_order',
        'question_type',
        'question_text',
        'metric',
        'value',
        'count',
        'total',
        'average',
      ],
    ];

    for (const question of results.questions) {
      if (
        question.type === SurveyQuestionType.SINGLE ||
        question.type === SurveyQuestionType.MULTIPLE
      ) {
        for (const option of question.options) {
          rows.push([
            String(question.order),
            question.type,
            question.text,
            'option',
            option.value,
            String(option.count),
            String(question.totalAnswers),
            '',
          ]);
        }
        continue;
      }

      if (question.type === SurveyQuestionType.RATING) {
        rows.push([
          String(question.order),
          question.type,
          question.text,
          'average',
          '',
          '',
          String(question.totalAnswers),
          question.average === null ? '' : String(question.average),
        ]);

        for (const item of question.distribution) {
          rows.push([
            String(question.order),
            question.type,
            question.text,
            'rating',
            String(item.rating),
            String(item.count),
            String(question.totalAnswers),
            question.average === null ? '' : String(question.average),
          ]);
        }
        continue;
      }

      if (question.type === SurveyQuestionType.TEXT) {
        for (const answer of question.answers) {
          rows.push([
            String(question.order),
            question.type,
            question.text,
            'text',
            answer,
            '1',
            String(question.totalAnswers),
            '',
          ]);
        }
      }
    }

    return `\uFEFF${rows
      .map((row) => row.map((value) => this.escapeCsv(value)).join(','))
      .join('\n')}\n`;
  }

  private async ensureCanRespond(
    survey: SurveyDocument,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (survey.status !== SurveyStatus.ACTIVE) {
      throw new BadRequestException('Опитування неактивне');
    }

    const now = new Date();
    if (survey.startDate && survey.startDate > now) {
      throw new BadRequestException('Опитування ще не розпочалося');
    }
    if (survey.endDate && survey.endDate < now) {
      await this.closeExpiredSurveys(now);
      throw new BadRequestException('Опитування вже завершене');
    }

    const profile = await this.usersService.findOne(user.sub);
    if (!(await this.isSurveyTargetedToUser(survey, user, profile))) {
      throw new ForbiddenException(
        'Опитування недоступне для цього користувача',
      );
    }
  }

  private async ensureCanRespondOrViewOwnState(
    survey: SurveyDocument,
    user: AuthenticatedUser,
  ): Promise<void> {
    const profile = await this.usersService.findOne(user.sub);
    if (!(await this.isSurveyTargetedToUser(survey, user, profile))) {
      throw new ForbiddenException(
        'Опитування недоступне для цього користувача',
      );
    }
  }

  private async canViewSurvey(
    survey: SurveyDocument,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    if (this.canManageSurvey(survey, user) || this.resultRoles.has(user.role)) {
      return true;
    }

    if (survey.status !== SurveyStatus.ACTIVE) {
      return false;
    }

    const profile = await this.usersService.findOne(user.sub);
    return this.isSurveyTargetedToUser(survey, user, profile);
  }

  private ensureCanManageSurvey(
    survey: SurveyDocument,
    user: AuthenticatedUser,
  ): void {
    if (!this.canManageSurvey(survey, user)) {
      throw new ForbiddenException('Немає прав для керування цим опитуванням');
    }
  }

  private canManageSurvey(
    survey: SurveyDocument,
    user: AuthenticatedUser,
  ): boolean {
    if (this.manageableRoles.has(user.role)) {
      return true;
    }

    return (
      user.role === Role.DEAN && this.idToString(survey.createdBy) === user.sub
    );
  }

  private ensureCanViewResults(user: AuthenticatedUser): void {
    if (!this.resultRoles.has(user.role)) {
      throw new ForbiddenException('Немає прав для перегляду результатів');
    }
  }

  private ensureDraftSurvey(survey: SurveyDocument): void {
    if (survey.status !== SurveyStatus.DRAFT) {
      throw new BadRequestException(
        'Редагувати або видаляти можна лише чернетку',
      );
    }
  }

  private async getSurveyOrThrow(id: string): Promise<SurveyDocument> {
    const survey = await this.surveyModel.findById(this.toObjectId(id)).exec();
    if (!survey) {
      throw new NotFoundException('Опитування не знайдено');
    }

    return survey;
  }

  private async getQuestionsForSurvey(
    surveyId: Types.ObjectId,
  ): Promise<SurveyQuestionDocument[]> {
    return this.questionModel
      .find({ survey: surveyId })
      .sort({ order: 1, createdAt: 1 })
      .exec();
  }

  private async loadQuestionsForSurveys(
    surveys: SurveyDocument[],
  ): Promise<Map<string, SurveyQuestionDocument[]>> {
    if (surveys.length === 0) {
      return new Map();
    }

    const surveyIds = surveys.map((survey) => survey._id);
    const questions = await this.questionModel
      .find({ survey: { $in: surveyIds } })
      .sort({ order: 1, createdAt: 1 })
      .exec();

    const grouped = new Map<string, SurveyQuestionDocument[]>();
    for (const question of questions) {
      const surveyId = this.idToString(question.survey);
      grouped.set(surveyId, [...(grouped.get(surveyId) ?? []), question]);
    }

    return grouped;
  }

  private normalizeQuestions(
    questions: CreateSurveyQuestionDto[],
  ): NormalizedSurveyQuestion[] {
    const usedOrders = new Set<number>();

    return questions.map((question, index) => {
      const order = question.order ?? index;
      if (usedOrders.has(order)) {
        throw new BadRequestException('Порядок питань не може повторюватися');
      }
      usedOrders.add(order);

      const text = this.trimRequired(
        question.text,
        'Текст питання обовʼязковий',
      );
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

  private validateAndNormalizeAnswers(
    questions: SurveyQuestionDocument[],
    dto: SubmitSurveyResponseDto,
  ): { question: Types.ObjectId; value: unknown }[] {
    const questionById = new Map(
      questions.map((question) => [this.idToString(question._id), question]),
    );
    const answerByQuestion = new Map<string, unknown>();

    for (const answer of dto.answers) {
      if (answerByQuestion.has(answer.questionId)) {
        throw new BadRequestException(
          'Питання не може мати декілька відповідей',
        );
      }
      if (!questionById.has(answer.questionId)) {
        throw new BadRequestException('Відповідь містить невідоме питання');
      }
      answerByQuestion.set(answer.questionId, answer.value);
    }

    const normalizedAnswers: { question: Types.ObjectId; value: unknown }[] =
      [];
    for (const question of questions) {
      const questionId = this.idToString(question._id);
      const hasAnswer = answerByQuestion.has(questionId);
      const normalized = hasAnswer
        ? this.normalizeAnswerValue(question, answerByQuestion.get(questionId))
        : undefined;

      if (normalized === undefined) {
        if (question.required) {
          throw new BadRequestException('Заповніть усі обовʼязкові питання');
        }
        continue;
      }

      normalizedAnswers.push({
        question: this.toObjectId(questionId),
        value: normalized,
      });
    }

    return normalizedAnswers;
  }

  private normalizeAnswerValue(
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

  private aggregateQuestionResults(
    questions: SurveyQuestionDocument[],
    responses: SurveyResponseDocument[],
  ): QuestionResult[] {
    const answerValuesByQuestion = new Map<string, unknown[]>();

    for (const response of responses) {
      for (const answer of response.answers) {
        const questionId = this.idToString(answer.question);
        answerValuesByQuestion.set(questionId, [
          ...(answerValuesByQuestion.get(questionId) ?? []),
          answer.value,
        ]);
      }
    }

    return questions.map((question) => {
      const questionId = this.idToString(question._id);
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

        const result: ChoiceQuestionResult = {
          ...base,
          type: question.type,
          options: question.options.map((option) => {
            const count = counts.get(option) ?? 0;
            return {
              value: option,
              count,
              percentage: this.percentage(count, values.length),
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

        const result: RatingQuestionResult = {
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
              percentage: this.percentage(count, ratings.length),
            };
          }),
        };
        return result;
      }

      const result: TextQuestionResult = {
        ...base,
        type: SurveyQuestionType.TEXT,
        answers: values.filter(
          (value): value is string => typeof value === 'string',
        ),
      };
      return result;
    });
  }

  private normalizeSurveyDates(
    startDate?: string,
    endDate?: string,
  ): { startDate?: Date; endDate?: Date } {
    const normalizedStart = startDate ? new Date(startDate) : undefined;
    const normalizedEnd = endDate ? new Date(endDate) : undefined;

    if (normalizedStart && Number.isNaN(normalizedStart.getTime())) {
      throw new BadRequestException('Некоректна дата початку');
    }
    if (normalizedEnd && Number.isNaN(normalizedEnd.getTime())) {
      throw new BadRequestException('Некоректна дата завершення');
    }
    if (normalizedStart && normalizedEnd && normalizedEnd <= normalizedStart) {
      throw new BadRequestException(
        'Дата завершення повинна бути пізніше дати початку',
      );
    }

    return {
      startDate: normalizedStart,
      endDate: normalizedEnd,
    };
  }

  private normalizeTargetIds(
    targetType: SurveyTargetType,
    targetIds?: string[],
  ): string[] {
    const normalized = [
      ...new Set((targetIds ?? []).map((id) => id.trim())),
    ].filter(Boolean);

    if (targetType === SurveyTargetType.ALL) {
      if (normalized.length > 0) {
        throw new BadRequestException(
          'Для targetType=all список targetIds повинен бути порожнім',
        );
      }
      return [];
    }

    if (normalized.length === 0) {
      throw new BadRequestException(
        'Для цільових груп або курсів потрібно вказати targetIds',
      );
    }

    const validTargetId = /^[A-Za-z0-9:_-]{1,80}$/;
    if (!normalized.every((id) => validTargetId.test(id))) {
      throw new BadRequestException(
        'targetIds містить некоректний ідентифікатор',
      );
    }

    return normalized;
  }

  private async isSurveyTargetedToUser(
    survey: SurveyDocument,
    user: AuthenticatedUser,
    profile: UserDto,
  ): Promise<boolean> {
    if (survey.targetType === SurveyTargetType.ALL) {
      return user.role === Role.STUDENT || user.role === Role.TEACHER;
    }

    if (survey.targetType === SurveyTargetType.GROUPS) {
      return (
        user.role === Role.STUDENT &&
        profile.studentProfile?.group !== undefined &&
        profile.studentProfile.group !== null &&
        survey.targetIds.includes(profile.studentProfile.group)
      );
    }

    if (user.role !== Role.STUDENT && user.role !== Role.TEACHER) {
      return false;
    }

    return this.coursesService.isUserAssignedToCourseTargets({
      userId: user.sub,
      role: user.role,
      targetIds: survey.targetIds,
      groupId: profile.studentProfile?.group,
    });
  }

  private async closeExpiredSurveys(now = new Date()): Promise<void> {
    await this.surveyModel
      .updateMany(
        {
          status: SurveyStatus.ACTIVE,
          endDate: { $lt: now },
        },
        {
          $set: {
            status: SurveyStatus.CLOSED,
            closedAt: now,
          },
        },
      )
      .exec();
  }

  private async notifySurveyPublished(survey: SurveyDocument): Promise<void> {
    try {
      const recipients = await this.resolveNotificationRecipients(survey);
      const surveyId = this.idToString(survey._id);
      const payload = {
        title: 'Нове опитування',
        message: survey.title,
        type: NotificationType.NEW_SURVEY,
        actionUrl: `/surveys/${surveyId}`,
        entityType: 'survey',
        entityId: surveyId,
        important: true,
      };

      if (recipients.length === 0) {
        this.logger.warn(
          `Survey notification skipped: no recipients for survey ${this.idToString(survey._id)}`,
        );
        return;
      }

      await this.notificationsService.createMany(
        recipients.map((userId) => ({
          ...payload,
          userId,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Survey notification was not created: ${message}`);
    }
  }

  private async resolveNotificationRecipients(
    survey: SurveyDocument,
  ): Promise<string[]> {
    if (survey.targetType === SurveyTargetType.ALL) {
      return this.usersService.findActiveUserIdsByRoles([
        Role.STUDENT,
        Role.TEACHER,
      ]);
    }

    if (survey.targetType === SurveyTargetType.GROUPS) {
      const studentsByGroup = await Promise.all(
        survey.targetIds.map((groupId) =>
          this.usersService.getStudentsByGroup(groupId),
        ),
      );
      return [
        ...new Set(
          studentsByGroup
            .flat()
            .map((student) => student.id)
            .filter(Boolean),
        ),
      ];
    }

    return this.coursesService.findUserIdsByCourseTargets(survey.targetIds);
  }

  private formatSurvey(
    survey: SurveyDocument,
    questions: SurveyQuestionDocument[] = [],
  ): SurveyView {
    const description = this.trimOptional(survey.description);
    return {
      id: this.idToString(survey._id),
      title: survey.title,
      ...(description ? { description } : {}),
      status: survey.status,
      anonymous: survey.anonymous,
      targetType: survey.targetType,
      targetIds: survey.targetIds,
      createdBy: this.idToString(survey.createdBy),
      ...(survey.startDate
        ? { startDate: survey.startDate.toISOString() }
        : {}),
      ...(survey.endDate ? { endDate: survey.endDate.toISOString() } : {}),
      ...(survey.publishedAt
        ? { publishedAt: survey.publishedAt.toISOString() }
        : {}),
      ...(survey.closedAt ? { closedAt: survey.closedAt.toISOString() } : {}),
      ...(survey.createdAt
        ? { createdAt: survey.createdAt.toISOString() }
        : {}),
      ...(survey.updatedAt
        ? { updatedAt: survey.updatedAt.toISOString() }
        : {}),
      questions: questions.map((question) => this.formatQuestion(question)),
    };
  }

  private formatQuestion(question: SurveyQuestionDocument): SurveyQuestionView {
    return {
      id: this.idToString(question._id),
      type: question.type,
      text: question.text,
      options: question.options,
      required: question.required,
      order: question.order,
    };
  }

  private formatResponse(response: SurveyResponseDocument): SurveyResponseView {
    return {
      id: this.idToString(response._id),
      surveyId: this.idToString(response.survey),
      answers: response.answers.map((answer) => ({
        questionId: this.idToString(answer.question),
        value: answer.value,
      })),
      submittedAt: response.submittedAt.toISOString(),
    };
  }

  private trimRequired(value: string, message: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(message);
    }
    return normalized;
  }

  private trimOptional(value?: string): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  private percentage(count: number, total: number): number {
    if (total === 0) return 0;
    return Number(((count / total) * 100).toFixed(2));
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Некоректний ID');
    }
    return new Types.ObjectId(id);
  }

  private idToString(value: unknown): string {
    if (value instanceof Types.ObjectId) {
      return value.toHexString();
    }
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object' && '_id' in value) {
      return this.idToString((value as { _id?: unknown })._id);
    }
    return '';
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }

  private escapeCsv(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
