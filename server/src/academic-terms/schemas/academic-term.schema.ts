import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AcademicTermStatus = 'planned' | 'current' | 'closed';
export const ACADEMIC_TERM_STATUSES: AcademicTermStatus[] = [
  'planned',
  'current',
  'closed',
];
export const ACADEMIC_YEAR_PATTERN = /^\d{4}\/\d{4}$/;

export type AcademicTermDocument = AcademicTerm & Document;

@Schema({ timestamps: true })
export class AcademicTerm {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, match: ACADEMIC_YEAR_PATTERN })
  academicYear: string;

  @Prop({ type: Number, required: true, enum: [1, 2] })
  termNumber: 1 | 2;

  @Prop({ type: Date, required: true })
  startsAt: Date;

  @Prop({ type: Date, required: true })
  endsAt: Date;

  @Prop({
    type: String,
    enum: ACADEMIC_TERM_STATUSES,
    default: 'planned',
    required: true,
  })
  status: AcademicTermStatus;

  @Prop({ type: Number, required: true })
  maupAcademicYear: number;

  @Prop({ type: Number, required: true, enum: [1, 2] })
  maupSemester: number;

  @Prop({ type: Date, default: null })
  activatedAt?: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  activatedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  closedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const AcademicTermSchema = SchemaFactory.createForClass(AcademicTerm);

AcademicTermSchema.index({ academicYear: 1, termNumber: 1 }, { unique: true });
AcademicTermSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'current' } },
);
