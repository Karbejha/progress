import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { Role, Priority, TaskStatus } from '@prisma/client';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class TodosService {
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

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
      orderBy: [
        { isCompleted: 'asc' },
        { displayOrder: 'asc' },
        { createdAt: 'desc' },
      ],
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
      todos,
      stats,
    };
  }

  async getTodoById(user: any, id: string) {
    const todo = await this.prisma.userTodo.findUnique({
      where: { id },
    });

    if (!todo || todo.userId !== user.id) {
      throw new NotFoundException('المهمة غير موجودة أو لا تملك صلاحية الوصول إليها');
    }

    return todo;
  }

  async createTodo(user: any, dto: CreateTodoDto) {
    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('يرجى إدخال عنوان المهمة');
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const pct = typeof dto.completionPercentage === 'number'
      ? Math.min(100, Math.max(0, Math.round(dto.completionPercentage)))
      : 0;

    const todo = await this.prisma.userTodo.create({
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

    return todo;
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

    const updated = await this.prisma.userTodo.update({
      where: { id },
      data,
    });

    if (dto.isCompleted !== undefined || dto.completionPercentage !== undefined) {
      await this.syncLinkedEntities(updated, updated.isCompleted, updated.completionPercentage);
    }

    this.eventsGateway.emitTodoUpdated(user.id);
    return updated;
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
    return updated;
  }

  async deleteTodo(user: any, id: string) {
    await this.getTodoById(user, id);

    await this.prisma.userTodo.delete({
      where: { id },
    });

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    const maxOrder = plan.tasks.reduce((max, t) => Math.max(max, t.displayOrder), 0);

    // Synchronize initial percentage and status from the todo
    const currentPct = typeof todo.completionPercentage === 'number'
      ? Math.min(100, Math.max(0, Math.round(todo.completionPercentage)))
      : (todo.isCompleted ? 100 : 0);
    const initialStatus = currentPct === 100
      ? TaskStatus.COMPLETED
      : (currentPct > 0 ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING);

    const planTask = await this.prisma.planTask.create({
      data: {
        dailyPlanId: plan.id,
        title: todo.title,
        description: todo.description,
        priority: todo.priority,
        estimatedHours: 1.0,
        status: initialStatus,
        completionPercentage: currentPct,
        displayOrder: maxOrder + 1,
      },
    });

    // Keep the todo active in the user's agenda and tag it with plan task ID
    const planTag = `[تم إدراجها في الخطة اليومية] [معرف المهمة: ${planTask.id}]`;
    const alreadyTagged = todo.description?.includes('الخطة اليومية');
    const updatedDesc = alreadyTagged
      ? todo.description.includes(planTask.id)
        ? todo.description
        : `${todo.description} [معرف المهمة: ${planTask.id}]`
      : todo.description
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
    const allExecTasks = await this.prisma.executiveTask.findMany({
      where: { directorateId: user.directorateId },
    });
    const allPcts = [
      ...allPlanTasks.map((t) => t.completionPercentage),
      ...allExecTasks.map((t) => t.completionPercentage),
    ];
    if (allPcts.length > 0) {
      const avg = allPcts.reduce((acc, curr) => acc + curr, 0) / allPcts.length;
      const summary = await this.prisma.dailySummary.findUnique({
        where: { dailyPlanId: plan.id },
      });
      if (summary) {
        await this.prisma.dailySummary.update({
          where: { id: summary.id },
          data: { overallCompletionRate: Math.round(avg * 10) / 10 },
        });
      }
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
   * Sync completion of linked PlanTask or ExecutiveTask when todo completion is changed
   */
  private async syncLinkedEntities(todo: any, isCompleted: boolean, percentage?: number) {
    try {
      const nextPercentage = typeof percentage === 'number'
        ? Math.min(100, Math.max(0, Math.round(percentage)))
        : (isCompleted ? 100 : 0);
      const nextStatus = nextPercentage === 100
        ? TaskStatus.COMPLETED
        : (nextPercentage > 0 ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING);

      // 1. Check if linked to a PlanTask
      const planMatch = todo.description?.match(/\[معرف المهمة:\s*([^\]]+)\]/);
      let planTaskId = planMatch && planMatch[1] ? planMatch[1].trim() : null;

      let planTask = planTaskId
        ? await this.prisma.planTask.findUnique({
            where: { id: planTaskId },
            include: { dailyPlan: { include: { directorate: true } } },
          })
        : null;

      // Fallback: If no explicit ID tag in description, try matching by clean title in today's daily plan
      if (!planTask && todo.title && todo.userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: todo.userId },
          select: { directorateId: true },
        });

        if (user?.directorateId) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const todayPlan = await this.prisma.dailyPlan.findUnique({
            where: {
              directorateId_planDate: {
                directorateId: user.directorateId,
                planDate: today,
              },
            },
            include: { tasks: true, directorate: true },
          });

          if (todayPlan) {
            const cleanTodoTitle = todo.title.trim().toLowerCase();
            const matched = todayPlan.tasks.find(
              (t) => t.title.trim().toLowerCase() === cleanTodoTitle,
            );
            if (matched) {
              planTask = {
                ...matched,
                dailyPlan: todayPlan,
              } as any;
              planTaskId = matched.id;

              // Ensure todo description has the explicit ID tag for subsequent fast queries
              const planTag = `[تم إدراجها في الخطة اليومية] [معرف المهمة: ${matched.id}]`;
              if (!todo.description?.includes(matched.id)) {
                const newDesc = todo.description ? `${todo.description}\n${planTag}` : planTag;
                await this.prisma.userTodo.update({
                  where: { id: todo.id },
                  data: { description: newDesc },
                });
              }
            }
          }
        }
      }

      if (planTask && planTaskId) {
        await this.prisma.planTask.update({
          where: { id: planTaskId },
          data: {
            status: nextStatus,
            completionPercentage: nextPercentage,
          },
        });

        // Recalculate summary overall completion rate if daily summary exists
        const allPlanTasks = await this.prisma.planTask.findMany({
          where: { dailyPlanId: planTask.dailyPlanId },
        });
        const allExecTasks = await this.prisma.executiveTask.findMany({
          where: { directorateId: planTask.dailyPlan.directorateId },
        });
        const allPcts = [
          ...allPlanTasks.map((t) => (t.id === planTaskId ? nextPercentage : t.completionPercentage)),
          ...allExecTasks.map((t) => t.completionPercentage),
        ];

        if (allPcts.length > 0) {
          const avg = allPcts.reduce((acc, curr) => acc + curr, 0) / allPcts.length;
          const summary = await this.prisma.dailySummary.findUnique({
            where: { dailyPlanId: planTask.dailyPlanId },
          });
          if (summary) {
            await this.prisma.dailySummary.update({
              where: { id: summary.id },
              data: { overallCompletionRate: Math.round(avg * 10) / 10 },
            });
          }
        }

        this.eventsGateway.emitTaskUpdated({
          directorateId: planTask.dailyPlan.directorateId,
          directorateName: planTask.dailyPlan.directorate.name,
          taskId: planTaskId,
          taskTitle: planTask.title,
          status: nextStatus,
          completionPercentage: nextPercentage,
        });
      }

      // 2. Check if linked to ExecutiveTask(s)
      const execMatches = [...(todo.description?.matchAll(/\[معرف التكليف:\s*([^\]]+)\]/g) || [])];
      for (const m of execMatches) {
        if (m[1]) {
          const execTaskId = m[1].trim();
          const execTask = await this.prisma.executiveTask.findUnique({
            where: { id: execTaskId },
            include: { directorate: true },
          });
          if (execTask) {
            const updated = await this.prisma.executiveTask.update({
              where: { id: execTaskId },
              data: {
                status: nextStatus,
                completionPercentage: nextPercentage,
              },
            });
            this.eventsGateway.emitExecutiveTaskUpdated({
              task: updated,
              directorateId: execTask.directorateId,
              directorateName: execTask.directorate.name,
              updatedByRole: 'DIRECTOR',
            });
          }
        }
      }
    } catch (err) {
      console.error('Failed to sync linked entities from todo:', err);
    }
  }
}
