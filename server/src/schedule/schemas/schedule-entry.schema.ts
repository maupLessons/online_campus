import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { CourseAssignment } from '../../courses/schemas';
import { Classroom } from '../../references/schemas';

export enum ScheduleEntryType {
  LECTURE = 'lecture',
  SEMINAR = 'seminar',
  LAB = 'lab',
  EXAM = 'exam',
  CONSULTATION = 'consultation',
}

export enum ScheduleEntryStatus {
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled',
}

export type ScheduleEntryDocument = ScheduleEntry & Document;

@Schema({ timestamps: true })
export class ScheduleEntry {
  _id: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: CourseAssignment.name,
    required: true,
    index: true,
  })
  courseAssignment: MongooseSchema.Types.ObjectId | CourseAssignment;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Classroom.name,
    default: null,
    index: true,
  })
  classroom?: MongooseSchema.Types.ObjectId | Classroom | null;

  @Prop({ type: Date, required: true, index: true })
  date: Date;

  @Prop({ required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  startTime: string;

  @Prop({ required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  endTime: string;

  @Prop({
    type: String,
    enum: Object.values(ScheduleEntryType),
    required: true,
  })
  type: ScheduleEntryType;

  @Prop({
    type: String,
    enum: Object.values(ScheduleEntryStatus),
    default: ScheduleEntryStatus.SCHEDULED,
    required: true,
    index: true,
  })
  status: ScheduleEntryStatus;

  createdAt: Date;
  updatedAt: Date;
}

export const ScheduleEntrySchema = SchemaFactory.createForClass(ScheduleEntry);

ScheduleEntrySchema.index({ date: 1, startTime: 1, endTime: 1 });
ScheduleEntrySchema.index({
  courseAssignment: 1,
  date: 1,
  startTime: 1,
});
ScheduleEntrySchema.index(
  { classroom: 1, date: 1, startTime: 1, endTime: 1 },
  {
    partialFilterExpression: {
      classroom: { $type: 'objectId' },
      status: {
        $in: [ScheduleEntryStatus.SCHEDULED, ScheduleEntryStatus.RESCHEDULED],
      },
    },
  },
);
