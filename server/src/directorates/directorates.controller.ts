import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DirectoratesService } from './directorates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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
}
