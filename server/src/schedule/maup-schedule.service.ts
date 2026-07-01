import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { MaupStudentApiClient } from '../integrations/maup-student-api/maup-student-api.client';
import { MaupStudentApiError } from '../integrations/maup-student-api/maup-student-api.error';
import { MaupScheduleOptions } from '../integrations/maup-student-api/maup-student-api.types';
import { User, UserDocument } from '../users/schemas';
import { ScheduleEntryDto, ScheduleQueryDto } from './dto';
import { mapMaupScheduleResponse } from './maup-schedule.mapper';

type StudentScheduleLookup = {
  studentId?: string;
  recordBookNumber?: string;
};

@Injectable()
export class MaupScheduleService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly maupClient: MaupStudentApiClient,
  ) {}

  async findMySchedule(
    user: AuthenticatedUser,
    query: ScheduleQueryDto = {},
  ): Promise<ScheduleEntryDto[] | null> {
    if (
      user.role !== Role.STUDENT ||
      !this.maupClient.getDiagnostics().enabled
    ) {
      return null;
    }

    const lookup = await this.getStudentLookup(user.sub);
    if (!lookup) {
      return null;
    }

    try {
      const response = await this.maupClient.getScheduleByStudentLookup(
        lookup,
        this.buildApiOptions(query),
      );
      return mapMaupScheduleResponse(response, query);
    } catch (error: unknown) {
      if (error instanceof MaupStudentApiError && error.kind === 'disabled') {
        return null;
      }

      throw new ServiceUnavailableException(
        'Розклад МАУП тимчасово недоступний',
      );
    }
  }

  private async getStudentLookup(
    userId: string,
  ): Promise<StudentScheduleLookup | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }

    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(userId),
        role: Role.STUDENT,
        status: 'active',
      })
      .select(
        'studentProfile.externalStudentId studentProfile.recordBookNumber',
      )
      .lean<{
        studentProfile?: {
          externalStudentId?: string;
          recordBookNumber?: string;
        };
      }>()
      .exec();

    const studentId = user?.studentProfile?.externalStudentId?.trim();
    const recordBookNumber = user?.studentProfile?.recordBookNumber?.trim();

    if (!studentId && !recordBookNumber) {
      return null;
    }

    return {
      ...(studentId ? { studentId } : {}),
      ...(recordBookNumber ? { recordBookNumber } : {}),
    };
  }

  private buildApiOptions(query: ScheduleQueryDto): MaupScheduleOptions {
    const sourceDate = query.date ?? query.startDate ?? query.endDate;
    const calendarYear = sourceDate
      ? Number(sourceDate.slice(0, 4))
      : undefined;

    return {
      ...(Number.isSafeInteger(calendarYear) ? { calendarYear } : {}),
    };
  }
}
