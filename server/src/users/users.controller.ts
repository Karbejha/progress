import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Roles(Role.GENERAL_DIRECTOR)
  @Post()
  createUser(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto);
  }

  @Roles(Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Roles(Role.GENERAL_DIRECTOR)
  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }

  @Roles(Role.GENERAL_DIRECTOR)
  @Patch(':id/reset-password')
  adminResetPassword(@Param('id') id: string, @Body('newPassword') newPass: string) {
    return this.usersService.adminResetPassword(id, newPass);
  }

  @Post('change-my-password')
  changeOwnPassword(
    @Request() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.usersService.changeOwnPassword(
      req.user.id,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Roles(Role.GENERAL_DIRECTOR)
  @Delete(':id')
  deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
