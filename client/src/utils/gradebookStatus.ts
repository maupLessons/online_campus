export type GradebookEntryStatus = 'graded' | 'not_passed' | 'absent' | 'not_admitted' | 'pending';

export type GradebookCell = {
  text: string | number;
  tone: 'normal' | 'danger' | 'muted';
};

type Translate = (key: string) => string;

/** GRADE-002: «не складав», «не з’явився», «не допущений» і бал < 60 — червоним. */
export function getGradebookCell(
  entry: { status: GradebookEntryStatus; score?: number },
  t: Translate,
): GradebookCell {
  switch (entry.status) {
    case 'graded': {
      // Залік за шкалою «Відмітка про залік» приходить статусом 'graded' без
      // score (gradebook.mapper.ts не додає поле, якщо балу немає) — це не
      // 0 балів, а «зараховано», і малювати його червоним неправильно.
      if (entry.score === undefined) {
        return { text: t('gradebook.status.passed'), tone: 'normal' };
      }
      return { text: entry.score, tone: entry.score < 60 ? 'danger' : 'normal' };
    }
    case 'not_passed':
      return { text: t('gradebook.status.notPassed'), tone: 'danger' };
    case 'absent':
      return { text: t('gradebook.status.absent'), tone: 'danger' };
    case 'not_admitted':
      return { text: t('gradebook.status.notAdmitted'), tone: 'danger' };
    default:
      return { text: '—', tone: 'muted' };
  }
}

export const TONE_CLASS: Record<GradebookCell['tone'], string> = {
  normal: 'text-slate-900',
  danger: 'font-semibold text-red-600',
  muted: 'text-slate-400',
};
