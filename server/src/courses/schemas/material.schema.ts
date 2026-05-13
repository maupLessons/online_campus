import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { CourseAssignment } from './course-assignment.schema';

export type MaterialDocument = Material & Document;

@Schema({ timestamps: true })
export class Material {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'CourseAssignment',
    required: true,
  })
  courseAssignmentId: CourseAssignment;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop()
  fileLink: string;

  @Prop({ required: true, default: Date.now })
  publishDate: Date;
}

export const MaterialSchema = SchemaFactory.createForClass(Material);
