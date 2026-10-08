import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { Role, Priority, TaskStatus, Prisma } from '@prisma/client';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { randomUUID } from 'crypto';
import { normalizePlanDate, progressDate, dailyExecutiveTasks, averageDailyRate, recordExecutiveProgress, withDailyExecutiveProgress } from '../common/daily-progress';
import { MAX_TODO_ATTACHMENTS, removeAttachmentFiles } from '../attachments/attachment-files';

@Injectable()
export class TodosService {
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

  private async replaceAttachments(tx: Prisma.TransactionClient, userId: string, todoId: string, ids: string[]) {
    if (!Array.isArray(ids) || ids.length > MAX_TODO_ATTACHMENTS || new Set(ids).size !== ids.length) {
      throw new BadRequestException('يُسمح بإرفاق عشرة ملفات كحد أقصى دون تكرار');
    }

    // Claim only private files uploaded by this user. The predicate also prevents
    // concurrent requests from moving the same upload between different todos.
    const claimed = await tx.attachment.updateMany({
      where: {
        id: { in: ids }, uploadedById: userId, category: 'TODO',
        announcementId: null, dailySummaryId: null, executiveTaskId: null,
        OR: [{ todoId: null }, { todoId }],
      },
      data: { todoId },
    });
    if (claimed.count !== ids.length) {
      throw new BadRequestException('أحد المرفقات غير موجود أو لا تملك صلاحية إرفاقه بهذه المهمة');
    }

    const removed = await tx.attachment.findMany({ where: { todoId, id: { notIn: ids } } });
    await tx.attachment.deleteMany({ where: { todoId, id: { notIn: ids } } });
    return removed;
  }

