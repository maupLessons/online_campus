import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { User } from '../../users/schemas';
import { CourseAssignment } from './course-assignment.schema';

export type GradeDocument = Grade & Document;

@Schema({ timestamps: true })
export class Grade {
  _id: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  student: User;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'CourseAssignment',
    required: true,
  })
  courseAssignment: CourseAssignment;

  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({
    required: true,
    enum: ['current', 'module', 'exam', 'final'],
  })
  type: string;

  @Prop({ required: true })
  value: number;

  @Prop()
  comment: string;
}

export const GradeSchema = SchemaFactory.createForClass(Grade);
GradeSchema.plugin(paginate);
