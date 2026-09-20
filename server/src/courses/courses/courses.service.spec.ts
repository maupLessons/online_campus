import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CoursesService } from './courses.service';
import { Role } from '../../common/types/roles.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';

function paginateResult(overrides: Record<string, unknown> = {}) {
  return {
    docs: [],
    totalDocs: 0,
    limit: 10,
    page: 1,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
    ...overrides,
  };
}

describe('CoursesService.findMy', () => {
  const currentTermId = new Types.ObjectId('6622b2a00f3a22d5b625d1a0');
  const studentId = '6622b2a00f3a22d5b625d185';
  const groupId = '6622b2a00f3a22d5b625d184';

  let userModel: { findById: jest.Mock };
  let courseAssignmentModel: { paginate: jest.Mock };
  let academicAccessService: { buildCourseAssignmentFilter: jest.Mock };
  let academicTerms: { getCurrent: jest.Mock };
  let usersService: { getActiveStudentProfile: jest.Mock };
  let access: Record<string, jest.Mock>;
  let config: { get: jest.Mock };
  let service: CoursesService;

  beforeEach(() => {
    userModel = {
      findById: jest.fn(),
    };
    courseAssignmentModel = {
      paginate: jest.fn().mockResolvedValue(paginateResult()),
    };
    academicAccessService = {
      buildCourseAssignmentFilter: jest.fn().mockResolvedValue({}),
    };
    academicTerms = {
      getCurrent: jest.fn().mockResolvedValue({ _id: currentTermId }),
    };
    usersService = {
      getActiveStudentProfile: jest.fn().mockResolvedValue({
        group: { _id: new Types.ObjectId(groupId), code: 'IS-11' },
      }),
    };
    access = {};
    config = { get: jest.fn() };

    service = new CoursesService(
      userModel as never,
      {} as never,
      courseAssignmentModel as never,
      academicAccessService as never,
      academicTerms as never,
      usersService as never,
      access as never,
      config as never,
      {} as never,
      {} as never, // ScheduleService — not needed for findMy
    );
  });

  it('returns an empty page with meta.reason when there is no current term', async () => {
    academicTerms.getCurrent.mockResolvedValue(null);

    const result = await service.findMy(
      studentId,
      Role.STUDENT,
      new PaginationDto(),
    );

    expect(result).toMatchObject({
      docs: [],
      totalDocs: 0,
      meta: { reason: 'no_current_term' },
    });
    expect(courseAssignmentModel.paginate).not.toHaveBeenCalled();
  });

  it('scopes a student to the current term', async () => {
    await service.findMy(studentId, Role.STUDENT, new PaginationDto());

    expect(courseAssignmentModel.paginate).toHaveBeenCalledWith(
      expect.objectContaining({ term: currentTermId }),
      expect.anything(),
    );
  });

  it('scopes a teacher to the current term', async () => {
    const teacherId = '6622b2a00f3a22d5b625d186';

    await service.findMy(teacherId, Role.TEACHER, new PaginationDto());

    expect(courseAssignmentModel.paginate).toHaveBeenCalledWith(
      { teacher: new Types.ObjectId(teacherId), term: currentTermId },
      expect.anything(),
    );
  });

  it('scopes an admin via academicAccessService and the current term', async () => {
    await service.findMy('admin-id', Role.ADMIN, new PaginationDto());

    expect(
      academicAccessService.buildCourseAssignmentFilter,
    ).toHaveBeenCalled();
    expect(courseAssignmentModel.paginate).toHaveBeenCalledWith(
      { $and: [{}, { term: currentTermId }] },
      expect.anything(),
    );
  });
});

