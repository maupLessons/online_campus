import { ServiceUnavailableException } from '@nestjs/common';
import { Connection, ConnectionStates } from 'mongoose';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports liveness without depending on MongoDB', () => {
    const controller = new HealthController({} as Connection);
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('checks MongoDB before reporting readiness', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });
    const controller = new HealthController({
      readyState: ConnectionStates.connected,
      db: { command },
    } as unknown as Connection);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      checks: { mongodb: 'ok' },
    });
    expect(command).toHaveBeenCalledWith({ ping: 1 }, { timeoutMS: 2_000 });
  });

  it('fails readiness while MongoDB is disconnected', async () => {
    const controller = new HealthController({
      readyState: ConnectionStates.disconnected,
    } as Connection);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
