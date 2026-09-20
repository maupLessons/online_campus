import { MAUP_SCHEDULE_CONTRACT_FIXTURE } from '../integrations/maup-student-api/fixtures/maup-schedule.contract-fixture';
import { mapMaupScheduleToSnapshot } from './maup-schedule.mapper';

describe('MAUP schedule contract fixture', () => {
  it('normalizes nested MAUP /schedule periods into internal snapshot entries', () => {
    const result = mapMaupScheduleToSnapshot(MAUP_SCHEDULE_CONTRACT_FIXTURE, {
      isExamSession: false,
    });

    expect(result.entries.length).toBeGreaterThan(0);
    const keys = result.entries.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
