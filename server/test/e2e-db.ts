const runE2eWithDb = ['1', 'true', 'yes'].includes(
  (process.env.RUN_E2E_WITH_DB ?? '').toLowerCase(),
);

export const describeWithDb = runE2eWithDb ? describe : describe.skip;
