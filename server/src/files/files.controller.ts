import {
  Controller,
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  UseGuards,
  Req,
  Get,
  Param,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import { ApiConsumes, ApiBody, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Role } from '../common/types/roles.enum';
import { AuditLogService } from '../audit-log/audit-log.service';
import { createAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { AuditEvent } from '../audit-log/audit.decorator';
import { RequestWithId } from '../common/middleware/request-id.middleware';

const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024;

interface AuthenticatedFileRequest extends RequestWithId {
  user: {
    sub: string;
    login: string;
    role: Role;
  };
}

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post('upload')
  @AuditEvent(AUDIT_ACTIONS.FILE_UPLOAD, 'file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_FILE_SIZE_BYTES }),
          new FileTypeValidator({
            fileType:
              /^(image\/png|image\/jpeg|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/zip|application\/x-zip-compressed)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Req() req: AuthenticatedFileRequest,
  ) {
    return this.filesService.saveFile(
      file,
      req.user.sub,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Get('download/:id')
  async downloadFile(
    @Param('id') id: string,
    @Req() req: AuthenticatedFileRequest,
    @Res() res: Response,
  ) {
    const fileInfo = await this.filesService.getDownloadableFileById(
      id,
      req.user.sub,
      req.user.role,
    );

    const filePath = path.join(
      __dirname,
      '..',
      '..',
      'uploads',
      fileInfo.storagePath,
    );

    const encodedFileName = encodeURIComponent(fileInfo.originalName);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodedFileName}`,
    );
    res.type(fileInfo.mimetype || 'application/octet-stream');

    return res.sendFile(filePath, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(404).send('Файл фізично не знайдено на сервері');
        }
      }
    });
  }

  @Delete(':id')
  @AuditEvent(AUDIT_ACTIONS.FILE_DELETE, 'file')
  async removeFile(
    @Param('id') id: string,
    @Req() req: AuthenticatedFileRequest,
  ) {
    return this.filesService.deleteFile(
      id,
      req.user.sub,
      req.user.role,
      createAuditContext(req, this.auditLogService),
    );
  }
}
