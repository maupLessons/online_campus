import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { Group } from '../../references/schemas';
import { User } from '../../users/schemas';
import { CourseAssignment } from '../../courses/schemas';
import { ElectiveDiscipline } from './elective-discipline.schema';
import { ElectiveSelectionPeriod } from './elective-selection-period.schema';

export type ElectiveSelectionDocument = ElectiveSelection & Document;

@Schema({ timestamps: true })
export class ElectiveSelection {
  _id: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ElectiveSelectionPeriod',
    required: true,
  })
  period: ElectiveSelectionPeriod | Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ElectiveDiscipline',
    required: true,
  })
  discipline: ElectiveDiscipline | Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  student: User | Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Group',
    required: true,
  })
  group: Group | Types.ObjectId;

  @Prop({ type: Date, required: true, default: Date.now })
  selectedAt: Date;

  @Prop({ type: Number, min: 0, max: 4 })
  choiceSlot?: number;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'CourseAssignment',
    default: null,
  })
  courseAssignment?: CourseAssignment | Types.ObjectId | null;

  @Prop({ type: Date })
  finalizedAt?: Date;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    default: null,
  })
  finalizedBy?: User | Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

export const ElectiveSelectionSchema =
  SchemaFactory.createForClass(ElectiveSelection);

ElectiveSelectionSchema.plugin(paginate);
ElectiveSelectionSchema.index(
  { period: 1, student: 1, discipline: 1 },
  { unique: true },
);
ElectiveSelectionSchema.index(
  { period: 1, student: 1, choiceSlot: 1 },
  {
    unique: true,
    partialFilterExpression: { choiceSlot: { $type: 'number' } },
  },
);
ElectiveSelectionSchema.index({ period: 1, student: 1, selectedAt: -1 });
ElectiveSelectionSchema.index({ period: 1, group: 1 });
ElectiveSelectionSchema.index({ discipline: 1 });
ElectiveSelectionSchema.index({ courseAssignment: 1 }, { sparse: true });
