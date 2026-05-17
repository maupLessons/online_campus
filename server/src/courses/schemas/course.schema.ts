import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { Department } from '../../references/schemas';

export type CourseDocument = Course & Document;

@Schema({ timestamps: true })
export class Course {
  _id: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  code: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Department',
    required: true,
  })
  department: Department;

  @Prop({ required: true })
  semester: number;

  @Prop({ required: true })
  credits: number;
}

export const CourseSchema = SchemaFactory.createForClass(Course);

CourseSchema.plugin(paginate);
