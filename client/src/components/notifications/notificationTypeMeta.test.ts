import { describe, expect, it } from 'vitest';
import { getNotificationTypeMeta, NOTIFICATION_TYPE_META } from './notificationTypeMeta';
import { NOTIFICATION_TYPES } from '../../types';

describe('notificationTypeMeta', () => {
  it('covers every notification type', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPE_META[type].labelKey).toBe(`notifications.types.${type}`);
    }
  });
  it('falls back to system for unknown', () => {
    expect(getNotificationTypeMeta('legacy_grade').labelKey).toBe('notifications.types.system');
  });
});
