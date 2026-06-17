import { Fragment, useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Filter,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import api from "../../services/api";
import { useAutoDismissState } from "../../hooks/useAutoDismissState";
import { ROLE_LABEL_KEYS } from "../../types";
import type {
  AuditLogEntry,
  AuditLogResult,
  PaginatedResponse,
} from "../../types";

type AuditLogFilters = {
  userLogin: string;
  action: string;
  result: "" | AuditLogResult;
  dateFrom: string;
  dateTo: string;
  requestId: string;
  limit: number;
};

const DEFAULT_FILTERS: AuditLogFilters = {
  userLogin: "",
  action: "",
  result: "",
  dateFrom: "",
  dateTo: "",
  requestId: "",
  limit: 10,
};

function toBoundaryIsoDate(
  value: string,
  boundary: "start" | "end",
): string | undefined {
  if (!value) {
    return undefined;
  }

  const time = boundary === "start" ? "00:00:00.000" : "23:59:59.999";
  return new Date(`${value}T${time}`).toISOString();
}

function buildAuditLogParams(filters: AuditLogFilters, page: number) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: filters.limit.toString(),
  });

  if (filters.userLogin.trim()) {
    params.set("userLogin", filters.userLogin.trim());
  }

  if (filters.action.trim()) {
    params.set("action", filters.action.trim());
  }

  if (filters.result) {
    params.set("result", filters.result);
  }

  if (filters.requestId.trim()) {
    params.set("requestId", filters.requestId.trim());
  }

  const from = toBoundaryIsoDate(filters.dateFrom, "start");
  const to = toBoundaryIsoDate(filters.dateTo, "end");

  if (from) {
    params.set("from", from);
  }

  if (to) {
    params.set("to", to);
  }

  return params;
}

function hasDetails(log: AuditLogEntry): boolean {
  return Boolean(log.details && Object.keys(log.details).length > 0);
}

