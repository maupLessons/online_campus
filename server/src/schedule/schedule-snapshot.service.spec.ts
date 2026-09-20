import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { MAUP_SCHEDULE_CONTRACT_FIXTURE } from '../integrations/maup-student-api/fixtures/maup-schedule.contract-fixture';
import { MaupStudentApiError } from '../integrations/maup-student-api/maup-student-api.error';
import { hashWireResponse } from './maup-schedule.mapper';
import { ScheduleSnapshotService } from './schedule-snapshot.service';

const termId = new Types.ObjectId();
const term = { _id: termId, maupSemester: 1, maupAcademicYear: 2026 } as never;
const key = {
  groupCode: 'КН-11',
  termId: termId.toHexString(),
  isExamSession: false,
};
const lookup = {
  studentId: 'student-001',
  actorUserId: new Types.ObjectId().toHexString(),
};

function makeService(opts: {
  existing?: Record<string, unknown> | null;
  apiImpl?: jest.Mock;
  enabled?: boolean;
}) {
  const store = new Map<string, Record<string, unknown>>();
  if (opts.existing) store.set('k', opts.existing);
  const model = {
    findOne: jest.fn().mockImplementation(() => ({
      exec: jest.fn().mockResolvedValue(store.get('k') ?? null),
    })),
    findOneAndUpdate: jest
      .fn()
      .mockImplementation(
        (_f: unknown, update: { $set: Record<string, unknown> }) => {
          const doc = {
            ...(store.get('k') ?? {}),
            ...update.$set,
            _id: new Types.ObjectId(),
          };
          store.set('k', doc);
          return { exec: jest.fn().mockResolvedValue(doc) };
        },
      ),
    find: jest.fn(),
  };
  const api =
    opts.apiImpl ??
    jest.fn().mockResolvedValue([MAUP_SCHEDULE_CONTRACT_FIXTURE[0]]);
  const client = {
    getDiagnostics: () => ({ enabled: opts.enabled ?? true }),
    getScheduleByStudentLookup: api,
  };
  const config = new ConfigService({ SCHEDULE_CACHE_TTL_MS: '900000' });
  const service = new ScheduleSnapshotService(
    model as never,
    client as never,
    config,
  );
  return { service, model, api, store };
}

