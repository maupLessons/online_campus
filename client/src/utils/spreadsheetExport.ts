export const SpreadsheetExportFormat = {
  CSV: "csv",
  XLSX: "xlsx",
} as const;

export type SpreadsheetExportFormat =
  (typeof SpreadsheetExportFormat)[keyof typeof SpreadsheetExportFormat];

export type SpreadsheetExportLocale = "uk" | "en";

export function downloadBlob(blob: Blob, requestedFilename: string): void {
  const filename = sanitizeFilename(requestedFilename);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(requestedFilename: string): string {
  const sanitized = removeControlCharacters(requestedFilename.normalize("NFKD"))
    .replace(/[\\/:*?"<>|;]/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 128);
  return sanitized || "download";
}

function removeControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
}
