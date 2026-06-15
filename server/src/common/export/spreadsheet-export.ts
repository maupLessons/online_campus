import { Response } from 'express';

export enum SpreadsheetExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
}

export enum SpreadsheetExportLocale {
  UK = 'uk',
  EN = 'en',
}

export const SPREADSHEET_CONTENT_TYPES: Record<
  SpreadsheetExportFormat,
  string
> = {
  [SpreadsheetExportFormat.CSV]: 'text/csv; charset=utf-8',
  [SpreadsheetExportFormat.XLSX]:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export type SpreadsheetExportArtifact = {
  buffer: Buffer;
  contentType: string;
  filename: string;
  format: SpreadsheetExportFormat;
};

export async function buildSpreadsheetExportArtifact(params: {
  filename: string;
  format: SpreadsheetExportFormat;
  buildCsv: () => string | Buffer | Promise<string | Buffer>;
  buildXlsx: () => Buffer | Promise<Buffer>;
}): Promise<SpreadsheetExportArtifact> {
  const content =
    params.format === SpreadsheetExportFormat.CSV
      ? await params.buildCsv()
      : await params.buildXlsx();
  return createSpreadsheetExportArtifact({
    content,
    filename: params.filename,
    format: params.format,
  });
}

export function createSpreadsheetExportArtifact(params: {
  content: Buffer | string;
  filename: string;
  format: SpreadsheetExportFormat;
}): SpreadsheetExportArtifact {
  const filename = buildSafeExportFilename(params.filename, params.format);
  return {
    buffer: Buffer.isBuffer(params.content)
      ? params.content
      : Buffer.from(params.content, 'utf8'),
    contentType: SPREADSHEET_CONTENT_TYPES[params.format],
    filename,
    format: params.format,
  };
}

export function sendSpreadsheetExport(
  response: Response,
  artifact: SpreadsheetExportArtifact,
) {
  response.set({
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `attachment; filename="${artifact.filename}"`,
    'Content-Length': artifact.buffer.length,
    'Content-Type': artifact.contentType,
    Pragma: 'no-cache',
    Vary: 'Cookie, Authorization',
    'X-Content-Type-Options': 'nosniff',
  });
  return response.send(artifact.buffer);
}

function buildSafeExportFilename(
  requestedName: string,
  format: SpreadsheetExportFormat,
): string {
  const withoutExtension = requestedName.replace(/\.(csv|xlsx)$/i, '');
  const sanitized = removeControlCharacters(withoutExtension.normalize('NFKD'))
    .replace(/[\\/:*?"<>|;]/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);

  return `${sanitized || 'export'}.${format}`;
}

function removeControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('');
}
