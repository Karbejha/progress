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
          const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
          cb(null, `${Date.now()}-${uniqueId}${ext}`);
        },
      }),
      limits: {
        fileSize: 25 * 1024 * 1024, // 25 MB max limit
      },
      fileFilter: (req, file, cb) => {
        if (
          file.mimetype === 'application/pdf' ||
          file.originalname.toLowerCase().endsWith('.pdf')
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('يُسمح فقط برفع مستندات رسمية بصيغة PDF'), false);
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
  async getAttachmentMeta(@Param('id') id: string) {
    const { attachment } = await this.attachmentsService.getAttachmentById(id);
    return attachment;
  }

  @Get(':id/download')
  async downloadAttachment(
    @Param('id') id: string,
    @Query('download') isDownload: string,
    @Res() res: Response,
  ) {
    const { attachment, absolutePath } = await this.attachmentsService.getAttachmentById(id);

    if (isDownload === '1' || isDownload === 'true') {
      return res.download(absolutePath, attachment.fileName);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
    );
    return res.sendFile(absolutePath);
  }

  @Delete(':id')
  async deleteAttachment(@Request() req: any, @Param('id') id: string) {
    return this.attachmentsService.deleteAttachment(req.user, id);
  }
}
