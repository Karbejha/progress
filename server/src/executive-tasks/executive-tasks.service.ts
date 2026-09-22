import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Priority, TaskStatus } from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { randomUUID } from 'crypto';

export interface CreateExecutiveTaskDto {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: string;
  directorateIds: string[];
  assignedToUserId?: string;
  attachmentIds?: string[];
}

export interface UpdateExecutiveTaskDto {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: string;
  status?: TaskStatus;
  completionPercentage?: number;
  completionNote?: string;
  directorateId?: string;
  assignedToUserId?: string;
  todayTargetMet?: boolean;
  attachmentIds?: string[];
}

@Injectable()
export class ExecutiveTasksService {
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
    private notificationsService: NotificationsService,
  ) {}

  private async enrichTasksWithCoTasks(tasks: any[]) {
    if (!tasks || tasks.length === 0) return [];

    const groupIds = Array.from(
      new Set(tasks.map((t) => t.sharedGroupId).filter(Boolean))
    ) as string[];

    let siblingMap = new Map<string, any[]>();
    if (groupIds.length > 0) {
      const allGroupTasks = await this.prisma.executiveTask.findMany({
        where: { sharedGroupId: { in: groupIds } },
        include: {
          directorate: {
            select: { id: true, code: true, name: true, category: true, icon: true },
          },
        },
        orderBy: { directorate: { displayOrder: 'asc' } },
      });

      for (const gt of allGroupTasks) {
        if (!gt.sharedGroupId) continue;
        const arr = siblingMap.get(gt.sharedGroupId) || [];
        arr.push(gt);
        siblingMap.set(gt.sharedGroupId, arr);
      }
    }

    return tasks.map((task) => {
      if (task.sharedGroupId && siblingMap.has(task.sharedGroupId)) {
        const siblings = siblingMap.get(task.sharedGroupId) || [];
        const isShared = siblings.length > 1;
        const coTasks = siblings.map((s) => ({
          id: s.id,
          directorateId: s.directorateId,
          directorateName: s.directorate?.name || 'مديرية',
          directorateCode: s.directorate?.code || '',
          directorateCategory: s.directorate?.category || '',
          directorateIcon: s.directorate?.icon || '',
          status: s.status,
          completionPercentage: s.completionPercentage,
          completionNote: s.completionNote || null,
          todayTargetMet: s.todayTargetMet || false,
        }));

        return {
          ...task,
          isShared,
          sharedDirectoratesCount: siblings.length,
          coTasks,
        };
      }

      return {
        ...task,
        isShared: false,
        sharedDirectoratesCount: 1,
        coTasks: [],
      };
    });
  }

  private async recalculateDailySummary(directorateId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPlan = await this.prisma.dailyPlan.findUnique({
      where: {
        directorateId_planDate: {
          directorateId,
          planDate: today,
        },
      },
      include: { tasks: true, dailySummary: true },
    });

    if (todayPlan?.dailySummary) {
      const planTasks = todayPlan.tasks;
      const allExecTasks = await this.prisma.executiveTask.findMany({
        where: { directorateId },
      });
      const allPcts = [
        ...planTasks.map((t) => (t.isMultiDay && t.todayTargetMet ? 100 : t.completionPercentage)),
        ...allExecTasks.map((t) => (t.todayTargetMet ? 100 : t.completionPercentage)),
      ];
      const newRate = allPcts.length > 0
        ? Math.round((allPcts.reduce((sum, p) => sum + p, 0) / allPcts.length) * 10) / 10
        : 100;
      await this.prisma.dailySummary.update({
        where: { id: todayPlan.dailySummary.id },
        data: { overallCompletionRate: newRate },
      });
    }
  }

  async getTasks(user: any, query?: { directorateId?: string; status?: TaskStatus; priority?: Priority }) {
    const isExecutive = user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR;
    const canViewAll = isExecutive || user.role === Role.OBSERVER;
    const where: any = {};

    if (!canViewAll) {
      if (!user.directorateId) {
        throw new ForbiddenException('المستخدم غير مرتبط بمديرية معينة');
      }
      where.directorateId = user.directorateId;
    } else if (query?.directorateId && query.directorateId !== 'ALL') {
      where.directorateId = query.directorateId;
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.priority) {
      where.priority = query.priority;
    }

    const tasks = await this.prisma.executiveTask.findMany({
      where,
      include: {
        assignedBy: {
          select: { id: true, fullName: true, title: true, role: true },
        },
        directorate: {
          select: { id: true, code: true, name: true, category: true, icon: true },
        },
        assignedToUser: {
          select: { id: true, fullName: true, title: true },
        },
        attachments: true,
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return this.enrichTasksWithCoTasks(tasks);
  }

  async getTaskById(user: any, id: string) {
    const task = await this.prisma.executiveTask.findUnique({
      where: { id },
      include: {
        assignedBy: {
          select: { id: true, fullName: true, title: true, role: true },
        },
        directorate: {
          select: { id: true, code: true, name: true, category: true, icon: true },
        },
        assignedToUser: {
          select: { id: true, fullName: true, title: true },
        },
        attachments: true,
      },
    });

    if (!task) {
      throw new NotFoundException('التكليف غير موجود');
    }

    const isExecutive = user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR;
    const canViewAll = isExecutive || user.role === Role.OBSERVER;
    if (!canViewAll && task.directorateId !== user.directorateId) {
      throw new ForbiddenException('غير مصرح لك بالاطلاع على هذا التكليف');
    }

    const [enriched] = await this.enrichTasksWithCoTasks([task]);
    return enriched;
  }

  async createTasks(user: any, dto: CreateExecutiveTaskDto) {
    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('يرجى إدخال عنوان التكليف');
    }

    if (!dto.directorateIds || dto.directorateIds.length === 0) {
      throw new BadRequestException('يرجى اختيار مديرية واحدة على الأقل');
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
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
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          priority: dto.priority || Priority.NORMAL,
          dueDate,
          status: TaskStatus.PENDING,
          completionPercentage: 0,
          assignedById: user.id,
          directorateId,
          assignedToUserId: dto.assignedToUserId || null,
          sharedGroupId,
        },
        include: {
          assignedBy: {
            select: { id: true, fullName: true, title: true, role: true },
          },
          directorate: {
            select: { id: true, code: true, name: true, category: true, icon: true },
          },
          assignedToUser: {
            select: { id: true, fullName: true, title: true },
          },
          attachments: true,
        },
      });

      if (dto.attachmentIds && dto.attachmentIds.length > 0) {
        if (!isJoint) {
          await this.prisma.attachment.updateMany({
            where: { id: { in: dto.attachmentIds } },
            data: { executiveTaskId: task.id, category: 'EXECUTIVE_TASK' },
          });
        } else {
          const originalAttachments = await this.prisma.attachment.findMany({
            where: { id: { in: dto.attachmentIds } },
          });
          for (const att of originalAttachments) {
            await this.prisma.attachment.create({
              data: {
                fileName: att.fileName,
                fileUrl: att.fileUrl,
                fileSize: att.fileSize,
                mimeType: att.mimeType,
                category: 'EXECUTIVE_TASK',
                uploadedById: att.uploadedById,
                executiveTaskId: task.id,
              },
            });
          }
        }
      }

      createdTasks.push(task);

      this.eventsGateway.emitExecutiveTaskCreated({
        task,
        directorateId: task.directorateId,
        directorateName: directorate.name,
        assignedByName: user.fullName,
      });

      // Persist notification for directorate users
      this.notificationsService.createNotificationForDirectorate(
        directorateId,
        {
          type: 'executive-task',
          title: isJoint ? 'تكليف مشترك من المدير العام' : 'تكليف من المدير العام',
          message: `وردك تكليف من المدير العام: "${task.title}"`,
          referenceId: `exec-task-${task.id}`,
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            description: task.description,
            priority: task.priority,
            assignedByName: user.fullName,
            directorateId,
            directorateName: directorate.name,
            isShared: isJoint,
          },
        },
      );
    }

    return this.enrichTasksWithCoTasks(createdTasks);
  }

  async updateTask(user: any, id: string, dto: UpdateExecutiveTaskDto) {
    if (user.role === Role.OBSERVER) {
      throw new ForbiddenException('حساب المراقب مخصص للاطلاع والمتابعة فقط ولا يمتلك صلاحية التعديل');
    }

    const existingTask = await this.prisma.executiveTask.findUnique({
      where: { id },
      include: { directorate: true },
    });

    if (!existingTask) {
      throw new NotFoundException('التكليف غير موجود');
    }

    const isExecutive = user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR;

    if (!isExecutive && existingTask.directorateId !== user.directorateId) {
      throw new ForbiddenException('غير مصرح لك بتعديل هذا التكليف');
    }

    let dataToUpdate: any = {};

    if (isExecutive) {
      // If executive is changing global metadata on a shared task, synchronize across group
      if (existingTask.sharedGroupId && (dto.title !== undefined || dto.description !== undefined || dto.priority !== undefined || dto.dueDate !== undefined)) {
        const sharedUpdates: any = {};
        if (dto.title !== undefined) sharedUpdates.title = dto.title.trim();
        if (dto.description !== undefined) sharedUpdates.description = dto.description?.trim() || null;
        if (dto.priority !== undefined) sharedUpdates.priority = dto.priority;
        if (dto.dueDate !== undefined) sharedUpdates.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

        await this.prisma.executiveTask.updateMany({
          where: { sharedGroupId: existingTask.sharedGroupId },
          data: sharedUpdates,
        });
      }

      if (dto.title !== undefined) dataToUpdate.title = dto.title.trim();
      if (dto.description !== undefined) dataToUpdate.description = dto.description?.trim() || null;
      if (dto.priority !== undefined) dataToUpdate.priority = dto.priority;
      if (dto.dueDate !== undefined) dataToUpdate.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      if (dto.status !== undefined) dataToUpdate.status = dto.status;
      if (dto.completionPercentage !== undefined) dataToUpdate.completionPercentage = dto.completionPercentage;
      if (dto.completionNote !== undefined) dataToUpdate.completionNote = dto.completionNote;
      if (dto.directorateId !== undefined) dataToUpdate.directorateId = dto.directorateId;
      if (dto.assignedToUserId !== undefined) dataToUpdate.assignedToUserId = dto.assignedToUserId || null;
      if (dto.todayTargetMet !== undefined) dataToUpdate.todayTargetMet = dto.todayTargetMet;
    } else {
      // Directorate Director can update status, completion %, response note, and todayTargetMet
      if (dto.status !== undefined) dataToUpdate.status = dto.status;
      if (dto.completionPercentage !== undefined) dataToUpdate.completionPercentage = dto.completionPercentage;
      if (dto.completionNote !== undefined) dataToUpdate.completionNote = dto.completionNote;
      if (dto.todayTargetMet !== undefined) dataToUpdate.todayTargetMet = dto.todayTargetMet;

      if (dto.completionPercentage === 100) {
        if (!dto.status) dataToUpdate.status = TaskStatus.COMPLETED;
        dataToUpdate.todayTargetMet = true;
      }
    }

    const hasStatusChanged = dataToUpdate.status !== undefined && dataToUpdate.status !== existingTask.status;
    const hasPercentageChanged = dataToUpdate.completionPercentage !== undefined && dataToUpdate.completionPercentage !== existingTask.completionPercentage;
    const hasNoteChanged = dataToUpdate.completionNote !== undefined && (dataToUpdate.completionNote || '').trim() !== (existingTask.completionNote || '').trim();
    const hasTitleChanged = dataToUpdate.title !== undefined && dataToUpdate.title !== existingTask.title;
    const hasDescChanged = dataToUpdate.description !== undefined && dataToUpdate.description !== existingTask.description;
    const hasPriorityChanged = dataToUpdate.priority !== undefined && dataToUpdate.priority !== existingTask.priority;
    const hasDueDateChanged = dataToUpdate.dueDate !== undefined && (dataToUpdate.dueDate?.toISOString() !== existingTask.dueDate?.toISOString());
    const hasTodayTargetMetChanged = dataToUpdate.todayTargetMet !== undefined && dataToUpdate.todayTargetMet !== existingTask.todayTargetMet;

    const hasAttachmentsChanged = !!(dto.attachmentIds && dto.attachmentIds.length > 0);
    const hasChanges = hasStatusChanged || hasPercentageChanged || hasNoteChanged || hasTitleChanged || hasDescChanged || hasPriorityChanged || hasDueDateChanged || hasTodayTargetMetChanged || hasAttachmentsChanged;

    if (hasAttachmentsChanged) {
      const category = user.role === Role.DIRECTOR ? 'TASK_COMPLETION' : 'EXECUTIVE_TASK';
      await this.prisma.attachment.updateMany({
        where: { id: { in: dto.attachmentIds } },
        data: { executiveTaskId: id, category },
      });
    }

    const updated = await this.prisma.executiveTask.update({
      where: { id },
      data: dataToUpdate,
      include: {
        assignedBy: {
          select: { id: true, fullName: true, title: true, role: true },
        },
        directorate: {
          select: { id: true, code: true, name: true, category: true, icon: true },
        },
        assignedToUser: {
          select: { id: true, fullName: true, title: true },
        },
        attachments: true,
      },
    });

    await this.recalculateDailySummary(updated.directorateId);

    if (hasChanges) {
      this.eventsGateway.emitExecutiveTaskUpdated({
        task: updated,
        directorateId: updated.directorateId,
        directorateName: updated.directorate.name,
        updatedByRole: user.role,
      });

      // If a DIRECTOR updated the task, persist notification for executives
      if (user.role === Role.DIRECTOR) {
        let notificationMsg = `قامت (${updated.directorate.name}) بتحديث التكليف "${updated.title}" إلى (${updated.completionPercentage}%).`;
        if (updated.todayTargetMet && updated.completionPercentage < 100) {
          notificationMsg += ' وتم توثيق إنجاز مستهدف اليوم بنجاح ✔️';
        }

        this.notificationsService.createNotificationForRoles(
          [Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR, Role.OBSERVER],
          {
            type: 'executive-task-update',
            title: 'تحديث إنجاز تكليف المدير العام',
            message: notificationMsg,
            referenceId: `exec-task-update-${updated.id}-${updated.updatedAt.toISOString()}`,
            metadata: {
              taskId: updated.id,
              taskTitle: updated.title,
              directorateId: updated.directorateId,
              directorateName: updated.directorate.name,
              completionPercentage: updated.completionPercentage,
              status: updated.status,
              todayTargetMet: updated.todayTargetMet,
            },
          },
        );
      }
    }

    // Sync task completion state to Director's personal agenda (UserTodo)
    const isCompleted = updated.status === TaskStatus.COMPLETED || updated.completionPercentage === 100;
    const targetUserIds = new Set<string>();
    if (user.id) targetUserIds.add(user.id);
    if (updated.assignedToUserId) targetUserIds.add(updated.assignedToUserId);

    // Also find director of this directorate
    const dirDirector = await this.prisma.user.findFirst({
      where: { directorateId: updated.directorateId, role: Role.DIRECTOR },
    });
    if (dirDirector) targetUserIds.add(dirDirector.id);

    for (const uId of targetUserIds) {
      await this.syncExecutiveTaskToUserTodo(
        uId,
        updated.id,
        updated.title,
        isCompleted,
        updated.priority,
        updated.description,
        updated.completionPercentage,
      );
    }

    const [enriched] = await this.enrichTasksWithCoTasks([updated]);
    return enriched;
  }

  /**
   * Synchronize completion of an executive task with director's personal agenda (UserTodo)
   */
  async syncExecutiveTaskToUserTodo(
    userId: string,
    taskId: string,
    title: string,
    isCompleted: boolean,
    priority: Priority,
    description?: string | null,
    completionPercentage?: number,
  ) {
    try {
      const cleanTitle = title.trim();
      const execTag = `[تم إسنادها كتكليف تنفيذي] [معرف التكليف: ${taskId}]`;
      const pct = typeof completionPercentage === 'number'
        ? completionPercentage
        : (isCompleted ? 100 : 0);

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
            newDesc = newDesc ? `${newDesc}\n${execTag}` : execTag;
          }
          await this.prisma.userTodo.update({
            where: { id: todo.id },
            data: {
              isCompleted,
              completedAt: isCompleted ? (todo.completedAt || new Date()) : null,
              completionPercentage: pct,
              description: newDesc,
            },
          });
        }
      } else if (isCompleted) {
        const desc = description?.trim() ? `${description.trim()}\n${execTag}` : execTag;
        await this.prisma.userTodo.create({
          data: {
            userId,
            title: cleanTitle,
            description: desc,
            priority: priority || Priority.NORMAL,
            category: 'FOLLOWUP',
            completionPercentage: pct,
            isCompleted: true,
            completedAt: new Date(),
          },
        });
      }

      this.eventsGateway.emitTodoUpdated(userId);
    } catch (err) {
      console.error('Failed to sync executive task to user todo:', err);
    }
  }

  async deleteTask(user: any, id: string, query?: { deleteAllInGroup?: boolean | string }) {
    const isExecutive = user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR;
    if (!isExecutive) {
      throw new ForbiddenException('فقط الإدارة العليا يمكنها حذف التكليفات');
    }

    const task = await this.prisma.executiveTask.findUnique({
      where: { id },
    });

    if (!task) {
      throw new NotFoundException('التكليف غير موجود');
    }

    const shouldDeleteAll = (query?.deleteAllInGroup === true || query?.deleteAllInGroup === 'true') && !!task.sharedGroupId;

    if (shouldDeleteAll && task.sharedGroupId) {
      const allInGroup = await this.prisma.executiveTask.findMany({
        where: { sharedGroupId: task.sharedGroupId },
      });

      await this.prisma.executiveTask.deleteMany({
        where: { sharedGroupId: task.sharedGroupId },
      });

      for (const t of allInGroup) {
        await this.recalculateDailySummary(t.directorateId);
        this.eventsGateway.emitExecutiveTaskDeleted({
          taskId: t.id,
          directorateId: t.directorateId,
        });
      }

      return { message: 'تم حذف التكليف المشترك لكافة المديريات بنجاح', count: allInGroup.length, taskId: id };
    } else {
      await this.prisma.executiveTask.delete({
        where: { id },
      });

      await this.recalculateDailySummary(task.directorateId);

      this.eventsGateway.emitExecutiveTaskDeleted({
        taskId: id,
        directorateId: task.directorateId,
      });

      return { message: 'تم حذف التكليف بنجاح', taskId: id };
    }
  }
}

