import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Course,
  CourseAssignment,
  CourseAssignmentDocument,
  CourseDocument,
} from '../courses/schemas';
import {
  ElectiveDiscipline,
  ElectiveDisciplineDocument,
  ElectiveSelection,
  ElectiveSelectionDocument,
  ElectiveSelectionPeriod,
  ElectiveSelectionPeriodDocument,
} from '../elective-disciplines/schemas';
import {
  Notification,
  NotificationDocument,
} from '../notifications/schemas/notification.schema';
import { Survey, SurveyDocument, SurveyTargetType } from '../surveys/schemas';
import { User, UserDocument } from '../users/schemas';
import { Department, Group } from './schemas';
import { throwReferenceInUse } from './reference-errors';

@Injectable()
export class ReferenceIntegrityService {
  constructor(
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<Group>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Survey.name)
    private readonly surveyModel: Model<SurveyDocument>,
    @InjectModel(ElectiveDiscipline.name)
    private readonly electiveDisciplineModel: Model<ElectiveDisciplineDocument>,
    @InjectModel(ElectiveSelectionPeriod.name)
    private readonly electivePeriodModel: Model<ElectiveSelectionPeriodDocument>,
    @InjectModel(ElectiveSelection.name)
    private readonly electiveSelectionModel: Model<ElectiveSelectionDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async assertFacultyCanBeDeleted(id: Types.ObjectId): Promise<void> {
    throwReferenceInUse('faculty', [
      {
        resource: 'departments',
        count: await this.departmentModel
          .countDocuments({ faculty: id })
          .exec(),
      },
    ]);
  }

  async assertDepartmentCanBeDeleted(id: Types.ObjectId): Promise<void> {
    throwReferenceInUse('department', [
      {
        resource: 'courses',
        count: await this.courseModel.countDocuments({ department: id }).exec(),
      },
      {
        resource: 'teacherProfiles',
        count: await this.userModel
          .countDocuments({
            'teacherProfile.department': id as unknown as Department,
          })
          .exec(),
      },
      {
        resource: 'electiveDisciplines',
        count: await this.electiveDisciplineModel
          .countDocuments({ department: id })
          .exec(),
      },
    ]);
  }

  async assertSpecialtyCanBeDeleted(id: Types.ObjectId): Promise<void> {
    throwReferenceInUse('specialty', [
      {
        resource: 'groups',
        count: await this.groupModel.countDocuments({ specialty: id }).exec(),
      },
    ]);
  }

  async assertGroupCanBeDeleted(id: Types.ObjectId): Promise<void> {
    const idString = id.toHexString();

    throwReferenceInUse('group', [
      {
        resource: 'studentProfiles',
        count: await this.userModel
          .countDocuments({ 'studentProfiles.group': id as unknown as Group })
          .exec(),
      },
      {
        resource: 'courseAssignments',
        count: await this.courseAssignmentModel
          .countDocuments({ group: id })
          .exec(),
      },
      {
        resource: 'surveys',
        count: await this.surveyModel
          .countDocuments({
            targetType: SurveyTargetType.GROUPS,
            targetIds: idString,
          })
          .exec(),
      },
      {
        resource: 'electiveSelectionPeriods',
        count: await this.electivePeriodModel
          .countDocuments({ targetGroups: id })
          .exec(),
      },
      {
        resource: 'electiveSelections',
        count: await this.electiveSelectionModel
          .countDocuments({ group: id })
          .exec(),
      },
      {
        resource: 'notifications',
        count: await this.notificationModel
          .countDocuments({ groupId: id })
          .exec(),
      },
    ]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature is kept for callers (classrooms.service.ts)
  async assertClassroomCanBeDeleted(_id: Types.ObjectId): Promise<void> {
    // The schedule is read from MAUP API snapshots (spec 02 §4.1) and stores the classroom as a string,
    // so there are no more references to the classrooms reference book — nothing to check.
    // The fate of the reference book itself is decided by spec 06 (§12).
  }
}
