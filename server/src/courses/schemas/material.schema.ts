import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { CourseAssignment } from './course-assignment.schema';
import { File } from '../../files/file.schema';

export type MaterialDocument = Material & Document;

export enum MaterialCategory {
  LECTURE = 'lecture',
  PRESENTATION = 'presentation',
  SYLLABUS = 'syllabus',
  WORK_PROGRAM = 'work_program',
  EXTERNAL_RESOURCE = 'external_resource',
  OTHER = 'other',
}

const ResourceLinkSchema = new MongooseSchema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      match: /^https:\/\/[^\s<>"']+$/,
    },
  },
  { _id: false },
);

@Schema({ timestamps: true })
export class Material {
  _id: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'CourseAssignment',
    required: true,
  })
  courseAssignment: CourseAssignment;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({
    type: String,
    enum: Object.values(MaterialCategory),
    default: MaterialCategory.LECTURE,
    required: true,
  })
  category: MaterialCategory;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'File' }],
    default: [],
  })
  files: File[];

  @Prop({ type: [ResourceLinkSchema], default: [] })
  resourceLinks: Array<{ title: string; url: string }>;

  @Prop({ required: true, default: Date.now })
  publishDate: Date;
}

export const MaterialSchema = SchemaFactory.createForClass(Material);

MaterialSchema.plugin(paginate);
MaterialSchema.index({ courseAssignment: 1, publishDate: -1 });
