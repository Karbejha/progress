import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, PlanStatus, Priority, TaskStatus } from '@prisma/client';

import { EventsGateway } from '../events/events.gateway';

export interface CreatePlanDto {
  planDate?: string;
  generalFocus?: string;
  tasks: {
    title: string;
    description?: string;
    priority?: Priority;
    estimatedHours?: number;
  }[];
}

export interface UpdateTaskDto {
  status?: TaskStatus;
  completionPercentage?: number;
  completionNote?: string;
}

@Injectable()
export class DailyPlansService {
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

  private normalizeDate(dateStr?: string): Date {
    const d = dateStr ? new Date(dateStr) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async getMyPlanForDate(user: any, dateStr?: string) {
    if (!user.directorateId && user.role === Role.DIRECTOR) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية معينة');
    }

    const targetDate = this.normalizeDate(dateStr);
    const directorateId = user.directorateId;

    if (!directorateId) {
      throw new BadRequestException('يرجى تحديد المديرية المطلوبة');
    }

    const plan = await this.prisma.dailyPlan.findUnique({
      where: {
        directorateId_planDate: {
          directorateId,
          planDate: targetDate,
        },
      },
      include: {
        directorate: true,
        tasks: {
          orderBy: { displayOrder: 'asc' },
        },
        dailySummary: true,
        feedbacks: {
          include: {
            fromUser: {
              select: { fullName: true, title: true, role: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return plan;
  }

  async createOrUpdatePlan(user: any, dto: CreatePlanDto) {
    if (!user.directorateId) {
      throw new ForbiddenException('فقط مدراء المديريات يمكنهم إنشاء خطة يومية');
    }

    const planDate = this.normalizeDate(dto.planDate);
    const directorateId = user.directorateId;

    // Check if plan exists
    const existing = await this.prisma.dailyPlan.findUnique({
      where: {
        directorateId_planDate: {
          directorateId,
          planDate,
        },
      },
      include: { tasks: true },
    });

    if (existing) {
      // Update general focus and recreate tasks
      await this.prisma.planTask.deleteMany({
        where: { dailyPlanId: existing.id },
      });

      const updated = await this.prisma.dailyPlan.update({
        where: { id: existing.id },
        data: {
          generalFocus: dto.generalFocus,
          status: PlanStatus.SUBMITTED,
          submittedAt: new Date(),
          tasks: {
            create: dto.tasks.map((t, idx) => ({
              title: t.title,
              description: t.description || '',
              priority: t.priority || Priority.NORMAL,
              estimatedHours: t.estimatedHours || 1.0,
              displayOrder: idx + 1,
              status: TaskStatus.PENDING,
              completionPercentage: 0,
            })),
          },
        },
        include: {
          tasks: { orderBy: { displayOrder: 'asc' } },
          directorate: true,
          dailySummary: true,
        },
      });

      return updated;
    }

    // Create new plan
    const created = await this.prisma.dailyPlan.create({
      data: {
        directorateId,
        userId: user.id,
        planDate,
        status: PlanStatus.SUBMITTED,
        generalFocus: dto.generalFocus,
        submittedAt: new Date(),
        tasks: {
          create: dto.tasks.map((t, idx) => ({
            title: t.title,
            description: t.description || '',
            priority: t.priority || Priority.NORMAL,
            estimatedHours: t.estimatedHours || 1.0,
            displayOrder: idx + 1,
            status: TaskStatus.PENDING,
            completionPercentage: 0,
          })),
        },
      },
      include: {
        tasks: { orderBy: { displayOrder: 'asc' } },
        directorate: true,
        dailySummary: true,
      },
    });

    this.eventsGateway.emitPlanSubmitted({
      directorateId: created.directorateId,
      directorateName: created.directorate.name,
      directorName: user.fullName,
      tasksCount: created.tasks.length,
      planDate: created.planDate.toISOString(),
    });

    return created;
  }

  async updateTaskStatus(user: any, taskId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.planTask.findUnique({
      where: { id: taskId },
      include: { dailyPlan: { include: { directorate: true } } },
    });

    if (!task) {
      throw new NotFoundException('المهمة غير موجودة');
    }

    // Check ownership
    if (user.role === Role.DIRECTOR && task.dailyPlan.directorateId !== user.directorateId) {
      throw new ForbiddenException('غير مصرح لك بتعديل مهام مديرية أخرى');
    }

    const updatedTask = await this.prisma.planTask.update({
      where: { id: taskId },
      data: {
        status: dto.status !== undefined ? dto.status : task.status,
        completionPercentage:
          dto.completionPercentage !== undefined ? dto.completionPercentage : task.completionPercentage,
        completionNote: dto.completionNote !== undefined ? dto.completionNote : task.completionNote,
      },
    });

    // Recalculate summary completion rate if summary exists
    const allPlanTasks = await this.prisma.planTask.findMany({
      where: { dailyPlanId: task.dailyPlanId },
    });
    const allExecTasks = await this.prisma.executiveTask.findMany({
      where: { directorateId: task.dailyPlan.directorateId },
    });

    const allPcts = [
      ...allPlanTasks.map((t) => t.completionPercentage),
      ...allExecTasks.map((t) => t.completionPercentage),
    ];

    if (allPcts.length > 0) {
      const avg = allPcts.reduce((acc, curr) => acc + curr, 0) / allPcts.length;

      const summary = await this.prisma.dailySummary.findUnique({
        where: { dailyPlanId: task.dailyPlanId },
      });

      if (summary) {
        await this.prisma.dailySummary.update({
          where: { id: summary.id },
          data: { overallCompletionRate: Math.round(avg * 10) / 10 },
        });
      }
    }

    const hasStatusChanged = dto.status !== undefined && dto.status !== task.status;
    const hasPercentageChanged =
      dto.completionPercentage !== undefined && dto.completionPercentage !== task.completionPercentage;
    const hasNoteChanged =
      dto.completionNote !== undefined && (dto.completionNote || '').trim() !== (task.completionNote || '').trim();

    const hasChanges = hasStatusChanged || hasPercentageChanged || hasNoteChanged;

    if (hasChanges) {
      this.eventsGateway.emitTaskUpdated({
        directorateId: task.dailyPlan.directorateId,
        directorateName: task.dailyPlan.directorate.name,
        taskId: updatedTask.id,
        taskTitle: updatedTask.title,
        status: updatedTask.status,
        completionPercentage: updatedTask.completionPercentage,
        completionNote: updatedTask.completionNote || undefined,
      });
    }

    return updatedTask;
  }

  async getDirectorHistory(user: any, limit = 30) {
    if (!user.directorateId) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية');
    }

    return this.prisma.dailyPlan.findMany({
      where: { directorateId: user.directorateId },
      include: {
        tasks: { orderBy: { displayOrder: 'asc' } },
        dailySummary: true,
        feedbacks: {
          include: { fromUser: { select: { fullName: true, title: true } } },
        },
      },
      orderBy: { planDate: 'desc' },
      take: limit,
    });
  }

  async getTaskTemplates(user: any) {
    if (!user.directorateId) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية معينة');
    }

    return this.prisma.taskTemplate.findMany({
      where: { directorateId: user.directorateId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTaskTemplate(user: any, dto: { title: string; description?: string; priority?: Priority; estimatedHours?: number }) {
    if (!user.directorateId) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية');
    }

    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('عنوان المهمة مطلوب');
    }

    return this.prisma.taskTemplate.create({
      data: {
        directorateId: user.directorateId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority || Priority.NORMAL,
        estimatedHours: dto.estimatedHours || 1.0,
      },
    });
  }

  async deleteTaskTemplate(user: any, templateId: string) {
    if (!user.directorateId) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية');
    }

    const template = await this.prisma.taskTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('القالب غير موجود');
    }

    if (template.directorateId !== user.directorateId) {
      throw new ForbiddenException('غير مصرح لك بحذف قالب مديرية أخرى');
    }

    await this.prisma.taskTemplate.delete({
      where: { id: templateId },
    });

    return { message: 'تم حذف القالب بنجاح', templateId };
  }

  async clonePreviousPlan(user: any, currentDateStr?: string) {
    if (!user.directorateId) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية');
    }

    const targetDate = this.normalizeDate(currentDateStr);

    const previousPlan = await this.prisma.dailyPlan.findFirst({
      where: {
        directorateId: user.directorateId,
        planDate: { lt: targetDate },
      },
      include: {
        tasks: { orderBy: { displayOrder: 'asc' } },
      },
      orderBy: { planDate: 'desc' },
    });

    if (!previousPlan) {
      throw new NotFoundException('لا توجد خطة سابقة لهذه المديرية لاستنساخها');
    }

    return {
      previousDate: previousPlan.planDate,
      generalFocus: previousPlan.generalFocus,
      tasks: previousPlan.tasks.map((t) => ({
        title: t.title,
        description: t.description || '',
        priority: t.priority,
        estimatedHours: t.estimatedHours,
      })),
    };
  }
}
