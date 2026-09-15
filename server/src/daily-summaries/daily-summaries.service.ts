import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, SummaryStatus, TaskStatus, Priority } from '@prisma/client';

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

    // Calculate completion rate including plan tasks and executive tasks
    const tasks = await this.prisma.planTask.findMany({
      where: { dailyPlanId: plan.id },
    });
    const execTasks = await this.prisma.executiveTask.findMany({
      where: { directorateId },
    });

    const allPcts = [
      ...tasks.map((t) => t.completionPercentage),
      ...execTasks.map((t) => t.completionPercentage),
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
      },
    });

    // Synchronize all completed plan tasks and executive tasks to the director's agenda (UserTodo)
    const completedPlanTasks = tasks.filter(
      (t) => t.status === TaskStatus.COMPLETED || t.completionPercentage === 100,
    );
    for (const ct of completedPlanTasks) {
      await this.syncTaskToUserTodo(user.id, ct.id, ct.title, true, ct.priority, ct.description, 'PLAN');
    }

    const completedExecTasks = execTasks.filter(
      (t) => t.status === TaskStatus.COMPLETED || t.completionPercentage === 100,
    );
    for (const et of completedExecTasks) {
      await this.syncTaskToUserTodo(user.id, et.id, et.title, true, et.priority, et.description, 'EXECUTIVE');
    }

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
  ) {
    try {
      const cleanTitle = title.trim();
      const tag = type === 'PLAN'
        ? `[تم إدراجها في الخطة اليومية] [معرف المهمة: ${taskId}]`
        : `[تم إسنادها كتكليف تنفيذي] [معرف التكليف: ${taskId}]`;

      const existingTodos = await this.prisma.userTodo.findMany({
        where: {
          userId,
          OR: [
            { description: { contains: taskId } },
            { title: { equals: cleanTitle, mode: 'insensitive' } },
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
          await this.prisma.userTodo.update({
            where: { id: todo.id },
            data: {
              isCompleted,
              completedAt: isCompleted ? (todo.completedAt || new Date()) : null,
              description: newDesc,
            },
          });
        }
      } else if (isCompleted) {
        const desc = description?.trim() ? `${description.trim()}\n${tag}` : tag;
        await this.prisma.userTodo.create({
          data: {
            userId,
            title: cleanTitle,
            description: desc,
            priority: priority || Priority.NORMAL,
            category: type === 'PLAN' ? 'OFFICIAL' : 'FOLLOWUP',
            isCompleted: true,
            completedAt: new Date(),
          },
        });
      }

      this.eventsGateway.emitTodoUpdated(userId);
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
