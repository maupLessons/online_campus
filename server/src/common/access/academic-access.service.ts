import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedUser } from '../types/authenticated-request';
import { Role } from '../types/roles.enum';
import { toId } from '../utils/to-id.util';
import {
  Course,
  CourseAssignment,
  CourseAssignmentDocument,
  CourseAssignmentSource,
  CourseDocument,
} from '../../courses/schemas';
import { Department, Faculty } from '../../references/schemas';
import { User, UserDocument } from '../../users/schemas';

type MongoFilter = Record<string, unknown>;

const GLOBAL_ACADEMIC_READ_ROLES = new Set<Role>([
  Role.ADMIN,
  Role.RECTOR,
  Role.PRESIDENT,
]);

const GLOBAL_USER_READ_ROLES = new Set<Role>([
  Role.ADMIN,
  Role.RECTOR,
  Role.PRESIDENT,
]);

@Injectable()
export class AcademicAccessService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
    @InjectModel(Faculty.name)
    private readonly facultyModel: Model<Faculty>,
  ) {}

  async buildCourseAssignmentFilter(
    user: AuthenticatedUser,
  ): Promise<MongoFilter> {
    if (GLOBAL_ACADEMIC_READ_ROLES.has(user.role)) {
      return {};
    }

    const userId = this.toObjectId(user.sub);

    if (user.role === Role.STUDENT) {
      const student = await this.userModel
        .findById(userId)
        .select('studentProfile.group')
        .lean<{ studentProfile?: { group?: unknown } }>()
        .exec();
      const groupId = toId(student?.studentProfile?.group);

      if (!Types.ObjectId.isValid(groupId)) {
        return this.emptyFilter();
      }

      return {
        group: new Types.ObjectId(groupId),
        $or: [
          { source: { $exists: false } },
          { source: CourseAssignmentSource.STANDARD },
          {
            source: CourseAssignmentSource.ELECTIVE,
            enrolledStudents: userId,
          },
        ],
      };
    }

    if (user.role === Role.TEACHER) {
      return { teacher: userId };
    }

    if (user.role === Role.DEAN || user.role === Role.DEPARTMENT_HEAD) {
      const departmentIds = await this.findManagedDepartmentIds(user);
      if (departmentIds.length === 0) {
        return this.emptyFilter();
      }

      const courseIds = await this.findCourseIdsByDepartments(departmentIds);
      return courseIds.length > 0
        ? { course: { $in: courseIds } }
        : this.emptyFilter();
    }

    return this.emptyFilter();
  }

  async buildCourseFilter(user: AuthenticatedUser): Promise<MongoFilter> {
    if (GLOBAL_ACADEMIC_READ_ROLES.has(user.role)) {
      return {};
    }

    if (user.role === Role.DEAN || user.role === Role.DEPARTMENT_HEAD) {
      const departmentIds = await this.findManagedDepartmentIds(user);
      return departmentIds.length > 0
        ? { department: { $in: departmentIds } }
        : this.emptyFilter();
    }

    const assignmentIds = await this.findVisibleCourseAssignmentIds(user);
    if (assignmentIds.length === 0) {
      return this.emptyFilter();
    }

    const assignments = await this.courseAssignmentModel
      .find({ _id: { $in: assignmentIds } })
      .select('course')
      .lean<Array<{ course: unknown }>>()
      .exec();
    const courseIds = this.uniqueObjectIds(
      assignments.map((assignment) => assignment.course),
    );

    return courseIds.length > 0
      ? { _id: { $in: courseIds } }
      : this.emptyFilter();
  }

  async buildVisibleUserFilter(user: AuthenticatedUser): Promise<MongoFilter> {
    if (GLOBAL_USER_READ_ROLES.has(user.role)) {
      return {};
    }

    const userId = this.toObjectId(user.sub);

    if (
      user.role !== Role.DEAN &&
      user.role !== Role.DEPARTMENT_HEAD &&
      user.role !== Role.TEACHER
    ) {
      return { _id: userId };
    }

    const assignmentIds = await this.findVisibleCourseAssignmentIds(user);
    const assignments =
      assignmentIds.length === 0
        ? []
        : await this.courseAssignmentModel
            .find({ _id: { $in: assignmentIds } })
            .select('group')
            .lean<Array<{ group: unknown }>>()
            .exec();
    const groupIds = this.uniqueObjectIds(
      assignments.map((assignment) => assignment.group),
    );
    const departmentIds =
      user.role === Role.DEAN || user.role === Role.DEPARTMENT_HEAD
        ? await this.findManagedDepartmentIds(user)
        : [];
    const visibleBranches: MongoFilter[] = [{ _id: userId }];

    if (departmentIds.length > 0) {
      visibleBranches.push({
        'teacherProfile.department': { $in: departmentIds },
      });
    }
    if (groupIds.length > 0) {
      visibleBranches.push({
        'studentProfile.group': { $in: groupIds },
      });
    }

    return { $or: visibleBranches };
  }

  async findVisibleCourseAssignmentIds(
    user: AuthenticatedUser,
  ): Promise<Types.ObjectId[]> {
    const filter = await this.buildCourseAssignmentFilter(user);
    const assignments = await this.courseAssignmentModel
      .find(filter)
      .select('_id')
      .lean<Array<{ _id: unknown }>>()
      .exec();

    return this.uniqueObjectIds(
      assignments.map((assignment) => assignment._id),
    );
  }

  async canAccessCourseAssignment(
    courseAssignmentId: string,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(courseAssignmentId)) {
      return false;
    }

    const scopeFilter = await this.buildCourseAssignmentFilter(user);
    const match = await this.courseAssignmentModel
      .exists({
        $and: [{ _id: new Types.ObjectId(courseAssignmentId) }, scopeFilter],
      })
      .exec();

    return match !== null;
  }

  async canAccessGroup(
    groupId: string,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(groupId)) {
      return false;
    }
    if (GLOBAL_USER_READ_ROLES.has(user.role)) {
      return true;
    }

    const scopeFilter = await this.buildCourseAssignmentFilter(user);
    const match = await this.courseAssignmentModel
      .exists({
        $and: [{ group: new Types.ObjectId(groupId) }, scopeFilter],
      })
      .exec();

    return match !== null;
  }

  async canAccessDepartment(
    departmentId: string,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(departmentId)) {
      return false;
    }
    if (GLOBAL_USER_READ_ROLES.has(user.role)) {
      return true;
    }
    if (user.role !== Role.DEAN && user.role !== Role.DEPARTMENT_HEAD) {
      return false;
    }

    const departmentIds = await this.findManagedDepartmentIds(user);
    return departmentIds.some((id) => id.equals(departmentId));
  }

  async findCourseAssignmentRecipientIds(
    courseAssignmentIds: string[],
  ): Promise<string[]> {
    const objectIds = this.uniqueObjectIds(courseAssignmentIds);
    if (objectIds.length === 0) {
      return [];
    }

    const assignments = await this.courseAssignmentModel
      .find({ _id: { $in: objectIds } })
      .select('teacher group source enrolledStudents')
      .lean<
        Array<
          Pick<
            CourseAssignment,
            'teacher' | 'group' | 'source' | 'enrolledStudents'
          >
        >
      >()
      .exec();
    const teacherIds = assignments
      .map((assignment) => toId(assignment.teacher))
      .filter((id) => Types.ObjectId.isValid(id));
    const standardGroupIds = this.uniqueObjectIds(
      assignments
        .filter(
          (assignment) => assignment.source !== CourseAssignmentSource.ELECTIVE,
        )
        .map((assignment) => assignment.group),
    );
    const rosterFilters: MongoFilter[] = [];

    if (standardGroupIds.length > 0) {
      rosterFilters.push({
        'studentProfile.group': { $in: standardGroupIds },
      });
    }

    for (const assignment of assignments) {
      if (assignment.source !== CourseAssignmentSource.ELECTIVE) {
        continue;
      }

      const groupId = toId(assignment.group);
      const enrolledStudents = this.uniqueObjectIds(
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

    const students =
      rosterFilters.length === 0
        ? []
        : await this.userModel
            .find({
              role: Role.STUDENT,
              status: 'active',
              $or: rosterFilters,
            })
            .select('_id')
            .lean<Array<{ _id: unknown }>>()
            .exec();

    return [
      ...new Set([
        ...teacherIds,
        ...students.map((student) => toId(student._id)),
      ]),
    ];
  }

  private async findManagedDepartmentIds(
    user: AuthenticatedUser,
  ): Promise<Types.ObjectId[]> {
    const userId = this.toObjectId(user.sub);

    if (user.role === Role.DEAN) {
      const faculties = await this.facultyModel
        .find({ dean: userId })
        .select('_id')
        .lean<Array<{ _id: unknown }>>()
        .exec();
      const facultyIds = this.uniqueObjectIds(
        faculties.map((faculty) => faculty._id),
      );

      if (facultyIds.length === 0) {
        return [];
      }

      const departments = await this.departmentModel
        .find({ faculty: { $in: facultyIds } })
        .select('_id')
        .lean<Array<{ _id: unknown }>>()
        .exec();
      return this.uniqueObjectIds(
        departments.map((department) => department._id),
      );
    }

    if (user.role === Role.DEPARTMENT_HEAD) {
      const departments = await this.departmentModel
        .find({ head: userId })
        .select('_id')
        .lean<Array<{ _id: unknown }>>()
        .exec();
      return this.uniqueObjectIds(
        departments.map((department) => department._id),
      );
    }

    return [];
  }

  private async findCourseIdsByDepartments(
    departmentIds: Types.ObjectId[],
  ): Promise<Types.ObjectId[]> {
    const courses = await this.courseModel
      .find({ department: { $in: departmentIds } })
      .select('_id')
      .lean<Array<{ _id: unknown }>>()
      .exec();

    return this.uniqueObjectIds(courses.map((course) => course._id));
  }

  private uniqueObjectIds(values: unknown[]): Types.ObjectId[] {
    return [
      ...new Set(
        values
          .map((value) => toId(value))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));
  }

  private toObjectId(value: string): Types.ObjectId {
    return new Types.ObjectId(value);
  }

  private emptyFilter(): MongoFilter {
    return { _id: { $in: [] } };
  }
}
