import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export enum NotificationType {
  SCHEDULE_CHANGE = 'schedule_change',
  NEW_ASSIGNMENT = 'new_assignment',
  NEW_SURVEY = 'new_survey',
  GRADE = 'grade',
  ANNOUNCEMENT = 'announcement',
  SYSTEM = 'system',
}

export const NotificationTargetTypes = [
  'all',
  'students',
  'teachers',
  'students_teachers',
  'group',
] as const;

export type NotificationTargetType = (typeof NotificationTargetTypes)[number];

export class CreateNotificationDto {
  @ApiProperty({ example: 'Важливе оголошення' })
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'Заняття перенесено на 14:00.' })
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiPropertyOptional({
    description: 'Target user id. Empty means broadcast.',
  })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiPropertyOptional({ enum: NotificationTargetTypes })
  @IsOptional()
  @IsIn(NotificationTargetTypes)
  targetType?: NotificationTargetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  groupId?: string;

  @ApiPropertyOptional({
    description: 'Internal application path opened from the notification.',
    example: '/surveys/6622b2a00f3a22d5b625d170',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\/(?!\/)[A-Za-z0-9/_?=&:.-]*$/)
  actionUrl?: string;

  @ApiPropertyOptional({
    enum: ['survey', 'course', 'assignment', 'grade', 'schedule', 'system'],
  })
  @IsOptional()
  @IsIn(['survey', 'course', 'assignment', 'grade', 'schedule', 'system'])
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  important?: boolean;
}
