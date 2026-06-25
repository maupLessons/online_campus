import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { moodleBaseUrl } from "../../config/externalLearning";

export default function MoodleRedirectPage() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
        {t("moodle.badge")}
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        {t("moodle.title")}
      </h1>

      <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base">
        {t("moodle.description")}
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        {t("moodle.portalScope")}
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <a
          href={moodleBaseUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {t("moodle.open")}
          <ExternalLink size={16} />
        </a>

        <Link
          to="/courses"
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {t("moodle.backToCourses")}
        </Link>
      </div>
    </section>
  );
}
