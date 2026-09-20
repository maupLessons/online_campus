import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

export enum CourseResourceType {
  LINK = 'link',
  VIDEO = 'video',
  DOCUMENT = 'document',
  OTHER = 'other',
}

export const MAX_COURSE_RESOURCES = 20;

@Schema({ _id: true, timestamps: false })
export class CourseResource {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({
    type: String,
    enum: Object.values(CourseResourceType),
    default: CourseResourceType.LINK,
    required: true,
  })
  type: CourseResourceType;

  @Prop({ required: true, trim: true, maxlength: 500 })
  url: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  addedBy: Types.ObjectId;

  @Prop({ type: Date, required: true, default: () => new Date() })
  addedAt: Date;
}

export const CourseResourceSchema =
  SchemaFactory.createForClass(CourseResource);