// §7.2 + plan 02 §5.2a: getCard talks to ScheduleService only through
// UpcomingLessonsPort (findUpcomingForAssignment is optional in the type), but
// at this plan's point the method itself already exists in ScheduleService — unit tests must
// cover the real port branches, not just "the method is absent".
describe('CoursesService.getCard', () => {
  const assignmentId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const departmentId = new Types.ObjectId();
  const teacherId = new Types.ObjectId();
  const groupId = new Types.ObjectId();
  const termId = new Types.ObjectId();
  const user = { sub: 'u1', login: 'u1', role: Role.STUDENT };

  type LeanChain = { populate: jest.Mock; lean: jest.Mock; exec: jest.Mock };

  function chain(value: unknown): LeanChain {
    const c = {} as LeanChain;
    c.populate = jest.fn().mockReturnValue(c);
    c.lean = jest.fn().mockReturnValue(c);
    c.exec = jest.fn().mockResolvedValue(value);
    return c;
  }

  const leanAssignment = (overrides: Record<string, unknown> = {}) => ({
    _id: assignmentId,
    source: 'standard',
    course: {
      _id: courseId,
      code: 'A-1',
      name: 'Курс А',
      credits: 4,
      department: { _id: departmentId, name: 'Кафедра А' },
    },
    teacher: {
      _id: teacherId,
      firstName: 'Іван',
      lastName: 'Тест',
      middleName: 'Петрович',
    },
    group: { _id: groupId, code: 'КН-31' },
    term: { _id: termId, academicYear: '2026/2027', termNumber: 1 },
    resources: [],
    ...overrides,
  });

  let courseAssignmentModel: { findById: jest.Mock };
  let access: Record<string, jest.Mock>;
  let scheduleService: { findUpcomingForAssignment?: jest.Mock };
  let service: CoursesService;

  const buildService = () =>
    new CoursesService(
      {} as never,
      {} as never,
      courseAssignmentModel as never,
      {} as never,
      {} as never,
      {} as never,
      access as never,
      { get: jest.fn() } as never,
      {} as never,
      scheduleService as never,
    );

  beforeEach(() => {
    courseAssignmentModel = { findById: jest.fn() };
    access = {
      loadAssignmentForRead: jest.fn().mockResolvedValue({
        _id: assignmentId,
        course: { department: departmentId },
      }),
      canEditResources: jest.fn().mockResolvedValue(false),
      canEditMoodleUrl: jest.fn().mockResolvedValue(false),
    };
  });

  it('entries from the port become upcomingLessons and scheduleUnavailable=false', async () => {
    courseAssignmentModel.findById.mockReturnValue(chain(leanAssignment()));
    const entries = [
      {
        id: 'x',
        date: '2026-09-21',
        startTime: '10:00',
        endTime: '11:20',
        type: 'lecture',
      },
    ];
    scheduleService = {
      findUpcomingForAssignment: jest.fn().mockResolvedValue(entries),
    };
    service = buildService();

    const card = await service.getCard(assignmentId.toHexString(), user);

    expect(card.upcomingLessons).toEqual(entries);
    expect(card.meta.scheduleUnavailable).toBe(false);
    expect(scheduleService.findUpcomingForAssignment).toHaveBeenCalledWith(
      assignmentId.toHexString(),
      5,
    );
  });

  it('null from the port (no snapshot) means scheduleUnavailable=true with an empty list', async () => {
    courseAssignmentModel.findById.mockReturnValue(chain(leanAssignment()));
    scheduleService = {
      findUpcomingForAssignment: jest.fn().mockResolvedValue(null),
    };
    service = buildService();

    const card = await service.getCard(assignmentId.toHexString(), user);

    expect(card.upcomingLessons).toEqual([]);
    expect(card.meta.scheduleUnavailable).toBe(true);
  });

  it('[] from the port is a real empty snapshot: scheduleUnavailable stays false', async () => {
    courseAssignmentModel.findById.mockReturnValue(chain(leanAssignment()));
    scheduleService = {
      findUpcomingForAssignment: jest.fn().mockResolvedValue([]),
    };
    service = buildService();

    const card = await service.getCard(assignmentId.toHexString(), user);

    expect(card.upcomingLessons).toEqual([]);
    expect(card.meta.scheduleUnavailable).toBe(false);
  });

  it('a rejected port call degrades to scheduleUnavailable=true instead of failing the card', async () => {
    courseAssignmentModel.findById.mockReturnValue(chain(leanAssignment()));
    scheduleService = {
      findUpcomingForAssignment: jest
        .fn()
        .mockRejectedValue(new Error('cache empty')),
    };
    service = buildService();

    const card = await service.getCard(assignmentId.toHexString(), user);

    expect(card.upcomingLessons).toEqual([]);
    expect(card.meta.scheduleUnavailable).toBe(true);
  });

  it('a ScheduleService without the port method (plan 02 undeployed) still opens the card', async () => {
    courseAssignmentModel.findById.mockReturnValue(chain(leanAssignment()));
    scheduleService = {};
    service = buildService();

    const card = await service.getCard(assignmentId.toHexString(), user);

    expect(card.upcomingLessons).toEqual([]);
    expect(card.meta.scheduleUnavailable).toBe(true);
  });

  it('teacher is null instead of "[object Object]" when the assignment has none', async () => {
    courseAssignmentModel.findById.mockReturnValue(
      chain(leanAssignment({ teacher: undefined })),
    );
    scheduleService = {
      findUpcomingForAssignment: jest.fn().mockResolvedValue([]),
    };
    service = buildService();

    const card = await service.getCard(assignmentId.toHexString(), user);

    expect(card.teacher).toBeNull();
  });
});

