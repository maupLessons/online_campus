import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Assignment } from './assignment.schema';
import { User } from '../../users/schemas';

export type SubmissionDocument = Submission & Document;

@Schema({ timestamps: true })
export class Submission {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Assignment',
    required: true,
  })
  assignment: Assignment;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  student: User;

  @Prop({ required: true, default: Date.now })
  submittedAt: Date;

  @Prop()
  fileLink: string;

  @Prop()
  score: number;

  @Prop()
  comment: string;

  @Prop({
    required: true,
    enum: ['submitted', 'graded', 'returned'],
    default: 'submitted',
  })
  status: string;
}

export const SubmissionSchema = SchemaFactory.createForClass(Submission);
