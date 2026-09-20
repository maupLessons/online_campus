import { Bell, CalendarClock, ClipboardList, Megaphone, Settings, type LucideIcon } from 'lucide-react';
import { NOTIFICATION_TYPES, type NotificationType } from '../../types';

export type NotificationTone = 'blue' | 'amber' | 'green' | 'slate' | 'red';
export type NotificationTypeMeta = { labelKey: string; icon: LucideIcon; tone: NotificationTone };

export const NOTIFICATION_TYPE_META: Record<NotificationType, NotificationTypeMeta> = {
  schedule_change: { labelKey: 'notifications.types.schedule_change', icon: CalendarClock, tone: 'amber' },
  elective: { labelKey: 'notifications.types.elective', icon: ClipboardList, tone: 'blue' },
  new_survey: { labelKey: 'notifications.types.new_survey', icon: Bell, tone: 'green' },
  announcement: { labelKey: 'notifications.types.announcement', icon: Megaphone, tone: 'blue' },
  system: { labelKey: 'notifications.types.system', icon: Settings, tone: 'slate' },
};

export function getNotificationTypeMeta(type: string): NotificationTypeMeta {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type)
    ? NOTIFICATION_TYPE_META[type as NotificationType]
    : NOTIFICATION_TYPE_META.system;
}
