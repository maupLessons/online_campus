import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Department } from '../../references/schemas';

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

  @Prop({ trim: true, maxlength: 64 })
  externalTeacherId?: string;
}

export const TeacherProfileSchema =
  SchemaFactory.createForClass(TeacherProfile);
