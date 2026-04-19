import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Group } from './group.schema';

@Schema({ _id: false })
export class StudentProfile {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true })
  group: Group;

  @Prop({ required: true, unique: true })
  recordBookNumber: string;

  @Prop({ type: Number, required: true })
  year: number;
}

export const StudentProfileSchema =
  SchemaFactory.createForClass(StudentProfile);
