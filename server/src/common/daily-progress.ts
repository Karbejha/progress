import { ExecutiveTask, Prisma, PrismaClient, TaskStatus } from '@prisma/client';

// Use the working day's timezone, independent of the API server's timezone.
export const WORK_TIME_ZONE = 'Europe/Istanbul';

export function workingDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WORK_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function normalizePlanDate(dateStr = workingDateKey()): Date {
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (calendarDate) {
    return new Date(Number(calendarDate[1]), Number(calendarDate[2]) - 1, Number(calendarDate[3]));
  }
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function progressDate(date: Date = normalizePlanDate()): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function executiveTasksForDay(date: Date): Prisma.ExecutiveTaskWhereInput {
  const day = progressDate(date);
  // Istanbul's working day ends at 21:00 UTC; use an exclusive upper bound.
  const nextDay = new Date(day.getTime() + 21 * 60 * 60 * 1000);
  return {
    createdAt: { lt: nextDay },
    OR: [
      { status: { not: TaskStatus.COMPLETED }, completionPercentage: { lt: 100 } },
      { dailyProgress: { some: { progressDate: day } } },
    ],
  };
}

type DailyProgress = {
  startCompletionPercentage: number;
  completionPercentage: number;
  todayTargetMet: boolean;
};

export function withDailyExecutiveProgress<T extends { status?: string; completionPercentage: number; dailyProgress?: DailyProgress[] }>(task: T, date: Date) {
  const { dailyProgress, ...rest } = task;
  const entry = dailyProgress?.[0];
  const completedOnDate = !!entry && entry.startCompletionPercentage < 100 && entry.completionPercentage >= 100;
  return {
    ...rest,
    // Legacy cumulative percentages and undated target flags are never daily credit.
    todayTargetMet: !!entry?.todayTargetMet && entry.completionPercentage < 100,
    dailyCompletionPercentage: entry ? Math.max(0, entry.completionPercentage - entry.startCompletionPercentage) : 0,
    dailyStartCompletionPercentage: entry?.startCompletionPercentage ?? (task.status === TaskStatus.COMPLETED ? 100 : task.completionPercentage),
    dailyProgressDate: progressDate(date).toISOString().slice(0, 10),
    completedOnDate,
  };
}

export function planDailyRate(task: {
  status?: string; completionPercentage: number; isMultiDay?: boolean;
  todayTargetMet?: boolean; carriedFromTaskId?: string | null;
}): number {
  if (task.status === TaskStatus.COMPLETED || task.completionPercentage >= 100) return 100;
  if ((task.isMultiDay || task.carriedFromTaskId) && task.todayTargetMet) return 100;
  return Math.min(100, Math.max(0, task.completionPercentage || 0));
}

export function executiveDailyRate(task: {
  dailyCompletionPercentage: number; completedOnDate: boolean; todayTargetMet: boolean;
}): number {
  if (task.completedOnDate || task.todayTargetMet) return 100;
  return Math.min(100, Math.max(0, task.dailyCompletionPercentage));
}

export function averageDailyRate(planTasks: Parameters<typeof planDailyRate>[0][], execTasks: Parameters<typeof executiveDailyRate>[0][]): number {
  const rates = [...planTasks.map(planDailyRate), ...execTasks.map(executiveDailyRate)];
  return rates.length ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length * 10) / 10 : 0;
}

export async function dailyExecutiveTasks(prisma: Pick<PrismaClient, 'executiveTask'>, directorateId: string, date: Date) {
  const tasks = await prisma.executiveTask.findMany({
    where: { directorateId, ...executiveTasksForDay(date) },
    include: { dailyProgress: { where: { progressDate: progressDate(date) } } },
  });
  return tasks.map((task) => withDailyExecutiveProgress(task, date));
}

// Call inside the same transaction as the task update, including agenda updates.
export async function recordExecutiveProgress(
  tx: Prisma.TransactionClient,
  id: string,
  changes: Partial<Pick<ExecutiveTask, 'status' | 'completionPercentage' | 'todayTargetMet'>>,
  date = normalizePlanDate(),
): Promise<boolean> {
  await tx.$queryRaw`SELECT "id" FROM "ExecutiveTask" WHERE "id" = ${id} FOR UPDATE`;
  const current = await tx.executiveTask.findUniqueOrThrow({ where: { id } });
  const day = progressDate(date);
  const entry = await tx.executiveTaskDailyProgress.findUnique({
    where: { executiveTaskId_progressDate: { executiveTaskId: id, progressDate: day } },
  });
  const startPercentage = current.status === TaskStatus.COMPLETED ? 100 : current.completionPercentage;
  const nextStatus = changes.status ?? current.status;
  const nextPercentage = nextStatus === TaskStatus.COMPLETED ? 100 : (changes.completionPercentage ?? current.completionPercentage);
  const targetMet = changes.todayTargetMet ?? entry?.todayTargetMet ?? false;
  const progressChanged = nextPercentage !== startPercentage || nextStatus !== current.status || targetMet !== (entry?.todayTargetMet ?? false);

  if (progressChanged) {
    await tx.executiveTaskDailyProgress.upsert({
      where: { executiveTaskId_progressDate: { executiveTaskId: id, progressDate: day } },
      create: { executiveTaskId: id, progressDate: day, startCompletionPercentage: startPercentage, completionPercentage: nextPercentage, todayTargetMet: targetMet },
      update: { completionPercentage: nextPercentage, todayTargetMet: targetMet },
    });
  }
  return targetMet;
}
