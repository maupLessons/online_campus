import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { ScheduleControlType, ScheduleEntryType } from '../schedule.enums';

@Schema({ _id: false })
export class ScheduleSnapshotEntry {
  @Prop({ required: true }) key: string;
  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ }) date: string;
  @Prop({ required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  startTime: string;
  @Prop({ required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }) endTime: string;
  @Prop({ required: true, maxlength: 300 }) courseTitle: string;
  @Prop({ required: true, maxlength: 300 }) subjectKey: string;
  @Prop({ maxlength: 64 }) subjectId?: string;
  @Prop({
    type: String,
    enum: Object.values(ScheduleEntryType),
    required: true,
  })
  type: ScheduleEntryType;
  @Prop({ type: String, enum: Object.values(ScheduleControlType) })
  controlType?: ScheduleControlType;
  @Prop({ maxlength: 300 }) teacherName?: string;
  @Prop({ maxlength: 64 }) teacherExternalId?: string;
  @Prop({ maxlength: 300 }) classroom?: string;
  @Prop({ maxlength: 64 }) classroomExternalId?: string;
  @Prop({ type: Number }) pairIdx?: number;
}
export const ScheduleSnapshotEntrySchema = SchemaFactory.createForClass(
  ScheduleSnapshotEntry,
);

@Schema({ timestamps: true, collection: 'scheduleSnapshots' })
export class ScheduleSnapshot {
  @Prop({ required: true, trim: true, maxlength: 64 }) groupCode: string;
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'AcademicTerm',
    required: true,
  })
  term: Types.ObjectId;
  @Prop({ required: true, default: false }) isExamSession: boolean;
  @Prop({ type: Date, required: true }) fetchedAt: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  fetchedByUserId: Types.ObjectId | null;
  // The fields `sourceStudentId`/`externalStudentId`/`nsb` are NOT in the snapshot (spec §4.1): the document
  // is shared for the group and holds no personal student data. Who the request was made on behalf of is only
  // in the integration logs by `requestId` and in the diagnostic `fetchedByUserId`, which never leaves via the DTO.
  @Prop({ match: /^\d{4}-\d{2}-\d{2}$/ }) periodFrom?: string;
  @Prop({ match: /^\d{4}-\d{2}-\d{2}$/ }) periodTo?: string;
  @Prop({ type: [ScheduleSnapshotEntrySchema], default: [] })
  entries: ScheduleSnapshotEntry[];
  @Prop({ required: true, maxlength: 64 }) rawHash: string;
  createdAt: Date;
  updatedAt: Date;
}
export type ScheduleSnapshotDocument = HydratedDocument<ScheduleSnapshot>;
export const ScheduleSnapshotSchema =
  SchemaFactory.createForClass(ScheduleSnapshot);
ScheduleSnapshotSchema.index(
  { groupCode: 1, term: 1, isExamSession: 1 },
  { unique: true },
);
ScheduleSnapshotSchema.index({ term: 1, 'entries.teacherExternalId': 1 });
ScheduleSnapshotSchema.index({ term: 1 });
