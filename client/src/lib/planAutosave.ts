import type { Priority, TaskStatus } from '../types';

export const PLAN_AUTOSAVE_DELAY_MS = 2500;

export interface PlanDraftTask {
  draftKey?: string;
  id?: string;
  createdAt?: string;
  displayOrder?: number;
  title: string;
  description: string;
  priority: Priority;
  estimatedHours: number;
  templateId?: string;
  carriedFromTaskId?: string;
  carriedFromDate?: string;
  initialCompletionPercentage?: number;
  completionPercentage?: number;
  isMultiDay?: boolean;
  todayTargetMet?: boolean;
  status?: TaskStatus;
  completionNote?: string;
}

let nextDraftKey = 0;

export function ensurePlanTaskDraftKeys<T extends PlanDraftTask>(tasks: T[]): T[] {
  if (tasks.every((task) => task.draftKey)) return tasks;
  return tasks.map((task) => task.draftKey ? task : {
    ...task,
    draftKey: globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}-${++nextDraftKey}`,
  });
}

// A response may acknowledge an older snapshot. Only copy server identity;
// keep the current text, row order, additions, and deletions in the editor.
export function acceptSavedPlanTasks<T extends PlanDraftTask>(
  current: T[],
  submitted: PlanDraftTask[],
  saved: Pick<PlanDraftTask, 'id' | 'createdAt' | 'displayOrder'>[],
): T[] {
  const savedByDraftKey = new Map(submitted.map((task, index) => [task.draftKey, saved[index]]));
  return current.map((task) => {
    const savedTask = task.id
      ? saved.find((item) => item.id === task.id)
      : task.draftKey ? savedByDraftKey.get(task.draftKey) : undefined;
    return savedTask ? {
      ...task,
      id: savedTask.id,
      createdAt: savedTask.createdAt,
      displayOrder: savedTask.displayOrder,
    } : task;
  });
}

export function getPlanHash(focus: string, tasks: PlanDraftTask[]): string {
  return JSON.stringify({
    focus: focus || '',
    tasks: tasks.filter((task) => task.title.trim().length > 0).map((task) => ({
      id: task.id,
      title: task.title,
      desc: task.description || '',
      priority: task.priority,
      hours: task.estimatedHours,
      carried: task.carriedFromTaskId,
      completionPercentage: task.completionPercentage ?? 0,
      status: task.status || 'PENDING',
      completionNote: task.completionNote || '',
      isMultiDay: Boolean(task.isMultiDay),
      todayTargetMet: Boolean(task.todayTargetMet),
    })),
  });
}
