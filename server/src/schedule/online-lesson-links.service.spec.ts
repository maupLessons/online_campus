import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { OnlineLessonLinksService } from './online-lesson-links.service';

const termId = new Types.ObjectId().toHexString();
const teacherId = new Types.ObjectId();
const lean = <T>(v: T) => ({
  populate: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(v),
});

// Review B3: the assignment in the mock must be FULL (`group.code` + `course`), otherwise
// `assignmentMatches` is always false and the "allows a teacher…" test can never pass.
const assignmentOf = (over: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  group: { code: 'КН-11' },
  course: { name: 'Основи програмування', externalSubjectId: undefined },
  ...over,
});

function makeService(opts: {
  assignments?: unknown[];
  snapshot?: unknown;
  teacherExternalId?: string;
}) {
  const linkModel = {
    findOne: jest.fn().mockReturnValue(lean(null)),
    findOneAndUpdate: jest
      .fn()
      .mockReturnValue(lean({ _id: new Types.ObjectId(), url: 'https://x' })),
    findById: jest.fn(),
    deleteOne: jest.fn().mockReturnValue(lean({ deletedCount: 1 })),
    find: jest.fn().mockReturnValue(lean([])),
  };
  // find(), not findOne(): the check is for a SPECIFIC assignment (course+group+term+teacher),
  // not for an arbitrary document of the term (review M2).
  const assignmentModel = {
    find: jest.fn().mockReturnValue(lean(opts.assignments ?? [])),
  };
  const snapshotModel = {
    findOne: jest.fn().mockReturnValue(lean(opts.snapshot ?? null)),
  };
  const userModel = {
    findById: jest
      .fn()
      .mockReturnValue(
        lean({ teacherProfile: { externalTeacherId: opts.teacherExternalId } }),
      ),
  };
  const service = new OnlineLessonLinksService(
    linkModel as never,
    assignmentModel as never,
    snapshotModel as never,
    userModel as never,
  );
  return { service, linkModel, assignmentModel };
}

const teacher = {
  sub: teacherId.toHexString(),
  login: 't',
  role: Role.TEACHER,
};

describe('OnlineLessonLinksService.assertCanManage', () => {
  it('allows a teacher with a matching course assignment (fallback key: normalized name)', async () => {
    const { service, assignmentModel } = makeService({
      assignments: [assignmentOf()],
    });
    await expect(
      service.assertCanManage(teacher, termId, 'КН-11', 'основи програмування'),
    ).resolves.toBeUndefined();
    expect(assignmentModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        teacher: expect.anything() as unknown,
        term: expect.anything() as unknown,
      }),
    );
  });

  it('allows a teacher whose assignment carries the Course.externalSubjectId of the entry', async () => {
    const { service } = makeService({
      assignments: [
        assignmentOf({
          course: { name: 'Інша назва', externalSubjectId: '1001' },
        }),
      ],
    });
    await expect(
      service.assertCanManage(teacher, termId, 'КН-11', '1001'),
    ).resolves.toBeUndefined();
  });

  it('rejects when the teacher has an assignment, but in another group', async () => {
    const { service } = makeService({
      assignments: [assignmentOf({ group: { code: 'КН-12' } })],
    });
    await expect(
      service.assertCanManage(teacher, termId, 'КН-11', 'основи програмування'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the teacher has an assignment in this group, but for another subject', async () => {
    const { service } = makeService({
      assignments: [assignmentOf({ course: { name: 'Бази даних' } })],
    });
    await expect(
      service.assertCanManage(teacher, termId, 'КН-11', 'основи програмування'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a teacher whose externalTeacherId appears in the group snapshot', async () => {
    const { service } = makeService({
      teacherExternalId: '701',
      snapshot: { entries: [{ subjectKey: '1001', teacherExternalId: '701' }] },
    });
    await expect(
      service.assertCanManage(teacher, termId, 'КН-11', '1001'),
    ).resolves.toBeUndefined();
  });

  it('rejects a teacher with neither assignment nor snapshot match', async () => {
    const { service } = makeService({
      teacherExternalId: '999',
      snapshot: { entries: [{ subjectKey: '1001', teacherExternalId: '701' }] },
    });
    await expect(
      service.assertCanManage(teacher, termId, 'КН-11', '1001'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // Р12 / spec §5.2: ONLY the teacher sets the link.
  it.each([Role.STUDENT, Role.DEPARTMENT_HEAD, Role.ADMIN, Role.DEAN])(
    'rejects role %s',
    async (role) => {
      const { service } = makeService({ assignments: [assignmentOf()] });
      await expect(
        service.assertCanManage(
          { sub: new Types.ObjectId().toHexString(), login: 'x', role },
          termId,
          'КН-11',
          'основи програмування',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});

describe('OnlineLessonLinksService.remove', () => {
  it('rejects deleting a link created by another teacher (spec §8)', async () => {
    const { service, linkModel } = makeService({
      assignments: [assignmentOf()],
    });
    linkModel.findById = jest.fn().mockReturnValue(
      lean({
        _id: new Types.ObjectId(),
        term: new Types.ObjectId(termId),
        groupCode: 'КН-11',
        subjectKey: 'основи програмування',
        createdBy: new Types.ObjectId(),
      }),
    );
    await expect(
      service.remove('507f1f77bcf86cd799439011', teacher),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(linkModel.deleteOne).not.toHaveBeenCalled();
  });

  // Fix round 1 (minor): 404 when the link is not found.
  it('rejects with NotFoundException when the link does not exist', async () => {
    const { service, linkModel } = makeService({});
    linkModel.findById = jest.fn().mockReturnValue(lean(null));
    await expect(
      service.remove('507f1f77bcf86cd799439011', teacher),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(linkModel.deleteOne).not.toHaveBeenCalled();
  });
});

describe('OnlineLessonLinksService.overlay', () => {
  const { service } = makeService({});
  const entries = [
    { key: 'a', date: '2026-09-07', startTime: '08:30', subjectKey: '1001' },
    { key: 'b', date: '2026-09-14', startTime: '08:30', subjectKey: '1001' },
    { key: 'c', date: '2026-09-07', startTime: '10:10', subjectKey: '1002' },
  ] as never[];

  it('applies pair > date > subject priority', () => {
    const links = [
      {
        subjectKey: '1001',
        date: null,
        startTime: null,
        url: 'https://subject',
      },
      {
        subjectKey: '1001',
        date: '2026-09-07',
        startTime: null,
        url: 'https://date',
      },
      {
        subjectKey: '1001',
        date: '2026-09-07',
        startTime: '08:30',
        url: 'https://pair',
      },
    ] as never[];
    const map = service.overlay(entries, links);
    expect(map.get('a')).toBe('https://pair');
    expect(map.get('b')).toBe('https://subject');
    expect(map.get('c')).toBeUndefined();
  });
});