export default function AuditLogPage() {
  const { t, i18n } = useTranslation();
  const [draftFilters, setDraftFilters] =
    useState<AuditLogFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<AuditLogFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [requestVersion, setRequestVersion] = useState(0);
  const [auditLog, setAuditLog] =
    useState<PaginatedResponse<AuditLogEntry> | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useAutoDismissState("");

  const locale = i18n.language.startsWith("en") ? "en-US" : "uk-UA";

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    api
      .get<PaginatedResponse<AuditLogEntry>>("/audit-log", {
        params: buildAuditLogParams(appliedFilters, page),
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (mounted) {
          setAuditLog(data);
          setExpandedId(null);
        }
      })
      .catch(() => {
        if (mounted) {
          setError(t("auditLog.error"));
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [appliedFilters, page, requestVersion, setError, t]);

  const prepareRequest = () => {
    setLoading(true);
    setError("");
    setRequestVersion((current) => current + 1);
  };

  const handleSubmit = (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();
    prepareRequest();
    setPage(1);
    setAppliedFilters(draftFilters);
  };

  const handleReset = () => {
    prepareRequest();
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const handleLimitChange = (limit: number) => {
    prepareRequest();
    setDraftFilters((current) => ({ ...current, limit }));
    setAppliedFilters((current) => ({ ...current, limit }));
    setPage(1);
  };

  const handlePageChange = (nextPage: number) => {
    prepareRequest();
    setPage(nextPage);
  };

  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(value));

  const totalPages = auditLog?.totalPages ?? 0;
  const currentPage = totalPages === 0 ? 0 : (auditLog?.page ?? page);
  const logs = auditLog?.docs ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            {t("auditLog.title")}
          </h1>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600">
          {t("auditLog.rowsPerPage")}
          <select
            value={draftFilters.limit}
            onChange={(event) => handleLimitChange(Number(event.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[10, 25, 50].map((limit) => (
              <option key={limit} value={limit}>
                {limit}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Filter className="h-4 w-4" aria-hidden="true" />
          {t("auditLog.filters")}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-1 text-sm text-gray-600">
            <span>{t("auditLog.userLogin")}</span>
            <input
              value={draftFilters.userLogin}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  userLogin: event.target.value,
                }))
              }
              placeholder={t("auditLog.userPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-1 text-sm text-gray-600">
            <span>{t("auditLog.action")}</span>
            <input
              value={draftFilters.action}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  action: event.target.value,
                }))
              }
              placeholder={t("auditLog.actionPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-1 text-sm text-gray-600">
            <span>{t("auditLog.result")}</span>
            <select
              value={draftFilters.result}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  result: event.target.value as "" | AuditLogResult,
                }))
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t("auditLog.allResults")}</option>
              <option value="success">{t("auditLog.success")}</option>
              <option value="failure">{t("auditLog.failure")}</option>
            </select>
          </label>

          <label className="space-y-1 text-sm text-gray-600">
            <span>{t("auditLog.dateFrom")}</span>
            <input
              type="date"
              value={draftFilters.dateFrom}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-1 text-sm text-gray-600">
            <span>{t("auditLog.dateTo")}</span>
            <input
              type="date"
              value={draftFilters.dateTo}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="space-y-1 text-sm text-gray-600">
            <span>{t("auditLog.requestId")}</span>
            <input
              value={draftFilters.requestId}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  requestId: event.target.value,
                }))
              }
              placeholder={t("auditLog.requestPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("auditLog.resetFilters")}
          </button>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {t("auditLog.applyFilters")}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-260">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                {t("auditLog.timestamp")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                {t("auditLog.actor")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                {t("auditLog.action")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                {t("auditLog.target")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                {t("auditLog.result")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                {t("auditLog.ipAddress")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                {t("auditLog.details")}
              </th>
            </tr>
          </thead>

          <tbody>
            {logs.map((log) => {
              const expanded = expandedId === log.id;
              const showDetails = hasDetails(log);

              return (
                <Fragment key={log.id}>
                  <tr className="border-b last:border-0 hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {formatDateTime(log.timestamp)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {log.userLogin || t("auditLog.systemUser")}
                      </div>

                      <div className="text-xs text-gray-500">
                        {log.userRole ? t(ROLE_LABEL_KEYS[log.userRole]) : "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-800">
                        {log.action}
                      </code>
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700">
                      {log.targetEntity ? (
                        <div>
                          <div>{log.targetEntity}</div>
                          {log.targetId && (
                            <div className="max-w-45 truncate text-xs text-gray-500">
                              {log.targetId}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">
                          {t("auditLog.noTarget")}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                          log.result === "success"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {log.result === "success" ? (
                          <ShieldCheck
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <ShieldAlert
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        )}
                        {t(`auditLog.${log.result}`)}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div>{log.ipAddress}</div>
                      {log.requestId && (
                        <div className="max-w-47.5 truncate text-xs text-gray-500">
                          {log.requestId}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={!showDetails}
                        onClick={() =>
                          setExpandedId((current) =>
                            current === log.id ? null : log.id,
                          )
                        }
                        title={
                          expanded
                            ? t("auditLog.hideDetails")
                            : t("auditLog.showDetails")
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                      >
                        {expanded ? (
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </td>
                  </tr>

                  {expanded && showDetails && (
                    <tr className="border-b bg-gray-50">
                      <td colSpan={7} className="px-4 py-3">
                        <pre className="max-h-80 overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-relaxed text-gray-100">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {!loading && logs.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  {t("auditLog.empty")}
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  {t("auditLog.loading")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-600">
          {t("auditLog.pageInfo", {
            page: currentPage,
            total: totalPages,
            count: auditLog?.totalDocs ?? 0,
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handlePageChange(Math.max(1, page - 1))}
            disabled={!auditLog?.hasPrevPage || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t("auditLog.previous")}
          </button>

          <button
            type="button"
            onClick={() => handlePageChange(page + 1)}
            disabled={!auditLog?.hasNextPage || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
          >
            {t("auditLog.next")}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
