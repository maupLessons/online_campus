import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export const EXTERNAL_DATA_KINDS = ['gradebook', 'finance'] as const;
export type ExternalDataKind = (typeof EXTERNAL_DATA_KINDS)[number];

export type ExternalDataCacheDocument = ExternalDataCache & Document;

@Schema({ timestamps: false, versionKey: false })
export class ExternalDataCache {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  studentProfileId: Types.ObjectId;

  @Prop({ type: String, enum: EXTERNAL_DATA_KINDS, required: true })
  kind: ExternalDataKind;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload: unknown;

  @Prop({ type: Date, required: true })
  fetchedAt: Date;

  /** До цього моменту запис свіжий і віддається без звернення до API. */
  @Prop({ type: Date, required: true })
  freshUntil: Date;

  /** TTL-індекс: після цього моменту Mongo видаляє документ. */
  @Prop({ type: Date, required: true })
  purgeAt: Date;
}

export const ExternalDataCacheSchema =
  SchemaFactory.createForClass(ExternalDataCache);

ExternalDataCacheSchema.index(
  { userId: 1, studentProfileId: 1, kind: 1 },
  { unique: true },
);
ExternalDataCacheSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
