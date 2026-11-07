import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { AUTH_SESSION_VERSION } from './auth-session';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(emailOrUsername: string, pass: string): Promise<any> {
    if (typeof emailOrUsername !== 'string' || !emailOrUsername.trim() ||
        typeof pass !== 'string' || !pass) {
      return null;
    }

    const identifier = emailOrUsername.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
      include: {
        directorate: true,
      },
    });

    if (user && (await bcrypt.compare(pass, user.password))) {
      if (!user.isActive) {
        throw new UnauthorizedException('هذا الحساب معطل، يرجى مراجعة المدير العام');
      }
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto?.usernameOrEmail, loginDto?.password);

    if (!user) {
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('هذا الحساب معطل، يرجى مراجعة المدير العام');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      directorateId: user.directorateId,
      sessionVersion: AUTH_SESSION_VERSION,
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
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        title: true,
        role: true,
        isActive: true,
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
