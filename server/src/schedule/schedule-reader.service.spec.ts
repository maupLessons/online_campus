import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { ScheduleReaderService } from './schedule-reader.service';
import { ScheduleEntryType } from './schedule.enums';

const termId = new Types.ObjectId();
const term = {
  _id: termId,
  academicYear: '2026/2027',
  termNumber: 1,
  maupSemester: 1,
  maupAcademicYear: 2026,
};
const entry = (over: Record<string, unknown>) => ({
  key: 'k',
  date: '2026-09-07',
  startTime: '08:30',
  endTime: '10:00',
  courseTitle: 'ОП',
  subjectKey: '1001',
  type: ScheduleEntryType.LECTURE,
  ...over,
});

function makeReader(opts: {
  profile?: unknown;
  snapshot?: unknown;
  stale?: boolean;
  teacherSnapshots?: unknown[];
  term?: unknown;
  links?: unknown[];
  teacherRefs?: {
    externalTeacherId: string | null;
    department: Types.ObjectId | null;
  };
  group?: unknown;
  canAccessGroup?: boolean;
  assignment?: unknown;
  isStale?: boolean | ((doc: unknown) => boolean);
}) {
  const snapshots = {
    getOrRefresh: jest.fn().mockResolvedValue({
      snapshot: opts.snapshot ?? null,
      stale: opts.stale ?? false,
      refreshed: false,
    }),
    getCached: jest.fn().mockResolvedValue(opts.snapshot ?? null),
    findByTeacher: jest.fn().mockResolvedValue(opts.teacherSnapshots ?? []),
    // Final wave I1: the reader delegates `meta.stale` to ScheduleSnapshotService.isStale.
    isStale: jest
      .fn()
      .mockImplementation((doc: unknown) =>
        typeof opts.isStale === 'function'
          ? opts.isStale(doc)
          : (opts.isStale ?? false),
      ),
  };
  const links = {
    loadForGroup: jest.fn().mockResolvedValue(opts.links ?? []),
    overlay: jest
      .fn()
      .mockImplementation(
        (entries: { key: string }[], ls: { url: string }[]) =>
          new Map(ls.length ? entries.map((e) => [e.key, ls[0].url]) : []),
      ),
  };
  const users = {
    getActiveStudentProfile: jest.fn().mockResolvedValue(opts.profile ?? null),
    getTeacherProfileRefs: jest
      .fn()
      .mockResolvedValue(
        opts.teacherRefs ?? { externalTeacherId: '701', department: null },
      ),
  };
  const terms = {
    getCurrent: jest.fn().mockResolvedValue('term' in opts ? opts.term : term),
    requireCurrent: jest
      .fn()
      .mockResolvedValue('term' in opts ? opts.term : term),
  };
  // findById is used by findUpcomingForAssignment (§5.2a), find — by the department_head link filter (§8).
  const chain = <T>(value: T) => ({
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });
  const assignments = {
    findById: jest.fn().mockReturnValue(chain(opts.assignment ?? null)),
    find: jest.fn().mockReturnValue(chain([])),
  };
  const groups = {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest
        .fn()
        .mockResolvedValue(
          'group' in opts
            ? opts.group
            : { _id: new Types.ObjectId(), code: 'КН-11' },
        ),
    }),
  };
  const access = {
    canAccessGroup: jest.fn().mockResolvedValue(opts.canAccessGroup ?? true),
  };
  const reader = new ScheduleReaderService(
    snapshots as never,
    links as never,
    users as never,
    terms as never,
    assignments as never,
    groups as never,
    access as never,
  );
  return { reader, snapshots, access, groups };
}

const student = {
  sub: new Types.ObjectId().toHexString(),
  login: 's',
  role: Role.STUDENT,
};
const teacher = {
  sub: new Types.ObjectId().toHexString(),
  login: 't',
  role: Role.TEACHER,
};
const dean = {
  sub: new Types.ObjectId().toHexString(),
  login: 'd',
  role: Role.DEAN,
};
const admin = {
  sub: new Types.ObjectId().toHexString(),
  login: 'a',
  role: Role.ADMIN,
};

