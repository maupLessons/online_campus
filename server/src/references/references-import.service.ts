import {
  BadRequestException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as ExcelJS from 'exceljs';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Readable } from 'stream';
import { Role } from '../common/types/roles.enum';
import { User, UserDocument } from '../users/schemas';
import {
  CreateClassroomDto,
  CreateDepartmentDto,
  CreateFacultyDto,
  CreateGroupDto,
  CreateSpecialtyDto,
} from './dto';
import { Classroom, Department, Faculty, Group, Specialty } from './schemas';
import {
  ReferenceImportError,
  ReferenceImportMode,
  ReferenceImportResult,
  ReferenceType,
} from './reference.types';

const MAX_IMPORT_ROWS = 1000;

type ImportRecord = Record<string, string>;
type ReferenceImportPayload = Record<string, unknown>;

type PreparedRow = {
  row: number;
  filter: Record<string, unknown>;
  payload: ReferenceImportPayload;
};

const IMPORT_HEADERS: Record<ReferenceType, string[]> = {
  [ReferenceType.FACULTIES]: ['name', 'deanLogin'],
  [ReferenceType.DEPARTMENTS]: ['name', 'facultyName', 'headLogin'],
  [ReferenceType.SPECIALTIES]: ['code', 'name'],
  [ReferenceType.GROUPS]: ['code', 'specialtyCode', 'course', 'curatorLogin'],
  [ReferenceType.CLASSROOMS]: ['building', 'roomNumber', 'capacity', 'type'],
};

const IMPORT_HEADER_ALIASES: Record<ReferenceType, Record<string, string>> = {
  [ReferenceType.FACULTIES]: {
    name: 'name',
    назва: 'name',
    deanlogin: 'deanLogin',
    'dean login': 'deanLogin',
    'логін декана': 'deanLogin',
    deanname: 'deanName',
    dean: 'deanName',
    декан: 'deanName',
  },
  [ReferenceType.DEPARTMENTS]: {
    name: 'name',
    назва: 'name',
    facultyname: 'facultyName',
    faculty: 'facultyName',
    факультет: 'facultyName',
    headlogin: 'headLogin',
    'department head login': 'headLogin',
    'логін завідувача': 'headLogin',
    headname: 'headName',
    'department head': 'headName',
    'завідувач кафедри': 'headName',
  },
  [ReferenceType.SPECIALTIES]: {
    code: 'code',
    код: 'code',
    name: 'name',
    назва: 'name',
  },
  [ReferenceType.GROUPS]: {
    code: 'code',
    код: 'code',
    specialtycode: 'specialtyCode',
    'specialty code': 'specialtyCode',
    'код спеціальності': 'specialtyCode',
    specialtyname: 'specialtyName',
    specialty: 'specialtyName',
    спеціальність: 'specialtyName',
    course: 'course',
    курс: 'course',
    curatorlogin: 'curatorLogin',
    'curator login': 'curatorLogin',
    'логін куратора': 'curatorLogin',
    curatorname: 'curatorName',
    curator: 'curatorName',
    куратор: 'curatorName',
  },
  [ReferenceType.CLASSROOMS]: {
    building: 'building',
    корпус: 'building',
    roomnumber: 'roomNumber',
    room: 'roomNumber',
    аудиторія: 'roomNumber',
    capacity: 'capacity',
    місткість: 'capacity',
    type: 'type',
    тип: 'type',
  },
};

@Injectable()
export class ReferencesImportService {
  private readonly useRequestTransaction: boolean;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    configService: ConfigService,
    @InjectModel(Faculty.name)
    private readonly facultyModel: Model<Faculty>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
    @InjectModel(Specialty.name)
    private readonly specialtyModel: Model<Specialty>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<Group>,
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<Classroom>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {
    this.useRequestTransaction = this.readBooleanFlag(
      configService.get<string>('AUDIT_TRANSACTIONAL_OUTBOX'),
      configService.get<string>('NODE_ENV') === 'production',
    );
  }

