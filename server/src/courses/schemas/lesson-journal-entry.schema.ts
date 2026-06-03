import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { ScheduleEntryType } from '../../schedule/schemas';
import { User } from '../../users/schemas';
import { CourseAssignment } from './course-assignment.schema';

export type LessonJournalEntryDocument = LessonJournalEntry & Document;

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  EXCUSED = 'excused',
}

const AttendanceRecordSchema = new MongooseSchema(
  {
    student: {
      type: MongooseSchema.Types.ObjectId,
      ref: User.name,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(AttendanceStatus),
      required: true,
    },
    comment: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false },
);

@Schema({ timestamps: true })
export class LessonJournalEntry {
  _id: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: CourseAssignment.name,
    required: true,
    index: true,
  })
  courseAssignment: CourseAssignment;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ScheduleEntry',
    default: null,
    index: true,
  })
  scheduleEntry?: MongooseSchema.Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  teacher: User;

  @Prop({ type: Date, required: true, index: true })
  date: Date;

  @Prop({ match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  startTime?: string;

  @Prop({ match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  endTime?: string;

  @Prop({ type: String, enum: Object.values(ScheduleEntryType) })
  type?: ScheduleEntryType;

  @Prop({ required: true, trim: true, maxlength: 300 })
  topic: string;

  @Prop({ trim: true, maxlength: 2000, default: '' })
  description?: string;

  @Prop({ type: [AttendanceRecordSchema], default: [] })
  attendance: Array<{
    student: User | MongooseSchema.Types.ObjectId;
    status: AttendanceStatus;
    comment?: string;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

export const LessonJournalEntrySchema =
  SchemaFactory.createForClass(LessonJournalEntry);

LessonJournalEntrySchema.plugin(paginate);
LessonJournalEntrySchema.index({ courseAssignment: 1, date: -1 });
LessonJournalEntrySchema.index(
  { courseAssignment: 1, scheduleEntry: 1 },
  {
    unique: true,
    partialFilterExpression: {
      scheduleEntry: { $type: 'objectId' },
    },
  },
);
