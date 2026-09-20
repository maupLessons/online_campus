import api from './api';
import type {
  OnlineLessonLink,
  OnlineLessonLinkInput,
  ScheduleGroupResponse,
  ScheduleRefreshSummary,
  ScheduleResponse,
  ScheduleTodayResponse,
} from '../types';
import { downloadBlob, type SpreadsheetExportFormat, type SpreadsheetExportLocale } from '../utils/spreadsheetExport';
import { fetchSpreadsheetExport } from './spreadsheetExportApi';

export type ScheduleRange = { from: string; to: string };

export const scheduleQueryKeys = {
  my: (range: ScheduleRange) => ['schedule', 'my', range] as const,
  session: (range: ScheduleRange) => ['schedule', 'session', range] as const,
  // Exactly ['schedule','today'] — plan 03 Task 10 uses this same key (Global Constraints).
  today: () => ['schedule', 'today'] as const,
  myLinks: () => ['schedule', 'online-links', 'my'] as const,
  group: (code: string, range: ScheduleRange, session: boolean) => ['schedule', 'group', code, range, session] as const,
};

export const scheduleApi = {
  async my(range: ScheduleRange) { return (await api.get<ScheduleResponse>('/schedule/my', { params: range })).data; },
  async session(range: ScheduleRange) { return (await api.get<ScheduleResponse>('/schedule/session/my', { params: range })).data; },
  // §5.3a: no parameters, the response is {date, lessons, session, meta}.
  async today() { return (await api.get<ScheduleTodayResponse>('/schedule/today')).data; },
  async myLinks() { return (await api.get<OnlineLessonLink[]>('/schedule/online-links/my')).data; },
  async upsertLink(body: OnlineLessonLinkInput) { return (await api.put<OnlineLessonLink>('/schedule/online-links', body)).data; },
  async deleteLink(id: string) { await api.delete(`/schedule/online-links/${id}`); },
  async group(code: string, range: ScheduleRange, session: boolean) {
    return (await api.get<ScheduleGroupResponse>(`/schedule/groups/${encodeURIComponent(code)}`, { params: { ...range, session } })).data;
  },
  async refreshGroup(code: string, session?: boolean) {
    return (await api.post<ScheduleGroupResponse>(
      `/schedule/groups/${encodeURIComponent(code)}/refresh`,
      undefined,
      { params: session === undefined ? {} : { session } },
    )).data;
  },
  async refreshAll() { return (await api.post<ScheduleRefreshSummary>('/schedule/refresh')).data; },
  async export(range: ScheduleRange, format: SpreadsheetExportFormat, locale: SpreadsheetExportLocale, session = false) {
    const blob = await fetchSpreadsheetExport('/schedule/export', { params: { ...range, format, locale, session } });
    downloadBlob(blob, `${session ? 'session' : 'schedule'}.${format}`);
  },
};
