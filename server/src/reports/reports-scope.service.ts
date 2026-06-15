import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { AcademicAccessService } from '../common/access/academic-access.service';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import {
  CourseAssignment,
  CourseAssignmentDocument,
  CourseAssignmentSource,
} from '../courses/schemas';
import { User, UserDocument } from '../users/schemas';
import {
  ReportCourseOptionDto,
  ReportFiltersDto,
  ReportQueryDto,
  ReportScopeDto,
  ReportScopeType,
  ReportSelectedFiltersDto,
} from './dto';
import {
  AssignmentMetadata,
  PopulatedAssignment,
  REPORT_MAX_TIME_MS,
  ResolvedReportScope,
} from './reports.types';
import { normalizeReportAcademicYear } from './reports-query.util';

@Injectable()
export class ReportsScopeService {
  private readonly inFlightScopes = new Map<
    string,
    Promise<ResolvedReportScope>
  >();

  constructor(
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly academicAccess: AcademicAccessService,
  ) {}

  async resolve(
    query: ReportQueryDto,
    user: AuthenticatedUser,
  ): Promise<ResolvedReportScope> {
    const key = this.scopeRequestKey(query, user);
    const existing = this.inFlightScopes.get(key);
    if (existing) return existing;

    const pending = this.resolveUncached(query, user);
    this.inFlightScopes.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlightScopes.get(key) === pending) {
        this.inFlightScopes.delete(key);
      }
    }
  }

  private async resolveUncached(
    query: ReportQueryDto,
    user: AuthenticatedUser,
  ): Promise<ResolvedReportScope> {
    const allAssignments = await this.findAuthorizedAssignments(user);
    const filters = this.buildFilters(allAssignments, query);
    const selectedAssignments = this.applyFilters(
      allAssignments,
      filters.selected,
    ).sort(compareAssignments);

    return { allAssignments, selectedAssignments, filters };
  }

  private scopeRequestKey(
    query: ReportQueryDto,
    user: AuthenticatedUser,
  ): string {
    return JSON.stringify([
      user.sub,
      user.role,
      query.academicYear
        ? normalizeReportAcademicYear(query.academicYear)
        : null,
      query.semester ?? null,
      query.departmentId ?? null,
      query.groupId ?? null,
      query.courseAssignmentId ?? null,
      query.from ?? null,
      query.to ?? null,
    ]);
  }

  async countStudents(assignments: AssignmentMetadata[]): Promise<number> {
    if (assignments.length === 0) return 0;

    const standardGroupIds = uniqueIds(
      assignments
        .filter((item) => item.source !== CourseAssignmentSource.ELECTIVE)
        .map((item) => item.groupId),
    ).map((id) => new Types.ObjectId(id));
    const electiveStudentsByGroup = new Map<string, Set<string>>();

    for (const item of assignments) {
      if (
        item.source !== CourseAssignmentSource.ELECTIVE ||
        item.enrolledStudentIds.length === 0
      ) {
        continue;
      }
      const enrolled =
        electiveStudentsByGroup.get(item.groupId) ?? new Set<string>();
      item.enrolledStudentIds.forEach((id) => enrolled.add(id));
      electiveStudentsByGroup.set(item.groupId, enrolled);
    }

    const branches: Record<string, unknown>[] = [
      ...electiveStudentsByGroup.entries(),
    ].map(([groupId, studentIds]) => ({
      _id: {
        $in: [...studentIds].map((id) => new Types.ObjectId(id)),
      },
      'studentProfile.group': new Types.ObjectId(groupId),
    }));

    if (standardGroupIds.length > 0) {
      branches.push({
        'studentProfile.group': { $in: standardGroupIds },
      });
    }
    if (branches.length === 0) return 0;

    return this.userModel
      .countDocuments({
        role: Role.STUDENT,
        status: 'active',
        $or: branches,
      } as unknown as QueryFilter<UserDocument>)
      .maxTimeMS(REPORT_MAX_TIME_MS)
      .exec();
  }

  describe(
    scope: ResolvedReportScope,
    role: Role,
    studentCount: number,
  ): ReportScopeDto {
    return {
      type: this.resolveScopeType(role),
      names: this.resolveScopeNames(scope.allAssignments, role),
      assignmentCount: scope.selectedAssignments.length,
      studentCount,
    };
  }

  private async findAuthorizedAssignments(
    user: AuthenticatedUser,
  ): Promise<AssignmentMetadata[]> {
    const scopeFilter =
      await this.academicAccess.buildCourseAssignmentFilter(user);
    const documents = (await this.courseAssignmentModel
      .find(scopeFilter as QueryFilter<CourseAssignmentDocument>)
      .select('_id course group academicYear semester source enrolledStudents')
      .populate({
        path: 'course',
        select: 'name code department',
        populate: {
          path: 'department',
          select: 'name faculty',
          populate: { path: 'faculty', select: 'name' },
        },
      })
      .populate({ path: 'group', select: 'code' })
      .maxTimeMS(REPORT_MAX_TIME_MS)
      .lean()
      .exec()) as unknown as PopulatedAssignment[];

    return documents
      .map((document) => this.toAssignmentMetadata(document))
      .filter((item): item is AssignmentMetadata => item !== null);
  }

  private toAssignmentMetadata(
    assignment: PopulatedAssignment,
  ): AssignmentMetadata | null {
    const id = toId(assignment._id);
    const groupId = toId(assignment.group?._id);
    const departmentId = toId(assignment.course?.department?._id);
    const facultyId = toId(assignment.course?.department?.faculty?._id);

    if (
      !Types.ObjectId.isValid(id) ||
      !Types.ObjectId.isValid(groupId) ||
      !Types.ObjectId.isValid(departmentId) ||
      !Types.ObjectId.isValid(facultyId)
    ) {
      return null;
    }

    return {
      id,
      academicYear: normalizeReportAcademicYear(assignment.academicYear),
      semester: assignment.semester,
      source: assignment.source ?? CourseAssignmentSource.STANDARD,
      enrolledStudentIds: uniqueIds(assignment.enrolledStudents ?? []),
      courseName: assignment.course?.name?.trim() || 'Unknown course',
      courseCode: assignment.course?.code?.trim() || '',
      groupId,
      groupCode: assignment.group?.code?.trim() || '—',
      departmentId,
      departmentName:
        assignment.course?.department?.name?.trim() || 'Unknown department',
      facultyId,
      facultyName:
        assignment.course?.department?.faculty?.name?.trim() ||
        'Unknown faculty',
    };
  }

  private buildFilters(
    assignments: AssignmentMetadata[],
    query: ReportQueryDto,
  ): ReportFiltersDto {
    const academicYears = uniqueStrings(
      assignments.map((item) => item.academicYear),
    ).sort((left, right) => right.localeCompare(left));
    const semesters = [
      ...new Set(assignments.map((item) => item.semester)),
    ].sort((left, right) => left - right);
    const requestedAcademicYear = query.academicYear
      ? normalizeReportAcademicYear(query.academicYear)
      : undefined;
    const selectedAcademicYear =
      requestedAcademicYear ?? academicYears[0] ?? null;

    if (
      requestedAcademicYear &&
      !academicYears.includes(requestedAcademicYear)
    ) {
      throw new BadRequestException(
        'Academic year is not available in the authorized scope',
      );
    }
    if (query.semester && !semesters.includes(query.semester)) {
      throw new BadRequestException(
        'Semester is not available in the authorized scope',
      );
    }

    const departments = uniqueOptions(
      assignments.map((item) => ({
        id: item.departmentId,
        label: item.departmentName,
      })),
    );
    const groups = uniqueOptions(
      assignments.map((item) => ({
        id: item.groupId,
        label: item.groupCode,
      })),
    );
    const courseAssignments: ReportCourseOptionDto[] = assignments
      .map((item) => ({
        id: item.id,
        label: `${item.courseName} · ${item.groupCode}`,
        courseName: item.courseName,
        groupCode: item.groupCode,
        academicYear: item.academicYear,
        semester: item.semester,
        departmentId: item.departmentId,
        groupId: item.groupId,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'uk'));

    this.assertAuthorizedId(query.departmentId, departments);
    this.assertAuthorizedId(query.groupId, groups);
    this.assertAuthorizedId(query.courseAssignmentId, courseAssignments);

    return {
      academicYears,
      semesters,
      departments,
      groups,
      courseAssignments,
      selected: {
        academicYear: selectedAcademicYear,
        semester: query.semester ?? null,
        departmentId: query.departmentId ?? null,
        groupId: query.groupId ?? null,
        courseAssignmentId: query.courseAssignmentId ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
      },
    };
  }

  private assertAuthorizedId(
    selectedId: string | undefined,
    options: Array<{ id: string }>,
  ): void {
    if (selectedId && !options.some((option) => option.id === selectedId)) {
      throw new ForbiddenException(
        'Report filter is outside the authorized academic scope',
      );
    }
  }

  private applyFilters(
    assignments: AssignmentMetadata[],
    selected: ReportSelectedFiltersDto,
  ): AssignmentMetadata[] {
    return assignments.filter(
      (item) =>
        (!selected.academicYear ||
          item.academicYear === selected.academicYear) &&
        (!selected.semester || item.semester === selected.semester) &&
        (!selected.departmentId ||
          item.departmentId === selected.departmentId) &&
        (!selected.groupId || item.groupId === selected.groupId) &&
        (!selected.courseAssignmentId ||
          item.id === selected.courseAssignmentId),
    );
  }

  private resolveScopeType(role: Role): ReportScopeType {
    if (role === Role.DEPARTMENT_HEAD) return 'department';
    if (role === Role.DEAN) return 'faculty';
    return 'institution';
  }

  private resolveScopeNames(
    assignments: AssignmentMetadata[],
    role: Role,
  ): string[] {
    if (role === Role.DEPARTMENT_HEAD) {
      return uniqueStrings(
        assignments.map((assignment) => assignment.departmentName),
      ).sort((left, right) => left.localeCompare(right, 'uk'));
    }
    if (role === Role.DEAN) {
      return uniqueStrings(
        assignments.map((assignment) => assignment.facultyName),
      ).sort((left, right) => left.localeCompare(right, 'uk'));
    }
    return [];
  }
}

function compareAssignments(
  left: AssignmentMetadata,
  right: AssignmentMetadata,
): number {
  return (
    left.courseName.localeCompare(right.courseName, 'uk') ||
    left.groupCode.localeCompare(right.groupCode, 'uk') ||
    left.id.localeCompare(right.id)
  );
}

function uniqueIds(values: unknown[]): string[] {
  return uniqueStrings(
    values
      .map((value) => toId(value))
      .filter((id) => Types.ObjectId.isValid(id)),
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueOptions<T extends { id: string; label: string }>(
  options: T[],
): T[] {
  return [
    ...new Map(options.map((option) => [option.id, option])).values(),
  ].sort((left, right) => left.label.localeCompare(right.label, 'uk'));
}
