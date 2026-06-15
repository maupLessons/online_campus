import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { Role } from '../../common/types/roles.enum';
import { StudentProfile, StudentProfileSchema } from './student-profile.schema';
import { TeacherProfile, TeacherProfileSchema } from './teacher-profile.schema';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ type: [String], default: [], select: false })
  refreshTokenHashes!: string[];

  @Prop({ required: true, unique: true })
  login: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: String, select: false })
  passwordResetTokenHash?: string;

  @Prop({ type: Date, select: false })
  passwordResetTokenExpiresAt?: Date;

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

UserSchema.plugin(paginate);
UserSchema.index({ passwordResetTokenHash: 1 }, { unique: true, sparse: true });
UserSchema.index({ passwordResetTokenExpiresAt: 1 }, { sparse: true });
UserSchema.index({ role: 1, status: 1, 'studentProfile.group': 1 });
