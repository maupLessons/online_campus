import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { User } from '../../users/schemas';
import { CourseAssignment } from './course-assignment.schema';
import { LessonJournalEntry } from './lesson-journal-entry.schema';
import { Assignment } from './assignment.schema';
import { Submission } from './submission.schema';

export type GradeDocument = Grade & Document;

@Schema({ timestamps: true })
export class Grade {
  _id: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  student: User;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'CourseAssignment',
    required: true,
  })
  courseAssignment: CourseAssignment;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: LessonJournalEntry.name,
    default: null,
  })
  lessonJournalEntry?:
    LessonJournalEntry | MongooseSchema.Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Assignment.name })
  assignment?: Assignment | MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Submission.name })
  submission?: Submission | MongooseSchema.Types.ObjectId;

  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({
    required: true,
    enum: ['current', 'module', 'exam', 'final'],
  })
  type: string;

  @Prop({ required: true })
  value: number;

  @Prop()
  comment: string;

  @Prop({
    required: true,
    enum: ['active', 'withdrawn'],
    default: 'active',
  })
  status: string;

  @Prop({ type: Date, default: null })
  withdrawnAt?: Date | null;

  @Prop({ type: String, trim: true, maxlength: 1000, default: null })
  withdrawalReason?: string | null;
}

export const GradeSchema = SchemaFactory.createForClass(Grade);
GradeSchema.plugin(paginate);
GradeSchema.index({ student: 1, courseAssignment: 1, date: -1 });
GradeSchema.index({ courseAssignment: 1, type: 1, date: -1 });
GradeSchema.index({ lessonJournalEntry: 1, student: 1, type: 1 });
GradeSchema.index({ assignment: 1, student: 1 });
GradeSchema.index({ submission: 1 }, { unique: true, sparse: true });
GradeSchema.index({ courseAssignment: 1, status: 1, date: -1 });
