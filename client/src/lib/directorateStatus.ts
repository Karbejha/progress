import { DirectorateOverviewItem } from '../types';

export type DirectorateSemanticStatus = 'URGENT' | 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';

/**
 * Standard semantic status classification for directorates:
 * - URGENT: Directorate has urgent flag / critical alert.
 * - COMPLETED: Directorate submitted end-of-day summary, or reached 100% completion on existing tasks.
 * - IN_PROGRESS: Directorate registered morning plan or has active executive tasks.
 * - PENDING: Directorate has not yet registered morning plan and has no active tasks.
 */
export function getDirectorateStatus(item: DirectorateOverviewItem): DirectorateSemanticStatus {
  if (item.urgentFlag) {
    return 'URGENT';
  }

  const isCompleted =
    item.hasSummary ||
    (item.completionRate === 100 &&
      ((item.tasksCount ?? 0) > 0 || ((item.executiveTasks?.length ?? 0) > 0)));
  if (isCompleted) {
    return 'COMPLETED';
  }

  const isInProgress =
    item.hasPlan || ((item.executiveTasks?.length ?? 0) > 0);
  if (isInProgress) {
    return 'IN_PROGRESS';
  }

  return 'PENDING';
}