  async import(
    type: ReferenceType,
    file: Express.Multer.File,
    dryRun: boolean,
    mode: ReferenceImportMode,
  ): Promise<ReferenceImportResult> {
    const records = await this.parseFile(type, file);
    if (records.length === 0) {
      throw new BadRequestException('Import file does not contain data rows');
    }
    if (records.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `Import is limited to ${MAX_IMPORT_ROWS} rows`,
      );
    }

    this.assertHeaders(type, records[0]);
    const errors: ReferenceImportError[] = [];
    const prepared: PreparedRow[] = [];
    const seenUniqueKeys = new Set<string>();
    let created = 0;
    let updated = 0;

    for (let index = 0; index < records.length; index += 1) {
      const rowNumber = index + 2;
      try {
        const item = await this.prepareRow(type, records[index], rowNumber);
        const uniqueKey = this.uniqueKey(item.filter);
        if (seenUniqueKeys.has(uniqueKey)) {
          throw new BadRequestException(
            'The import file contains a duplicate unique record',
          );
        }
        seenUniqueKeys.add(uniqueKey);
        const exists = await this.exists(type, item.filter);
        if (exists && mode === ReferenceImportMode.CREATE) {
          throw new BadRequestException(
            'A record with the same unique fields already exists',
          );
        }
        if (exists) {
          updated += 1;
        } else {
          created += 1;
        }
        prepared.push(item);
      } catch (error: unknown) {
        errors.push({
          row: rowNumber,
          message:
            error instanceof Error ? error.message : 'Invalid import row',
        });
      }
    }

    const result: ReferenceImportResult = {
      dryRun,
      mode,
      totalRows: records.length,
      validRows: prepared.length,
      created,
      updated,
      errors,
    };
    if (dryRun || errors.length > 0) {
      return result;
    }

    if (this.useRequestTransaction) {
      await this.persistRows(type, mode, prepared);
    } else {
      await this.connection.transaction((session) =>
        this.persistRows(type, mode, prepared, session),
      );
    }

