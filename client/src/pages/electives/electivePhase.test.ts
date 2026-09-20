import { describe, expect, it } from 'vitest';
import { getElectivePhaseView } from './electivePhase';

describe('getElectivePhaseView', () => {
  it('allows selection only when open', () => {
    expect(getElectivePhaseView('open').canSelect).toBe(true);
    expect(getElectivePhaseView('upcoming').canSelect).toBe(false);
    expect(getElectivePhaseView('closed').canSelect).toBe(false);
    expect(getElectivePhaseView('finalized').canSelect).toBe(false);
  });
  it('maps label keys', () => {
    expect(getElectivePhaseView('upcoming').labelKey).toBe('electives.phase.upcoming');
  });
});
