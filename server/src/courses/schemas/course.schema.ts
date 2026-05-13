import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Department } from '../../references/schemas';

export type CourseDocument = Course & Document;

@Schema({ timestamps: true })
export class Course {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  code: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Department',
    required: true,
  })
  departmentId: Department;

  @Prop({ required: true })
  semester: number;

  @Prop({ required: true })
  credits: number;
}

export const CourseSchema = SchemaFactory.createForClass(Course);
