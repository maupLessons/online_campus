import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId | null;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({
    required: true,
    enum: [
      'schedule_change',
      'new_assignment',
      'new_survey',
      'grade',
      'announcement',
      'system',
    ],
  })
  type: string;

  @Prop({
    required: true,
    enum: ['all', 'group'],
    default: 'all',
  })
  targetType: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Group',
    default: null,
  })
  groupId: Types.ObjectId | null;

  @Prop({ type: String, maxlength: 300 })
  actionUrl?: string;

  @Prop({
    type: String,
    enum: ['survey', 'course', 'assignment', 'grade', 'schedule', 'system'],
    default: null,
  })
  entityType?: string | null;

  @Prop({ type: String, maxlength: 80, default: null })
  entityId?: string | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  readBy: Types.ObjectId[];

  @Prop({ default: false })
  important: boolean;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  dismissedBy: Types.ObjectId[];
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ targetType: 1, groupId: 1, createdAt: -1 });
NotificationSchema.index({ readBy: 1 });
NotificationSchema.index({ dismissedBy: 1 });
