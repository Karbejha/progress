import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Priority, TaskStatus } from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';

export interface CreateExecutiveTaskDto {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: string;
  directorateIds: string[];
  assignedToUserId?: string;
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
}

@Injectable()
export class ExecutiveTasksService {
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

  async getTasks(user: any, query?: { directorateId?: string; status?: TaskStatus; priority?: Priority }) {
    const isExecutive = user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR;
    const where: any = {};

    if (!isExecutive) {
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

    return this.prisma.executiveTask.findMany({
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
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
    });
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
      },
    });

    if (!task) {
      throw new NotFoundException('التكليف غير موجود');
    }

    const isExecutive = user.role === Role.GENERAL_DIRECTOR || user.role === Role.ASSISTANT_DIRECTOR;
    if (!isExecutive && task.directorateId !== user.directorateId) {
      throw new ForbiddenException('غير مصرح لك بالاطلاع على هذا التكليف');
    }

    return task;
  }

  async createTasks(user: any, dto: CreateExecutiveTaskDto) {
    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('يرجى إدخال عنوان التكليف');
    }

    if (!dto.directorateIds || dto.directorateIds.length === 0) {
      throw new BadRequestException('يرجى اختيار مديرية واحدة على الأقل');
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
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
        },
      });

      createdTasks.push(task);

      this.eventsGateway.emitExecutiveTaskCreated({
        task,
        directorateId: task.directorateId,
        directorateName: directorate.name,
        assignedByName: user.fullName,
      });
    }

    return createdTasks;
  }

  async updateTask(user: any, id: string, dto: UpdateExecutiveTaskDto) {
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
      // Executive can edit everything
      if (dto.title !== undefined) dataToUpdate.title = dto.title.trim();
      if (dto.description !== undefined) dataToUpdate.description = dto.description?.trim() || null;
      if (dto.priority !== undefined) dataToUpdate.priority = dto.priority;
      if (dto.dueDate !== undefined) dataToUpdate.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      if (dto.status !== undefined) dataToUpdate.status = dto.status;
      if (dto.completionPercentage !== undefined) dataToUpdate.completionPercentage = dto.completionPercentage;
      if (dto.completionNote !== undefined) dataToUpdate.completionNote = dto.completionNote;
      if (dto.directorateId !== undefined) dataToUpdate.directorateId = dto.directorateId;
      if (dto.assignedToUserId !== undefined) dataToUpdate.assignedToUserId = dto.assignedToUserId || null;
    } else {
      // Directorate Director can update status, completion %, and response note
      if (dto.status !== undefined) dataToUpdate.status = dto.status;
      if (dto.completionPercentage !== undefined) dataToUpdate.completionPercentage = dto.completionPercentage;
      if (dto.completionNote !== undefined) dataToUpdate.completionNote = dto.completionNote;

      // Auto-set status if 100%
      if (dto.completionPercentage === 100 && !dto.status) {
        dataToUpdate.status = TaskStatus.COMPLETED;
      }
    }

    // Check if there are any meaningful changes compared to existingTask
    const hasStatusChanged = dataToUpdate.status !== undefined && dataToUpdate.status !== existingTask.status;
    const hasPercentageChanged = dataToUpdate.completionPercentage !== undefined && dataToUpdate.completionPercentage !== existingTask.completionPercentage;
    const hasNoteChanged = dataToUpdate.completionNote !== undefined && (dataToUpdate.completionNote || '').trim() !== (existingTask.completionNote || '').trim();
    const hasTitleChanged = dataToUpdate.title !== undefined && dataToUpdate.title !== existingTask.title;
    const hasDescChanged = dataToUpdate.description !== undefined && dataToUpdate.description !== existingTask.description;
    const hasPriorityChanged = dataToUpdate.priority !== undefined && dataToUpdate.priority !== existingTask.priority;
    const hasDueDateChanged = dataToUpdate.dueDate !== undefined && (dataToUpdate.dueDate?.toISOString() !== existingTask.dueDate?.toISOString());

    const hasChanges = hasStatusChanged || hasPercentageChanged || hasNoteChanged || hasTitleChanged || hasDescChanged || hasPriorityChanged || hasDueDateChanged;

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
      },
    });

    // If daily summary exists for today, recalculate its overallCompletionRate
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPlan = await this.prisma.dailyPlan.findUnique({
      where: {
        directorateId_planDate: {
          directorateId: updated.directorateId,
          planDate: today,
        },
      },
      include: { tasks: true, dailySummary: true },
    });

    if (todayPlan?.dailySummary) {
      const planTasks = todayPlan.tasks;
      const allExecTasks = await this.prisma.executiveTask.findMany({
        where: { directorateId: updated.directorateId },
      });
      const allPcts = [
        ...planTasks.map((t) => t.completionPercentage),
        ...allExecTasks.map((t) => t.completionPercentage),
      ];
      if (allPcts.length > 0) {
        const newRate = Math.round((allPcts.reduce((sum, p) => sum + p, 0) / allPcts.length) * 10) / 10;
        await this.prisma.dailySummary.update({
          where: { id: todayPlan.dailySummary.id },
          data: { overallCompletionRate: newRate },
        });
      }
    }

    if (hasChanges) {
      this.eventsGateway.emitExecutiveTaskUpdated({
        task: updated,
        directorateId: updated.directorateId,
        directorateName: updated.directorate.name,
        updatedByRole: user.role,
      });
    }

    return updated;
  }

  async deleteTask(user: any, id: string) {
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

    await this.prisma.executiveTask.delete({
      where: { id },
    });

    // If daily summary exists for today, recalculate its overallCompletionRate
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPlan = await this.prisma.dailyPlan.findUnique({
      where: {
        directorateId_planDate: {
          directorateId: task.directorateId,
          planDate: today,
        },
      },
      include: { tasks: true, dailySummary: true },
    });

    if (todayPlan?.dailySummary) {
      const planTasks = todayPlan.tasks;
      const allExecTasks = await this.prisma.executiveTask.findMany({
        where: { directorateId: task.directorateId },
      });
      const allPcts = [
        ...planTasks.map((t) => t.completionPercentage),
        ...allExecTasks.map((t) => t.completionPercentage),
      ];
      const newRate = allPcts.length > 0
        ? Math.round((allPcts.reduce((sum, p) => sum + p, 0) / allPcts.length) * 10) / 10
        : 100;
      await this.prisma.dailySummary.update({
        where: { id: todayPlan.dailySummary.id },
        data: { overallCompletionRate: newRate },
      });
    }

    this.eventsGateway.emitExecutiveTaskDeleted({
      taskId: id,
      directorateId: task.directorateId,
    });

    return { message: 'تم حذف التكليف بنجاح', taskId: id };
  }
}
