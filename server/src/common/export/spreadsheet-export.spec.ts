import { Response } from 'express';
import {
  buildSpreadsheetExportArtifact,
  createSpreadsheetExportArtifact,
  sendSpreadsheetExport,
  SpreadsheetExportFormat,
} from './spreadsheet-export';
import { sanitizeSpreadsheetValue } from './spreadsheet-document';

describe('spreadsheet export infrastructure', () => {
  it('executes only the builder selected by the requested format', async () => {
    const buildCsv = jest.fn(() => 'csv');
    const buildXlsx = jest.fn(() => Buffer.from('xlsx'));

    const artifact = await buildSpreadsheetExportArtifact({
      filename: 'report',
      format: SpreadsheetExportFormat.CSV,
      buildCsv,
      buildXlsx,
    });

    expect(artifact.filename).toBe('report.csv');
    expect(buildCsv).toHaveBeenCalledTimes(1);
    expect(buildXlsx).not.toHaveBeenCalled();
  });

  it('creates a typed artifact and removes unsafe filename characters', () => {
    const artifact = createSpreadsheetExportArtifact({
      content: 'value',
      filename: '../report\r\nInjected: true',
      format: SpreadsheetExportFormat.CSV,
    });

    expect(artifact.filename).toBe('reportInjected-true.csv');
    expect(artifact.contentType).toBe('text/csv; charset=utf-8');
    expect(artifact.buffer.toString('utf8')).toBe('value');
  });

  it('sets consistent private download headers', () => {
    const set = jest.fn();
    const send = jest.fn();
    const response = {
      set,
      send,
    } as unknown as Response;
    const artifact = createSpreadsheetExportArtifact({
      content: Buffer.from('PK'),
      filename: 'report',
      format: SpreadsheetExportFormat.XLSX,
    });

    sendSpreadsheetExport(response, artifact);

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'attachment; filename="report.xlsx"',
        'Content-Length': 2,
        'X-Content-Type-Options': 'nosniff',
      }),
    );
    expect(send).toHaveBeenCalledWith(artifact.buffer);
  });

  it('neutralizes formulas hidden behind whitespace and line breaks', () => {
    expect(
      sanitizeSpreadsheetValue('  =HYPERLINK("https://invalid.test")'),
    ).toBe(`'  =HYPERLINK("https://invalid.test")`);
    expect(sanitizeSpreadsheetValue('\n+SUM(1,1)')).toBe(`'\n+SUM(1,1)`);
  });
});
