import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AcademicTermsService } from '../academic-terms/academic-terms.service';
import { AcademicAccessService } from '../common/access/academic-access.service';
import { Role } from '../common/types/roles.enum';
import { CourseAssignmentSource } from '../courses/schemas';
import { ReportsScopeService } from './reports-scope.service';

function assignmentQuery(value: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    maxTimeMS: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('ReportsScopeService', () => {
  const facultyId = new Types.ObjectId();
  const departmentId = new Types.ObjectId();
  const groupId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const termAId = new Types.ObjectId();
  const courseAssignmentModel = { find: jest.fn() };
  const countQuery = {
    maxTimeMS: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };
  let capturedStudentFilter: Record<string, unknown> | undefined;
  const userModel = {
    countDocuments: jest.fn((filter: Record<string, unknown>) => {
      capturedStudentFilter = filter;
      return countQuery;
    }),
  };
  const academicAccess = {
    buildCourseAssignmentFilter: jest.fn(),
  };
  const academicTerms = { getCurrent: jest.fn().mockResolvedValue(null) };
  const academicFilter = {
    course: { $in: [new Types.ObjectId()] },
  };
  const user = {
    sub: new Types.ObjectId().toHexString(),
    login: 'head',
    role: Role.DEPARTMENT_HEAD,
  };
  let service: ReportsScopeService;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedStudentFilter = undefined;
    academicTerms.getCurrent.mockResolvedValue(null);
    academicAccess.buildCourseAssignmentFilter.mockResolvedValue(
      academicFilter,
    );
    courseAssignmentModel.find.mockReturnValue(
      assignmentQuery([
        {
          _id: assignmentId,
          term: { _id: termAId, academicYear: '2025/2026', termNumber: 1 },
          source: CourseAssignmentSource.STANDARD,
          enrolledStudents: [],
          course: {
            _id: new Types.ObjectId(),
            name: 'Enterprise Systems',
            code: 'ES-101',
            department: {
              _id: departmentId,
              name: 'Information Systems',
              faculty: {
                _id: facultyId,
                name: 'Digital Technologies',
              },
            },
          },
          group: { _id: groupId, code: 'IS-21' },
        },
      ]),
    );
    countQuery.exec.mockResolvedValue(25);
    service = new ReportsScopeService(
      courseAssignmentModel as never,
      userModel as never,
      academicAccess as unknown as AcademicAccessService,
      academicTerms as unknown as AcademicTermsService,
    );
  });

  it('builds filters only from the authorized academic scope', async () => {
    const scope = await service.resolve({}, user);

    expect(scope.selectedAssignments).toHaveLength(1);
    expect(scope.filters.departments).toEqual([
      { id: departmentId.toHexString(), label: 'Information Systems' },
    ]);
    expect(courseAssignmentModel.find).toHaveBeenCalledWith(academicFilter);
  });

  it('exposes available terms and selects the newest one by default', async () => {
    const scope = await service.resolve({}, user);
    expect(scope.filters.terms.map((item) => item.id)).toEqual([
      termAId.toHexString(),
    ]);
    expect(scope.filters.selected.termId).toBe(termAId.toHexString());
  });

  it('prefers the current term when it is inside the authorized scope', async () => {
    academicTerms.getCurrent.mockResolvedValue({ _id: termAId });
    const scope = await service.resolve({}, user);
    expect(scope.filters.selected.termId).toBe(termAId.toHexString());
  });

  it('rejects a term outside the authorized scope', async () => {
    await expect(
      service.resolve({ termId: new Types.ObjectId().toHexString() }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deduplicates concurrent scope loads without caching authorization data', async () => {
    const [first, second] = await Promise.all([
      service.resolve({}, user),
      service.resolve({}, user),
    ]);

    expect(first).toEqual(second);
    expect(courseAssignmentModel.find).toHaveBeenCalledTimes(1);

    await service.resolve({}, user);
    expect(courseAssignmentModel.find).toHaveBeenCalledTimes(2);
  });

  it('fails closed for object filters outside the authorized scope', async () => {
    await expect(
      service.resolve(
        { departmentId: new Types.ObjectId().toHexString() },
        user,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('counts active students with an indexed scoped query', async () => {
    const scope = await service.resolve({}, user);
    const count = await service.countStudents(scope.selectedAssignments);

    expect(count).toBe(25);
    expect(capturedStudentFilter?.role).toBe(Role.STUDENT);
    expect(capturedStudentFilter?.status).toBe('active');
    expect(Array.isArray(capturedStudentFilter?.$or)).toBe(true);
    expect(countQuery.maxTimeMS).toHaveBeenCalledWith(10_000);
  });
});
