import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Classroom extends Document {
  @Prop({ required: true })
  building: string;

  @Prop({ required: true })
  roomNumber: string;

  @Prop({ type: Number, required: true })
  capacity: number;

  @Prop({
    type: String,
    enum: ['lecture', 'lab', 'seminar', 'online'],
    required: true,
  })
  type: string;
}

export const ClassroomSchema = SchemaFactory.createForClass(Classroom);
