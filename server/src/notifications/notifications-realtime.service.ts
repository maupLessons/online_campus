import { Injectable, MessageEvent } from '@nestjs/common';
import { interval, merge, Observable, of, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

type RealtimeSignal = {
  userId?: string;
  reason: 'created' | 'updated' | 'read' | 'dismissed' | 'deleted';
};

@Injectable()
export class NotificationsRealtimeService {
  private readonly changes = new Subject<RealtimeSignal>();

  stream(userId: string): Observable<MessageEvent> {
    const connected = of<MessageEvent>({
      type: 'notifications.connected',
      data: { connected: true },
      retry: 5_000,
    });
    const changes = this.changes.pipe(
      filter((signal) => !signal.userId || signal.userId === userId),
      map(
        (signal): MessageEvent => ({
          type: 'notifications.changed',
          data: { reason: signal.reason },
        }),
      ),
    );
    const heartbeat = interval(25_000).pipe(
      map(
        (): MessageEvent => ({
          type: 'notifications.heartbeat',
          data: { timestamp: new Date().toISOString() },
        }),
      ),
    );

    return merge(connected, changes, heartbeat);
  }

  publish(signal: RealtimeSignal): void {
    this.changes.next(signal);
  }
}
