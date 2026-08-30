export type Role = 'GENERAL_DIRECTOR' | 'ASSISTANT_DIRECTOR' | 'DIRECTOR';
export type Priority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
export type PlanStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED' | 'CANCELLED';
export type SummaryStatus = 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'FEEDBACK_GIVEN';

export interface Directorate {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
  icon?: string;
  displayOrder: number;
}

export interface User {
  id: string;
  email: string;
  username: string;
  fullName: string;
  title: string;
  role: Role;
  phone?: string;
  avatarUrl?: string;
  directorateId?: string;
  directorate?: Directorate;
}

export interface PlanTask {
  id: string;
  dailyPlanId?: string;
  title: string;
  description?: string;
  priority: Priority;
  estimatedHours: number;
  status: TaskStatus;
  completionPercentage: number;
  completionNote?: string;
  displayOrder: number;
}

export interface DailyPlan {
  id: string;
  directorateId: string;
  directorate?: Directorate;
  userId: string;
  user?: User;
  planDate: string;
  status: PlanStatus;
  submittedAt?: string;
  generalFocus?: string;
  tasks: PlanTask[];
  dailySummary?: DailySummary;
  feedbacks?: ExecutiveFeedback[];
}

export interface DailySummary {
  id: string;
  dailyPlanId: string;
  directorateId: string;
  directorate?: Directorate;
  userId: string;
  user?: User;
  summaryDate: string;
  summaryText: string;
  achievements: string[];
  challenges?: string;
  directorNotes?: string;
  urgentFlag: boolean;
  tomorrowPlanPreview?: string;
  overallCompletionRate: number;
  status: SummaryStatus;
  submittedAt: string;
  feedbacks?: ExecutiveFeedback[];
}

export interface ExecutiveFeedback {
  id: string;
  dailyPlanId?: string;
  dailySummaryId?: string;
  directorateId: string;
  fromUserId: string;
  fromUser?: {
    fullName: string;
    title: string;
    role?: Role;
  };
  feedbackText: string;
  rating?: number;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: Priority;
  authorId: string;
  author?: {
    fullName: string;
    title: string;
  };
  createdAt: string;
}

export interface ExecutiveOverviewKPIs {
  totalDirectorates: number;
  plansSubmittedCount: number;
  plansSubmissionRate: number;
  summariesSubmittedCount: number;
  summariesSubmissionRate: number;
  totalTasksCount: number;
  totalCompletedTasksCount: number;
  averageCompletionRate: number;
  urgentIssuesCount: number;
}

export interface DirectorateOverviewItem {
  directorateId: string;
  directorateName: string;
  directorateCode: string;
  category: string;
  icon?: string;
  director?: {
    id: string;
    fullName: string;
    title: string;
    email: string;
    phone?: string;
  };
  planId?: string;
  hasPlan: boolean;
  planSubmittedAt?: string;
  generalFocus?: string;
  tasksCount: number;
  completedTasksCount: number;
  completionRate: number;
  hasSummary: boolean;
  summarySubmittedAt?: string;
  summaryText?: string;
  achievements: string[];
  challenges?: string;
  directorNotes?: string;
  urgentFlag: boolean;
  tomorrowPlanPreview?: string;
  statusTag: string;
  statusColor: string;
  tasks: PlanTask[];
  feedbacks: ExecutiveFeedback[];
}

export interface ExecutiveOverviewResponse {
  date: string;
  kpis: ExecutiveOverviewKPIs;
  directorates: DirectorateOverviewItem[];
}
