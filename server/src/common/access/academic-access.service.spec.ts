import { Types } from 'mongoose';
import { Role } from '../types/roles.enum';
import { AcademicAccessService } from './academic-access.service';
import { CourseAssignmentSource } from '../../courses/schemas';

function query<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('AcademicAccessService', () => {
  const studentId = new Types.ObjectId();
  const enrolledStudentId = new Types.ObjectId();
  const otherStudentId = new Types.ObjectId();
  const teacherId = new Types.ObjectId();
  const groupId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();

  const userModel = {
    findById: jest.fn(),
    find: jest.fn(),
  };
  const courseModel = {
    find: jest.fn(),
  };
  const courseAssignmentModel = {
    find: jest.fn(),
    exists: jest.fn(),
  };
  const departmentModel = {
    find: jest.fn(),
  };
  const facultyModel = {
    find: jest.fn(),
  };

  let service: AcademicAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AcademicAccessService(
      userModel as never,
      courseModel as never,
      courseAssignmentModel as never,
      departmentModel as never,
      facultyModel as never,
    );
  });

  it.each([Role.ADMIN, Role.RECTOR, Role.PRESIDENT])(
    'grants %s a global read-only user scope',
    async (role) => {
      await expect(
        service.buildVisibleUserFilter({
          sub: new Types.ObjectId().toHexString(),
          login: role,
          role,
        }),
      ).resolves.toEqual({});
    },
  );

  it('limits students to standard courses and explicitly enrolled electives', async () => {
    userModel.findById.mockReturnValue(
      query({ studentProfile: { group: groupId } }),
    );

    const filter = await service.buildCourseAssignmentFilter({
      sub: studentId.toHexString(),
      login: 'student',
      role: Role.STUDENT,
    });

    expect(filter).toEqual({
      group: groupId,
      $or: [
        { source: { $exists: false } },
        { source: CourseAssignmentSource.STANDARD },
        {
          source: CourseAssignmentSource.ELECTIVE,
          enrolledStudents: studentId,
        },
      ],
    });
  });

  it('fails closed when a dean is not assigned to a faculty', async () => {
    facultyModel.find.mockReturnValue(query([]));
    courseAssignmentModel.find.mockReturnValue(query([]));

    const ids = await service.findVisibleCourseAssignmentIds({
      sub: new Types.ObjectId().toHexString(),
      login: 'dean',
      role: Role.DEAN,
    });

    expect(ids).toEqual([]);
    expect(courseAssignmentModel.find).toHaveBeenCalledWith({
      _id: { $in: [] },
    });
  });

  it('notifies only enrolled students for elective assignments', async () => {
    courseAssignmentModel.find.mockReturnValue(
      query([
        {
          _id: assignmentId,
          teacher: teacherId,
          group: groupId,
          source: CourseAssignmentSource.ELECTIVE,
          enrolledStudents: [enrolledStudentId],
        },
      ]),
    );
    userModel.find.mockReturnValue(query([{ _id: enrolledStudentId }]));

    const recipients = await service.findCourseAssignmentRecipientIds([
      assignmentId.toHexString(),
    ]);

    expect(userModel.find).toHaveBeenCalledWith({
      role: Role.STUDENT,
      status: 'active',
      $or: [
        {
          _id: { $in: [enrolledStudentId] },
          'studentProfile.group': groupId,
        },
      ],
    });
    expect(recipients).toEqual([
      teacherId.toHexString(),
      enrolledStudentId.toHexString(),
    ]);
    expect(recipients).not.toContain(otherStudentId.toHexString());
  });
});
