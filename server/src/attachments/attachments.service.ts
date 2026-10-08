import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { attachmentMimeType, MAX_ATTACHMENT_SIZE, removeAttachmentFiles } from './attachment-files';

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

    let mimeType: string;
    try {
      mimeType = attachmentMimeType(file, category);
      if (file.size === 0 || file.size > MAX_ATTACHMENT_SIZE) {
        throw new BadRequestException('يجب أن يكون الملف غير فارغ وألا يتجاوز حجمه 25 ميغابايت');
      }
    } catch (error) {
      await removeAttachmentFiles([{ fileUrl: file.path }]);
      throw error;
    }

    // Decode Arabic UTF-8 filename if needed
    let cleanFileName = file.originalname;
    try {
      const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
      if (!decoded.includes('\uFFFD') && !/[^\u0000-\u00FF]/.test(file.originalname)) cleanFileName = decoded;
    } catch {
      cleanFileName = file.originalname;
    }

    const relativePath = path.relative(process.cwd(), file.path).replace(/\\/g, '/');

    try {
      return await this.prisma.attachment.create({
        data: {
          fileName: cleanFileName,
          fileUrl: relativePath,
          fileSize: file.size,
          mimeType,
          category,
          uploadedById: user.id,
        },
      });
    } catch (error) {
      await removeAttachmentFiles([{ fileUrl: relativePath }]);
      throw error;
    }
  }

  async getAttachmentById(id: string, user: any) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, fullName: true, title: true, role: true } },
        todo: { select: { userId: true } },
      },
    });

    if (!attachment) {
      throw new NotFoundException('المرفق غير موجود');
    }

    if ((attachment.category === 'TODO' || attachment.todoId) &&
        (attachment.todo?.userId || attachment.uploadedById) !== user.id) {
      throw new ForbiddenException('ليس لديك صلاحية الوصول إلى مرفقات هذه المهمة الشخصية');
    }

    const absolutePath = path.resolve(process.cwd(), attachment.fileUrl);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('ملف المستند غير موجود على الخادم');
    }

    return { attachment, absolutePath };
  }

  async deleteAttachment(user: any, id: string, onlyUnlinked = false) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException('المرفق غير موجود');
    }

    if (attachment.category === 'TODO' && attachment.uploadedById !== user.id) {
      throw new ForbiddenException('ليس لديك صلاحية حذف هذا المرفق الشخصي');
    }

    const isExecutive =
      user.role === 'GENERAL_DIRECTOR' || user.role === 'ASSISTANT_DIRECTOR';

    if (attachment.uploadedById !== user.id && !isExecutive) {
      throw new ForbiddenException('ليس لديك صلاحية حذف هذا المرفق');
    }

    if (onlyUnlinked) {
      const deleted = await this.prisma.attachment.deleteMany({
        where: { id, uploadedById: user.id, todoId: null, announcementId: null, dailySummaryId: null, executiveTaskId: null },
      });
      if (!deleted.count) throw new ForbiddenException('المرفق مرتبط بمهمة محفوظة');
    } else {
      await this.prisma.attachment.delete({ where: { id } });
    }
    await removeAttachmentFiles([attachment]);

    return { success: true, id };
  }
}
