import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true, versionKey: false })
export class AuditLog {
  @Prop({ type: String, unique: true, sparse: true, immutable: true })
  eventId?: string;

  @Prop({ default: () => new Date(), immutable: true })
  timestamp: Date;

  @Prop({ type: String, default: null, maxlength: 100, immutable: true })
  userId: string | null;

  @Prop({ required: true, maxlength: 100, immutable: true })
  userLogin: string;

  @Prop({ type: String, maxlength: 50, immutable: true })
  userRole?: string;

  @Prop({ required: true, maxlength: 120, immutable: true })
  action: string;

  @Prop({ type: String, maxlength: 80, immutable: true })
  targetEntity?: string;

  @Prop({ type: String, maxlength: 100, immutable: true })
  targetId?: string;

  @Prop({ type: Object, immutable: true })
  details?: Record<string, unknown>;

  @Prop({ required: true, maxlength: 64, immutable: true })
  ipAddress: string;

  @Prop({ required: true, maxlength: 500, immutable: true })
  userAgent: string;

  @Prop({ required: true, enum: ['success', 'failure'], immutable: true })
  result: 'success' | 'failure';

  @Prop({ type: String, maxlength: 100, immutable: true })
  requestId?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ userLogin: 1, timestamp: -1 });
AuditLogSchema.index({ result: 1, timestamp: -1 });
AuditLogSchema.index({ userRole: 1, timestamp: -1 });
AuditLogSchema.index({ targetEntity: 1, timestamp: -1 });
AuditLogSchema.index({ targetEntity: 1, targetId: 1, timestamp: -1 });
AuditLogSchema.index({ requestId: 1 }, { sparse: true });

const rejectAuditMutation = () => {
  throw new Error('Audit log entries are append-only');
};

AuditLogSchema.pre('updateOne', rejectAuditMutation);
AuditLogSchema.pre('updateMany', rejectAuditMutation);
AuditLogSchema.pre('findOneAndUpdate', rejectAuditMutation);
AuditLogSchema.pre('replaceOne', rejectAuditMutation);
AuditLogSchema.pre('deleteOne', rejectAuditMutation);
AuditLogSchema.pre('deleteMany', rejectAuditMutation);
AuditLogSchema.pre('findOneAndDelete', rejectAuditMutation);
