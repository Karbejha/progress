import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, SummaryStatus, TaskStatus, Priority } from '@prisma/client';

import { EventsGateway } from '../events/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';

export interface SubmitSummaryDto {
  date?: string;
  summaryText: string;
  achievements?: string[];
  challenges?: string;
  directorNotes?: string;
  urgentFlag?: boolean;
  tomorrowPlanPreview?: string;
  attachmentIds?: string[];
  taskUpdates?: {
    taskId: string;
    status: TaskStatus;
    completionPercentage: number;
    completionNote?: string;
    isMultiDay?: boolean;
    todayTargetMet?: boolean;
  }[];
}

@Injectable()
export class DailySummariesService {
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

  async submitSummary(user: any, dto: SubmitSummaryDto) {
    if (user.role === Role.OBSERVER) {
      throw new ForbiddenException('حساب المراقب مخصص للاطلاع فقط ولا يمكنه إرسال ملخصات الإنجاز');
    }

    const directorateId = user.directorateId;
    if (!directorateId) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية معينة');
    }

    const summaryDate = this.normalizeDate(dto.date);

    // Find the daily plan for this date
    let plan = await this.prisma.dailyPlan.findFirst({
      where: {
        directorateId,
        planDate: summaryDate,
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
            ...(update.isMultiDay !== undefined ? { isMultiDay: update.isMultiDay } : {}),
            ...(update.todayTargetMet !== undefined ? { todayTargetMet: update.todayTargetMet } : {}),
          },
        });
      }
    }

    // Calculate completion rate including plan tasks and executive tasks
    const tasks = await this.prisma.planTask.findMany({
      where: { dailyPlanId: plan.id },
    });
    const execTasks = await this.prisma.executiveTask.findMany({
      where: { directorateId },
    });

    const calculateTaskDailyFulfillmentRate = (t: {
      completionPercentage: number;
      status?: TaskStatus | string;
      isMultiDay?: boolean;
      todayTargetMet?: boolean;
      carriedFromTaskId?: string | null;
    }) => {
      if (t.status === TaskStatus.COMPLETED || t.completionPercentage >= 100) return 100;
      const isMulti = t.isMultiDay || !!t.carriedFromTaskId;
      if (isMulti && t.todayTargetMet) return 100;
      return Math.min(100, Math.max(0, t.completionPercentage || 0));
    };

    const allPcts = [
      ...tasks.map((t) => calculateTaskDailyFulfillmentRate(t)),
      ...execTasks.map((t) => calculateTaskDailyFulfillmentRate(t)),
    ];

    let overallRate = 100.0;
    if (allPcts.length > 0) {
      const total = allPcts.reduce((sum, pct) => sum + pct, 0);
      overallRate = Math.round((total / allPcts.length) * 10) / 10;
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
        attachments: true,
      },
    });

    if (dto.attachmentIds && dto.attachmentIds.length > 0) {
      await this.prisma.attachment.updateMany({
        where: { id: { in: dto.attachmentIds } },
        data: { dailySummaryId: summary.id, category: 'DAILY_SUMMARY' },
      });
    }

    // Synchronize all plan tasks and executive tasks with their actual completion percentage to the director's agenda (UserTodo)
    for (const pt of tasks) {
      const isTaskCompleted = pt.status === TaskStatus.COMPLETED || pt.completionPercentage === 100;
      await this.syncTaskToUserTodo(user.id, pt.id, pt.title, isTaskCompleted, pt.priority, pt.description, 'PLAN', pt.completionPercentage);
    }

    for (const et of execTasks) {
      const isExecCompleted = et.status === TaskStatus.COMPLETED || et.completionPercentage === 100;
      await this.syncTaskToUserTodo(user.id, et.id, et.title, isExecCompleted, et.priority, et.description, 'EXECUTIVE', et.completionPercentage);
    }

    this.eventsGateway.emitSummarySubmitted({
      directorateId: summary.directorateId,
      directorateName: summary.directorate.name,
      directorName: user.fullName,
      overallCompletionRate: summary.overallCompletionRate,
      urgentFlag: summary.urgentFlag,
      summaryText: summary.summaryText,
    });

    // Persist notification for executive users
    this.notificationsService.createNotificationForRoles(
      [Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR, Role.OBSERVER],
      {
        type: 'summary',
        title: 'تسليم ملخص الإنجاز',
        message: `سلّمت (${summary.directorate.name}) ملخص نهاية الدوام بنسبة إنجاز ${summary.overallCompletionRate}%.`,
        referenceId: `summary-sub-${summary.directorateId}-${dto.date || new Date().toISOString().split('T')[0]}`,
        metadata: {
          directorateId: summary.directorateId,
          directorateName: summary.directorate.name,
          directorName: user.fullName,
          overallCompletionRate: summary.overallCompletionRate,
          urgentFlag: summary.urgentFlag,
        },
      },
    );

    return summary;
  }

  /**
   * Synchronize completion of a task with director's personal agenda (UserTodo)
   */
  async syncTaskToUserTodo(
    userId: string,
    taskId: string,
    title: string,
    isCompleted: boolean,
    priority: Priority,
    description?: string | null,
    type: 'PLAN' | 'EXECUTIVE' = 'PLAN',
    completionPercentage?: number,
  ) {
    try {
      const cleanTitle = title.trim();
      const tag = type === 'PLAN'
        ? `[تم إدراجها في الخطة اليومية] [معرف المهمة: ${taskId}]`
        : `[تم إسنادها كتكليف تنفيذي] [معرف التكليف: ${taskId}]`;
      const pct = typeof completionPercentage === 'number'
        ? Math.min(100, Math.max(0, Math.round(completionPercentage)))
        : (isCompleted ? 100 : 0);

      const existingTodos = await this.prisma.userTodo.findMany({
        where: {
          OR: [
            { description: { contains: taskId } },
            {
              userId,
              title: { equals: cleanTitle, mode: 'insensitive' },
            },
          ],
        },
      });

      if (existingTodos.length > 0) {
        for (const todo of existingTodos) {
          const alreadyHasTag = todo.description?.includes(taskId);
          let newDesc = todo.description || '';
          if (!alreadyHasTag) {
            newDesc = newDesc ? `${newDesc}\n${tag}` : tag;
          }
          const willBeCompleted = isCompleted || pct === 100;
          await this.prisma.userTodo.update({
            where: { id: todo.id },
            data: {
              isCompleted: willBeCompleted,
              completedAt: willBeCompleted ? (todo.completedAt || new Date()) : null,
              completionPercentage: pct,
              description: newDesc,
            },
          });
          this.eventsGateway.emitTodoUpdated(todo.userId);
        }
      } else if (isCompleted || pct === 100) {
        const desc = description?.trim() ? `${description.trim()}\n${tag}` : tag;
        await this.prisma.userTodo.create({
          data: {
            userId,
            title: cleanTitle,
            description: desc,
            priority: priority || Priority.NORMAL,
            category: type === 'PLAN' ? 'OFFICIAL' : 'FOLLOWUP',
            completionPercentage: pct,
            isCompleted: true,
            completedAt: new Date(),
          },
        });
        this.eventsGateway.emitTodoUpdated(userId);
      }
    } catch (err) {
      console.error('Failed to sync summary task to user todo:', err);
    }
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
            attachments: true,
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
