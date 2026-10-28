import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, PlanStatus, Priority, TaskStatus } from '@prisma/client';
import { activeDirectorateWhere, activeExecutiveTaskWhere } from '../common/active-directorates';

import { EventsGateway } from '../events/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizePlanDate, dailyExecutiveTasks, averageDailyRate, planDailyRate } from '../common/daily-progress';
import { collectLinkedPlanTasks, LinkedPlanTask } from '../common/plan-task-links';

export interface CreatePlanDto {
  planDate?: string;
  generalFocus?: string;
  isSilent?: boolean;
  tasks: {
    id?: string;
    title: string;
    description?: string;
    priority?: Priority;
    estimatedHours?: number;
    carriedFromTaskId?: string;
    isMultiDay?: boolean;
    todayTargetMet?: boolean;
    completionPercentage?: number;
    status?: TaskStatus;
    completionNote?: string;
    expectedProgress?: { status: TaskStatus; completionPercentage: number };
  }[];
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  priority?: Priority;
  estimatedHours?: number;
  status?: TaskStatus;
  completionPercentage?: number;
  completionNote?: string;
  isMultiDay?: boolean;
  todayTargetMet?: boolean;
}

@Injectable()
export class DailyPlansService {
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
    private notificationsService: NotificationsService,
  ) {}

  private normalizeDate(dateStr?: string): Date {
    return normalizePlanDate(dateStr);
  }

  private taskProgress(
    changes: { status?: TaskStatus; completionPercentage?: number },
    previous = { status: TaskStatus.PENDING as TaskStatus, completionPercentage: 0 },
  ) {
    if (changes.completionPercentage !== undefined && !Number.isFinite(changes.completionPercentage)) {
      throw new BadRequestException('نسبة الإنجاز غير صالحة');
    }
    let completionPercentage = Math.min(100, Math.max(0, Math.round(changes.completionPercentage ?? previous.completionPercentage)));
    let status = changes.status ?? (changes.completionPercentage === undefined
      ? previous.status
      : completionPercentage > 0 ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING);
    if (status === TaskStatus.COMPLETED) completionPercentage = 100;
    if (completionPercentage === 100 && status !== TaskStatus.CANCELLED) status = TaskStatus.COMPLETED;
    return { status, completionPercentage };
  }

  private async newTaskData(task: CreatePlanDto['tasks'][number], index: number, directorateId: string) {
    let progress = this.taskProgress(task);
    if (task.carriedFromTaskId) {
      const source = await this.prisma.planTask.findUnique({
        where: { id: task.carriedFromTaskId },
        include: { dailyPlan: true },
      });
      if (!source) throw new BadRequestException('المهمة الأصلية للترحيل غير موجودة');
      if (source.dailyPlan.directorateId !== directorateId) {
        throw new ForbiddenException('لا يمكن ترحيل مهمة من مديرية أخرى');
      }
      // A picker or imported plan may have been open before the source finished.
      // New copies always inherit the saved total, never the stale form value.
      progress = this.taskProgress({}, source);
    }
    return {
      title: task.title.trim(),
      description: task.description || '',
      priority: task.priority || Priority.NORMAL,
      estimatedHours: task.estimatedHours || 1.0,
      displayOrder: index + 1,
      ...progress,
      completionNote: task.completionNote || null,
      isMultiDay: task.isMultiDay !== undefined ? task.isMultiDay : !!task.carriedFromTaskId,
      todayTargetMet: task.carriedFromTaskId ? false : (task.todayTargetMet || false),
      carriedFromTaskId: task.carriedFromTaskId || null,
    };
  }

  public calculateDailyFulfillmentRate(task: {
    completionPercentage: number;
    status?: TaskStatus | string;
    isMultiDay?: boolean;
    todayTargetMet?: boolean;
    carriedFromTaskId?: string | null;
  }): number {
    return planDailyRate(task);
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
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (plan?.dailySummary && targetDate.getTime() === normalizePlanDate().getTime()) {
      const execTasks = await dailyExecutiveTasks(this.prisma, directorateId, targetDate);
      plan.dailySummary.overallCompletionRate = averageDailyRate(plan.tasks, execTasks);
    }
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
      const existingTasks = existing.tasks || [];
      const existingMapById = new Map<string, (typeof existingTasks)[0]>();
      existingTasks.forEach((t) => existingMapById.set(t.id, t));

      const matchedExistingIds = new Set<string>();
      const progressUpdates: LinkedPlanTask[] = [];
      const progressFamilies = new Map<string, string[]>();

      for (let idx = 0; idx < dto.tasks.length; idx++) {
        const t = dto.tasks[idx];
        let existingTask: (typeof existingTasks)[0] | undefined;

        if (t.id && existingMapById.has(t.id)) {
          existingTask = existingMapById.get(t.id);
        } else {
          // Match by title among unmatched existing tasks
          const normalizedTitle = t.title.trim().toLowerCase();
          existingTask = existingTasks.find(
            (et) => !matchedExistingIds.has(et.id) && et.title.trim().toLowerCase() === normalizedTitle
          );
        }

        if (existingTask) {
          matchedExistingIds.add(existingTask.id);

          const requested = this.taskProgress(t, existingTask);
          const expected = t.expectedProgress;
          const progressEdited = expected
            ? requested.status !== expected.status || requested.completionPercentage !== expected.completionPercentage
            : t.status !== undefined || t.completionPercentage !== undefined;
          const baselineMatches = expected
            ? expected.status === existingTask.status && expected.completionPercentage === existingTask.completionPercentage
            // Older clients send the entire form without distinguishing edits.
            // They may advance progress; reopening uses the task endpoint or a baseline.
            : requested.completionPercentage >= existingTask.completionPercentage &&
              (existingTask.status !== TaskStatus.CANCELLED || requested.status === TaskStatus.CANCELLED) &&
              (existingTask.status !== TaskStatus.COMPLETED || requested.status === TaskStatus.COMPLETED);
          const changeProgress = progressEdited && baselineMatches && (
            requested.status !== existingTask.status || requested.completionPercentage !== existingTask.completionPercentage
          );

          const completionNote =
            t.completionNote !== undefined && t.completionNote !== null && t.completionNote.trim().length > 0
              ? t.completionNote
              : existingTask.completionNote;

          const details = {
            title: t.title.trim(),
            description: t.description !== undefined ? t.description : existingTask.description,
            priority: t.priority || existingTask.priority,
            estimatedHours: t.estimatedHours !== undefined ? t.estimatedHours : existingTask.estimatedHours,
            displayOrder: idx + 1,
            completionNote,
            isMultiDay: t.isMultiDay !== undefined ? t.isMultiDay : (existingTask.isMultiDay || !!t.carriedFromTaskId),
            todayTargetMet: t.todayTargetMet !== undefined ? t.todayTargetMet : existingTask.todayTargetMet,
            carriedFromTaskId: t.carriedFromTaskId || existingTask.carriedFromTaskId,
          };
          let updatedTask;
          let progressSaved = changeProgress;
          try {
            updatedTask = await this.prisma.planTask.update({
              where: { id: existingTask.id, ...(changeProgress ? {
                status: existingTask.status, completionPercentage: existingTask.completionPercentage,
              } : {}) },
              data: { ...details, ...(changeProgress ? requested : {}) },
            });
          } catch (error) {
            if (!changeProgress || error.code !== 'P2025') throw error;
            // Progress changed between the plan read and this atomic write.
            // Save the text without restoring an obsolete percentage.
            progressSaved = false;
            updatedTask = await this.prisma.planTask.update({ where: { id: existingTask.id }, data: details });
          }

          if (progressSaved) {
            progressUpdates.push({ ...updatedTask, dailyPlan: existing });
          }
        } else {
          // New task added by director
          await this.prisma.planTask.create({
            data: {
              dailyPlanId: existing.id,
              ...await this.newTaskData(t, idx, directorateId),
            },
          });
        }
      }

      // Apply deliberate progress edits after the form's other rows have saved,
      // so an unchanged sibling row cannot restore stale completion afterward.
      for (const task of progressUpdates) {
        progressFamilies.set(task.id, await this.syncLinkedPlanTaskProgress(task));
      }

      // Delete tasks that were explicitly removed by the director in the form
      const idsToDelete = existingTasks
        .map((t) => t.id)
        .filter((id) => !matchedExistingIds.has(id));

      if (idsToDelete.length > 0) {
        await this.prisma.planTask.deleteMany({
          where: {
            id: { in: idsToDelete },
            dailyPlanId: existing.id,
          },
        });
      }

      const updated = await this.prisma.dailyPlan.update({
        where: { id: existing.id },
        data: {
          generalFocus: dto.generalFocus,
          status: PlanStatus.SUBMITTED,
          submittedAt: dto.isSilent ? (existing.submittedAt || new Date()) : new Date(),
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

      // Use the saved progress after family synchronization; an unchanged form
      // row may have carried an older percentage than the deliberately edited one.
      for (const task of updated.tasks) {
        if (!matchedExistingIds.has(task.id)) continue;
        await this.syncPlanTaskToUserTodo(
          user.id, task.id, task.title,
          task.status === TaskStatus.COMPLETED || task.completionPercentage === 100,
          task.priority, task.description, task.completionPercentage,
          progressFamilies.get(task.id),
        );
      }

      // If summary exists, recalculate overall completion rate
      if (updated.dailySummary) {
        const allPlanTasks = await this.prisma.planTask.findMany({
          where: { dailyPlanId: existing.id },
        });
        const allExecTasks = await dailyExecutiveTasks(this.prisma, directorateId, planDate);
        await this.prisma.dailySummary.update({
          where: { id: updated.dailySummary.id },
          data: { overallCompletionRate: averageDailyRate(allPlanTasks, allExecTasks) },
        });
      }

      // Emit real-time notification to executive leadership only if NOT silent auto-save
      if (!dto.isSilent) {
        this.eventsGateway.emitPlanSubmitted({
          directorateId: updated.directorateId,
          directorateName: updated.directorate.name,
          directorName: user.fullName,
          tasksCount: updated.tasks.length,
          planDate: updated.planDate.toISOString(),
        });

        await this.notificationsService.createNotificationForRoles(
          [Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR, Role.OBSERVER],
          {
            type: 'plan',
            title: 'رفع خطة صباحية',
            message: `قامت (${updated.directorate.name}) باعتماد ورفع خطة اليوم (${updated.tasks.length} مهام).`,
            referenceId: `plan-sub-${updated.directorateId}-${updated.planDate.toISOString().split('T')[0]}`,
            metadata: {
              directorateId: updated.directorateId,
              directorateName: updated.directorate.name,
              directorName: user.fullName,
              tasksCount: updated.tasks.length,
              planDate: updated.planDate.toISOString(),
            },
          },
          user.id,
        );
      }

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
          create: await Promise.all(dto.tasks.map((task, index) => this.newTaskData(task, index, directorateId))),
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

    if (!dto.isSilent) {
      this.eventsGateway.emitPlanSubmitted({
        directorateId: created.directorateId,
        directorateName: created.directorate.name,
        directorName: user.fullName,
        tasksCount: created.tasks.length,
        planDate: created.planDate.toISOString(),
      });

      // Persist notification for executive users
      await this.notificationsService.createNotificationForRoles(
        [Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR, Role.OBSERVER],
        {
          type: 'plan',
          title: 'رفع خطة صباحية',
          message: `قامت (${created.directorate.name}) باعتماد ورفع خطة اليوم (${created.tasks.length} مهام).`,
          referenceId: `plan-sub-${created.directorateId}-${created.planDate.toISOString().split('T')[0]}`,
          metadata: {
            directorateId: created.directorateId,
            directorateName: created.directorate.name,
            directorName: user.fullName,
            tasksCount: created.tasks.length,
            planDate: created.planDate.toISOString(),
          },
        },
        user.id,
      );
    }

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

    if (user.role === Role.OBSERVER) {
      throw new ForbiddenException('حساب المراقب مخصص للاطلاع فقط ولا يمتلك صلاحية تعديل المهام');
    }

    // Check ownership
    if (user.role === Role.DIRECTOR && task.dailyPlan.directorateId !== user.directorateId) {
      throw new ForbiddenException('غير مصرح لك بتعديل مهام مديرية أخرى');
    }

    const updatedTask = await this.prisma.planTask.update({
      where: { id: taskId },
      data: {
        title: dto.title !== undefined ? dto.title.trim() : task.title,
        description: dto.description !== undefined ? dto.description : task.description,
        priority: dto.priority !== undefined ? dto.priority : task.priority,
        estimatedHours: dto.estimatedHours !== undefined ? dto.estimatedHours : task.estimatedHours,
        ...this.taskProgress(dto, task),
        completionNote: dto.completionNote !== undefined ? dto.completionNote : task.completionNote,
        isMultiDay: dto.isMultiDay !== undefined ? dto.isMultiDay : task.isMultiDay,
        todayTargetMet: dto.todayTargetMet !== undefined ? dto.todayTargetMet : task.todayTargetMet,
      },
    });

    const hasStatusChanged = updatedTask.status !== task.status;
    const hasPercentageChanged = updatedTask.completionPercentage !== task.completionPercentage;
    let linkedTaskIds: string[] | undefined;
    if (hasStatusChanged || hasPercentageChanged) {
      linkedTaskIds = await this.syncLinkedPlanTaskProgress({ ...updatedTask, dailyPlan: task.dailyPlan });
    }

    // Recalculate summary completion rate if summary exists
    const allPlanTasks = await this.prisma.planTask.findMany({
      where: { dailyPlanId: task.dailyPlanId },
    });
    const allExecTasks = await dailyExecutiveTasks(this.prisma, task.dailyPlan.directorateId, task.dailyPlan.planDate);
    const summary = await this.prisma.dailySummary.findUnique({
      where: { dailyPlanId: task.dailyPlanId },
    });
    if (summary) {
      await this.prisma.dailySummary.update({
        where: { id: summary.id },
        data: { overallCompletionRate: averageDailyRate(allPlanTasks, allExecTasks) },
      });
    }

    const hasNoteChanged =
      dto.completionNote !== undefined && (dto.completionNote || '').trim() !== (task.completionNote || '').trim();
    const hasTodayTargetMetChanged = dto.todayTargetMet !== undefined && dto.todayTargetMet !== task.todayTargetMet;
    const hasDetailsChanged = (dto.title !== undefined && dto.title.trim() !== task.title) ||
      (dto.description !== undefined && dto.description !== task.description) ||
      (dto.priority !== undefined && dto.priority !== task.priority);
    const hasChanges = hasStatusChanged || hasPercentageChanged || hasNoteChanged || hasTodayTargetMetChanged || hasDetailsChanged;

    if (hasChanges) {
      console.log(`[DAILY-PLANS] Emitting and persisting task update for task ${updatedTask.id}`);
      this.eventsGateway.emitTaskUpdated({
        directorateId: task.dailyPlan.directorateId,
        directorateName: task.dailyPlan.directorate.name,
        taskId: updatedTask.id,
        taskTitle: updatedTask.title,
        status: updatedTask.status,
        completionPercentage: updatedTask.completionPercentage,
        completionNote: updatedTask.completionNote || undefined,
      });

      // Each deliberate progress update is a separate readable notification.
      const notification = {
        type: 'task',
        title: 'تحديث حالة مهمة',
        message: `قامت (${task.dailyPlan.directorate.name}) بتحديث: "${updatedTask.title}" (${updatedTask.completionPercentage}%).`,
        referenceId: `task-up-${updatedTask.id}`,
        metadata: {
          directorateId: task.dailyPlan.directorateId,
          directorateName: task.dailyPlan.directorate.name,
          taskId: updatedTask.id,
          taskTitle: updatedTask.title,
          status: updatedTask.status,
          completionPercentage: updatedTask.completionPercentage,
          completionNote: updatedTask.completionNote || undefined,
          todayTargetMet: updatedTask.todayTargetMet,
          description: updatedTask.description,
          priority: updatedTask.priority,
          planDate: task.dailyPlan.planDate.toISOString(),
        },
      };
      if (user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR) {
        await this.notificationsService.createNotificationForDirectorate(task.dailyPlan.directorateId, notification, user.id);
      } else {
        await this.notificationsService.createNotificationForRoles(
          [Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR, Role.OBSERVER], notification, user.id,
        );
      }
    }

    // Sync task completion state to Director's personal agenda (UserTodo)
    const isCompleted = updatedTask.status === TaskStatus.COMPLETED || updatedTask.completionPercentage === 100;
    const targetUserId = task.dailyPlan.userId || user.id;
    await this.syncPlanTaskToUserTodo(
      targetUserId,
      updatedTask.id,
      updatedTask.title,
      isCompleted,
      updatedTask.priority,
      updatedTask.description,
      updatedTask.completionPercentage,
      linkedTaskIds,
    );
    if (user.id && user.id !== targetUserId) {
      await this.syncPlanTaskToUserTodo(
        user.id,
        updatedTask.id,
        updatedTask.title,
        isCompleted,
        updatedTask.priority,
        updatedTask.description,
        updatedTask.completionPercentage,
        linkedTaskIds,
      );
    }

    return updatedTask;
  }

  private async syncLinkedPlanTaskProgress(task: LinkedPlanTask) {
    const family = await collectLinkedPlanTasks(this.prisma, [task], task.dailyPlan.directorateId);
    const changedTasks: LinkedPlanTask[] = [];
    for (const related of family.values()) {
      if (related.id === task.id || (
        related.status === task.status && related.completionPercentage === task.completionPercentage
      )) continue;
      const updated = await this.prisma.planTask.update({
        where: { id: related.id },
        data: { status: task.status, completionPercentage: task.completionPercentage },
      });
      changedTasks.push({ ...updated, dailyPlan: related.dailyPlan });
    }

    // The caller recalculates the selected plan after this method completes.
    const otherPlans = new Map(changedTasks
      .filter((related) => related.dailyPlanId !== task.dailyPlanId)
      .map((related) => [related.dailyPlanId, related.dailyPlan]));
    for (const [dailyPlanId, plan] of otherPlans) {
      const summary = await this.prisma.dailySummary.findUnique({ where: { dailyPlanId } });
      if (!summary) continue;
      const planTasks = await this.prisma.planTask.findMany({ where: { dailyPlanId } });
      const execTasks = await dailyExecutiveTasks(this.prisma, plan.directorateId, plan.planDate);
      await this.prisma.dailySummary.update({
        where: { id: summary.id },
        data: { overallCompletionRate: averageDailyRate(planTasks, execTasks) },
      });
    }
    for (const related of changedTasks) {
      this.eventsGateway.emitTaskUpdated({
        directorateId: related.dailyPlan.directorateId,
        directorateName: related.dailyPlan.directorate?.name || '',
        taskId: related.id,
        taskTitle: related.title,
        status: related.status,
        completionPercentage: related.completionPercentage,
        completionNote: related.completionNote || undefined,
      });
    }
    return [...family.keys()];
  }

  async addQuickTask(
    user: any,
    dto: { title: string; description?: string; priority?: Priority; estimatedHours?: number },
  ) {
    if (!user.directorateId && user.role === Role.DIRECTOR) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية معينة');
    }
    const today = this.normalizeDate();
    let plan = await this.prisma.dailyPlan.findUnique({
      where: {
        directorateId_planDate: {
          directorateId: user.directorateId,
          planDate: today,
        },
      },
      include: { tasks: true },
    });

    if (!plan) {
      plan = await this.prisma.dailyPlan.create({
        data: {
          directorateId: user.directorateId,
          userId: user.id,
          planDate: today,
          status: PlanStatus.SUBMITTED,
          submittedAt: new Date(),
          generalFocus: 'الخطة اليومية',
        },
        include: { tasks: true },
      });
    }

    const maxOrder = plan.tasks.reduce((max, t) => Math.max(max, t.displayOrder), 0);
    const createdTask = await this.prisma.planTask.create({
      data: {
        dailyPlanId: plan.id,
        title: dto.title.trim(),
        description: dto.description || '',
        priority: dto.priority || Priority.NORMAL,
        estimatedHours: dto.estimatedHours || 1.5,
        displayOrder: maxOrder + 1,
        status: TaskStatus.PENDING,
        completionPercentage: 0,
      },
    });

    // Sync to user todo
    await this.syncPlanTaskToUserTodo(
      user.id,
      createdTask.id,
      createdTask.title,
      false,
      createdTask.priority,
      createdTask.description,
      0,
    );

    return createdTask;
  }

  /**
   * Synchronize completion of a daily plan task with the director's personal agenda (UserTodo)
   */
  async syncPlanTaskToUserTodo(
    userId: string,
    taskId: string,
    title: string,
    isCompleted: boolean,
    priority: Priority,
    description?: string | null,
    completionPercentage?: number,
    linkedTaskIds: string[] = [taskId],
  ) {
    try {
      const cleanTitle = title.trim();
      const planTag = `[تم إدراجها في الخطة اليومية] [معرف المهمة: ${taskId}]`;
      const pct = typeof completionPercentage === 'number'
        ? completionPercentage
        : (isCompleted ? 100 : 0);

      // Check if plan task description contains linked UserTodo ID
      const todoIdMatch = description?.match(/\[معرف المفكرة:\s*([^\]]+)\]/);
      const linkedTodoId = todoIdMatch ? todoIdMatch[1].trim() : null;

      const orConditions: any[] = [
        ...linkedTaskIds.map((id) => ({ description: { contains: id } })),
        {
          userId,
          title: { equals: cleanTitle, mode: 'insensitive' },
        },
      ];
      if (linkedTodoId) {
        orConditions.push({ id: linkedTodoId });
      }

      // Find existing todo by taskId in description, linked todo ID, or title
      const candidates = await this.prisma.userTodo.findMany({
        where: {
          OR: orConditions,
        },
      });
      const familyIds = new Set([taskId, ...linkedTaskIds]);
      const existingTodos = candidates.filter((todo) => {
        const explicitIds = [...(todo.description?.matchAll(/\[معرف المهمة:\s*([^\]]+)\]/g) || [])]
          .map((match) => match[1].trim());
        return todo.id === linkedTodoId || explicitIds.some((id) => familyIds.has(id)) || (
          explicitIds.length === 0 && todo.userId === userId && todo.title.trim().toLowerCase() === cleanTitle.toLowerCase()
        );
      });

      if (existingTodos.length > 0) {
        for (const todo of existingTodos) {
          const alreadyHasTag = todo.description?.includes(taskId);

          // Build updated description: merge cleaned PlanTask description with existing TODO tags
          let newDesc = todo.description || '';
          if (description !== undefined && description !== null) {
            // Clean PlanTask description from system tags
            const cleanPlanDesc = (description || '')
              .replace(/\[معرف المفكرة:\s*[^\]]+\]/g, '')
              .replace(/\[معرف المهمة:\s*[^\]]+\]/g, '')
              .replace(/\[معرف التكليف:\s*[^\]]+\]/g, '')
              .trim();

            // Extract existing system tags from the TODO description to preserve them
            const existingTags: string[] = [];
            const tagPatterns = [
              /\[تم إدراجها في الخطة اليومية[^\]]*\]/g,
              /\[تم تحويلها إلى الخطة اليومية الصباحية\]/g,
              /\[تم تحويلها إلى تكليف تنفيذي رسمي\]/g,
              /\[تم إسنادها كتكليف تنفيذي\]/g,
              /\[معرف المهمة:\s*[^\]]+\]/g,
              /\[معرف التكليف:\s*[^\]]+\]/g,
              /\[معرف المفكرة:\s*[^\]]+\]/g,
            ];
            for (const pattern of tagPatterns) {
              const matches = newDesc.match(pattern);
              if (matches) existingTags.push(...matches);
            }

            // Rebuild: clean description + preserved tags
            const tagsStr = existingTags.length > 0 ? '\n' + existingTags.join(' ') : '';
            newDesc = cleanPlanDesc ? `${cleanPlanDesc}${tagsStr}` : (existingTags.length > 0 ? existingTags.join(' ') : '');
          }

          if (!alreadyHasTag) {
            newDesc = newDesc ? `${newDesc}\n${planTag}` : planTag;
          }
          const willBeCompleted = isCompleted || pct === 100;
          await this.prisma.userTodo.update({
            where: { id: todo.id },
            data: {
              title: cleanTitle,
              priority: priority || todo.priority,
              isCompleted: willBeCompleted,
              completedAt: willBeCompleted ? (todo.completedAt || new Date()) : null,
              completionPercentage: pct,
              description: newDesc,
            },
          });
          this.eventsGateway.emitTodoUpdated(todo.userId);
        }
      } else if (isCompleted || pct === 100) {
        // If not in agenda and marked completed in DirectorPortal, create it as a completed todo
        const desc = description?.trim() ? `${description.trim()}\n${planTag}` : planTag;
        await this.prisma.userTodo.create({
          data: {
            userId,
            title: cleanTitle,
            description: desc,
            priority: priority || Priority.NORMAL,
            category: 'OFFICIAL',
            completionPercentage: pct,
            isCompleted: true,
            completedAt: new Date(),
          },
        });
        this.eventsGateway.emitTodoUpdated(userId);
      }
    } catch (err) {
      console.error('Failed to sync plan task to user todo:', err);
    }
  }

  async deletePlanTask(user: any, taskId: string) {
    const task = await this.prisma.planTask.findUnique({
      where: { id: taskId },
      include: { dailyPlan: { include: { directorate: true } } },
    });

    if (!task) {
      throw new NotFoundException('المهمة غير موجودة');
    }

    if (user.role === Role.OBSERVER) {
      throw new ForbiddenException('حساب المراقب مخصص للاطلاع فقط ولا يمتلك صلاحية حذف المهام');
    }

    if (user.role === Role.DIRECTOR && task.dailyPlan.directorateId !== user.directorateId) {
      throw new ForbiddenException('غير مصرح لك بحذف مهام مديرية أخرى');
    }

    await this.prisma.planTask.delete({
      where: { id: taskId },
    });

    // Recalculate summary completion rate if summary exists
    const allPlanTasks = await this.prisma.planTask.findMany({
      where: { dailyPlanId: task.dailyPlanId },
    });
    const allExecTasks = await dailyExecutiveTasks(this.prisma, task.dailyPlan.directorateId, task.dailyPlan.planDate);
    const summary = await this.prisma.dailySummary.findUnique({
      where: { dailyPlanId: task.dailyPlanId },
    });
    if (summary) {
      await this.prisma.dailySummary.update({
        where: { id: summary.id },
        data: { overallCompletionRate: averageDailyRate(allPlanTasks, allExecTasks) },
      });
    }

    this.eventsGateway.emitTaskUpdated({
      directorateId: task.dailyPlan.directorateId,
      directorateName: task.dailyPlan.directorate.name,
      taskId: task.id,
      taskTitle: task.title,
      status: TaskStatus.CANCELLED,
      completionPercentage: 0,
    });

    return { success: true, message: 'تم حذف المهمة من الخطة بنجاح' };
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
          include: { fromUser: { select: { fullName: true, title: true, role: true } } },
          orderBy: { createdAt: 'asc' },
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

    const incompleteIds = new Set((await this.getIncompleteTasks(user, currentDateStr)).map(task => task.id));

    return {
      previousDate: previousPlan.planDate,
      generalFocus: previousPlan.generalFocus,
      tasks: previousPlan.tasks.filter(task => incompleteIds.has(task.id)).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        priority: t.priority,
        estimatedHours: t.estimatedHours,
        status: t.status,
        completionPercentage: t.completionPercentage,
        carriedFromTaskId: t.id,
      })),
    };
  }

  async getIncompleteTasks(user: any, excludeDateStr?: string) {
    if (!user.directorateId) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية معينة');
    }

    const targetDate = this.normalizeDate(excludeDateStr);

    // 1. Fetch current/today's plan (planDate >= targetDate) to identify tasks already in progress or completed today
    const currentPlans = await this.prisma.dailyPlan.findMany({
      where: {
        directorateId: user.directorateId,
        planDate: { gte: targetDate },
      },
      include: {
        tasks: true,
      },
    });

    // Titles of tasks active or completed in the current plan
    const activeTodayTitles = new Set<string>();
    for (const cp of currentPlans) {
      for (const t of cp.tasks) {
        const norm = t.title.trim().toLowerCase();
        if (norm) {
          activeTodayTitles.add(norm);
        }
      }
    }

    // 2. Fetch prior plans before targetDate, ordered descending by planDate
    const priorPlans = await this.prisma.dailyPlan.findMany({
      where: {
        directorateId: user.directorateId,
        planDate: { lt: targetDate },
      },
      include: {
        tasks: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { planDate: 'desc' },
    });

    if (priorPlans.length === 0) {
      return [];
    }

    // Resolve explicit carryover links across this directorate's plans. A closed
    // original also closes stale descendants, even when their titles changed.
    const allTasks = [...currentPlans, ...priorPlans].flatMap((plan) => plan.tasks);
    const tasksById = new Map(allTasks.map((task) => [task.id, task]));
    const relatedTaskIds = new Map(allTasks.map((task) => [task.id, new Set<string>()]));
    for (const task of allTasks) {
      if (task.carriedFromTaskId && tasksById.has(task.carriedFromTaskId)) {
        relatedTaskIds.get(task.id).add(task.carriedFromTaskId);
        relatedTaskIds.get(task.carriedFromTaskId).add(task.id);
      }
    }

    const collectRelatedTaskIds = (seedIds: Iterable<string>): Set<string> => {
      const visited = new Set<string>();
      const queue = [...seedIds];
      for (let index = 0; index < queue.length; index++) {
        const taskId = queue[index];
        if (visited.has(taskId)) continue;
        visited.add(taskId);
        for (const relatedId of relatedTaskIds.get(taskId) || []) {
          if (!visited.has(relatedId)) queue.push(relatedId);
        }
      }
      return visited;
    };
    const closedTaskIds = collectRelatedTaskIds(allTasks.filter((task) =>
      task.status === TaskStatus.COMPLETED ||
      task.status === TaskStatus.CANCELLED ||
      task.completionPercentage >= 100
    ).map((task) => task.id));
    const activeTaskIds = collectRelatedTaskIds(currentPlans.flatMap((plan) =>
      plan.tasks.map((task) => task.id)
    ));

    // Keep only the newest occurrence of each title and each linked task.
    const seenTitles = new Set<string>();
    const seenTaskIds = new Set<string>();
    const result = [];
    const now = new Date().getTime();

    for (const plan of priorPlans) {
      for (const task of plan.tasks) {
        const normalizedTitle = task.title.trim().toLowerCase();
        if (!normalizedTitle) continue;

        // If already active in today's plan, skip it completely
        if (activeTodayTitles.has(normalizedTitle) || activeTaskIds.has(task.id)) {
          continue;
        }

        // If we already saw a newer occurrence of this task title, skip older occurrences
        if (seenTitles.has(normalizedTitle) || seenTaskIds.has(task.id)) {
          continue;
        }

        seenTitles.add(normalizedTitle);
        for (const relatedId of collectRelatedTaskIds([task.id])) {
          seenTaskIds.add(relatedId);
        }

        if (closedTaskIds.has(task.id)) {
          continue;
        }

        const planDate = plan.planDate;
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
          isMultiDay: task.isMultiDay || true,
          todayTargetMet: false,
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
    } else if (user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR || user.role === Role.OBSERVER) {
      targetDirectorateId = query.directorateId || user.directorateId || null;
      if (!targetDirectorateId) {
        const firstDir = await this.prisma.directorate.findFirst({ where: activeDirectorateWhere, orderBy: { displayOrder: 'asc' } });
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
      where: { id: targetDirectorateId, AND: [activeDirectorateWhere] },
      include: {
        users: {
          where: { role: Role.DIRECTOR, isActive: true },
          select: { id: true, fullName: true, title: true, email: true, phone: true },
          take: 1,
        },
      },
    });

    if (!directorate) {
      throw new NotFoundException('المديرية غير موجودة أو مستبعدة من التقارير لتعطيل حساب مديرها');
    }

    const director = directorate.users[0] || null;

    // Fetch daily plans within the range
    const plans = await this.prisma.dailyPlan.findMany({
      where: {
        directorateId: targetDirectorateId,
        user: { isActive: true },
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
        dailySummary: { where: { user: { isActive: true } } },
        feedbacks: {
          include: { fromUser: { select: { fullName: true, title: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { planDate: 'asc' },
    });

    // Fetch executive tasks for this directorate
    const executiveTasks = await this.prisma.executiveTask.findMany({
      where: {
        directorateId: targetDirectorateId,
        AND: [activeExecutiveTaskWhere],
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
          isMultiDay: t.isMultiDay,
          todayTargetMet: t.todayTargetMet,
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

    // 1. Calculate true cumulative completion rate across unique tasks
    const all = [...completedTasks, ...nearingTasks, ...inProgressTasks];
    let averageCompletionRate = 0;
    if (totalTasksCount > 0) {
      const sumPct = all.reduce((acc, curr) => acc + (curr.completionPercentage || 0), 0);
      averageCompletionRate = Math.round((sumPct / totalTasksCount) * 10) / 10;
    } else if (summariesWithRateCount > 0) {
      averageCompletionRate = Math.round((sumCompletionRate / summariesWithRateCount) * 10) / 10;
    }

    const averageDailyFulfillmentRate =
      summariesWithRateCount > 0
        ? Math.round((sumCompletionRate / summariesWithRateCount) * 10) / 10
        : averageCompletionRate;

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
        averageDailyFulfillmentRate,
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

