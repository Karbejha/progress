import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Priority, SummaryStatus } from '@prisma/client';

import { EventsGateway } from '../events/events.gateway';

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
        dailyPlans: {
          where: { planDate: targetDate },
          include: {
            tasks: { orderBy: { displayOrder: 'asc' } },
            dailySummary: true,
            feedbacks: {
              include: {
                fromUser: { select: { fullName: true, title: true } },
              },
              orderBy: { createdAt: 'desc' },
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
      const tasks = plan?.tasks || [];
      const feedbacks = plan?.feedbacks || [];

      const hasPlan = !!plan;
      const hasSummary = !!summary;
      const isUrgent = summary?.urgentFlag || false;

      if (hasPlan) plansSubmittedCount++;
      if (hasSummary) summariesSubmittedCount++;
      if (isUrgent) urgentIssuesCount++;

      const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
      totalTasksCount += tasks.length;
      totalCompletedTasksCount += completedTasks;

      let completionRate = 0;
      if (summary) {
        completionRate = summary.overallCompletionRate;
        sumCompletionRates += completionRate;
        activeReportingDirectorates++;
      } else if (tasks.length > 0) {
        const sumTaskPct = tasks.reduce((sum, t) => sum + t.completionPercentage, 0);
        completionRate = Math.round((sumTaskPct / tasks.length) * 10) / 10;
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
        tasksCount: tasks.length,
        completedTasksCount: completedTasks,
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
        tasks,
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
          include: { fromUser: { select: { fullName: true, title: true } } },
          orderBy: { createdAt: 'desc' },
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
    const feedback = await this.prisma.executiveFeedback.create({
      data: {
        directorateId: dto.directorateId,
        dailyPlanId: dto.dailyPlanId,
        dailySummaryId: dto.dailySummaryId,
        fromUserId: user.id,
        feedbackText: dto.feedbackText,
        rating: dto.rating,
      },
      include: {
        fromUser: {
          select: { fullName: true, title: true, role: true },
        },
      },
    });

    if (dto.dailySummaryId) {
      await this.prisma.dailySummary.update({
        where: { id: dto.dailySummaryId },
        data: { status: SummaryStatus.FEEDBACK_GIVEN },
      });
    }

    this.eventsGateway.emitFeedbackSent({
      directorateId: feedback.directorateId,
      fromUserName: user.fullName,
      feedbackText: feedback.feedbackText,
      rating: feedback.rating || undefined,
    });

    return feedback;
  }

  async getAnnouncements() {
    return this.prisma.announcement.findMany({
      include: {
        author: {
          select: { fullName: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
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

    return ann;
  }
}
