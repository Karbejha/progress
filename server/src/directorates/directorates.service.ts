import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { activeDirectorateWhere } from '../common/active-directorates';

@Injectable()
export class DirectoratesService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.directorate.findMany({
      where: includeInactive ? {} : activeDirectorateWhere,
      orderBy: { displayOrder: 'asc' },
      include: {
        users: {
          where: includeInactive ? {} : { isActive: true },
          select: {
            id: true,
            fullName: true,
            title: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const directorate = await this.prisma.directorate.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });
    if (!directorate) {
      throw new NotFoundException('المديرية غير موجودة');
    }
    return directorate;
  }

  async remove(id: string) {
    const directorate = await this.prisma.directorate.findUnique({
      where: { id },
    });
    if (!directorate) {
      throw new NotFoundException('المديرية غير موجودة');
    }
    await this.prisma.directorate.delete({ where: { id } });
    return { message: 'تم حذف المديرية بنجاح' };
  }
}
