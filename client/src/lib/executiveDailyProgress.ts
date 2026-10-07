import { ExecutiveTask, TaskStatus } from '../types';

export function workingDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

type LocalProgress = {
  completionPercentage: number; status: TaskStatus; todayTargetMet?: boolean; isModified?: boolean;
};

export function executiveDailyProgress(task: ExecutiveTask, local?: LocalProgress, day = workingDateKey()) {
  const isCurrentDay = task.dailyProgressDate === day;
  const percentage = local?.completionPercentage ?? task.completionPercentage;
  const completed = (local?.status ?? task.status) === 'COMPLETED' || percentage >= 100;
  const completedToday = completed && (
    (isCurrentDay && !!task.completedOnDate) ||
    (!!local?.isModified && task.status !== 'COMPLETED' && task.completionPercentage < 100)
  );
  const targetMet = !completed && (local?.isModified
    ? !!local.todayTargetMet
    : isCurrentDay && !!task.todayTargetMet);
  const baseline = isCurrentDay
    ? task.dailyStartCompletionPercentage ?? task.completionPercentage
    : task.completionPercentage;
  const rate = completedToday || targetMet ? 100 : Math.max(0, Math.min(100, percentage - baseline));
  return { rate, completedToday, targetMet };
}
