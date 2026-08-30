import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, SummaryStatus, TaskStatus } from '@prisma/client';

import { EventsGateway } from '../events/events.gateway';

export interface SubmitSummaryDto {
  date?: string;
  summaryText: string;
  achievements?: string[];
  challenges?: string;
  directorNotes?: string;
  urgentFlag?: boolean;
  tomorrowPlanPreview?: string;
  taskUpdates?: {
    taskId: string;
    status: TaskStatus;
    completionPercentage: number;
    completionNote?: string;
  }[];
}

@Injectable()
export class DailySummariesService {
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

  private normalizeDate(dateStr?: string): Date {
    const d = dateStr ? new Date(dateStr) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async submitSummary(user: any, dto: SubmitSummaryDto) {
    if (!user.directorateId) {
      throw new ForbiddenException('فقط مدراء المديريات يمكنهم إرسال ملخص الإنجاز');
    }

    const summaryDate = this.normalizeDate(dto.date);
    const directorateId = user.directorateId;

    // Find daily plan
    let plan = await this.prisma.dailyPlan.findUnique({
      where: {
        directorateId_planDate: {
          directorateId,
          planDate: summaryDate,
        },
      },
      include: { tasks: true, dailySummary: true },
    });

    if (!plan) {
      // Create empty container plan if none existed
      plan = await this.prisma.dailyPlan.create({
        data: {
          directorateId,
          userId: user.id,
          planDate: summaryDate,
          generalFocus: 'المهام اليومية المعتادة',
          submittedAt: new Date(),
        },
        include: { tasks: true, dailySummary: true },
      });
    }

    // Apply any task updates
    if (dto.taskUpdates && dto.taskUpdates.length > 0) {
      for (const update of dto.taskUpdates) {
        await this.prisma.planTask.update({
          where: { id: update.taskId },
          data: {
            status: update.status,
            completionPercentage: update.completionPercentage,
            completionNote: update.completionNote,
          },
        });
      }
    }

    // Calculate completion rate
    const tasks = await this.prisma.planTask.findMany({
      where: { dailyPlanId: plan.id },
    });

    let overallRate = 100.0;
    if (tasks.length > 0) {
      const total = tasks.reduce((sum, t) => sum + t.completionPercentage, 0);
      overallRate = Math.round((total / tasks.length) * 10) / 10;
    }

    // Upsert summary
    const summary = await this.prisma.dailySummary.upsert({
      where: { dailyPlanId: plan.id },
      create: {
        dailyPlanId: plan.id,
        directorateId,
        userId: user.id,
        summaryDate,
        summaryText: dto.summaryText,
        achievements: dto.achievements || [],
        challenges: dto.challenges || '',
        directorNotes: dto.directorNotes || '',
        urgentFlag: dto.urgentFlag || false,
        tomorrowPlanPreview: dto.tomorrowPlanPreview || '',
        overallCompletionRate: overallRate,
        status: SummaryStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      update: {
        summaryText: dto.summaryText,
        achievements: dto.achievements || [],
        challenges: dto.challenges || '',
        directorNotes: dto.directorNotes || '',
        urgentFlag: dto.urgentFlag || false,
        tomorrowPlanPreview: dto.tomorrowPlanPreview || '',
        overallCompletionRate: overallRate,
        status: SummaryStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      include: {
        dailyPlan: {
          include: { tasks: { orderBy: { displayOrder: 'asc' } } },
        },
        directorate: true,
        feedbacks: true,
      },
    });

    this.eventsGateway.emitSummarySubmitted({
      directorateId: summary.directorateId,
      directorateName: summary.directorate.name,
      directorName: user.fullName,
      overallCompletionRate: summary.overallCompletionRate,
      urgentFlag: summary.urgentFlag,
      summaryText: summary.summaryText,
    });

    return summary;
  }

  async getMySummary(user: any, dateStr?: string) {
    if (!user.directorateId) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية');
    }

    const targetDate = this.normalizeDate(dateStr);
    const directorateId = user.directorateId;

    const plan = await this.prisma.dailyPlan.findUnique({
      where: {
        directorateId_planDate: {
          directorateId,
          planDate: targetDate,
        },
      },
      include: {
        dailySummary: {
          include: {
            feedbacks: {
              include: { fromUser: { select: { fullName: true, title: true } } },
            },
          },
        },
        tasks: { orderBy: { displayOrder: 'asc' } },
      },
    });

    return plan?.dailySummary || null;
  }
}
