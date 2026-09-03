import {
  User,
  ExecutiveOverviewResponse,
  DailyPlan,
  DailySummary,
  Announcement,
  ExecutiveFeedback,
  Directorate,
  ExecutiveTask,
} from '../types';

export const getApiBaseUrl = (): string => {
  let url = '';
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('ports_custom_api_url');
    if (customUrl && customUrl.trim()) {
      url = customUrl.trim();
    }
  }
  if (!url) {
    url = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').trim();
  }

  url = url.replace(/\/+$/, '');

  // If pointing to a domain (like https://progress.gdp.gov.sy) without port 4000/4010 and without /api,
  // append /api automatically because on the production server NestJS API is mapped under /api
  if (url.startsWith('https://') || url.startsWith('http://')) {
    try {
      const parsed = new URL(url);
      if (!parsed.port && !parsed.pathname.endsWith('/api') && parsed.hostname !== 'localhost') {
        url = `${url}/api`;
      }
    } catch {
      // ignore
    }
  }

  return url;
};

export const setCustomApiUrl = (url: string | null) => {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('ports_custom_api_url', url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('ports_custom_api_url');
    }
  }
};

class ApiService {
  private tokenKey = 'ports_auth_token';
  private userKey = 'ports_current_user';

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.tokenKey, token);
    }
  }

  getCurrentUser(): User | null {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem(this.userKey);
    return userStr ? JSON.parse(userStr) : null;
  }

  setCurrentUser(user: User | null) {
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem(this.userKey, JSON.stringify(user));
      } else {
        localStorage.removeItem(this.userKey);
      }
    }
  }

  logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.userKey);
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `Request failed with status ${response.status}`;
      try {
        const errorText = await response.text();
        if (errorText) {
          const errorBody = JSON.parse(errorText);
          if (errorBody && errorBody.message) {
            errorMessage = Array.isArray(errorBody.message)
              ? errorBody.message.join(', ')
              : errorBody.message;
          }
        }
      } catch {
        // fallback to default error message
      }
      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return null as unknown as T;
    }

    const text = await response.text();
    if (!text || text.trim() === '') {
      return null as unknown as T;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text as unknown as T;
    }
  }

  // Auth endpoints
  async login(payload: { usernameOrEmail: string; password?: string; directUserId?: string }) {
    const res = await this.request<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    this.setToken(res.access_token);
    this.setCurrentUser(res.user);
    return res;
  }

  async getMe() {
    return this.request<User>('/auth/me');
  }

  // User Management & Password Endpoints
  async changeMyPassword(payload: { currentPassword: string; newPassword: string }) {
    return this.request<{ message: string }>('/users/change-my-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getAllUsers() {
    return this.request<User[]>('/users');
  }

  async createUser(payload: {
    fullName: string;
    title: string;
    username: string;
    email: string;
    password: string;
    role?: string;
    phone?: string;
    directorateId?: string;
  }) {
    return this.request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateUser(
    id: string,
    payload: {
      fullName?: string;
      title?: string;
      email?: string;
      phone?: string;
      directorateId?: string;
      role?: string;
    },
  ) {
    return this.request<User>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async adminResetPassword(userId: string, newPassword: string) {
    return this.request<{ message: string }>(`/users/${userId}/reset-password`, {
      method: 'PATCH',
      body: JSON.stringify({ newPassword }),
    });
  }

  async deleteUser(userId: string) {
    return this.request<{ message: string }>(`/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async getDirectorates(): Promise<Directorate[]> {
    return this.request<Directorate[]>('/directorates');
  }

  // Executive endpoints
  async getExecutiveOverview(dateStr?: string): Promise<ExecutiveOverviewResponse> {
    const query = dateStr ? `?date=${dateStr}` : '';
    return this.request<ExecutiveOverviewResponse>(`/executive/overview${query}`);
  }

  async getDirectorateDetails(directorateId: string, dateStr?: string) {
    const query = dateStr ? `?date=${dateStr}` : '';
    return this.request<any>(`/executive/directorates/${directorateId}${query}`);
  }

  async sendFeedback(payload: {
    directorateId: string;
    dailyPlanId?: string;
    dailySummaryId?: string;
    feedbackText: string;
    rating?: number;
  }) {
    return this.request<ExecutiveFeedback>('/executive/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getAnnouncements(): Promise<Announcement[]> {
    return this.request<Announcement[]>('/executive/announcements');
  }

  async markAnnouncementRead(id: string): Promise<{ success: boolean; announcementId: string; readAt: string }> {
    return this.request<{ success: boolean; announcementId: string; readAt: string }>(`/executive/announcements/${id}/read`, {
      method: 'POST',
    });
  }

  async getAnnouncementReaders(id: string): Promise<any> {
    return this.request<any>(`/executive/announcements/${id}/readers`);
  }

  async createAnnouncement(payload: { title: string; content: string; priority?: string }) {
    return this.request<Announcement>('/executive/announcements', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Director endpoints
  async getMyTodayPlan(dateStr?: string): Promise<DailyPlan | null> {
    const query = dateStr ? `?date=${dateStr}` : '';
    return this.request<DailyPlan | null>(`/daily-plans/my-today${query}`);
  }

  async clonePreviousPlan(dateStr?: string): Promise<{
    previousDate: string;
    generalFocus?: string;
    tasks: { title: string; description?: string; priority: string; estimatedHours: number }[];
  }> {
    const query = dateStr ? `?date=${dateStr}` : '';
    return this.request<{
      previousDate: string;
      generalFocus?: string;
      tasks: { title: string; description?: string; priority: string; estimatedHours: number }[];
    }>(`/daily-plans/clone-previous${query}`);
  }

  async getTaskTemplates(): Promise<any[]> {
    return this.request<any[]>('/daily-plans/templates');
  }

  async createTaskTemplate(payload: {
    title: string;
    description?: string;
    priority?: string;
    estimatedHours?: number;
  }): Promise<any> {
    return this.request<any>('/daily-plans/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteTaskTemplate(id: string): Promise<{ message: string; templateId: string }> {
    return this.request<{ message: string; templateId: string }>(`/daily-plans/templates/${id}`, {
      method: 'DELETE',
    });
  }

  async submitPlan(payload: {
    planDate?: string;
    generalFocus?: string;
    tasks: { title: string; description?: string; priority?: string; estimatedHours?: number }[];
  }): Promise<DailyPlan> {
    return this.request<DailyPlan>('/daily-plans/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateTaskStatus(
    taskId: string,
    payload: { status?: string; completionPercentage?: number; completionNote?: string },
  ) {
    return this.request<any>(`/daily-plans/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async getMyTodaySummary(dateStr?: string): Promise<DailySummary | null> {
    const query = dateStr ? `?date=${dateStr}` : '';
    return this.request<DailySummary | null>(`/daily-summaries/my-today${query}`);
  }

  async submitDailySummary(payload: {
    date?: string;
    summaryText: string;
    achievements?: string[];
    challenges?: string;
    directorNotes?: string;
    urgentFlag?: boolean;
    tomorrowPlanPreview?: string;
    taskUpdates?: { taskId: string; status: string; completionPercentage: number; completionNote?: string }[];
  }): Promise<DailySummary> {
    return this.request<DailySummary>('/daily-summaries/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getDirectorHistory(limit = 30): Promise<DailyPlan[]> {
    return this.request<DailyPlan[]>(`/daily-plans/my-history?limit=${limit}`);
  }

  // Executive Tasks (التكليفات والمهام المباشرة)
  async getExecutiveTasks(query?: {
    directorateId?: string;
    status?: string;
    priority?: string;
  }): Promise<ExecutiveTask[]> {
    const params = new URLSearchParams();
    if (query?.directorateId) params.append('directorateId', query.directorateId);
    if (query?.status) params.append('status', query.status);
    if (query?.priority) params.append('priority', query.priority);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<ExecutiveTask[]>(`/executive-tasks${qs}`);
  }

  async getExecutiveTask(id: string): Promise<ExecutiveTask> {
    return this.request<ExecutiveTask>(`/executive-tasks/${id}`);
  }

  async createExecutiveTasks(payload: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    directorateIds: string[];
    assignedToUserId?: string;
  }): Promise<ExecutiveTask[]> {
    return this.request<ExecutiveTask[]>('/executive-tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateExecutiveTask(
    id: string,
    payload: {
      title?: string;
      description?: string;
      priority?: string;
      dueDate?: string;
      status?: string;
      completionPercentage?: number;
      completionNote?: string;
      directorateId?: string;
      assignedToUserId?: string;
    },
  ): Promise<ExecutiveTask> {
    return this.request<ExecutiveTask>(`/executive-tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async deleteExecutiveTask(id: string, deleteAllInGroup?: boolean): Promise<{ message: string; taskId?: string; count?: number }> {
    const qs = deleteAllInGroup ? '?deleteAllInGroup=true' : '';
    return this.request<{ message: string; taskId?: string; count?: number }>(`/executive-tasks/${id}${qs}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiService();

