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
import { toId } from '../common/utils/to-id.util';
import { UsersService } from '../users/users.service';
import {
  CreateSurveyDto,
  SubmitSurveyResponseDto,
  SurveyDeleteResultDto,
  SurveyDto,
  SurveyResponseStateDto,
  SurveyResultsDto,
  SurveySubmissionResultDto,
  SurveyQueryDto,
  UpdateSurveyDto,
} from './dto';
import {
  normalizeSurveyQuestions,
  validateAndNormalizeSurveyAnswers,
} from './survey-answer.validator';
import { SurveyAccessPolicy } from './survey-access.policy';
import { SurveyAudienceService } from './survey-audience.service';
import { mapSurveyResponseToDto, mapSurveyToDto } from './survey.mapper';
import {
  buildSurveyResultsCsv,
  buildSurveyResultsXlsx,
} from './survey-results-exporter';
import {
  aggregateSurveyQuestionResults,
  percentage,
} from './survey-results.aggregator';
import {
  Survey,
  SurveyCompletion,
  SurveyCompletionDocument,
  SurveyDocument,
  SurveyQuestion,
  SurveyQuestionDocument,
  SurveyResponse,
  SurveyResponseDocument,
  SurveyStatus,
  SurveyTargetType,
} from './schemas';
import { SurveyDraftSnapshot } from './types';
import { DomainAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { AuditLogService } from '../audit-log/audit-log.service';

const surveyTargetTypesWithoutIds = new Set<SurveyTargetType>([
  SurveyTargetType.ALL,
  SurveyTargetType.TEACHERS,
  SurveyTargetType.STUDENTS_TEACHERS,
]);

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);

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
    private readonly audienceService: SurveyAudienceService,
    private readonly accessPolicy: SurveyAccessPolicy,
    private readonly auditLogService?: AuditLogService,
  ) {}

  async create(
    dto: CreateSurveyDto,
    user: AuthenticatedUser,
  ): Promise<SurveyDto> {
    this.ensureCanCreateSurvey(user);
    const dates = this.normalizeSurveyDates(dto.startDate, dto.endDate);
    const createdBy = this.toObjectId(user.sub);
    const questionPayload = normalizeSurveyQuestions(dto.questions);
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

      return mapSurveyToDto(survey, questions);
    } catch (error) {
      await this.surveyModel.deleteOne({ _id: survey._id }).exec();
      throw error;
    }
  }

  async findAll(
    query: SurveyQueryDto,
    user: AuthenticatedUser,
  ): Promise<SurveyDto[]> {
    this.ensureCanListManagedSurveys(user);
    await this.closeExpiredSurveys();

    const filter: Record<string, unknown> = {};
    const search = query.search?.trim();
    if (search) {
      filter.title = {
        $regex: this.escapeRegex(search),
        $options: 'i',
      };
    }
    if (query.status) filter.status = query.status;
    if (query.targetType) filter.targetType = query.targetType;
    if (!this.accessPolicy.hasGlobalManagementScope(user)) {
      filter.createdBy = this.toObjectId(user.sub);
    }

    const surveys = await this.surveyModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
    const questionsBySurvey = await this.loadQuestionsForSurveys(surveys);

    return surveys.map((survey) =>
      mapSurveyToDto(survey, questionsBySurvey.get(toId(survey._id)) ?? []),
    );
  }

  async findActiveForUser(user: AuthenticatedUser): Promise<SurveyDto[]> {
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
      if (await this.audienceService.isTargetedToUser(survey, user, profile)) {
        visibleSurveys.push(survey);
      }
    }
    const questionsBySurvey =
      await this.loadQuestionsForSurveys(visibleSurveys);
    const completedSurveyIds = new Set<string>();
    if (visibleSurveys.length > 0) {
      const completions = await this.completionModel
        .find({
          survey: { $in: visibleSurveys.map((survey) => survey._id) },
          user: this.toObjectId(user.sub),
        })
        .select('survey')
        .exec();
      completions.forEach((completion) => {
        completedSurveyIds.add(toId(completion.survey));
      });
    }

    return visibleSurveys.map((survey) =>
      mapSurveyToDto(
        survey,
        questionsBySurvey.get(toId(survey._id)) ?? [],
        completedSurveyIds.has(toId(survey._id)),
      ),
    );
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<SurveyDto> {
    await this.closeExpiredSurveys();

    const survey = await this.getSurveyOrThrow(id);
    const canView = await this.canViewSurvey(survey, user);
    if (!canView) {
      throw new ForbiddenException('Немає доступу до цього опитування');
    }

    const questions = await this.getQuestionsForSurvey(survey._id);
    return mapSurveyToDto(survey, questions);
  }

  async update(
    id: string,
    dto: UpdateSurveyDto,
    user: AuthenticatedUser,
  ): Promise<SurveyDto> {
    const survey = await this.getSurveyOrThrow(id);
    this.ensureCanManageSurvey(survey, user);
    this.ensureDraftSurvey(survey);
    const previousQuestions = await this.getQuestionsForSurvey(survey._id);
    const normalizedQuestions =
      dto.questions === undefined
        ? undefined
        : normalizeSurveyQuestions(dto.questions);
    const previousSurveyState: SurveyDraftSnapshot = {
      title: survey.title,
      description: survey.description,
      anonymous: survey.anonymous,
      targetType: survey.targetType,
      targetIds: [...survey.targetIds],
      startDate: survey.startDate,
      endDate: survey.endDate,
    };

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

    let questions = previousQuestions;
    if (normalizedQuestions !== undefined) {
      await this.questionModel.deleteMany({ survey: savedSurvey._id }).exec();
      try {
        questions = await this.questionModel.insertMany(
          normalizedQuestions.map((question) => ({
            ...question,
            survey: savedSurvey._id,
          })),
          { ordered: true },
        );
      } catch (error) {
        await this.restoreSurveyDraft(
          savedSurvey,
          previousSurveyState,
          previousQuestions,
        );
        throw error;
      }
    }

    return mapSurveyToDto(savedSurvey, questions);
  }

  async publish(
    id: string,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<SurveyDto> {
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
    if (!survey.startDate || !survey.endDate) {
      throw new BadRequestException(
        'Вкажіть дату початку та дату завершення опитування',
      );
    }
    if (survey.endDate <= survey.startDate) {
      throw new BadRequestException(
        'Дата завершення повинна бути пізніше дати початку',
      );
    }
    if (survey.endDate <= now) {
      throw new BadRequestException('Дата завершення вже минула');
    }
    const expectedRecipients =
      await this.audienceService.countExpectedRecipients(survey);
    if (expectedRecipients === 0) {
      throw new BadRequestException(
        'Для вибраної аудиторії не знайдено активних отримувачів',
      );
    }

    const savedSurvey = await this.surveyModel
      .findOneAndUpdate(
        { _id: survey._id, status: SurveyStatus.DRAFT },
        {
          $set: {
            status: SurveyStatus.ACTIVE,
            startDate: survey.startDate,
            publishedAt: now,
            expectedRecipients,
          },
          $unset: { closedAt: 1 },
        },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!savedSurvey) {
      throw new ConflictException(
        'Статус опитування вже змінився. Оновіть сторінку.',
      );
    }

    await this.audienceService.notifyPublished(savedSurvey);
    await audit?.record({
      action: AUDIT_ACTIONS.SURVEY_PUBLISH,
      targetEntity: 'survey',
      targetId: toId(savedSurvey._id),
      details: {
        title: savedSurvey.title,
        before: { status: SurveyStatus.DRAFT },
        after: { status: savedSurvey.status },
        targetType: savedSurvey.targetType,
        targetCount: savedSurvey.targetIds.length,
        expectedRecipients: savedSurvey.expectedRecipients,
      },
    });

    return mapSurveyToDto(savedSurvey, questions);
  }

  async close(
    id: string,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<SurveyDto> {
    const survey = await this.getSurveyOrThrow(id);
    this.ensureCanManageSurvey(survey, user);

    if (survey.status !== SurveyStatus.ACTIVE) {
      throw new BadRequestException('Закрити можна лише активне опитування');
    }

    const savedSurvey = await this.surveyModel
      .findOneAndUpdate(
        { _id: survey._id, status: SurveyStatus.ACTIVE },
        {
          $set: {
            status: SurveyStatus.CLOSED,
            closedAt: new Date(),
          },
        },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!savedSurvey) {
      throw new ConflictException(
        'Статус опитування вже змінився. Оновіть сторінку.',
      );
    }

    const questions = await this.getQuestionsForSurvey(savedSurvey._id);
    await audit?.record({
      action: AUDIT_ACTIONS.SURVEY_CLOSE,
      targetEntity: 'survey',
      targetId: toId(savedSurvey._id),
      details: {
        title: savedSurvey.title,
        before: { status: SurveyStatus.ACTIVE },
        after: { status: savedSurvey.status },
        targetType: savedSurvey.targetType,
        expectedRecipients: savedSurvey.expectedRecipients,
      },
    });

    return mapSurveyToDto(savedSurvey, questions);
  }

  async remove(
    id: string,
    user: AuthenticatedUser,
  ): Promise<SurveyDeleteResultDto> {
    if (!this.accessPolicy.canDelete(user)) {
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
  ): Promise<SurveySubmissionResultDto> {
    await this.closeExpiredSurveys();

    const survey = await this.getSurveyOrThrow(id);
    await this.ensureCanRespond(survey, user);

    const questions = await this.getQuestionsForSurvey(survey._id);
    const answers = validateAndNormalizeSurveyAnswers(questions, dto);
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
  ): Promise<SurveyResponseStateDto> {
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
      response: response ? mapSurveyResponseToDto(response) : null,
    };
  }

  async getResults(
    id: string,
    user: AuthenticatedUser,
  ): Promise<SurveyResultsDto> {
    await this.closeExpiredSurveys();

    const survey = await this.getSurveyOrThrow(id);
    this.ensureCanViewResults(survey, user);
    this.ensureResultsAvailable(survey);

    return this.buildResults(survey);
  }

  async exportResultsCsv(id: string, user: AuthenticatedUser): Promise<Buffer> {
    const results = await this.getExportableResults(id, user);
    return Buffer.from(buildSurveyResultsCsv(results), 'utf8');
  }

  async exportResultsXlsx(
    id: string,
    user: AuthenticatedUser,
  ): Promise<Buffer> {
    const results = await this.getExportableResults(id, user);
    return buildSurveyResultsXlsx(results);
  }

  private async buildResults(
    survey: SurveyDocument,
  ): Promise<SurveyResultsDto> {
    const questions = await this.getQuestionsForSurvey(survey._id);
    const [responses, totalCompletions] = await Promise.all([
      this.responseModel
        .find({ survey: survey._id })
        .sort({ submittedAt: 1 })
        .exec(),
      this.completionModel.countDocuments({ survey: survey._id }).exec(),
    ]);
    const expectedRecipients =
      survey.expectedRecipients ??
      (await this.audienceService.countExpectedRecipients(survey));

    return {
      survey: mapSurveyToDto(survey, questions),
      anonymous: survey.anonymous,
      totalResponses: responses.length,
      totalCompletions,
      expectedRecipients,
      completionRate: percentage(totalCompletions, expectedRecipients),
      questions: aggregateSurveyQuestionResults(questions, responses),
    };
  }

  private async getExportableResults(
    id: string,
    user: AuthenticatedUser,
  ): Promise<SurveyResultsDto> {
    await this.closeExpiredSurveys();

    const survey = await this.getSurveyOrThrow(id);
    this.ensureCanViewResults(survey, user);
    this.ensureExportAvailable(survey);

    return this.buildResults(survey);
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
    if (!(await this.audienceService.isTargetedToUser(survey, user, profile))) {
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
    if (!(await this.audienceService.isTargetedToUser(survey, user, profile))) {
      throw new ForbiddenException(
        'Опитування недоступне для цього користувача',
      );
    }
  }

  private async canViewSurvey(
    survey: SurveyDocument,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    if (this.accessPolicy.canManage(survey, user)) {
      return true;
    }

    if (survey.status === SurveyStatus.DRAFT) {
      return false;
    }

    const profile = await this.usersService.findOne(user.sub);
    return this.audienceService.isTargetedToUser(survey, user, profile);
  }

  private ensureCanManageSurvey(
    survey: SurveyDocument,
    user: AuthenticatedUser,
  ): void {
    if (!this.accessPolicy.canManage(survey, user)) {
      throw new ForbiddenException('Немає прав для керування цим опитуванням');
    }
  }

  private ensureCanCreateSurvey(user: AuthenticatedUser): void {
    if (!this.accessPolicy.canCreate(user)) {
      throw new ForbiddenException('Немає прав для створення опитувань');
    }
  }

  private ensureCanListManagedSurveys(user: AuthenticatedUser): void {
    if (!this.accessPolicy.canListManagedSurveys(user)) {
      throw new ForbiddenException('Немає прав для перегляду опитувань');
    }
  }

  private ensureCanViewResults(
    survey: SurveyDocument,
    user: AuthenticatedUser,
  ): void {
    if (!this.accessPolicy.canViewResults(survey, user)) {
      throw new ForbiddenException('Немає прав для перегляду результатів');
    }
  }

  private ensureResultsAvailable(survey: SurveyDocument): void {
    if (survey.status === SurveyStatus.DRAFT) {
      throw new BadRequestException(
        'Результати доступні лише після публікації опитування',
      );
    }
  }

  private ensureExportAvailable(survey: SurveyDocument): void {
    if (survey.status !== SurveyStatus.CLOSED) {
      throw new BadRequestException(
        'Експорт результатів доступний лише після закриття опитування',
      );
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
      const surveyId = toId(question.survey);
      const surveyQuestions = grouped.get(surveyId);
      if (surveyQuestions) {
        surveyQuestions.push(question);
      } else {
        grouped.set(surveyId, [question]);
      }
    }

    return grouped;
  }

  private normalizeSurveyDates(
    startDate?: string,
    endDate?: string,
  ): { startDate: Date; endDate: Date } {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Вкажіть дату початку та дату завершення опитування',
      );
    }

    const normalizedStart = new Date(startDate);
    const normalizedEnd = new Date(endDate);

    if (Number.isNaN(normalizedStart.getTime())) {
      throw new BadRequestException('Некоректна дата початку');
    }
    if (Number.isNaN(normalizedEnd.getTime())) {
      throw new BadRequestException('Некоректна дата завершення');
    }
    if (normalizedEnd <= normalizedStart) {
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

    if (surveyTargetTypesWithoutIds.has(targetType)) {
      if (normalized.length > 0) {
        throw new BadRequestException(
          'Для обраної аудиторії список targetIds повинен бути порожнім',
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

  private async closeExpiredSurveys(now = new Date()): Promise<void> {
    const result = await this.surveyModel
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

    if (result.modifiedCount > 0) {
      await this.auditLogService?.logAction({
        userId: null,
        userLogin: 'system',
        action: AUDIT_ACTIONS.SURVEY_CLOSE,
        targetEntity: 'survey',
        details: {
          automated: true,
          closedCount: result.modifiedCount,
          before: { status: SurveyStatus.ACTIVE },
          after: { status: SurveyStatus.CLOSED },
          cutoff: now,
        },
        ipAddress: 'internal',
        userAgent: 'survey-lifecycle',
        result: 'success',
      });
    }
  }

  private async restoreSurveyDraft(
    survey: SurveyDocument,
    previousSurveyState: SurveyDraftSnapshot,
    previousQuestions: SurveyQuestionDocument[],
  ): Promise<void> {
    try {
      await this.questionModel.deleteMany({ survey: survey._id }).exec();
      if (previousQuestions.length > 0) {
        await this.questionModel.insertMany(
          previousQuestions.map((question) => ({
            survey: survey._id,
            type: question.type,
            text: question.text,
            options: [...question.options],
            required: question.required,
            order: question.order,
          })),
          { ordered: true },
        );
      }

      Object.assign(survey, previousSurveyState);
      await survey.save();
    } catch (rollbackError) {
      const message =
        rollbackError instanceof Error
          ? rollbackError.message
          : 'unknown rollback error';
      this.logger.error(
        `Failed to restore survey draft ${toId(survey._id)}: ${message}`,
      );
    }
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

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Некоректний ID');
    }
    return new Types.ObjectId(id);
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
