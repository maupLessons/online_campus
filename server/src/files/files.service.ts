import 'multer';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { File, FileDocument } from './file.schema';
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
      const uploadPath = path.join(__dirname, '..', '..', 'uploads');

      await fs.promises.mkdir(uploadPath, { recursive: true });

      const filePath = path.join(uploadPath, safeFileName);
      await fs.promises.writeFile(filePath, file.buffer);
      writtenFilePath = filePath;
      this.transactionLifecycle.onRollback(() =>
        this.removePhysicalFile(filePath),
      );

      const savedFile = await this.fileModel.create({
        originalName: validatedFile.originalName,
        storagePath: safeFileName,
        mimetype: validatedFile.mimeType,
        size: validatedFile.size,
        uploadedBy: new Types.ObjectId(userId),
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
        },
      });

      return {
        message: 'Файл успішно завантажено',
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
      throw new BadRequestException('Помилка при збереженні файлу');
    }
  }

  async getFileById(fileId: string) {
    if (!Types.ObjectId.isValid(fileId)) {
      throw new BadRequestException('Некоректний ID файлу');
    }

    const file = await this.fileModel.findById(fileId);
    if (!file) {
      throw new NotFoundException('Файл не знайдено');
    }
    return file;
  }

  async getDownloadableFileById(fileId: string, userId: string, role: Role) {
    const file = await this.getFileById(fileId);

    if (!(await this.canAccessFile(file, userId, role))) {
      throw new ForbiddenException('Немає прав для завантаження цього файлу');
    }

    return file;
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
      throw new BadRequestException('Некоректний ID файлу');
    }

    const filter: Record<string, unknown> = {
      _id: { $in: uniqueFileIds.map((fileId) => new Types.ObjectId(fileId)) },
    };

    if (role !== Role.ADMIN) {
      filter.uploadedBy = new Types.ObjectId(userId);
    }

    const availableFilesCount = await this.fileModel
      .countDocuments(filter)
      .exec();

    if (availableFilesCount !== uniqueFileIds.length) {
      throw new ForbiddenException('Немає прав для використання файлу');
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
      throw new ForbiddenException('Немає прав для видалення цього файлу');
    }

    const filePath = path.join(
      __dirname,
      '..',
      '..',
      'uploads',
      file.storagePath,
    );

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

      return { message: 'Файл видалено' };
    } catch {
      throw new BadRequestException('Помилка при видаленні файлу');
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
