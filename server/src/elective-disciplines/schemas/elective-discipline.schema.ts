import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { Department } from '../../references/schemas';
import { User } from '../../users/schemas';
import type { AcademicTerm } from '../../academic-terms/schemas/academic-term.schema';
import { ElectiveDisciplineStatus } from './elective.enums';

export type ElectiveDisciplineDocument = ElectiveDiscipline & Document;

@Schema({ timestamps: true })
export class ElectiveDiscipline {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 24 })
  code: string;

  @Prop({ required: true, trim: true, maxlength: 160 })
  title: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Department',
    required: true,
  })
  department: Department | Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    default: null,
  })
  teacher?: User | Types.ObjectId | null;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'AcademicTerm',
    required: true,
    index: true,
  })
  term: Types.ObjectId | AcademicTerm;

  @Prop({ type: Number, required: true, min: 1, max: 30 })
  credits: number;

  @Prop({ type: Number, required: true, min: 1, max: 500 })
  capacity: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  enrolledCount: number;

  @Prop({
    type: String,
    enum: Object.values(ElectiveDisciplineStatus),
    default: ElectiveDisciplineStatus.DRAFT,
    required: true,
  })
  status: ElectiveDisciplineStatus;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy: User | Types.ObjectId;

  @Prop({ type: Date, default: null })
  cancelledAt?: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  cancelledBy?: User | Types.ObjectId | null;

  @Prop({ type: String, trim: true, minlength: 10, maxlength: 500 })
  cancelReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ElectiveDisciplineSchema =
  SchemaFactory.createForClass(ElectiveDiscipline);

ElectiveDisciplineSchema.plugin(paginate);
ElectiveDisciplineSchema.index({ code: 1, term: 1 }, { unique: true });
ElectiveDisciplineSchema.index({ status: 1, term: 1 });
ElectiveDisciplineSchema.index({ department: 1, term: 1 });
ElectiveDisciplineSchema.index({ teacher: 1 }, { sparse: true });
