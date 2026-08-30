import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export interface CreateUserDto {
  fullName: string;
  title: string;
  username: string;
  email: string;
  password: string;
  role?: Role;
  phone?: string;
  directorateId?: string;
}

export interface UpdateUserDto {
  fullName?: string;
  title?: string;
  email?: string;
  phone?: string;
  directorateId?: string;
  role?: Role;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        title: true,
        role: true,
        phone: true,
        directorateId: true,
        directorate: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
            icon: true,
          },
        },
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { directorate: true },
    });
    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }
    const { password, ...result } = user;
    return result;
  }

  async createUser(dto: CreateUserDto) {
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase().trim() },
    });
    if (existingUsername) {
      throw new BadRequestException('اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر');
    }

    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existingEmail) {
      throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        title: dto.title.trim(),
        username: dto.username.toLowerCase().trim(),
        email: dto.email.toLowerCase().trim(),
        password: hashedPassword,
        role: dto.role || Role.DIRECTOR,
        phone: dto.phone?.trim() || null,
        directorateId: dto.directorateId || null,
      },
      include: { directorate: true },
    });

    const { password, ...result } = user;
    return result;
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    if (dto.email && dto.email.toLowerCase().trim() !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase().trim() },
      });
      if (existing) {
        throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName !== undefined ? dto.fullName.trim() : user.fullName,
        title: dto.title !== undefined ? dto.title.trim() : user.title,
        email: dto.email !== undefined ? dto.email.toLowerCase().trim() : user.email,
        phone: dto.phone !== undefined ? dto.phone.trim() : user.phone,
        directorateId: dto.directorateId !== undefined ? dto.directorateId : user.directorateId,
        role: dto.role !== undefined ? dto.role : user.role,
      },
      include: { directorate: true },
    });

    const { password, ...result } = updated;
    return result;
  }

  async adminResetPassword(id: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    if (!newPass || newPass.length < 6) {
      throw new BadRequestException('كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل');
    }

    const hashedPassword = await bcrypt.hash(newPass, 10);

    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { message: 'تم تحديث وتعيين كلمة المرور بنجاح' };
  }

  async changeOwnPassword(userId: string, currentPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    const isMatch = await bcrypt.compare(currentPass, user.password);
    if (!isMatch) {
      throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    }

    if (!newPass || newPass.length < 6) {
      throw new BadRequestException('كلمة المرور الجديدة يجب أن تكون 6 خانات على الأقل');
    }

    const hashedPassword = await bcrypt.hash(newPass, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }
    if (user.role === Role.GENERAL_DIRECTOR) {
      throw new ForbiddenException('لا يمكن حذف حساب المدير العام الرئيسي');
    }

    await this.prisma.user.delete({ where: { id } });
    return { message: 'تم حذف المستخدم بنجاح' };
  }
}
