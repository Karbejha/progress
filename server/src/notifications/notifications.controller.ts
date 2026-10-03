import { Controller, Get, Post, Body, UseGuards, Request, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MarkNotificationsReadDto } from './dto/mark-read.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getUserNotifications(@Request() req: any, @Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 150;
    return this.notificationsService.getUserNotifications(req.user.id, parsedLimit);
  }

  /**
   * GET /notifications/since?since=ISO_DATE
   * Returns notifications created after a specific timestamp.
   * Used by the mobile app to recover missed notifications when returning from background.
   */
  @Get('since')
  async getNotificationsSince(@Request() req: any, @Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 60 * 1000); // default: last 30 min
    return this.notificationsService.getNotificationsSince(req.user.id, sinceDate);
  }

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

  /**
   * POST /notifications/register-device
   * Register an FCM push token for the current user's device.
   * Used for sending push notifications when the app is in the background.
   */
  @Post('register-device')
  async registerDevice(
    @Request() req: any,
    @Body() body: { token: string; platform?: string },
  ) {
    return this.notificationsService.registerDeviceToken(
      req.user.id,
      body.token,
      body.platform || 'android',
    );
  }

  /**
   * POST /notifications/unregister-device
   * Remove an FCM push token (e.g., on logout).
   */
  @Post('unregister-device')
  async unregisterDevice(
    @Request() req: any,
    @Body() body: { token: string },
  ) {
    return this.notificationsService.unregisterDeviceToken(req.user.id, body.token);
  }
}