// FIX C (review Task 3): check-then-act (assertExternalSubjectIdFree/exists) leaves
// a race window — a concurrent write can slip between the check and the write
// and fail directly with E11000. Such a driver error must not escape as a raw 500.
describe('CoursesService.createCourse — duplicate key race (FIX C)', () => {
  type Chain = { select: jest.Mock; lean: jest.Mock; exec: jest.Mock };
  function chain(value: unknown): Chain {
    const c = {} as Chain;
    c.select = jest.fn().mockReturnValue(c);
    c.lean = jest.fn().mockReturnValue(c);
    c.exec = jest.fn().mockResolvedValue(value);
    return c;
  }

  let courseModel: { exists: jest.Mock; create: jest.Mock; findOne: jest.Mock };
  let departmentModel: { exists: jest.Mock };
  let access: Record<string, jest.Mock>;
  let service: CoursesService;

  const dto = {
    code: 'CS101',
    name: 'Курс',
    departmentId: '6622b2a00f3a22d5b625d1a1',
    credits: 3,
    externalSubjectId: '1001',
  };
  const user = {
    sub: '6622b2a00f3a22d5b625d1a2',
    login: 'admin',
    role: Role.ADMIN,
  };

  beforeEach(() => {
    courseModel = {
      exists: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(false) }),
      create: jest.fn(),
      findOne: jest.fn().mockReturnValue(chain(null)),
    };
    departmentModel = {
      exists: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(true) }),
    };
    access = {
      assertCanCreateInDepartment: jest.fn().mockResolvedValue(undefined),
    };

    service = new CoursesService(
      {} as never,
      courseModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      access as never,
      { get: jest.fn() } as never,
      departmentModel as never,
      {} as never,
    );
  });

  it('maps a concurrent E11000 on externalSubjectId to 409 course_external_subject_id_taken', async () => {
    expect.assertions(2);
    courseModel.create.mockRejectedValue({
      code: 11000,
      keyPattern: { externalSubjectId: 1 },
    });

    try {
      await service.createCourse(dto, user);
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'course_external_subject_id_taken',
      });
    }
  });

  it('maps a concurrent E11000 on code to 409 course_code_taken', async () => {
    expect.assertions(2);
    courseModel.create.mockRejectedValue({
      code: 11000,
      keyPattern: { code: 1 },
    });

    try {
      await service.createCourse(dto, user);
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'course_code_taken',
      });
    }
  });
});
