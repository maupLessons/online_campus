import { BadRequestException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationType } from './dto/create-notification.dto';

describe('NotificationsController admin type guard', () => {
  const service = {
    create: jest.fn(),
    broadcast: jest.fn(),
    update: jest.fn(),
    getUnreadCount: jest
      .fn()
      .mockResolvedValue({ count: 3, importantCount: 1 }),
  };
  const realtime = { stream: jest.fn() };
  const controller = new NotificationsController(
    service as never,
    realtime as never,
  );
  const req = { user: { sub: 'u1', login: 'admin', role: 'admin' } } as never;

  beforeEach(() => jest.clearAllMocks());

  it('rejects elective type from admin', async () => {
    await expect(
      controller.create({
        title: 'x',
        message: 'y',
        type: NotificationType.ELECTIVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('accepts announcement', async () => {
    await controller.create({
      title: 'x',
      message: 'y',
      type: NotificationType.ANNOUNCEMENT,
    });
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('rejects type escalation through PATCH /:id', async () => {
    await expect(
      controller.update(
        '6622b2a00f3a22d5b625d171',
        { type: NotificationType.SCHEDULE_CHANGE },
        req,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('passes через PATCH без поля type', async () => {
    await controller.update(
      '6622b2a00f3a22d5b625d171',
      { title: 'edited' },
      req,
    );
    expect(service.update).toHaveBeenCalledTimes(1);
  });

  it('returns importantCount alongside count', async () => {
    await expect(controller.getUnreadCount(req)).resolves.toEqual({
      count: 3,
      importantCount: 1,
    });
  });
});
