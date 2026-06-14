import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  buildSpreadsheetCsv,
  createSpreadsheetWorkbook,
  fitWorksheetColumns,
  styleSpreadsheetDataRow,
  styleSpreadsheetHeaderRow,
} from '../common/utils/spreadsheet-export.util';
import { User, UserDocument } from '../users/schemas';
import { ReferencesAdminService } from './references-admin.service';
import { ReferenceExportLocale, ReferenceType } from './reference.types';

type ExportRow = Record<string, string | number>;

type ExportColumn = {
  key: string;
  headers: Record<ReferenceExportLocale, string>;
  minWidth: number;
};

const EXPORT_COLUMNS: Record<ReferenceType, ExportColumn[]> = {
  [ReferenceType.FACULTIES]: [
    {
      key: 'name',
      headers: { uk: 'Назва', en: 'Name' },
      minWidth: 36,
    },
    {
      key: 'deanLogin',
      headers: { uk: 'Логін декана', en: 'Dean login' },
      minWidth: 24,
    },
    {
      key: 'deanName',
      headers: { uk: 'Декан', en: 'Dean' },
      minWidth: 36,
    },
  ],
  [ReferenceType.DEPARTMENTS]: [
    {
      key: 'name',
      headers: { uk: 'Назва', en: 'Name' },
      minWidth: 40,
    },
    {
      key: 'facultyName',
      headers: { uk: 'Факультет', en: 'Faculty' },
      minWidth: 36,
    },
    {
      key: 'headLogin',
      headers: { uk: 'Логін завідувача', en: 'Department head login' },
      minWidth: 24,
    },
    {
      key: 'headName',
      headers: { uk: 'Завідувач кафедри', en: 'Department head' },
      minWidth: 36,
    },
  ],
  [ReferenceType.SPECIALTIES]: [
    {
      key: 'code',
      headers: { uk: 'Код', en: 'Code' },
      minWidth: 20,
    },
    {
      key: 'name',
      headers: { uk: 'Назва', en: 'Name' },
      minWidth: 48,
    },
  ],
  [ReferenceType.GROUPS]: [
    {
      key: 'code',
      headers: { uk: 'Код', en: 'Code' },
      minWidth: 20,
    },
    {
      key: 'specialtyCode',
      headers: { uk: 'Код спеціальності', en: 'Specialty code' },
      minWidth: 22,
    },
    {
      key: 'specialtyName',
      headers: { uk: 'Спеціальність', en: 'Specialty' },
      minWidth: 44,
    },
    {
      key: 'course',
      headers: { uk: 'Курс', en: 'Course' },
      minWidth: 12,
    },
    {
      key: 'curatorLogin',
      headers: { uk: 'Логін куратора', en: 'Curator login' },
      minWidth: 24,
    },
    {
      key: 'curatorName',
      headers: { uk: 'Куратор', en: 'Curator' },
      minWidth: 36,
    },
  ],
  [ReferenceType.CLASSROOMS]: [
    {
      key: 'building',
      headers: { uk: 'Корпус', en: 'Building' },
      minWidth: 28,
    },
    {
      key: 'roomNumber',
      headers: { uk: 'Аудиторія', en: 'Room' },
      minWidth: 18,
    },
    {
      key: 'capacity',
      headers: { uk: 'Місткість', en: 'Capacity' },
      minWidth: 14,
    },
    {
      key: 'type',
      headers: { uk: 'Тип', en: 'Type' },
      minWidth: 18,
    },
  ],
};

