import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { CourseAssignment } from '../../courses/schemas';
import { Classroom } from '../../references/schemas';
import {
  ScheduleChangeAction,
  ScheduleEntryStatus,
  ScheduleEntryType,
} from '../schedule.enums';

export class ScheduleChangeHistory {
  action: ScheduleChangeAction;
  reason?: string;
  actorId?: MongooseSchema.Types.ObjectId | null;
  actorLogin?: string;
  changedAt: Date;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
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

  @Prop({ trim: true, maxlength: 500 })
  changeReason?: string;

  @Prop({ trim: true, maxlength: 2048 })
  onlineUrl?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  changedBy?: MongooseSchema.Types.ObjectId | null;

  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  cancelledBy?: MongooseSchema.Types.ObjectId | null;

  @Prop({ type: Date })
  rescheduledAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  rescheduledBy?: MongooseSchema.Types.ObjectId | null;

  @Prop({ type: Date })
  substitutedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  substitutedBy?: MongooseSchema.Types.ObjectId | null;

  @Prop({
    type: [
      {
        action: {
          type: String,
          enum: Object.values(ScheduleChangeAction),
          required: true,
        },
        reason: { type: String, trim: true, maxlength: 500 },
        actorId: {
          type: MongooseSchema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        actorLogin: { type: String, trim: true, maxlength: 120 },
        changedAt: { type: Date, required: true },
        before: { type: MongooseSchema.Types.Mixed },
        after: { type: MongooseSchema.Types.Mixed },
      },
    ],
    default: [],
  })
  changeHistory: ScheduleChangeHistory[];

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
ScheduleEntrySchema.index({ status: 1, date: 1 });
ScheduleEntrySchema.index(
  { classroom: 1, date: 1, startTime: 1, endTime: 1 },
  {
    partialFilterExpression: {
      classroom: { $type: 'objectId' },
      status: {
        $in: [
          ScheduleEntryStatus.SCHEDULED,
          ScheduleEntryStatus.RESCHEDULED,
          ScheduleEntryStatus.SUBSTITUTED,
        ],
      },
    },
  },
);
