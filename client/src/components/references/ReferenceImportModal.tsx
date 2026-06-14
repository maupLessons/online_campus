import { FileSpreadsheet, X } from "lucide-react";
import { useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  referencesApi,
  type ReferenceImportMode,
  type ReferenceImportResult,
  type ReferenceType,
} from "../../services/referencesApi";

interface Props {
  type: ReferenceType;
  onClose: () => void;
  onImported: () => void;
}

export default function ReferenceImportModal({
  type,
  onClose,
  onImported,
}: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ReferenceImportMode>("upsert");
  const [result, setResult] = useState<ReferenceImportResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.currentTarget.files?.[0] ?? null);
    setResult(null);
    setError("");
  };

  const execute = async (dryRun: boolean) => {
    if (!file) {
      setError(t("references.import.fileRequired"));
      return;
    }
    setProcessing(true);
    setError("");
    try {
      const nextResult = await referencesApi.import(type, file, dryRun, mode);
      setResult(nextResult);
      if (!dryRun && nextResult.errors.length === 0) {
        onImported();
      }
    } catch {
      setError(t("references.import.error"));
    } finally {
      setProcessing(false);
    }
  };

  const canApply =
    result?.dryRun === true &&
    result.validRows > 0 &&
    result.errors.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-import-title"
        className="w-full max-w-2xl rounded-lg bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2
            id="reference-import-title"
            className="text-lg font-semibold text-slate-900"
          >
            {t("references.import.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label={t("references.form.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {t("references.import.hint")}
          </div>

          <label className="block text-sm font-medium text-slate-700">
            {t("references.import.mode")}
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.currentTarget.value as ReferenceImportMode);
                setResult(null);
              }}
              className="mt-1.5 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="upsert">
                {t("references.import.modes.upsert")}
              </option>
              <option value="create">
                {t("references.import.modes.create")}
              </option>
            </select>
          </label>

          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 text-center hover:border-blue-400 hover:bg-blue-50">
            <FileSpreadsheet className="mb-2 h-6 w-6 text-blue-600" />
            <span className="text-sm font-medium text-slate-800">
              {file?.name ?? t("references.import.chooseFile")}
            </span>
            <span className="mt-1 text-xs text-slate-500">
              {t("references.import.fileLimits")}
            </span>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFile}
              className="sr-only"
            />
          </label>

          {result && (
            <div className="rounded-md border border-slate-200">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-slate-500">
                    {t("references.import.totalRows")}
                  </p>
                  <p className="font-semibold text-slate-900">
                    {result.totalRows}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">
                    {t("references.import.validRows")}
                  </p>
                  <p className="font-semibold text-slate-900">
                    {result.validRows}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">
                    {t("references.import.created")}
                  </p>
                  <p className="font-semibold text-slate-900">
                    {result.created}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">
                    {t("references.import.updated")}
                  </p>
                  <p className="font-semibold text-slate-900">
                    {result.updated}
                  </p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto border-t border-slate-200 p-4">
                  <p className="mb-2 text-sm font-semibold text-red-700">
                    {t("references.import.validationErrors")}
                  </p>
                  <ul className="space-y-1 text-sm text-red-700">
                    {result.errors.map((item) => (
                      <li
                        key={`${item.row}-${item.field ?? ""}-${item.message}`}
                      >
                        {t("references.import.row", { row: item.row })}:{" "}
                        {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("references.form.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void execute(true)}
              disabled={!file || processing}
              className="h-10 rounded-md border border-blue-600 px-4 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing
                ? t("references.import.processing")
                : t("references.import.validate")}
            </button>
            <button
              type="button"
              onClick={() => void execute(false)}
              disabled={!canApply || processing}
              className="h-10 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("references.import.apply")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
