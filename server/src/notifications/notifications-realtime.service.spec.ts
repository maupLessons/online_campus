import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { NotificationsRealtimeService } from './notifications-realtime.service';

describe('NotificationsRealtimeService', () => {
  it('delivers personal signals only to the matching user', async () => {
    const service = new NotificationsRealtimeService();
    const matching = firstValueFrom(
      service.stream('user-1').pipe(
        filter((event) => event.type === 'notifications.changed'),
        take(1),
      ),
    );

    service.publish({ userId: 'user-2', reason: 'read' });
    service.publish({ userId: 'user-1', reason: 'created' });

    await expect(matching).resolves.toEqual({
      type: 'notifications.changed',
      data: { reason: 'created' },
    });
  });

  it('broadcasts audience changes without exposing notification content', async () => {
    const service = new NotificationsRealtimeService();
    const changed = firstValueFrom(
      service.stream('user-1').pipe(
        filter((event) => event.type === 'notifications.changed'),
        take(1),
      ),
    );

    service.publish({ reason: 'updated' });

    await expect(changed).resolves.toEqual({
      type: 'notifications.changed',
      data: { reason: 'updated' },
    });
  });
});
