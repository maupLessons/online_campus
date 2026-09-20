import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { INFO_RESOURCES } from '../../config/infoResources';

export default function ResourcesPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">{t('resources.title')}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('resources.subtitle')}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {INFO_RESOURCES.map(({ key, url, icon: Icon }) => (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <Icon className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                {t(`resources.items.${key}.title`)}
                <ExternalLink className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </span>
              <span className="mt-1 block text-sm text-slate-500">
                {t(`resources.items.${key}.description`)}
              </span>
              <span className="mt-2 block text-xs text-slate-400">{new URL(url).host}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
