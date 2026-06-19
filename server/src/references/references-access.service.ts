import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { AcademicAccessService } from '../common/access/academic-access.service';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import {
  Course,
  CourseAssignment,
  CourseAssignmentDocument,
  CourseDocument,
} from '../courses/schemas';
import { ScheduleEntry, ScheduleEntryDocument } from '../schedule/schemas';
import { User, UserDocument } from '../users/schemas';
import {
  throwReferenceNotFound,
  toReferenceObjectId,
} from './reference-errors';
import { ReferenceType } from './reference.types';
import { Classroom, Department, Faculty, Group, Specialty } from './schemas';

export type ReferenceReadFilter = Record<string, unknown>;

type ReferenceScope = {
  classroomIds: Types.ObjectId[];
  departmentIds: Types.ObjectId[];
  facultyIds: Types.ObjectId[];
  groupIds: Types.ObjectId[];
  specialtyIds: Types.ObjectId[];
};

const GLOBAL_REFERENCE_READ_ROLES = new Set<Role>([
  Role.ADMIN,
  Role.RECTOR,
  Role.PRESIDENT,
]);

@Injectable()
export class ReferencesAccessService {
  constructor(
    private readonly academicAccessService: AcademicAccessService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(ScheduleEntry.name)
    private readonly scheduleEntryModel: Model<ScheduleEntryDocument>,
    @InjectModel(Faculty.name)
    private readonly facultyModel: Model<Faculty>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
    @InjectModel(Specialty.name)
    private readonly specialtyModel: Model<Specialty>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<Group>,
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<Classroom>,
  ) {}

  async buildReadFilter(
    type: ReferenceType,
    user: AuthenticatedUser,
  ): Promise<ReferenceReadFilter> {
    if (GLOBAL_REFERENCE_READ_ROLES.has(user.role)) {
      return {};
    }

    const scope = await this.buildScope(user);
    switch (type) {
      case ReferenceType.FACULTIES:
        return this.idFilter(scope.facultyIds);
      case ReferenceType.DEPARTMENTS:
        return this.idFilter(scope.departmentIds);
      case ReferenceType.SPECIALTIES:
        return this.idFilter(scope.specialtyIds);
      case ReferenceType.GROUPS:
        return this.idFilter(scope.groupIds);
      case ReferenceType.CLASSROOMS:
        return this.idFilter(scope.classroomIds);
    }
  }

  async assertCanRead(
    type: ReferenceType,
    id: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const objectId = toReferenceObjectId(id, type);
    const scopeFilter = await this.buildReadFilter(type, user);
    const filter = this.combineFilters({ _id: objectId }, scopeFilter);

    const exists = await this.referenceExists(type, filter);
    if (!exists) {
      throwReferenceNotFound(type, id);
    }
  }

