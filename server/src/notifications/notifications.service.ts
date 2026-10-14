import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Notification, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Messaging } from 'firebase-admin/messaging';
import { EventsGateway } from '../events/events.gateway';

type NotificationData = {
  type: string;
  title: string;
  message: string;
  referenceId?: string;
  metadata?: any;
};

type PushPayload = { title: string; body: string; data?: Record<string, string> };

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private messagingPromise?: Promise<Messaging | null>;

  constructor(private readonly prisma: PrismaService, private readonly eventsGateway: EventsGateway) {}

  async onModuleInit() {
    // Historical plans do not record whether they were silent autosaves. Replaying
    // them on every boot invents alerts and races when several API workers start.
    if (process.env.NOTIFICATION_HISTORY_BACKFILL === 'true') {
      this.autoBackfillHistoricalNotifications().catch((err) => {
        this.logger.error('Error during automatic notifications backfill:', err);
      });
    }
  }

  /**
   * Create a single notification for a specific user.
   */
  async createNotification(data: NotificationData & { userId: string }) {
    try {
      const notif = await this.prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          referenceId: data.referenceId || null,
          metadata: data.metadata || null,
        },
      });

      this.dispatchNotification(notif);

      return notif;
    } catch (error) {
      this.logger.error(`Failed to create notification for user ${data.userId}:`, error);
      throw error;
    }
  }

  private async createNotificationsForUsers(users: { id: string }[], data: NotificationData) {
    const uniqueIds = [...new Set(users.map((user) => user.id))];
    if (!uniqueIds.length) return;
    const createdAt = new Date();
    const notifications = uniqueIds.map((userId) => ({
      id: randomUUID(), userId, type: data.type, title: data.title, message: data.message,
      referenceId: data.referenceId || null, metadata: data.metadata || null, createdAt,
    }));
    // Assign IDs before the batch insert so socket and push carry the exact saved IDs.
    await this.prisma.notification.createMany({ data: notifications });
    for (const notification of notifications) this.dispatchNotification(notification);
  }

  private dispatchNotification(notification: Notification) {
    try {
      this.eventsGateway.emitNotificationCreated(notification.userId, notification);
    } catch (error) {
      this.logger.warn('Persisted notification could not be delivered over its socket');
    }
    this.sendPushToUser(notification.userId, this.notificationPushPayload(notification)).catch(() => {
      this.logger.warn('Persisted notification push delivery failed');
    });
  }

  private notificationPushPayload(notification: Notification): PushPayload {
    // FCM limits the full message to 4 KB. Detail is always available from its saved ID.
    const truncate = (value: string, maxBytes: number) => {
      let result = '';
      let bytes = 0;
      for (const character of value) {
        const size = Buffer.byteLength(character, 'utf8');
        if (bytes + size > maxBytes) break;
        result += character;
        bytes += size;
      }
      return result;
    };
    const title = truncate(notification.title, 200);
    const body = truncate(notification.message, 800);
    const data: Record<string, string> = {
      id: notification.id, notificationId: notification.id, userId: notification.userId,
      type: notification.type, referenceId: notification.referenceId || '',
      title, message: body, createdAt: notification.createdAt.toISOString(),
    };
    if (notification.metadata) {
      const metadata = JSON.stringify(notification.metadata);
      if (Buffer.byteLength(metadata, 'utf8') <= 700) data.metadata = metadata;
    }
    return { title, body, data };
  }

  /**
   * Create notifications for all users with specific roles.
   * Optionally exclude a specific user (e.g., the author).
   */
  async createNotificationForRoles(
    roles: Role[],
    data: {
      type: string;
      title: string;
      message: string;
      referenceId?: string;
      metadata?: any;
    },
    excludeUserId?: string,
  ) {
    try {
      const users = await this.prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: roles },
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
        select: { id: true },
      });

      await this.createNotificationsForUsers(users, data);
    } catch (error) {
      this.logger.error(`Failed to create notifications for roles ${roles.join(',')}:`, error);
      throw error;
    }
  }

  /**
   * Create notifications for all users in a specific directorate.
   */
  async createNotificationForDirectorate(
    directorateId: string,
    data: {
      type: string;
      title: string;
      message: string;
      referenceId?: string;
      metadata?: any;
    },
    excludeUserId?: string,
  ) {
    try {
      const users = await this.prisma.user.findMany({
        where: {
          isActive: true,
          directorateId,
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
        select: { id: true },
      });

      await this.createNotificationsForUsers(users, data);
    } catch (error) {
      this.logger.error(`Failed to create notifications for directorate ${directorateId}:`, error);
      throw error;
    }
  }

  /**
   * Create notifications for all users EXCEPT those in specific roles.
   * Useful for announcements (notify everyone except the author).
   */
  async createNotificationForAllUsers(
    data: {
      type: string;
      title: string;
      message: string;
      referenceId?: string;
      metadata?: any;
    },
    excludeUserId?: string,
  ) {
    try {
      const users = await this.prisma.user.findMany({
        where: { isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
        select: { id: true },
      });

      await this.createNotificationsForUsers(users, data);
    } catch (error) {
      this.logger.error(`Failed to create notifications for all users:`, error);
      throw error;
    }
  }

  /**
   * Get notifications for a specific user, ordered by most recent first.
   * Returns up to `limit` notifications (default 150).
   */
  async getUserNotifications(userId: string, limit = 150) {
    if (!userId) return [];

    try {
      return await this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 150,
      });
    } catch (error) {
      this.logger.error(`Failed to get notifications for user ${userId}:`, error);
      throw error;
    }
  }

  async getNotification(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { userId, id } });
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  /**
   * Get notifications created AFTER a specific timestamp for a user.
   * Used by mobile app background recovery to catch up on missed notifications.
   */
  async getNotificationsSince(userId: string, since: Date) {
    if (!userId) return [];
    if (!Number.isFinite(since.getTime())) throw new BadRequestException('Invalid notification recovery date');

    try {
      return await this.prisma.notification.findMany({
        where: {
          userId,
          createdAt: { gt: since },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(`Failed to get notifications since ${since.toISOString()} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Register an FCM device token for push notifications.
   * Stores the token in the DeviceToken table, upserting to avoid duplicates.
   */
  async registerDeviceToken(userId: string, token: string, platform = 'android') {
    if (!userId || typeof token !== 'string' || !/^\S+$/.test(token) || token.length > 4096) {
      throw new BadRequestException('A valid device token is required');
    }
    if (!['android', 'ios', 'web'].includes(platform)) throw new BadRequestException('Invalid device platform');
    // A physical installation belongs only to the currently signed-in user.
    // Token uniqueness in the schema prevents concurrent registrations sharing it.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Serialize account transfers for one physical installation. Prisma's
          // composite upsert may read an old owner while another transfer deletes it.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${token}, 0))`;
          await tx.deviceToken.deleteMany({ where: { token, userId: { not: userId } } });
          await tx.deviceToken.upsert({
            where: { userId_token: { userId, token } },
            create: { userId, token, platform },
            update: { platform },
          });
        });
        return { success: true };
      } catch (error) {
        if (attempt < 2 && ['P2002', 'P2025', 'P2034'].includes(error.code)) continue;
        this.logger.error('Device token registration failed');
        throw error;
      }
    }
  }

  /**
   * Remove a device token (e.g., on user logout).
   */
  async unregisterDeviceToken(userId: string, token: string) {
    if (!userId || !token) {
      return { success: false, message: 'Missing userId or token' };
    }

    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { success: true };
  }

  /**
   * Send a push notification to all devices registered to a specific user via FCM.
   * This is a no-op if Firebase Admin is not configured.
   * Uses dynamic import to avoid crashes if firebase-admin is not installed.
   */
  protected getMessagingClient(): Promise<Messaging | null> {
    if (!this.messagingPromise) this.messagingPromise = this.initializeMessaging();
    return this.messagingPromise;
  }

  private async initializeMessaging(): Promise<Messaging | null> {
    try {
      const { getApps, getApp, initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
      const { getMessaging } = await import('firebase-admin/messaging');
      // The legacy admin.apps property was removed in Firebase Admin v14.
      if (getApps().some((app) => app.name === '[DEFAULT]')) return getMessaging(getApp());
      const fs = await import('fs');
      const path = await import('path');
      const explicitPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const candidates = explicitPath ? [path.resolve(explicitPath)] : [
        path.resolve(process.cwd(), 'firebase-service-account.json'),
        path.resolve(process.cwd(), 'server/firebase-service-account.json'),
        path.resolve(__dirname, '../../firebase-service-account.json'),
      ];
      const accountPath = candidates.find((candidate) => fs.existsSync(candidate));
      if (explicitPath && !accountPath) {
        this.logger.warn('Firebase credential path is unavailable; push delivery disabled');
        return null;
      }
      if (accountPath) {
        const serviceAccount = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
        const app = initializeApp({ credential: cert(serviceAccount) });
        this.logger.log('Firebase Admin initialized for push notifications');
        return getMessaging(app);
      }
      // Application default credentials support hosts with a Google-managed identity.
      if (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG) {
        return getMessaging(initializeApp({ credential: applicationDefault() }));
      }
      this.logger.warn('Firebase credentials are not configured; push delivery disabled');
      return null;
    } catch {
      // Credential contents and private-key parse errors must not be logged.
      this.logger.error('Firebase Admin initialization failed; check server credential configuration');
      return null;
    }
  }

  async getPushStatus(userId: string) {
    const [messaging, tokens] = await Promise.all([
      this.getMessagingClient(),
      this.prisma.deviceToken.findMany({ where: { userId }, select: { platform: true } }),
    ]);
    return {
      serverConfigured: Boolean(messaging),
      registeredDevices: tokens.length,
      platforms: [...new Set(tokens.map((token) => token.platform))],
    };
  }

  async sendPushToUser(userId: string, payload: PushPayload) {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId, user: { isActive: true } }, select: { token: true, platform: true },
    });
    if (!tokens.length) return;
    const messaging = await this.getMessagingClient();
    if (!messaging) return;
    await Promise.all(tokens.map(async ({ token }) => {
      try {
        await messaging.send({
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data || {},
          android: {
            priority: 'high',
            notification: {
              channelId: 'ports_urgent', priority: 'max', defaultSound: true,
              defaultVibrateTimings: true, icon: 'ic_stat_notification', color: '#0c3e35',
            },
          },
          apns: {
            headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
            payload: { aps: { sound: 'default' } },
          },
          webpush: { notification: { icon: '/pwa-icon.png' } },
        });
      } catch (error) {
        if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error.code)) {
          await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
        } else {
          // Include the code only: upstream error details may contain the token or payload.
          this.logger.error(`FCM delivery failed for user ${userId} (${error.code || 'unknown'})`);
        }
      }
    }));
  }

  /**
   * Send push notifications to all users with specific roles.
   */
  async sendPushToRoles(roles: string[], payload: { title: string; body: string; data?: Record<string, string> }, excludeUserId?: string) {
    try {
      const users = await this.prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: roles as any },
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
        select: { id: true },
      });

      for (const user of users) {
        this.sendPushToUser(user.id, payload).catch(() => {});
      }
    } catch (error) {
      this.logger.debug(`Push to roles skipped: ${error.message}`);
    }
  }

  /**
   * Send push notifications to all users in a specific directorate.
   */
  async sendPushToDirectorate(directorateId: string, payload: { title: string; body: string; data?: Record<string, string> }, excludeUserId?: string) {
    try {
      const users = await this.prisma.user.findMany({
        where: {
          isActive: true,
          directorateId,
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
        select: { id: true },
      });

      for (const user of users) {
        this.sendPushToUser(user.id, payload).catch(() => {});
      }
    } catch (error) {
      this.logger.debug(`Push to directorate skipped: ${error.message}`);
    }
  }

  /**
   * Send push notifications to a list of specific user IDs.
   */
  async sendPushToMultipleUsers(userIds: string[], payload: { title: string; body: string; data?: Record<string, string> }) {
    if (!userIds || userIds.length === 0) return;
    try {
      const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
      for (const userId of uniqueIds) {
        this.sendPushToUser(userId, payload).catch(() => {});
      }
    } catch (error: any) {
      this.logger.debug(`Push to multiple users skipped: ${error.message}`);
    }
  }


  /**
   * Returns all notification keys read by the given user from the database.
   * Merges keys from NotificationRead table and AnnouncementRead table.
   */
  async getReadKeys(userId: string): Promise<string[]> {
    if (!userId) return [];
    const [rows, announcementReads] = await Promise.all([
      this.prisma.notificationRead.findMany({ where: { userId }, select: { notificationKey: true } }),
      this.prisma.announcementRead.findMany({ where: { userId }, select: { announcementId: true } }),
    ]);
    return [...new Set([...rows.map((row) => row.notificationKey), ...announcementReads.map((row) => row.announcementId)])];
  }

  async markKeysAsRead(userId: string, keys: string[]) {
    const uniqueKeys = [...new Set((keys || []).map((key) => String(key).trim()).filter(Boolean))];
    if (!userId || !uniqueKeys.length) {
      return { success: true, count: 0, readKeys: userId ? await this.getReadKeys(userId) : [] };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.notificationRead.createMany({
        data: uniqueKeys.map((notificationKey) => ({ userId, notificationKey })), skipDuplicates: true,
      });
      // The bell uses persisted notification IDs. Resolve them to announcement IDs
      // so announcement read indicators agree with the bell on every device.
      const notifications = await tx.notification.findMany({
        where: { userId, id: { in: uniqueKeys }, type: 'announcement' }, select: { referenceId: true },
      });
      const announcementIds = [...new Set([...uniqueKeys, ...notifications.map((row) => row.referenceId).filter(Boolean)])];
      const announcements = await tx.announcement.findMany({ where: { id: { in: announcementIds } }, select: { id: true } });
      if (announcements.length) {
        await tx.announcementRead.createMany({
          data: announcements.map((announcement) => ({ userId, announcementId: announcement.id })), skipDuplicates: true,
        });
      }
    });
    const readKeys = await this.getReadKeys(userId);
    try {
      this.eventsGateway.emitNotificationsRead(userId, readKeys);
    } catch {
      this.logger.warn('Notification read state saved; socket synchronization unavailable');
    }
    return { success: true, count: uniqueKeys.length, readKeys };
  }

  /**
   * Automatically scans existing entities (Daily Plans, Summaries, Feedbacks, Announcements, Executive Tasks)
   * and creates notification records if they do not already exist.
   */
  async autoBackfillHistoricalNotifications() {
    try {
      this.logger.log('Checking and backfilling historical notifications...');

      const recentThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const execUsers = await this.prisma.user.findMany({
        where: { role: { in: [Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR, Role.OBSERVER] } },
        select: { id: true, role: true },
      });

      if (execUsers.length === 0) return;

      // 1. Daily Plans (Recent 7 days only)
      const plans = await this.prisma.dailyPlan.findMany({
        where: { createdAt: { gte: recentThreshold } },
        include: { directorate: true, tasks: true },
        orderBy: { createdAt: 'desc' },
      });

      for (const p of plans) {
        const dateStr = p.planDate.toISOString().split('T')[0];
        const refId = `plan-sub-${p.directorateId}-${dateStr}`;

        for (const exec of execUsers) {
          const exists = await this.prisma.notification.findFirst({
            where: { userId: exec.id, referenceId: refId },
            select: { id: true },
          });
          if (!exists) {
            await this.prisma.notification.create({
              data: {
                userId: exec.id,
                type: 'plan',
                title: 'رفع خطة صباحية',
                message: `قامت (${p.directorate.name}) باعتماد ورفع خطة اليوم (${p.tasks.length} مهام).`,
                referenceId: refId,
                metadata: {
                  directorateId: p.directorateId,
                  directorateName: p.directorate.name,
                  tasksCount: p.tasks.length,
                  planDate: p.planDate.toISOString(),
                },
                createdAt: p.createdAt,
              },
            });
          }
        }
      }

      // 2. Daily Summaries (Recent 7 days only)
      const summaries = await this.prisma.dailySummary.findMany({
        where: { createdAt: { gte: recentThreshold } },
        include: { directorate: true, user: true },
        orderBy: { createdAt: 'desc' },
      });

      for (const s of summaries) {
        const dateStr = s.summaryDate.toISOString().split('T')[0];
        const refId = `summary-sub-${s.directorateId}-${dateStr}`;

        for (const exec of execUsers) {
          const exists = await this.prisma.notification.findFirst({
            where: { userId: exec.id, referenceId: refId },
            select: { id: true },
          });
          if (!exists) {
            await this.prisma.notification.create({
              data: {
                userId: exec.id,
                type: 'summary',
                title: 'تسليم ملخص الإنجاز',
                message: `سلّمت (${s.directorate.name}) ملخص نهاية الدوام بنسبة إنجاز ${s.overallCompletionRate}%.`,
                referenceId: refId,
                metadata: {
                  directorateId: s.directorateId,
                  directorateName: s.directorate.name,
                  directorName: s.user?.fullName,
                  overallCompletionRate: s.overallCompletionRate,
                  urgentFlag: s.urgentFlag,
                },
                createdAt: s.createdAt,
              },
            });
          }
        }
      }

      // 3. Executive Feedbacks & Replies (Recent 7 days only)
      const feedbacks = await this.prisma.executiveFeedback.findMany({
        where: { createdAt: { gte: recentThreshold } },
        include: { directorate: true, fromUser: true },
        orderBy: { createdAt: 'desc' },
      });

      for (const f of feedbacks) {
        const refId = f.id;
        const isDirectorReply = f.fromUser.role === Role.DIRECTOR;

        if (isDirectorReply) {
          for (const exec of execUsers) {
            const exists = await this.prisma.notification.findFirst({
              where: { userId: exec.id, referenceId: refId },
              select: { id: true },
            });
            if (!exists) {
              await this.prisma.notification.create({
                data: {
                  userId: exec.id,
                  type: 'feedback',
                  title: `رد وتوضيح من ${f.fromUser.fullName} (${f.directorate.name})`,
                  message: f.feedbackText,
                  referenceId: refId,
                  metadata: {
                    feedbackId: f.id,
                    fromUserId: f.fromUserId,
                    fromUserName: f.fromUser.fullName,
                    fromUserTitle: f.fromUser.title,
                    fromRole: f.fromUser.role,
                    directorateId: f.directorateId,
                    directorateName: f.directorate.name,
                    dailyPlanId: f.dailyPlanId,
                    isReply: true,
                  },
                  createdAt: f.createdAt,
                },
              });
            }
          }
        } else {
          const dirUsers = await this.prisma.user.findMany({
            where: { directorateId: f.directorateId },
            select: { id: true },
          });
          for (const du of dirUsers) {
            const exists = await this.prisma.notification.findFirst({
              where: { userId: du.id, referenceId: refId },
              select: { id: true },
            });
            if (!exists) {
              await this.prisma.notification.create({
                data: {
                  userId: du.id,
                  type: 'feedback',
                  title: 'توجيه من المدير العام',
                  message: f.feedbackText,
                  referenceId: refId,
                  metadata: {
                    feedbackId: f.id,
                    fromUserName: f.fromUser.fullName,
                    fromUserTitle: f.fromUser.title,
                    feedbackText: f.feedbackText,
                    rating: f.rating,
                  },
                  createdAt: f.createdAt,
                },
              });
            }
          }
        }
      }

      // 4. Announcements (Recent 7 days only)
      const announcements = await this.prisma.announcement.findMany({
        where: { createdAt: { gte: recentThreshold } },
        include: { author: true },
        orderBy: { createdAt: 'desc' },
      });

      const allUsers = await this.prisma.user.findMany({ select: { id: true } });
      for (const ann of announcements) {
        for (const u of allUsers) {
          if (u.id === ann.authorId) continue;
          const exists = await this.prisma.notification.findFirst({
            where: { userId: u.id, referenceId: ann.id },
            select: { id: true },
          });
          if (!exists) {
            await this.prisma.notification.create({
              data: {
                userId: u.id,
                type: 'announcement',
                title: 'تعميم إداري رسمي',
                message: ann.title,
                referenceId: ann.id,
                metadata: {
                  announcementId: ann.id,
                  content: ann.content,
                  authorName: ann.author?.fullName,
                  authorTitle: ann.author?.title,
                  priority: ann.priority,
                },
                createdAt: ann.createdAt,
              },
            });
          }
        }
      }

      // 5. Executive Tasks (Recent 7 days only)
      const execTasks = await this.prisma.executiveTask.findMany({
        where: { createdAt: { gte: recentThreshold } },
        include: { directorate: true, assignedBy: true },
        orderBy: { createdAt: 'desc' },
      });

      for (const et of execTasks) {
        const dirUsers = await this.prisma.user.findMany({
          where: { directorateId: et.directorateId },
          select: { id: true },
        });
        for (const du of dirUsers) {
          const refId = `exec-task-${et.id}`;
          const exists = await this.prisma.notification.findFirst({
            where: { userId: du.id, referenceId: refId },
            select: { id: true },
          });
          if (!exists) {
                const isShared = !!et.sharedGroupId;
                await this.prisma.notification.create({
                  data: {
                    userId: du.id,
                    type: 'executive-task',
                    title: isShared ? 'تكليف مشترك من المدير العام' : 'تكليف من المدير العام',
                    message: `وردك تكليف من المدير العام: "${et.title}"`,
                    referenceId: refId,
                    metadata: {
                      taskId: et.id,
                      taskTitle: et.title,
                      description: et.description,
                      priority: et.priority,
                      assignedByName: et.assignedBy?.fullName,
                      directorateId: et.directorateId,
                      directorateName: et.directorate.name,
                      isShared,
                    },
                    createdAt: et.createdAt,
                  },
                });
          }
        }
      }

      this.logger.log('Historical notifications backfill completed successfully.');
    } catch (err) {
      this.logger.error('Failed to backfill historical notifications:', err);
    }
  }
}
