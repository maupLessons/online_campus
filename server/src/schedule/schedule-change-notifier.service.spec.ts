import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { CreateNotificationDto } from '../notifications/dto/create-notification.dto';
import { ScheduleChangeNotifierService } from './schedule-change-notifier.service';
import { ScheduleDiffService } from './schedule-diff.service';
import { ScheduleEntryType } from './schedule.enums';

const studentIds = [new Types.ObjectId(), new Types.ObjectId()];
const mk = (i: number, over: Record<string, unknown> = {}) => ({
  key: `k${i}`,
  date: '2099-01-10',
  startTime: '08:30',
  endTime: '10:00',
  courseTitle: `Курс ${i}`,
  subjectKey: String(i),
  type: ScheduleEntryType.LECTURE,
  classroom: '101',
  teacherExternalId: '701',
  ...over,
});

// Review B5: `userModel.find` is called TWICE — first for the group's students, then for teachers
// via `teacherProfile.externalTeacherId` from the affected records. A single shared mock returned the same
// two users to both calls and made the `toHaveLength(2)` expectation unreachable (actually 4).
const chainOf = (ids: Types.ObjectId[]) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(ids.map((_id) => ({ _id }))),
});

function makeService(
  threshold = 20,
  recipients: { students?: Types.ObjectId[]; teachers?: Types.ObjectId[] } = {},
) {
  const createMany = jest
    .fn<Promise<void>, [CreateNotificationDto[]]>()
    .mockResolvedValue(undefined);
  const userModel = { find: jest.fn() };
  userModel.find
    .mockReturnValueOnce(chainOf(recipients.students ?? studentIds)) // 1st call — group students
    .mockReturnValueOnce(chainOf(recipients.teachers ?? [])); // 2nd call — teachers
  const groupModel = {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    }),
  };
  const config = new ConfigService({
    SCHEDULE_DIFF_MAX_AGE_MS: String(7 * 24 * 3600 * 1000),
    SCHEDULE_DIFF_BULK_THRESHOLD: String(threshold),
  });
  const service = new ScheduleChangeNotifierService(
    new ScheduleDiffService(),
    { createMany } as never,
    userModel as never,
    groupModel as never,
    config,
  );
  return { service, createMany };
}

const key = {
  groupCode: 'КН-11',
  termId: new Types.ObjectId().toHexString(),
  isExamSession: false,
};

describe('ScheduleChangeNotifierService', () => {
  it('sends nothing for the first lessons snapshot', async () => {
    const { service, createMany } = makeService();
    await service.handleRefresh({
      key,
      previousEntries: null,
      previousFetchedAt: null,
      nextEntries: [mk(1)],
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  // Spec §7.2 (exception to rule 1) and criterion §10.15.
  it('announces the first exam session snapshot once per student', async () => {
    const { service, createMany } = makeService();
    await service.handleRefresh({
      key: { ...key, isExamSession: true },
      previousEntries: null,
      previousFetchedAt: null,
      nextEntries: [mk(1, { controlType: 'exam' })],
    });
    const items = createMany.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      type: 'schedule_change',
      entityType: 'schedule',
      actionUrl: '/schedule/session',
    });
    expect(items[0].message).toContain('КН-11');
    expect(items[0].title).toContain('сесії');
  });

  it('uses the session action url and control type wording for session changes', async () => {
    const { service, createMany } = makeService();
    await service.handleRefresh({
      key: { ...key, isExamSession: true },
      previousEntries: [mk(1, { controlType: 'exam' })],
      previousFetchedAt: new Date(),
      nextEntries: [mk(1, { controlType: 'exam', classroom: '202' })],
    });
    const items = createMany.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0].actionUrl).toBe('/schedule/session?date=2099-01-10');
  });

  it('deduplicates a recipient who is both a student and a matched teacher', async () => {
    const teacherId = new Types.ObjectId();
    const { service, createMany } = makeService(20, {
      teachers: [teacherId, studentIds[0]],
    });
    await service.handleRefresh({
      key,
      previousEntries: [mk(1)],
      previousFetchedAt: new Date(),
      nextEntries: [mk(1, { classroom: '202' })],
    });
    const items = createMany.mock.calls[0][0];
    expect(items).toHaveLength(3); // 2 students + 1 teacher, no duplicate of studentIds[0]
    expect(new Set(items.map((i) => i.userId)).size).toBe(3);
  });

  it('sends one notification per student for a single classroom change', async () => {
    const { service, createMany } = makeService();
    await service.handleRefresh({
      key,
      previousEntries: [mk(1)],
      previousFetchedAt: new Date(),
      nextEntries: [mk(1, { classroom: '202' })],
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    const items = createMany.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      type: 'schedule_change',
      entityType: 'schedule',
      actionUrl: '/schedule?date=2099-01-10',
      userId: studentIds[0].toHexString(),
    });
    expect(items[0].title).toContain('Змінено');
    expect(items[0].targetType).toBeUndefined(); // personal notification, not broadcast
  });

  it('treats an outdated previous snapshot as the first one', async () => {
    const { service, createMany } = makeService();
    await service.handleRefresh({
      key,
      previousEntries: [mk(1)],
      previousFetchedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
      nextEntries: [mk(1, { classroom: '202' })],
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('aggregates when changes exceed the threshold', async () => {
    const { service, createMany } = makeService(20);
    const prev = Array.from({ length: 30 }, (_, i) => mk(i));
    const next = prev.map((e) => ({ ...e, classroom: '303' }));
    await service.handleRefresh({
      key,
      previousEntries: prev,
      previousFetchedAt: new Date(),
      nextEntries: next,
    });
    const items = createMany.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0].message).toContain('КН-11');
  });

  it('aggregates when more than 30% of entries changed', async () => {
    const { service, createMany } = makeService(20);
    const prev = Array.from({ length: 10 }, (_, i) => mk(i));
    const next = prev.map((e, i) => (i < 4 ? { ...e, classroom: '303' } : e));
    await service.handleRefresh({
      key,
      previousEntries: prev,
      previousFetchedAt: new Date(),
      nextEntries: next,
    });
    expect(createMany.mock.calls[0][0]).toHaveLength(2);
  });

  // Review (round 1): the denominator of the 30% rule must count only future entries (the same
  // set as diff()). Past lessons inflate the total and understate the % — without the fix this case
  // (2/4 = 50% of future, but 2/10 = 20% of the whole term) would have sent per-record, not aggregated.
  it('scopes the 30% denominator to future entries, not the whole term', async () => {
    const { service, createMany } = makeService(20);
    const past = Array.from({ length: 6 }, (_, i) =>
      mk(i, { date: '2020-01-01' }),
    );
    const future = Array.from({ length: 4 }, (_, i) => mk(i + 6));
    const prev = [...past, ...future];
    const next = prev.map((e, i) =>
      i === 6 || i === 7 ? { ...e, classroom: '303' } : e,
    );
    await service.handleRefresh({
      key,
      previousEntries: prev,
      previousFetchedAt: new Date(),
      nextEntries: next,
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    const items = createMany.mock.calls[0][0];
    expect(items).toHaveLength(2); // one aggregated notification per each of 2 students
    expect(items[0].title).toBe('Розклад оновлено');
    expect(items[0].message).toContain('КН-11');
  });
});
