import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { CourseAssignment } from './course-assignment.schema';
import { File } from '../../files/file.schema';

export type MaterialDocument = Material & Document;

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
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'File' }],
    default: [],
  })
  files: File[];

  @Prop({ required: true, default: Date.now })
  publishDate: Date;
}

export const MaterialSchema = SchemaFactory.createForClass(Material);

MaterialSchema.plugin(paginate);
MaterialSchema.index({ courseAssignment: 1, publishDate: -1 });
