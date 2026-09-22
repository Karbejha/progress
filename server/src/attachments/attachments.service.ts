import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AttachmentsService {
  private uploadDir = path.resolve(process.cwd(), 'uploads', 'attachments');

  constructor(private prisma: PrismaService) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async saveUploadedFile(user: any, file: Express.Multer.File, category: string = 'GENERAL') {
    if (!file) {
      throw new BadRequestException('لم يتم استلام أي ملف');
    }

    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw new BadRequestException('يُسمح فقط برفع مستندات رسمية بصيغة PDF');
    }

    // Decode Arabic UTF-8 filename if needed
    let cleanFileName = file.originalname;
    try {
      cleanFileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch {
      cleanFileName = file.originalname;
    }

    const relativePath = path.relative(process.cwd(), file.path).replace(/\\/g, '/');

    const attachment = await this.prisma.attachment.create({
      data: {
        fileName: cleanFileName,
        fileUrl: relativePath,
        fileSize: file.size,
        mimeType: 'application/pdf',
        category,
        uploadedById: user.id,
      },
    });

    return attachment;
  }

  async getAttachmentById(id: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, fullName: true, title: true, role: true } },
      },
    });

    if (!attachment) {
      throw new NotFoundException('المرفق غير موجود');
    }

    const absolutePath = path.resolve(process.cwd(), attachment.fileUrl);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('ملف المستند غير موجود على الخادم');
    }

    return { attachment, absolutePath };
  }

  async deleteAttachment(user: any, id: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException('المرفق غير موجود');
    }

    const isExecutive =
      user.role === 'GENERAL_DIRECTOR' || user.role === 'ASSISTANT_DIRECTOR';

    if (attachment.uploadedById !== user.id && !isExecutive) {
      throw new ForbiddenException('ليس لديك صلاحية حذف هذا المرفق');
    }

    const absolutePath = path.resolve(process.cwd(), attachment.fileUrl);
    if (fs.existsSync(absolutePath)) {
      try {
        fs.unlinkSync(absolutePath);
      } catch (err) {
        console.warn('Could not remove physical file from disk', err);
      }
    }

    await this.prisma.attachment.delete({
      where: { id },
    });

    return { success: true, id };
  }
}
