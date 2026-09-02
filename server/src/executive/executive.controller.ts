import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ExecutiveService, GiveFeedbackDto, CreateAnnouncementDto } from './executive.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('executive')
export class ExecutiveController {
  constructor(private readonly executiveService: ExecutiveService) {}

  @Roles(Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR)
  @Get('overview')
  getDailyOverview(@Query('date') dateStr?: string) {
    return this.executiveService.getDailyOverview(dateStr);
  }

  @Roles(Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR)
  @Get('directorates/:id')
  getDirectorateDetails(@Param('id') id: string, @Query('date') dateStr?: string) {
    return this.executiveService.getDirectorateDetails(id, dateStr);
  }

  @Roles(Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR)
  @Post('feedback')
  giveFeedback(@Request() req: any, @Body() dto: GiveFeedbackDto) {
    return this.executiveService.giveFeedback(req.user, dto);
  }

  @Get('announcements')
  getAnnouncements(@Request() req: any) {
    return this.executiveService.getAnnouncements(req.user);
  }

  @Post('announcements/:id/read')
  markAnnouncementAsRead(@Request() req: any, @Param('id') id: string) {
    return this.executiveService.markAnnouncementAsRead(req.user, id);
  }

  @Roles(Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR)
  @Get('announcements/:id/readers')
  getAnnouncementReaders(@Request() req: any, @Param('id') id: string) {
    return this.executiveService.getAnnouncementReaders(req.user, id);
  }

  @Roles(Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR)
  @Post('announcements')
  createAnnouncement(@Request() req: any, @Body() dto: CreateAnnouncementDto) {
    return this.executiveService.createAnnouncement(req.user, dto);
  }
}
