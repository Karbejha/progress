import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Non-blocking table check for DeviceToken
    this.ensureDeviceTokenTable().catch((err) => {
      this.logger.warn('Error verifying DeviceToken table:', err);
    });

    // Non-blocking auto-backfill on module initialization
    this.autoBackfillHistoricalNotifications().catch((err) => {
      this.logger.error('Error during automatic notifications backfill:', err);
    });
  }

  private async ensureDeviceTokenTable() {
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "DeviceToken" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "token" TEXT NOT NULL,
          "platform" TEXT NOT NULL DEFAULT 'android',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "DeviceToken_userId_token_key" UNIQUE ("userId", "token")
        );
        CREATE INDEX IF NOT EXISTS "DeviceToken_userId_idx" ON "DeviceToken"("userId");
      `);
      this.logger.log('DeviceToken table verified successfully');
    } catch (err: any) {
      this.logger.debug(`DeviceToken table check skipped or already configured: ${err.message}`);
    }
  }

  /**
   * Create a single notification for a specific user.
   */
  async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    referenceId?: string;
    metadata?: any;
  }) {
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

      // Send push notification to user's mobile device via FCM
      this.sendPushToUser(data.userId, {
        title: data.title,
        body: data.message,
        data: {
          type: data.type,
          referenceId: data.referenceId || '',
          notificationId: notif.id,
        },
      }).catch((err) => {
        this.logger.debug(`Push notification failed: ${err.message}`);
      });

      return notif;
    } catch (error) {
      this.logger.error(`Failed to create notification for user ${data.userId}:`, error);
    }
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
          role: { in: roles },
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
        select: { id: true },
      });

      if (users.length === 0) return;

      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: data.type,
          title: data.title,
          message: data.message,
          referenceId: data.referenceId || null,
          metadata: data.metadata || null,
        })),
      });

      // Dispatch FCM Push Notifications
      this.sendPushToMultipleUsers(
        users.map((u) => u.id),
        {
          title: data.title,
          body: data.message,
          data: {
            type: data.type,
            referenceId: data.referenceId || '',
          },
        },
      ).catch(() => {});
    } catch (error) {
      this.logger.error(`Failed to create notifications for roles ${roles.join(',')}:`, error);
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
          directorateId,
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
        select: { id: true },
      });

      if (users.length === 0) return;

      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: data.type,
          title: data.title,
          message: data.message,
          referenceId: data.referenceId || null,
          metadata: data.metadata || null,
        })),
      });

      // Dispatch FCM Push Notifications
      this.sendPushToMultipleUsers(
        users.map((u) => u.id),
        {
          title: data.title,
          body: data.message,
          data: {
            type: data.type,
            referenceId: data.referenceId || '',
          },
        },
      ).catch(() => {});
    } catch (error) {
      this.logger.error(`Failed to create notifications for directorate ${directorateId}:`, error);
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
        where: excludeUserId ? { id: { not: excludeUserId } } : {},
        select: { id: true },
      });

      if (users.length === 0) return;

      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: data.type,
          title: data.title,
          message: data.message,
          referenceId: data.referenceId || null,
          metadata: data.metadata || null,
        })),
      });

      // Dispatch FCM Push Notifications
      this.sendPushToMultipleUsers(
        users.map((u) => u.id),
        {
          title: data.title,
          body: data.message,
          data: {
            type: data.type,
            referenceId: data.referenceId || '',
          },
        },
      ).catch(() => {});
    } catch (error) {
      this.logger.error(`Failed to create notifications for all users:`, error);
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
        take: limit,
      });
    } catch (error) {
      this.logger.error(`Failed to get notifications for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get notifications created AFTER a specific timestamp for a user.
   * Used by mobile app background recovery to catch up on missed notifications.
   */
  async getNotificationsSince(userId: string, since: Date) {
    if (!userId) return [];

    try {
      return await this.prisma.notification.findMany({
        where: {
          userId,
          createdAt: { gt: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    } catch (error) {
      this.logger.error(`Failed to get notifications since ${since.toISOString()} for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Register an FCM device token for push notifications.
   * Stores the token in the DeviceToken table, upserting to avoid duplicates.
   */
  async registerDeviceToken(userId: string, token: string, platform = 'android') {
    if (!userId || !token) {
      return { success: false, message: 'Missing userId or token' };
    }

    try {
      // Use raw upsert since DeviceToken model may not exist yet
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DeviceToken" ("id", "userId", "token", "platform", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT ("userId", "token")
         DO UPDATE SET "platform" = $3, "updatedAt" = CURRENT_TIMESTAMP`,
        userId,
        token,
        platform,
      );

      this.logger.log(`Registered FCM token for user ${userId} (platform: ${platform})`);
      return { success: true };
    } catch (error) {
      // If the table doesn't exist yet, log a warning instead of crashing
      this.logger.warn(`Could not register device token (table may not exist yet): ${error.message}`);
      return { success: false, message: 'Device token registration not available yet' };
    }
  }

  /**
   * Remove a device token (e.g., on user logout).
   */
  async unregisterDeviceToken(userId: string, token: string) {
    if (!userId || !token) {
      return { success: false, message: 'Missing userId or token' };
    }

    try {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM "DeviceToken" WHERE "userId" = $1 AND "token" = $2`,
        userId,
        token,
      );
      this.logger.log(`Unregistered FCM token for user ${userId}`);
      return { success: true };
    } catch (error) {
      this.logger.warn(`Could not unregister device token: ${error.message}`);
      return { success: false, message: 'Device token unregistration not available yet' };
    }
  }

  /**
   * Send a push notification to all devices registered to a specific user via FCM.
   * This is a no-op if Firebase Admin is not configured.
   * Uses dynamic import to avoid crashes if firebase-admin is not installed.
   */
  async sendPushToUser(userId: string, payload: { title: string; body: string; data?: Record<string, string> }) {
    try {
      // Get all device tokens for this user
      const tokens = await this.prisma.$queryRawUnsafe<{ token: string }[]>(
        `SELECT "token" FROM "DeviceToken" WHERE "userId" = $1`,
        userId,
      );

      if (!tokens || tokens.length === 0) return;

      // Try to load firebase-admin dynamically
      let admin: any;
      try {
        admin = await import('firebase-admin');
      } catch {
        // firebase-admin not installed, skip push
        return;
      }

      // Ensure Firebase is initialized
      if (!admin.apps?.length) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const candidatePaths = [
            process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
            path.resolve(process.cwd(), 'firebase-service-account.json'),
            path.resolve(process.cwd(), 'server/firebase-service-account.json'),
            path.resolve(__dirname, '../../firebase-service-account.json'),
            './firebase-service-account.json',
          ].filter(Boolean) as string[];

          const resolvedPath = candidatePaths.find((p) => fs.existsSync(p));
          if (resolvedPath) {
            const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
            const certFn = admin.cert || (admin.credential && admin.credential.cert);
            admin.initializeApp({
              credential: certFn ? certFn(serviceAccount) : undefined,
            });
            this.logger.log(`Firebase Admin initialized successfully using: ${resolvedPath}`);
          } else {
            this.logger.warn('Firebase service account file not found, push notifications disabled');
            return;
          }
        } catch (initErr) {
          this.logger.warn(`Firebase initialization failed: ${initErr.message}`);
          return;
        }
      }

      // Send to each registered device
      let messaging: any;
      if (typeof admin.messaging === 'function') {
        messaging = admin.messaging();
      } else {
        const { getMessaging } = await import('firebase-admin/messaging');
        messaging = getMessaging();
      }
      for (const { token } of tokens) {
        try {
          await messaging.send({
            token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: payload.data || {},
            android: {
              priority: 'high' as const,
              notification: {
                channelId: 'ports_urgent',
                priority: 'max' as const,
                defaultSound: true,
                defaultVibrateTimings: true,
                icon: 'ic_launcher_round',
                color: '#0c3e35',
              },
            },
          });
        } catch (sendErr: any) {
          // If token is invalid, remove it
          if (
            sendErr.code === 'messaging/registration-token-not-registered' ||
            sendErr.code === 'messaging/invalid-registration-token'
          ) {
            this.logger.warn(`Removing invalid FCM token for user ${userId}`);
            await this.prisma.$executeRawUnsafe(
              `DELETE FROM "DeviceToken" WHERE "token" = $1`,
              token,
            ).catch(() => {});
          } else {
            this.logger.error(`Failed to send FCM to user ${userId}:`, sendErr);
          }
        }
      }
    } catch (error) {
      // Graceful failure - push notifications are optional
      this.logger.debug(`Push notification skipped for user ${userId}: ${error.message}`);
    }
  }

  /**
   * Send push notifications to all users with specific roles.
   */
  async sendPushToRoles(roles: string[], payload: { title: string; body: string; data?: Record<string, string> }, excludeUserId?: string) {
    try {
      const users = await this.prisma.user.findMany({
        where: {
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

    try {
      // 1. Get all keys stored in NotificationRead table
      const rows = await this.prisma.$queryRawUnsafe<{ notificationKey: string }[]>(
        `SELECT "notificationKey" FROM "NotificationRead" WHERE "userId" = $1`,
        userId
      );
      const notificationKeys = rows.map((r) => r.notificationKey);

      // 2. Get announcement reads from AnnouncementRead table
      const annReads = await this.prisma.announcementRead.findMany({
        where: { userId },
        select: { announcementId: true },
      });
      const announcementKeys = annReads.map((a) => a.announcementId);

      // Merge and deduplicate
      const allReadKeys = Array.from(new Set([...notificationKeys, ...announcementKeys]));
      return allReadKeys;
    } catch (error) {
      this.logger.error(`Failed to get read notification keys for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Marks a list of notification keys as read for the user in PostgreSQL.
   */
  async markKeysAsRead(userId: string, keys: string[]) {
    if (!userId || !keys || !keys.length) {
      return { success: true, count: 0, readKeys: [] };
    }

    const uniqueKeys = Array.from(new Set(keys.map((k) => String(k).trim()).filter(Boolean)));
    if (!uniqueKeys.length) {
      return { success: true, count: 0, readKeys: [] };
    }

    try {
      for (const key of uniqueKeys) {
        // Upsert into NotificationRead table
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "NotificationRead" ("id", "userId", "notificationKey", "readAt")
           VALUES (gen_random_uuid()::text, $1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT ("userId", "notificationKey") 
           DO UPDATE SET "readAt" = CURRENT_TIMESTAMP`,
          userId,
          key
        );

        // If the key is an announcement ID, also upsert AnnouncementRead
        try {
          const ann = await this.prisma.announcement.findUnique({
            where: { id: key },
            select: { id: true },
          });

          if (ann) {
            await this.prisma.announcementRead.upsert({
              where: {
                announcementId_userId: {
                  announcementId: key,
                  userId,
                },
              },
              create: {
                announcementId: key,
                userId,
              },
              update: {
                readAt: new Date(),
              },
            });
          }
        } catch {
          // Key was not an announcement ID, ignore
        }
      }

      const allReadKeys = await this.getReadKeys(userId);
      return {
        success: true,
        count: uniqueKeys.length,
        readKeys: allReadKeys,
      };
    } catch (error) {
      this.logger.error(`Failed to mark notifications as read for user ${userId}:`, error);
      throw error;
    }
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
