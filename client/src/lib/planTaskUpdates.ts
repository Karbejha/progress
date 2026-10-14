import type { TaskStatus } from '../types';

export interface PlanTaskUpdate {
  taskId: string;
  status: TaskStatus;
  completionPercentage: number;
  completionNote?: string;
}

// A title or carryover link does not identify the saved row being updated.
// Historical task events must never assign IDs to today's draft or namesakes.
export function applyPlanTaskUpdate<T extends { id?: string; completionNote?: string }>(
  tasks: T[],
  update: PlanTaskUpdate,
): T[] {
  if (!update.taskId || !tasks.some((task) => task.id === update.taskId)) return tasks;
  return tasks.map((task) => task.id === update.taskId
    ? {
      ...task,
      status: update.status,
      completionPercentage: update.completionPercentage,
      completionNote: update.completionNote !== undefined ? update.completionNote : task.completionNote,
    }
    : task);
}
