import { describe, expect, it } from 'vitest';
import type { ActiveElectivePeriod, ElectivePhase } from '../../types';
import { renderStatic } from '../../test/renderStatic';
import ElectiveStatusCard from './ElectiveStatusCard';

const item = (phase: ElectivePhase, over: Record<string, unknown> = {}): ActiveElectivePeriod =>
  ({
    period: {
      id: 'p', title: 'Вибір 2026', status: 'active',
      startsAt: '2026-09-25T00:00:00Z', endsAt: '2026-09-30T00:00:00Z',
      requiredChoices: 2, ...over,
    },
    disciplines: [], selections: [], selectedCount: 1, remainingChoices: 1, phase,
  }) as unknown as ActiveElectivePeriod;

describe('ElectiveStatusCard', () => {
  it('shows "chosen N of M" and the button for an open period', async () => {
    const html = await renderStatic(<ElectiveStatusCard items={[item('open')]} isLoading={false} />);
    expect(html).toContain('обрано 1 з 2');
    expect(html).toContain('href="/electives"');
  });
  it('shows the opening date without a button for an upcoming period', async () => {
    const html = await renderStatic(<ElectiveStatusCard items={[item('upcoming')]} isLoading={false} />);
    expect(html).toContain('Вибір відкриється');
    expect(html).toContain('25');
    expect(html).not.toContain('href="/electives"');
  });
  it('shows the waiting text for a closed period', async () => {
    const html = await renderStatic(<ElectiveStatusCard items={[item('closed')]} isLoading={false} />);
    expect(html).toContain('очікує підтвердження деканату');
  });
  it('shows the enrolled text for a finalized period', async () => {
    const html = await renderStatic(<ElectiveStatusCard items={[item('finalized')]} isLoading={false} />);
    expect(html).toContain('Зараховано');
  });
  it('trusts the server phase and does not compare dates itself', async () => {
    const past = item('open', { startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-02T00:00:00Z' });
    const html = await renderStatic(<ElectiveStatusCard items={[past]} isLoading={false} />);
    expect(html).toContain('обрано 1 з 2');
  });
  it('shows empty state without periods', async () => {
    const html = await renderStatic(<ElectiveStatusCard items={[]} isLoading={false} />);
    expect(html).toContain('Активного періоду вибору немає');
  });
});
