import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { CoursesAccessService } from './courses-access.service';
import { CourseAssignmentSource } from './schemas';

type Chain<T> = {
  select: jest.Mock;
  lean: jest.Mock;
  exec: jest.Mock<Promise<T>>;
};
function chain<T>(value: T): Chain<T> {
  const c: Chain<T> = {
    select: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
  };
  c.select.mockReturnValue(c);
  c.lean.mockReturnValue(c);
  return c;
}

const deptA = new Types.ObjectId();
const deptB = new Types.ObjectId();
const facultyA = new Types.ObjectId();
const groupA = new Types.ObjectId();
const termCurrent = new Types.ObjectId();
const termOld = new Types.ObjectId();
const me = new Types.ObjectId();

const user = (role: Role) => ({ sub: me.toHexString(), login: 'u', role });

describe('CoursesAccessService', () => {
  let courseModel: { findById: jest.Mock; find: jest.Mock };
  let assignmentModel: { findById: jest.Mock; exists: jest.Mock };
  let departmentModel: { find: jest.Mock };
  let facultyModel: { find: jest.Mock };
  let usersService: { getActiveStudentProfile: jest.Mock };
  let termsService: { getCurrent: jest.Mock };
  let service: CoursesAccessService;

  beforeEach(() => {
    courseModel = { findById: jest.fn(), find: jest.fn() };
    assignmentModel = { findById: jest.fn(), exists: jest.fn() };
    departmentModel = { find: jest.fn() };
    facultyModel = { find: jest.fn() };
    usersService = { getActiveStudentProfile: jest.fn() };
    termsService = {
      getCurrent: jest.fn().mockResolvedValue({ _id: termCurrent }),
    };
    service = new CoursesAccessService(
      courseModel as never,
      assignmentModel as never,
      departmentModel as never,
      facultyModel as never,
      usersService as never,
      termsService as never,
    );
  });

  const course = (department = deptA) => ({
    _id: new Types.ObjectId(),
    department,
    status: 'active',
  });

  it('department_head manages course of own department', async () => {
    departmentModel.find.mockReturnValue(chain([{ _id: deptA }]));
    const c = course(deptA);
    courseModel.findById.mockReturnValue(chain(c));
    await expect(
      service.loadCourseForManage(
        c._id.toHexString(),
        user(Role.DEPARTMENT_HEAD),
      ),
    ).resolves.toBe(c);
  });

  it('department_head gets 403 for other department', async () => {
    departmentModel.find.mockReturnValue(chain([{ _id: deptA }]));
    const c = course(deptB);
    courseModel.findById.mockReturnValue(chain(c));
    await expect(
      service.loadCourseForManage(
        c._id.toHexString(),
        user(Role.DEPARTMENT_HEAD),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('dean reads course of own faculty but cannot manage', async () => {
    facultyModel.find.mockReturnValue(chain([{ _id: facultyA }]));
    departmentModel.find.mockReturnValue(chain([{ _id: deptA }]));
    const c = course(deptA);
    courseModel.findById.mockReturnValue(chain(c));
    await expect(
      service.loadCourseForRead(c._id.toHexString(), user(Role.DEAN)),
    ).resolves.toBe(c);
    await expect(
      service.loadCourseForManage(c._id.toHexString(), user(Role.DEAN)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('admin gets 404 for missing course, others get 403', async () => {
    courseModel.findById.mockReturnValue(chain(null));
    departmentModel.find.mockReturnValue(chain([]));
    const id = new Types.ObjectId().toHexString();
    await expect(
      service.loadCourseForRead(id, user(Role.ADMIN)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.loadCourseForRead(id, user(Role.DEPARTMENT_HEAD)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rector never reads a course', async () => {
    const c = course();
    courseModel.findById.mockReturnValue(chain(c));
    await expect(
      service.loadCourseForRead(c._id.toHexString(), user(Role.RECTOR)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('loadCourseForRead teacher branch', () => {
    it('teacher reads a course they have an assignment on', async () => {
      const c = course(deptA);
      courseModel.findById.mockReturnValue(chain(c));
      assignmentModel.exists.mockReturnValue({
        exec: jest.fn().mockResolvedValue(true),
      });
      await expect(
        service.loadCourseForRead(c._id.toHexString(), user(Role.TEACHER)),
      ).resolves.toBe(c);
      expect(courseModel.findById).toHaveBeenCalledWith(c._id.toHexString());
      expect(assignmentModel.exists).toHaveBeenCalledWith({
        course: c._id,
        teacher: me,
      });
    });

    it('teacher without an assignment cannot read the course', async () => {
      const c = course(deptA);
      courseModel.findById.mockReturnValue(chain(c));
      assignmentModel.exists.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        service.loadCourseForRead(c._id.toHexString(), user(Role.TEACHER)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('buildCatalogFilter', () => {
    it('admin gets no filter without a departmentId', async () => {
      await expect(
        service.buildCatalogFilter(user(Role.ADMIN)),
      ).resolves.toEqual({});
    });

    it('admin filters by departmentId when given', async () => {
      await expect(
        service.buildCatalogFilter(user(Role.ADMIN), deptA.toHexString()),
      ).resolves.toEqual({ department: deptA });
    });

    it('department_head gets $in of managed departments', async () => {
      departmentModel.find.mockReturnValue(
        chain([{ _id: deptA }, { _id: deptB }]),
      );
      await expect(
        service.buildCatalogFilter(user(Role.DEPARTMENT_HEAD)),
      ).resolves.toEqual({ department: { $in: [deptA, deptB] } });
      expect(departmentModel.find).toHaveBeenCalledWith({ head: me });
    });

    it('dean gets $in of faculty departments', async () => {
      facultyModel.find.mockReturnValue(chain([{ _id: facultyA }]));
      departmentModel.find.mockReturnValue(chain([{ _id: deptA }]));
      await expect(
        service.buildCatalogFilter(user(Role.DEAN)),
      ).resolves.toEqual({ department: { $in: [deptA] } });
      expect(facultyModel.find).toHaveBeenCalledWith({ dean: me });
      expect(departmentModel.find).toHaveBeenCalledWith({
        faculty: { $in: [facultyA] },
      });
    });

    it('empty managed departments yields an impossible filter', async () => {
      departmentModel.find.mockReturnValue(chain([]));
      await expect(
        service.buildCatalogFilter(user(Role.DEPARTMENT_HEAD)),
      ).resolves.toEqual({ _id: { $in: [] } });
    });

    it.each([Role.STUDENT, Role.TEACHER, Role.RECTOR])(
      '%s cannot build a catalog filter',
      async (role) => {
        await expect(
          service.buildCatalogFilter(user(role)),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );
  });

  describe('canEditMoodleUrl', () => {
    it('admin can always edit the moodle url', async () => {
      const c = course(deptA);
      await expect(
        service.canEditMoodleUrl(c as never, user(Role.ADMIN)),
      ).resolves.toBe(true);
    });

    it('department_head can edit the moodle url of own department', async () => {
      departmentModel.find.mockReturnValue(chain([{ _id: deptA }]));
      const c = course(deptA);
      await expect(
        service.canEditMoodleUrl(c as never, user(Role.DEPARTMENT_HEAD)),
      ).resolves.toBe(true);
      expect(departmentModel.find).toHaveBeenCalledWith({ head: me });
    });

    it('department_head cannot edit the moodle url of another department', async () => {
      departmentModel.find.mockReturnValue(chain([{ _id: deptA }]));
      const c = course(deptB);
      await expect(
        service.canEditMoodleUrl(c as never, user(Role.DEPARTMENT_HEAD)),
      ).resolves.toBe(false);
    });

    it('teacher cannot edit the moodle url', async () => {
      const c = course(deptA);
      await expect(
        service.canEditMoodleUrl(c as never, user(Role.TEACHER)),
      ).resolves.toBe(false);
    });

    it('dean cannot edit the moodle url', async () => {
      const c = course(deptA);
      await expect(
        service.canEditMoodleUrl(c as never, user(Role.DEAN)),
      ).resolves.toBe(false);
    });
  });

  describe('assignments', () => {
    const assignment = (over: Record<string, unknown> = {}) => ({
      _id: new Types.ObjectId(),
      course: { _id: new Types.ObjectId(), department: deptA },
      group: groupA,
      teacher: new Types.ObjectId(),
      term: termCurrent,
      source: CourseAssignmentSource.STANDARD,
      enrolledStudents: [] as Types.ObjectId[],
      ...over,
    });

    it('student reads standard assignment of own group in current term', async () => {
      usersService.getActiveStudentProfile.mockResolvedValue({
        group: { _id: groupA },
      });
      const a = assignment();
      assignmentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue(chain(a)),
      });
      await expect(
        service.loadAssignmentForRead(a._id.toHexString(), user(Role.STUDENT)),
      ).resolves.toBe(a);
    });

    it('student is forbidden for assignment of a past term', async () => {
      usersService.getActiveStudentProfile.mockResolvedValue({
        group: { _id: groupA },
      });
      const a = assignment({ term: termOld });
      assignmentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue(chain(a)),
      });
      await expect(
        service.loadAssignmentForRead(a._id.toHexString(), user(Role.STUDENT)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('student sees elective only when enrolled', async () => {
      usersService.getActiveStudentProfile.mockResolvedValue({
        group: { _id: groupA },
      });
      const notEnrolled = assignment({
        source: CourseAssignmentSource.ELECTIVE,
      });
      assignmentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue(chain(notEnrolled)),
      });
      await expect(
        service.loadAssignmentForRead(
          notEnrolled._id.toHexString(),
          user(Role.STUDENT),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const enrolled = assignment({
        source: CourseAssignmentSource.ELECTIVE,
        enrolledStudents: [me],
      });
      assignmentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue(chain(enrolled)),
      });
      await expect(
        service.loadAssignmentForRead(
          enrolled._id.toHexString(),
          user(Role.STUDENT),
        ),
      ).resolves.toBe(enrolled);
    });

    it('student is forbidden when there is no current term', async () => {
      termsService.getCurrent.mockResolvedValue(null);
      usersService.getActiveStudentProfile.mockResolvedValue({
        group: { _id: groupA },
      });
      const a = assignment();
      assignmentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue(chain(a)),
      });
      await expect(
        service.loadAssignmentForRead(a._id.toHexString(), user(Role.STUDENT)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('student without an active profile is forbidden', async () => {
      usersService.getActiveStudentProfile.mockResolvedValue(null);
      const a = assignment();
      assignmentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue(chain(a)),
      });
      await expect(
        service.loadAssignmentForRead(a._id.toHexString(), user(Role.STUDENT)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('department_head reads assignment of own department', async () => {
      departmentModel.find.mockReturnValue(chain([{ _id: deptA }]));
      const a = assignment();
      assignmentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue(chain(a)),
      });
      await expect(
        service.loadAssignmentForRead(
          a._id.toHexString(),
          user(Role.DEPARTMENT_HEAD),
        ),
      ).resolves.toBe(a);
      expect(departmentModel.find).toHaveBeenCalledWith({ head: me });
    });

    it('department_head cannot read assignment of another department', async () => {
      departmentModel.find.mockReturnValue(chain([{ _id: deptB }]));
      const a = assignment();
      assignmentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue(chain(a)),
      });
      await expect(
        service.loadAssignmentForRead(
          a._id.toHexString(),
          user(Role.DEPARTMENT_HEAD),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('dean reads assignment of own faculty', async () => {
      facultyModel.find.mockReturnValue(chain([{ _id: facultyA }]));
      departmentModel.find.mockReturnValue(chain([{ _id: deptA }]));
      const a = assignment();
      assignmentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue(chain(a)),
      });
      await expect(
        service.loadAssignmentForRead(a._id.toHexString(), user(Role.DEAN)),
      ).resolves.toBe(a);
      expect(facultyModel.find).toHaveBeenCalledWith({ dean: me });
      expect(departmentModel.find).toHaveBeenCalledWith({
        faculty: { $in: [facultyA] },
      });
    });

    it('teacher edits resources only on own assignment', async () => {
      const own = assignment({ teacher: me });
      const foreign = assignment();
      await expect(
        service.canEditResources(own as never, user(Role.TEACHER)),
      ).resolves.toBe(true);
      await expect(
        service.canEditResources(foreign as never, user(Role.TEACHER)),
      ).resolves.toBe(false);
    });

    it('department_head edits resources of own department only', async () => {
      departmentModel.find.mockReturnValue(chain([{ _id: deptA }]));
      const own = assignment();
      await expect(
        service.canEditResources(own as never, user(Role.DEPARTMENT_HEAD)),
      ).resolves.toBe(true);

      departmentModel.find.mockReturnValue(chain([{ _id: deptB }]));
      const foreign = assignment();
      await expect(
        service.canEditResources(foreign as never, user(Role.DEPARTMENT_HEAD)),
      ).resolves.toBe(false);
    });

    it('admin cannot edit resources (DISC-008)', async () => {
      await expect(
        service.canEditResources(assignment() as never, user(Role.ADMIN)),
      ).resolves.toBe(false);
    });
  });
});
