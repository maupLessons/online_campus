import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
import { User } from '../../users/schemas';
import { Faculty } from './faculty.schema';

@Schema({ timestamps: true })
export class Department extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true,
  })
  faculty: Faculty;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  head?: User;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);

DepartmentSchema.index({ faculty: 1 });
DepartmentSchema.index({ head: 1 }, { sparse: true });
DepartmentSchema.index({ faculty: 1, name: 1 }, { unique: true });
