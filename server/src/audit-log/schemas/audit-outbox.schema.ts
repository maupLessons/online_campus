import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditOutboxDocument = HydratedDocument<AuditOutbox>;

export enum AuditOutboxStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  DEAD = 'dead',
}

@Schema({
  collection: 'audit_outbox',
  timestamps: true,
  versionKey: false,
})
export class AuditOutbox {
  @Prop({ required: true, unique: true, immutable: true })
  eventId: string;

  @Prop({ type: Object, required: true, immutable: true })
  payload: Record<string, unknown>;

  @Prop({
    required: true,
    enum: AuditOutboxStatus,
    default: AuditOutboxStatus.PENDING,
  })
  status: AuditOutboxStatus;

  @Prop({ required: true, default: 0, min: 0 })
  attempts: number;

  @Prop({ type: Date, required: true, default: () => new Date() })
  nextAttemptAt: Date;

  @Prop({ type: Date })
  lockedAt?: Date;

  @Prop({ type: Date })
  processedAt?: Date;

  @Prop({ type: String, maxlength: 100 })
  lastErrorCode?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AuditOutboxSchema = SchemaFactory.createForClass(AuditOutbox);

AuditOutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
AuditOutboxSchema.index({ status: 1, lockedAt: 1 });
AuditOutboxSchema.index(
  { processedAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60,
    partialFilterExpression: {
      status: AuditOutboxStatus.PROCESSED,
      processedAt: { $type: 'date' },
    },
  },
);