// The default range is [todayKyiv(), +6 days] (resolveRange), so any test without explicit
// from/to would depend on the system date (review B4). We fix the time for the whole file.
beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-07T09:00:00.000Z'));
});
afterAll(() => {
  jest.useRealTimers();
});

describe('ScheduleReaderService.findMy', () => {
  it('returns no_current_term without touching the API', async () => {
    const { reader, snapshots } = makeReader({ term: null });
    const res = await reader.findMy(student, {}, false);
    expect(res).toEqual({
      entries: [],
      meta: { stale: false, reason: 'no_current_term' },
    });
    expect(snapshots.getOrRefresh).not.toHaveBeenCalled();
  });

  it('returns no_active_profile for a student without profile', async () => {
    const { reader } = makeReader({});
    const res = await reader.findMy(student, {}, false);
    expect(res.meta.reason).toBe('no_active_profile');
  });

  it('filters snapshot by range, flags online format and overlays links', async () => {
    const { reader, snapshots } = makeReader({
      profile: {
        _id: new Types.ObjectId(),
        externalStudentId: 'student-001',
        group: { _id: new Types.ObjectId(), code: 'КН-11' },
      },
      snapshot: {
        fetchedAt: new Date('2026-09-01T00:00:00Z'),
        entries: [
          entry({ key: 'a', classroom: '101' }),
          entry({ key: 'b', date: '2026-09-20', classroom: undefined }),
        ],
      },
      links: [{ url: 'https://meet' }],
    });
    const res = await reader.findMy(
      student,
      { from: '2026-09-15', to: '2026-09-30' },
      false,
    );
    expect(snapshots.getOrRefresh).toHaveBeenCalledWith(
      {
        groupCode: 'КН-11',
        termId: termId.toHexString(),
        isExamSession: false,
      },
      term,
      {
        studentId: 'student-001',
        recordBookNumber: undefined,
        actorUserId: student.sub,
      },
    );
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]).toMatchObject({
      id: 'b',
      onlineFormat: true,
      onlineUrl: 'https://meet',
      groupCode: 'КН-11',
    });
    expect(res.meta).toMatchObject({
      stale: false,
      fetchedAt: '2026-09-01T00:00:00.000Z',
      term: { academicYear: '2026/2027' },
    });
  });

  it('reports no_snapshot when API failed and no cache exists', async () => {
    const { reader } = makeReader({
      profile: {
        _id: new Types.ObjectId(),
        externalStudentId: 'x',
        group: { _id: new Types.ObjectId(), code: 'КН-11' },
      },
      snapshot: null,
      stale: true,
    });
    const res = await reader.findMy(student, {}, false);
    expect(res.meta).toEqual({
      term: {
        id: termId.toHexString(),
        academicYear: '2026/2027',
        termNumber: 1,
      },
      stale: true,
      reason: 'no_snapshot',
    });
  });

  it('rejects ranges longer than 62 days', async () => {
    const { reader } = makeReader({});
    await expect(
      reader.findMy(student, { from: '2026-01-01', to: '2026-04-01' }, false),
    ).rejects.toThrow('62');
  });

  it('builds a teacher view from all group snapshots', async () => {
    const { reader } = makeReader({
      teacherSnapshots: [
        {
          groupCode: 'КН-11',
          fetchedAt: new Date('2026-09-02T00:00:00Z'),
          entries: [
            entry({ key: 'a', teacherExternalId: '701' }),
            entry({ key: 'x', teacherExternalId: '702' }),
          ],
        },
        {
          groupCode: 'КН-12',
          fetchedAt: new Date('2026-09-01T00:00:00Z'),
          entries: [entry({ key: 'b', teacherExternalId: '701' })],
        },
      ],
    });
    // Explicit range instead of the default: the fixture entries have date '2026-09-07' (review B4).
    const res = await reader.findMy(
      teacher,
      { from: '2026-09-01', to: '2026-09-30' },
      false,
    );
    expect(res.entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(res.meta.fetchedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  // Final wave I1: previously `stale` for the teacher was hardcoded to `false`.
  it('flags stale when at least one of the teacher group snapshots is stale', async () => {
    const staleDoc = {
      groupCode: 'КН-11',
      fetchedAt: new Date('2026-09-02T00:00:00Z'),
      entries: [entry({ key: 'a', teacherExternalId: '701' })],
    };
    const freshDoc = {
      groupCode: 'КН-12',
      fetchedAt: new Date('2026-09-06T00:00:00Z'),
      entries: [entry({ key: 'b', teacherExternalId: '701' })],
    };
    const { reader } = makeReader({
      teacherSnapshots: [staleDoc, freshDoc],
      isStale: (doc) => doc === staleDoc,
    });
    const res = await reader.findMy(
      teacher,
      { from: '2026-09-01', to: '2026-09-30' },
      false,
    );
    expect(res.meta.stale).toBe(true);
  });

  it('does not flag stale when all teacher group snapshots are fresh', async () => {
    const { reader } = makeReader({
      teacherSnapshots: [
        {
          groupCode: 'КН-11',
          fetchedAt: new Date('2026-09-02T00:00:00Z'),
          entries: [entry({ key: 'a', teacherExternalId: '701' })],
        },
      ],
      isStale: false,
    });
    const res = await reader.findMy(
      teacher,
      { from: '2026-09-01', to: '2026-09-30' },
      false,
    );
    expect(res.meta.stale).toBe(false);
  });

  it('reports no_external_teacher_id for a teacher without the MAUP id', async () => {
    const { reader, snapshots } = makeReader({
      teacherRefs: { externalTeacherId: null, department: null },
    });
    const res = await reader.findMy(
      teacher,
      { from: '2026-09-01', to: '2026-09-30' },
      false,
    );
    expect(res).toEqual({
      entries: [],
      meta: {
        term: {
          id: termId.toHexString(),
          academicYear: '2026/2027',
          termNumber: 1,
        },
        stale: false,
        reason: 'no_external_teacher_id',
      },
    });
    expect(snapshots.findByTeacher).not.toHaveBeenCalled();
  });

  it('reports no_snapshot for a teacher whose groups have no snapshots yet', async () => {
    const { reader } = makeReader({ teacherSnapshots: [] });
    const res = await reader.findMy(
      teacher,
      { from: '2026-09-01', to: '2026-09-30' },
      false,
    );
    expect(res.meta.reason).toBe('no_snapshot');
  });
});

describe('ScheduleReaderService.findToday', () => {
  it('returns the Kyiv date with two arrays (spec §5.3a)', async () => {
    const { reader } = makeReader({
      profile: {
        _id: new Types.ObjectId(),
        externalStudentId: 'student-001',
        group: { _id: new Types.ObjectId(), code: 'КН-11' },
      },
      snapshot: {
        fetchedAt: new Date('2026-09-07T00:00:00Z'),
        entries: [entry({ key: 'a', date: '2026-09-07', classroom: '101' })],
      },
    });
    const res = await reader.findToday(student);
    expect(res.date).toBe('2026-09-07');
    expect(res.lessons.map((e) => e.id)).toEqual(['a']);
    expect(res.session.map((e) => e.id)).toEqual(['a']); // same snapshot mock for both calls
    expect(res.meta.stale).toBe(false);
  });

  // Acceptance criterion §10.16: at 23:30 UTC it's already the next day in Kyiv.
  it('rolls over to the next Kyiv day at 23:30 UTC', async () => {
    jest.setSystemTime(new Date('2026-09-07T23:30:00.000Z'));
    const { reader } = makeReader({
      profile: {
        _id: new Types.ObjectId(),
        externalStudentId: 'student-001',
        group: { _id: new Types.ObjectId(), code: 'КН-11' },
      },
      snapshot: {
        fetchedAt: new Date('2026-09-07T00:00:00Z'),
        entries: [entry({ key: 'a', date: '2026-09-08' })],
      },
    });
    const res = await reader.findToday(student);
    expect(res.date).toBe('2026-09-08');
    expect(res.lessons.map((e) => e.id)).toEqual(['a']);
    jest.setSystemTime(new Date('2026-09-07T09:00:00.000Z')); // restore the time for the rest of the file
  });
});

describe('ScheduleReaderService.findForGroup', () => {
  const snapshot = {
    fetchedAt: new Date('2026-09-01T00:00:00Z'),
    periodFrom: '2026-09-01',
    periodTo: '2026-09-30',
    entries: [
      entry({
        key: 'a',
        classroom: '101',
        teacherExternalId: '701',
        classroomExternalId: '501',
      }),
    ],
    rawHash: 'h',
    fetchedByUserId: new Types.ObjectId(),
  };

  it('returns only the whitelisted §5.3b keys', async () => {
    const { reader } = makeReader({ snapshot });
    const res = await reader.findForGroup(
      admin,
      'КН-11',
      { from: '2026-09-01', to: '2026-09-30' },
      false,
    );
    expect(Object.keys(res).sort()).toEqual(
      [
        'entries',
        'fetchedAt',
        'groupCode',
        'isExamSession',
        'periodFrom',
        'periodTo',
        'stale',
      ].sort(),
    );
    expect(JSON.stringify(res)).not.toContain('fetchedByUserId');
    expect(JSON.stringify(res)).not.toContain('rawHash');
    expect(JSON.stringify(res)).not.toContain('teacherExternalId');
    expect(JSON.stringify(res)).not.toContain('classroomExternalId');
  });

  // Final wave I1: previously `stale` for the group view was hardcoded to `false`.
  it('flags stale when the cached group snapshot is stale', async () => {
    const { reader } = makeReader({ snapshot, isStale: true });
    const res = await reader.findForGroup(
      admin,
      'КН-11',
      { from: '2026-09-01', to: '2026-09-30' },
      false,
    );
    expect(res.stale).toBe(true);
  });

  it('403 for a dean outside the group scope', async () => {
    const { reader, access } = makeReader({ snapshot, canAccessGroup: false });
    await expect(
      reader.findForGroup(dean, 'КН-11', {}, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.canAccessGroup).toHaveBeenCalled();
  });

  it('404 for an unknown group code', async () => {
    const { reader } = makeReader({ snapshot, group: null });
    await expect(
      reader.findForGroup(admin, 'НЕМА-1', {}, false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('403 for teacher and student — they have /schedule/my', async () => {
    const { reader } = makeReader({ snapshot });
    await expect(
      reader.findForGroup(teacher, 'КН-11', {}, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      reader.findForGroup(student, 'КН-11', {}, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// Spec §5.2a: `null` ≠ `[]`. The caller (discipline card, plan 05) distinguishes
// "no schedule yet" (meta.scheduleUnavailable: true) from "no lessons" (false).
describe('ScheduleReaderService.findUpcomingForAssignment', () => {
  const assignment = {
    _id: new Types.ObjectId(),
    term: termId,
    course: { name: 'Основи програмування', externalSubjectId: '1001' },
    group: { code: 'КН-11' },
  };
  const withAssignment = (opts: Parameters<typeof makeReader>[0]) =>
    makeReader({ ...opts, assignment });

  it('returns null when the group has no snapshot at all', async () => {
    const { reader, snapshots } = withAssignment({ snapshot: null });
    await expect(
      reader.findUpcomingForAssignment(String(assignment._id)),
    ).resolves.toBeNull();
    expect(snapshots.getCached).toHaveBeenCalled();
  });

  it('returns an empty array when the snapshot exists but holds no upcoming lessons of the course', async () => {
    const { reader } = withAssignment({
      // A snapshot exists, but its entries are a different discipline and a past date.
      snapshot: {
        fetchedAt: new Date('2026-09-01T00:00:00Z'),
        entries: [entry({ key: 'z', subjectKey: '9999', date: '2026-09-01' })],
      },
    });
    await expect(
      reader.findUpcomingForAssignment(String(assignment._id)),
    ).resolves.toEqual([]);
  });

  it('returns the matching upcoming entries', async () => {
    const { reader } = withAssignment({
      snapshot: {
        fetchedAt: new Date('2026-09-01T00:00:00Z'),
        entries: [
          entry({ key: 'a', subjectKey: '1001', date: '2026-09-14' }),
          entry({ key: 'z', subjectKey: '9999', date: '2026-09-15' }),
        ],
      },
    });
    const res = await reader.findUpcomingForAssignment(String(assignment._id));
    expect(res?.map((e) => e.id)).toEqual(['a']);
  });
});