    return result;
  }

  private async prepareRow(
    type: ReferenceType,
    row: ImportRecord,
    rowNumber: number,
  ): Promise<PreparedRow> {
    switch (type) {
      case ReferenceType.FACULTIES: {
        const dean = row.deanLogin
          ? await this.resolveUser(row.deanLogin, [Role.DEAN], rowNumber)
          : undefined;
        const payload = await this.validateDto(CreateFacultyDto, {
          name: row.name,
          dean: dean ?? null,
        });
        return { row: rowNumber, filter: { name: payload.name }, payload };
      }
      case ReferenceType.DEPARTMENTS: {
        const faculty = await this.facultyModel
          .findOne({ name: row.facultyName })
          .select('_id')
          .lean()
          .exec();
        if (!faculty) {
          throw new BadRequestException(
            `Unknown facultyName: ${row.facultyName}`,
          );
        }
        const head = row.headLogin
          ? await this.resolveUser(
              row.headLogin,
              [Role.DEPARTMENT_HEAD],
              rowNumber,
            )
          : undefined;
        const payload = await this.validateDto(CreateDepartmentDto, {
          name: row.name,
          faculty: faculty._id.toString(),
          head: head ?? null,
        });
        return {
          row: rowNumber,
          filter: { name: payload.name, faculty: faculty._id },
          payload,
        };
      }
      case ReferenceType.SPECIALTIES: {
        const payload = await this.validateDto(CreateSpecialtyDto, {
          code: row.code,
          name: row.name,
        });
        return { row: rowNumber, filter: { code: payload.code }, payload };
      }
      case ReferenceType.GROUPS: {
        const specialty = await this.specialtyModel
          .findOne({ code: row.specialtyCode.toUpperCase() })
          .select('_id')
          .lean()
          .exec();
        if (!specialty) {
          throw new BadRequestException(
            `Unknown specialtyCode: ${row.specialtyCode}`,
          );
        }
        const curator = row.curatorLogin
          ? await this.resolveUser(
              row.curatorLogin,
              [Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN],
              rowNumber,
            )
          : undefined;
        const payload = await this.validateDto(CreateGroupDto, {
          code: row.code,
          specialty: specialty._id.toString(),
          course: row.course,
          curator: curator ?? null,
        });
        return { row: rowNumber, filter: { code: payload.code }, payload };
      }
      case ReferenceType.CLASSROOMS: {
        const payload = await this.validateDto(CreateClassroomDto, {
          building: row.building,
          roomNumber: row.roomNumber,
          capacity: row.capacity,
          type: row.type,
        });
        return {
          row: rowNumber,
          filter: {
            building: payload.building,
            roomNumber: payload.roomNumber,
          },
          payload,
        };
      }
    }
  }

  private async validateDto<T extends object>(
    dtoClass: new () => T,
    value: Record<string, unknown>,
  ): Promise<T & ReferenceImportPayload> {
    const instance = plainToInstance(dtoClass, value);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const messages = errors.flatMap((error) =>
        Object.values(error.constraints ?? {}),
      );
      throw new BadRequestException(messages.join('; '));
    }
    return { ...instance } as T & ReferenceImportPayload;
  }

  private async resolveUser(
    login: string,
    allowedRoles: Role[],
    rowNumber: number,
  ): Promise<string> {
    const user = await this.userModel
      .findOne({ login: login.trim(), status: 'active' })
      .select('_id role')
      .lean()
      .exec();
    if (!user || !allowedRoles.includes(user.role)) {
      throw new BadRequestException(
        `Invalid user ${login} at row ${rowNumber}: expected active ${allowedRoles.join(', ')}`,
      );
    }
    return user._id.toString();
  }

  private async exists(
    type: ReferenceType,
    filter: Record<string, unknown>,
  ): Promise<boolean> {
    return Boolean(await this.modelFor(type).exists(filter));
  }

  private modelFor(type: ReferenceType): Model<ReferenceImportPayload> {
    switch (type) {
      case ReferenceType.FACULTIES:
        return this.facultyModel as unknown as Model<ReferenceImportPayload>;
      case ReferenceType.DEPARTMENTS:
        return this.departmentModel as unknown as Model<ReferenceImportPayload>;
      case ReferenceType.SPECIALTIES:
        return this.specialtyModel as unknown as Model<ReferenceImportPayload>;
      case ReferenceType.GROUPS:
        return this.groupModel as unknown as Model<ReferenceImportPayload>;
      case ReferenceType.CLASSROOMS:
        return this.classroomModel as unknown as Model<ReferenceImportPayload>;
    }
  }

  private assertHeaders(type: ReferenceType, firstRow: ImportRecord): void {
    const available = new Set(Object.keys(firstRow));
    const missing = IMPORT_HEADERS[type].filter(
      (header) => !available.has(header),
    );
    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'Import file has missing columns',
        missing,
        expected: IMPORT_HEADERS[type],
      });
    }
  }

  private async parseFile(
    type: ReferenceType,
    file: Express.Multer.File,
  ): Promise<ImportRecord[]> {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (extension === 'xlsx') {
      if (
        file.buffer.length < 4 ||
        file.buffer[0] !== 0x50 ||
        file.buffer[1] !== 0x4b
      ) {
        throw new BadRequestException('Invalid XLSX file signature');
      }
      return this.parseXlsx(type, file.buffer);
    }
    if (extension === 'csv') {
      const isUtf16Le =
        file.buffer.length >= 2 &&
        file.buffer[0] === 0xff &&
        file.buffer[1] === 0xfe;
      if (!isUtf16Le && file.buffer.includes(0)) {
        throw new BadRequestException('CSV file contains binary data');
      }
      return this.parseCsv(type, file.buffer);
    }
    throw new UnsupportedMediaTypeException(
      'Only .csv and .xlsx reference imports are supported',
    );
  }

  private async parseXlsx(
    type: ReferenceType,
    buffer: Buffer,
  ): Promise<ImportRecord[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('XLSX workbook has no worksheets');
    }
    if (worksheet.rowCount > MAX_IMPORT_ROWS + 2) {
      throw new BadRequestException(
        `Import is limited to ${MAX_IMPORT_ROWS} rows`,
      );
    }
    return this.worksheetRecords(type, worksheet);
  }

  private async parseCsv(
    type: ReferenceType,
    buffer: Buffer,
  ): Promise<ImportRecord[]> {
    const text = this.decodeCsv(buffer);
    if (text.includes('\uFFFD')) {
      throw new BadRequestException('CSV must be encoded as UTF-8 or UTF-16LE');
    }
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delimiter = firstLine.includes(';') ? ';' : ',';
    const workbook = new ExcelJS.Workbook();
    const worksheet = await workbook.csv.read(
      Readable.from([Buffer.from(text, 'utf8')]),
      {
        parserOptions: {
          delimiter,
          ignoreEmpty: true,
          trim: true,
        },
      },
    );
    return this.worksheetRecords(type, worksheet);
  }

  private worksheetRecords(
    type: ReferenceType,
    worksheet: ExcelJS.Worksheet,
  ): ImportRecord[] {
    const matrix: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      matrix.push(values.map((value) => this.cellText(value)));
    });
    if (matrix[0]?.[0]?.toLowerCase().startsWith('sep=')) {
      matrix.shift();
    }
    const headers = (matrix.shift() ?? []).map((value) =>
      this.canonicalHeader(type, value),
    );
    if (headers.length === 0 || headers.some((header) => !header)) {
      throw new BadRequestException('Import file requires a header row');
    }
    if (new Set(headers).size !== headers.length) {
      throw new BadRequestException('Import headers must be unique');
    }
    return matrix
      .filter((row) => row.some((value) => value.trim() !== ''))
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [header, (row[index] ?? '').trim()]),
        ),
      );
  }

  private decodeCsv(buffer: Buffer): string {
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer
        .subarray(2)
        .toString('utf16le')
        .replace(/^\uFEFF/, '');
    }
    return buffer.toString('utf8').replace(/^\uFEFF/, '');
  }

  private canonicalHeader(type: ReferenceType, value: string): string {
    const normalized = value.trim().toLocaleLowerCase('uk-UA');
    return IMPORT_HEADER_ALIASES[type][normalized] ?? value.trim();
  }

  private cellText(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }
    if (typeof value === 'object') {
      if ('formula' in value) {
        throw new BadRequestException(
          'Formula cells are not allowed in reference imports',
        );
      }
      if ('text' in value) return String(value.text);
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText
          .map((part) => (typeof part.text === 'string' ? part.text : ''))
          .join('');
      }
      if ('error' in value && typeof value.error === 'string') {
        return value.error;
      }
    }
    return '';
  }

  private uniqueKey(filter: Record<string, unknown>): string {
    return Object.entries(filter)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          return `${key}:${String(value)}`;
        }
        if (value instanceof Types.ObjectId) {
          return `${key}:${value.toHexString()}`;
        }
        return `${key}:`;
      })
      .join('|');
  }

  private async persistRows(
    type: ReferenceType,
    mode: ReferenceImportMode,
    rows: PreparedRow[],
    session?: ClientSession,
  ): Promise<void> {
    const model = this.modelFor(type);
    for (const item of rows) {
      if (mode === ReferenceImportMode.CREATE) {
        await model.create([{ ...item.payload }], { session });
      } else {
        await model
          .updateOne(
            item.filter,
            { $set: item.payload },
            { upsert: true, runValidators: true, session },
          )
          .exec();
      }
    }
  }

  private readBooleanFlag(
    value: string | undefined,
    fallback: boolean,
  ): boolean {
    if (value === undefined) return fallback;
    return ['1', 'true', 'yes'].includes(value.toLowerCase());
  }
}
