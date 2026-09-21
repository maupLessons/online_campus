import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MaupStudentApiError } from '../integrations/maup-student-api/maup-student-api.error';
import { ExternalDataCacheService } from './external-data-cache.service';

const SECRET_MARKERS = ['1001', '85', 'Вища математика', '-1500.5'];

// `durationMs` — єдине число, яке сервіс має право писати; воно може випадково
// збігтися з маркером (85 мс, 1001 мс), тому вирізаємо його перед перевіркою.
const withoutDuration = (message: string) =>
  message.replace(/durationMs=\d+/g, 'durationMs=…');

describe('external data privacy', () => {
  it('never logs payload values or external ids', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const model = {
      findOne: () => ({ lean: () => ({ exec: () => null }) }),
      findOneAndUpdate: () => ({ exec: () => ({}) }),
    };
    const service = new ExternalDataCacheService(
      model as never,
      new ConfigService({ MAUP_API_ENABLED: 'true' }),
    );
    const key = {
      userId: '64b000000000000000000001',
      studentProfileId: '64b000000000000000000002',
      kind: 'gradebook' as const,
    };

    await service.resolve(key, () =>
      Promise.resolve({
        subject: 'Вища математика',
        score: 85,
        externalStudentId: '1001',
        balance: -1500.5,
      }),
    );
    await expect(
      service.resolve(
        key,
        () =>
          Promise.reject(
            new MaupStudentApiError({ kind: 'upstream', endpoint: 'marks' }),
          ),
        { force: true },
      ),
    ).rejects.toBeDefined();

    const messages = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((call) =>
      withoutDuration(String(call[0])),
    );
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      for (const marker of SECRET_MARKERS) {
        expect(message).not.toContain(marker);
      }
    }
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
