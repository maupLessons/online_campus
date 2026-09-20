import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { Department } from '../../references/schemas';

export type CourseDocument = Course & Document;

export enum CourseStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Schema({ timestamps: true })
export class Course {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  name: string;

  @Prop({ required: true, unique: true, trim: true, maxlength: 32 })
  code: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Department',
    required: true,
  })
  department: Department;

  @Prop({ required: true, min: 0.5, max: 30 })
  credits: number;

  // MAUP database link key (spec §4.1a); partial unique index below
  @Prop({ trim: true, maxlength: 64 })
  externalSubjectId?: string;

  @Prop({ trim: true, maxlength: 500 })
  moodleUrl?: string;

  @Prop({
    type: String,
    enum: Object.values(CourseStatus),
    default: CourseStatus.ACTIVE,
    required: true,
    index: true,
  })
  status: CourseStatus;

  @Prop({ type: Date, default: null })
  archivedAt?: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  archivedBy?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  updatedBy?: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

export const CourseSchema = SchemaFactory.createForClass(Course);

CourseSchema.plugin(paginate);
CourseSchema.index({ department: 1, status: 1 });
// §4.1: partial specifically, not sparse — sparse only skips indexing an ABSENT field,
// and a unique index would still collide on several documents with an explicit null
CourseSchema.index(
  { externalSubjectId: 1 },
  {
    unique: true,
    partialFilterExpression: { externalSubjectId: { $type: 'string' } },
  },
);
