import { StartedTestContainer } from 'testcontainers';
import * as request from 'supertest';
import { Types } from 'mongoose';
import { Role } from '../src/common/types/roles.enum';
import {
  MAUP_PAYMENTS_FIXTURE,
  MAUP_SALDO_FIXTURE,
  MAUP_STUDENTINFO_FIXTURE,
} from '../src/finance/fixtures/maup-finance.contract-fixture';
import {
  bootstrapMaupE2e,
  findAuditRows,
  jsonResponse,
  MAUP_E2E_SETUP_TIMEOUT,
  MaupE2eHarness,
  startMongoContainer,
} from './support/maup-e2e';

type PaymentBody = { date: string; amount: number; purpose?: string };
type FinanceBody = {
  tuition: {
    balance: number;
    currency: string;
    currentCost?: number;
    currentPeriod?: string;
    payments: PaymentBody[];
  };
  dormitory: { payments: PaymentBody[] };
  meta: {
    profileId: string | null;
    fetchedAt: string | null;
    stale: boolean;
    reason?: string;
  };
};
type ErrorBody = { code?: string };

function asFinance(response: request.Response): FinanceBody {
  return response.body as FinanceBody;
}

function asError(response: request.Response): ErrorBody {
  return response.body as ErrorBody;
}

describe('Finance (e2e)', () => {
  let container: StartedTestContainer;

  beforeAll(async () => {
    container = await startMongoContainer();
  }, MAUP_E2E_SETUP_TIMEOUT);

  afterAll(async () => {
    await container?.stop();
  });

  describe('MAUP enabled', () => {
    let harness: MaupE2eHarness;

    const collection = (name: string) => harness.collection(name);
    const server = () => harness.app.getHttpServer();

    beforeAll(async () => {
      harness = await bootstrapMaupE2e({ container, database: 'finance-e2e' });
    }, MAUP_E2E_SETUP_TIMEOUT);

    // За замовчуванням кожен тест бачить активний AcademicTerm — так головний
    // сценарій перевіряє і відсутність meta.reason. Фінанси від нього не
    // залежать змістовно (немає isCurrent), але спека 01 §7.3 перелічує
    // /finance/my серед endpoint-ів із meta.reason: 'no_current_term', тому
    // й тут потрібен той самий baseline, що й у gradebook.e2e-spec.ts.
    const seedCurrentTerm = () =>
      collection('AcademicTerm').insertOne({
        _id: new Types.ObjectId(),
        academicYear: '2025/2026',
        termNumber: 2,
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-06-30T00:00:00.000Z'),
        status: 'current',
        maupAcademicYear: 2025,
        maupSemester: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    beforeEach(async () => {
      await harness.resetData();
      await seedCurrentTerm();
    });

    afterAll(async () => {
      await harness?.close();
    });

    // Реальні імена полів довідника `payperiod` (MAUP_REFERENCE_FIELDS у
    // MaupReferenceCacheService): `pay_period_id`/`pay_period`, не спільні
    // `id`/`name`. У фікстурах studentinfo текст періоду вже присутній
    // (`price_pay_period`), тому цей довідник — лише фолбек.
    const referenceResponse = (endpoint: string) => {
      if (endpoint.endsWith('/payperiod')) {
        return jsonResponse([{ pay_period_id: 2, pay_period: 'семестр' }]);
      }
      return null;
    };

    const mockMaup = () => {
      harness.fetchMock.mockImplementation((url: URL | string) => {
        const href = String(url);
        const reference = referenceResponse(href);
        if (reference) return Promise.resolve(reference);
        if (href.endsWith('/saldo')) {
          return Promise.resolve(jsonResponse(MAUP_SALDO_FIXTURE));
        }
        if (href.endsWith('/payments')) {
          return Promise.resolve(jsonResponse(MAUP_PAYMENTS_FIXTURE));
        }
        if (href.endsWith('/studentinfo')) {
          return Promise.resolve(jsonResponse(MAUP_STUDENTINFO_FIXTURE));
        }
        return Promise.resolve(jsonResponse([], 404));
      });
    };

    // Три джерела даних фінансів (saldo/payments/studentinfo) — промах кешу
    // тут утричі дорожчий, ніж у gradebook. Довідник payperiod рахується
    // окремо: він кешується в процесі на 24 год (MaupReferenceCacheService),
    // незалежно від ExternalDataCache.
    const dataEndpointCalls = (): unknown[][] =>
      (harness.fetchMock.mock.calls as unknown[][]).filter(([url]) =>
        ['/saldo', '/payments', '/studentinfo'].some((suffix) =>
          String(url).endsWith(suffix),
        ),
      );

    it('returns tuition and dormitory blocks with balance, current cost and period', async () => {
      const student = await harness.createStudent();
      mockMaup();

      const response = await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      const body = asFinance(response);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(body.meta.profileId).toBe(student.profileId.toHexString());
      expect(body.meta.stale).toBe(false);
      expect(body.meta.reason).toBeUndefined();
      expect(body.tuition).toMatchObject({
        balance: -1500.5,
        currency: 'UAH',
        currentCost: 12000,
        currentPeriod: 'семестр',
      });
      // Найновіші перші; побиті рядки (недійсна дата/сума) відкинуто.
      expect(body.tuition.payments).toEqual([
        { date: '2026-09-01', amount: 6000, purpose: 'Оплата за навчання' },
        { date: '2026-02-01', amount: 6000 },
      ]);
      // С3: "ОПЛАТА ЗА ГУРТОЖИТОК" (інший регістр) усе одно класифікується
      // як гуртожиток; сума '1500,00' нормалізована в число.
      expect(body.dormitory.payments).toEqual([
        { date: '2026-08-15', amount: 1500, purpose: 'ОПЛАТА ЗА ГУРТОЖИТОК' },
      ]);
    });

    it('uses a separate cache key from the gradebook', async () => {
      const student = await harness.createStudent();
      mockMaup();

      await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      const rows = (await collection('ExternalDataCache')
        .find({})
        .toArray()) as unknown as { kind: string }[];
      expect(rows.map((r) => r.kind)).toEqual(['finance']);
    });

    it('calls MAUP saldo/payments/studentinfo once for two consecutive requests', async () => {
      const student = await harness.createStudent();
      mockMaup();

      await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);
      await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      expect(dataEndpointCalls()).toHaveLength(3);
    });

    it('serves stale data when MAUP fails after the cache expired', async () => {
      const student = await harness.createStudent();
      mockMaup();
      await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      await collection('ExternalDataCache').updateMany(
        {},
        { $set: { freshUntil: new Date(Date.now() - 1000) } },
      );
      harness.fetchMock.mockImplementation(() =>
        Promise.resolve(jsonResponse({ error: 'E-99' }, 503)),
      );

      const response = await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      const body = asFinance(response);
      expect(body.meta.stale).toBe(true);
      expect(body.tuition.balance).toBe(-1500.5);
      expect(body.tuition.payments).toHaveLength(2);
    });

    it.each([Role.ADMIN, Role.DEAN, Role.TEACHER])(
      'rejects %s with 403',
      async (role) => {
        const actor = await harness.createActor(role, 'other');
        mockMaup();

        await request(server())
          .get('/api/finance/my')
          .set('Authorization', `Bearer ${actor.token}`)
          .expect(403);
      },
    );

    // FIN-004: немає жодного параметра userId/studentId у query чи body —
    // /finance/my і /finance/my/refresh резолюють профіль виключно з
    // Authorization-токена викликача (StudentContextService), тому жодна
    // роль і жоден студент не можуть отримати чужі фінанси.
    // PII (рев'ю фінального батчу): раніше тест лише порівнював
    // meta.profileId — обидва студенти отримували ту саму фікстуру
    // (mockMaup()), тому перевірка нічого не стерегла. Тепер мок віддає
    // рядки ДВОХ студентів одночасно (saldo/payments/studentinfo), і тест
    // підтверджує, що кожен запит повертає дані САМЕ запитаного студента.
    it('never returns another student profile finance', async () => {
      const mockTwoStudents = () => {
        harness.fetchMock.mockImplementation((url: URL | string) => {
          const href = String(url);
          const reference = referenceResponse(href);
          if (reference) return Promise.resolve(reference);
          if (href.endsWith('/saldo')) {
            return Promise.resolve(
              jsonResponse([
                { student_id: 'ext-a', saldo: -100 },
                { student_id: 'ext-b', saldo: -200 },
              ]),
            );
          }
          if (href.endsWith('/payments')) {
            return Promise.resolve(
              jsonResponse([
                {
                  student_id: 'ext-a',
                  payments: [
                    {
                      date: '2026-01-05',
                      operation_name: 'Оплата студента A',
                      payment_value: 1000,
                    },
                  ],
                },
                {
                  student_id: 'ext-b',
                  payments: [
                    {
                      date: '2026-01-06',
                      operation_name: 'Оплата студента B',
                      payment_value: 2000,
                    },
                  ],
                },
              ]),
            );
          }
          if (href.endsWith('/studentinfo')) {
            return Promise.resolve(
              jsonResponse([
                {
                  student_id: 'ext-a',
                  price: 11000,
                  price_pay_period: 'семестр',
                },
                { student_id: 'ext-b', price: 22000, price_pay_period: 'рік' },
              ]),
            );
          }
          return Promise.resolve(jsonResponse([], 404));
        });
      };

      // `createStudent` завжди сіє один і той самий login ('student_student'),
      // тому двох студентів в одному тесті можна мати лише послідовно, з
      // повним resetData() між ними (він же чистить fetchMock і reference-кеш).
      // Мок при цьому містить рядки ОБОХ студентів одночасно — так
      // перевіряється саме фільтрація за student_id у мапері.
      const studentA = await harness.createStudent('ext-a');
      mockTwoStudents();
      const responseA = await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${studentA.token}`)
        .expect(200);

      await harness.resetData();
      const studentB = await harness.createStudent('ext-b');
      mockTwoStudents();
      const responseB = await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${studentB.token}`)
        .expect(200);

      const bodyA = asFinance(responseA);
      const bodyB = asFinance(responseB);

      expect(bodyA.meta.profileId).toBe(studentA.profileId.toHexString());
      expect(bodyB.meta.profileId).toBe(studentB.profileId.toHexString());
      expect(bodyA.meta.profileId).not.toBe(bodyB.meta.profileId);

      expect(bodyA.tuition.balance).toBe(-100);
      expect(bodyA.tuition.currentCost).toBe(11000);
      expect(bodyA.tuition.payments).toEqual([
        { date: '2026-01-05', amount: 1000, purpose: 'Оплата студента A' },
      ]);

      expect(bodyB.tuition.balance).toBe(-200);
      expect(bodyB.tuition.currentCost).toBe(22000);
      expect(bodyB.tuition.payments).toEqual([
        { date: '2026-01-06', amount: 2000, purpose: 'Оплата студента B' },
      ]);
    });

    it('audit record has no amounts, balances or purposes', async () => {
      // MINOR 2 (рев'ю батчу 3): дефолтний externalStudentId createStudent()
      // — '1001', тому підрядка 'ext-' у даних узагалі не було б — перевірка
      // на витік зовнішнього id була фіктивною. Студент тут навмисно має
      // 'ext-audit', і мок нижче віддає дані САМЕ під цим student_id (мапер
      // тепер фільтрує рядки за ним — рев'ю фінального батчу, PII), інакше
      // 'ext-audit' не збігся б зі спільною фікстурою (student_id '1001') і
      // асерт нічого не стеріг би через порожні дані.
      const student = await harness.createStudent('ext-audit');
      harness.fetchMock.mockImplementation((url: URL | string) => {
        const href = String(url);
        const reference = referenceResponse(href);
        if (reference) return Promise.resolve(reference);
        if (href.endsWith('/saldo')) {
          return Promise.resolve(
            jsonResponse([{ student_id: 'ext-audit', saldo: -1500 }]),
          );
        }
        if (href.endsWith('/payments')) {
          return Promise.resolve(
            jsonResponse([
              {
                student_id: 'ext-audit',
                payments: [
                  {
                    date: '2026-09-01',
                    operation_name: 'Оплата за навчання',
                    payment_value: 6000,
                  },
                ],
              },
            ]),
          );
        }
        if (href.endsWith('/studentinfo')) {
          return Promise.resolve(
            jsonResponse([
              {
                student_id: 'ext-audit',
                price: 12000,
                price_pay_period: 'семестр',
              },
            ]),
          );
        }
        return Promise.resolve(jsonResponse([], 404));
      });
      await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      const [entry] = await findAuditRows(harness, {
        action: 'finance.viewed',
      });
      expect(entry).toBeDefined();
      expect(Object.keys(entry.details as object).sort()).toEqual([
        'kind',
        'paymentCount',
        'stale',
      ]);
      const raw = JSON.stringify(entry);
      expect(raw).not.toContain('1500');
      expect(raw).not.toContain('12000');
      expect(raw).not.toContain('6000');
      expect(raw).not.toContain('Оплата');
      expect(raw).not.toContain('ext-audit');
    });

    it('returns 503 maup_unavailable without cache', async () => {
      const student = await harness.createStudent();
      harness.fetchMock.mockImplementation(() =>
        Promise.resolve(jsonResponse({ error: 'E-99' }, 503)),
      );

      const response = await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(503);

      expect(asError(response).code).toBe('maup_unavailable');
    });

    // Критерій §10 п.8: жоден endpoint спеки не віддає 409.
    it('returns 200 with meta.reason no_active_profile when the profile has no external id', async () => {
      const student = await harness.createStudent('');
      mockMaup();

      const response = await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      const body = asFinance(response);
      expect(body.tuition).toEqual({
        balance: 0,
        currency: 'UAH',
        payments: [],
      });
      expect(body.dormitory).toEqual({ payments: [] });
      expect(body.meta).toEqual({
        profileId: null,
        fetchedAt: null,
        stale: false,
        reason: 'no_active_profile',
      });
      expect(dataEndpointCalls()).toHaveLength(0);
    });

    // Спека §5 п.7: без активного AcademicTerm дані все одно віддаються
    // повністю, лише meta.reason сигналізує стан (у фінансах немає isCurrent).
    it('returns 200 with meta.reason no_current_term when there is no active academic term', async () => {
      await collection('AcademicTerm').deleteMany({});
      const student = await harness.createStudent();
      mockMaup();

      const response = await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      const body = asFinance(response);
      expect(body.meta.reason).toBe('no_current_term');
      expect(body.tuition.balance).toBe(-1500.5);
    });

    it('force-refreshes the cache immediately and audits finance.refreshed', async () => {
      const student = await harness.createStudent();
      mockMaup();

      await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      // Кеш після GET ще свіжий (freshUntil у майбутньому) — force:true все
      // одно має його обійти й піти в MAUP за новими даними.
      harness.fetchMock.mockImplementation((url: URL | string) => {
        const href = String(url);
        const reference = referenceResponse(href);
        if (reference) return Promise.resolve(reference);
        if (href.endsWith('/saldo')) {
          return Promise.resolve(
            jsonResponse([{ student_id: '1001', saldo: -999 }]),
          );
        }
        if (href.endsWith('/payments')) {
          return Promise.resolve(jsonResponse(MAUP_PAYMENTS_FIXTURE));
        }
        if (href.endsWith('/studentinfo')) {
          return Promise.resolve(jsonResponse(MAUP_STUDENTINFO_FIXTURE));
        }
        return Promise.resolve(jsonResponse([], 404));
      });

      const response = await request(server())
        .post('/api/finance/my/refresh')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);

      const body = asFinance(response);
      expect(body.tuition.balance).toBe(-999);
      expect(body.meta.stale).toBe(false);
      expect(dataEndpointCalls()).toHaveLength(6); // 3 (GET) + 3 (POST refresh)

      const entries = await findAuditRows(harness, {
        action: 'finance.refreshed',
      });
      expect(entries).toHaveLength(1);
      expect(Object.keys(entries[0].details as object).sort()).toEqual([
        'kind',
        'paymentCount',
        'stale',
      ]);
    });

    it('throttles the fourth refresh within a minute', async () => {
      const student = await harness.createStudent();
      mockMaup();
      const agent = request.agent(server());

      for (let i = 0; i < 3; i += 1) {
        await agent
          .post('/api/finance/my/refresh')
          .set('Authorization', `Bearer ${student.token}`)
          .expect(200);
      }
      await agent
        .post('/api/finance/my/refresh')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(429);
    });
  });

  // Критерій §10 п.5. Секрети MAUP тут не потрібні: `resolve()` кидає
  // ExternalDataDisabledException ще до звернення до клієнта (Task 1).
  describe('MAUP disabled', () => {
    let harness: MaupE2eHarness;

    const server = () => harness.app.getHttpServer();

    beforeAll(async () => {
      harness = await bootstrapMaupE2e({
        container,
        database: 'finance-disabled-e2e',
        env: { MAUP_API_ENABLED: 'false' },
      });
    }, MAUP_E2E_SETUP_TIMEOUT);

    beforeEach(() => harness.resetData());

    afterAll(async () => {
      await harness?.close();
    });

    it('returns 503 maup_disabled when the integration is off', async () => {
      const student = await harness.createStudent();

      const response = await request(server())
        .get('/api/finance/my')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(503);

      expect(asError(response).code).toBe('maup_disabled');
      expect(harness.fetchMock).not.toHaveBeenCalled();
    });
  });
});
