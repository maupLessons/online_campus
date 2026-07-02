import 'multer';
import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { File, FileDocument, FileScanStatus } from './file.schema';
import { FILE_SCANNER, FileScanner } from './file-scanner.types';
import {
  Assignment,
  AssignmentDocument,
  Material,
  MaterialDocument,
  Submission,
  SubmissionDocument,
} from '../courses/schemas';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import { DomainAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { TransactionLifecycleService } from '../audit-log/transaction-lifecycle.service';
import { AcademicAccessService } from '../common/access/academic-access.service';
import { validateUploadFile } from './file-upload-validation.util';
import {
  FileErrorCode,
  FileSuccessCode,
  fileBadRequest,
  fileForbidden,
  fileNotFound,
  fileSuccessResponse,
} from './file-errors';

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');
const QUARANTINE_STORAGE_PREFIX = 'quarantine';
const CLEAN_STORAGE_PREFIX = 'clean';

@Injectable()
export class FilesService {
  constructor(
    @InjectModel(File.name) private fileModel: Model<FileDocument>,
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Submission.name)
    private submissionModel: Model<SubmissionDocument>,
    private readonly transactionLifecycle: TransactionLifecycleService,
    private readonly academicAccessService: AcademicAccessService,
    @Inject(FILE_SCANNER) private readonly fileScanner: FileScanner,
  ) {}

  async saveFile(
    file: Express.Multer.File,
    userId: string,
    audit?: DomainAuditContext,
  ) {
    let writtenFilePath: string | undefined;

    try {
      const validatedFile = validateUploadFile(file);

      const safeFileName = this.transactionLifecycle.getOrCreate(
        'files.upload.storage-name',
        () => `${randomUUID()}${validatedFile.extension}`,
      );
      const quarantineStoragePath = path.posix.join(
        QUARANTINE_STORAGE_PREFIX,
        safeFileName,
      );
      const cleanStoragePath = path.posix.join(
        CLEAN_STORAGE_PREFIX,
        safeFileName,
      );
      const quarantinePath = this.resolveStoredFilePath(quarantineStoragePath);
      const cleanPath = this.resolveStoredFilePath(cleanStoragePath);

      await fs.promises.mkdir(path.dirname(quarantinePath), {
        recursive: true,
      });
      await fs.promises.mkdir(path.dirname(cleanPath), { recursive: true });

      await fs.promises.writeFile(quarantinePath, file.buffer);
      writtenFilePath = quarantinePath;
      this.transactionLifecycle.onRollback(async () => {
        await this.removePhysicalFile(quarantinePath);
        await this.removePhysicalFile(cleanPath);
      });

      const scanResult = await this.fileScanner.scan({
        filePath: quarantinePath,
        originalName: validatedFile.originalName,
        mimeType: validatedFile.mimeType,
        size: validatedFile.size,
      });

      if (scanResult.status !== FileScanStatus.CLEAN) {
        await this.removePhysicalFile(quarantinePath);
        writtenFilePath = undefined;
        throw fileBadRequest(FileErrorCode.SCAN_REJECTED);
      }

      await fs.promises.rename(quarantinePath, cleanPath);
      writtenFilePath = cleanPath;

      const savedFile = await this.fileModel.create({
        originalName: validatedFile.originalName,
        storagePath: cleanStoragePath,
        mimetype: validatedFile.mimeType,
        size: validatedFile.size,
        uploadedBy: new Types.ObjectId(userId),
        scanStatus: FileScanStatus.CLEAN,
        scanProvider: scanResult.provider,
        scannedAt: new Date(),
      });

      await audit?.record({
        action: AUDIT_ACTIONS.FILE_UPLOAD,
        targetEntity: 'file',
        targetId: toId(savedFile._id),
        details: {
          originalName: validatedFile.originalName,
          extension: validatedFile.extension,
          mimeType: validatedFile.mimeType,
          sizeBytes: validatedFile.size,
          scanStatus: FileScanStatus.CLEAN,
          scanProvider: scanResult.provider,
        },
      });

      return {
        ...fileSuccessResponse(FileSuccessCode.UPLOAD_SUCCESS),
        fileId: savedFile._id,
        fileLink: `/api/files/download/${savedFile._id.toString()}`,
      };
    } catch (error) {
      if (writtenFilePath) {
        await fs.promises.unlink(writtenFilePath).catch(() => undefined);
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw fileBadRequest(FileErrorCode.SAVE_FAILED);
    }
  }

  async getFileById(fileId: string) {
    if (!Types.ObjectId.isValid(fileId)) {
      throw fileBadRequest(FileErrorCode.INVALID_ID);
    }

    const file = await this.fileModel.findById(fileId);
    if (!file) {
      throw fileNotFound(FileErrorCode.NOT_FOUND);
    }
    return file;
  }

  async getDownloadableFileById(fileId: string, userId: string, role: Role) {
    const file = await this.getFileById(fileId);

    this.assertFileIsClean(file);

    if (!(await this.canAccessFile(file, userId, role))) {
      throw fileForbidden(FileErrorCode.DOWNLOAD_FORBIDDEN);
    }

    return file;
  }

  getPhysicalPath(file: FileDocument): string {
    return this.resolveStoredFilePath(file.storagePath);
  }

  async assertFilesCanBeAttached(
    fileIds: string[] | undefined,
    userId: string,
    role: Role,
  ) {
    const uniqueFileIds = [...new Set(fileIds ?? [])];
    if (uniqueFileIds.length === 0) {
      return;
    }

    if (
      uniqueFileIds.some((fileId) => !Types.ObjectId.isValid(fileId)) ||
      !Types.ObjectId.isValid(userId)
    ) {
      throw fileBadRequest(FileErrorCode.INVALID_ID);
    }

    const filter: Record<string, unknown> = {
      _id: { $in: uniqueFileIds.map((fileId) => new Types.ObjectId(fileId)) },
      $or: [
        { scanStatus: FileScanStatus.CLEAN },
        { scanStatus: { $exists: false } },
      ],
    };

    if (role !== Role.ADMIN) {
      filter.uploadedBy = new Types.ObjectId(userId);
    }

    const availableFilesCount = await this.fileModel
      .countDocuments(filter)
      .exec();

    if (availableFilesCount !== uniqueFileIds.length) {
      throw fileForbidden(FileErrorCode.ATTACH_FORBIDDEN);
    }
  }

  async deleteFile(
    fileId: string,
    userId: string,
    role: Role,
    audit?: DomainAuditContext,
  ) {
    const file = await this.getFileById(fileId);

    if (role !== Role.ADMIN && file.uploadedBy.toString() !== userId) {
      throw fileForbidden(FileErrorCode.DELETE_FORBIDDEN);
    }

    const filePath = this.resolveStoredFilePath(file.storagePath);

    try {
      await this.fileModel.findByIdAndDelete(fileId);
      await audit?.record({
        action: AUDIT_ACTIONS.FILE_DELETE,
        targetEntity: 'file',
        targetId: fileId,
        details: {
          originalName: file.originalName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedBy: toId(file.uploadedBy),
        },
      });

      const deferred = this.transactionLifecycle.onCommit(() =>
        this.removePhysicalFile(filePath),
      );
      if (!deferred) {
        await this.removePhysicalFile(filePath);
      }

      return fileSuccessResponse(FileSuccessCode.DELETE_SUCCESS);
    } catch {
      throw fileBadRequest(FileErrorCode.DELETE_FAILED);
    }
  }

  private async canAccessFile(file: FileDocument, userId: string, role: Role) {
    if (role === Role.ADMIN || toId(file.uploadedBy) === userId) {
      return true;
    }

    const fileId = new Types.ObjectId(toId(file._id));

    const materials = await this.materialModel
      .find({ files: fileId } as never)
      .select('courseAssignment')
      .lean()
      .exec();

    for (const material of materials) {
      if (
        await this.canAccessCourseAssignment(
          toId(material.courseAssignment),
          userId,
          role,
        )
      ) {
        return true;
      }
    }

    const assignments = await this.assignmentModel
      .find({ files: fileId } as never)
      .select('courseAssignment')
      .lean()
      .exec();

    for (const assignment of assignments) {
      if (
        await this.canAccessCourseAssignment(
          toId(assignment.courseAssignment),
          userId,
          role,
        )
      ) {
        return true;
      }
    }

    const submissions = await this.submissionModel
      .find({ files: fileId } as never)
      .select('student assignment')
      .lean()
      .exec();

    for (const submission of submissions) {
      if (role === Role.STUDENT && toId(submission.student) === userId) {
        return true;
      }

      const submittedAssignment = await this.assignmentModel
        .findById(submission.assignment)
        .select('courseAssignment')
        .lean()
        .exec();

      if (
        role !== Role.STUDENT &&
        submittedAssignment &&
        (await this.canAccessCourseAssignment(
          toId(submittedAssignment.courseAssignment),
          userId,
          role,
        ))
      ) {
        return true;
      }
    }

    return false;
  }

  private assertFileIsClean(file: FileDocument): void {
    if (
      file.scanStatus === undefined ||
      file.scanStatus === FileScanStatus.CLEAN
    ) {
      return;
    }

    if (file.scanStatus === FileScanStatus.PENDING_SCAN) {
      throw fileForbidden(FileErrorCode.PENDING_SCAN);
    }

    throw fileForbidden(FileErrorCode.REJECTED_BY_SCAN);
  }

  private resolveStoredFilePath(storagePath: string): string {
    const normalized = storagePath.replace(/\\/g, '/');
    const segments = normalized.split('/');

    if (
      !normalized ||
      path.isAbsolute(normalized) ||
      segments.some(
        (segment) => !segment || segment === '.' || segment === '..',
      )
    ) {
      throw fileBadRequest(FileErrorCode.INVALID_STORAGE_PATH);
    }

    const root = path.resolve(UPLOADS_ROOT);
    const resolved = path.resolve(root, ...segments);
    if (resolved !== root && resolved.startsWith(`${root}${path.sep}`)) {
      return resolved;
    }

    throw fileBadRequest(FileErrorCode.INVALID_STORAGE_PATH);
  }

  private async removePhysicalFile(filePath: string): Promise<void> {
    try {
      await fs.promises.unlink(filePath);
    } catch (error: unknown) {
      const code = (error as { code?: unknown }).code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async canAccessCourseAssignment(
    courseAssignmentId: string,
    userId: string,
    role: Role,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      return false;
    }

    if (
      role !== Role.ADMIN &&
      role !== Role.STUDENT &&
      role !== Role.TEACHER &&
      role !== Role.DEPARTMENT_HEAD
    ) {
      return false;
    }

    return this.academicAccessService.canAccessCourseAssignment(
      courseAssignmentId,
      {
        sub: userId,
        login: '',
        role,
      },
    );
  }
}
