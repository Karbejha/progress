import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MarkNotificationsReadDto } from './dto/mark-read.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('read')
  async getReadKeys(@Request() req: any) {
    const readKeys = await this.notificationsService.getReadKeys(req.user.id);
    return { readKeys };
  }

  @Post('read')
  async markRead(@Request() req: any, @Body() dto: MarkNotificationsReadDto) {
    return this.notificationsService.markKeysAsRead(req.user.id, dto.keys || []);
  }

  @Post('mark-all-read')
  async markAllRead(@Request() req: any, @Body() dto: MarkNotificationsReadDto) {
    return this.notificationsService.markKeysAsRead(req.user.id, dto.keys || []);
  }
}
