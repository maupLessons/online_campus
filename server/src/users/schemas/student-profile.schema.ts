import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';
import { Group } from '../../references/schemas';

export type StudentProfileStatus = 'active' | 'inactive';

@Schema({ _id: true })
export class StudentProfile {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 128 })
  externalStudentId: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true })
  group: Types.ObjectId | Group;

  @Prop({ required: true, trim: true, maxlength: 64 })
  recordBookNumber: string;

  @Prop({ type: Number, required: true, min: 1 })
  year: number;

  @Prop({ trim: true, maxlength: 120 })
  studyForm?: string;

  @Prop({ trim: true, maxlength: 240 })
  institute?: string;

  @Prop({ trim: true, maxlength: 240 })
  specialty?: string;

  @Prop({
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
    required: true,
  })
  status: StudentProfileStatus;

  @Prop({ type: Date, default: () => new Date() })
  syncedAt: Date;
}

export const StudentProfileSchema =
  SchemaFactory.createForClass(StudentProfile);
