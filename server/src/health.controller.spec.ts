import { ServiceUnavailableException } from '@nestjs/common';
import { Connection, ConnectionStates } from 'mongoose';
import { HealthController } from './health.controller';
import { AcademicTermsService } from './academic-terms/academic-terms.service';

function academicTermsStub(
  current: unknown,
): jest.Mocked<Pick<AcademicTermsService, 'getCurrent'>> {
  return { getCurrent: jest.fn().mockResolvedValue(current) };
}

describe('HealthController', () => {
  it('reports liveness without depending on MongoDB', () => {
    const controller = new HealthController(
      {} as Connection,
      academicTermsStub(null) as unknown as AcademicTermsService,
    );
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('checks MongoDB before reporting readiness', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });
    const controller = new HealthController(
      {
        readyState: ConnectionStates.connected,
        db: { command },
      } as unknown as Connection,
      academicTermsStub({
        id: 'term-1',
      }) as unknown as AcademicTermsService,
    );

    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      checks: { mongodb: 'ok', academicTerm: 'ok' },
    });
    expect(command).toHaveBeenCalledWith({ ping: 1 }, { timeoutMS: 2_000 });
  });

  it('reports degraded readiness when there is no current academic term', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });
    const controller = new HealthController(
      {
        readyState: ConnectionStates.connected,
        db: { command },
      } as unknown as Connection,
      academicTermsStub(null) as unknown as AcademicTermsService,
    );

    await expect(controller.ready()).resolves.toEqual({
      status: 'degraded',
      checks: { mongodb: 'ok', academicTerm: 'missing' },
    });
  });

  it('fails readiness while MongoDB is disconnected', async () => {
    const controller = new HealthController(
      { readyState: ConnectionStates.disconnected } as Connection,
      academicTermsStub(null) as unknown as AcademicTermsService,
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails readiness with 503 when the academic-term lookup rejects after a successful ping', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });
    const academicTerms: jest.Mocked<Pick<AcademicTermsService, 'getCurrent'>> =
      { getCurrent: jest.fn().mockRejectedValue(new Error('connection lost')) };
    const controller = new HealthController(
      {
        readyState: ConnectionStates.connected,
        db: { command },
      } as unknown as Connection,
      academicTerms as unknown as AcademicTermsService,
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
