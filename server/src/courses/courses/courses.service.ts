import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PaginateModel } from 'mongoose';

import { CourseAssignmentDto, CourseDto } from './dto';
import { Role } from '../../common/types/roles.enum';
import { toId } from '../../common/utils/to-id.util';
import { User, UserDocument } from '../../users/schemas';
import { UserDto } from '../../users/dto/user.dto';
import {
  Course,
  CourseAssignment,
  CourseAssignmentDocument,
  CourseAssignmentSource,
  CourseDocument,
} from '../schemas';
import {
  transformToPaginatedDto,
  transformToDto,
  transformToDtoArray,
} from '../../common/utils/transform.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';

const COURSE_OVERSIGHT_ROLES = new Set<Role>([
  Role.DISPATCHER,
  Role.DEAN,
  Role.RECTOR,
  Role.PRESIDENT,
  Role.ADMIN,
]);

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Course.name)
    private courseModel: PaginateModel<CourseDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: PaginateModel<CourseAssignmentDocument>,
  ) {}

  async validateOwnership(
    courseAssignmentId: string,
    userId: string,
    role: Role,
  ): Promise<CourseAssignmentDocument> {
    this.assertValidObjectId(courseAssignmentId, 'призначення курсу');

    const ca = await this.courseAssignmentModel
      .findById(courseAssignmentId)
      .exec();

    if (!ca) {
      throw new NotFoundException('Призначення курсу не знайдено');
    }

    if (role !== Role.ADMIN && toId(ca.teacher) !== userId) {
      throw new ForbiddenException('Ви не є викладачем цього курсу');
    }

    return ca;
  }

  async assertCourseAssignmentAccess(
    courseAssignmentId: string,
    userId: string,
    role: Role,
  ): Promise<CourseAssignmentDocument> {
    this.assertValidObjectId(courseAssignmentId, 'призначення курсу');
    this.assertValidObjectId(userId, 'користувача');

    const courseAssignment = await this.courseAssignmentModel
      .findById(courseAssignmentId)
      .exec();

    if (!courseAssignment) {
      throw new NotFoundException('Призначення курсу не знайдено');
    }

    if (COURSE_OVERSIGHT_ROLES.has(role)) {
      return courseAssignment;
    }

    if (role !== Role.STUDENT) {
      if (toId(courseAssignment.teacher) !== userId) {
        throw new ForbiddenException('Немає доступу до цього курсу');
      }
      return courseAssignment;
    }

    const student = await this.userModel
      .findById(userId)
      .select('studentProfile.group')
      .lean()
      .exec();

    if (
      !student?.studentProfile?.group ||
      toId(student.studentProfile.group) !== toId(courseAssignment.group)
    ) {
      throw new ForbiddenException('Немає доступу до цього курсу');
    }

    if (
      courseAssignment.source === CourseAssignmentSource.ELECTIVE &&
      !(courseAssignment.enrolledStudents ?? []).some(
        (enrolledStudent) => toId(enrolledStudent) === userId,
      )
    ) {
      throw new ForbiddenException('Ви не зараховані на цю дисципліну');
    }

    return courseAssignment;
  }

  async findAllCourses(
    pagination: PaginationDto,
  ): Promise<PaginatedDto<CourseDto>> {
    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      sort: { name: 1 },
      lean: true,
    };

    const result = await this.courseModel.paginate({}, options as any);
    return transformToPaginatedDto(CourseDto, result);
  }

  async findCourseById(id: string): Promise<CourseDto> {
    const course = await this.courseModel.findById(id).lean().exec();
    if (!course) {
      throw new NotFoundException('Курс не знайдено');
    }
    return transformToDto(CourseDto, course);
  }

  async findCourseAssignmentById(
    id: string,
    userId?: string,
    role?: Role,
  ): Promise<CourseAssignmentDto> {
    if (userId && role) {
      await this.assertCourseAssignmentAccess(id, userId, role);
    } else {
      this.assertValidObjectId(id, 'призначення курсу');
    }

    const ca = await this.courseAssignmentModel
      .findById(id)
      .populate([
        'course',
        'teacher',
        {
          path: 'group',
          populate: { path: 'specialty' },
        },
      ])
      .lean()
      .exec();

    if (!ca) {
      throw new NotFoundException('Призначення курсу не знайдено');
    }
    return transformToDto(CourseAssignmentDto, ca);
  }

  async findStudentsByCourseAssignment(
    courseAssignmentId: string,
    userId: string,
    role: Role,
  ): Promise<UserDto[]> {
    const ca = await this.validateOwnership(courseAssignmentId, userId, role);

    const students = await this.userModel
      .find(this.buildCourseStudentRosterFilter(ca) as never)
      .sort({ lastName: 1, firstName: 1, middleName: 1 })
      .lean()
      .exec();

    return transformToDtoArray(UserDto, students);
  }

  buildCourseStudentRosterFilter(
    courseAssignment: Pick<
      CourseAssignment,
      'group' | 'source' | 'enrolledStudents'
    >,
  ): Record<string, unknown> {
    const groupId = toId(courseAssignment.group);
    this.assertValidObjectId(groupId, 'групи');

    const filter: Record<string, unknown> = {
      role: Role.STUDENT,
      status: 'active',
      'studentProfile.group': new Types.ObjectId(groupId),
    };

    if (courseAssignment.source === CourseAssignmentSource.ELECTIVE) {
      filter._id = {
        $in: this.normalizeObjectIds(courseAssignment.enrolledStudents ?? []),
      };
    }

    return filter;
  }

  async assertStudentBelongsToCourseAssignment(
    courseAssignment: Pick<
      CourseAssignment,
      'group' | 'source' | 'enrolledStudents'
    >,
    studentId: string,
  ): Promise<void> {
    this.assertValidObjectId(studentId, 'студента');

    const studentExists = await this.userModel
      .exists({
        $and: [
          this.buildCourseStudentRosterFilter(courseAssignment),
          { _id: new Types.ObjectId(studentId) },
        ],
      } as never)
      .exec();

    if (!studentExists) {
      throw new BadRequestException('Студент не зарахований на цю дисципліну');
    }
  }

  async findMy(
    userId: string,
    role: Role,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    if (role === Role.STUDENT) {
      return this.findCoursesByStudent(userId, pagination);
    }
    if (role === Role.TEACHER || role === Role.DEPARTMENT_HEAD) {
      return this.findCoursesByTeacher(userId, pagination);
    }

    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: ['course', 'teacher', 'group'],
      lean: true,
    };

    const result = await this.courseAssignmentModel.paginate(
      {},
      options as any,
    );
    return transformToPaginatedDto(CourseAssignmentDto, result);
  }

  async findCoursesByStudent(
    studentId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    const user = await this.userModel.findById(studentId).lean().exec();
    if (!user || !user.studentProfile) {
      return {
        docs: [],
        totalDocs: 0,
        limit: pagination.limit || 10,
        page: pagination.page || 1,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      };
    }

    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: ['course', 'teacher'],
      sort: { academicYear: -1, semester: -1, createdAt: -1 },
      lean: true,
    };

    const result = await this.courseAssignmentModel.paginate(
      this.buildStudentCourseAssignmentFilter(
        studentId,
        toId(user.studentProfile.group),
      ),
      options as any,
    );

    return transformToPaginatedDto(CourseAssignmentDto, result);
  }

  async findAccessibleCourseAssignmentIdsForStudent(
    studentId: string,
    groupId: string,
  ): Promise<Types.ObjectId[]> {
    this.assertValidObjectId(studentId, 'студента');
    this.assertValidObjectId(groupId, 'групи');

    const assignments = await this.courseAssignmentModel
      .find(this.buildStudentCourseAssignmentFilter(studentId, groupId))
      .select('_id')
      .lean()
      .exec();

    return assignments.map((assignment) => assignment._id);
  }

  async findCoursesByTeacher(
    teacherId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: [
        'course',
        'teacher',
        {
          path: 'group',
          populate: { path: 'specialty' },
        },
      ],
      lean: true,
    };

    const result = await this.courseAssignmentModel.paginate(
      { teacher: new Types.ObjectId(teacherId) },
      options as any,
    );

    return transformToPaginatedDto(CourseAssignmentDto, result);
  }

  async isUserAssignedToCourseTargets(params: {
    userId: string;
    role: Role;
    targetIds: string[];
    groupId?: string | null;
  }): Promise<boolean> {
    const objectIds = params.targetIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return false;
    }

    const targetFilter: Record<string, unknown> = {
      $or: [{ _id: { $in: objectIds } }, { course: { $in: objectIds } }],
    };

    if (params.role === Role.TEACHER) {
      if (!Types.ObjectId.isValid(params.userId)) {
        return false;
      }

      const match = await this.courseAssignmentModel
        .exists({
          ...targetFilter,
          teacher: new Types.ObjectId(params.userId),
        } as never)
        .exec();

      return match !== null;
    }

    if (params.role === Role.STUDENT) {
      if (
        !params.groupId ||
        !Types.ObjectId.isValid(params.groupId) ||
        !Types.ObjectId.isValid(params.userId)
      ) {
        return false;
      }

      const match = await this.courseAssignmentModel
        .exists({
          $and: [
            targetFilter,
            { group: new Types.ObjectId(params.groupId) },
            {
              $or: [
                { source: { $exists: false } },
                { source: CourseAssignmentSource.STANDARD },
                {
                  source: CourseAssignmentSource.ELECTIVE,
                  enrolledStudents: new Types.ObjectId(params.userId),
                },
              ],
            },
          ],
        } as never)
        .exec();

      return match !== null;
    }

    return false;
  }

  async findUserIdsByCourseTargets(targetIds: string[]): Promise<string[]> {
    const courseAssignments = await this.findCourseTargetAssignments(targetIds);

    const teacherIds = courseAssignments.map((assignment) =>
      toId(assignment.teacher),
    );
    const studentIds =
      await this.findActiveStudentIdsForAssignments(courseAssignments);

    return [...new Set([...teacherIds, ...studentIds])];
  }

  async findStudentIdsByCourseTargets(targetIds: string[]): Promise<string[]> {
    const courseAssignments = await this.findCourseTargetAssignments(targetIds);
    return this.findActiveStudentIdsForAssignments(courseAssignments);
  }

  private async findCourseTargetAssignments(targetIds: string[]) {
    const objectIds = targetIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return [];
    }

    const assignmentFilter: Record<string, unknown> = {
      $or: [{ _id: { $in: objectIds } }, { course: { $in: objectIds } }],
    };

    return this.courseAssignmentModel
      .find(assignmentFilter as never)
      .select('teacher group source enrolledStudents')
      .lean()
      .exec();
  }

  private async findActiveStudentIdsForAssignments(
    courseAssignments: Array<
      Pick<
        CourseAssignment,
        'group' | 'source' | 'enrolledStudents' | 'teacher'
      >
    >,
  ): Promise<string[]> {
    const standardGroupIds = [
      ...new Set(
        courseAssignments
          .filter(
            (assignment) =>
              assignment.source !== CourseAssignmentSource.ELECTIVE,
          )
          .map((assignment) => toId(assignment.group)),
      ),
    ]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const rosterFilters: Record<string, unknown>[] = [];

    if (standardGroupIds.length > 0) {
      rosterFilters.push({
        'studentProfile.group': { $in: standardGroupIds },
      });
    }
    for (const assignment of courseAssignments) {
      if (assignment.source !== CourseAssignmentSource.ELECTIVE) {
        continue;
      }

      const groupId = toId(assignment.group);
      const enrolledStudents = this.normalizeObjectIds(
        assignment.enrolledStudents ?? [],
      );
      if (!Types.ObjectId.isValid(groupId) || enrolledStudents.length === 0) {
        continue;
      }

      rosterFilters.push({
        _id: { $in: enrolledStudents },
        'studentProfile.group': new Types.ObjectId(groupId),
      });
    }
    if (rosterFilters.length === 0) {
      return [];
    }

    const students = await this.userModel
      .find({
        role: Role.STUDENT,
        status: 'active',
        $or: rosterFilters,
      } as never)
      .select('_id')
      .lean()
      .exec();

    return [...new Set(students.map((student) => toId(student._id)))];
  }

  private buildStudentCourseAssignmentFilter(
    studentId: string,
    groupId: string,
  ): Record<string, unknown> {
    return {
      group: new Types.ObjectId(groupId),
      $or: [
        { source: { $exists: false } },
        { source: CourseAssignmentSource.STANDARD },
        {
          source: CourseAssignmentSource.ELECTIVE,
          enrolledStudents: new Types.ObjectId(studentId),
        },
      ],
    };
  }

  private normalizeObjectIds(values: unknown[]): Types.ObjectId[] {
    return [
      ...new Set(
        values
          .map((value) => toId(value))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));
  }

  private assertValidObjectId(value: string, entity: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Некоректний ID ${entity}`);
    }
  }
}
