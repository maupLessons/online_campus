import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'onlineLessonLinks' })
export class OnlineLessonLink {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'AcademicTerm',
    required: true,
  })
  term: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 64 })
  groupCode: string;

  @Prop({ required: true, trim: true, maxlength: 300 }) subjectKey: string;
  @Prop({ type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ })
  date: string | null;
  @Prop({ type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  startTime: string | null;
  @Prop({ required: true, trim: true, maxlength: 2048 }) url: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
export type OnlineLessonLinkDocument = HydratedDocument<OnlineLessonLink>;
export const OnlineLessonLinkSchema =
  SchemaFactory.createForClass(OnlineLessonLink);
OnlineLessonLinkSchema.index(
  { term: 1, groupCode: 1, subjectKey: 1, date: 1, startTime: 1 },
  { unique: true },
);
OnlineLessonLinkSchema.index({ term: 1, groupCode: 1 });
