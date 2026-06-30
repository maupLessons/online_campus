import { Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { UsersService } from '../users/users.service';
import { NotificationsService } from './notifications.service';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { NotificationType } from './dto/create-notification.dto';

type QueryMock<T> = {
  exec: jest.Mock<Promise<T>, []>;
};

type LeanQueryMock<T> = {
  lean: jest.Mock<QueryMock<T>, []>;
};

type SortLeanQueryMock<T> = {
  sort: jest.Mock<LeanQueryMock<T>, [Record<string, 1 | -1>]>;
};

const execQuery = <T>(value: T): QueryMock<T> => {
  const exec = jest.fn<Promise<T>, []>();
  exec.mockResolvedValue(value);
  return { exec };
};

const leanQuery = <T>(value: T): LeanQueryMock<T> => {
  const lean = jest.fn<QueryMock<T>, []>();
  lean.mockReturnValue(execQuery(value));
  return { lean };
};

const sortLeanQuery = <T>(value: T): SortLeanQueryMock<T> => {
  const sort = jest.fn<LeanQueryMock<T>, [Record<string, 1 | -1>]>();
  sort.mockReturnValue(leanQuery(value));
  return { sort };
};

describe('NotificationsService', () => {
  const userId = '6622b2a00f3a22d5b625d172';
  const groupId = '6622b2a00f3a22d5b625d174';
  const notificationId = '6622b2a00f3a22d5b625d180';

  let notificationModel: {
    create: jest.Mock;
    insertMany: jest.Mock;
    find: jest.Mock<SortLeanQueryMock<unknown[]>, [Record<string, unknown>]>;
    countDocuments: jest.Mock<QueryMock<number>, [Record<string, unknown>]>;
    findOneAndUpdate: jest.Mock;
    updateMany: jest.Mock;
    deleteOne: jest.Mock;
  };
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;
  let service: NotificationsService;
  let realtime: jest.Mocked<Pick<NotificationsRealtimeService, 'publish'>>;

  beforeEach(() => {
    notificationModel = {
      create: jest.fn(),
      insertMany: jest.fn(),
      find: jest.fn<SortLeanQueryMock<unknown[]>, [Record<string, unknown>]>(),
      countDocuments: jest.fn<QueryMock<number>, [Record<string, unknown>]>(),
      findOneAndUpdate: jest.fn(),
      updateMany: jest.fn(),
      deleteOne: jest.fn(),
    };
    usersService = {
      findOne: jest.fn().mockResolvedValue({
        id: userId,
        login: 'student',
        email: 'student@example.com',
        role: Role.STUDENT,
        firstName: 'Test',
        lastName: 'Student',
        status: 'active',
        studentProfile: {
          group: groupId,
          recordBookNumber: 'RB-1',
          year: 1,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    };
    realtime = { publish: jest.fn() };

    service = new NotificationsService(
      notificationModel as never,
      usersService as unknown as UsersService,
      realtime as unknown as NotificationsRealtimeService,
    );
  });

  it('loads legacy broadcast notifications without target metadata', async () => {
    notificationModel.find.mockReturnValueOnce(
      sortLeanQuery([
        {
          _id: new Types.ObjectId(notificationId),
          title: 'Нове опитування',
          message: 'Заповніть коротку форму',
          type: 'new_survey',
          readBy: [userId],
          actionUrl: 'https://example.com/phishing',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
    );

    const result = await service.findByUser(userId);

    expect(result).toEqual([
      expect.objectContaining({
        id: notificationId,
        title: 'Нове опитування',
        type: 'new_survey',
        targetType: 'all',
        readFlag: true,
      }),
    ]);
    expect(result[0]).not.toHaveProperty('actionUrl');
    const [findFilter] = notificationModel.find.mock.calls[0];
    const visibleTargets = findFilter.$or;
    expect(Array.isArray(visibleTargets)).toBe(true);
    expect(visibleTargets).toContainEqual({
      userId: null,
      targetType: { $exists: false },
    });
    expect(visibleTargets).toContainEqual({
      userId: { $exists: false },
      targetType: { $exists: false },
    });
  });

  it('includes student-targeted notifications for students', async () => {
    notificationModel.find.mockReturnValueOnce(sortLeanQuery([]));

    await service.findByUser(userId);

    const [findFilter] = notificationModel.find.mock.calls[0];
    const visibleTargets = findFilter.$or as Array<Record<string, unknown>>;
    expect(visibleTargets).toContainEqual({
      userId: null,
      targetType: 'students',
    });
    expect(visibleTargets).toContainEqual({
      userId: { $exists: false },
      targetType: 'students',
    });
    expect(visibleTargets).toContainEqual({
      userId: null,
      targetType: 'students_teachers',
    });
    expect(visibleTargets).not.toContainEqual({
      userId: null,
      targetType: 'teachers',
    });
  });

  it('includes teacher-targeted notifications for teachers only', async () => {
    usersService.findOne.mockResolvedValueOnce({
      id: userId,
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
    notificationModel.find.mockReturnValueOnce(sortLeanQuery([]));

    await service.findByUser(userId);

    const [findFilter] = notificationModel.find.mock.calls[0];
    const visibleTargets = findFilter.$or as Array<Record<string, unknown>>;
    expect(visibleTargets).not.toContainEqual({
      userId: null,
      targetType: 'students',
    });
    expect(visibleTargets).not.toContainEqual({
      userId: { $exists: false },
      targetType: 'students',
    });
    expect(visibleTargets).toContainEqual({
      userId: null,
      targetType: 'teachers',
    });
    expect(visibleTargets).toContainEqual({
      userId: { $exists: false },
      targetType: 'teachers',
    });
    expect(visibleTargets).toContainEqual({
      userId: null,
      targetType: 'students_teachers',
    });
  });

  it('counts unread notifications across ObjectId and legacy string read markers', async () => {
    notificationModel.countDocuments.mockReturnValueOnce(execQuery(2));

    const count = await service.getUnreadCount(userId);

    expect(count).toBe(2);
    const [countFilter] = notificationModel.countDocuments.mock.calls[0];
    const readByFilter = countFilter.readBy as { $nin?: unknown[] };
    expect(
      readByFilter.$nin?.some((value) => value instanceof Types.ObjectId),
    ).toBe(true);
    expect(readByFilter.$nin).toContain(userId);
  });

  it('counts only personal notifications for admins', async () => {
    usersService.findOne.mockResolvedValueOnce({
      id: userId,
      login: 'admin',
      email: 'admin@example.com',
      role: Role.ADMIN,
      firstName: 'System',
      lastName: 'Admin',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    notificationModel.countDocuments.mockReturnValueOnce(execQuery(0));

    const count = await service.getUnreadCount(userId);

    expect(count).toBe(0);
    const [countFilter] = notificationModel.countDocuments.mock.calls[0];
    const visibleTargets = countFilter.$or as Array<{ userId: unknown }>;
    expect(visibleTargets).toHaveLength(2);
    expect(visibleTargets[0]?.userId).toBeInstanceOf(Types.ObjectId);
    expect(visibleTargets[1]).toEqual({ userId });
  });

  it('loads every notification for admin management', async () => {
    const broadcastId = '6622b2a00f3a22d5b625d181';
    notificationModel.find.mockReturnValueOnce(
      sortLeanQuery([
        {
          _id: new Types.ObjectId(notificationId),
          userId: new Types.ObjectId(userId),
          title: 'Особисте',
          message: 'Персональне повідомлення',
          type: 'system',
          targetType: 'all',
          readBy: [userId],
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
        {
          _id: new Types.ObjectId(broadcastId),
          userId: null,
          title: 'Масове',
          message: 'Для всіх користувачів',
          type: 'announcement',
          targetType: 'all',
          readBy: [],
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
    );

    const result = await service.findAllForAdmin(userId);

    expect(notificationModel.find).toHaveBeenCalledWith({});
    expect(result).toEqual([
      expect.objectContaining({
        id: notificationId,
        title: 'Особисте',
        userId,
        readFlag: true,
      }),
      expect.objectContaining({
        id: broadcastId,
        title: 'Масове',
        userId: null,
        readFlag: false,
      }),
    ]);
  });

  it('combines visibility with search, type, importance, read, and date filters', async () => {
    notificationModel.find.mockReturnValueOnce(sortLeanQuery([]));

    await service.findByUser(userId, {
      search: 'schedule (updated)',
      type: NotificationType.SCHEDULE_CHANGE,
      important: true,
      readState: 'unread',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });

    const [findFilter] = notificationModel.find.mock.calls[0];
    const filters = findFilter.$and as Array<Record<string, unknown>>;
    expect(filters).toHaveLength(2);
    expect(filters[0]).toHaveProperty('$or');
    expect(filters[1]).toMatchObject({
      type: NotificationType.SCHEDULE_CHANGE,
      important: true,
    });
    expect(filters[1].createdAt).toEqual({
      $gte: new Date('2026-06-01'),
      $lte: new Date('2026-06-30T23:59:59.999Z'),
    });
    const readBy = filters[1].readBy as { $nin: unknown[] };
    expect(readBy.$nin).toContain(userId);
    const searchBranches = filters[1].$or as Array<{
      title?: RegExp;
      message?: RegExp;
    }>;
    expect(searchBranches[0]?.title?.test('Schedule (updated)')).toBe(true);
    expect(searchBranches[1]?.message?.test('Schedule updated')).toBe(false);
  });

  it('deletes notifications globally for admins', async () => {
    notificationModel.deleteOne.mockReturnValueOnce(
      execQuery({ acknowledged: true, deletedCount: 1 }),
    );

    await expect(service.deleteAsAdmin(notificationId)).resolves.toEqual({
      success: true,
    });
    const [deleteFilter] = notificationModel.deleteOne.mock.calls[0] as [
      { _id: unknown },
    ];
    expect(deleteFilter._id).toBeInstanceOf(Types.ObjectId);
  });

  it('updates notification content with sanitized internal action links', async () => {
    notificationModel.findOneAndUpdate.mockReturnValueOnce(
      leanQuery({
        _id: new Types.ObjectId(notificationId),
        title: 'Оновлене оголошення',
        message: 'Перевірте новий текст',
        type: 'announcement',
        targetType: 'all',
        groupId: null,
        readBy: [],
        important: true,
        actionUrl: '/notifications',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    );

    const result = await service.update(
      notificationId,
      {
        title: '  Оновлене оголошення  ',
        message: 'Перевірте новий текст',
        targetType: 'all',
        actionUrl: '/notifications',
        important: true,
      },
      userId,
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: notificationId,
        title: 'Оновлене оголошення',
        actionUrl: '/notifications',
        important: true,
      }),
    );
    const [filter, updateOperation, options] = notificationModel
      .findOneAndUpdate.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { $set?: Record<string, unknown> },
      Record<string, unknown>,
    ];

    expect(filter._id).toBeInstanceOf(Types.ObjectId);
    expect(updateOperation.$set).toMatchObject({
      title: 'Оновлене оголошення',
      targetType: 'all',
      groupId: null,
      important: true,
    });
    expect(options).toMatchObject({
      returnDocument: 'after',
      runValidators: true,
    });
  });
});
