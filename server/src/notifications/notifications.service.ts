import { Injectable } from '@nestjs/common';
import { notifications } from '../common/mock-data';
import { Notification } from '../common/types/entities';

@Injectable()
export class NotificationsService {
  private items = [...notifications];

  findByUser(userId: string) {
    return this.items
      .filter((n) => n.userId === userId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  getUnreadCount(userId: string) {
    return this.items.filter((n) => n.userId === userId && !n.readFlag).length;
  }

  markAsRead(id: string, userId: string) {
    const ntf = this.items.find((n) => n.id === id && n.userId === userId);
    if (ntf) {
      ntf.readFlag = true;
    }
    return ntf;
  }

  markAllAsRead(userId: string) {
    this.items
      .filter((n) => n.userId === userId && !n.readFlag)
      .forEach((n) => (n.readFlag = true));
    return { success: true };
  }
}
