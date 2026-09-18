import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Non-blocking auto-backfill on module initialization
    this.autoBackfillHistoricalNotifications().catch((err) => {
      this.logger.error('Error during automatic notifications backfill:', err);
    });
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
      return await this.prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          referenceId: data.referenceId || null,
          metadata: data.metadata || null,
        },
      });
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

      const execUsers = await this.prisma.user.findMany({
        where: { role: { in: [Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR, Role.OBSERVER] } },
        select: { id: true, role: true },
      });

      if (execUsers.length === 0) return;

      // 1. Daily Plans
      const plans = await this.prisma.dailyPlan.findMany({
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

      // 2. Daily Summaries
      const summaries = await this.prisma.dailySummary.findMany({
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

      // 3. Executive Feedbacks & Replies
      const feedbacks = await this.prisma.executiveFeedback.findMany({
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

      // 4. Announcements
      const announcements = await this.prisma.announcement.findMany({
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

      // 5. Executive Tasks
      const execTasks = await this.prisma.executiveTask.findMany({
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
