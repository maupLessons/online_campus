import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import * as paginate from 'mongoose-paginate-v2';
import { Department } from '../../references/schemas';
import { User } from '../../users/schemas';
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

  @Prop({ type: Number, required: true, min: 1, max: 12 })
  semester: number;

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

  createdAt: Date;
  updatedAt: Date;
}

export const ElectiveDisciplineSchema =
  SchemaFactory.createForClass(ElectiveDiscipline);

ElectiveDisciplineSchema.plugin(paginate);
ElectiveDisciplineSchema.index({ code: 1 }, { unique: true });
ElectiveDisciplineSchema.index({ status: 1, semester: 1 });
ElectiveDisciplineSchema.index({ department: 1, semester: 1 });
ElectiveDisciplineSchema.index({ teacher: 1 }, { sparse: true });