  async getTodos(
    user: any,
    query?: {
      isCompleted?: string;
      priority?: Priority | 'ALL';
      category?: string;
      search?: string;
    },
  ) {
    const where: any = {
      userId: user.id,
    };

    if (query?.isCompleted !== undefined && query?.isCompleted !== 'ALL') {
      where.isCompleted = query.isCompleted === 'true';
    }

    if (query?.priority && query.priority !== 'ALL') {
      where.priority = query.priority as Priority;
    }

    if (query?.category && query.category !== 'ALL') {
      where.category = query.category;
    }

    if (query?.search && query.search.trim()) {
      const q = query.search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const todos = await this.prisma.userTodo.findMany({
      where,
      include: { attachments: { orderBy: { createdAt: 'asc' } } },
      orderBy: [
        { isCompleted: 'asc' },
        { displayOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Fetch today's plan tasks if user is associated with a directorate to check for today's duplicates
    const todayPlanTaskTitles = new Set<string>();
    const todayPlanTaskTodoIds = new Set<string>();
    const todayPlanTaskIds = new Set<string>();

    if (user.directorateId) {
      const today = normalizePlanDate();

      const todayPlan = await this.prisma.dailyPlan.findUnique({
        where: {
          directorateId_planDate: {
            directorateId: user.directorateId,
            planDate: today,
          },
        },
        include: {
          tasks: {
            select: { id: true, title: true, description: true },
          },
        },
      });

      if (todayPlan?.tasks) {
        for (const t of todayPlan.tasks) {
          if (t.title) {
            todayPlanTaskTitles.add(t.title.trim().toLowerCase());
          }
          todayPlanTaskIds.add(t.id);
          const match = t.description?.match(/\[معرف المفكرة:\s*([^\]]+)\]/);
          if (match && match[1]) {
            todayPlanTaskTodoIds.add(match[1].trim());
          }
        }
      }
    }

    const enhancedTodos = todos.map((todo) => {
      const cleanTitle = todo.title.trim().toLowerCase();
      const inPlanByTitle = todayPlanTaskTitles.has(cleanTitle);
      const inPlanByTodoId = todayPlanTaskTodoIds.has(todo.id);
      const inPlanByTaskId = Array.from(todayPlanTaskIds).some((taskId) =>
        todo.description?.includes(taskId)
      );

      const isIncludedInTodayPlan = inPlanByTitle || inPlanByTodoId || inPlanByTaskId;

      return {
        ...todo,
        isIncludedInTodayPlan,
      };
    });

    // Compute user stats across all their todos
    const allUserTodos = await this.prisma.userTodo.findMany({
      where: { userId: user.id },
      select: { isCompleted: true, priority: true, dueDate: true, completionPercentage: true },
    });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const sumProgress = allUserTodos.reduce((acc, t) => {
      const taskPct = t.isCompleted ? 100 : Math.max(0, Math.min(100, t.completionPercentage ?? 0));
      return acc + taskPct;
    }, 0);

    const completionRate =
      allUserTodos.length > 0 ? Math.round(sumProgress / allUserTodos.length) : 0;

    const stats = {
      total: allUserTodos.length,
      completed: allUserTodos.filter((t) => t.isCompleted).length,
      pending: allUserTodos.filter((t) => !t.isCompleted).length,
      urgentPending: allUserTodos.filter(
        (t) => !t.isCompleted && (t.priority === Priority.URGENT || t.priority === Priority.HIGH),
      ).length,
      dueTodayPending: allUserTodos.filter((t) => {
        if (t.isCompleted || !t.dueDate) return false;
        const dStr = new Date(t.dueDate).toISOString().split('T')[0];
        return dStr === todayStr;
      }).length,
      completionRate,
    };

    return {
      todos: enhancedTodos,
      stats,
    };
  }

  async getTodoById(user: any, id: string) {
    const todo = await this.prisma.userTodo.findUnique({
      where: { id },
      include: { attachments: { orderBy: { createdAt: 'asc' } } },
    });

    if (!todo || todo.userId !== user.id) {
      throw new NotFoundException('المهمة غير موجودة أو لا تملك صلاحية الوصول إليها');
    }

    let isIncludedInTodayPlan = false;
    if (user.directorateId) {
      const today = normalizePlanDate();
      const todayPlan = await this.prisma.dailyPlan.findUnique({
        where: {
          directorateId_planDate: {
            directorateId: user.directorateId,
            planDate: today,
          },
        },
        include: {
          tasks: { select: { id: true, title: true, description: true } },
        },
      });

      if (todayPlan?.tasks) {
        const cleanTitle = todo.title.trim().toLowerCase();
        isIncludedInTodayPlan = todayPlan.tasks.some((t) => {
          const titleMatch = t.title.trim().toLowerCase() === cleanTitle;
          const descMatch = t.description?.includes(`[معرف المفكرة: ${todo.id}]`);
          const todoTagMatch = todo.description?.includes(`[معرف المهمة: ${t.id}]`);
          return titleMatch || descMatch || todoTagMatch;
        });
      }
    }

    return {
      ...todo,
      isIncludedInTodayPlan,
    };
  }

  async createTodo(user: any, dto: CreateTodoDto) {
    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('يرجى إدخال عنوان المهمة');
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const pct = typeof dto.completionPercentage === 'number'
      ? Math.min(100, Math.max(0, Math.round(dto.completionPercentage)))
      : 0;

    const todo = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userTodo.create({
        data: {
          userId: user.id,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          priority: dto.priority || Priority.NORMAL,
          dueDate,
          category: dto.category || 'GENERAL',
          completionPercentage: pct,
          isCompleted: pct === 100,
          completedAt: pct === 100 ? new Date() : null,
        },
      });
      if (dto.attachmentIds !== undefined) await this.replaceAttachments(tx, user.id, created.id, dto.attachmentIds);
      return created;
    });

    this.eventsGateway.emitTodoUpdated(user.id);
    return this.getTodoById(user, todo.id);
  }

  async updateTodo(user: any, id: string, dto: UpdateTodoDto) {
    const existing = await this.getTodoById(user, id);

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.displayOrder !== undefined) data.displayOrder = dto.displayOrder;

    if (dto.completionPercentage !== undefined) {
      const pct = Math.min(100, Math.max(0, Math.round(dto.completionPercentage)));
      data.completionPercentage = pct;
      if (pct === 100) {
        data.isCompleted = true;
        data.completedAt = existing.completedAt || new Date();
      } else if (dto.isCompleted === undefined) {
        data.isCompleted = false;
        data.completedAt = null;
      }
    }

    if (dto.isCompleted !== undefined) {
      data.isCompleted = dto.isCompleted;
      data.completedAt = dto.isCompleted ? (existing.completedAt || new Date()) : null;
      if (dto.completionPercentage === undefined) {
        data.completionPercentage = dto.isCompleted ? 100 : 0;
      }
    }

    const { updated, removed } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userTodo.update({ where: { id }, data });
      const removed = dto.attachmentIds !== undefined
        ? await this.replaceAttachments(tx, user.id, id, dto.attachmentIds)
        : [];
      return { updated, removed };
    });
    await removeAttachmentFiles(removed);

