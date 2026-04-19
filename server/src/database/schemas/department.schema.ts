import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
import { User } from './user.schema';
import { Faculty } from './faculty.schema';

@Schema()
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
