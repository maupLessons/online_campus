import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Role } from '../../common/types/roles.enum';
import { StudentProfile, StudentProfileSchema } from './student-profile.schema';
import { TeacherProfile, TeacherProfileSchema } from './teacher-profile.schema';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true })
  login: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: String, enum: Object.values(Role), required: true })
  role: Role;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop()
  middleName?: string;

  @Prop()
  avatarUrl?: string;

  @Prop({
    type: String,
    enum: ['active', 'blocked'],
    required: true,
    default: 'active',
  })
  status: string;

  @Prop({ type: StudentProfileSchema, required: false })
  studentProfile?: StudentProfile;

  @Prop({ type: TeacherProfileSchema, required: false })
  teacherProfile?: TeacherProfile;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
