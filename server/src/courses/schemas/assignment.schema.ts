import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { CourseAssignment } from './course-assignment.schema';
import { File } from '../../files/file.schema';
import { Group } from '../../references/schemas';

export type AssignmentDocument = Assignment & Document;

@Schema({ timestamps: true })
export class Assignment {
  _id: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'CourseAssignment',
    required: true,
  })
  courseAssignment: CourseAssignment;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Group', required: true })
  group: Group;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'File' }],
    default: [],
  })
  files: File[];

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ required: true })
  maxScore: number;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);
AssignmentSchema.plugin(paginate);
