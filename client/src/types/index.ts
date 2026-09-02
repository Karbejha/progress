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

export interface TaskTemplate {
  id: string;
  directorateId: string;
  title: string;
  description?: string | null;
  priority: Priority;
  estimatedHours: number;
  createdAt?: string;
  updatedAt?: string;
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
  isReadByMe?: boolean;
  readCount?: number;
  totalDirectorates?: number;
  readPercentage?: number;
  reads?: Array<{
    userId: string;
    userName: string;
    userTitle: string;
    directorateName?: string | null;
    readAt: string;
  }>;
}

export interface AnnouncementReadersResponse {
  announcement: {
    id: string;
    title: string;
    content: string;
    priority: Priority;
    authorName?: string;
    createdAt?: string;
  };
  stats: {
    totalDirectorates: number;
    readCount: number;
    unreadCount: number;
    readPercentage: number;
  };
  readers: Array<{
    userId: string;
    userName: string;
    userTitle: string;
    directorateId?: string | null;
    directorateName: string;
    directorateCode?: string | null;
    readAt: string;
  }>;
  unreadDirectorates: Array<{
    directorateId: string;
    directorateName: string;
    directorateCode: string;
    icon?: string | null;
    directorName: string;
  }>;
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

export interface ExecutiveCoTask {
  id: string;
  directorateId: string;
  directorateName: string;
  directorateCode?: string;
  directorateCategory?: string;
  directorateIcon?: string;
  status: TaskStatus;
  completionPercentage: number;
  completionNote?: string | null;
}

export interface ExecutiveTask {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  dueDate?: string;
  status: TaskStatus;
  completionPercentage: number;
  completionNote?: string;
  assignedById: string;
  assignedBy?: {
    id: string;
    fullName: string;
    title: string;
    role?: Role;
  };
  directorateId: string;
  directorate?: {
    id: string;
    code: string;
    name: string;
    category: string;
    icon?: string;
  };
  assignedToUserId?: string;
  assignedToUser?: {
    id: string;
    fullName: string;
    title: string;
  };
  sharedGroupId?: string | null;
  isShared?: boolean;
  sharedDirectoratesCount?: number;
  coTasks?: ExecutiveCoTask[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupedExecutiveTask {
  groupId: string;
  sharedGroupId: string | null;
  isShared: boolean;
  title: string;
  description?: string;
  priority: Priority;
  dueDate?: string;
  assignedBy?: {
    id: string;
    fullName: string;
    title: string;
    role?: Role;
  };
  createdAt: string;
  averageCompletionRate: number;
  overallStatus: TaskStatus;
  directoratesCount: number;
  subTasks: Array<{
    taskId: string;
    directorateId: string;
    directorateName: string;
    directorateCode?: string;
    directorateIcon?: string;
    status: TaskStatus;
    completionPercentage: number;
    completionNote?: string | null;
  }>;
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
  executiveTasks?: ExecutiveTask[];
}

export interface ExecutiveOverviewResponse {
  date: string;
  kpis: ExecutiveOverviewKPIs;
  directorates: DirectorateOverviewItem[];
}

