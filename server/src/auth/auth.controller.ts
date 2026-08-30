import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { usernameOrEmail: string; password?: string; directUserId?: string }) {
    return this.authService.login(body);
  }

  @Get('users')
  async getAllUsers() {
    return this.authService.getAllUsersForSwitch();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: any) {
    const { password, ...user } = req.user;
    return user;
  }
}
