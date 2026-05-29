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
  CourseAssignment,
  CourseAssignmentDocument,
  Material,
  MaterialDocument,
  Submission,
  SubmissionDocument,
} from '../courses/schemas';
import { User, UserDocument } from '../users/schemas';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';

const ALLOWED_FILE_TYPES = new Map<string, Set<string>>([
  ['.png', new Set(['image/png'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.pdf', new Set(['application/pdf'])],
  ['.doc', new Set(['application/msword'])],
  [
    '.docx',
    new Set([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
  ],
  ['.zip', new Set(['application/zip', 'application/x-zip-compressed'])],
]);

@Injectable()
export class FilesService {
  constructor(
    @InjectModel(File.name) private fileModel: Model<FileDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Material.name) private materialModel: Model<MaterialDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Submission.name)
    private submissionModel: Model<SubmissionDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: Model<CourseAssignmentDocument>,
  ) {}

  async saveFile(file: Express.Multer.File, userId: string) {
    try {
      const correctOriginalName = Buffer.from(
        file.originalname,
        'latin1',
      ).toString('utf8');

      const fileExtension = path.extname(correctOriginalName).toLowerCase();
      const allowedMimeTypes = ALLOWED_FILE_TYPES.get(fileExtension);

      if (!allowedMimeTypes || !allowedMimeTypes.has(file.mimetype)) {
        throw new BadRequestException('Недопустимий тип файлу');
      }

      const safeFileName = `${randomUUID()}${fileExtension}`;
      const uploadPath = path.join(__dirname, '..', '..', 'uploads');

      await fs.promises.mkdir(uploadPath, { recursive: true });

      const filePath = path.join(uploadPath, safeFileName);
      await fs.promises.writeFile(filePath, file.buffer);

      const savedFile = await this.fileModel.create({
        originalName: correctOriginalName,
        storagePath: safeFileName,
        mimetype: file.mimetype,
        size: file.size,
        uploadedBy: new Types.ObjectId(userId),
      });

      return {
        message: 'Файл успішно завантажено',
        fileId: savedFile._id,
        fileLink: `/api/files/download/${savedFile._id.toString()}`,
      };
    } catch (error) {
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

  async deleteFile(fileId: string, userId: string, role: Role) {
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
      try {
        await fs.promises.unlink(filePath);
      } catch (error: unknown) {
        const code = (error as { code?: unknown }).code;
        if (code !== 'ENOENT') {
          throw error;
        }
      }

      await this.fileModel.findByIdAndDelete(fileId);
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

  private async canAccessCourseAssignment(
    courseAssignmentId: string,
    userId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) {
      return true;
    }

    if (
      !Types.ObjectId.isValid(courseAssignmentId) ||
      !Types.ObjectId.isValid(userId)
    ) {
      return false;
    }

    const courseAssignment = await this.courseAssignmentModel
      .findById(courseAssignmentId)
      .select('teacher group')
      .lean()
      .exec();

    if (!courseAssignment) {
      return false;
    }

    if (
      (role === Role.TEACHER || role === Role.DEPARTMENT_HEAD) &&
      toId(courseAssignment.teacher) === userId
    ) {
      return true;
    }

    if (role !== Role.STUDENT) {
      return false;
    }

    const user = await this.userModel
      .findById(userId)
      .select('studentProfile.group')
      .lean()
      .exec();

    return Boolean(
      user?.studentProfile &&
      toId(user.studentProfile.group) === toId(courseAssignment.group),
    );
  }
}
