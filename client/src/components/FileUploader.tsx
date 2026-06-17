import { useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAutoDismissState } from "../hooks/useAutoDismissState";

interface FileUploaderProps {
  onUpload: (file: File) => Promise<void>;
  allowedTypes?: string[];
}

export function FileUploader({ onUpload, allowedTypes }: FileUploaderProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useAutoDismissState("");
  const [error, setError] = useAutoDismissState("");
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setMessage("");
      setError("");
      if (selected.size > MAX_SIZE) {
        setError(t("fileUploader.fileTooLarge"));
        e.target.value = "";
        setFile(null);
        return;
      }

      const extension = selected.name.includes(".")
        ? `.${selected.name.split(".").pop()?.toLowerCase()}`
        : "";
      if (allowedTypes && !allowedTypes.includes(extension)) {
        setError(t("fileUploader.typeNotAllowed"));
        e.target.value = "";
        setFile(null);
        return;
      }
      setFile(selected);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      await onUpload(file);
      setFile(null);
      setMessage(t("fileUploader.success"));
    } catch {
      setError(t("fileUploader.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center">
      <input
        type="file"
        accept={allowedTypes?.join(",")}
        onChange={handleFileChange}
        className="mb-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />
      {error && (
        <p className="mb-3 text-sm font-medium text-red-600">{error}</p>
      )}
      {message && (
        <p className="mb-3 text-sm font-medium text-green-700">{message}</p>
      )}
      {file && (
        <button
          onClick={handleUpload}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          {loading
            ? t("fileUploader.uploading")
            : t("fileUploader.upload", { name: file.name })}
        </button>
      )}
    </div>
  );
}
