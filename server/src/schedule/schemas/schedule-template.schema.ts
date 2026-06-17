import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { CourseAssignment } from '../../courses/schemas';
import { Classroom } from '../../references/schemas';
import { ScheduleEntryType } from './schedule-entry.schema';

export enum ScheduleTemplateStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export type ScheduleTemplateDocument = ScheduleTemplate & Document;

@Schema({ timestamps: true })
export class ScheduleTemplate {
  _id: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, trim: true, minlength: 2, maxlength: 120 })
  title: string;

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

  @Prop({ required: true, min: 1, max: 7, index: true })
  dayOfWeek: number;

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
    enum: Object.values(ScheduleTemplateStatus),
    default: ScheduleTemplateStatus.ACTIVE,
    required: true,
    index: true,
  })
  status: ScheduleTemplateStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  createdBy?: MongooseSchema.Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

export const ScheduleTemplateSchema =
  SchemaFactory.createForClass(ScheduleTemplate);

ScheduleTemplateSchema.index({
  courseAssignment: 1,
  dayOfWeek: 1,
  startTime: 1,
});