    await this.syncLinkedEntities(updated, updated.isCompleted, updated.completionPercentage, {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      dueDate: dto.dueDate,
      syncProgress: (data.completionPercentage !== undefined && data.completionPercentage !== existing.completionPercentage) ||
        (data.isCompleted !== undefined && data.isCompleted !== existing.isCompleted),
    });

    this.eventsGateway.emitTodoUpdated(user.id);
    return this.getTodoById(user, id);
  }

  async toggleTodo(user: any, id: string) {
    const existing = await this.getTodoById(user, id);
    const nextCompleted = !existing.isCompleted;
    const nextPercentage = nextCompleted ? 100 : 0;

    const updated = await this.prisma.userTodo.update({
      where: { id },
      data: {
        isCompleted: nextCompleted,
        completedAt: nextCompleted ? new Date() : null,
        completionPercentage: nextPercentage,
      },
    });

    await this.syncLinkedEntities(updated, nextCompleted, nextPercentage);
    this.eventsGateway.emitTodoUpdated(user.id);
    return this.getTodoById(user, id);
  }

  async deleteTodo(user: any, id: string) {
    await this.getTodoById(user, id);
    const attachments = await this.prisma.$transaction(async (tx) => {
      const attachments = await tx.attachment.findMany({ where: { todoId: id } });
      await tx.userTodo.delete({ where: { id } });
      return attachments;
    });
    await removeAttachmentFiles(attachments);
    this.eventsGateway.emitTodoUpdated(user.id);

    return { success: true, message: 'تم حذف المهمة بنجاح' };
  }

  async reorderTodos(user: any, orderedIds: string[]) {
    if (!orderedIds || orderedIds.length === 0) {
      return { success: true };
    }

    const updates = orderedIds.map((id, index) =>
      this.prisma.userTodo.updateMany({
        where: { id, userId: user.id },
        data: { displayOrder: index },
      }),
    );

    await this.prisma.$transaction(updates);
    return { success: true, message: 'تم حفظ ترتيب المهام بنجاح' };
  }

  /**
   * Convert a private user todo into a formal PlanTask in today's DailyPlan.
   * Only applicable for Directors linked to a directorate.
   */
  async convertToPlanTask(user: any, id: string) {
    if (!user.directorateId) {
      throw new ForbiddenException('المستخدم غير مرتبط بمديرية رسمية لإضافة مهام في الخطة اليومية');
    }

    const todo = await this.getTodoById(user, id);

    const today = normalizePlanDate();

    // Find or create today's daily plan
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
          status: 'SUBMITTED',
          submittedAt: new Date(),
          generalFocus: 'الخطة التشغيلية اليومية المعتمدة',
        },
        include: { tasks: true },
      });
    }

    // Check if task is already included in today's daily plan
    const alreadyInPlan = plan.tasks.some((t) => {
      const titleMatch = t.title.trim().toLowerCase() === todo.title.trim().toLowerCase();
      const descMatch = t.description?.includes(`[معرف المفكرة: ${todo.id}]`);
      const todoTagMatch = todo.description?.includes(`[معرف المهمة: ${t.id}]`);
      return titleMatch || descMatch || todoTagMatch;
    });

    if (alreadyInPlan) {
      throw new BadRequestException('هذه المهمة مدرجة بالفعل في الخطة اليومية لليوم ولا يمكن تكرارها في نفس اليوم');
    }

    const maxOrder = plan.tasks.reduce((max, t) => Math.max(max, t.displayOrder), 0);

    // Synchronize initial percentage and status from the todo
    const currentPct = typeof todo.completionPercentage === 'number'
      ? Math.min(100, Math.max(0, Math.round(todo.completionPercentage)))
      : (todo.isCompleted ? 100 : 0);
    const initialStatus = currentPct === 100
      ? TaskStatus.COMPLETED
      : (currentPct > 0 ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING);

    const cleanDesc = todo.description
      ? todo.description
          .replace(/\[تم تحويلها إلى الخطة اليومية الصباحية\]/g, '')
          .replace(/\[تم إدراجها في الخطة اليومية(?: بتاريخ:[^\]]+)?\]/g, '')
          .replace(/\[تم تحويلها إلى تكليف تنفيذي رسمي\]/g, '')
          .replace(/\[تم إسنادها كتكليف تنفيذي\]/g, '')
          .replace(/\[معرف المهمة:\s*[^\]]+\]/g, '')
          .replace(/\[معرف التكليف:\s*[^\]]+\]/g, '')
          .replace(/\[معرف المفكرة:\s*[^\]]+\]/g, '')
          .trim()
      : '';
    const planTaskDesc = cleanDesc
      ? `${cleanDesc}\n[معرف المفكرة: ${todo.id}]`
      : `[معرف المفكرة: ${todo.id}]`;

    const planTask = await this.prisma.planTask.create({
      data: {
        dailyPlanId: plan.id,
        title: todo.title,
        description: planTaskDesc,
        priority: todo.priority,
        estimatedHours: 1.0,
        status: initialStatus,
        completionPercentage: currentPct,
        displayOrder: maxOrder + 1,
      },
    });

    // Keep the todo active in the user's agenda and tag it with plan task ID and today's date
    const todayDateStr = today.toISOString().split('T')[0];
    const planTag = `[تم إدراجها في الخطة اليومية بتاريخ: ${todayDateStr}] [معرف المهمة: ${planTask.id}]`;
    const updatedDesc = todo.description
      ? `${todo.description}\n${planTag}`
      : planTag;

    await this.prisma.userTodo.update({
      where: { id },
      data: {
        isCompleted: currentPct === 100,
        completedAt: currentPct === 100 ? (todo.completedAt || new Date()) : null,
        completionPercentage: currentPct,
        description: updatedDesc,
      },
    });

    // Recalculate summary overall rate if daily summary already exists
    const allPlanTasks = await this.prisma.planTask.findMany({
      where: { dailyPlanId: plan.id },
    });
    const allExecTasks = await dailyExecutiveTasks(this.prisma, user.directorateId, today);
    const summary = await this.prisma.dailySummary.findUnique({ where: { dailyPlanId: plan.id } });
    if (summary) {
      await this.prisma.dailySummary.update({
        where: { id: summary.id },
        data: { overallCompletionRate: averageDailyRate(allPlanTasks, allExecTasks) },
      });
    }

    // Notify live clients via Socket
    const dir = await this.prisma.directorate.findUnique({ where: { id: user.directorateId } });
    this.eventsGateway.emitTaskUpdated({
      directorateId: user.directorateId,
      directorateName: dir?.name || 'مديرية',
      taskId: planTask.id,
      taskTitle: planTask.title,
      status: planTask.status,
      completionPercentage: currentPct,
    });
    this.eventsGateway.emitTodoUpdated(user.id);

    return {
      success: true,
      message: 'تم إدراج المهمة بنجاح في الخطة اليومية الرسمية للمديرية مع الاحتفاظ بها في الأجندة ومزامنة نسبة التقدم',
      planTask,
      planId: plan.id,
    };
  }

  /**
   * Convert a private user todo into an Executive Task assigned to directorates.
   * Only applicable for General Director / Assistant Director.
   */
  async convertToExecutiveTask(
    user: any,
    id: string,
    dto: { directorateIds: string[]; dueDate?: string },
  ) {
    const isExecutive =
      user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR;
    if (!isExecutive) {
      throw new ForbiddenException('فقط الإدارة العليا مخولة بإصدار تكليفات رسمية للمديريات');
    }

    if (!dto.directorateIds || dto.directorateIds.length === 0) {
      throw new BadRequestException('يرجى اختيار مديرية واحدة على الأقل لإسناد التكليف إليها');
    }

    const todo = await this.getTodoById(user, id);

    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : todo.dueDate
      ? new Date(todo.dueDate)
      : null;

    const currentPct = typeof todo.completionPercentage === 'number'
      ? Math.min(100, Math.max(0, Math.round(todo.completionPercentage)))
      : (todo.isCompleted ? 100 : 0);
    const initialStatus = currentPct === 100
      ? TaskStatus.COMPLETED
      : (currentPct > 0 ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING);

    const isJoint = dto.directorateIds.length > 1;
    const sharedGroupId = isJoint ? randomUUID() : null;
    const createdTasks = [];

    for (const directorateId of dto.directorateIds) {
      const directorate = await this.prisma.directorate.findUnique({
        where: { id: directorateId },
      });
      if (!directorate) continue;

      const task = await this.prisma.executiveTask.create({
        data: {
          title: todo.title,
          description: todo.description,
          priority: todo.priority,
          dueDate,
          status: initialStatus,
          completionPercentage: currentPct,
          assignedById: user.id,
          directorateId,
          sharedGroupId,
        },
        include: {
          assignedBy: {
            select: { id: true, fullName: true, title: true, role: true },
          },
          directorate: {
            select: { id: true, code: true, name: true, category: true, icon: true },
          },
        },
      });

      this.eventsGateway.emitExecutiveTaskCreated({
        directorateId,
        directorateName: directorate.name,
        assignedByName: user.fullName || 'المدير العام',
        task,
      });

      createdTasks.push(task);
    }

    // Keep the todo active in the user's agenda and tag it
    const taskIdsTag = createdTasks.map((t) => `[معرف التكليف: ${t.id}]`).join(' ');
    const execTag = `[تم تحويلها إلى تكليف تنفيذي رسمي] ${taskIdsTag}`;
    const alreadyTagged = todo.description?.includes('تكليف تنفيذي');
    const updatedDesc = alreadyTagged
      ? `${todo.description} ${taskIdsTag}`
      : todo.description
      ? `${todo.description}\n${execTag}`
      : execTag;

    await this.prisma.userTodo.update({
      where: { id },
      data: {
        isCompleted: currentPct === 100,
        completedAt: currentPct === 100 ? (todo.completedAt || new Date()) : null,
        completionPercentage: currentPct,
        description: updatedDesc,
      },
    });

    this.eventsGateway.emitTodoUpdated(user.id);

    return {
      success: true,
      message: `تم تحويل المهمة بنجاح إلى تكليف تنفيذي وإسنادها لـ ${createdTasks.length} مديرية مع الاحتفاظ بها في الأجندة ومزامنة نسبة التقدم`,
      createdTasks,
    };
  }

  /**
   * Sync completion of linked PlanTask or ExecutiveTask when todo completion or details are changed
   */
  private async syncLinkedEntities(
    todo: any,
    isCompleted: boolean,
    percentage?: number,
    options?: { title?: string; description?: string; priority?: Priority; dueDate?: string | null; syncProgress?: boolean },
  ) {
    try {
      const nextPercentage = typeof percentage === 'number'
        ? Math.min(100, Math.max(0, Math.round(percentage)))
        : (isCompleted ? 100 : 0);
      const nextStatus = nextPercentage === 100
        ? TaskStatus.COMPLETED
        : (nextPercentage > 0 ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING);
      const syncProgress = options?.syncProgress !== false;

      // 1. Extract ALL explicit PlanTask IDs from todo.description
      const planMatches = [...(todo.description?.matchAll(/\[معرف المهمة:\s*([^\]]+)\]/g) || [])];
      const explicitPlanTaskIds = new Set<string>(
        planMatches.map((m) => m[1].trim()).filter(Boolean)
      );

      // Find user and their directorate
      let directorateId: string | null = null;
      if (todo.userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: todo.userId },
          select: { directorateId: true },
        });
        directorateId = user?.directorateId || null;
      }

      // Check today's plan
      const today = normalizePlanDate();

      const todayPlan = directorateId
        ? await this.prisma.dailyPlan.findUnique({
            where: {
              directorateId_planDate: {
                directorateId,
                planDate: today,
              },
            },
            include: {
              tasks: {
                include: {
                  dailyPlan: { include: { directorate: true } },
                },
              },
              directorate: true,
            },
          })
        : null;

      const tasksToUpdateMap = new Map<string, any>();

      // A. Match tasks in today's daily plan first (highest priority)
      if (todayPlan && todayPlan.tasks && todayPlan.tasks.length > 0) {
        const cleanTodoTitle = (todo.title || '').trim().toLowerCase();

        for (const task of todayPlan.tasks) {
          const taskTitle = (task.title || '').trim().toLowerCase();
          const isExplicitId = explicitPlanTaskIds.has(task.id);
          const isCarriedId = task.carriedFromTaskId && explicitPlanTaskIds.has(task.carriedFromTaskId);
          const isTodoIdMatch = task.description?.includes(`[معرف المفكرة: ${todo.id}]`);
          const isTitleMatch =
            cleanTodoTitle &&
            (taskTitle === cleanTodoTitle ||
              cleanTodoTitle.includes(taskTitle) ||
              taskTitle.includes(cleanTodoTitle));

          if (isExplicitId || isCarriedId || isTodoIdMatch || isTitleMatch) {
            tasksToUpdateMap.set(task.id, task);
            explicitPlanTaskIds.add(task.id);

            // Ensure todo description has today's task ID for fast subsequent lookups
            if (!todo.description?.includes(task.id)) {
              const planTag = `[تم إدراجها في الخطة اليومية] [معرف المهمة: ${task.id}]`;
              const newDesc = todo.description ? `${todo.description}\n${planTag}` : planTag;
              await this.prisma.userTodo.update({
                where: { id: todo.id },
                data: { description: newDesc },
              });
              todo.description = newDesc;
            }
          }
        }
      }

      // B. Also load and update all remaining explicit PlanTask IDs (e.g. from previous days or carry-overs)
      for (const pId of explicitPlanTaskIds) {
        if (!tasksToUpdateMap.has(pId)) {
          const pTask = await this.prisma.planTask.findUnique({
            where: { id: pId },
            include: { dailyPlan: { include: { directorate: true } } },
          });
          if (pTask) {
            tasksToUpdateMap.set(pTask.id, pTask);
          }
        }
      }

      // Update all matched PlanTasks
      for (const [taskId, planTask] of tasksToUpdateMap) {
        const updateData: any = syncProgress ? {
          status: nextStatus,
          completionPercentage: nextPercentage,
        } : {};
        if (options?.title !== undefined && options.title.trim()) {
          updateData.title = options.title.trim();
        }
        if (options?.description !== undefined) {
          // Clean system tags from the description, then re-append the todo-link tag
          const cleanDesc = (options.description || '')
            .replace(/\[تم تحويلها إلى الخطة اليومية الصباحية\]/g, '')
            .replace(/\[تم إدراجها في الخطة اليومية(?: بتاريخ:[^\]]+)?\]/g, '')
            .replace(/\[تم تحويلها إلى تكليف تنفيذي رسمي\]/g, '')
            .replace(/\[تم إسنادها كتكليف تنفيذي\]/g, '')
            .replace(/\[معرف المهمة:\s*[^\]]+\]/g, '')
            .replace(/\[معرف التكليف:\s*[^\]]+\]/g, '')
            .replace(/\[معرف المفكرة:\s*[^\]]+\]/g, '')
            .trim();
          // Preserve the todo-link tag in PlanTask description
          const todoLinkTag = `[معرف المفكرة: ${todo.id}]`;
          const existingHasTag = planTask.description?.includes(todoLinkTag);
          updateData.description = cleanDesc
            ? `${cleanDesc}\n${existingHasTag ? todoLinkTag : todoLinkTag}`
            : (existingHasTag ? todoLinkTag : null);
        }
        if (options?.priority !== undefined) {
          updateData.priority = options.priority;
        }

        const updatedPlanTask = await this.prisma.planTask.update({
          where: { id: taskId },
          data: updateData,
        });

        // Recalculate summary overall rate if daily summary exists
        const allPlanTasks = await this.prisma.planTask.findMany({
          where: { dailyPlanId: planTask.dailyPlanId },
        });
        const allExecTasks = await dailyExecutiveTasks(this.prisma, planTask.dailyPlan.directorateId, planTask.dailyPlan.planDate);
        const summary = await this.prisma.dailySummary.findUnique({ where: { dailyPlanId: planTask.dailyPlanId } });
        if (summary) {
          await this.prisma.dailySummary.update({
            where: { id: summary.id },
            data: { overallCompletionRate: averageDailyRate(allPlanTasks, allExecTasks) },
          });
        }

        this.eventsGateway.emitTaskUpdated({
          directorateId: planTask.dailyPlan.directorateId,
          directorateName: planTask.dailyPlan.directorate.name,
          taskId: planTask.id,
          taskTitle: updateData.title || planTask.title,
          status: updatedPlanTask.status,
          completionPercentage: updatedPlanTask.completionPercentage,
        });
      }

      // 2. Check if linked to ExecutiveTask(s)
      const execMatches = [...(todo.description?.matchAll(/\[معرف التكليف:\s*([^\]]+)\]/g) || [])];
      const execTaskIds = new Set<string>(execMatches.map((m) => m[1].trim()).filter(Boolean));

      // Infer a legacy link only when no explicit link exists. Completed assignments
      // must never be reopened by an unrelated agenda item with a similar title.
      if (directorateId && execTaskIds.size === 0) {
        const cleanTodoTitle = (todo.title || '').trim().toLowerCase();
        if (cleanTodoTitle) {
          const activeExecs = await this.prisma.executiveTask.findMany({
            where: {
              directorateId,
              status: { not: TaskStatus.COMPLETED },
              completionPercentage: { lt: 100 },
            },
            include: { directorate: true },
          });
          for (const ext of activeExecs) {
            const extTitle = (ext.title || '').trim().toLowerCase();
            if (ext.status !== TaskStatus.COMPLETED && ext.completionPercentage < 100 && extTitle === cleanTodoTitle) {
              execTaskIds.add(ext.id);
            }
          }
        }
      }

      for (const execTaskId of execTaskIds) {
        const execTask = await this.prisma.executiveTask.findUnique({
          where: { id: execTaskId },
          include: { directorate: true },
        });
        if (execTask) {
          const execUpdateData: any = syncProgress ? {
            status: nextStatus,
            completionPercentage: nextPercentage,
          } : {};
          if (options?.title !== undefined && options.title.trim()) {
            execUpdateData.title = options.title.trim();
          }
          if (options?.description !== undefined) {
            // Clean system tags from the description for executive tasks
            const cleanExecDesc = (options.description || '')
              .replace(/\[تم تحويلها إلى الخطة اليومية الصباحية\]/g, '')
              .replace(/\[تم إدراجها في الخطة اليومية(?: بتاريخ:[^\]]+)?\]/g, '')
              .replace(/\[تم تحويلها إلى تكليف تنفيذي رسمي\]/g, '')
              .replace(/\[تم إسنادها كتكليف تنفيذي\]/g, '')
              .replace(/\[معرف المهمة:\s*[^\]]+\]/g, '')
              .replace(/\[معرف التكليف:\s*[^\]]+\]/g, '')
              .replace(/\[معرف المفكرة:\s*[^\]]+\]/g, '')
              .trim();
            execUpdateData.description = cleanExecDesc || null;
          }
          if (options?.priority !== undefined) {
            execUpdateData.priority = options.priority;
          }
          if (options?.dueDate !== undefined) {
            execUpdateData.dueDate = options.dueDate ? new Date(options.dueDate) : null;
          }
          const date = normalizePlanDate();
          const updated = await this.prisma.$transaction(async (tx) => {
            const targetMet = await recordExecutiveProgress(tx, execTaskId, execUpdateData, date);
            return tx.executiveTask.update({
              where: { id: execTaskId },
              data: { ...execUpdateData, todayTargetMet: targetMet },
              include: { dailyProgress: { where: { progressDate: progressDate(date) } } },
            });
          });
          const todayPlan = await this.prisma.dailyPlan.findUnique({
            where: { directorateId_planDate: { directorateId: updated.directorateId, planDate: date } },
            include: { tasks: true, dailySummary: true },
          });
          if (todayPlan?.dailySummary) {
            const execTasks = await dailyExecutiveTasks(this.prisma, updated.directorateId, date);
            await this.prisma.dailySummary.update({
              where: { id: todayPlan.dailySummary.id },
              data: { overallCompletionRate: averageDailyRate(todayPlan.tasks, execTasks) },
            });
          }
          this.eventsGateway.emitExecutiveTaskUpdated({
            task: withDailyExecutiveProgress(updated, date),
            directorateId: execTask.directorateId,
            directorateName: execTask.directorate.name,
            updatedByRole: 'DIRECTOR',
          });
        }
      }
    } catch (err) {
      console.error('Failed to sync linked entities from todo:', err);
    }
  }
}
