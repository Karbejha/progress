import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionPayload, isCurrentAuthSession } from './auth-session';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'ports_super_secret_jwt_key_2026_executive_followup',
    });
  }

  async validate(payload: AuthSessionPayload) {
    if (!isCurrentAuthSession(payload)) {
      throw new UnauthorizedException('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        directorate: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('المستخدم غير موجود أو انتهت صلاحية الجلسة');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('هذا الحساب معطل، يرجى مراجعة المدير العام');
    }

    return user;
  }
}
