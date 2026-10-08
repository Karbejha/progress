import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { DirectoratesService } from './directorates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('directorates')
export class DirectoratesController {
  constructor(private readonly directoratesService: DirectoratesService) {}

  @Get()
  findAll() {
    return this.directoratesService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.directoratesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.GENERAL_DIRECTOR)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.directoratesService.remove(id);
  }
}

