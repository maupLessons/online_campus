import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ElectiveDiscipline,
  ElectiveDisciplineStatus,
  ElectiveSelection,
  ElectiveSelectionPeriod,
  ElectiveSelectionPeriodStatus,
  ElectiveSelectionStatus,
} from '../../elective-disciplines/schemas';
import {
  Survey,
  SurveyQuestion,
  SurveyQuestionType,
  SurveyStatus,
  SurveyTargetType,
} from '../../surveys/schemas';
import { User } from '../../users/schemas';
import { activeStudentsInGroup } from '../../users/student-profile.filters';
import { AcademicTermsService } from '../../academic-terms/academic-terms.service';
import { Role } from '../../common/types/roles.enum';
import { departments, groups, users } from '../../common/mock-data';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Demo data for elective disciplines and surveys (spec 06 §9.1): a scheduled
 * survey, a cancelled elective discipline, and a student-cancelled selection in a
 * period with a future `startsAt` (`upcoming` phase).
 */
@Injectable()
export class ElectiveSurveyDemoSeeder {
  private readonly logger = new Logger(ElectiveSurveyDemoSeeder.name);

  constructor(
    @InjectModel(ElectiveDiscipline.name)
    private readonly disciplineModel: Model<ElectiveDiscipline>,
    @InjectModel(ElectiveSelectionPeriod.name)
    private readonly periodModel: Model<ElectiveSelectionPeriod>,
    @InjectModel(ElectiveSelection.name)
    private readonly selectionModel: Model<ElectiveSelection>,
    @InjectModel(Survey.name)
    private readonly surveyModel: Model<Survey>,
    @InjectModel(SurveyQuestion.name)
    private readonly surveyQuestionModel: Model<SurveyQuestion>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly academicTermsService: AcademicTermsService,
  ) {}

  async seed(): Promise<void> {
    await this.seedElectiveDemoData();
    await this.seedSurveyDemoData();
  }

  private async seedElectiveDemoData(): Promise<void> {
    const count = await this.disciplineModel.countDocuments();
    if (count > 0) {
      this.logger.log('Elective disciplines already exist. Skipping seeding.');
      return;
    }

    const term = await this.academicTermsService.getCurrent();
    if (!term) {
      this.logger.warn(
        'No current academic term found. Skipping elective demo seeding.',
      );
      return;
    }

    const admin = users.find((u) => u.role === Role.ADMIN);
    const teacher = users.find((u) => u.login === 'teacher1');
    if (!admin || !teacher) {
      this.logger.warn(
        'Demo admin/teacher accounts not found. Skipping elective demo seeding.',
      );
      return;
    }

    const now = new Date();

    await this.disciplineModel.create({
      code: 'EL-201',
      title: 'Основи кібербезпеки',
      description:
        'Вибіркова дисципліна про принципи захисту інформаційних систем.',
      department: departments[0].id,
      teacher: null,
      term: term._id,
      credits: 3,
      capacity: 25,
      enrolledCount: 0,
      status: ElectiveDisciplineStatus.CANCELLED,
      createdBy: admin.id,
      cancelledAt: now,
      cancelledBy: admin.id,
      cancelReason: 'Демо: викладача не призначено',
    });

    const upcomingDiscipline = await this.disciplineModel.create({
      code: 'EL-202',
      title: 'Управління ІТ-проєктами',
      description: 'Вибіркова дисципліна з основ управління проєктами в ІТ.',
      department: departments[1].id,
      teacher: teacher.id,
      term: term._id,
      credits: 3,
      capacity: 30,
      enrolledCount: 0,
      status: ElectiveDisciplineStatus.ACTIVE,
      createdBy: admin.id,
    });

    const groupId = new Types.ObjectId(groups[0].id);
    const studentFilter: Record<string, unknown> = {
      role: Role.STUDENT,
      status: 'active',
      ...activeStudentsInGroup(groupId),
    };
    const student = await this.userModel.findOne(studentFilter).exec();
    if (!student) {
      this.logger.warn(
        'No active students found in demo group. Skipping upcoming period/selection seeding.',
      );
      return;
    }

    const period = await this.periodModel.create({
      title: 'Вибір дисциплін (демо, ще не розпочався)',
      term: term._id,
      startsAt: new Date(now.getTime() + 5 * DAY_MS),
      endsAt: new Date(now.getTime() + 19 * DAY_MS),
      status: ElectiveSelectionPeriodStatus.ACTIVE,
      targetGroups: [groupId],
      requiredChoices: 1,
      createdBy: admin.id,
      publishedAt: now,
    });

    await this.selectionModel.create({
      period: period._id,
      discipline: upcomingDiscipline._id,
      student: student._id,
      group: groupId,
      selectedAt: now,
      status: ElectiveSelectionStatus.CANCELLED,
      cancelReason: 'student',
      cancelledAt: now,
      choiceSlot: 0,
    });

    this.logger.log(
      'Seeded demo elective data: cancelled discipline, upcoming period, cancelled student selection.',
    );
  }

  private async seedSurveyDemoData(): Promise<void> {
    const count = await this.surveyModel.countDocuments();
    if (count > 0) {
      this.logger.log('Surveys already exist. Skipping seeding.');
      return;
    }

    const admin = users.find((u) => u.role === Role.ADMIN);
    if (!admin) {
      this.logger.warn(
        'Demo admin account not found. Skipping survey demo seeding.',
      );
      return;
    }

    const now = new Date();
    const startDate = new Date(now.getTime() + 2 * DAY_MS);
    const endDate = new Date(startDate.getTime() + 7 * DAY_MS);
    const expectedRecipients = await this.userModel.countDocuments({
      role: Role.STUDENT,
      status: 'active',
    });

    const survey = await this.surveyModel.create({
      title: 'Опитування якості викладання (демо)',
      description:
        'Заплановане опитування студентів про якість викладання дисциплін.',
      status: SurveyStatus.SCHEDULED,
      anonymous: false,
      targetType: SurveyTargetType.ALL,
      targetIds: [],
      createdBy: admin.id,
      startDate,
      endDate,
      publishedAt: now,
      expectedRecipients,
      estimatedMinutes: 5,
    });

    await this.surveyQuestionModel.create({
      survey: survey._id,
      type: SurveyQuestionType.SINGLE,
      text: 'Наскільки ви задоволені якістю викладання дисципліни?',
      options: [
        'Дуже задоволений(а)',
        'Скоріше задоволений(а)',
        'Не задоволений(а)',
      ],
      required: true,
      order: 0,
    });

    this.logger.log('Seeded demo scheduled survey with one question.');
  }
}
