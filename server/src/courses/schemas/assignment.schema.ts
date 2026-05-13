import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { CourseAssignment } from './course-assignment.schema';

export type AssignmentDocument = Assignment & Document;

@Schema({ timestamps: true })
export class Assignment {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'CourseAssignment',
    required: true,
  })
  courseAssignmentId: CourseAssignment;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ required: true })
  maxScore: number;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);
