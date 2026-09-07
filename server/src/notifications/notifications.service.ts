import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}
