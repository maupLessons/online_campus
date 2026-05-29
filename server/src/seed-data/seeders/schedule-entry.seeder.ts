import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { scheduleEntries } from '../../common/mock-data';
import { ScheduleEntry } from '../../schedule/schemas';

@Injectable()
export class ScheduleEntrySeeder {
  private readonly logger = new Logger(ScheduleEntrySeeder.name);

  constructor(
    @InjectModel(ScheduleEntry.name)
    private readonly scheduleEntryModel: Model<ScheduleEntry>,
  ) {}

  async seed(): Promise<void> {
    const count = await this.scheduleEntryModel.countDocuments();
    if (count > 0) {
      this.logger.log('Schedule entries already exist. Skipping seeding.');
      return;
    }

    const data = scheduleEntries.map((entry) => ({
      _id: entry.id,
      courseAssignment: entry.courseAssignmentId,
      classroom: entry.classroomId ?? null,
      date: new Date(`${entry.date}T00:00:00.000Z`),
      startTime: entry.startTime,
      endTime: entry.endTime,
      type: entry.type,
      status: entry.status,
    }));

    await this.scheduleEntryModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} schedule entries.`);
  }
}
