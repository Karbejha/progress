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
    carriedFromTaskId?: string;
    completionPercentage?: number;
    status?: TaskStatus;
    completionNote?: string;
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
          include: {
            carriedFromTask: {
              select: {
                id: true,
                title: true,
                completionPercentage: true,
                dailyPlan: { select: { planDate: true } },
              },
            },
          },
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
            create: dto.tasks.map((t, idx) => {
              const pct = typeof t.completionPercentage === 'number' ? Math.min(100, Math.max(0, t.completionPercentage)) : 0;
              const status = t.status || (pct > 0 ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING);
              return {
                title: t.title,
                description: t.description || '',
                priority: t.priority || Priority.NORMAL,
                estimatedHours: t.estimatedHours || 1.0,
                displayOrder: idx + 1,
                status,
                completionPercentage: pct,
                completionNote: t.completionNote || null,
                carriedFromTaskId: t.carriedFromTaskId || null,
              };
            }),
          },
        },
        include: {
          tasks: {
            orderBy: { displayOrder: 'asc' },
            include: {
              carriedFromTask: {
                select: {
                  id: true,
                  title: true,
                  completionPercentage: true,
                  dailyPlan: { select: { planDate: true } },
                },
              },
            },
          },
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
          create: dto.tasks.map((t, idx) => {
            const pct = typeof t.completionPercentage === 'number' ? Math.min(100, Math.max(0, t.completionPercentage)) : 0;
            const status = t.status || (pct > 0 ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING);
            return {
              title: t.title,
              description: t.description || '',
              priority: t.priority || Priority.NORMAL,
              estimatedHours: t.estimatedHours || 1.0,
              displayOrder: idx + 1,
              status,
              completionPercentage: pct,
              completionNote: t.completionNote || null,
              carriedFromTaskId: t.carriedFromTaskId || null,
            };
          }),
        },
      },
      include: {
        tasks: {
          orderBy: { displayOrder: 'asc' },
          include: {
            carriedFromTask: {
              select: {
                id: true,
                title: true,
                completionPercentage: true,
                dailyPlan: { select: { planDate: true } },
              },
            },
          },
        },
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

  async getIncompleteTasks(user: any, excludeDateStr?: string) {
    if (!user.directorateId) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية معينة');
    }

    const targetDate = this.normalizeDate(excludeDateStr);

    // Fetch prior plans before targetDate
    const priorPlans = await this.prisma.dailyPlan.findMany({
      where: {
        directorateId: user.directorateId,
        planDate: { lt: targetDate },
      },
      select: { id: true, planDate: true },
      orderBy: { planDate: 'desc' },
    });

    if (priorPlans.length === 0) {
      return [];
    }

    const planIds = priorPlans.map((p) => p.id);
    const planDateMap = new Map(priorPlans.map((p) => [p.id, p.planDate]));

    // Find incomplete tasks in these plans:
    // completionPercentage < 100, status not COMPLETED/CANCELLED,
    // and not already continued (continuations: { none: {} })
    const tasks = await this.prisma.planTask.findMany({
      where: {
        dailyPlanId: { in: planIds },
        completionPercentage: { lt: 100 },
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        continuations: { none: {} },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Deduplicate by title to ensure only the latest occurrence is shown
    const seen = new Set<string>();
    const result = [];

    const now = new Date().getTime();
    for (const task of tasks) {
      const normalizedTitle = task.title.trim().toLowerCase();
      if (!seen.has(normalizedTitle)) {
        seen.add(normalizedTitle);
        const planDate = planDateMap.get(task.dailyPlanId);
        const diffMs = Math.abs(now - (planDate ? new Date(planDate).getTime() : now));
        const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        result.push({
          id: task.id,
          dailyPlanId: task.dailyPlanId,
          planDate: planDate ? planDate.toISOString() : null,
          title: task.title,
          description: task.description || '',
          priority: task.priority,
          estimatedHours: task.estimatedHours,
          status: task.status,
          completionPercentage: task.completionPercentage,
          completionNote: task.completionNote || '',
          daysAgo,
        });
      }
    }

    return result;
  }

  async getAchievementsReport(
    user: any,
    query: {
      startDate?: string;
      endDate?: string;
      month?: string;
      directorateId?: string;
      statusFilter?: string;
      minCompletionRate?: string | number;
    },
  ) {
    let targetDirectorateId: string | null = null;

    if (user.role === Role.DIRECTOR) {
      if (!user.directorateId) {
        throw new ForbiddenException('المستخدم غير مرتبط بمديرية معينة');
      }
      targetDirectorateId = user.directorateId;
    } else if (user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR) {
      targetDirectorateId = query.directorateId || user.directorateId || null;
      if (!targetDirectorateId) {
        const firstDir = await this.prisma.directorate.findFirst({ orderBy: { displayOrder: 'asc' } });
        targetDirectorateId = firstDir ? firstDir.id : null;
      }
    } else {
      throw new ForbiddenException('غير مصرح لك بالوصول لهذا التقرير');
    }

    if (!targetDirectorateId) {
      throw new BadRequestException('لم يتم تحديد المديرية المطلوبة');
    }

    // Determine date boundaries
    let startDate: Date;
    let endDate: Date;
    let periodLabel = '';

    if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
      const [yearStr, monthStr] = query.month.split('-');
      const year = parseInt(yearStr, 10);
      const monthIndex = parseInt(monthStr, 10) - 1;
      startDate = new Date(year, monthIndex, 1, 0, 0, 0, 0);
      endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
      periodLabel = startDate.toLocaleDateString('ar-SY', { month: 'long', year: 'numeric' });
    } else if (query.startDate && query.endDate) {
      startDate = new Date(query.startDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(query.endDate);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = `من ${startDate.toLocaleDateString('ar-SY', { year: 'numeric', month: 'short', day: 'numeric' })} إلى ${endDate.toLocaleDateString('ar-SY', { year: 'numeric', month: 'short', day: 'numeric' })}`;
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      periodLabel = startDate.toLocaleDateString('ar-SY', { month: 'long', year: 'numeric' });
    }

    // Fetch Directorate and Director
    const directorate = await this.prisma.directorate.findUnique({
      where: { id: targetDirectorateId },
      include: {
        users: {
          where: { role: Role.DIRECTOR },
          select: { id: true, fullName: true, title: true, email: true, phone: true },
          take: 1,
        },
      },
    });

    if (!directorate) {
      throw new NotFoundException('المديرية غير موجودة');
    }

    const director = directorate.users[0] || null;

    // Fetch daily plans within the range
    const plans = await this.prisma.dailyPlan.findMany({
      where: {
        directorateId: targetDirectorateId,
        planDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        tasks: {
          include: {
            continuations: { select: { id: true } },
          },
          orderBy: { displayOrder: 'asc' },
        },
        dailySummary: true,
        feedbacks: {
          include: { fromUser: { select: { fullName: true, title: true } } },
        },
      },
      orderBy: { planDate: 'asc' },
    });

    // Fetch executive tasks for this directorate
    const executiveTasks = await this.prisma.executiveTask.findMany({
      where: {
        directorateId: targetDirectorateId,
        OR: [
          { createdAt: { gte: startDate, lte: endDate } },
          { dueDate: { gte: startDate, lte: endDate } },
          { status: { in: [TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS] } },
        ],
      },
      include: {
        assignedBy: { select: { fullName: true, title: true } },
        assignedToUser: { select: { fullName: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const minNearingRate = query.minCompletionRate ? Number(query.minCompletionRate) : 70;

    const completedTasks: any[] = [];
    const nearingTasks: any[] = [];
    const inProgressTasks: any[] = [];

    // Process daily plan tasks
    for (const plan of plans) {
      for (const t of plan.tasks) {
        // Skip tasks that were carried over to another day, to avoid double-counting intermediate states
        if (t.continuations && t.continuations.length > 0) {
          continue;
        }

        const item = {
          id: t.id,
          dailyPlanId: plan.id,
          planDate: plan.planDate ? plan.planDate.toISOString() : null,
          title: t.title,
          description: t.description || '',
          priority: t.priority,
          estimatedHours: t.estimatedHours || 1.0,
          status: t.status,
          completionPercentage: t.completionPercentage,
          completionNote: t.completionNote || '',
          source: 'PLAN' as const,
          sourceLabel: 'خطة يومية',
        };

        if (t.completionPercentage === 100 || t.status === TaskStatus.COMPLETED) {
          completedTasks.push(item);
        } else if (t.completionPercentage >= minNearingRate) {
          nearingTasks.push(item);
        } else {
          inProgressTasks.push(item);
        }
      }
    }

    // Process executive tasks
    for (const et of executiveTasks) {
      const item = {
        id: et.id,
        dailyPlanId: null,
        planDate: et.createdAt ? et.createdAt.toISOString() : null,
        dueDate: et.dueDate ? et.dueDate.toISOString() : null,
        title: et.title,
        description: et.description || '',
        priority: et.priority,
        estimatedHours: 0,
        status: et.status,
        completionPercentage: et.completionPercentage,
        completionNote: et.completionNote || '',
        source: 'EXECUTIVE' as const,
        sourceLabel: 'تكليف مباشر من المدير العام',
        assignedBy: et.assignedBy?.fullName,
      };

      if (et.completionPercentage === 100 || et.status === TaskStatus.COMPLETED) {
        completedTasks.push(item);
      } else if (et.completionPercentage >= minNearingRate) {
        nearingTasks.push(item);
      } else {
        inProgressTasks.push(item);
      }
    }

    // Process summaries and key achievements
    const achievementsSet = new Set<string>();
    const challengesList: { date: string; text: string }[] = [];
    const dailySummariesList: any[] = [];
    let sumCompletionRate = 0;
    let summariesWithRateCount = 0;

    for (const plan of plans) {
      if (plan.dailySummary) {
        const ds = plan.dailySummary;
        dailySummariesList.push({
          id: ds.id,
          planDate: plan.planDate ? plan.planDate.toISOString() : null,
          summaryText: ds.summaryText,
          overallCompletionRate: ds.overallCompletionRate,
          achievements: ds.achievements || [],
          challenges: ds.challenges || null,
          directorNotes: ds.directorNotes || null,
          urgentFlag: ds.urgentFlag,
          submittedAt: ds.submittedAt ? ds.submittedAt.toISOString() : null,
        });

        if (ds.overallCompletionRate != null && ds.overallCompletionRate > 0) {
          sumCompletionRate += ds.overallCompletionRate;
          summariesWithRateCount++;
        }

        if (ds.achievements && Array.isArray(ds.achievements)) {
          for (const ach of ds.achievements) {
            if (ach && ach.trim()) {
              achievementsSet.add(ach.trim());
            }
          }
        }

        if (ds.challenges && ds.challenges.trim()) {
          challengesList.push({
            date: plan.planDate ? plan.planDate.toISOString() : '',
            text: ds.challenges.trim(),
          });
        }
      }
    }

    const keyAchievements = Array.from(achievementsSet);

    // Calculate aggregated statistics
    const totalCompletedCount = completedTasks.length;
    const totalNearingCount = nearingTasks.length;
    const totalTasksCount = completedTasks.length + nearingTasks.length + inProgressTasks.length;

    let averageCompletionRate = 0;
    if (summariesWithRateCount > 0) {
      averageCompletionRate = Math.round((sumCompletionRate / summariesWithRateCount) * 10) / 10;
    } else if (totalTasksCount > 0) {
      const all = [...completedTasks, ...nearingTasks, ...inProgressTasks];
      const sumPct = all.reduce((acc, curr) => acc + (curr.completionPercentage || 0), 0);
      averageCompletionRate = Math.round((sumPct / totalTasksCount) * 10) / 10;
    }

    const totalHours = Math.round(
      [...completedTasks, ...nearingTasks].reduce((acc, curr) => acc + (curr.estimatedHours || 0), 0) * 10,
    ) / 10;

    return {
      directorate: {
        id: directorate.id,
        name: directorate.name,
        code: directorate.code,
        category: directorate.category,
        description: directorate.description,
        icon: directorate.icon || 'Ship',
      },
      director: director
        ? {
            id: director.id,
            fullName: director.fullName,
            title: director.title,
            email: director.email,
            phone: director.phone,
          }
        : null,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        label: periodLabel,
        month: query.month || null,
      },
      stats: {
        totalPlansCount: plans.length,
        totalSummariesCount: dailySummariesList.length,
        totalTasksCount,
        completedTasksCount: totalCompletedCount,
        nearingTasksCount: totalNearingCount,
        inProgressTasksCount: inProgressTasks.length,
        averageCompletionRate,
        totalHours,
        executiveTasksCount: executiveTasks.length,
      },
      keyAchievements,
      completedTasks,
      nearingTasks,
      inProgressTasks: query.statusFilter === 'ALL' ? inProgressTasks : [],
      executiveTasks: executiveTasks.map((et) => ({
        id: et.id,
        title: et.title,
        description: et.description,
        priority: et.priority,
        status: et.status,
        completionPercentage: et.completionPercentage,
        completionNote: et.completionNote,
        dueDate: et.dueDate ? et.dueDate.toISOString() : null,
        createdAt: et.createdAt ? et.createdAt.toISOString() : null,
        assignedBy: et.assignedBy?.fullName,
      })),
      challenges: challengesList,
      dailySummaries: dailySummariesList,
    };
  }
}

