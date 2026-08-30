import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DirectoratesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.directorate.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        users: {
          select: {
            id: true,
            fullName: true,
            title: true,
            email: true,
            role: true,
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
}