describe('ScheduleSnapshotService', () => {
  it('fetches from API when no snapshot exists and stores it', async () => {
    const { service, api } = makeService({});
    const result = await service.getOrRefresh(key, term, lookup);
    expect(api).toHaveBeenCalledWith(
      { studentId: 'student-001' },
      { semester: 1, academicYear: 2026, examSession: false },
    );
    expect(result.refreshed).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.snapshot?.entries.length).toBeGreaterThan(0);
  });

  it('serves a fresh snapshot without calling the API', async () => {
    const { service, api } = makeService({
      existing: { fetchedAt: new Date(), entries: [], rawHash: 'x' },
    });
    const result = await service.getOrRefresh(key, term, lookup);
    expect(api).not.toHaveBeenCalled();
    expect(result.refreshed).toBe(false);
  });

  it('deduplicates concurrent refreshes of the same key', async () => {
    const { service, api } = makeService({
      existing: {
        fetchedAt: new Date(Date.now() - 3_600_000),
        entries: [],
        rawHash: 'old',
      },
    });
    await Promise.all(
      Array.from({ length: 10 }, () => service.getOrRefresh(key, term, lookup)),
    );
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('returns stale snapshot when the API fails', async () => {
    const fetchedAt = new Date(Date.now() - 3_600_000);
    const { service } = makeService({
      existing: { fetchedAt, entries: [{ key: 'a' }], rawHash: 'old' },
      apiImpl: jest
        .fn()
        .mockRejectedValue(
          new MaupStudentApiError({ kind: 'upstream', endpoint: 'schedule' }),
        ),
    });
    const result = await service.getOrRefresh(key, term, lookup);
    expect(result.stale).toBe(true);
    expect(result.snapshot?.fetchedAt).toEqual(fetchedAt);
  });

  it('returns null snapshot when the API fails and nothing is cached', async () => {
    const { service } = makeService({
      apiImpl: jest
        .fn()
        .mockRejectedValue(
          new MaupStudentApiError({ kind: 'timeout', endpoint: 'schedule' }),
        ),
    });
    const result = await service.getOrRefresh(key, term, lookup);
    expect(result).toEqual({ snapshot: null, stale: true, refreshed: false });
  });

  it('never calls the API when integration is disabled', async () => {
    const { service, api } = makeService({
      enabled: false,
      existing: { fetchedAt: new Date(0), entries: [], rawHash: 'seed' },
    });
    const result = await service.getOrRefresh(key, term, lookup);
    expect(api).not.toHaveBeenCalled();
    expect(result.stale).toBe(false);
  });

  it('refreshes a fresh snapshot when force is set', async () => {
    const { service, api } = makeService({
      existing: { fetchedAt: new Date(), entries: [], rawHash: 'x' },
    });
    const result = await service.getOrRefresh(key, term, lookup, {
      force: true,
    });
    expect(api).toHaveBeenCalledTimes(1);
    expect(result.refreshed).toBe(true);
  });

  it('stores the snapshot under the campus group code even if the API returns another one', async () => {
    const { service, model } = makeService({});
    await service.getOrRefresh({ ...key, groupCode: ' кн-11 ' }, term, lookup);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [filter, update] = model.findOneAndUpdate.mock.calls[0];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(filter.groupCode).toBe(' кн-11 ');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(update.$set.groupCode).toBe(' кн-11 ');
  });

  it('re-reads the snapshot instead of crashing when a concurrent writer wins', async () => {
    const winner = {
      _id: new Types.ObjectId(),
      fetchedAt: new Date(),
      entries: [{ key: 'w' }],
      rawHash: 'new',
    };
    const { service, model, store } = makeService({
      existing: {
        fetchedAt: new Date(Date.now() - 3_600_000),
        entries: [],
        rawHash: 'old',
      },
    });
    // The conditional update doesn't match (another process already changed fetchedAt) → null, upsert is NOT done.
    model.findOneAndUpdate.mockImplementationOnce(() => {
      store.set('k', winner); // another process wrote its snapshot right before us
      return { exec: jest.fn().mockResolvedValue(null) };
    });
    const listener = jest.fn();
    service.setRefreshListener(listener);
    const result = await service.getOrRefresh(key, term, lookup);
    expect(result.snapshot).toBe(winner);
    expect(result.stale).toBe(false);
    expect(listener).not.toHaveBeenCalled(); // the diff is done by whoever actually wrote
  });

  it('derives staleness from the winner fetchedAt when a concurrent full write loses the race', async () => {
    const winner = {
      _id: new Types.ObjectId(),
      fetchedAt: new Date(Date.now() - 3_600_000), // beyond the TTL — must yield stale: true
      entries: [{ key: 'w' }],
      rawHash: 'new',
    };
    const { service, model, store } = makeService({
      existing: {
        fetchedAt: new Date(Date.now() - 3_600_000),
        entries: [],
        rawHash: 'old',
      },
    });
    model.findOneAndUpdate.mockImplementationOnce(() => {
      store.set('k', winner);
      return { exec: jest.fn().mockResolvedValue(null) };
    });
    const result = await service.getOrRefresh(key, term, lookup);
    expect(result.snapshot).toBe(winner);
    expect(result.refreshed).toBe(false);
    expect(result.stale).toBe(true);
  });

  it('falls back to a re-read on E11000 from the upsert race', async () => {
    const winner = {
      _id: new Types.ObjectId(),
      fetchedAt: new Date(),
      entries: [{ key: 'w' }],
      rawHash: 'new',
    };
    const { service, model, store } = makeService({});
    model.findOneAndUpdate.mockImplementationOnce(() => ({
      exec: jest.fn().mockImplementation(() => {
        store.set('k', winner);
        return Promise.reject(
          Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
        );
      }),
    }));
    const result = await service.getOrRefresh(key, term, lookup);
    expect(result.snapshot).toBe(winner);
    expect(result.refreshed).toBe(false);
  });

  it('skips diff and write when rawHash matches but bumps fetchedAt', async () => {
    const { service, model } = makeService({
      existing: {
        fetchedAt: new Date(Date.now() - 3_600_000),
        entries: [],
        rawHash: hashWireResponse([MAUP_SCHEDULE_CONTRACT_FIXTURE[0]]),
      },
    });
    const listener = jest.fn();
    service.setRefreshListener(listener);
    await service.getOrRefresh(key, term, lookup);
    expect(listener).not.toHaveBeenCalled();
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(model.findOneAndUpdate.mock.calls[0][1].$set).toEqual(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect.objectContaining({ fetchedAt: expect.any(Date) }),
    );
    expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      model.findOneAndUpdate.mock.calls[0][1].$set.entries,
    ).toBeUndefined();
  });

  it('re-reads with a derived staleness when the rawHash-touch write loses the race', async () => {
    const rawHash = hashWireResponse([MAUP_SCHEDULE_CONTRACT_FIXTURE[0]]);
    const winner = {
      _id: new Types.ObjectId(),
      fetchedAt: new Date(Date.now() - 3_600_000), // beyond the TTL — must yield stale: true
      entries: [{ key: 'w' }],
      rawHash,
    };
    const { service, model, store } = makeService({
      existing: {
        fetchedAt: new Date(Date.now() - 3_600_000),
        entries: [],
        rawHash,
      },
    });
    // The conditional update (fetchedAt only) loses the race the same way a full write does.
    model.findOneAndUpdate.mockImplementationOnce(() => {
      store.set('k', winner);
      return { exec: jest.fn().mockResolvedValue(null) };
    });
    const result = await service.getOrRefresh(key, term, lookup);
    expect(result.snapshot).toBe(winner);
    expect(result.refreshed).toBe(false);
    expect(result.stale).toBe(true);
  });

  it('falls back to the stale existing snapshot when the DB write fails with a non-duplicate-key error', async () => {
    const existingDoc = {
      fetchedAt: new Date(Date.now() - 3_600_000),
      entries: [{ key: 'old' }],
      rawHash: 'old',
    };
    const { service, model } = makeService({ existing: existingDoc });
    model.findOneAndUpdate.mockImplementationOnce(() => ({
      exec: jest.fn().mockRejectedValue(new Error('connection reset')),
    }));
    const result = await service.getOrRefresh(key, term, lookup);
    expect(result).toEqual({
      snapshot: existingDoc,
      stale: true,
      refreshed: false,
    });
  });

  it('falls back to the stale existing snapshot when the mapper throws on a malformed payload', async () => {
    const existingDoc = {
      fetchedAt: new Date(Date.now() - 3_600_000),
      entries: [],
      rawHash: 'old',
    };
    const { service } = makeService({
      existing: existingDoc,
      apiImpl: jest.fn().mockResolvedValue(null),
    });
    const result = await service.getOrRefresh(key, term, lookup);
    expect(result).toEqual({
      snapshot: existingDoc,
      stale: true,
      refreshed: false,
    });
  });
});
