import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../common/types/roles.enum';
import { CoursesService } from '../courses/courses/courses.service';
import { UsersService } from '../users/users.service';
import { SurveyQuestionType, SurveyStatus, SurveyTargetType } from './schemas';
import { SurveysService } from './surveys.service';

type QueryMock<T> = {
  exec: jest.Mock<Promise<T>, []>;
};

type SortQueryMock<T> = {
  sort: jest.Mock<QueryMock<T>, [Record<string, 1 | -1>]>;
};

const execQuery = <T>(value: T): QueryMock<T> => {
  const exec = jest.fn<Promise<T>, []>();
  exec.mockResolvedValue(value);
  return { exec };
};

const sortQuery = <T>(value: T): SortQueryMock<T> => {
  const sort = jest.fn<QueryMock<T>, [Record<string, 1 | -1>]>();
  sort.mockReturnValue(execQuery(value));
  return { sort };
};

const createSurveyDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId('6622b2a00f3a22d5b625d170'),
  title: 'Course feedback',
  status: SurveyStatus.ACTIVE,
  anonymous: true,
  targetType: SurveyTargetType.ALL,
  targetIds: [],
  createdBy: new Types.ObjectId('6622b2a00f3a22d5b625d171'),
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2027-01-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  save: jest.fn(),
  deleteOne: jest.fn(),
  ...overrides,
});

const createQuestionDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  survey: new Types.ObjectId('6622b2a00f3a22d5b625d170'),
  type: SurveyQuestionType.SINGLE,
  text: 'How was the course?',
  options: ['Good', 'Great'],
  required: true,
  order: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('SurveysService', () => {
  let service: SurveysService;
  let surveyModel: {
    findById: jest.Mock;
    updateMany: jest.Mock;
  };
  let questionModel: {
    find: jest.Mock;
  };
  let responseModel: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let completionModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    countDocuments: jest.Mock;
  };
  let usersService: jest.Mocked<
    Pick<UsersService, 'findOne' | 'findActiveUserIdsByRoles'>
  >;
  let coursesService: jest.Mocked<
    Pick<
      CoursesService,
      'isUserAssignedToCourseTargets' | 'findStudentIdsByCourseTargets'
    >
  >;
  let notificationsService: jest.Mocked<
    Pick<NotificationsService, 'create' | 'createMany'>
  >;

  const userId = new Types.ObjectId('6622b2a00f3a22d5b625d172');
  const surveyDoc = createSurveyDoc();
  const questionDoc = createQuestionDoc({
    _id: new Types.ObjectId('6622b2a00f3a22d5b625d173'),
  });

  beforeEach(() => {
    surveyModel = {
      findById: jest.fn().mockReturnValue(execQuery(surveyDoc)),
      updateMany: jest.fn().mockReturnValue(execQuery({ modifiedCount: 0 })),
    };
    questionModel = {
      find: jest.fn().mockReturnValue(sortQuery([questionDoc])),
    };
    responseModel = {
      create: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockReturnValue(sortQuery([])),
      findOne: jest.fn().mockReturnValue(execQuery(null)),
    };
    completionModel = {
      create: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockReturnValue(execQuery(null)),
      countDocuments: jest.fn().mockReturnValue(execQuery(0)),
    };
    usersService = {
      findOne: jest.fn().mockResolvedValue({
        id: userId.toHexString(),
        login: 'student',
        email: 'student@example.com',
        role: Role.STUDENT,
        firstName: 'Test',
        lastName: 'Student',
        status: 'active',
        studentProfile: {
          group: '6622b2a00f3a22d5b625d174',
          recordBookNumber: 'RB-1',
          year: 1,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      findActiveUserIdsByRoles: jest
        .fn()
        .mockResolvedValue([userId.toHexString()]),
    };
    coursesService = {
      isUserAssignedToCourseTargets: jest.fn().mockResolvedValue(false),
      findStudentIdsByCourseTargets: jest
        .fn()
        .mockResolvedValue([userId.toHexString()]),
    };
    notificationsService = {
      create: jest.fn(),
      createMany: jest.fn(),
    };

    service = new SurveysService(
      surveyModel as never,
      questionModel as never,
      responseModel as never,
      completionModel as never,
      usersService as unknown as UsersService,
      coursesService as unknown as CoursesService,
      notificationsService as unknown as NotificationsService,
    );
  });

  it('stores anonymous responses without user identity', async () => {
    const submitted = await service.respond(
      surveyDoc._id.toString(),
      {
        answers: [
          {
            questionId: questionDoc._id.toString(),
            value: 'Great',
          },
        ],
      },
      {
        sub: userId.toHexString(),
        login: 'student',
        role: Role.STUDENT,
      },
    );

    expect(submitted).toEqual(
      expect.objectContaining({ success: true, anonymous: true }),
    );
    expect(completionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        survey: surveyDoc._id,
        user: userId,
      }),
    );
    expect(responseModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        survey: surveyDoc._id,
        user: null,
      }),
    );
  });

  it('blocks duplicate submissions before response creation', async () => {
    completionModel.create.mockRejectedValueOnce({ code: 11000 });

    await expect(
      service.respond(
        surveyDoc._id.toString(),
        {
          answers: [
            {
              questionId: questionDoc._id.toString(),
              value: 'Great',
            },
          ],
        },
        {
          sub: userId.toHexString(),
          login: 'student',
          role: Role.STUDENT,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(responseModel.create).not.toHaveBeenCalled();
  });

  it('aggregates results without exposing respondent ids', async () => {
    const ratingQuestion = createQuestionDoc({
      _id: new Types.ObjectId('6622b2a00f3a22d5b625d175'),
      type: SurveyQuestionType.RATING,
      text: 'Rate it',
      options: [],
      order: 1,
    });
    const textQuestion = createQuestionDoc({
      _id: new Types.ObjectId('6622b2a00f3a22d5b625d176'),
      type: SurveyQuestionType.TEXT,
      text: 'Comment',
      options: [],
      order: 2,
      required: false,
    });

    questionModel.find.mockReturnValueOnce(
      sortQuery([questionDoc, ratingQuestion, textQuestion]),
    );
    responseModel.find.mockReturnValueOnce(
      sortQuery([
        {
          _id: new Types.ObjectId(),
          survey: surveyDoc._id,
          user: userId,
          submittedAt: new Date('2026-01-02T00:00:00.000Z'),
          answers: [
            { question: questionDoc._id, value: 'Great' },
            { question: ratingQuestion._id, value: 5 },
            { question: textQuestion._id, value: 'Helpful' },
          ],
        },
      ]),
    );
    completionModel.countDocuments.mockReturnValueOnce(execQuery(1));

    const results = await service.getResults(surveyDoc._id.toString(), {
      sub: '6622b2a00f3a22d5b625d171',
      login: 'admin',
      role: Role.ADMIN,
    });

    expect(results.totalResponses).toBe(1);
    expect(results.totalCompletions).toBe(1);
    expect(JSON.stringify(results)).not.toContain(userId.toHexString());
    expect(results.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          questionId: ratingQuestion._id.toString(),
          average: 5,
        }),
        expect.objectContaining({
          questionId: textQuestion._id.toString(),
          answers: ['Helpful'],
        }),
      ]),
    );
  });

  it('does not expose all-students surveys to teachers', async () => {
    usersService.findOne.mockResolvedValueOnce({
      id: userId.toHexString(),
      login: 'teacher',
      email: 'teacher@example.com',
      role: Role.TEACHER,
      firstName: 'Test',
      lastName: 'Teacher',
      status: 'active',
      teacherProfile: {
        department: '6622b2a00f3a22d5b625d177',
        position: 'Lecturer',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(
      service.findOne(surveyDoc._id.toString(), {
        sub: userId.toHexString(),
        login: 'teacher',
        role: Role.TEACHER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates one student-only new_survey notification on all-students publish', async () => {
    const draftSurvey = createSurveyDoc({
      status: SurveyStatus.DRAFT,
      startDate: new Date('2099-01-01T00:00:00.000Z'),
      save: jest.fn().mockImplementation(function save(this: {
        status: SurveyStatus;
        startDate?: Date;
        publishedAt?: Date;
      }) {
        return Promise.resolve(this);
      }),
    });

    surveyModel.findById.mockReturnValueOnce(execQuery(draftSurvey));
    await service.publish(draftSurvey._id.toString(), {
      sub: draftSurvey.createdBy.toString(),
      login: 'dean',
      role: Role.DEAN,
    });

    expect(draftSurvey.startDate?.getTime()).toBeLessThanOrEqual(Date.now());
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.NEW_SURVEY,
        title: 'Нове опитування',
        targetType: 'students',
        actionUrl: `/surveys/${draftSurvey._id.toString()}`,
        entityType: 'survey',
        entityId: draftSurvey._id.toString(),
      }),
    );
    expect(notificationsService.createMany).not.toHaveBeenCalled();
  });

  it('creates one new_survey notification per target group on publish', async () => {
    const groupIds = ['6622b2a00f3a22d5b625d174', '6622b2a00f3a22d5b625d175'];
    const draftSurvey = createSurveyDoc({
      status: SurveyStatus.DRAFT,
      targetType: SurveyTargetType.GROUPS,
      targetIds: groupIds,
    });
    draftSurvey.save = jest.fn().mockResolvedValue(draftSurvey);

    surveyModel.findById.mockReturnValueOnce(execQuery(draftSurvey));
    await service.publish(draftSurvey._id.toString(), {
      sub: draftSurvey.createdBy.toString(),
      login: 'dean',
      role: Role.DEAN,
    });

    expect(notificationsService.create).not.toHaveBeenCalled();
    expect(notificationsService.createMany).toHaveBeenCalledWith(
      groupIds.map((groupId) => ({
        type: NotificationType.NEW_SURVEY,
        title: 'Нове опитування',
        message: draftSurvey.title,
        important: true,
        targetType: 'group',
        groupId,
        actionUrl: `/surveys/${draftSurvey._id.toString()}`,
        entityType: 'survey',
        entityId: draftSurvey._id.toString(),
      })),
    );
  });

  it('creates personal notifications only for students assigned to a course target', async () => {
    const targetIds = ['6622b2a00f3a22d5b625d178'];
    const draftSurvey = createSurveyDoc({
      status: SurveyStatus.DRAFT,
      targetType: SurveyTargetType.COURSE,
      targetIds,
    });
    draftSurvey.save = jest.fn().mockResolvedValue(draftSurvey);

    surveyModel.findById.mockReturnValueOnce(execQuery(draftSurvey));
    await service.publish(draftSurvey._id.toString(), {
      sub: draftSurvey.createdBy.toString(),
      login: 'dean',
      role: Role.DEAN,
    });

    expect(coursesService.findStudentIdsByCourseTargets).toHaveBeenCalledWith(
      targetIds,
    );
    expect(notificationsService.create).not.toHaveBeenCalled();
    expect(notificationsService.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        type: NotificationType.NEW_SURVEY,
        title: 'Нове опитування',
        userId: userId.toHexString(),
        actionUrl: `/surveys/${draftSurvey._id.toString()}`,
        entityType: 'survey',
        entityId: draftSurvey._id.toString(),
      }),
    ]);
  });
});
