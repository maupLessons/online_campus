import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function SyllabusLink({ url }: { url?: string }) {
  const { t } = useTranslation();

  if (!url) {
    return (
      <span className="text-sm text-slate-400">{t('electives.noSyllabus')}</span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
    >
      <FileText className="h-4 w-4" aria-hidden="true" />
      {t('electives.syllabus')}
    </a>
  );
}
