import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(emailOrUsername: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: emailOrUsername.toLowerCase() },
          { username: emailOrUsername.toLowerCase() },
        ],
      },
      include: {
        directorate: true,
      },
    });

    if (user && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: { usernameOrEmail: string; password?: string; directUserId?: string }) {
    let user: any;

    if (loginDto.directUserId) {
      user = await this.prisma.user.findUnique({
        where: { id: loginDto.directUserId },
        include: { directorate: true },
      });
    } else {
      user = await this.validateUser(loginDto.usernameOrEmail, loginDto.password || '');
    }

    if (!user) {
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      directorateId: user.directorateId,
    };

    const token = this.jwtService.sign(payload);
    const { password, ...userWithoutPassword } = user;

    return {
      access_token: token,
      user: userWithoutPassword,
    };
  }

  async getAllUsersForSwitch() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        title: true,
        role: true,
        directorateId: true,
        directorate: {
          select: {
            id: true,
            code: true,
            name: true,
            icon: true,
            category: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { fullName: 'asc' },
      ],
    });
  }
}
