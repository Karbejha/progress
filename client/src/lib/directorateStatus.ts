import { DirectorateOverviewItem } from '../types';

export type DirectorateSemanticStatus = 'URGENT' | 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';

/**
 * Standard semantic status classification for directorates:
 * - URGENT: Directorate has urgent flag / critical alert.
 * - COMPLETED: Directorate submitted its end-of-day summary.
 * - IN_PROGRESS: Directorate registered its morning plan and has not submitted its summary.
 * - PENDING: Directorate has not registered its morning plan or submitted its summary.
 * Assigned work and task completion rates do not count as daily report submissions.
 */
export function getDirectorateStatus(item: DirectorateOverviewItem): DirectorateSemanticStatus {
  if (item.urgentFlag) {
    return 'URGENT';
  }

  if (item.hasSummary) {
    return 'COMPLETED';
  }

  if (item.hasPlan) {
    return 'IN_PROGRESS';
  }

  return 'PENDING';
}
