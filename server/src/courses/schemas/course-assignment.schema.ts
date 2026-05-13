import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Course } from './course.schema';
import { Group } from '../../references/schemas';
import { User } from '../../users/schemas';

export type CourseAssignmentDocument = CourseAssignment & Document;

@Schema({ timestamps: true })
export class CourseAssignment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Course', required: true })
  course: Course;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Group', required: true })
  group: Group;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  teacher: User;

  @Prop({ required: true })
  academicYear: string;

  @Prop({ required: true })
  semester: number;
}

export const CourseAssignmentSchema =
  SchemaFactory.createForClass(CourseAssignment);
