import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FileDocument = File & Document;

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
}

export const FileSchema = SchemaFactory.createForClass(File);

FileSchema.index({ storagePath: 1 }, { unique: true });
FileSchema.index({ uploadedBy: 1, createdAt: -1 });
