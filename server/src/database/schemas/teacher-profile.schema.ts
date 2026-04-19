import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Department } from './department.schema';

@Schema({ _id: false })
export class TeacherProfile {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true,
  })
  department: Department;

  @Prop({ required: true })
  position: string;
}

export const TeacherProfileSchema =
  SchemaFactory.createForClass(TeacherProfile);
