import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas';
import { SurveyStatus, SurveyTargetType } from './survey.enums';

export type SurveyDocument = Survey & Document;

@Schema({ timestamps: true })
export class Survey {
  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({
    type: String,
    enum: Object.values(SurveyStatus),
    default: SurveyStatus.DRAFT,
    index: true,
  })
  status: SurveyStatus;

  @Prop({ type: Boolean, default: false })
  anonymous: boolean;

  @Prop({
    type: String,
    enum: Object.values(SurveyTargetType),
    default: SurveyTargetType.ALL,
    index: true,
  })
  targetType: SurveyTargetType;

  @Prop({ type: [String], default: [] })
  targetIds: string[];

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true, index: true })
  endDate: Date;

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ type: Date })
  closedAt?: Date;

  @Prop({ type: Number, min: 0 })
  expectedRecipients?: number;

  @Prop({ type: Number, min: 1, max: 120 })
  estimatedMinutes?: number;

  @Prop({ type: Date, default: null })
  activatedAt?: Date | null; // moment of the actual transition to active (can be later than startDate — §7.1)

  @Prop({ type: String, enum: ['manual', 'deadline'], default: null })
  closedReason?: 'manual' | 'deadline' | null;

  @Prop({ type: Date, default: null })
  reminderSentAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const SurveySchema = SchemaFactory.createForClass(Survey);

SurveySchema.index({ status: 1, startDate: 1, endDate: 1 });
SurveySchema.index({ status: 1, startDate: 1 });
SurveySchema.index({ targetType: 1, targetIds: 1 });
