import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
import { User } from './user.schema';
import { Group } from './group.schema';

@Schema()
export class StudentProfile extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  })
  user: User;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true })
  group: Group;

  @Prop({ required: true, unique: true })
  recordBookNumber: string;

  @Prop({ type: Number, required: true })
  year: number;
}

export const StudentProfileSchema =
  SchemaFactory.createForClass(StudentProfile);
