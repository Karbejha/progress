import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AttachmentsService } from './attachments.service';
import { randomUUID } from 'crypto';
import { attachmentMimeType, MAX_ATTACHMENT_SIZE } from './attachment-files';

const uploadStorageDir = path.resolve(process.cwd(), 'uploads', 'attachments');
if (!fs.existsSync(uploadStorageDir)) {
  fs.mkdirSync(uploadStorageDir, { recursive: true });
}

@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          cb(null, uploadStorageDir);
        },
        filename: (req, file, cb) => {
          const uniqueId = randomUUID();
          const ext = path.extname(file.originalname).toLowerCase();
          cb(null, `${Date.now()}-${uniqueId}${ext}`);
        },
      }),
      limits: {
        fileSize: MAX_ATTACHMENT_SIZE,
      },
      fileFilter: (req, file, cb) => {
        try {
          attachmentMimeType(file, typeof req.query.category === 'string' ? req.query.category : undefined);
          cb(null, true);
        } catch (error) {
          cb(error, false);
        }
      },
    }),
  )
  async uploadFile(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('category') category?: string,
  ) {
    if (!file) {
      throw new BadRequestException('لم يتم استلام أي ملف');
    }
    return this.attachmentsService.saveUploadedFile(req.user, file, category);
  }

  @Get(':id')
  async getAttachmentMeta(@Request() req: any, @Param('id') id: string) {
    const { attachment } = await this.attachmentsService.getAttachmentById(id, req.user);
    return attachment;
  }

  @Get(':id/download')
  async downloadAttachment(
    @Request() req: any,
    @Param('id') id: string,
    @Query('download') isDownload: string,
    @Res() res: Response,
  ) {
    const { attachment, absolutePath } = await this.attachmentsService.getAttachmentById(id, req.user);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');

    const canPreview = attachment.mimeType === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp'].includes(attachment.mimeType);
    if (isDownload === '1' || isDownload === 'true' || !canPreview) {
      return res.download(absolutePath, attachment.fileName);
    }

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
    );
    return res.sendFile(absolutePath);
  }

  @Delete(':id')
  async deleteAttachment(@Request() req: any, @Param('id') id: string, @Query('onlyUnlinked') onlyUnlinked?: string) {
    return this.attachmentsService.deleteAttachment(req.user, id, onlyUnlinked === '1');
  }
}