  private async buildScope(user: AuthenticatedUser): Promise<ReferenceScope> {
    if (!Types.ObjectId.isValid(user.sub)) {
      return this.emptyScope();
    }

    const userId = new Types.ObjectId(user.sub);
    const [account, assignmentIds] = await Promise.all([
      this.userModel
        .findById(userId)
        .select('studentProfile.group teacherProfile.department')
        .lean<{
          studentProfile?: { group?: unknown };
          teacherProfile?: { department?: unknown };
        }>()
        .exec(),
      this.academicAccessService.findVisibleCourseAssignmentIds(user),
    ]);

    const assignments =
      assignmentIds.length === 0
        ? []
        : await this.courseAssignmentModel
            .find({ _id: { $in: assignmentIds } })
            .select('course group')
            .lean<Array<{ course: unknown; group: unknown }>>()
            .exec();

    const courseIds = this.uniqueObjectIds(
      assignments.map((assignment) => assignment.course),
    );
    const assignmentGroupIds = this.uniqueObjectIds(
      assignments.map((assignment) => assignment.group),
    );
    const directDepartmentIds: Types.ObjectId[] = [];
    const directFacultyIds: Types.ObjectId[] = [];
    const directGroupIds: Types.ObjectId[] = [];

    const studentGroupId = toId(account?.studentProfile?.group);
    if (user.role === Role.STUDENT && Types.ObjectId.isValid(studentGroupId)) {
      directGroupIds.push(new Types.ObjectId(studentGroupId));
    }

    const teacherDepartmentId = toId(account?.teacherProfile?.department);
    if (
      user.role === Role.TEACHER &&
      Types.ObjectId.isValid(teacherDepartmentId)
    ) {
      directDepartmentIds.push(new Types.ObjectId(teacherDepartmentId));
    }

    if (user.role === Role.DEAN) {
      const faculties = await this.facultyModel
        .find({ dean: userId })
        .select('_id')
        .lean<Array<{ _id: unknown }>>()
        .exec();
      directFacultyIds.push(
        ...this.uniqueObjectIds(faculties.map((faculty) => faculty._id)),
      );
    }

    if (user.role === Role.DEPARTMENT_HEAD) {
      const departments = await this.departmentModel
        .find({ head: userId })
        .select('_id')
        .lean<Array<{ _id: unknown }>>()
        .exec();
      directDepartmentIds.push(
        ...this.uniqueObjectIds(
          departments.map((department) => department._id),
        ),
      );
    }

    if (
      user.role === Role.TEACHER ||
      user.role === Role.DEPARTMENT_HEAD ||
      user.role === Role.DEAN
    ) {
      const curatedGroups = await this.groupModel
        .find({ curator: userId })
        .select('_id')
        .lean<Array<{ _id: unknown }>>()
        .exec();
      directGroupIds.push(
        ...this.uniqueObjectIds(curatedGroups.map((group) => group._id)),
      );
    }

    if (directFacultyIds.length > 0) {
      const managedDepartments = await this.departmentModel
        .find({ faculty: { $in: directFacultyIds } })
        .select('_id')
        .lean<Array<{ _id: unknown }>>()
        .exec();
      directDepartmentIds.push(
        ...this.uniqueObjectIds(
          managedDepartments.map((department) => department._id),
        ),
      );
    }

    const courses =
      courseIds.length === 0
        ? []
        : await this.courseModel
            .find({ _id: { $in: courseIds } })
            .select('department')
            .lean<Array<{ department: unknown }>>()
            .exec();
    const departmentIds = this.uniqueObjectIds([
      ...directDepartmentIds,
      ...courses.map((course) => course.department),
    ]);

    const departments =
      departmentIds.length === 0
        ? []
        : await this.departmentModel
            .find({ _id: { $in: departmentIds } })
            .select('faculty')
            .lean<Array<{ faculty: unknown }>>()
            .exec();
    const facultyIds = this.uniqueObjectIds([
      ...directFacultyIds,
      ...departments.map((department) => department.faculty),
    ]);

    const groupIds = this.uniqueObjectIds([
      ...directGroupIds,
      ...assignmentGroupIds,
    ]);
    const groups =
      groupIds.length === 0
        ? []
        : await this.groupModel
            .find({ _id: { $in: groupIds } })
            .select('specialty')
            .lean<Array<{ specialty: unknown }>>()
            .exec();
    const specialtyIds = this.uniqueObjectIds(
      groups.map((group) => group.specialty),
    );

    const scheduleEntries =
      assignmentIds.length === 0
        ? []
        : await this.scheduleEntryModel
            .find({
              courseAssignment: { $in: assignmentIds },
              classroom: { $type: 'objectId' },
            } as unknown as QueryFilter<ScheduleEntryDocument>)
            .select('classroom')
            .lean<Array<{ classroom?: unknown }>>()
            .exec();
    const classroomIds = this.uniqueObjectIds(
      scheduleEntries.map((entry) => entry.classroom),
    );

    return {
      classroomIds,
      departmentIds,
      facultyIds,
      groupIds,
      specialtyIds,
    };
  }

  private async referenceExists(
    type: ReferenceType,
    filter: ReferenceReadFilter,
  ): Promise<boolean> {
    switch (type) {
      case ReferenceType.FACULTIES:
        return Boolean(
          await this.facultyModel.exists(filter as QueryFilter<Faculty>).exec(),
        );
      case ReferenceType.DEPARTMENTS:
        return Boolean(
          await this.departmentModel
            .exists(filter as QueryFilter<Department>)
            .exec(),
        );
      case ReferenceType.SPECIALTIES:
        return Boolean(
          await this.specialtyModel
            .exists(filter as QueryFilter<Specialty>)
            .exec(),
        );
      case ReferenceType.GROUPS:
        return Boolean(
          await this.groupModel.exists(filter as QueryFilter<Group>).exec(),
        );
      case ReferenceType.CLASSROOMS:
        return Boolean(
          await this.classroomModel
            .exists(filter as QueryFilter<Classroom>)
            .exec(),
        );
    }
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

  private idFilter(ids: Types.ObjectId[]): ReferenceReadFilter {
    return { _id: { $in: ids } };
  }

  private combineFilters(
    ...filters: ReferenceReadFilter[]
  ): ReferenceReadFilter {
    const activeFilters = filters.filter(
      (filter) => Object.keys(filter).length > 0,
    );
    if (activeFilters.length === 0) {
      return {};
    }
    if (activeFilters.length === 1) {
      return activeFilters[0];
    }
    return { $and: activeFilters };
  }

  private emptyScope(): ReferenceScope {
    return {
      classroomIds: [],
      departmentIds: [],
      facultyIds: [],
      groupIds: [],
      specialtyIds: [],
    };
  }
}
