import { BadRequestException, Controller, Get, Post, Body, UseGuards, Request, Query, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MarkNotificationsReadDto } from './dto/mark-read.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeviceTokenDto, RegisterDeviceTokenDto } from './dto/device-token.dto';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getUserNotifications(@Request() req: any, @Query('limit') limit?: string) {
    if (limit !== undefined && (!/^\d+$/.test(limit) || Number(limit) < 1)) {
      throw new BadRequestException('limit must be a positive integer');
    }
    const parsedLimit = limit === undefined ? 150 : Number(limit);
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
    if (!Number.isFinite(sinceDate.getTime())) {
      throw new BadRequestException('since must be a valid date');
    }
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

  @Get('push-status')
  async getPushStatus(@Request() req: any) {
    return this.notificationsService.getPushStatus(req.user.id);
  }

  /**
   * POST /notifications/register-device
   * Register an FCM push token for the current user's device.
   * Used for sending push notifications when the app is in the background.
   */
  @Post('register-device')
  async registerDevice(
    @Request() req: any,
    @Body() body: RegisterDeviceTokenDto,
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
    @Body() body: DeviceTokenDto,
  ) {
    return this.notificationsService.unregisterDeviceToken(req.user.id, body.token);
  }

  @Get(':id')
  async getNotification(@Request() req: any, @Param('id') id: string) {
    return this.notificationsService.getNotification(req.user.id, id);
  }
}