@Injectable()
export class ReferencesExportService {
  constructor(
    private readonly adminService: ReferencesAdminService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async toCsv(
    type: ReferenceType,
    locale: ReferenceExportLocale,
  ): Promise<Buffer> {
    const rows = await this.getRows(type);
    const columns = EXPORT_COLUMNS[type];
    const csvRows = [
      columns.map((column) => column.headers[locale]),
      ...rows.map((row) => columns.map((column) => row[column.key])),
    ];
    return Buffer.from(buildSpreadsheetCsv(csvRows), 'utf8');
  }

  async toXlsx(
    type: ReferenceType,
    locale: ReferenceExportLocale,
  ): Promise<Buffer> {
    const rows = await this.getRows(type);
    const columns = EXPORT_COLUMNS[type];
    const workbook = createSpreadsheetWorkbook();
    const worksheet = workbook.addWorksheet(
      locale === ReferenceExportLocale.UK ? 'Довідник' : 'References',
      { views: [{ state: 'frozen', ySplit: 1 }] },
    );

    worksheet.columns = columns.map((column) => ({
      header: column.headers[locale],
      key: column.key,
      width: column.minWidth,
    }));
    styleSpreadsheetHeaderRow(worksheet.getRow(1));
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
    rows.forEach((row) => worksheet.addRow(row));
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) styleSpreadsheetDataRow(row);
      row.alignment = {
        ...row.alignment,
        vertical: 'top',
        horizontal: 'left',
      };
    });
    fitWorksheetColumns(
      worksheet,
      columns.map((column) => column.minWidth),
    );

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async getRows(type: ReferenceType): Promise<ExportRow[]> {
    const records = await this.adminService.getAll(type);
    const userLogins = await this.loadUserLogins(records);
    return records.map((record): ExportRow => {
      const source = record as unknown as Record<string, unknown>;
      switch (type) {
        case ReferenceType.FACULTIES:
          return {
            name: this.text(source.name),
            deanLogin: this.userLogin(source.dean, userLogins),
            deanName: this.userName(source.dean),
          };
        case ReferenceType.DEPARTMENTS:
          return {
            name: this.text(source.name),
            facultyName: this.referenceText(source.faculty, 'name'),
            headLogin: this.userLogin(source.head, userLogins),
            headName: this.userName(source.head),
          };
        case ReferenceType.SPECIALTIES:
          return {
            code: this.text(source.code),
            name: this.text(source.name),
          };
        case ReferenceType.GROUPS:
          return {
            code: this.text(source.code),
            specialtyCode: this.referenceText(source.specialty, 'code'),
            specialtyName: this.referenceText(source.specialty, 'name'),
            course: Number(source.course ?? 0),
            curatorLogin: this.userLogin(source.curator, userLogins),
            curatorName: this.userName(source.curator),
          };
        case ReferenceType.CLASSROOMS:
          return {
            building: this.text(source.building),
            roomNumber: this.text(source.roomNumber),
            capacity: Number(source.capacity ?? 0),
            type: this.text(source.type),
          };
      }
    });
  }

  private async loadUserLogins(
    records: unknown[],
  ): Promise<Map<string, string>> {
    const ids = new Set<string>();
    records.forEach((record) => {
      const source = record as Record<string, unknown>;
      [source.dean, source.head, source.curator].forEach((value) => {
        const id = this.referenceText(value, 'id');
        if (Types.ObjectId.isValid(id)) ids.add(id);
      });
    });
    if (ids.size === 0) return new Map();

    const users = await this.userModel
      .find({ _id: { $in: [...ids].map((id) => new Types.ObjectId(id)) } })
      .select('_id login')
      .lean()
      .exec();
    return new Map(users.map((user) => [user._id.toString(), user.login]));
  }

  private referenceText(value: unknown, key: string): string {
    if (!value || typeof value !== 'object') return '';
    return this.text((value as Record<string, unknown>)[key]);
  }

  private userLogin(value: unknown, userLogins: Map<string, string>): string {
    return userLogins.get(this.referenceText(value, 'id')) ?? '';
  }

  private userName(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const user = value as Record<string, unknown>;
    return [user.lastName, user.firstName, user.middleName]
      .map((item) => this.text(item))
      .filter(Boolean)
      .join(' ');
  }

  private text(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }
    return '';
  }
}
