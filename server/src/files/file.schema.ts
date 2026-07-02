import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FileDocument = File & Document;

export enum FileScanStatus {
  PENDING_SCAN = 'pending_scan',
  CLEAN = 'clean',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class File {
  @Prop({ required: true })
  originalName!: string;

  @Prop({ required: true })
  storagePath!: string;

  @Prop({ required: true })
  mimetype!: string;

  @Prop({ required: true })
  size!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy!: Types.ObjectId;

  @Prop({
    enum: Object.values(FileScanStatus),
    default: FileScanStatus.CLEAN,
    required: true,
  })
  scanStatus!: FileScanStatus;

  @Prop({ trim: true, maxlength: 120 })
  scanProvider?: string;

  @Prop()
  scannedAt?: Date;

  @Prop({ trim: true, maxlength: 240 })
  scanFailureReason?: string;
}

export const FileSchema = SchemaFactory.createForClass(File);

FileSchema.index({ storagePath: 1 }, { unique: true });
FileSchema.index({ uploadedBy: 1, createdAt: -1 });
FileSchema.index({ scanStatus: 1, createdAt: -1 });
