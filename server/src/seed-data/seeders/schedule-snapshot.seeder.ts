import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AcademicTermsService } from '../../academic-terms/academic-terms.service';
import { MAUP_SCHEDULE_CONTRACT_FIXTURE } from '../../integrations/maup-student-api/fixtures/maup-schedule.contract-fixture';
import { Group } from '../../references/schemas';
import {
  hashWireResponse,
  mapMaupScheduleToSnapshot,
} from '../../schedule/maup-schedule.mapper';
import {
  ScheduleSnapshot,
  ScheduleSnapshotDocument,
} from '../../schedule/schemas';

@Injectable()
export class ScheduleSnapshotSeeder {
  private readonly logger = new Logger(ScheduleSnapshotSeeder.name);
  constructor(
    @InjectModel(ScheduleSnapshot.name)
    private readonly model: Model<ScheduleSnapshotDocument>,
    @InjectModel(Group.name) private readonly groupModel: Model<Group>,
    private readonly terms: AcademicTermsService,
  ) {}

  async seed(): Promise<void> {
    if ((await this.model.countDocuments()) > 0) {
      this.logger.log('Schedule snapshots exist. Skipping.');
      return;
    }
    const term = await this.terms.getCurrent();
    if (!term) {
      this.logger.warn('No current term; schedule snapshots not seeded.');
      return;
    }
    const groups = await this.groupModel.find().select('code').lean().exec();
    const docs: Partial<ScheduleSnapshot>[] = [];
    for (const group of groups) {
      for (const isExamSession of [false, true]) {
        const source = MAUP_SCHEDULE_CONTRACT_FIXTURE.filter(
          (p) => Boolean(p.zes_schedule) === isExamSession,
        ).map((p) => ({ ...p, group: group.code }));
        const mapped = mapMaupScheduleToSnapshot(source, {
          isExamSession,
        });
        docs.push({
          groupCode: group.code,
          term: term._id,
          isExamSession,
          fetchedAt: new Date(),
          fetchedByUserId: null,
          periodFrom: mapped.periodFrom,
          periodTo: mapped.periodTo,
          entries: mapped.entries,
          rawHash: hashWireResponse(source),
        });
      }
    }
    await this.model.insertMany(docs);
    this.logger.log(`Seeded ${docs.length} schedule snapshots.`);
  }
}
