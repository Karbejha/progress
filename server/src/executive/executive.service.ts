import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Priority, SummaryStatus } from '@prisma/client';

import { EventsGateway } from '../events/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';

export interface GiveFeedbackDto {
  directorateId: string;
  dailyPlanId?: string;
  dailySummaryId?: string;
  feedbackText: string;
  rating?: number;
}

export interface CreateAnnouncementDto {
  title: string;
  content: string;
  priority?: Priority;
}

@Injectable()
export class ExecutiveService {
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
    private notificationsService: NotificationsService,
  ) {}

  private normalizeDate(dateStr?: string): Date {
    const d = dateStr ? new Date(dateStr) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async getDailyOverview(dateStr?: string) {
    const targetDate = this.normalizeDate(dateStr);

    // Fetch all directorates
    const directorates = await this.prisma.directorate.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        users: {
          select: {
            id: true,
            fullName: true,
            title: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        executiveTasks: {
          include: {
            assignedBy: { select: { id: true, fullName: true, title: true, role: true } },
            assignedToUser: { select: { id: true, fullName: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        dailyPlans: {
          where: { planDate: targetDate },
          include: {
            tasks: { orderBy: { displayOrder: 'asc' } },
            dailySummary: true,
            feedbacks: {
              include: {
                fromUser: { select: { fullName: true, title: true, role: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    let totalDirectorates = directorates.length;
    let plansSubmittedCount = 0;
    let summariesSubmittedCount = 0;
    let totalTasksCount = 0;
    let totalCompletedTasksCount = 0;
    let urgentIssuesCount = 0;
    let sumCompletionRates = 0;
    let activeReportingDirectorates = 0;

    const items = directorates.map((dir) => {
      const plan = dir.dailyPlans[0] || null;
      const summary = plan?.dailySummary || null;
      const planTasks = plan?.tasks || [];
      const execTasks = dir.executiveTasks || [];
      const feedbacks = plan?.feedbacks || [];

      const hasPlan = !!plan;
      const hasSummary = !!summary;
      const isUrgent = summary?.urgentFlag || false;

      if (hasPlan) plansSubmittedCount++;
      if (hasSummary) summariesSubmittedCount++;
      if (isUrgent) urgentIssuesCount++;

      // Combined tasks count and completed count
      const isTaskFulfilledToday = (t: any) => {
        return t.status === 'COMPLETED' || t.completionPercentage === 100 || ((t.isMultiDay || !!t.carriedFromTaskId) && t.todayTargetMet);
      };
      const getTaskFulfillmentPct = (t: any) => {
        if (isTaskFulfilledToday(t)) return 100;
        return Math.min(100, Math.max(0, t.completionPercentage || 0));
      };

      const allTasksCount = planTasks.length + execTasks.length;
      const completedPlanTasks = planTasks.filter(isTaskFulfilledToday).length;
      const completedExecTasks = execTasks.filter(isTaskFulfilledToday).length;
      const totalCompleted = completedPlanTasks + completedExecTasks;

      totalTasksCount += allTasksCount;
      totalCompletedTasksCount += totalCompleted;

      let completionRate = 0;
      if (summary) {
        completionRate = summary.overallCompletionRate;
        sumCompletionRates += completionRate;
        activeReportingDirectorates++;
      } else if (allTasksCount > 0) {
        const sumPlanPct = planTasks.reduce((sum, t) => sum + getTaskFulfillmentPct(t), 0);
        const sumExecPct = execTasks.reduce((sum, t) => sum + getTaskFulfillmentPct(t), 0);
        completionRate = Math.round(((sumPlanPct + sumExecPct) / allTasksCount) * 10) / 10;
        sumCompletionRates += completionRate;
        activeReportingDirectorates++;
      }

      // Determine state tag
      let statusTag = 'لم يتم تقديم خطة';
      let statusColor = 'gray';

      if (hasSummary) {
        statusTag = 'تم تقديم الإنجاز المسائي';
        statusColor = 'emerald';
      } else if (hasPlan) {
        statusTag = 'قيد العمل والمتابعة';
        statusColor = 'blue';
      } else if (execTasks.length > 0) {
        const allDone = execTasks.every((t) => t.status === 'COMPLETED' || t.completionPercentage === 100);
        if (allDone) {
          statusTag = 'تم إنجاز تكليفات المدير العام';
          statusColor = 'emerald';
        } else {
          statusTag = 'متابعة تكليفات المدير العام';
          statusColor = 'blue';
        }
      }

      return {
        directorateId: dir.id,
        directorateName: dir.name,
        directorateCode: dir.code,
        category: dir.category,
        icon: dir.icon,
        director: dir.users[0] || null,
        planId: plan?.id || null,
        hasPlan,
        planSubmittedAt: plan?.submittedAt || null,
        generalFocus: plan?.generalFocus || null,
        tasksCount: allTasksCount,
        completedTasksCount: totalCompleted,
        completionRate,
        hasSummary,
        summarySubmittedAt: summary?.submittedAt || null,
        summaryText: summary?.summaryText || null,
        achievements: summary?.achievements || [],
        challenges: summary?.challenges || null,
        directorNotes: summary?.directorNotes || null,
        urgentFlag: isUrgent,
        tomorrowPlanPreview: summary?.tomorrowPlanPreview || null,
        statusTag,
        statusColor,
        tasks: planTasks,
        executiveTasks: execTasks,
        feedbacks,
      };
    });

    const averageCompletionRate =
      activeReportingDirectorates > 0
        ? Math.round((sumCompletionRates / activeReportingDirectorates) * 10) / 10
        : 0;

    return {
      date: targetDate,
      kpis: {
        totalDirectorates,
        plansSubmittedCount,
        plansSubmissionRate: Math.round((plansSubmittedCount / (totalDirectorates || 1)) * 100),
        summariesSubmittedCount,
        summariesSubmissionRate: Math.round((summariesSubmittedCount / (totalDirectorates || 1)) * 100),
        totalTasksCount,
        totalCompletedTasksCount,
        averageCompletionRate,
        urgentIssuesCount,
      },
      directorates: items,
    };
  }

  async getDirectorateDetails(directorateId: string, dateStr?: string) {
    const targetDate = this.normalizeDate(dateStr);

    const directorate = await this.prisma.directorate.findUnique({
      where: { id: directorateId },
      include: {
        users: true,
        executiveTasks: {
          include: {
            assignedBy: { select: { fullName: true, title: true, role: true } },
            assignedToUser: { select: { fullName: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!directorate) {
      throw new NotFoundException('المديرية غير موجودة');
    }

    // Target day plan
    const currentPlan = await this.prisma.dailyPlan.findUnique({
      where: {
        directorateId_planDate: {
          directorateId,
          planDate: targetDate,
        },
      },
      include: {
        tasks: { orderBy: { displayOrder: 'asc' } },
        dailySummary: true,
        feedbacks: {
          include: { fromUser: { select: { fullName: true, title: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Past 7 days history
    const pastPlans = await this.prisma.dailyPlan.findMany({
      where: {
        directorateId,
        planDate: { lt: targetDate },
      },
      include: {
        tasks: true,
        dailySummary: true,
      },
      orderBy: { planDate: 'desc' },
      take: 7,
    });

    return {
      directorate,
      currentPlan,
      pastPlans,
    };
  }

  async giveFeedback(user: any, dto: GiveFeedbackDto) {
    if (user.role === Role.DIRECTOR && user.directorateId !== dto.directorateId) {
      throw new ForbiddenException('لا يمكنك إضافة رد أو تعليق لمديرية أخرى');
    }

    const directorate = await this.prisma.directorate.findUnique({
      where: { id: dto.directorateId },
      select: { id: true, name: true },
    });

    let planDateStr = '';
    if (dto.dailyPlanId) {
      const plan = await this.prisma.dailyPlan.findUnique({
        where: { id: dto.dailyPlanId },
        select: { planDate: true },
      });
      if (plan?.planDate) {
        planDateStr = new Date(plan.planDate).toLocaleDateString('ar-SY', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
      }
    }

    const isDirectorReply = user.role === Role.DIRECTOR;

    const feedback = await this.prisma.executiveFeedback.create({
      data: {
        directorateId: dto.directorateId,
        dailyPlanId: dto.dailyPlanId,
        dailySummaryId: dto.dailySummaryId,
        fromUserId: user.id,
        feedbackText: dto.feedbackText,
        rating: isDirectorReply ? undefined : dto.rating,
      },
      include: {
        fromUser: {
          select: { fullName: true, title: true, role: true },
        },
      },
    });

    if (dto.dailySummaryId && !isDirectorReply) {
      await this.prisma.dailySummary.update({
        where: { id: dto.dailySummaryId },
        data: { status: SummaryStatus.FEEDBACK_GIVEN },
      });
    }

    // Broadcast through socket
    this.eventsGateway.emitFeedbackSent({
      directorateId: feedback.directorateId,
      fromUserName: user.fullName,
      fromUserTitle: user.title,
      fromRole: user.role,
      directorateName: directorate?.name,
      feedbackText: feedback.feedbackText,
      rating: feedback.rating || undefined,
      isReply: isDirectorReply,
      dailyPlanId: dto.dailyPlanId,
    });

    if (isDirectorReply) {
      // Persist notification for executive roles (General Director, Assistant, Observer)
      this.notificationsService.createNotificationForRoles(
        [Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR, Role.OBSERVER],
        {
          type: 'feedback',
          title: `رد وتوضيح من ${user.fullName} (${directorate?.name || 'المديرية'})`,
          message: planDateStr
            ? `رد بخصوص إنجاز يوم ${planDateStr}: "${feedback.feedbackText}"`
            : feedback.feedbackText,
          referenceId: feedback.id,
          metadata: {
            feedbackId: feedback.id,
            fromUserId: user.id,
            fromUserName: user.fullName,
            fromUserTitle: user.title,
            fromRole: user.role,
            directorateId: feedback.directorateId,
            directorateName: directorate?.name,
            dailyPlanId: dto.dailyPlanId,
            isReply: true,
          },
        },
        user.id,
      );
    } else {
      // Persist notification for directorate users
      this.notificationsService.createNotificationForDirectorate(
        feedback.directorateId,
        {
          type: 'feedback',
          title: 'توجيه من المدير العام',
          message: feedback.feedbackText,
          referenceId: feedback.id,
          metadata: {
            feedbackId: feedback.id,
            fromUserName: user.fullName,
            fromUserTitle: user.title,
            fromRole: user.role,
            directorateId: feedback.directorateId,
            rating: feedback.rating,
            isReply: false,
          },
        },
        user.id,
      );
    }

    return feedback;
  }

  async getAnnouncements(user?: any) {
    const totalDirectorates = await this.prisma.directorate.count();

    const announcements = await this.prisma.announcement.findMany({
      include: {
        author: {
          select: { fullName: true, title: true },
        },
        reads: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                title: true,
                directorateId: true,
                directorate: { select: { id: true, name: true, code: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return announcements.map((ann) => {
      const isReadByMe = user ? ann.reads.some((r) => r.userId === user.id) : false;
      const readCount = ann.reads.length;
      const readPercentage = Math.round((readCount / (totalDirectorates || 1)) * 100);

      return {
        id: ann.id,
        title: ann.title,
        content: ann.content,
        priority: ann.priority,
        authorId: ann.authorId,
        author: ann.author,
        createdAt: ann.createdAt,
        isReadByMe,
        readCount,
        totalDirectorates,
        readPercentage,
        reads: ann.reads.map((r) => ({
          userId: r.userId,
          userName: r.user?.fullName || 'مستخدم غير محدد',
          userTitle: r.user?.title || '',
          directorateName: r.user?.directorate?.name || null,
          readAt: r.readAt,
        })),
      };
    });
  }

  async markAnnouncementAsRead(user: any, announcementId: string) {
    const ann = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
    });

    if (!ann) {
      throw new NotFoundException('التعميم غير موجود');
    }

    const read = await this.prisma.announcementRead.upsert({
      where: {
        announcementId_userId: {
          announcementId,
          userId: user.id,
        },
      },
      create: {
        announcementId,
        userId: user.id,
      },
      update: {
        readAt: new Date(),
      },
    });

    return {
      success: true,
      announcementId,
      userId: user.id,
      readAt: read.readAt,
    };
  }

  async getAnnouncementReaders(user: any, announcementId: string) {
    const ann = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      include: {
        author: { select: { fullName: true, title: true } },
        reads: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                title: true,
                role: true,
                directorateId: true,
                directorate: { select: { id: true, name: true, code: true, icon: true } },
              },
            },
          },
        },
      },
    });

    if (!ann) {
      throw new NotFoundException('التعميم غير موجود');
    }

    // Get all directorates to identify who hasn't read yet
    const allDirectorates = await this.prisma.directorate.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        users: {
          select: { id: true, fullName: true, title: true, role: true },
        },
      },
    });

    const readUserIds = new Set(ann.reads.map((r) => r.userId));
    const readDirectorateIds = new Set(
      ann.reads.map((r) => r.user?.directorateId).filter(Boolean),
    );

    const readers = ann.reads.map((r) => ({
      userId: r.userId,
      userName: r.user?.fullName || 'مستخدم غير محدد',
      userTitle: r.user?.title || '',
      directorateId: r.user?.directorateId,
      directorateName: r.user?.directorate?.name || 'الإدارة العليا / غير محدد',
      directorateCode: r.user?.directorate?.code || null,
      readAt: r.readAt,
    }));

    const unreadDirectorates = allDirectorates
      .filter((dir) => !readDirectorateIds.has(dir.id))
      .map((dir) => ({
        directorateId: dir.id,
        directorateName: dir.name,
        directorateCode: dir.code,
        icon: dir.icon,
        directorName: dir.users[0]?.fullName || 'غير محدد',
      }));

    const totalDirectorates = allDirectorates.length;
    const readCount = readDirectorateIds.size;
    const unreadCount = unreadDirectorates.length;
    const readPercentage = Math.round((readCount / (totalDirectorates || 1)) * 100);

    return {
      announcement: {
        id: ann.id,
        title: ann.title,
        content: ann.content,
        priority: ann.priority,
        authorName: ann.author?.fullName,
        createdAt: ann.createdAt,
      },
      stats: {
        totalDirectorates,
        readCount,
        unreadCount,
        readPercentage,
      },
      readers,
      unreadDirectorates,
    };
  }

  async createAnnouncement(user: any, dto: CreateAnnouncementDto) {
    const ann = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        priority: dto.priority || Priority.NORMAL,
        authorId: user.id,
      },
      include: {
        author: { select: { fullName: true, title: true } },
      },
    });

    this.eventsGateway.emitAnnouncementCreated({
      id: ann.id,
      title: ann.title,
      content: ann.content,
      priority: ann.priority,
      authorId: user.id,
      authorName: user.fullName,
      createdAt: ann.createdAt.toISOString(),
    });

    // Persist notification for all users except the author
    this.notificationsService.createNotificationForAllUsers(
      {
        type: 'announcement',
        title: 'تعميم إداري رسمي',
        message: ann.title,
        referenceId: ann.id,
        metadata: {
          announcementId: ann.id,
          content: ann.content,
          authorName: user.fullName,
          authorTitle: user.title,
          priority: ann.priority,
        },
      },
      user.id,
    );

    return ann;
  }
}
