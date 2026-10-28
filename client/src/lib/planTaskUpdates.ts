import type { TaskStatus } from '../types';

export interface PlanTaskUpdate {
  taskId: string;
  status: TaskStatus;
  completionPercentage: number;
  completionNote?: string;
}

// A title or carryover link does not identify the saved row being updated.
// Historical task events must never assign IDs to today's draft or namesakes.
export function applyPlanTaskUpdate<T extends {
  id?: string; status?: TaskStatus; completionPercentage?: number; completionNote?: string;
  expectedProgress?: { status: TaskStatus; completionPercentage: number };
}>(
  tasks: T[],
  update: PlanTaskUpdate,
  savedTasks?: Pick<T, 'id' | 'status' | 'completionPercentage' | 'completionNote'>[],
): T[] {
  if (!update.taskId || !tasks.some((task) => task.id === update.taskId)) return tasks;
  return tasks.map((task) => {
    if (task.id !== update.taskId) return task;
    const saved = savedTasks?.find((item) => item.id === task.id);
    const baseline = task.expectedProgress ?? saved;
    const hasLocalProgress = baseline && (task.status !== baseline.status || task.completionPercentage !== baseline.completionPercentage);
    const hasLocalNote = saved && (task.completionNote || '') !== (saved.completionNote || '');
    return {
      ...task,
      ...(!hasLocalProgress ? { status: update.status, completionPercentage: update.completionPercentage } : {}),
      ...(task.expectedProgress ? { expectedProgress: {
        status: update.status, completionPercentage: update.completionPercentage,
      } } : {}),
      completionNote: !hasLocalNote && update.completionNote !== undefined ? update.completionNote : task.completionNote,
    };
  });
}
