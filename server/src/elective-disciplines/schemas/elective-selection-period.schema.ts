import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { Group } from '../../references/schemas';
import { User } from '../../users/schemas';
import { ElectiveSelectionPeriodStatus } from './elective.enums';

export type ElectiveSelectionPeriodDocument = ElectiveSelectionPeriod &
  Document;

@Schema({ timestamps: true })
export class ElectiveSelectionPeriod {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 160 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 20 })
  academicYear: string;

  @Prop({ type: Number, required: true, min: 1, max: 12 })
  semester: number;

  @Prop({ type: Date, required: true })
  startsAt: Date;

  @Prop({ type: Date, required: true })
  endsAt: Date;

  @Prop({
    type: String,
    enum: Object.values(ElectiveSelectionPeriodStatus),
    default: ElectiveSelectionPeriodStatus.DRAFT,
    required: true,
  })
  status: ElectiveSelectionPeriodStatus;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Group' }],
    required: true,
    default: [],
  })
  targetGroups: Array<Group | Types.ObjectId>;

  @Prop({ type: Number, required: true, min: 1, max: 5, default: 1 })
  requiredChoices: number;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy: User | Types.ObjectId;

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ type: Date })
  closedAt?: Date;

  @Prop({ type: Date })
  finalizedAt?: Date;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    default: null,
  })
  finalizedBy?: User | Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  finalizationStartedAt?: Date | null;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    default: null,
  })
  finalizationStartedBy?: User | Types.ObjectId | null;

  @Prop({ type: String, default: null, select: false })
  finalizationToken?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export const ElectiveSelectionPeriodSchema = SchemaFactory.createForClass(
  ElectiveSelectionPeriod,
);

ElectiveSelectionPeriodSchema.plugin(paginate);
ElectiveSelectionPeriodSchema.index({ status: 1, startsAt: 1, endsAt: 1 });
ElectiveSelectionPeriodSchema.index({ academicYear: 1, semester: 1 });
ElectiveSelectionPeriodSchema.index({ targetGroups: 1 });
ElectiveSelectionPeriodSchema.index({ status: 1, finalizationStartedAt: 1 });
