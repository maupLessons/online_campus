import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  NotificationTargetTypes,
  NotificationType,
  type NotificationTargetType,
} from './create-notification.dto';

export const NotificationReadStates = ['read', 'unread'] as const;
export type NotificationReadState = (typeof NotificationReadStates)[number];

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function parseOptionalBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class NotificationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimString(value))
  search?: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsIn(NotificationReadStates)
  readState?: NotificationReadState;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  important?: boolean;

  @IsOptional()
  @IsIn(NotificationTargetTypes)
  targetType?: NotificationTargetType;
}
