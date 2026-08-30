import {
  User,
  ExecutiveOverviewResponse,
  DailyPlan,
  DailySummary,
  Announcement,
  ExecutiveFeedback,
  Directorate,
} from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || `Request failed with status ${response.status}`);
    }

    return response.json();
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
}

export const api = new ApiService();
