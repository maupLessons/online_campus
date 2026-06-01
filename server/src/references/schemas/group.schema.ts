import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
import { User } from '../../users/schemas';
import { Specialty } from './specialty.schema';

@Schema({ timestamps: true })
export class Group extends Document {
  @Prop({ required: true })
  code: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Specialty',
    required: true,
  })
  specialty: Specialty;

  @Prop({ type: Number, required: true })
  course: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  curator?: User;
}

export const GroupSchema = SchemaFactory.createForClass(Group);

GroupSchema.index({ code: 1 }, { unique: true });
GroupSchema.index({ specialty: 1, course: 1 });
GroupSchema.index({ curator: 1 }, { sparse: true });
