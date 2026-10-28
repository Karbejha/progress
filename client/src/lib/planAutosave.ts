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
  expectedProgress?: { status: TaskStatus; completionPercentage: number };
}

let nextDraftKey = 0;

export function ensurePlanTaskDraftKeys<T extends PlanDraftTask>(tasks: T[]): T[] {
  if (tasks.every((task) => task.draftKey && (!task.id || task.expectedProgress))) return tasks;
  return tasks.map((task) => ({
    ...task,
    draftKey: task.draftKey ?? globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}-${++nextDraftKey}`,
    ...(task.id && !task.expectedProgress ? { expectedProgress: {
      status: task.status || 'PENDING', completionPercentage: task.completionPercentage ?? 0,
    } } : {}),
  }));
}

export function preparePlanTasksForSave<T extends PlanDraftTask>(
  tasks: T[],
  saved: Pick<PlanDraftTask, 'id' | 'status' | 'completionPercentage'>[],
) {
  const savedById = new Map(saved.filter((task) => task.id).map((task) => [task.id, task]));
  return tasks.map((task) => {
    // A background refresh may replace the plan while preserving a dirty form.
    // Keep the baseline observed by this draft, rather than that newer plan.
    const previous = task.expectedProgress ?? (task.id ? savedById.get(task.id) : undefined);
    return previous ? { ...task, expectedProgress: {
      status: previous.status || 'PENDING',
      completionPercentage: previous.completionPercentage ?? 0,
    } } : task;
  });
}

// Accept authoritative progress when it still describes the submitted edit.
// Preserve text, row order, additions, deletions, and progress edited since then.
export function acceptSavedPlanTasks<T extends PlanDraftTask>(
  current: T[],
  submitted: PlanDraftTask[],
  saved: Pick<PlanDraftTask, 'id' | 'createdAt' | 'displayOrder' | 'status' | 'completionPercentage'>[],
): T[] {
  const savedByDraftKey = new Map(submitted.map((task, index) => [task.draftKey, saved[index]]));
  return current.map((task) => {
    const submittedTask = submitted.find((item) => task.id ? item.id === task.id : task.draftKey && item.draftKey === task.draftKey);
    const savedTask = task.id
      ? saved.find((item) => item.id === task.id)
      : task.draftKey ? savedByDraftKey.get(task.draftKey) : undefined;
    const progressUntouched = submittedTask && task.status === submittedTask.status &&
      task.completionPercentage === submittedTask.completionPercentage;
    const rejectedProgress = submittedTask && savedTask && (
      savedTask.status !== submittedTask.status || savedTask.completionPercentage !== submittedTask.completionPercentage
    );
    // Do not rebase a later draft on a completion it has never observed. That
    // would turn an automatic retry after a conflict into a deliberate reopening.
    const expectedProgress = !progressUntouched && rejectedProgress
      ? task.expectedProgress ?? {
        status: submittedTask.status || 'PENDING', completionPercentage: submittedTask.completionPercentage ?? 0,
      }
      : savedTask?.status !== undefined && savedTask.completionPercentage !== undefined
        ? { status: savedTask.status, completionPercentage: savedTask.completionPercentage }
        : task.expectedProgress;
    return savedTask ? {
      ...task,
      id: savedTask.id,
      createdAt: savedTask.createdAt,
      displayOrder: savedTask.displayOrder,
      ...(expectedProgress ? { expectedProgress } : {}),
      ...(progressUntouched ? {
        ...(savedTask.status !== undefined ? { status: savedTask.status } : {}),
        ...(savedTask.completionPercentage !== undefined ? { completionPercentage: savedTask.completionPercentage } : {}),
      } : {}),
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
