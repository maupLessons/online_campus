import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { surveysApi, type SurveyExportFormat } from "../../services/surveysApi";
import { useAutoDismissState } from "../../hooks/useAutoDismissState";
import {
  SurveyQuestionType,
  SurveyStatus,
  type ChoiceQuestionResult,
  type RatingQuestionResult,
  type SurveyQuestionResult,
  type TextQuestionResult,
} from "../../types";
import { downloadBlob } from "../../utils/spreadsheetExport";
import { getLocalizedApiErrorMessage } from "../../utils/apiErrorMessage";

function barWidth(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function ChoiceResultCard({ question }: { question: ChoiceQuestionResult }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      {question.options.map((option) => (
        <div key={option.value}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">{option.value}</span>
            <span className="shrink-0 text-slate-500">
              {option.count} · {option.percentage}%
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full bg-blue-600"
              style={{ width: barWidth(option.percentage) }}
            />
          </div>
        </div>
      ))}

      {question.totalAnswers === 0 && (
        <p className="text-sm text-slate-500">
          {t("surveys.results.noAnswers")}
        </p>
      )}
    </div>
  );
}

function RatingResultCard({ question }: { question: RatingQuestionResult }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">
            {t("surveys.results.average")}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-900">
            <Star className="h-5 w-5 text-amber-500" aria-hidden="true" />
            {question.average ?? "—"}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">{t("surveys.results.min")}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {question.min ?? "—"}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">{t("surveys.results.max")}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {question.max ?? "—"}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {question.distribution.map((item) => (
          <div
            key={item.rating}
            className="grid grid-cols-[40px_1fr_76px] gap-3"
          >
            <span className="text-sm font-medium text-slate-700">
              {item.rating}
            </span>
            <div className="mt-1.5 h-2.5 rounded-full bg-slate-100">
              <div
                className="h-2.5 rounded-full bg-amber-500"
                style={{ width: barWidth(item.percentage) }}
              />
            </div>
            <span className="text-right text-sm text-slate-500">
              {item.count} · {item.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextResultCard({ question }: { question: TextQuestionResult }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(question.answers.length / pageSize));
  const visibleAnswers = question.answers.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  if (question.answers.length === 0) {
    return (
      <p className="text-sm text-slate-500">{t("surveys.results.noAnswers")}</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="max-h-96 space-y-2 overflow-auto pr-1">
        {visibleAnswers.map((answer, index) => (
          <div
            key={`${question.questionId}-${page}-${index}`}
            className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700"
          >
            {answer}
          </div>
        ))}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            {t("surveys.results.page")} {page} / {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {t("auditLog.previous")}
            </button>
            <button
              type="button"
              disabled={page === pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {t("auditLog.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionResultCard({ question }: { question: SurveyQuestionResult }) {
  const { t } = useTranslation();

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {t(`surveys.questionTypes.${question.type}`)}
            </span>
            {question.required && (
              <span className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                {t("surveys.required")}
              </span>
            )}
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            {question.order + 1}. {question.text}
          </h2>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {question.totalAnswers} {t("surveys.results.answersCount")}
        </div>
      </div>

      {(question.type === SurveyQuestionType.SINGLE ||
        question.type === SurveyQuestionType.MULTIPLE) && (
        <ChoiceResultCard question={question} />
      )}

      {question.type === SurveyQuestionType.RATING && (
        <RatingResultCard question={question} />
      )}

      {question.type === SurveyQuestionType.TEXT && (
        <TextResultCard question={question} />
      )}
    </article>
  );
}

export default function SurveyResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [exportError, setExportError] = useAutoDismissState("");
  const [exportingFormat, setExportingFormat] =
    useState<SurveyExportFormat | null>(null);

  const {
    data: results,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["surveys", id, "results"],
    enabled: Boolean(id),
    queryFn: () => surveysApi.getResults(id as string),
    refetchInterval: (query) =>
      query.state.data?.survey.status === SurveyStatus.ACTIVE ? 30_000 : false,
  });

  const handleExport = async (format: SurveyExportFormat) => {
    if (!id) return;

    setExportingFormat(format);
    setExportError("");

    try {
      const blob = await surveysApi.exportResults(id, format);
      downloadBlob(blob, `survey-${id}-results.${format}`);
    } catch (error) {
      setExportError(
        getLocalizedApiErrorMessage(
          error,
          i18n.language,
          t("surveys.results.exportError"),
        ),
      );
    } finally {
      setExportingFormat(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (isError || !results) {
    return (
      <div className="space-y-4">
        <Link
          to="/surveys/admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("common.back")}
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("surveys.results.loadError")}
        </div>
      </div>
    );
  }

  const canExport = results.survey.status === SurveyStatus.CLOSED;

  return (
    <div className="space-y-6">
      <Link
        to="/surveys/admin"
        className="inline-flex items-center gap-2 text-sm font-medium text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("common.back")}
      </Link>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                {t("surveys.results.title")}
              </span>
              <span
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  canExport
                    ? "bg-slate-100 text-slate-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {t(`surveys.statuses.${results.survey.status}`)}
              </span>
              {results.anonymous && (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("surveys.anonymous")}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-slate-900">
              {results.survey.title}
            </h1>

            {results.survey.description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {results.survey.description}
              </p>
            )}
          </div>

          {canExport && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleExport("csv")}
                disabled={exportingFormat !== null}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {exportingFormat === "csv"
                  ? t("surveys.results.exporting")
                  : t("surveys.results.exportCsv")}
              </button>
              <button
                type="button"
                onClick={() => handleExport("xlsx")}
                disabled={exportingFormat !== null}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                {exportingFormat === "xlsx"
                  ? t("surveys.results.exporting")
                  : t("surveys.results.exportXlsx")}
              </button>
            </div>
          )}
        </div>

        {!canExport && (
          <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {t("surveys.results.liveNotice")}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Users className="h-4 w-4" aria-hidden="true" />
              {t("surveys.results.expectedRecipients")}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {results.expectedRecipients}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Users className="h-4 w-4" aria-hidden="true" />
              {t("surveys.results.totalCompletions")}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {results.totalCompletions}{" "}
              <span className="text-sm font-semibold text-slate-500">
                ({results.completionRate}%)
              </span>
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <FileText className="h-4 w-4" aria-hidden="true" />
              {t("surveys.results.totalResponses")}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {results.totalResponses}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">{t("surveys.questions")}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {results.questions.length}
            </p>
          </div>
        </div>

        {exportError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {exportError}
          </div>
        )}
      </section>

      <div className="space-y-4">
        {results.questions.map((question) => (
          <QuestionResultCard key={question.questionId} question={question} />
        ))}
      </div>
    </div>
  );
}
