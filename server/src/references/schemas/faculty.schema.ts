import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
import { User } from '../../users/schemas';

@Schema({ timestamps: true })
export class Faculty extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  dean?: User;
}

export const FacultySchema = SchemaFactory.createForClass(Faculty);

FacultySchema.index({ name: 1 }, { unique: true });
FacultySchema.index({ dean: 1 }, { sparse: true });
