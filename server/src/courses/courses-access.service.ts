import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import { Department, Faculty } from '../references/schemas';
import { UsersService } from '../users/users.service';
import { AcademicTermsService } from '../academic-terms/academic-terms.service';
import {
  Course,
  CourseAssignment,
  CourseAssignmentDocument,
  CourseAssignmentSource,
  CourseDocument,
} from './schemas';

type MongoFilter = Record<string, unknown>;
const FORBIDDEN_MESSAGE = 'Немає доступу до цієї дисципліни';

@Injectable()
export class CoursesAccessService {
  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseAssignment.name)
    private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
    @InjectModel(Faculty.name) private readonly facultyModel: Model<Faculty>,
    private readonly usersService: UsersService,
    private readonly academicTermsService: AcademicTermsService,
  ) {}

  async getManagedDepartmentIds(
    user: AuthenticatedUser,
  ): Promise<Types.ObjectId[]> {
    const me = new Types.ObjectId(user.sub);
    if (user.role === Role.DEPARTMENT_HEAD) {
      const departments = await this.departmentModel
        .find({ head: me })
        .select('_id')
        .lean<Array<{ _id: Types.ObjectId }>>()
        .exec();
      return departments.map((d) => d._id);
    }
    if (user.role === Role.DEAN) {
      const faculties = await this.facultyModel
        .find({ dean: me })
        .select('_id')
        .lean<Array<{ _id: Types.ObjectId }>>()
        .exec();
      if (faculties.length === 0) return [];
      const departments = await this.departmentModel
        .find({ faculty: { $in: faculties.map((f) => f._id) } })
        .select('_id')
        .lean<Array<{ _id: Types.ObjectId }>>()
        .exec();
      return departments.map((d) => d._id);
    }
    return [];
  }

  async buildCatalogFilter(
    user: AuthenticatedUser,
    departmentId?: string,
  ): Promise<MongoFilter> {
    if (user.role === Role.ADMIN) {
      return departmentId && Types.ObjectId.isValid(departmentId)
        ? { department: new Types.ObjectId(departmentId) }
        : {};
    }
    if (user.role === Role.DEPARTMENT_HEAD || user.role === Role.DEAN) {
      const managed = await this.getManagedDepartmentIds(user);
      if (managed.length === 0) return { _id: { $in: [] } };
      if (departmentId && Types.ObjectId.isValid(departmentId)) {
        const wanted = new Types.ObjectId(departmentId);
        return managed.some((id) => id.equals(wanted))
          ? { department: wanted }
          : { _id: { $in: [] } };
      }
      return { department: { $in: managed } };
    }
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  async loadCourseForRead(
    courseId: string,
    user: AuthenticatedUser,
  ): Promise<CourseDocument> {
    const course = await this.findCourseOrThrow(courseId, user);
    if (user.role === Role.ADMIN) return course;
    if (user.role === Role.DEPARTMENT_HEAD || user.role === Role.DEAN) {
      if (await this.isManagedDepartment(user, toId(course.department)))
        return course;
    }
    if (user.role === Role.TEACHER) {
      const own = await this.assignmentModel
        .exists({
          course: course._id,
          teacher: new Types.ObjectId(user.sub),
        } as never)
        .exec();
      if (own) return course;
    }
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  async loadCourseForManage(
    courseId: string,
    user: AuthenticatedUser,
  ): Promise<CourseDocument> {
    const course = await this.findCourseOrThrow(courseId, user);
    if (user.role === Role.ADMIN) return course;
    if (user.role === Role.DEPARTMENT_HEAD) {
      if (await this.isManagedDepartment(user, toId(course.department)))
        return course;
    }
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  async assertCanCreateInDepartment(
    departmentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (user.role === Role.ADMIN) return;
    if (user.role === Role.DEPARTMENT_HEAD) {
      if (await this.isManagedDepartment(user, departmentId)) return;
    }
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  async loadAssignmentForRead(
    assignmentId: string,
    user: AuthenticatedUser,
  ): Promise<CourseAssignmentDocument> {
    const assignment = await this.findAssignmentOrThrow(assignmentId, user);
    if (user.role === Role.ADMIN) return assignment;
    const me = new Types.ObjectId(user.sub);
    if (user.role === Role.TEACHER && me.equals(toId(assignment.teacher)))
      return assignment;
    if (user.role === Role.DEPARTMENT_HEAD || user.role === Role.DEAN) {
      const courseDepartment = toId(
        (assignment.course as unknown as { department: unknown }).department,
      );
      if (await this.isManagedDepartment(user, courseDepartment))
        return assignment;
    }
    if (user.role === Role.STUDENT) {
      const profile = await this.usersService.getActiveStudentProfile(user.sub);
      const term = await this.academicTermsService.getCurrent();
      const sameGroup =
        profile && toId(profile.group) === toId(assignment.group);
      const sameTerm = term && toId(term._id) === toId(assignment.term);
      const enrolled =
        assignment.source !== CourseAssignmentSource.ELECTIVE ||
        (assignment.enrolledStudents ?? []).some((s) => toId(s) === user.sub);
      if (sameGroup && sameTerm && enrolled) return assignment;
    }
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  async loadAssignmentForResources(
    assignmentId: string,
    user: AuthenticatedUser,
  ): Promise<CourseAssignmentDocument> {
    const assignment = await this.findAssignmentOrThrow(assignmentId, user);
    if (await this.canEditResources(assignment, user)) return assignment;
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  async canEditResources(
    assignment: CourseAssignmentDocument,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    if (user.role === Role.TEACHER)
      return toId(assignment.teacher) === user.sub;
    if (user.role === Role.DEPARTMENT_HEAD) {
      const courseDepartment = toId(
        (assignment.course as unknown as { department: unknown }).department,
      );
      return this.isManagedDepartment(user, courseDepartment);
    }
    return false;
  }

  async canEditMoodleUrl(
    course: CourseDocument,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    if (user.role === Role.ADMIN) return true;
    if (user.role === Role.DEPARTMENT_HEAD) {
      return this.isManagedDepartment(user, toId(course.department));
    }
    return false;
  }

  private async isManagedDepartment(
    user: AuthenticatedUser,
    departmentId: string,
  ): Promise<boolean> {
    const managed = await this.getManagedDepartmentIds(user);
    return managed.some((id) => id.equals(departmentId));
  }

  private async findCourseOrThrow(
    courseId: string,
    user: AuthenticatedUser,
  ): Promise<CourseDocument> {
    if (!Types.ObjectId.isValid(courseId)) this.throwMissing(user);
    const course = await this.courseModel.findById(courseId).exec();
    if (!course) this.throwMissing(user);
    return course as CourseDocument;
  }

  private async findAssignmentOrThrow(
    assignmentId: string,
    user: AuthenticatedUser,
  ): Promise<CourseAssignmentDocument> {
    if (!Types.ObjectId.isValid(assignmentId)) this.throwMissing(user);
    const assignment = await this.assignmentModel
      .findById(assignmentId)
      .populate({ path: 'course', select: 'department status' })
      .exec();
    if (!assignment) this.throwMissing(user);
    return assignment as CourseAssignmentDocument;
  }

  private throwMissing(user: AuthenticatedUser): never {
    if (user.role === Role.ADMIN)
      throw new NotFoundException('Дисципліну не знайдено');
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }
}
