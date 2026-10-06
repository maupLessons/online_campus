import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { buffer as readStreamBuffer } from 'node:stream/consumers';
import * as ExcelJS from 'exceljs';
import {
  createSpreadsheetWorkbook,
  fitWorksheetColumns,
  sanitizeSpreadsheetValue,
  styleSpreadsheetDataRow,
  styleSpreadsheetHeaderRow,
} from './spreadsheet-document';

const loadExcelJsDependency = createRequire(
  createRequire(__filename).resolve('exceljs'),
);

interface ZipEntry extends Readable {
  path: string;
  buffer(): Promise<Buffer>;
}

describe('Spreadsheet dependency compatibility', () => {
  it('keeps deprecated packages and obsolete glob/rimraf out of the lockfile', () => {
    const lockfile = JSON.parse(
      readFileSync(resolve(__dirname, '../../../package-lock.json'), 'utf8'),
    ) as {
      packages: Record<string, { version?: string; deprecated?: string }>;
    };
    const obsolete = Object.entries(lockfile.packages).filter(
      ([path, info]) => {
        const name = path.split('node_modules/').at(-1);
        return (
          Boolean(info.deprecated) ||
          ['inflight', 'fstream', 'lodash.isequal'].includes(name ?? '') ||
          (name === 'glob' && Number(info.version?.split('.')[0]) < 11) ||
          (name === 'rimraf' && Number(info.version?.split('.')[0]) < 4)
        );
      },
    );
    expect(obsolete).toEqual([]);
  });

  it('round-trips formatted XLSX, Unicode, merged cells and safe string values', async () => {
    const workbook = createSpreadsheetWorkbook();
    const worksheet = workbook.addWorksheet('Кампус - Campus');
    worksheet.mergeCells('A1:C1');
    worksheet.getCell('A1').value = 'Кампус / Campus';
    styleSpreadsheetHeaderRow(worksheet.addRow(['Назва', 'Amount', 'Active']));
    const formula = sanitizeSpreadsheetValue(
      ' =HYPERLINK("https://invalid.test")',
    );
    styleSpreadsheetDataRow(worksheet.addRow([formula, 123.5, true]));
    worksheet.getCell('B3').numFmt = '0.00';
    worksheet.views = [{ state: 'frozen', ySplit: 2 }];
    worksheet.autoFilter = 'A2:C3';
    fitWorksheetColumns(worksheet, [20, 12, 12]);

    const restored = new ExcelJS.Workbook();
    const content = await workbook.xlsx.writeBuffer();
    await restored.xlsx.load(content);
    const sheet = restored.worksheets[0];

    expect(restored.creator).toBe(workbook.creator);
    expect(sheet.getCell('A1').value).toBe('Кампус / Campus');
    expect(sheet.getCell('B1').isMerged).toBe(true);
    expect(sheet.getCell('A2').value).toBe('Назва');
    expect(sheet.getCell('A2').font.bold).toBe(true);
    expect(sheet.getCell('A2').fill).toEqual(
      expect.objectContaining({ type: 'pattern', pattern: 'solid' }),
    );
    expect(sheet.getCell('A3').value).toBe(formula);
    expect(sheet.getCell('A3').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('B3').value).toBe(123.5);
    expect(sheet.getCell('B3').numFmt).toBe('0.00');
    expect(sheet.getCell('C3').value).toBe(true);
    expect(sheet.views[0]).toEqual(
      expect.objectContaining({ state: 'frozen', ySplit: 2 }),
    );
    expect(sheet.autoFilter).toBe('A2:C3');
    expect(sheet.getColumn(1).width).toBeGreaterThanOrEqual(20);
  });

  it('preserves CSV BOM, quoting, Unicode and multiline cells with fast-csv 5', async () => {
    const source = '\uFEFFНазва;Name\r\n"Факультет;КН";"Line 1\nLine 2"\r\n';
    const workbook = new ExcelJS.Workbook();
    const sheet = await workbook.csv.read(Readable.from([source]), {
      parserOptions: { delimiter: ';', ignoreEmpty: true, trim: true },
    });

    expect(sheet.getCell('A1').value).toBe('Назва');
    expect(sheet.getCell('B1').value).toBe('Name');
    expect(sheet.getCell('A2').value).toBe('Факультет;КН');
    expect(sheet.getCell('B2').value).toBe('Line 1\nLine 2');

    const exported = await workbook.csv.writeBuffer({
      formatterOptions: { delimiter: ';' },
    });
    const csv = Buffer.from(exported).toString('utf8');
    expect(csv).toContain('"Факультет;КН"');
    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it('rejects malformed CSV rather than silently importing a truncated row', async () => {
    const workbook = new ExcelJS.Workbook();
    await expect(
      workbook.csv.read(Readable.from(['name\n"unterminated'])),
    ).rejects.toThrow();
  });

  it('preserves archive glob expansion, exclusions and file filtering', () => {
    const loadArchiverDependency = createRequire(
      loadExcelJsDependency.resolve('archiver'),
    );
    const archiveUtils = loadArchiverDependency('archiver-utils') as {
      file: {
        expand(
          options: { cwd: string; filter: string },
          patterns: string[],
        ): string[];
      };
    };
    const directory = mkdtempSync(join(tmpdir(), 'campus-archive-glob-'));
    try {
      writeFileSync(join(directory, 'include.csv'), 'Name\nCampus');
      writeFileSync(join(directory, 'exclude.csv'), 'Name\nOther');
      writeFileSync(join(directory, 'ignore.txt'), 'Other');
      expect(
        archiveUtils.file.expand({ cwd: directory, filter: 'isFile' }, [
          '*.csv',
          '!exclude.csv',
        ]),
      ).toEqual(['include.csv']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('preserves streaming XLSX output and parses every ZIP entry with updated unzipper', async () => {
    const output = new PassThrough();
    const content = readStreamBuffer(output);
    const writer = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: output,
      useSharedStrings: true,
      useStyles: true,
    });
    const worksheet = writer.addWorksheet('Campus');
    worksheet.addRow(['Name', 'Count']).commit();
    worksheet.addRow(['Кампус', 42]).commit();
    await writer.commit();

    const bytes = await content;
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(restored.worksheets[0].name).toBe('Campus');
    expect(restored.worksheets[0].getRow(1).values).toEqual([
      undefined,
      'Name',
      'Count',
    ]);
    expect(restored.worksheets[0].getRow(2).values).toEqual([
      undefined,
      'Кампус',
      42,
    ]);

    const unzipper = loadExcelJsDependency('unzipper') as {
      Parse(options: {
        forceStream: true;
      }): NodeJS.WritableStream & AsyncIterable<ZipEntry>;
    };
    const parser = unzipper.Parse({ forceStream: true });
    Readable.from([bytes]).pipe(parser);
    const parts = new Map<string, string>();
    for await (const entry of parser) {
      parts.set(entry.path, (await entry.buffer()).toString('utf8'));
    }
    expect([...parts.keys()].sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'docProps/app.xml',
        'docProps/core.xml',
        'xl/_rels/workbook.xml.rels',
        'xl/sharedStrings.xml',
        'xl/styles.xml',
        'xl/theme/theme1.xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ].sort(),
    );
    expect(parts.get('xl/workbook.xml')).toContain('Campus');
    expect(parts.get('xl/sharedStrings.xml')).toContain('Кампус');
    expect(parts.get('xl/worksheets/sheet1.xml')).toContain('<v>42</v>');
    expect(parts.has('xl/styles.xml')).toBe(true);
    expect(parts.has('xl/_rels/workbook.xml.rels')).toBe(true);
    expect(parts.has('[Content_Types].xml')).toBe(true);
  });
});
