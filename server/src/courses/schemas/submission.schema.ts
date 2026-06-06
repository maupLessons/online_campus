import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { Assignment } from './assignment.schema';
import { User } from '../../users/schemas';
import { File } from '../../files/file.schema';

export type SubmissionDocument = Submission & Document;

@Schema({ timestamps: true })
export class Submission {
  _id: MongooseSchema.Types.ObjectId;

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

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'File' }],
    default: [],
  })
  files: File[];

  @Prop()
  score?: number;

  @Prop()
  comment?: string;

  @Prop({
    required: true,
    enum: ['submitted', 'graded', 'returned'],
    default: 'submitted',
  })
  status: string;

  @Prop({ required: true, min: 1, default: 1 })
  attemptNumber: number;

  @Prop({ type: String, trim: true, maxlength: 1000, default: null })
  returnComment?: string | null;

  @Prop({ type: Date, default: null })
  returnedAt?: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  returnedBy?: User | Types.ObjectId | null;
}

export const SubmissionSchema = SchemaFactory.createForClass(Submission);

SubmissionSchema.plugin(paginate);
SubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });
SubmissionSchema.index({ student: 1, submittedAt: -1 });
SubmissionSchema.index({ assignment: 1, status: 1, submittedAt: -1 });
