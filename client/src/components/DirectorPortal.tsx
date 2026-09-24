'use client';

import React, { useState, useEffect } from 'react';
import { User, DailyPlan, PlanTask, Priority, TaskStatus, ExecutiveTask, TaskTemplate, IncompleteTask, AchievementsReportResponse } from '../types';
import { api } from '../services/api';
import { DynamicIcon } from './Icons';
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Plus,
  Trash2,
  Sparkles,
  Calendar,
  Layers,
  History,
  Star,
  Shield,
  Check,
  Megaphone,
  X,
  Save,
  Loader2,
  CheckCheck,
  MessageSquare,
  Copy,
  Bookmark,
  BookmarkPlus,
  RefreshCw,
  Users,
  Building2,
  ListTodo,
  ArrowRightLeft,
  Printer,
  Award,
  Filter,
  Pencil,
  AlertCircle,
  Crown,
  Paperclip,
} from 'lucide-react';

import { AnnouncementDetailsModal, AnnouncementModalData } from './AnnouncementDetailsModal';
import { IncompleteTasksModal } from './IncompleteTasksModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { CustomMonthPicker } from './CustomMonthPicker';
import { CustomDateRangePicker } from './CustomDateRangePicker';
import { Announcement, Attachment } from '../types';
import { Capacitor } from '@capacitor/core';
import { getSocket } from '../lib/socket';
import { getReadAnnouncementIds, markAnnouncementAsRead, syncReadNotificationsFromServer } from '../lib/announcements';
import { PdfAttachmentPicker } from './PdfAttachmentPicker';
import { PdfAttachmentCard } from './PdfAttachmentCard';

interface DirectorPortalProps {
  currentUser: User;
}

export const DirectorPortal: React.FC<DirectorPortalProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'PLAN' | 'TRACK' | 'EXECUTIVE_TASKS' | 'SUMMARY' | 'HISTORY'>('PLAN');
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [history, setHistory] = useState<DailyPlan[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementModalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>([]);
  const [summaryAttachments, setSummaryAttachments] = useState<Attachment[]>([]);
  const [execTaskAttachments, setExecTaskAttachments] = useState<{ [taskId: string]: Attachment[] }>({});

  // Feedback replies state
  const [replyOpenPlanId, setReplyOpenPlanId] = useState<string | null>(null);
  const [replyTextMap, setReplyTextMap] = useState<{ [planId: string]: string }>({});
  const [submittingReplyPlanId, setSubmittingReplyPlanId] = useState<string | null>(null);

  // Drafts State (Requirement 4)
  const getTodayLocalKey = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayKey = getTodayLocalKey();
  const planDraftKey = `ports_plan_draft_${currentUser.id}_${todayKey}`;
  const summaryDraftKey = `ports_summary_draft_${currentUser.id}_${todayKey}`;

  // Read initial drafts synchronously from localStorage
  const getInitialPlanDraft = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(planDraftKey);
      if (raw) return JSON.parse(raw);
    } catch { }
    return null;
  };

  const getInitialSummaryDraft = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(summaryDraftKey);
      if (raw) return JSON.parse(raw);
    } catch { }
    return null;
  };

  const initPlanDraft = getInitialPlanDraft();
  const initSummaryDraft = getInitialSummaryDraft();

  const [planDraftSavedTime, setPlanDraftSavedTime] = useState<string | null>(() =>
    initPlanDraft?.updatedAt
      ? new Date(initPlanDraft.updatedAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })
      : null
  );

  const [summaryDraftSavedTime, setSummaryDraftSavedTime] = useState<string | null>(() =>
    initSummaryDraft?.updatedAt
      ? new Date(initSummaryDraft.updatedAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })
      : null
  );

  // Form states initialized with local draft
  const [generalFocus, setGeneralFocus] = useState(() => initPlanDraft?.generalFocus || '');
  const [tasks, setTasks] = useState<
    {
      id?: string;
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
    }[]
  >(() =>
    initPlanDraft?.tasks && initPlanDraft.tasks.length > 0
      ? initPlanDraft.tasks
      : [{ title: '', description: '', priority: 'NORMAL', estimatedHours: 2.0 }]
  );
  const [togglingTemplateIdx, setTogglingTemplateIdx] = useState<number | null>(null);

  // Incomplete Tasks (Carried-over) State
  const [incompleteTasks, setIncompleteTasks] = useState<IncompleteTask[]>([]);
  const [loadingIncompleteTasks, setLoadingIncompleteTasks] = useState(false);
  const [showIncompleteTasksModal, setShowIncompleteTasksModal] = useState(false);

  // Summary wizard states initialized with local draft
  const [summaryText, setSummaryText] = useState(() => initSummaryDraft?.summaryText || '');
  const [achievements, setAchievements] = useState<string[]>(() =>
    initSummaryDraft?.achievements && initSummaryDraft.achievements.length > 0
      ? initSummaryDraft.achievements
      : ['']
  );
  const [challenges, setChallenges] = useState(() => initSummaryDraft?.challenges || '');
  const [directorNotes, setDirectorNotes] = useState(() => initSummaryDraft?.directorNotes || '');
  const [urgentFlag, setUrgentFlag] = useState<boolean>(() => Boolean(initSummaryDraft?.urgentFlag));
  const [tomorrowPlanPreview, setTomorrowPlanPreview] = useState(() => initSummaryDraft?.tomorrowPlanPreview || '');

  // Cloning & Templates State (Requirement 2)
  const [loadingPreviousPlan, setLoadingPreviousPlan] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [newTemplateForm, setNewTemplateForm] = useState<{
    title: string;
    description: string;
    priority: Priority;
    estimatedHours: number;
  }>({
    title: '',
    description: '',
    priority: 'NORMAL',
    estimatedHours: 1.5,
  });

  // Plan auto-save status state
  const [autoSaveStatus, setAutoSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
  const [autoSaveTime, setAutoSaveTime] = useState<string | null>(null);
  const isInitialPlanLoadRef = React.useRef(true);
  const lastSavedPlanHashRef = React.useRef<string>('');

  const getPlanHash = (focus: string, currentTasks: any[]) => {
    return JSON.stringify({
      focus: (focus || '').trim(),
      tasks: (currentTasks || [])
        .filter((t) => (t?.title || '').trim().length > 0)
        .map((t) => ({
          id: t.id,
          title: (t.title || '').trim(),
          desc: (t.description || '').trim(),
          priority: t.priority,
          hours: t.estimatedHours,
          carried: t.carriedFromTaskId,
          completionPercentage: t.completionPercentage ?? 0,
          status: t.status || 'PENDING',
          isMultiDay: Boolean(t.isMultiDay),
          todayTargetMet: Boolean(t.todayTargetMet),
        })),
    });
  };

  // Quick Add Task Modal State (for adding directly during the day)
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskDesc, setQuickTaskDesc] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<Priority>('NORMAL');
  const [savingQuickTask, setSavingQuickTask] = useState(false);

  // Inline editing in Track Tab
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDesc, setEditTaskDesc] = useState('');
  const [savingTaskEdit, setSavingTaskEdit] = useState(false);

  // Executive Tasks state
  const [executiveTasks, setExecutiveTasks] = useState<ExecutiveTask[]>([]);
  const [loadingExecTasks, setLoadingExecTasks] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [taskLocalState, setTaskLocalState] = useState<{
    [id: string]: {
      status: TaskStatus;
      completionPercentage: number;
      completionNote: string;
      todayTargetMet?: boolean;
      isModified?: boolean;
    };
  }>({});

  // Executive Tasks helpers & memos (Auto-pinned in morning plan until 100% completed)
  const isTaskUpdatedToday = (task: ExecutiveTask) => {
    if (!task.updatedAt) return false;
    const taskDate = new Date(task.updatedAt);
    const today = new Date();
    return (
      taskDate.getFullYear() === today.getFullYear() &&
      taskDate.getMonth() === today.getMonth() &&
      taskDate.getDate() === today.getDate()
    );
  };

  const activeExecutiveTasks = React.useMemo(() => {
    return executiveTasks.filter((task) => {
      const local = taskLocalState[task.id];
      const pct = local !== undefined ? local.completionPercentage : task.completionPercentage;
      const status = local !== undefined ? local.status : task.status;
      return pct < 100 && status !== 'COMPLETED';
    });
  }, [executiveTasks, taskLocalState]);

  const completedExecutiveTasksToday = React.useMemo(() => {
    return executiveTasks.filter((task) => {
      const local = taskLocalState[task.id];
      const pct = local !== undefined ? local.completionPercentage : task.completionPercentage;
      const status = local !== undefined ? local.status : task.status;
      const isCompleted = pct === 100 || status === 'COMPLETED';
      return isCompleted && isTaskUpdatedToday(task);
    });
  }, [executiveTasks, taskLocalState]);

  // Achievements Report Hub State
  const getCurrentMonthString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const getPrevMonthString = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const [reportPeriodMode, setReportPeriodMode] = useState<'MONTH' | 'CUSTOM'>('MONTH');
  const [reportMonth, setReportMonth] = useState<string>(getCurrentMonthString());
  const [reportStartDate, setReportStartDate] = useState<string>('');
  const [reportEndDate, setReportEndDate] = useState<string>('');
  const [reportStatusFilter, setReportStatusFilter] = useState<'COMPLETED_AND_NEARING' | 'COMPLETED' | 'NEARING' | 'ALL'>('COMPLETED_AND_NEARING');
  const [reportData, setReportData] = useState<AchievementsReportResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showInlineReportPreview, setShowInlineReportPreview] = useState(false);

  // Detect mobile device (native Capacitor mobile app or small screen viewport)
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
      const isSmall = typeof window !== 'undefined' && window.innerWidth < 768;
      const isMobileUA = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      setIsMobileDevice(isNative || isSmall || isMobileUA);
    };
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  useEffect(() => {
    setReadAnnouncementIds(getReadAnnouncementIds(currentUser.id));

    const handleReadUpdate = (e: any) => {
      if (e.detail?.userId === currentUser.id) {
        setReadAnnouncementIds(e.detail.readIds || getReadAnnouncementIds(currentUser.id));
      }
    };

    window.addEventListener('announcements:read_updated', handleReadUpdate);
    return () => window.removeEventListener('announcements:read_updated', handleReadUpdate);
  }, [currentUser.id]);

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab);
      }
    };
    const handleOpenTasks = () => {
      setActiveTab('EXECUTIVE_TASKS');
    };
    window.addEventListener('ports:switch_director_tab', handleSwitchTab);
    window.addEventListener('ports:open_tasks_modal', handleOpenTasks);
    return () => {
      window.removeEventListener('ports:switch_director_tab', handleSwitchTab);
      window.removeEventListener('ports:open_tasks_modal', handleOpenTasks);
    };
  }, []);

  const todayFormatted = new Date().toLocaleDateString('ar-SY', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    loadTodayData();
    loadExecutiveTasks();
    loadTemplates();
    loadHistory();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const res = await api.getTaskTemplates();
      setTemplates(res);
    } catch (err) {
      console.error('Failed to load task templates', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Synchronous flush before page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!plan) {
        const hasPlanContent = generalFocus.trim().length > 0 || tasks.some((t) => t.title.trim().length > 0);
        if (hasPlanContent) {
          localStorage.setItem(
            planDraftKey,
            JSON.stringify({
              generalFocus,
              tasks,
              updatedAt: new Date().toISOString(),
            })
          );
        }
      }
      if (!plan?.dailySummary) {
        const hasSummaryContent =
          summaryText.trim().length > 0 ||
          challenges.trim().length > 0 ||
          directorNotes.trim().length > 0 ||
          tomorrowPlanPreview.trim().length > 0 ||
          achievements.some((a) => a.trim().length > 0);
        if (hasSummaryContent) {
          localStorage.setItem(
            summaryDraftKey,
            JSON.stringify({
              summaryText,
              achievements,
              challenges,
              directorNotes,
              urgentFlag,
              tomorrowPlanPreview,
              updatedAt: new Date().toISOString(),
            })
          );
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [generalFocus, tasks, summaryText, achievements, challenges, directorNotes, urgentFlag, tomorrowPlanPreview, plan, planDraftKey, summaryDraftKey]);

  // Auto-save Plan Draft Effect
  useEffect(() => {
    if (loading || plan) return;
    const hasContent = generalFocus.trim().length > 0 || tasks.some((t) => t.title.trim().length > 0);
    if (!hasContent) {
      // If user cleared everything, remove draft
      localStorage.removeItem(planDraftKey);
      setPlanDraftSavedTime(null);
      return;
    }

    const timer = setTimeout(() => {
      try {
        const payload = {
          generalFocus,
          tasks,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(planDraftKey, JSON.stringify(payload));
        setPlanDraftSavedTime(new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' }));
      } catch (e) {
        console.error('Error saving plan draft', e);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [generalFocus, tasks, plan, loading, planDraftKey]);

  // Server Auto-Save Effect (when plan is already submitted/approved)
  useEffect(() => {
    if (loading || !plan || isInitialPlanLoadRef.current) return;

    const validTasks = tasks.filter((t) => (t.title || '').trim().length > 0);
    if (validTasks.length === 0) return;

    const currentHash = getPlanHash(generalFocus, validTasks);
    if (currentHash === lastSavedPlanHashRef.current) {
      return;
    }

    setAutoSaveStatus('SAVING');
    const timer = setTimeout(async () => {
      try {
        const res = await api.submitPlan({
          generalFocus,
          tasks: validTasks,
          isSilent: true,
        });

        lastSavedPlanHashRef.current = getPlanHash(res.generalFocus || '', res.tasks || []);
        setPlan(res);
        setAutoSaveStatus('SAVED');
        const nowStr = new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' });
        setAutoSaveTime(nowStr);

        setTasks((prev) =>
          prev.map((t, idx) => {
            if (!t.id && res.tasks[idx]?.id) {
              return { ...t, id: res.tasks[idx].id };
            }
            return t;
          })
        );

        window.dispatchEvent(new CustomEvent('ports:todos_updated'));
      } catch (err) {
        console.error('Failed to auto-save plan', err);
        setAutoSaveStatus('ERROR');
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [generalFocus, tasks, plan, loading]);

  // Auto-save Summary Draft Effect
  useEffect(() => {
    if (loading || plan?.dailySummary) return;
    const hasContent =
      summaryText.trim().length > 0 ||
      challenges.trim().length > 0 ||
      directorNotes.trim().length > 0 ||
      tomorrowPlanPreview.trim().length > 0 ||
      achievements.some((a) => a.trim().length > 0);
    if (!hasContent) {
      localStorage.removeItem(summaryDraftKey);
      setSummaryDraftSavedTime(null);
      return;
    }

    const timer = setTimeout(() => {
      try {
        const payload = {
          summaryText,
          achievements,
          challenges,
          directorNotes,
          urgentFlag,
          tomorrowPlanPreview,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(summaryDraftKey, JSON.stringify(payload));
        setSummaryDraftSavedTime(new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' }));
      } catch (e) {
        console.error('Error saving summary draft', e);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [summaryText, achievements, challenges, directorNotes, urgentFlag, tomorrowPlanPreview, plan?.dailySummary, loading, summaryDraftKey]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleFeedbackSent = (payload: any) => {
      if (payload.directorateId === currentUser.directorateId) {
        if (!payload.isReply && payload.fromRole !== 'DIRECTOR') {
          showToast(`وصلك توجيه جديد وملاحظات من المدير العام!`);
        }
        loadTodayData();
        loadHistory();
      }
    };

    const handleAnnouncementCreated = (payload: any) => {
      showToast(`تم نشر تعميم إداري عام جديد من المدير العام: "${payload.title}"`);
      api.getAnnouncements().then((res) => setAnnouncements(res)).catch(() => { });
    };

    const handleTaskCreated = (payload: any) => {
      if (payload.directorateId === currentUser.directorateId) {
        showToast(`⚡ وصلك تكليف جديد من المدير العام: "${payload.task?.title || ''}"`);
        loadExecutiveTasks();
      }
    };

    const handleTaskUpdated = (payload: any) => {
      if (payload.directorateId === currentUser.directorateId) {
        loadExecutiveTasks();
      }
    };

    const handleTaskDeleted = (payload: any) => {
      if (payload.directorateId === currentUser.directorateId) {
        loadExecutiveTasks();
      }
    };

    // Real-time synchronization of daily plan tasks (including when updated from personal agenda)
    const handlePlanTaskUpdated = (payload: any) => {
      if (payload.directorateId === currentUser.directorateId) {
        const matchesTask = (t: any) =>
          t.id === payload.taskId ||
          (payload.taskTitle && t.title && t.title.trim().toLowerCase() === payload.taskTitle.trim().toLowerCase());

        setPlan((prevPlan) => {
          if (!prevPlan) return prevPlan;
          return {
            ...prevPlan,
            tasks: prevPlan.tasks.map((t) =>
              matchesTask(t)
                ? {
                  ...t,
                  id: payload.taskId,
                  status: payload.status,
                  completionPercentage: payload.completionPercentage,
                  completionNote: payload.completionNote !== undefined ? payload.completionNote : t.completionNote,
                }
                : t,
            ),
          };
        });

        setTasks((prevTasks) => {
          const nextTasks = prevTasks.map((t) =>
            matchesTask(t)
              ? {
                ...t,
                id: payload.taskId,
                status: payload.status,
                completionPercentage: payload.completionPercentage,
                completionNote: payload.completionNote !== undefined ? payload.completionNote : t.completionNote,
              }
              : t,
          );
          lastSavedPlanHashRef.current = getPlanHash(generalFocus, nextTasks);
          return nextTasks;
        });

        setTrackedTasks((prev) => ({
          ...prev,
          [payload.taskId]: {
            status: payload.status,
            completionPercentage: payload.completionPercentage,
            completionNote:
              payload.completionNote !== undefined
                ? payload.completionNote
                : prev[payload.taskId]?.completionNote || '',
            isModified: false,
            isSaving: false,
          },
        }));
      }
    };

    const handleTodoUpdated = (payload: any) => {
      if (payload?.userId === currentUser.id) {
        loadTodayData({ silent: true });
      }
    };

    const handleWindowTodosUpdated = (e?: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent?.detail?.source === 'DirectorPortal') return;
      loadTodayData({ silent: true });
    };

    window.addEventListener('ports:todos_updated', handleWindowTodosUpdated);

    socket.on('feedback:sent', handleFeedbackSent);
    socket.on('announcement:created', handleAnnouncementCreated);
    socket.on('executive-task:created', handleTaskCreated);
    socket.on('executive-task:updated', handleTaskUpdated);
    socket.on('executive-task:deleted', handleTaskDeleted);
    socket.on('task:updated', handlePlanTaskUpdated);
    socket.on('todo:updated', handleTodoUpdated);

    return () => {
      window.removeEventListener('ports:todos_updated', handleWindowTodosUpdated);
      socket.off('feedback:sent', handleFeedbackSent);
      socket.off('announcement:created', handleAnnouncementCreated);
      socket.off('executive-task:created', handleTaskCreated);
      socket.off('executive-task:updated', handleTaskUpdated);
      socket.off('executive-task:deleted', handleTaskDeleted);
      socket.off('task:updated', handlePlanTaskUpdated);
      socket.off('todo:updated', handleTodoUpdated);
    };
  }, [currentUser]);

  const loadExecutiveTasks = async () => {
    if (!currentUser.directorateId) return;
    try {
      setLoadingExecTasks(true);
      const res = await api.getExecutiveTasks({ directorateId: currentUser.directorateId });
      setExecutiveTasks(res);
      const stateMap: any = {};
      res.forEach((t) => {
        stateMap[t.id] = {
          status: t.status,
          completionPercentage: t.completionPercentage,
          completionNote: t.completionNote || '',
          todayTargetMet: t.todayTargetMet || false,
          isModified: false,
        };
      });
      setTaskLocalState(stateMap);
    } catch (err) {
      console.error('Failed to load director executive tasks', err);
    } finally {
      setLoadingExecTasks(false);
    }
  };

  const handleLocalExecTaskChange = (taskId: string, field: string, value: any) => {
    setTaskLocalState((prev) => {
      const current = prev[taskId] || {
        status: 'PENDING' as TaskStatus,
        completionPercentage: 0,
        completionNote: '',
        todayTargetMet: false,
        isModified: false,
      };

      let nextStatus = current.status;
      let nextPercentage = current.completionPercentage;
      let nextNote = current.completionNote;
      let nextTodayTargetMet = current.todayTargetMet;

      if (field === 'completionPercentage') {
        const p = typeof value === 'number' ? value : parseInt(value, 10) || 0;
        nextPercentage = p;
        if (p === 100) {
          nextStatus = 'COMPLETED';
          nextTodayTargetMet = true;
        } else if (p === 0) {
          nextStatus = 'PENDING';
        } else {
          nextStatus = 'IN_PROGRESS';
        }
      } else if (field === 'status') {
        const s = value as TaskStatus;
        nextStatus = s;
        if (s === 'COMPLETED') {
          nextPercentage = 100;
          nextTodayTargetMet = true;
        } else if (s === 'PENDING') {
          nextPercentage = 0;
        } else if (s === 'IN_PROGRESS') {
          if (nextPercentage === 0 || nextPercentage === 100) {
            nextPercentage = 50;
          }
        }
      } else if (field === 'completionNote') {
        nextNote = value;
      } else if (field === 'todayTargetMet') {
        nextTodayTargetMet = Boolean(value);
      }

      // Check if actually modified compared to original saved task
      const original = executiveTasks.find((t) => t.id === taskId);
      const isDifferent = original
        ? (original.status !== nextStatus ||
          original.completionPercentage !== nextPercentage ||
          Boolean(original.todayTargetMet) !== Boolean(nextTodayTargetMet) ||
          (original.completionNote || '').trim() !== (nextNote || '').trim())
        : true;

      return {
        ...prev,
        [taskId]: {
          status: nextStatus,
          completionPercentage: nextPercentage,
          completionNote: nextNote,
          todayTargetMet: nextTodayTargetMet,
          isModified: isDifferent,
        },
      };
    });
  };

  const handleSaveExecutiveTask = async (taskId: string) => {
    const local = taskLocalState[taskId];
    if (!local) return;

    if (!local.isModified) {
      showToast('لا توجد أي تعديلات جديدة على هذا التكليف لإرسالها.');
      return;
    }

    try {
      setUpdatingTaskId(taskId);
      const taskAtts = execTaskAttachments[taskId];
      await api.updateExecutiveTask(taskId, {
        status: local.status,
        completionPercentage: local.completionPercentage,
        completionNote: local.completionNote,
        todayTargetMet: local.todayTargetMet,
        attachmentIds: taskAtts && taskAtts.length > 0 ? taskAtts.map((a) => a.id) : undefined,
      });
      if (taskAtts && taskAtts.length > 0) {
        setExecTaskAttachments((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      }
      const toastMsg = local.todayTargetMet
        ? 'تم حفظ مستهدف اليوم وتحديث تقرير التكليف بنجاح! ✔️'
        : 'تم إرسال تقرير إنجاز التكليف وتحديثه في أجندة المهام اليومية بنجاح!';
      showToast(toastMsg);
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
      setTaskLocalState((prev) => ({
        ...prev,
        [taskId]: { ...prev[taskId], isModified: false },
      }));
      await loadExecutiveTasks();
    } catch (err: any) {
      console.error('Failed to update executive task', err);
      if (err?.message?.includes('غير موجود')) {
        showToast('هذا التكليف لم يعد موجوداً في النظام (قد يكون تم حذفه من الإدارة العامة).');
        loadExecutiveTasks();
      } else {
        alert('حدث خطأ أثناء حفظ التعديل: ' + (err?.message || ''));
      }
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const renderExecutiveTaskCard = (task: ExecutiveTask, isPinnedInMorningPlan: boolean = true) => {
    const local = taskLocalState[task.id] || {
      status: task.status,
      completionPercentage: task.completionPercentage,
      completionNote: task.completionNote || '',
      todayTargetMet: task.todayTargetMet || false,
      isModified: false,
    };
    const isCompleted = local.status === 'COMPLETED' || local.completionPercentage === 100;
    const isSaving = updatingTaskId === task.id;

    const dueDateStr = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString('ar-SY', {
        day: 'numeric',
        month: 'short',
      })
      : null;

    return (
      <div
        key={task.id}
        className={`p-3.5 sm:p-4 rounded-2xl border transition shadow-xs space-y-3 ${isCompleted
            ? 'bg-emerald-50/30 border-emerald-300'
            : 'bg-white border-[#d4af37]/60 ring-1 ring-[#d4af37]/20 shadow-xs'
          }`}
      >
        {/* Header Badges & Due Date */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#0c3e35] text-[#d4af37] text-[10.5px] font-black">
              <Crown className="w-3 h-3 text-[#d4af37]" />
              <span>تكليف رسمي</span>
            </span>

            {task.isShared && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                <Users className="w-3 h-3 text-emerald-700" />
                <span>مشترك</span>
              </span>
            )}

            {task.priority === 'URGENT' && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-200">
                🚨 عاجل
              </span>
            )}
            {task.priority === 'HIGH' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                ⚠️ مرتفع
              </span>
            )}

            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isCompleted
                  ? 'bg-emerald-100 text-emerald-800'
                  : local.status === 'IN_PROGRESS'
                    ? 'bg-blue-100 text-blue-800'
                    : local.status === 'DELAYED'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-700'
                }`}
            >
              {isCompleted
                ? 'مكتملة ✓'
                : local.status === 'IN_PROGRESS'
                  ? 'قيد التنفيذ'
                  : local.status === 'DELAYED'
                    ? 'متأخرة'
                    : 'قيد الانتظار'}
            </span>

            {!isCompleted && (Boolean(local.todayTargetMet) || Boolean(task.todayTargetMet)) && (
              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md flex items-center gap-1 transition-all ${
                  local.isModified
                    ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                    : 'bg-emerald-600 text-white shadow-2xs'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>{local.isModified ? 'مستهدف اليوم: بانتظار الحفظ ⏳' : 'مستهدف اليوم: منجز ومحفوظ ✓'}</span>
              </span>
            )}
          </div>

          {dueDateStr && (
            <span className="text-[11px] font-medium text-[#5e736e] flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#d4af37]" />
              <span>استحقاق: {dueDateStr}</span>
            </span>
          )}
        </div>

        {/* Title & Instructions */}
        <div>
          <h4 className="text-sm sm:text-base font-extrabold text-[#05261e] leading-snug">
            {task.title}
          </h4>
          {task.description && (
            <p className="text-xs text-[#5e736e] mt-1 bg-[#fcfbf7] p-2 rounded-lg border border-[#edece4] leading-relaxed">
              {task.description}
            </p>
          )}

          {/* Attached Official Documents (Decrees & Completion proofs) */}
          {task.attachments && task.attachments.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <span className="text-[10.5px] font-bold text-[#0c3e35] flex items-center gap-1">
                <Paperclip className="w-3 h-3 text-[#d4af37]" />
                <span>المستندات الرسمية المرفقة بالتكليف ({task.attachments.length}):</span>
              </span>
              <div className="space-y-1.5">
                {task.attachments.map((att) => (
                  <PdfAttachmentCard
                    key={att.id}
                    attachment={att}
                    variant="compact"
                    title={att.category === 'TASK_COMPLETION' ? 'وثيقة ومحضر إنجاز التكليف' : 'كتاب التكليف والتوجيه الرسمي'}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Partner Directorates (if shared) */}
        {task.isShared && task.coTasks && task.coTasks.length > 1 && (
          <div className="p-2 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] space-y-1">
            <span className="text-[10.5px] font-bold text-[#0c3e35] flex items-center gap-1">
              <Users className="w-3 h-3 text-[#0c3e35]" />
              <span>المديريات المشاركة:</span>
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {task.coTasks.map((ct) => {
                const isMy = ct.directorateId === currentUser.directorateId;
                return (
                  <div
                    key={ct.id}
                    className={`p-1.5 rounded-lg border text-[10px] flex items-center justify-between ${isMy ? 'bg-white border-[#0c3e35] font-bold' : 'bg-white/70 border-[#d2d1c9]'
                      }`}
                  >
                    <span className="truncate">{ct.directorateName}</span>
                    <span className="font-extrabold text-[#0c3e35] mr-1">{ct.completionPercentage}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Progress & Controls */}
        <div className="pt-2 border-t border-[#f0eee6] space-y-2.5">
          {/* Row 1: Status Dropdown & Percentage Slider */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="w-full sm:w-36 shrink-0">
              <select
                value={local.status}
                onChange={(e) =>
                  handleLocalExecTaskChange(task.id, 'status', e.target.value as TaskStatus)
                }
                className="w-full p-2 rounded-lg bg-[#f4f3ed] border border-[#d2d1c9] text-xs font-bold text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
              >
                <option value="PENDING">قيد الانتظار</option>
                <option value="IN_PROGRESS">قيد التنفيذ</option>
                <option value="COMPLETED">مكتملة (100%)</option>
                <option value="DELAYED">متأخرة</option>
              </select>
            </div>

            <div className="flex-1 flex items-center gap-2.5 bg-[#fcfbf7] p-2 px-3 rounded-xl border border-[#edece4]">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={local.completionPercentage}
                onChange={(e) =>
                  handleLocalExecTaskChange(task.id, 'completionPercentage', Number(e.target.value))
                }
                className="flex-1 accent-[#0c3e35] cursor-pointer h-2"
              />
              <span className="text-xs sm:text-sm font-black text-[#0c3e35] min-w-[42px] text-center px-2 py-0.5 rounded-lg bg-white border border-[#d2d1c9] shadow-2xs shrink-0">
                {local.completionPercentage}%
              </span>
            </div>
          </div>

          {/* Today's target met control for multi-day executive task */}
          {(() => {
            const isTargetMet = Boolean(local.todayTargetMet) || isCompleted;
            const isUnsavedChange = local.isModified && (Boolean(local.todayTargetMet) !== Boolean(task.todayTargetMet));
            const isConfirmedSaved = Boolean(task.todayTargetMet) && !local.isModified;

            return (
              <div
                className={`flex items-center justify-between gap-2 flex-wrap p-2.5 rounded-xl border transition-all duration-200 ${
                  isCompleted
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : isUnsavedChange
                    ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-300/50 shadow-xs'
                    : isConfirmedSaved
                    ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-400/30 shadow-xs'
                    : 'bg-[#f8f7f2] border-[#d2d1c9]/70 hover:border-[#0c3e35]/30'
                }`}
              >
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isTargetMet}
                    disabled={isCompleted}
                    onChange={(e) =>
                      handleLocalExecTaskChange(task.id, 'todayTargetMet', e.target.checked)
                    }
                    className="w-4 h-4 rounded accent-[#0c3e35] cursor-pointer"
                  />
                  <span
                    className={`text-xs flex items-center gap-1.5 transition-colors ${
                      isConfirmedSaved
                        ? 'font-black text-emerald-950'
                        : isUnsavedChange
                        ? 'font-black text-amber-950'
                        : isTargetMet
                        ? 'font-extrabold text-[#0c3e35]'
                        : 'font-bold text-[#3e5550]'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isConfirmedSaved
                          ? 'text-emerald-600 fill-emerald-100'
                          : isUnsavedChange
                          ? 'text-amber-600'
                          : isTargetMet
                          ? 'text-emerald-600'
                          : 'text-slate-400'
                      }`}
                    />
                    <span>تم إنجاز المطلوب لهذا اليوم بنجاح ✔️</span>
                  </span>
                </label>

                {/* Clear Visual Indicators for Saved vs Unsaved */}
                <div className="flex items-center gap-2 flex-wrap">
                  {isConfirmedSaved && (
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-850 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                      <Check className="w-3.5 h-3.5 text-emerald-700 stroke-[2.5]" />
                      <span>محفوظ ومُعتمد اليوم (100% بمعدل اليوم)</span>
                    </span>
                  )}
                  {isUnsavedChange && (
                    <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-850 border border-amber-300 flex items-center gap-1.5 animate-pulse shadow-2xs">
                      <Clock className="w-3.5 h-3.5 text-amber-700" />
                      <span>تعديل غير محفوظ - اضغط زر «حفظ» أدناه</span>
                    </span>
                  )}
                  {!isConfirmedSaved && !isUnsavedChange && (
                    <span className="text-[10.5px] text-[#5e736e] font-medium">
                      {isCompleted
                        ? '✨ التكليف منجز بالكامل بنسبة 100%'
                        : 'فعّل هذا الخيار إذا حققت مستهدف اليوم (يُحسب 100% بمعدل اليوم)'}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Row 2: Note Input & Quick Save Button */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="ملاحظات أو مستجدات الإنجاز..."
              value={local.completionNote}
              onChange={(e) =>
                handleLocalExecTaskChange(task.id, 'completionNote', e.target.value)
              }
              className="flex-1 p-2 rounded-lg bg-[#f4f3ed] border border-[#d2d1c9] text-xs text-[#0c3e35] focus:outline-none focus:border-[#0c3e35] placeholder-[#8daaa2]"
            />

            {local.isModified ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveExecutiveTask(task.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0c3e35] text-white text-xs font-bold hover:bg-[#072923] transition cursor-pointer shrink-0 shadow-xs active:scale-95 animate-pulse border border-[#d4af37]/60"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d4af37]" /> : <Save className="w-3.5 h-3.5 text-[#d4af37]" />}
                <span>حفظ</span>
              </button>
            ) : (
              <span className="text-[11px] text-emerald-700 font-bold px-2.5 py-1 bg-emerald-50 rounded-lg border border-emerald-200 shrink-0 inline-flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>محفوظ</span>
              </span>
            )}
          </div>

          {/* Row 3: Official Completion / Proof Documents (PDF) */}
          <div className="pt-2 border-t border-[#f4f3ed]">
            <PdfAttachmentPicker
              attachments={execTaskAttachments[task.id] || []}
              onAttachmentsChange={(newAtts) => {
                setExecTaskAttachments((prev) => ({ ...prev, [task.id]: newAtts }));
                setTaskLocalState((prev) => ({
                  ...prev,
                  [task.id]: {
                    ...(prev[task.id] || {
                      status: task.status,
                      completionPercentage: task.completionPercentage,
                      completionNote: task.completionNote || '',
                      todayTargetMet: task.todayTargetMet || false,
                    }),
                    isModified: true,
                  },
                }));
              }}
              category="TASK_COMPLETION"
              label="إرفاق كتب ومحاضر إنجاز التكليف (PDF)"
              hint="يمكنك إرفاق عدة مستندات رسمية لتوثيق وإثبات إنجاز التكليف"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderPinnedExecutiveTasksSection = () => {
    if (activeExecutiveTasks.length === 0 && completedExecutiveTasksToday.length === 0) {
      return null;
    }

    return (
      <div className="space-y-2.5 mb-4 animate-fadeIn">
        {/* Clean Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-[#d4af37]" />
            <span className="text-xs font-black text-[#0c3e35]">
              تكليفات المدير العام
            </span>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#0c3e35] text-[#d4af37]">
              {activeExecutiveTasks.length}
            </span>
          </div>
        </div>

        {/* Active Tasks List */}
        {activeExecutiveTasks.length > 0 && (
          <div className="space-y-2.5">
            {activeExecutiveTasks.map((task) => renderExecutiveTaskCard(task, true))}
          </div>
        )}

        {/* Completed Today Section */}
        {completedExecutiveTasksToday.length > 0 && (
          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 px-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>أُنجزت اليوم بالكامل:</span>
            </span>
            {completedExecutiveTasksToday.map((task) => renderExecutiveTaskCard(task, true))}
          </div>
        )}
      </div>
    );
  };

  const loadTodayData = async (options?: { silent?: boolean }) => {
    const isSilent = options?.silent ?? (!isInitialPlanLoadRef.current && plan !== null);
    try {
      if (!isSilent) setLoading(true);
      const [currentPlan, anns, incTasks] = await Promise.all([
        api.getMyTodayPlan(),
        api.getAnnouncements().catch(() => []),
        api.getIncompleteTasks().catch(() => []),
      ]);
      setPlan(currentPlan);
      setAnnouncements(anns);
      setIncompleteTasks(incTasks || []);
      if (anns && anns.length > 0) {
        const readFromAnns = anns.filter((a: any) => a.isReadByMe).map((a: any) => a.id);
        if (readFromAnns.length > 0) {
          syncReadNotificationsFromServer(currentUser.id, readFromAnns);
          setReadAnnouncementIds(getReadAnnouncementIds(currentUser.id));
        }
      }

      if (currentPlan) {
        setGeneralFocus(currentPlan.generalFocus || '');
        if (currentPlan.tasks && currentPlan.tasks.length > 0) {
          const mappedTasks = currentPlan.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description || '',
            priority: t.priority,
            estimatedHours: t.estimatedHours,
            carriedFromTaskId: t.carriedFromTaskId,
            carriedFromDate: t.carriedFromTask?.dailyPlan?.planDate,
            initialCompletionPercentage: t.carriedFromTask?.completionPercentage ?? t.completionPercentage,
            completionPercentage: t.completionPercentage,
            status: t.status,
            completionNote: t.completionNote,
            isMultiDay: t.isMultiDay !== undefined ? t.isMultiDay : !!t.carriedFromTaskId,
            todayTargetMet: t.todayTargetMet ?? false,
          }));
          setTasks(mappedTasks);
          lastSavedPlanHashRef.current = getPlanHash(currentPlan.generalFocus || '', mappedTasks);
        } else {
          lastSavedPlanHashRef.current = getPlanHash(currentPlan.generalFocus || '', []);
        }
        setAutoSaveStatus('SAVED');
        if (currentPlan.dailySummary) {
          const s = currentPlan.dailySummary;
          setSummaryText(s.summaryText || '');
          setAchievements(s.achievements && s.achievements.length > 0 ? s.achievements : ['']);
          setChallenges(s.challenges || '');
          setDirectorNotes(s.directorNotes || '');
          setUrgentFlag(s.urgentFlag || false);
          setTomorrowPlanPreview(s.tomorrowPlanPreview || '');
          if (s.attachments && s.attachments.length > 0) {
            setSummaryAttachments(s.attachments);
          } else {
            setSummaryAttachments([]);
          }
        } else {
          // Check for summary draft
          const rawSummaryDraft = localStorage.getItem(summaryDraftKey);
          if (rawSummaryDraft) {
            try {
              const parsed = JSON.parse(rawSummaryDraft);
              if (parsed.summaryText) setSummaryText(parsed.summaryText);
              if (parsed.achievements) setAchievements(parsed.achievements);
              if (parsed.challenges) setChallenges(parsed.challenges);
              if (parsed.directorNotes) setDirectorNotes(parsed.directorNotes);
              if (parsed.urgentFlag !== undefined) setUrgentFlag(parsed.urgentFlag);
              if (parsed.tomorrowPlanPreview) setTomorrowPlanPreview(parsed.tomorrowPlanPreview);
              setSummaryDraftSavedTime(new Date(parsed.updatedAt || Date.now()).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' }));
            } catch (e) { }
          }
        }
      } else {
        // No plan on server yet -> check for local plan draft
        const rawPlanDraft = localStorage.getItem(planDraftKey);
        if (rawPlanDraft) {
          try {
            const parsed = JSON.parse(rawPlanDraft);
            if (parsed.generalFocus) setGeneralFocus(parsed.generalFocus);
            if (parsed.tasks && parsed.tasks.length > 0) setTasks(parsed.tasks);
            setPlanDraftSavedTime(new Date(parsed.updatedAt || Date.now()).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' }));
          } catch (e) { }
        }
        lastSavedPlanHashRef.current = '';
      }
    } catch (err) {
      console.error('Failed to load director plan', err);
    } finally {
      if (!isSilent) setLoading(false);
      isInitialPlanLoadRef.current = false;
    }
  };

  const loadHistory = async () => {
    try {
      const hist = await api.getDirectorHistory();
      setHistory(hist);
    } catch (err) {
      console.error('Failed to load history', err);
    }
  };

  const handleSendReply = async (planId: string, dailySummaryId?: string) => {
    const text = replyTextMap[planId]?.trim();
    if (!text || !currentUser.directorateId) return;

    try {
      setSubmittingReplyPlanId(planId);
      const newFeedback = await api.sendFeedback({
        directorateId: currentUser.directorateId,
        dailyPlanId: planId,
        dailySummaryId: dailySummaryId,
        feedbackText: text,
      });

      // Update history state if present
      setHistory((prev) =>
        prev.map((item) => {
          if (item.id === planId) {
            return {
              ...item,
              feedbacks: [...(item.feedbacks || []), newFeedback],
            };
          }
          return item;
        })
      );

      // Update current plan state if present
      if (plan && plan.id === planId) {
        setPlan((prev) =>
          prev
            ? {
              ...prev,
              feedbacks: [...(prev.feedbacks || []), newFeedback],
            }
            : null
        );
      }

      setReplyTextMap((prev) => ({ ...prev, [planId]: '' }));
      setReplyOpenPlanId(null);
      showToast('تم إرسال ردك وتوضيحك للمدير العام بنجاح!');
    } catch (err: any) {
      console.error('Failed to send reply to feedback', err);
      alert('حدث خطأ أثناء إرسال الرد: ' + (err?.message || ''));
    } finally {
      setSubmittingReplyPlanId(null);
    }
  };

  const loadAchievementsReport = async () => {
    try {
      setLoadingReport(true);
      const params: any = {
        statusFilter: reportStatusFilter,
      };
      if (reportPeriodMode === 'MONTH') {
        params.month = reportMonth;
      } else {
        if (reportStartDate && reportEndDate) {
          params.startDate = reportStartDate;
          params.endDate = reportEndDate;
        } else {
          params.month = reportMonth;
        }
      }
      const res = await api.getAchievementsReport(params);
      setReportData(res);
    } catch (err) {
      console.error('Failed to load achievements report', err);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleOpenPrintReport = () => {
    let url = `/director-report?filter=${reportStatusFilter}`;
    if (reportPeriodMode === 'MONTH') {
      url += `&month=${reportMonth}`;
    } else if (reportStartDate && reportEndDate) {
      url += `&startDate=${reportStartDate}&endDate=${reportEndDate}`;
    } else {
      url += `&month=${reportMonth}`;
    }
    window.open(url, '_blank');
  };

  useEffect(() => {
    if (activeTab === 'HISTORY') {
      loadHistory();
      loadAchievementsReport();
    }
  }, [activeTab, reportMonth, reportStartDate, reportEndDate, reportStatusFilter, reportPeriodMode]);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Plan actions
  const handleAddTask = () => {
    setTasks([...tasks, { title: '', description: '', priority: 'NORMAL', estimatedHours: 1.5 }]);
  };

  const handleRemoveTask = (index: number) => {
    setTasks((prev) => {
      const remaining = prev.filter((_, idx) => idx !== index);
      return remaining.length > 0
        ? remaining
        : [{ title: '', description: '', priority: 'NORMAL', estimatedHours: 1.5 }];
    });
  };

  // Delete Plan Task Confirmation Modal State & Handlers
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<{
    index: number;
    id?: string;
    title: string;
    isSavedOnServer: boolean;
  } | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  const handleDeleteTaskClick = (index: number) => {
    const task = tasks[index];
    if (!task) return;

    // Check if this task is already saved on server in plan
    const isSavedOnServer = Boolean(task.id && plan?.tasks?.some((t) => t.id === task.id));

    // If it's an unsaved blank row, remove immediately without modal
    if (!task.title.trim() && !isSavedOnServer) {
      handleRemoveTask(index);
      return;
    }

    setDeleteConfirmTask({
      index,
      id: task.id,
      title: task.title.trim() || 'مهمة بدون عنوان',
      isSavedOnServer,
    });
  };

  const handleConfirmDeleteTask = async () => {
    if (!deleteConfirmTask) return;
    const { index, id, title, isSavedOnServer } = deleteConfirmTask;

    try {
      setIsDeletingTask(true);

      if (isSavedOnServer && id) {
        await api.deletePlanTask(id);

        // Update in-memory plan
        if (plan) {
          setPlan({
            ...plan,
            tasks: plan.tasks.filter((t) => t.id !== id),
          });
        }

        // Clean up trackedTasks
        setTrackedTasks((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });

        window.dispatchEvent(new CustomEvent('ports:todos_updated'));
        showToast(`تم حذف المهمة "${title}" نهائياً من خطة اليوم وتحديث السجل!`);
      } else {
        showToast(`تمت إزالة المهمة "${title}" من المسودة`);
      }

      // Remove from tasks list; if it was the last task, leave an empty row
      setTasks((prev) => {
        const remaining = prev.filter((_, idx) => idx !== index);
        return remaining.length > 0
          ? remaining
          : [{ title: '', description: '', priority: 'NORMAL', estimatedHours: 1.5 }];
      });

      setDeleteConfirmTask(null);
    } catch (err: any) {
      console.error('Failed to delete task', err);
      alert(err?.message || 'حدث خطأ أثناء حذف المهمة');
    } finally {
      setIsDeletingTask(false);
    }
  };

  const handleTaskChange = (index: number, field: string, value: any) => {
    const updated = [...tasks];
    (updated[index] as any)[field] = value;

    if (field === 'completionPercentage') {
      const pct = typeof value === 'number' ? value : parseInt(value, 10) || 0;
      if (pct === 100) {
        updated[index].status = 'COMPLETED';
        updated[index].todayTargetMet = true;
      } else if (pct === 0) {
        updated[index].status = 'PENDING';
      } else {
        updated[index].status = 'IN_PROGRESS';
      }
    } else if (field === 'status') {
      const s = value as TaskStatus;
      if (s === 'COMPLETED') {
        updated[index].completionPercentage = 100;
        updated[index].todayTargetMet = true;
      } else if (s === 'PENDING') {
        updated[index].completionPercentage = 0;
      } else if (s === 'IN_PROGRESS' && (updated[index].completionPercentage === 0 || updated[index].completionPercentage === 100)) {
        updated[index].completionPercentage = 50;
      }
    }

    setTasks(updated);
  };

  // Cloning Previous Plan (Requirement 2)
  const handleClonePreviousPlan = async () => {
    try {
      setLoadingPreviousPlan(true);
      const res = await api.clonePreviousPlan();
      if (res && res.tasks && res.tasks.length > 0) {
        setGeneralFocus(res.generalFocus || '');
        setTasks(
          res.tasks.map((t: any) => ({
            title: t.title,
            description: t.description || '',
            priority: (t.priority as Priority) || 'NORMAL',
            estimatedHours: t.estimatedHours || 1.5,
            carriedFromTaskId: t.carriedFromTaskId || t.id,
            carriedFromDate: res.previousDate,
            initialCompletionPercentage: t.completionPercentage ?? 0,
            completionPercentage: t.completionPercentage ?? 0,
            status: ((t.completionPercentage ?? 0) > 0 ? 'IN_PROGRESS' : (t.status || 'PENDING')) as TaskStatus,
            completionNote: '',
            isMultiDay: true,
            todayTargetMet: false,
          }))
        );
        showToast('تم استيراد مهام آخر خطة سابقة بنجاح!');
      }
    } catch (err: any) {
      alert(err.message || 'لا توجد خطة سابقة لهذه المديرية لاستيرادها');
    } finally {
      setLoadingPreviousPlan(false);
    }
  };

  // Incomplete / Carried-over Tasks Management
  const fetchIncompleteTasks = async () => {
    try {
      setLoadingIncompleteTasks(true);
      const res = await api.getIncompleteTasks();
      setIncompleteTasks(res || []);
    } catch (err) {
      console.error('Failed to fetch incomplete tasks', err);
    } finally {
      setLoadingIncompleteTasks(false);
    }
  };

  const handleImportIncompleteTask = (incTask: IncompleteTask) => {
    const alreadyExists = tasks.some(
      (t) => t.title.trim().toLowerCase() === incTask.title.trim().toLowerCase()
    );
    if (alreadyExists) {
      showToast(`المهمة "${incTask.title}" موجودة بالفعل في قائمة مهام اليوم`);
      return;
    }

    const newTask = {
      title: incTask.title,
      description: incTask.description || '',
      priority: incTask.priority,
      estimatedHours: incTask.estimatedHours || 1.5,
      carriedFromTaskId: incTask.id,
      carriedFromDate: incTask.planDate || undefined,
      initialCompletionPercentage: incTask.completionPercentage,
      completionPercentage: incTask.completionPercentage,
      status: (incTask.completionPercentage > 0 ? 'IN_PROGRESS' : 'PENDING') as TaskStatus,
      completionNote: incTask.completionNote || '',
      isMultiDay: true,
      todayTargetMet: false,
    };

    setTasks((prev) => {
      const clean = prev.filter((t) => t.title.trim().length > 0);
      return [...clean, newTask];
    });

    showToast(`تم إدراج مهمة: "${incTask.title}" بنسبة إنجاز سابقة ${incTask.completionPercentage}%!`);
  };

  const handleImportAllIncompleteTasks = (tasksToImport: IncompleteTask[]) => {
    const currentTitles = new Set(tasks.map((t) => t.title.trim().toLowerCase()));
    const newItems = tasksToImport
      .filter((t) => !currentTitles.has(t.title.trim().toLowerCase()))
      .map((incTask) => ({
        title: incTask.title,
        description: incTask.description || '',
        priority: incTask.priority,
        estimatedHours: incTask.estimatedHours || 1.5,
        carriedFromTaskId: incTask.id,
        carriedFromDate: incTask.planDate || undefined,
        initialCompletionPercentage: incTask.completionPercentage,
        completionPercentage: incTask.completionPercentage,
        status: (incTask.completionPercentage > 0 ? 'IN_PROGRESS' : 'PENDING') as TaskStatus,
        completionNote: incTask.completionNote || '',
        isMultiDay: true,
        todayTargetMet: false,
      }));

    if (newItems.length === 0) {
      showToast('كافة المهام المحددة مدرجة بالفعل في خطة اليوم');
      return;
    }

    setTasks((prev) => {
      const clean = prev.filter((t) => t.title.trim().length > 0);
      return [...clean, ...newItems];
    });

    showToast(`تم ترحيل ${newItems.length} مهام معلقة بنجاح إلى خطة اليوم!`);
    setShowIncompleteTasksModal(false);
  };

  const handleDismissIncompleteTask = async (taskId: string) => {
    try {
      await api.updateTaskStatus(taskId, { status: 'CANCELLED' });
      setIncompleteTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast('تم إغلاق المهمة واستبعادها من قائمة المتابعة');
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء إغلاق المهمة');
    }
  };

  // Templates Management (Requirement 2)
  const getMatchingTemplate = (task: { title: string; templateId?: string }) => {
    const cleanTitle = task.title.trim().toLowerCase();
    if (!cleanTitle) return null;
    const byTitle = templates.find((t) => t.title.trim().toLowerCase() === cleanTitle);
    if (byTitle) return byTitle;
    if (task.templateId) {
      const byId = templates.find((t) => t.id === task.templateId);
      if (byId && byId.title.trim().toLowerCase() === cleanTitle) {
        return byId;
      }
    }
    return null;
  };

  const handleApplyTemplate = (tpl: TaskTemplate) => {
    setTasks((prev) => [
      ...prev.filter((t) => t.title.trim().length > 0),
      {
        title: tpl.title,
        description: tpl.description || '',
        priority: tpl.priority,
        estimatedHours: tpl.estimatedHours,
        templateId: tpl.id,
      },
    ]);
    showToast(`تم إدراج مهمة: "${tpl.title}" من القالب!`);
    setShowTemplatesModal(false);
  };

  const handleApplyAllTemplates = () => {
    if (templates.length === 0) return;
    setTasks((prev) => [
      ...prev.filter((t) => t.title.trim().length > 0),
      ...templates.map((tpl) => ({
        title: tpl.title,
        description: tpl.description || '',
        priority: tpl.priority,
        estimatedHours: tpl.estimatedHours,
        templateId: tpl.id,
      })),
    ]);
    showToast(`تم إدراج كافة القوالب (${templates.length} مهام) في الخطة!`);
    setShowTemplatesModal(false);
  };

  const handleToggleTemplate = async (
    task: { title: string; description: string; priority: Priority; estimatedHours: number; templateId?: string },
    idx: number
  ) => {
    if (!task.title.trim()) {
      alert('يرجى كتابة عنوان للمهمة أولاً لحفظها كقالب');
      return;
    }

    const matchingTpl = getMatchingTemplate(task);

    try {
      setTogglingTemplateIdx(idx);
      if (matchingTpl) {
        // Unsave / cancel template
        await api.deleteTaskTemplate(matchingTpl.id);
        setTemplates((prev) => prev.filter((t) => t.id !== matchingTpl.id));
        setTasks((prev) => {
          const updated = [...prev];
          if (updated[idx]) {
            updated[idx] = { ...updated[idx], templateId: undefined };
          }
          return updated;
        });
        showToast(`تم إلغاء حفظ "${matchingTpl.title}" من القوالب المتكررة`);
      } else {
        // Save as template
        const created = await api.createTaskTemplate({
          title: task.title.trim(),
          description: task.description?.trim() || undefined,
          priority: task.priority,
          estimatedHours: task.estimatedHours,
        });
        setTemplates((prev) => [...prev.filter((t) => t.id !== created.id), created]);
        setTasks((prev) => {
          const updated = [...prev];
          if (updated[idx]) {
            updated[idx] = { ...updated[idx], templateId: created.id };
          }
          return updated;
        });
        showToast(`تم حفظ "${task.title}" كقالب مهمة متكررة بنجاح!`);
      }
      loadTemplates();
    } catch (err) {
      console.error('Failed to toggle template', err);
      alert(matchingTpl ? 'حدث خطأ أثناء إلغاء حفظ القالب' : 'حدث خطأ أثناء حفظ القالب');
    } finally {
      setTogglingTemplateIdx(null);
    }
  };

  const handleCreateNewTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateForm.title.trim()) return;

    try {
      setCreatingTemplate(true);
      await api.createTaskTemplate({
        title: newTemplateForm.title,
        description: newTemplateForm.description,
        priority: newTemplateForm.priority,
        estimatedHours: newTemplateForm.estimatedHours,
      });
      setNewTemplateForm({
        title: '',
        description: '',
        priority: 'NORMAL',
        estimatedHours: 1.5,
      });
      showToast('تمت إضافة القالب الجديد بنجاح!');
      loadTemplates();
    } catch (err) {
      console.error('Failed to create template', err);
      alert('حدث خطأ أثناء حفظ القالب');
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا القالب؟')) return;
    try {
      await api.deleteTaskTemplate(id);
      showToast('تم حذف القالب بنجاح');
      loadTemplates();
    } catch (err) {
      console.error('Failed to delete template', err);
      alert('حدث خطأ أثناء حذف القالب');
    }
  };

  const handleSubmitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const validTasks = tasks.filter((t) => t.title.trim().length > 0);
    if (validTasks.length === 0) {
      alert('يرجى إضافة مهمة واحدة على الأقل في الخطة اليومية');
      return;
    }

    try {
      setSaving(true);
      const isInitialSubmission = !plan;
      const res = await api.submitPlan({
        generalFocus,
        tasks: validTasks,
        isSilent: !isInitialSubmission,
      });
      setPlan(res);
      lastSavedPlanHashRef.current = getPlanHash(res.generalFocus || '', res.tasks || []);
      setAutoSaveStatus('SAVED');
      const nowStr = new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' });
      setAutoSaveTime(nowStr);

      if (res?.tasks && res.tasks.length > 0) {
        setTasks(
          res.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description || '',
            priority: t.priority,
            estimatedHours: t.estimatedHours,
            carriedFromTaskId: t.carriedFromTaskId,
            carriedFromDate: t.carriedFromTask?.dailyPlan?.planDate,
            initialCompletionPercentage: t.carriedFromTask?.completionPercentage ?? t.completionPercentage,
            completionPercentage: t.completionPercentage,
            status: t.status,
            completionNote: t.completionNote,
            isMultiDay: t.isMultiDay !== undefined ? t.isMultiDay : !!t.carriedFromTaskId,
            todayTargetMet: t.todayTargetMet ?? false,
          }))
        );
      }
      // Clear plan draft
      localStorage.removeItem(planDraftKey);
      setPlanDraftSavedTime(null);

      if (isInitialSubmission) {
        showToast('تم اعتماد وإرسال الخطة للمدير العام بنجاح!');
      } else {
        showToast('تم حفظ وتحديث مهام الخطة بنجاح!');
      }
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to submit plan', err);
      alert('حدث خطأ أثناء حفظ الخطة');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateQuickTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;

    try {
      setSavingQuickTask(true);
      const newTask = await api.addQuickPlanTask({
        title: quickTaskTitle.trim(),
        description: quickTaskDesc.trim() || undefined,
        priority: quickTaskPriority,
      });

      if (plan) {
        setPlan({
          ...plan,
          tasks: [...plan.tasks, newTask],
        });
      }

      setTasks((prev) => [
        ...prev.filter((t) => t.title.trim().length > 0),
        {
          id: newTask.id,
          title: newTask.title,
          description: newTask.description || '',
          priority: newTask.priority,
          estimatedHours: newTask.estimatedHours || 1.5,
          status: newTask.status,
          completionPercentage: newTask.completionPercentage || 0,
        },
      ]);

      setTrackedTasks((prev) => ({
        ...prev,
        [newTask.id]: {
          status: newTask.status,
          completionPercentage: newTask.completionPercentage || 0,
          completionNote: '',
          isModified: false,
          isSaving: false,
        },
      }));

      showToast(`تمت إضافة المهمة "${newTask.title}" لخطة اليوم بنجاح!`);
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
      setQuickTaskTitle('');
      setQuickTaskDesc('');
      setQuickTaskPriority('NORMAL');
      setShowQuickAddModal(false);
    } catch (err: any) {
      console.error('Failed to create quick task', err);
      alert(err?.message || 'حدث خطأ أثناء إضافة المهمة');
    } finally {
      setSavingQuickTask(false);
    }
  };

  const handleStartEditTask = (task: PlanTask) => {
    setEditingTaskId(task.id);
    setEditTaskTitle(task.title);
    setEditTaskDesc(task.description || '');
  };

  const handleSaveInlineEdit = async (taskId: string) => {
    if (!editTaskTitle.trim()) {
      alert('لا يمكن ترك عنوان المهمة فارغاً');
      return;
    }

    try {
      setSavingTaskEdit(true);
      await api.updateTaskStatus(taskId, {
        title: editTaskTitle.trim(),
        description: editTaskDesc.trim(),
      });

      if (plan) {
        setPlan({
          ...plan,
          tasks: plan.tasks.map((t) =>
            t.id === taskId ? { ...t, title: editTaskTitle.trim(), description: editTaskDesc.trim() } : t
          ),
        });
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, title: editTaskTitle.trim(), description: editTaskDesc.trim() } : t
        )
      );

      showToast('تم تحديث بيانات المهمة بنجاح!');
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
      setEditingTaskId(null);
    } catch (err: any) {
      console.error('Failed to update task inline', err);
      alert(err?.message || 'حدث خطأ أثناء تعديل المهمة');
    } finally {
      setSavingTaskEdit(false);
    }
  };

  // Live tracking local state
  const [trackedTasks, setTrackedTasks] = useState<{
    [taskId: string]: {
      status: TaskStatus;
      completionPercentage: number;
      completionNote?: string;
      isMultiDay?: boolean;
      todayTargetMet?: boolean;
      isModified: boolean;
      isSaving: boolean;
    };
  }>({});
  const [savingAllTasks, setSavingAllTasks] = useState(false);

  // Sync trackedTasks with plan.tasks whenever plan is loaded
  useEffect(() => {
    if (plan?.tasks) {
      setTrackedTasks((prev) => {
        const nextState: typeof prev = {};
        plan.tasks.forEach((t) => {
          nextState[t.id] = {
            status: t.status,
            completionPercentage: t.completionPercentage,
            completionNote: t.completionNote || '',
            isMultiDay: t.isMultiDay !== undefined ? t.isMultiDay : !!t.carriedFromTaskId,
            todayTargetMet: t.todayTargetMet ?? false,
            isModified: prev[t.id]?.isModified ?? false,
            isSaving: false,
          };
        });
        return nextState;
      });
    }
  }, [plan]);

  // Handle local status change without immediate network request
  const handleLocalStatusChange = (taskId: string, newStatus: TaskStatus, defaultPercentage?: number) => {
    setTrackedTasks((prev) => {
      const current = prev[taskId];
      const initialTask = plan?.tasks?.find((t) => t.id === taskId);
      let nextPercentage = current ? current.completionPercentage : initialTask?.completionPercentage || 0;

      if (defaultPercentage !== undefined) {
        nextPercentage = defaultPercentage;
      } else if (newStatus === 'COMPLETED') {
        nextPercentage = 100;
      } else if (newStatus === 'PENDING') {
        nextPercentage = 0;
      } else if (newStatus === 'IN_PROGRESS') {
        if (nextPercentage === 0 || nextPercentage === 100) {
          nextPercentage = 50;
        }
      }

      const isDifferent =
        initialTask &&
        (initialTask.status !== newStatus || initialTask.completionPercentage !== nextPercentage);

      return {
        ...prev,
        [taskId]: {
          status: newStatus,
          completionPercentage: nextPercentage,
          completionNote: current?.completionNote || initialTask?.completionNote || '',
          isModified: !!isDifferent,
          isSaving: false,
        },
      };
    });
  };

  // Handle local slider percentage change smoothly
  const handleLocalPercentageChange = (taskId: string, percentage: number) => {
    setTrackedTasks((prev) => {
      const current = prev[taskId];
      const initialTask = plan?.tasks?.find((t) => t.id === taskId);
      let newStatus = current ? current.status : initialTask?.status || 'PENDING';

      if (percentage === 100) {
        newStatus = 'COMPLETED';
      } else if (percentage === 0) {
        newStatus = 'PENDING';
      } else if (newStatus === 'PENDING' || newStatus === 'COMPLETED') {
        newStatus = 'IN_PROGRESS';
      }

      const isDifferent =
        initialTask &&
        (initialTask.status !== newStatus || initialTask.completionPercentage !== percentage);

      return {
        ...prev,
        [taskId]: {
          status: newStatus,
          completionPercentage: percentage,
          completionNote: current?.completionNote || initialTask?.completionNote || '',
          isModified: !!isDifferent,
          isSaving: false,
        },
      };
    });
  };

  // Save single task status and notify General Director once
  const handleSaveTaskStatus = async (taskId: string) => {
    const taskState = trackedTasks[taskId];
    if (!taskState) return;

    try {
      setTrackedTasks((prev) => ({
        ...prev,
        [taskId]: { ...prev[taskId], isSaving: true },
      }));

      await api.updateTaskStatus(taskId, {
        status: taskState.status,
        completionPercentage: taskState.completionPercentage,
        completionNote: taskState.completionNote,
        isMultiDay: taskState.isMultiDay,
        todayTargetMet: taskState.todayTargetMet,
      });

      // Update in-memory plan
      if (plan) {
        setPlan({
          ...plan,
          tasks: plan.tasks.map((t) =>
            t.id === taskId
              ? {
                ...t,
                status: taskState.status,
                completionPercentage: taskState.completionPercentage,
                completionNote: taskState.completionNote,
              }
              : t
          ),
        });
      }

      // Keep tasks state in sync so returning to PLAN tab retains progress
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: taskState.status,
              completionPercentage: taskState.completionPercentage,
              completionNote: taskState.completionNote,
            }
            : t
        )
      );

      setTrackedTasks((prev) => ({
        ...prev,
        [taskId]: { ...prev[taskId], isModified: false, isSaving: false },
      }));

      window.dispatchEvent(new CustomEvent('ports:todos_updated'));

      showToast(
        taskState.status === 'COMPLETED' || taskState.completionPercentage === 100
          ? 'تم توثيق إنجاز المهمة بنجاح وتحديثها كـ مكتملة في أجندة المهام اليومية'
          : 'تم حفظ حالة المهمة بنجاح وإشعار المدير العام'
      );
    } catch (err) {
      console.error('Failed to update task', err);
      alert('حدث خطأ أثناء حفظ حالة المهمة');
      setTrackedTasks((prev) => ({
        ...prev,
        [taskId]: { ...prev[taskId], isSaving: false },
      }));
    }
  };

  const modifiedTaskIds = Object.keys(trackedTasks).filter((id) => trackedTasks[id]?.isModified);

  // Save all modified tasks in one action
  const handleSaveAllModifiedTasks = async () => {
    if (modifiedTaskIds.length === 0) return;

    try {
      setSavingAllTasks(true);
      await Promise.all(
        modifiedTaskIds.map((taskId) =>
          api.updateTaskStatus(taskId, {
            status: trackedTasks[taskId].status,
            completionPercentage: trackedTasks[taskId].completionPercentage,
            completionNote: trackedTasks[taskId].completionNote,
            isMultiDay: trackedTasks[taskId].isMultiDay,
            todayTargetMet: trackedTasks[taskId].todayTargetMet,
          })
        )
      );

      if (plan) {
        setPlan({
          ...plan,
          tasks: plan.tasks.map((t) => {
            const mod = trackedTasks[t.id];
            return mod && mod.isModified
              ? {
                ...t,
                status: mod.status,
                completionPercentage: mod.completionPercentage,
                completionNote: mod.completionNote,
              }
              : t;
          }),
        });
      }

      // Keep tasks state in sync so returning to PLAN tab retains progress
      setTasks((prev) =>
        prev.map((t) => {
          const mod = t.id ? trackedTasks[t.id] : undefined;
          return mod && mod.isModified
            ? {
              ...t,
              status: mod.status,
              completionPercentage: mod.completionPercentage,
              completionNote: mod.completionNote,
            }
            : t;
        })
      );

      setTrackedTasks((prev) => {
        const updated = { ...prev };
        modifiedTaskIds.forEach((id) => {
          if (updated[id]) {
            updated[id] = { ...updated[id], isModified: false, isSaving: false };
          }
        });
        return updated;
      });

      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
      showToast(`تم حفظ تحديثات ${modifiedTaskIds.length} مهام بنجاح ومزامنتها مع الأجندة!`);
    } catch (err) {
      console.error('Failed to save all tasks', err);
      alert('حدث خطأ أثناء حفظ تعديلات المهام');
    } finally {
      setSavingAllTasks(false);
    }
  };

  // Summary submission with auto-generation fallback & duplicate prevention
  const hasSummary = Boolean(plan?.dailySummary);
  const currentSummaryAttIds = summaryAttachments.map((a) => a.id).sort().join(',');
  const savedSummaryAttIds = (plan?.dailySummary?.attachments || []).map((a) => a.id).sort().join(',');
  const isSummaryModified = !hasSummary || (
    summaryText.trim() !== (plan?.dailySummary?.summaryText || '').trim() ||
    challenges.trim() !== (plan?.dailySummary?.challenges || '').trim() ||
    urgentFlag !== (plan?.dailySummary?.urgentFlag || false) ||
    currentSummaryAttIds !== savedSummaryAttIds
  );

  const handleSubmitSummary = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasSummary && !isSummaryModified) {
      showToast('الملخص مرسل مسبقاً ولا توجد أي تعديلات جديدة.');
      return;
    }

    try {
      setSaving(true);
      const getTaskFulfillmentPct = (t: {
        completionPercentage: number;
        status: TaskStatus;
        isMultiDay?: boolean;
        todayTargetMet?: boolean;
      }) => {
        if (t.status === 'COMPLETED' || t.completionPercentage >= 100) return 100;
        if (t.isMultiDay && t.todayTargetMet) return 100;
        return Math.min(100, Math.max(0, t.completionPercentage || 0));
      };

      const isFulfilled = (t: {
        completionPercentage: number;
        status: TaskStatus;
        isMultiDay?: boolean;
        todayTargetMet?: boolean;
      }) => {
        return t.status === 'COMPLETED' || t.completionPercentage === 100 || (Boolean(t.isMultiDay) && Boolean(t.todayTargetMet));
      };

      const planTasksList = plan?.tasks || [];
      const combinedTasksList = [
        ...planTasksList.map((t) => ({
          title: t.title,
          completionPercentage: trackedTasks[t.id]?.completionPercentage ?? t.completionPercentage,
          status: (trackedTasks[t.id]?.status ?? t.status) as TaskStatus,
          isMultiDay: trackedTasks[t.id]?.isMultiDay ?? t.isMultiDay ?? !!t.carriedFromTaskId,
          todayTargetMet: trackedTasks[t.id]?.todayTargetMet ?? t.todayTargetMet ?? false,
        })),
        ...executiveTasks.map((et) => {
          const local = taskLocalState[et.id];
          return {
            title: `[تكليف المدير العام] ${et.title}`,
            completionPercentage: local ? local.completionPercentage : et.completionPercentage,
            status: (local ? local.status : et.status) as TaskStatus,
            isMultiDay: true,
            todayTargetMet: local ? local.todayTargetMet : et.todayTargetMet,
          };
        }),
      ];

      const completedTasks = combinedTasksList.filter(isFulfilled);
      const totalTasks = combinedTasksList.length;
      const overallRate = totalTasks > 0
        ? Math.round((combinedTasksList.reduce((sum, t) => sum + getTaskFulfillmentPct(t), 0) / totalTasks) * 10) / 10
        : 100;

      // Auto-generate summaryText if left blank
      const finalSummaryText = summaryText.trim() ||
        `تم إنجاز مهام وتكليفات مديرية ${currentUser.directorate?.name || ''} بنسبة إنجاز إجمالية بلغت ${overallRate}%. (تم إنجاز ${completedTasks.length} من أصل ${totalTasks} مهام وتكليفات بالكامل).`;

      // Auto-populate achievements from completed tasks if manual list empty
      const cleanAchievements = achievements.filter((a) => a.trim().length > 0);
      const finalAchievements = cleanAchievements.length > 0
        ? cleanAchievements
        : completedTasks.map((t) => t.title);

      const taskUpdates = planTasksList.map((t) => {
        const mod = trackedTasks[t.id];
        return {
          taskId: t.id,
          status: (mod?.status ?? t.status) as any,
          completionPercentage: mod?.completionPercentage ?? t.completionPercentage,
          completionNote: mod?.completionNote ?? t.completionNote,
          isMultiDay: mod?.isMultiDay ?? t.isMultiDay ?? !!t.carriedFromTaskId,
          todayTargetMet: mod?.todayTargetMet ?? t.todayTargetMet ?? false,
        };
      });

      await api.submitDailySummary({
        summaryText: finalSummaryText,
        achievements: finalAchievements,
        challenges: challenges.trim() || undefined,
        directorNotes: directorNotes.trim() && directorNotes.trim() !== challenges.trim() ? directorNotes.trim() : undefined,
        urgentFlag,
        tomorrowPlanPreview: tomorrowPlanPreview.trim() || undefined,
        taskUpdates,
        attachmentIds: summaryAttachments.length > 0 ? summaryAttachments.map((a) => a.id) : undefined,
      });

      // Clear local summary draft
      localStorage.removeItem(summaryDraftKey);
      setSummaryDraftSavedTime(null);

      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
      loadTodayData();
      showToast(hasSummary ? 'تم حفظ وتحديث ملخص الإنجاز وتأكيد الإنجاز في الأجندة بنجاح!' : 'تم إرسال ملخص الإنجاز المسائي وتوثيق كافة المهام المنجزة في الأجندة بنجاح!');
    } catch (err) {
      console.error('Failed to submit summary', err);
      alert('حدث خطأ أثناء إرسال ملخص الإنجاز');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-[#0c3e35] text-white px-5 py-3 rounded-2xl shadow-2xl border border-[#d4af37] animate-fadeIn pointer-events-auto">
          <CheckCircle2 className="w-5 h-5 text-[#d4af37]" />
          <span className="font-bold text-sm">{successToast}</span>
        </div>
      )}

      <div className="space-y-5 sm:space-y-7 animate-fadeIn pb-16">
        {/* Directorate Banner - Fully Responsive & Mobile-Optimized */}
        <div className="p-4 sm:p-6 md:p-7 rounded-2xl sm:rounded-[28px] bg-gradient-to-br from-[#062e25] via-[#05261e] to-[#031d17] border border-[#0c3e35] shadow-brand-card relative overflow-hidden flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 sm:gap-6 text-white">
          {/* Ambient Lighting Background Accents */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#d4af37]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-[#0c3e35]/50 rounded-full blur-2xl pointer-events-none" />

          {/* Identity & Directorate Details */}
          <div className="relative z-10 flex items-start gap-2.5 sm:gap-4 flex-1 min-w-0">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#0c3e35] to-[#07241c] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] shadow-md shrink-0 mt-0.5">
              <DynamicIcon name={currentUser.directorate?.icon} className="w-5 h-5 sm:w-7 sm:h-7" />
            </div>

            <div className="flex-1 min-w-0 space-y-1 sm:space-y-1.5">
              {/* Directorate Badge & Date Header */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30 max-w-full shadow-xs">
                  <Building2 className="w-3 h-3 text-[#d4af37] shrink-0" />
                  <span className="truncate">{currentUser.directorate?.name || 'المديرية المعنية'}</span>
                </span>
                <span className="text-[10px] sm:text-xs text-[#8daaa2] font-medium flex items-center gap-1 bg-black/30 px-2.5 py-0.5 rounded-full shrink-0">
                  <Calendar className="w-3 h-3 text-[#d4af37] shrink-0" />
                  <span>{todayFormatted}</span>
                </span>
              </div>

              {/* Banner Main Title */}
              <h2 className="text-base sm:text-xl md:text-2xl font-black text-white tracking-tight leading-snug">
                إعداد الخطة وتوثيق الإنجاز
              </h2>

              {/* Responsible Director Info */}
              <p className="text-[11px] sm:text-xs text-[#8daaa2] font-medium flex items-center gap-1.5 flex-wrap">
                <span>المدير المسؤول:</span>
                <strong className="text-white font-bold">{currentUser.fullName || currentUser.title}</strong>
                {currentUser.title && currentUser.fullName && currentUser.fullName !== currentUser.title && (
                  <span className="text-white/60 font-normal">({currentUser.title})</span>
                )}
              </p>
            </div>
          </div>

          {/* Quick status pill - Sleek Responsive Layout */}
          <div className="relative z-10 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t border-white/10 md:border-t-0">
            <div className="grid grid-cols-2 md:flex md:flex-col gap-2 md:gap-1.5 bg-[#0c3e35]/90 backdrop-blur-xs border border-[#d4af37]/20 p-2 sm:p-3 rounded-xl sm:rounded-2xl text-xs md:min-w-[220px] shadow-sm">
              {/* Plan Status */}
              <div className="bg-[#05261e]/80 md:bg-transparent p-2 sm:p-2.5 md:p-0 rounded-lg md:rounded-none flex flex-col md:flex-row md:items-center md:justify-between gap-1 border border-white/5 md:border-0 shadow-xs">
                <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[#8daaa2]">خطة اليوم:</span>
                {loading ? (
                  <span className="text-slate-300 font-extrabold flex items-center gap-1 text-[10.5px] sm:text-xs">
                    <Loader2 className="w-3.5 h-3.5 text-[#d4af37] animate-spin shrink-0" />
                    <span>جاري التحميل...</span>
                  </span>
                ) : plan ? (
                  <span className="text-emerald-400 font-extrabold flex items-center gap-1 text-[10.5px] sm:text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>تم الاعتماد</span>
                  </span>
                ) : (
                  <span className="text-amber-400 font-extrabold flex items-center gap-1 text-[10.5px] sm:text-xs">
                    <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                    <span>بانتظار الإعداد</span>
                  </span>
                )}
              </div>

              {/* Summary Status */}
              <div className="bg-[#05261e]/80 md:bg-transparent p-2 sm:p-2.5 md:p-0 rounded-lg md:rounded-none flex flex-col md:flex-row md:items-center md:justify-between gap-1 border border-white/5 md:border-0 shadow-xs">
                <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[#8daaa2]">ملخص الإنجاز:</span>
                {loading ? (
                  <span className="text-slate-300 font-extrabold flex items-center gap-1 text-[10.5px] sm:text-xs">
                    <Loader2 className="w-3.5 h-3.5 text-[#d4af37] animate-spin shrink-0" />
                    <span>جاري التحميل...</span>
                  </span>
                ) : plan?.dailySummary ? (
                  <span className="text-emerald-400 font-extrabold flex items-center gap-1 text-[10.5px] sm:text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>منجز ({plan.dailySummary.overallCompletionRate}%)</span>
                  </span>
                ) : (
                  <span className="text-slate-300 font-extrabold flex items-center gap-1 text-[10.5px] sm:text-xs">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>بانتظار الدوام</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Official General Announcements Bar (Only if unread) */}
        {(() => {
          const unreadAnnouncements = announcements.filter(
            (a) => !readAnnouncementIds.includes(a.id)
          );

          if (unreadAnnouncements.length === 0) return null;

          const currentAnn = unreadAnnouncements[0];

          return (
            <div
              onClick={() => {
                markAnnouncementAsRead(currentUser.id, currentAnn.id);
                setSelectedAnnouncement({
                  id: currentAnn.id,
                  isAnnouncement: true,
                  type: 'announcement',
                  title: currentAnn.title,
                  content: currentAnn.content,
                  authorName: currentAnn.author?.fullName || 'المدير العام للموانئ',
                  authorTitle: currentAnn.author?.title || 'المدير العام',
                  priority: currentAnn.priority,
                  createdAt: currentAnn.createdAt,
                });
              }}
              className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-[#edece4] border border-[#d2d1c9] hover:border-[#0c3e35] transition flex items-start justify-between gap-3 sm:gap-4 cursor-pointer shadow-xs animate-fadeIn"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#0c3e35] text-[#d4af37] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-bold text-[#0c3e35]">{currentAnn.title}</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#0c3e35] text-[#d4af37]">
                      تعميم إداري جديد
                    </span>
                  </div>
                  <p className="text-xs text-[#5e736e] mt-0.5 line-clamp-1">{currentAnn.content}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="hidden sm:inline-block text-[11px] text-[#0c3e35] font-bold bg-white px-3 py-1 rounded-lg border border-[#d2d1c9]">
                  انقر لقراءة نص التعميم
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    markAnnouncementAsRead(currentUser.id, currentAnn.id);
                  }}
                  className="p-1 text-[#8daaa2] hover:text-[#0c3e35] hover:bg-white rounded-lg transition cursor-pointer"
                  title="إخفاء من اللوحة (تمت القراءة)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })()}

        {/* Directives from General Director & Directorate Replies */}
        {plan?.feedbacks && plan.feedbacks.length > 0 && (
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-[22px] bg-[#05261e] border-2 border-[#d4af37] text-white space-y-3 shadow-md">
            <div className="flex items-center justify-between border-b border-[#d4af37]/30 pb-2">
              <h4 className="text-xs font-bold text-[#d4af37] flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#d4af37]" />
                توجيهات وملاحظات المدير العام والردود المتبادلة ({plan.feedbacks.length}):
              </h4>
            </div>

            <div className="space-y-2.5">
              {plan.feedbacks.map((fb, idx) => {
                const isDirector = fb.fromUser?.role === 'DIRECTOR';
                return isDirector ? (
                  <div
                    key={fb.id || idx}
                    className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-[#edece4] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-extrabold text-emerald-400 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-black border border-emerald-500/30">
                          رد وتوضيح المديرية
                        </span>
                        {fb.fromUser?.fullName || currentUser.fullName} ({fb.fromUser?.title || currentUser.title})
                      </span>
                      <span className="text-[10px] text-emerald-400/80">
                        {new Date(fb.createdAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-white text-xs leading-relaxed font-medium whitespace-pre-wrap">
                      {fb.feedbackText}
                    </p>
                  </div>
                ) : (
                  <div
                    key={fb.id || idx}
                    className="p-3.5 rounded-xl bg-black/30 border border-[#d4af37]/30 text-white text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-[#d4af37]">
                      <span className="font-bold flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-[#d4af37]/20 text-[#d4af37] text-[10px] font-black border border-[#d4af37]/40">
                          توجيه المدير العام
                        </span>
                        {fb.fromUser?.fullName || 'المدير العام'} ({fb.fromUser?.title || 'المديرية العامة للموانئ'})
                      </span>
                      <span className="text-[10px] text-[#8daaa2]">
                        {new Date(fb.createdAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[#edece4] text-xs leading-relaxed font-medium whitespace-pre-wrap">
                      {fb.feedbackText}
                    </p>
                    {fb.rating && (
                      <div className="flex items-center gap-1 text-[#d4af37] pt-0.5">
                        <span className="text-[10px] text-[#8daaa2] ml-1">تقييم الإدارة:</span>
                        {Array.from({ length: fb.rating }).map((_, i) => (
                          <Star key={i} className="w-3.5 h-3.5 fill-[#d4af37] text-[#d4af37]" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Reply section for today's plan */}
            <div className="pt-1">
              {replyOpenPlanId !== plan.id ? (
                <button
                  type="button"
                  onClick={() => setReplyOpenPlanId(plan.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#d4af37] hover:text-white bg-white/10 hover:bg-white/20 px-3.5 py-1.5 rounded-xl border border-[#d4af37]/40 transition cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span>إضافة رد / توضيح للمدير العام</span>
                </button>
              ) : (
                <div className="p-3.5 rounded-xl bg-black/40 border border-[#d4af37]/40 space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#d4af37] flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-[#d4af37]" />
                      <span>الرد على توجيه المدير العام لليوم الحالي:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyOpenPlanId(null)}
                      className="text-[11px] font-semibold text-[#8daaa2] hover:text-white transition cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={replyTextMap[plan.id] || ''}
                    onChange={(e) =>
                      setReplyTextMap((prev) => ({ ...prev, [plan.id]: e.target.value }))
                    }
                    placeholder="اكتب ردك وتوضيحك للمدير العام..."
                    className="w-full p-2.5 rounded-lg bg-[#031c16] border border-[#d4af37]/40 text-white text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#d4af37] font-medium"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReplyOpenPlanId(null)}
                      className="px-3 py-1 rounded-lg bg-white/10 text-xs text-[#8daaa2] hover:text-white transition cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      disabled={submittingReplyPlanId === plan.id || !replyTextMap[plan.id]?.trim()}
                      onClick={() => handleSendReply(plan.id, plan.dailySummary?.id)}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#d4af37] hover:bg-[#c59f2e] text-[#05261e] text-xs font-bold shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {submittingReplyPlanId === plan.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>جاري الإرسال...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>إرسال الرد فوراً</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabs Navigation - Smooth Horizontal Scroll on Mobile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 border-b border-[#d2d1c9] pb-2 sm:pb-3 overflow-x-auto no-scrollbar scrollbar-none -mx-1 px-1">
          <button
            onClick={() => setActiveTab('PLAN')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${activeTab === 'PLAN' || activeTab === 'TRACK'
                ? 'bg-[#0c3e35] text-white shadow-md'
                : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="hidden sm:inline">1. </span>
            <span>الخطة والمهام اليومية</span>
            {activeExecutiveTasks.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#d4af37] text-[#05261e] text-[9.5px] font-black flex items-center gap-0.5 shadow-2xs" title="توجد تكليفات نشطة من المدير العام مثبتة">
                <Crown className="w-2.5 h-2.5" />
                <span>{activeExecutiveTasks.length}</span>
              </span>
            )}
            {tasks.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black">
                {tasks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('EXECUTIVE_TASKS');
              loadExecutiveTasks();
            }}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${activeTab === 'EXECUTIVE_TASKS'
                ? 'bg-[#0c3e35] text-white shadow-md'
                : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#d4af37] shrink-0" />
            <span className="hidden sm:inline">2. </span>
            <span>تكليفات المدير العام</span>
            {executiveTasks.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#d4af37] text-[#05261e] text-[10px] font-black">
                {executiveTasks.filter((t) => t.status !== 'COMPLETED').length || executiveTasks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('SUMMARY')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${activeTab === 'SUMMARY'
                ? 'bg-[#0c3e35] text-white shadow-md'
                : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
          >
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="hidden sm:inline">3. </span>
            <span>ملخص الإنجاز</span>
            <span className="hidden sm:inline text-[10.5px] opacity-80">(نهاية الدوام)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('HISTORY');
              loadHistory();
              loadAchievementsReport();
            }}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${activeTab === 'HISTORY'
                ? 'bg-[#0c3e35] text-white shadow-md'
                : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="hidden sm:inline">4. </span>
            <span>سجل الإنجازات والطباعة</span>
            <span className="px-1.5 py-0.5 rounded-md bg-[#d4af37] text-[#05261e] text-[9.5px] font-black flex items-center gap-0.5">
              <Printer className="w-2.5 h-2.5" />
              PDF
            </span>
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('ports:navigate_view', { detail: { view: 'TODOS' } }))}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-bold transition whitespace-nowrap cursor-pointer shrink-0 bg-amber-50/90 text-[#0c3e35] hover:bg-amber-100 border border-amber-300 mr-auto"
            title="فتح أجندة ومفكرة المهام الخاصة"
          >
            <ListTodo className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#d4af37] shrink-0" />
            <span className="hidden sm:inline">مفكرتي الخاصة </span>
            <span>(TO-DO)</span>
          </button>
        </div>

        {/* Tab 1: Morning Plan Builder */}
        {activeTab === 'PLAN' && (
          loading ? (
            <div className="bg-[#edece4] p-8 sm:p-14 rounded-2xl sm:rounded-[28px] border border-[#d2d1c9] shadow-brand-card text-center space-y-4 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-2xl bg-[#0c3e35]/10 text-[#0c3e35] flex items-center justify-center mx-auto shadow-xs">
                <Loader2 className="w-6 h-6 animate-spin text-[#0c3e35]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-extrabold text-[#0c3e35]">
                  جاري تحميل الخطة والمهام اليومية...
                </h3>
                <p className="text-xs text-[#5e736e]">
                  يتم التحقق من خطة اليوم والتكليفات الرسمية المعتمدة لمديريتكم
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitPlan} className="bg-[#edece4] p-4 sm:p-6 md:p-7 rounded-2xl sm:rounded-[28px] border border-[#d2d1c9] shadow-brand-card space-y-5 sm:space-y-6">
            <div className="flex items-center justify-between border-b border-[#d2d1c9] pb-3 flex-wrap gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-[#0c3e35] flex items-center gap-2">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-[#0c3e35] shrink-0" />
                  <span>
                    إعداد الخطة اليومية {currentUser.directorate?.name?.trim().startsWith('مديرية') || currentUser.directorate?.name?.trim().startsWith('فرع') || currentUser.directorate?.name?.trim().startsWith('مكتب') ? `لـ ${currentUser.directorate?.name}` : `لمديرية ${currentUser.directorate?.name}`}
                  </span>
                </h3>
                {planDraftSavedTime && !plan && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1 animate-fadeIn">
                    <Save className="w-3 h-3 text-amber-700" />
                    <span>مسودة ({planDraftSavedTime})</span>
                  </span>
                )}
                {plan && (
                  <span
                    className={`text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-xl border flex items-center gap-1.5 transition-all shadow-2xs ${autoSaveStatus === 'SAVING'
                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : autoSaveStatus === 'ERROR'
                          ? 'bg-red-50 text-red-900 border-red-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      }`}
                  >
                    {autoSaveStatus === 'SAVING' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d4af37]" />
                        <span>جاري الحفظ...</span>
                      </>
                    ) : autoSaveStatus === 'ERROR' ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                        <span>غير محفوظ</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>محفوظة تلقائياً {autoSaveTime ? `(${autoSaveTime})` : ''}</span>
                      </>
                    )}
                  </span>
                )}
              </div>
              {plan && (
                <span className="text-xs font-bold px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  الخطة معتمدة
                </span>
              )}
            </div>


            {/* Dynamic Tasks List */}
            <div className="space-y-4">
              {/* Header and Quick Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs sm:text-sm font-extrabold text-[#0c3e35]">
                    المهام اليومية:
                  </label>
                  <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#0c3e35] text-white">
                    {tasks.length + activeExecutiveTasks.length} {tasks.length + activeExecutiveTasks.length === 1 ? 'مهمة' : 'مهام'}
                  </span>
                </div>

                {/* Quick Actions Toolbar */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  {/* Add New Empty Task Button */}
                  <button
                    type="button"
                    onClick={handleAddTask}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs font-extrabold px-3.5 py-2 rounded-xl bg-[#0c3e35] text-white hover:bg-[#072923] transition cursor-pointer shadow-xs active:scale-95 border border-[#d4af37]/40"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>إضافة مهمة</span>
                  </button>

                  {/* Incomplete Tasks Modal Trigger Button */}
                  <button
                    type="button"
                    onClick={() => {
                      fetchIncompleteTasks();
                      setShowIncompleteTasksModal(true);
                    }}
                    className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#f4f3ed] transition cursor-pointer shadow-2xs active:scale-95 relative"
                    title="استعراض وترحيل المهام السابقة غير المكتملة بنسبتها التراكمية"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span className="whitespace-nowrap">المهام المعلقة</span>
                    {incompleteTasks.filter((t) => !tasks.some((curr) => curr.title.trim().toLowerCase() === t.title.trim().toLowerCase())).length > 0 && (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-[#d4af37] text-[#05261e] shrink-0">
                        {incompleteTasks.filter((t) => !tasks.some((curr) => curr.title.trim().toLowerCase() === t.title.trim().toLowerCase())).length}
                      </span>
                    )}
                  </button>

                  {/* Clone Previous Plan Button */}
                  <button
                    type="button"
                    onClick={handleClonePreviousPlan}
                    disabled={loadingPreviousPlan}
                    className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#f4f3ed] transition cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                    title="استيراد مهام آخر خطة سابقة تم تقديمها"
                  >
                    {loadingPreviousPlan ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d4af37]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#d4af37]" />
                    )}
                    <span className="whitespace-nowrap">استيراد الأمس</span>
                  </button>

                  {/* Templates Modal Trigger Button */}
                  <button
                    type="button"
                    onClick={() => setShowTemplatesModal(true)}
                    className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#f4f3ed] transition cursor-pointer shadow-2xs active:scale-95"
                    title="استعراض وإدراج قوالب المهام المتكررة"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span className="whitespace-nowrap">القوالب ({templates.length})</span>
                  </button>
                </div>
              </div>

              {/* Pinned Executive Tasks Section */}
              {renderPinnedExecutiveTasksSection()}

              {/* Task Cards List */}
              <div className="space-y-3.5">
                {tasks.map((task, idx) => {
                  const matchingTpl = getMatchingTemplate(task);
                  const isSaved = Boolean(matchingTpl);
                  const isToggling = togglingTemplateIdx === idx;

                  return (
                    <div
                      key={idx}
                      className="p-4 sm:p-5 rounded-2xl bg-white border border-[#d2d1c9] space-y-3.5 shadow-xs transition-shadow hover:shadow-md"
                    >
                      {/* Card Header: Task Number, Badges & Actions */}
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#f0eee6]">
                        {/* Right: Task Badge & Status */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/40 text-xs font-black flex items-center justify-center shadow-xs shrink-0">
                            {idx + 1}
                          </span>

                          {task.carriedFromTaskId && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                              <ArrowRightLeft className="w-3 h-3 text-amber-700" />
                              <span>مرحّلة ({task.initialCompletionPercentage ?? 0}%)</span>
                            </span>
                          )}

                          {/* Multi-Day Task Badge / Toggle */}
                          <button
                            type="button"
                            onClick={() => handleTaskChange(idx, 'isMultiDay', !(task.isMultiDay || task.carriedFromTaskId))}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer flex items-center gap-1 ${task.isMultiDay || task.carriedFromTaskId
                                ? 'bg-indigo-50 text-indigo-900 border-indigo-300'
                                : 'bg-[#f4f3ed] text-[#5e736e] border-[#d2d1c9] hover:bg-[#edece4]'
                              }`}
                            title={
                              task.isMultiDay || task.carriedFromTaskId
                                ? 'مهمة ممتدة لأكثر من يوم (انقر لتغيير التصنيف)'
                                : 'تصنيف المهمة كمهمة ممتدة لعدة أيام'
                            }
                          >
                            <Layers className="w-3 h-3 text-indigo-600" />
                            <span>{task.isMultiDay || task.carriedFromTaskId ? 'مهمة ممتدة' : 'تحويل لمهمة ممتدة'}</span>
                          </button>

                          {typeof task.completionPercentage === 'number' && task.completionPercentage > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-300 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>منجزة {task.completionPercentage}%</span>
                              {task.status === 'COMPLETED' && (
                                <span className="text-[9px] bg-emerald-200 text-emerald-900 px-1 rounded font-extrabold">مكتملة</span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Left: Quick Actions (Save as Template & Delete) */}
                        <div className="flex items-center gap-1">
                          {/* Bookmark Task as Template */}
                          <button
                            type="button"
                            disabled={isToggling}
                            onClick={() => handleToggleTemplate(task, idx)}
                            className={`px-2.5 py-1.5 rounded-xl transition-all duration-200 cursor-pointer active:scale-95 flex items-center gap-1 text-xs font-bold ${isSaved
                                ? 'bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 shadow-xs'
                                : 'text-[#8daaa2] hover:text-[#0c3e35] hover:bg-[#f4f3ed] border border-transparent hover:border-[#d2d1c9]'
                              }`}
                            title={
                              isSaved
                                ? `قالب محفوظ: "${matchingTpl?.title}" (انقر لإلغاء الحفظ)`
                                : 'حفظ هذه المهمة كقالب للاستخدام لاحقاً'
                            }
                          >
                            {isToggling ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                            ) : (
                              <Bookmark
                                className={`w-3.5 h-3.5 transition-all duration-200 ${isSaved
                                    ? 'text-amber-500 fill-amber-400 drop-shadow-xs'
                                    : 'text-[#8daaa2] hover:text-[#d4af37]'
                                  }`}
                              />
                            )}
                            <span className="text-[11px] hidden sm:inline">
                              {isSaved ? 'قالب محفوظ' : 'حفظ كقالب'}
                            </span>
                          </button>

                          {/* Delete Task */}
                          {(tasks.length > 1 || task.title.trim().length > 0 || Boolean(task.id)) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTaskClick(idx)}
                              className="p-1.5 sm:px-2 sm:py-1.5 rounded-xl text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer flex items-center gap-1"
                              title="حذف المهمة من الخطة"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span className="text-[11px] font-bold hidden sm:inline">حذف</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Task Title (Full 100% Width) */}
                      <div className="space-y-1">
                        <input
                          type="text"
                          required
                          placeholder="عنوان المهمة..."
                          value={task.title}
                          onChange={(e) => handleTaskChange(idx, 'title', e.target.value)}
                          className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] text-xs sm:text-sm font-bold placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] focus:bg-white transition"
                        />
                      </div>

                      {/* Task Details / Expected Outcome (Full 100% Width) */}
                      <div className="space-y-1">
                        <input
                          type="text"
                          placeholder="تفاصيل إضافية (اختياري)..."
                          value={task.description}
                          onChange={(e) => handleTaskChange(idx, 'description', e.target.value)}
                          className="w-full p-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] focus:bg-white transition"
                        />
                      </div>

                      {/* Priority Selector */}
                      <div className="flex items-center gap-2 bg-[#f4f3ed] border border-[#d2d1c9] px-3 py-2 rounded-xl">
                        <span className="text-[11px] font-extrabold text-[#5e736e] shrink-0">الأولوية:</span>
                        <select
                          value={task.priority}
                          onChange={(e) => handleTaskChange(idx, 'priority', e.target.value as Priority)}
                          className="flex-1 bg-transparent text-[#0c3e35] text-xs font-bold focus:outline-none cursor-pointer"
                        >
                          <option value="URGENT">عاجل جداً</option>
                          <option value="HIGH">أولوية مرتفعة</option>
                          <option value="NORMAL">أولوية عادية</option>
                          <option value="LOW">منخفضة</option>
                        </select>
                      </div>

                      {/* Progress Slider & Status Controls */}
                      <div className="pt-2.5 border-t border-[#f0eee6] flex flex-col sm:flex-row sm:items-center gap-2.5">
                        {/* Status Selector */}
                        <div className="w-full sm:w-36 shrink-0">
                          <select
                            value={
                              task.status ||
                              (task.completionPercentage === 100
                                ? 'COMPLETED'
                                : (task.completionPercentage || 0) > 0
                                  ? 'IN_PROGRESS'
                                  : 'PENDING')
                            }
                            onChange={(e) => {
                              const s = e.target.value as TaskStatus;
                              let p = task.completionPercentage || 0;
                              if (s === 'COMPLETED') p = 100;
                              else if (s === 'PENDING') p = 0;
                              else if (s === 'IN_PROGRESS' && (p === 0 || p === 100)) p = 50;
                              handleTaskChange(idx, 'status', s);
                              handleTaskChange(idx, 'completionPercentage', p);
                            }}
                            className="w-full p-2 rounded-lg bg-[#f4f3ed] border border-[#d2d1c9] text-xs font-bold text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                          >
                            <option value="PENDING">قيد الانتظار</option>
                            <option value="IN_PROGRESS">قيد التنفيذ</option>
                            <option value="COMPLETED">منجزة (100%)</option>
                            <option value="DELAYED">مؤجلة</option>
                          </select>
                        </div>

                        {/* Percentage Slider with Live Badge */}
                        <div className="flex-1 flex items-center gap-2.5 bg-[#fcfbf7] p-2 px-3 rounded-xl border border-[#edece4]">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={task.completionPercentage ?? (task.status === 'COMPLETED' ? 100 : 0)}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              handleTaskChange(idx, 'completionPercentage', val);
                            }}
                            className="flex-1 accent-[#0c3e35] cursor-pointer h-2"
                          />
                          <span className="text-xs sm:text-sm font-black text-[#0c3e35] min-w-[42px] text-center px-2 py-0.5 rounded-lg bg-white border border-[#d2d1c9] shadow-2xs shrink-0">
                            {task.completionPercentage ?? (task.status === 'COMPLETED' ? 100 : 0)}%
                          </span>
                        </div>
                      </div>

                      {/* Multi-day Today's Target Met Control */}
                      {(task.isMultiDay || task.carriedFromTaskId) && (() => {
                        const isTargetMet = Boolean(task.todayTargetMet) || task.completionPercentage === 100 || task.status === 'COMPLETED';
                        const isCompleted = task.completionPercentage === 100 || task.status === 'COMPLETED';

                        return (
                          <div
                            className={`pt-2 border-t border-dashed border-[#edece4] flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border transition-all duration-200 ${
                              isCompleted
                                ? 'bg-emerald-50/50 border-emerald-200'
                                : isTargetMet
                                ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-400/30 shadow-xs'
                                : 'bg-[#f8f7f2] border-[#d2d1c9]/70 hover:border-[#0c3e35]/30'
                            }`}
                          >
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isTargetMet}
                                disabled={isCompleted}
                                onChange={(e) => {
                                  handleTaskChange(idx, 'todayTargetMet', e.target.checked);
                                }}
                                className="w-4 h-4 rounded accent-[#0c3e35] cursor-pointer"
                              />
                              <span
                                className={`text-xs flex items-center gap-1.5 transition-colors ${
                                  isTargetMet ? 'font-black text-emerald-950' : 'font-bold text-[#3e5550]'
                                }`}
                              >
                                <CheckCircle2
                                  className={`w-4 h-4 shrink-0 transition-colors ${
                                    isTargetMet ? 'text-emerald-600 fill-emerald-100' : 'text-slate-400'
                                  }`}
                                />
                                <span>تم إنجاز مستهدف اليوم بنجاح ✔️</span>
                              </span>
                            </label>

                            <div className="flex items-center gap-2 flex-wrap">
                              {task.todayTargetMet && !isCompleted && (
                                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-850 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                                  <Check className="w-3.5 h-3.5 text-emerald-700 stroke-[2.5]" />
                                  <span>مستهدف اليوم محقق ومحسوب 100%</span>
                                </span>
                              )}
                              <span className="text-[10.5px] text-[#5e736e] font-medium hidden sm:inline">
                                {isTargetMet
                                  ? '✨ تُحسب 100% في معدل اليوم دون المساس بنسبتها الكلية'
                                  : 'فعّل هذا الخيار إذا أنجزت المطلوب لهذا اليوم وفق الخطة'}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[#d2d1c9]">
              <button
                type="button"
                onClick={handleAddTask}
                className="flex items-center justify-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#f4f3ed] transition cursor-pointer shadow-xs active:scale-95"
              >
                <Plus className="w-4 h-4 text-[#d4af37]" />
                <span>إضافة مهمة أخرى</span>
              </button>

              {plan ? (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0c3e35] bg-white border border-[#d2d1c9] px-3.5 py-2.5 rounded-xl shadow-2xs">
                    {autoSaveStatus === 'SAVING' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d4af37]" />
                        <span>جاري الحفظ تلقائياً...</span>
                      </>
                    ) : autoSaveStatus === 'ERROR' ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                        <span className="text-red-700">فشل الحفظ التلقائي</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>محفوظة تلقائياً {autoSaveTime ? `(${autoSaveTime})` : ''}</span>
                      </>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={saving || autoSaveStatus === 'SAVING'}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    title="حفظ فوري يدوي للتعديلات"
                  >
                    <Save className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>{saving ? 'جاري الحفظ...' : ' حفظ'}</span>
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{saving ? 'جاري الإرسال...' : 'اعتماد وإرسال الخطة'}</span>
                </button>
              )}
            </div>

            {/* Evening Summary Transition Box */}
            {plan && (
              <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-white border border-[#d2d1c9] mt-3">
                <span className="text-xs text-[#0c3e35] font-bold">
                  هل أنهيتم أعمال اليوم؟ انتقل الآن لملخص الإنجاز المسائي.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('SUMMARY')}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-md transition cursor-pointer shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-[#d4af37]" />
                  <span>ملخص الإنجاز المسائي</span>
                </button>
              </div>
            )}
          </form>
          )
        )}

        {/* Tab 3: End-of-Day Summary Wizard (Streamlined & Simplified) */}
        {activeTab === 'SUMMARY' && (
          loading ? (
            <div className="bg-[#edece4] p-8 sm:p-14 rounded-2xl sm:rounded-[28px] border border-[#d2d1c9] shadow-brand-card text-center space-y-4 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-2xl bg-[#0c3e35]/10 text-[#0c3e35] flex items-center justify-center mx-auto shadow-xs">
                <Loader2 className="w-6 h-6 animate-spin text-[#0c3e35]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-extrabold text-[#0c3e35]">
                  جاري تحميل ملخص الإنجاز...
                </h3>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitSummary} className="bg-[#edece4] p-4 sm:p-7 rounded-2xl sm:rounded-[28px] border border-[#d2d1c9] shadow-brand-card space-y-5 sm:space-y-6 pb-12 sm:pb-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d2d1c9] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-[#0c3e35] flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#d4af37]" />
                    ملخص إنجاز نهاية الدوام الرسمي
                  </h3>
                  {summaryDraftSavedTime && !plan?.dailySummary && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1 animate-fadeIn">
                      <Save className="w-3 h-3 text-amber-700" />
                      <span>مسودة الملخص محفوظة محلياً ({summaryDraftSavedTime})</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5e736e] mt-1 font-medium">
                  يقوم النظام باحتساب إنجازاتك تلقائياً من واقع مهام اليوم دون الحاجة لإعادة كتابتها.
                </p>
              </div>
              {plan?.dailySummary && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                  <Check className="w-3.5 h-3.5" />
                  تم إرسال الملخص المسائي اليوم
                </span>
              )}
            </div>

            {/* 1. Automated Performance & Achievements Overview */}
            {(() => {
              const isFulfilled = (t: {
                completionPercentage: number;
                status: TaskStatus;
                isMultiDay?: boolean;
                todayTargetMet?: boolean;
              }) => {
                return t.status === 'COMPLETED' || t.completionPercentage >= 100 || (Boolean(t.isMultiDay) && Boolean(t.todayTargetMet));
              };

              const getFulfillmentPct = (t: {
                completionPercentage: number;
                status: TaskStatus;
                isMultiDay?: boolean;
                todayTargetMet?: boolean;
              }) => {
                if (isFulfilled(t)) return 100;
                return Math.min(100, Math.max(0, t.completionPercentage || 0));
              };

              const planTasksList = plan?.tasks || [];
              const combinedList = [
                ...planTasksList.map((t) => ({
                  id: t.id,
                  title: t.title,
                  completionPercentage: trackedTasks[t.id]?.completionPercentage ?? t.completionPercentage,
                  status: (trackedTasks[t.id]?.status ?? t.status) as TaskStatus,
                  isMultiDay: trackedTasks[t.id]?.isMultiDay ?? t.isMultiDay ?? !!t.carriedFromTaskId,
                  todayTargetMet: trackedTasks[t.id]?.todayTargetMet ?? t.todayTargetMet ?? false,
                  isExecutive: false,
                })),
                ...executiveTasks.map((et) => {
                  const local = taskLocalState[et.id];
                  return {
                    id: et.id,
                    title: `[تكليف المدير العام] ${et.title}`,
                    completionPercentage: local ? local.completionPercentage : et.completionPercentage,
                    status: (local ? local.status : et.status) as TaskStatus,
                    isMultiDay: true,
                    todayTargetMet: local ? local.todayTargetMet : et.todayTargetMet,
                    isExecutive: true,
                  };
                }),
              ];

              const completedList = combinedList.filter(isFulfilled);
              const inProgressList = combinedList.filter((t) => !isFulfilled(t) && (t.completionPercentage > 0 || t.status === 'IN_PROGRESS'));
              const pendingList = combinedList.filter((t) => !isFulfilled(t) && t.completionPercentage === 0 && t.status !== 'IN_PROGRESS');
              const total = combinedList.length;
              const avgRate = total > 0
                ? Math.round((combinedList.reduce((sum, t) => sum + getFulfillmentPct(t), 0) / total) * 10) / 10
                : 100;

              return (
                <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#d2d1c9] space-y-3.5 shadow-xs">
                  {/* Header with Title and Average Progress */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-xs font-extrabold text-[#0c3e35] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>الحصيلة الإحصائية لأعمال اليوم (محسوبة تلقائياً):</span>
                    </h4>
                    <span className="text-xs font-black px-3 py-1 rounded-full bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30 shadow-2xs">
                      نسبة الإنجاز العامة: {avgRate}%
                    </span>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="w-full h-2 bg-[#e2e1d8] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#0c3e35] to-[#d4af37] transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, avgRate))}%` }}
                    />
                  </div>

                  {/* 3-Column Compact KPI Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center pt-1">
                    <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-50/90 border border-emerald-200 flex flex-col items-center justify-center">
                      <span className="text-base sm:text-lg font-black text-emerald-800 leading-tight">
                        {completedList.length} <span className="text-[10px] font-bold text-emerald-600">/ {total}</span>
                      </span>
                      <span className="text-[10px] sm:text-xs text-emerald-900 font-extrabold mt-0.5">مكتملة 100%</span>
                    </div>

                    <div className="p-2.5 sm:p-3 rounded-xl bg-amber-50/90 border border-amber-200 flex flex-col items-center justify-center">
                      <span className="text-base sm:text-lg font-black text-amber-800 leading-tight">
                        {inProgressList.length}
                      </span>
                      <span className="text-[10px] sm:text-xs text-amber-900 font-extrabold mt-0.5">قيد المتابعة</span>
                    </div>

                    <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50/90 border border-slate-200 flex flex-col items-center justify-center">
                      <span className="text-base sm:text-lg font-black text-slate-800 leading-tight">
                        {pendingList.length}
                      </span>
                      <span className="text-[10px] sm:text-xs text-slate-700 font-extrabold mt-0.5">قيد الانتظار</span>
                    </div>
                  </div>

                  {/* Completed tasks list */}
                  {completedList.length > 0 && (
                    <div className="pt-2 border-t border-[#f0efe9]">
                      <span className="text-[11px] font-bold text-[#5e736e] block mb-1.5">قائمة الإنجازات المكتملة التي سيتم توثيقها:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {completedList.map((t, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-100/70 text-emerald-900 font-medium border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-700 shrink-0" />
                            <span>{t.title}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 2. Optional Notes / Remarks Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#0c3e35]">
                ملاحظات أو تعليق ختامي على إنجاز اليوم (اختياري):
              </label>
              <textarea
                rows={3}
                placeholder="اكتب أي ملاحظات أو توضيحات إضافية للمدير العام (في حال تركه فارغاً، سيعتمد النظام التقرير الإحصائي المحسوب أعلاه تلقائياً)..."
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] placeholder-[#8daaa2] text-xs focus:outline-none focus:border-[#0c3e35] transition font-medium leading-relaxed resize-y min-h-[85px]"
              />
            </div>

            {/* 3. Combined Challenges & Urgent Flag */}
            <div className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${urgentFlag || challenges ? 'bg-amber-50/80 border-amber-300 shadow-xs' : 'bg-white border-[#d2d1c9]'}`}>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={urgentFlag}
                  onChange={(e) => setUrgentFlag(e.target.checked)}
                  className="w-4 h-4 accent-[#0c3e35] rounded cursor-pointer shrink-0"
                />
                <span className="text-xs font-bold text-[#0c3e35] flex items-center gap-1.5 flex-wrap">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>هل واجهت المديرية معوقات أو توجد احتياجات تتطلب تدخل وقرار المدير العام؟</span>
                </span>
              </label>

              {urgentFlag && (
                <div className="mt-3 animate-fadeIn space-y-2">
                  <textarea
                    rows={3}
                    placeholder="اكتب المعوقات أو التوجيهات والقرارات المطلوبة من الإدارة العليا..."
                    value={challenges}
                    onChange={(e) => setChallenges(e.target.value)}
                    className="w-full p-3 rounded-xl bg-white border border-amber-300 text-[#0c3e35] placeholder-[#8daaa2] text-xs focus:outline-none focus:border-[#0c3e35] font-medium leading-relaxed min-h-[75px]"
                  />
                </div>
              )}
            </div>

            {/* 4. PDF Attachments for Evening Report */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#d2d1c9] shadow-xs space-y-2">
              <PdfAttachmentPicker
                attachments={summaryAttachments}
                onAttachmentsChange={setSummaryAttachments}
                category="DAILY_SUMMARY"
                label="إرفاق التقارير الرسمية ومحاضر الكشف الثبوتية (PDF)"
                hint="يمكنك إرفاق عدة مستندات رسمية (تقارير تفصيلية، ضبوط ممسوحة، جداول)"
              />
            </div>

            {/* Submit Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 border-t border-[#d2d1c9] gap-3">
              <span className="text-xs text-[#5e736e] text-center sm:text-right">
                {hasSummary && !isSummaryModified
                  ? 'تم تسليم تقرير نهاية الدوام للمدير العام بنجاح.'
                  : 'سيتم إرسال تقرير إنجاز متكامل مباشرة إلى لوحة متابعة المدير العام.'}
              </span>

              {hasSummary && !isSummaryModified ? (
                <div className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>تم إرسال الملخص (لا توجد تعديلات)</span>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer border border-[#d4af37]/40"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#d4af37]" />
                  ) : (
                    <Send className="w-4 h-4 text-[#d4af37]" />
                  )}
                  <span>
                    {saving
                      ? 'جاري الحفظ والإرسال...'
                      : hasSummary
                        ? 'حفظ وتحديث ملخص نهاية الدوام'
                        : 'اعتماد وإرسال ملخص نهاية الدوام للمدير العام'}
                  </span>
                </button>
              )}
            </div>
          </form>
          )
        )}

        {/* Tab 3: Executive Tasks (تكليفات وتوجيهات المدير العام) */}
        {activeTab === 'EXECUTIVE_TASKS' && (
          <div className="bg-[#edece4] p-4 sm:p-7 rounded-2xl sm:rounded-[28px] border border-[#d2d1c9] shadow-brand-card space-y-5 sm:space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d2d1c9] pb-4">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-[#0c3e35] flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#d4af37]" />
                  تكليفات وتوجيهات المدير العام المباشرة لـ {currentUser.directorate?.name}
                </h3>
                <p className="text-xs text-[#5e736e] mt-1 font-medium">
                  المهام الموجهة لمديريتكم حصراً من المدير العام ومعاونيه لمتابعة تنفيذها ورفع تقرير الإنجاز.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30 flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                  <CheckCheck className="w-4 h-4 text-[#d4af37]" />
                  إجمالي التكليفات: {executiveTasks.length}
                </span>
              </div>
            </div>

            {loadingExecTasks ? (
              <div className="py-12 text-center text-[#5e736e]">
                <Loader2 className="w-7 h-7 animate-spin mx-auto text-[#0c3e35] mb-2" />
                <span className="text-xs font-bold">جارٍ تحميل تكليفات المدير العام...</span>
              </div>
            ) : executiveTasks.length === 0 ? (
              <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-[#d2d1c9] p-6 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto stroke-[1.5]" />
                <h4 className="text-sm font-extrabold text-[#0c3e35]">لا توجد تكليفات معلقة من المدير العام</h4>
                <p className="text-xs text-[#5e736e]">
                  كافة المهام والتكليفات منجزة أو لم يتم إسناد تكليفات جديدة لمديريتكم حالياً.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {executiveTasks.map((task) => renderExecutiveTaskCard(task, false))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: History & Achievements Print Report */}
        {activeTab === 'HISTORY' && (
          <div className="space-y-6">
            {/* Executive Achievements & Print Report Hub Card - Visible on Desktop/Computers only */}
            {!isMobileDevice && (
              <div className="hidden md:block bg-[#05261e] text-white p-6 sm:p-7 rounded-[28px] border border-[#0c3e35] shadow-xl space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 text-[#d4af37] flex items-center justify-center shadow-md shrink-0">
                      <Printer className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base sm:text-lg font-black text-white">
                          مركز طباعة تقارير الإنجازات والمهام المنجزة
                        </h3>
                        <span className="px-2 py-0.5 rounded-full bg-[#d4af37] text-[#05261e] text-[10px] font-black">
                          رسمي / PDF
                        </span>
                      </div>
                      <p className="text-xs text-[#d4af37]/90 mt-0.5 font-medium">
                        استخراج وطباعة تقرير رسمي موثق لمديرية {currentUser.directorate?.name} عن الشهر أو أي فترة يحددها المدير
                      </p>
                    </div>
                  </div>

                  {/* Print CTA Button */}
                  <button
                    onClick={handleOpenPrintReport}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#d4af37] hover:bg-[#c5a059] text-[#05261e] text-xs sm:text-sm font-extrabold shadow-lg transition cursor-pointer hover:scale-[1.02] active:scale-[0.98] mr-auto"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة التقرير الرسمي (PDF)</span>
                  </button>
                </div>

                {/* Filter and Period Controls */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
                  {/* Period Mode and Buttons */}
                  <div className="lg:col-span-8 flex flex-wrap items-center gap-2">
                    <span className="text-gray-300 font-bold flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-[#d4af37]" />
                      <span>الفترة:</span>
                    </span>

                    <button
                      onClick={() => {
                        setReportPeriodMode('MONTH');
                        setReportMonth(getCurrentMonthString());
                      }}
                      className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${reportPeriodMode === 'MONTH' && reportMonth === getCurrentMonthString()
                          ? 'bg-[#d4af37] text-[#05261e]'
                          : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                    >
                      الشهر الحالي
                    </button>

                    <button
                      onClick={() => {
                        setReportPeriodMode('MONTH');
                        setReportMonth(getPrevMonthString());
                      }}
                      className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${reportPeriodMode === 'MONTH' && reportMonth === getPrevMonthString()
                          ? 'bg-[#d4af37] text-[#05261e]'
                          : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                    >
                      الشهر السابق
                    </button>

                    {reportPeriodMode === 'MONTH' && (
                      <CustomMonthPicker
                        value={reportMonth}
                        onChange={(m) => setReportMonth(m)}
                      />
                    )}

                    <button
                      onClick={() => setReportPeriodMode(reportPeriodMode === 'CUSTOM' ? 'MONTH' : 'CUSTOM')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer border ${reportPeriodMode === 'CUSTOM'
                          ? 'bg-[#d4af37] text-[#05261e] border-[#d4af37]'
                          : 'bg-white/10 text-white hover:bg-white/20 border-white/20'
                        }`}
                    >
                      {reportPeriodMode === 'CUSTOM' ? 'إلغاء المخصص' : 'فترة مخصصة (من - إلى)'}
                    </button>

                    {reportPeriodMode === 'CUSTOM' && (
                      <CustomDateRangePicker
                        startDate={reportStartDate}
                        endDate={reportEndDate}
                        onChange={(start, end) => {
                          setReportStartDate(start);
                          setReportEndDate(end);
                        }}
                      />
                    )}
                  </div>

                  {/* Status Filter */}
                  <div className="lg:col-span-4 flex items-center justify-start lg:justify-end gap-2">
                    <span className="text-gray-300 font-bold flex items-center gap-1">
                      <Filter className="w-3.5 h-3.5 text-[#d4af37]" />
                      <span>تصفية:</span>
                    </span>
                    <select
                      value={reportStatusFilter}
                      onChange={(e) => setReportStatusFilter(e.target.value as any)}
                      className="px-3 py-1.5 rounded-xl bg-white/15 text-white border border-white/20 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#d4af37] cursor-pointer"
                    >
                      <option value="COMPLETED_AND_NEARING" className="bg-[#05261e] text-white">المنجزة والمقتربة من الإنجاز</option>
                      <option value="COMPLETED" className="bg-[#05261e] text-white">المنجزة بالكامل فقط (100%)</option>
                      <option value="NEARING" className="bg-[#05261e] text-white">المقتربة من الإنجاز (70% - 99%)</option>
                      <option value="ALL" className="bg-[#05261e] text-white">كافة المهام</option>
                    </select>
                  </div>
                </div>

                {/* Quick KPI Stats Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                    <span className="text-gray-300 text-[11px] block mb-1">معدل الإنجاز للفترة</span>
                    <strong className="text-lg sm:text-xl font-black text-[#d4af37]">
                      {loadingReport ? '...' : `${reportData?.stats.averageCompletionRate || 0}%`}
                    </strong>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                    <span className="text-gray-300 text-[11px] block mb-1">مهام منجزة بالكامل</span>
                    <strong className="text-lg sm:text-xl font-black text-emerald-400">
                      {loadingReport ? '...' : `${reportData?.stats.completedTasksCount || 0} مهمة`}
                    </strong>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                    <span className="text-gray-300 text-[11px] block mb-1">مهام مقتربة من الإنجاز</span>
                    <strong className="text-lg sm:text-xl font-black text-amber-300">
                      {loadingReport ? '...' : `${reportData?.stats.nearingTasksCount || 0} مهمة`}
                    </strong>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                    <span className="text-gray-300 text-[11px] block mb-1">إجمالي ساعات العمل</span>
                    <strong className="text-lg sm:text-xl font-black text-white">
                      {loadingReport ? '...' : `${reportData?.stats.totalHours || 0} س`}
                    </strong>
                  </div>
                </div>

                {/* Expand / Collapse In-Portal Preview */}
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <button
                    onClick={() => setShowInlineReportPreview(!showInlineReportPreview)}
                    className="text-xs font-bold text-[#d4af37] hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{showInlineReportPreview ? '▲ إخفاء المعاينة السريعة' : '▼ معاينة تفاصيل المهام والإنجازات هنا'}</span>
                    <span className="text-gray-400 font-normal">
                      ({reportData ? `${reportData.completedTasks.length + reportData.nearingTasks.length} مهمة` : ''})
                    </span>
                  </button>

                  <button
                    onClick={handleOpenPrintReport}
                    className="text-xs font-bold text-white hover:text-[#d4af37] flex items-center gap-1 cursor-pointer"
                  >
                    <span>معاينة الطباعة الرسمية A4</span>
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expandable Preview Body */}
                {showInlineReportPreview && reportData && (
                  <div className="bg-white text-[#0c3e35] p-5 rounded-2xl border border-white/20 space-y-4 animate-fadeIn">
                    {/* Key achievements */}
                    {reportData.keyAchievements && reportData.keyAchievements.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-[#0c3e35] flex items-center gap-1.5">
                          <Award className="w-4 h-4 text-[#d4af37]" />
                          <span>أبرز الإنجازات النوعية الموثقة:</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {reportData.keyAchievements.map((ach, idx) => (
                            <div key={idx} className="p-2 bg-emerald-50 rounded-xl border border-emerald-200 text-xs font-semibold flex items-center gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span>{ach}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Completed tasks preview */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                        <CheckCheck className="w-4 h-4 text-emerald-700" />
                        <span>المهام المكتملة (100%) - [{reportData.completedTasks.length}]:</span>
                      </h4>
                      <div className="max-h-60 overflow-y-auto space-y-1.5 text-xs pr-1">
                        {reportData.completedTasks.length === 0 ? (
                          <p className="text-gray-500 py-2 text-center">لا توجد مهام مكتملة في هذه الفترة</p>
                        ) : (
                          reportData.completedTasks.map((t) => (
                            <div key={t.id} className="p-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] flex items-center justify-between gap-2">
                              <div>
                                <p className="font-bold text-[#0c3e35]">{t.title}</p>
                                {t.completionNote && <p className="text-[11px] text-[#5e736e] mt-0.5">{t.completionNote}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-gray-500">{t.planDate ? new Date(t.planDate).toLocaleDateString('ar-SY') : ''}</span>
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-extrabold text-[10px]">100%</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Nearing tasks preview */}
                    {reportData.nearingTasks.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-amber-600" />
                          <span>المهام المقتربة من الإنجاز (70% - 99%) - [{reportData.nearingTasks.length}]:</span>
                        </h4>
                        <div className="max-h-60 overflow-y-auto space-y-1.5 text-xs pr-1">
                          {reportData.nearingTasks.map((t) => (
                            <div key={t.id} className="p-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] flex items-center justify-between gap-2">
                              <div>
                                <p className="font-bold text-[#0c3e35]">{t.title}</p>
                                {t.completionNote && <p className="text-[11px] text-[#5e736e] mt-0.5">{t.completionNote}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-gray-500">{t.planDate ? new Date(t.planDate).toLocaleDateString('ar-SY') : ''}</span>
                                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-extrabold text-[10px]">{t.completionPercentage}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Daily Records History List */}
            <div className="bg-[#edece4] p-4 sm:p-7 rounded-2xl sm:rounded-[28px] border border-[#d2d1c9] shadow-brand-card space-y-5 sm:space-y-6 pb-12 sm:pb-6 animate-fadeIn">
              <div className="border-b border-[#d2d1c9] pb-4">
                <h3 className="text-sm sm:text-base font-extrabold text-[#0c3e35] flex items-center gap-2">
                  <History className="w-5 h-5 text-[#d4af37]" />
                  أرشيف الخطط والإنجازات السابقة لـ {currentUser.directorate?.name}
                </h3>
                <p className="text-xs text-[#5e736e] mt-1 font-medium">
                  أرشيف الأيام السابقة خاص بمديريتكم حصراً.
                </p>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-12 text-[#5e736e] text-xs">
                  لا توجد تقارير سابقة مسجلة حتى الآن
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="p-4 sm:p-5 rounded-2xl bg-white border border-[#d2d1c9] space-y-3.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[#0c3e35] flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-[#d4af37]" />
                          <span>
                            {new Date(h.planDate).toLocaleDateString('ar-SY', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </span>
                        </span>
                        <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200 shrink-0 whitespace-nowrap shadow-2xs">
                          نسبة الإنجاز: {h.dailySummary?.overallCompletionRate || 0}%
                        </span>
                      </div>

                      {h.generalFocus && (
                        <p className="text-xs text-[#0c3e35]">
                          <strong>التركيز:</strong> {h.generalFocus}
                        </p>
                      )}

                      {h.dailySummary?.summaryText && (
                        <div className="p-3 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-xs text-[#0c3e35]">
                          <strong>ملخص الإنجاز:</strong> {h.dailySummary.summaryText}
                        </div>
                      )}

                      {/* Directives & Directorate Replies Thread */}
                      {h.feedbacks && h.feedbacks.length > 0 && (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-extrabold text-[#0c3e35] flex items-center gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-[#d4af37]" />
                              التوجيهات والردود المتبادلة ({h.feedbacks.length}):
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {h.feedbacks.map((fb, idx) => {
                              const isDirector = fb.fromUser?.role === 'DIRECTOR';
                              const senderName = fb.fromUser?.fullName?.trim() || (isDirector ? currentUser.fullName : 'المدير العام للموانئ');
                              const senderTitle = fb.fromUser?.title?.trim() || (isDirector ? currentUser.title : '');
                              const showTitle = Boolean(senderTitle && senderTitle !== senderName);

                              return isDirector ? (
                                <div
                                  key={fb.id || idx}
                                  className="p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-300 text-xs space-y-2 shadow-xs"
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] pb-1 border-b border-emerald-200/60">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="px-2 py-0.5 rounded-md bg-emerald-200 text-emerald-950 text-[10px] font-black border border-emerald-300 shrink-0 whitespace-nowrap">
                                        رد وتوضيح المديرية
                                      </span>
                                      <span className="font-extrabold text-emerald-900">
                                        {senderName}
                                        {showTitle && <span className="font-medium text-emerald-800 mr-1">({senderTitle})</span>}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-emerald-700 font-bold shrink-0 whitespace-nowrap">
                                      {new Date(fb.createdAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <p className="text-[#0c3e35] text-xs leading-relaxed font-medium whitespace-pre-wrap">
                                    {fb.feedbackText}
                                  </p>
                                </div>
                              ) : (
                                <div
                                  key={fb.id || idx}
                                  className="p-3.5 rounded-2xl bg-[#05261e] text-white text-xs space-y-2 border border-[#d4af37]/40 shadow-xs"
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] pb-1.5 border-b border-[#d4af37]/20">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="px-2 py-0.5 rounded-md bg-[#d4af37]/20 text-[#d4af37] text-[10px] font-black border border-[#d4af37]/40 shrink-0 whitespace-nowrap">
                                        توجيه المدير العام
                                      </span>
                                      <span className="font-extrabold text-[#d4af37]">
                                        {senderName}
                                        {showTitle && <span className="font-medium text-[#c5a028] mr-1">({senderTitle})</span>}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-[#8daaa2] font-semibold shrink-0 whitespace-nowrap">
                                      {new Date(fb.createdAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <p className="text-[#edece4] text-xs sm:text-sm leading-relaxed font-medium whitespace-pre-wrap">
                                    {fb.feedbackText}
                                  </p>
                                  {fb.rating && (
                                    <div className="flex items-center gap-1.5 text-[#d4af37] pt-1 border-t border-[#0c3e35]">
                                      <span className="text-[10px] text-[#8daaa2] font-bold">التقييم:</span>
                                      <div className="flex items-center gap-0.5">
                                        {Array.from({ length: fb.rating }).map((_, i) => (
                                          <Star key={i} className="w-3.5 h-3.5 fill-[#d4af37] text-[#d4af37]" />
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Reply Action Button & Form */}
                      <div className="pt-1">
                        {replyOpenPlanId !== h.id ? (
                          <button
                            type="button"
                            onClick={() => setReplyOpenPlanId(h.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0c3e35] hover:text-[#072923] bg-[#f4f3ed] hover:bg-[#eae8dd] px-3.5 py-2 rounded-xl border border-[#d2d1c9] transition cursor-pointer shadow-xs"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-[#0c3e35]" />
                            <span>
                              {h.feedbacks && h.feedbacks.length > 0
                                ? 'إضافة رد / توضيح على توجيه المدير العام'
                                : 'إضافة توضيح / ملاحظة للمدير العام على إنجاز هذا اليوم'}
                            </span>
                          </button>
                        ) : (
                          <div className="p-4 rounded-2xl bg-[#f4f3ed] border-2 border-[#0c3e35]/30 space-y-3 shadow-sm animate-fadeIn">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#0c3e35] flex items-center gap-1.5">
                                <Send className="w-3.5 h-3.5 text-[#0c3e35]" />
                                <span>كتابة رد وتوضيح رسمي للمدير العام:</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setReplyOpenPlanId(null)}
                                className="text-[11px] font-semibold text-[#5e736e] hover:text-red-700 transition cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                            <textarea
                              rows={3}
                              value={replyTextMap[h.id] || ''}
                              onChange={(e) =>
                                setReplyTextMap((prev) => ({ ...prev, [h.id]: e.target.value }))
                              }
                              placeholder="اكتب ردك، إجابتك على تساؤل المدير العام، أو توضيحاتك بخصوص هذا الإنجاز..."
                              className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] font-medium"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setReplyOpenPlanId(null)}
                                className="px-3.5 py-1.5 rounded-xl bg-white border border-[#d2d1c9] text-xs text-[#5e736e] hover:bg-slate-50 transition cursor-pointer"
                              >
                                إلغاء
                              </button>
                              <button
                                type="button"
                                disabled={submittingReplyPlanId === h.id || !replyTextMap[h.id]?.trim()}
                                onClick={() => handleSendReply(h.id, h.dailySummary?.id)}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white text-xs font-bold shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              >
                                {submittingReplyPlanId === h.id ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>جاري الإرسال...</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3.5 h-3.5" />
                                    <span>إرسال الرد فوراً</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Task Templates Modal (Requirement 2) */}
        {showTemplatesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#edece4] border border-[#d2d1c9] rounded-[28px] max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[#d2d1c9] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#0c3e35] text-[#d4af37] flex items-center justify-center shadow-xs">
                    <BookmarkPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-[#0c3e35]">
                      قوالب المهام المتكررة
                    </h3>
                    <p className="text-xs text-[#5e736e]">
                      إدارة واستخدام المهام الدورية لمديرية {currentUser.directorate?.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTemplatesModal(false)}
                  className="p-2 rounded-xl text-[#5e736e] hover:text-[#0c3e35] hover:bg-white/80 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Create New Template Card */}
              <form onSubmit={handleCreateNewTemplate} className="p-4 rounded-2xl bg-white border border-[#d2d1c9] space-y-3 shadow-xs">
                <h4 className="text-xs font-bold text-[#0c3e35] flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-[#d4af37]" />
                  <span>إضافة قالب مهمة متكررة جديد:</span>
                </h4>
                <input
                  type="text"
                  required
                  placeholder="عنوان القالب (مثلاً: جرد حركة السفن اليومية بالمرافئ)..."
                  value={newTemplateForm.title}
                  onChange={(e) => setNewTemplateForm({ ...newTemplateForm, title: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] font-medium"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      placeholder="وصف تفصيلي أو إجراءات تنفيذ القالب (اختياري)..."
                      value={newTemplateForm.description}
                      onChange={(e) => setNewTemplateForm({ ...newTemplateForm, description: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35]"
                    />
                  </div>
                  <div>
                    <select
                      value={newTemplateForm.priority}
                      onChange={(e) => setNewTemplateForm({ ...newTemplateForm, priority: e.target.value as Priority })}
                      className="w-full p-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] text-xs focus:outline-none focus:border-[#0c3e35] font-bold cursor-pointer"
                    >
                      <option value="URGENT">عاجل جداً</option>
                      <option value="HIGH">أولوية مرتفعة</option>
                      <option value="NORMAL">أولوية عادية</option>
                      <option value="LOW">منخفضة</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={creatingTemplate || !newTemplateForm.title.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0c3e35] text-white hover:bg-[#072923] text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {creatingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>حفظ القالب</span>
                  </button>
                </div>
              </form>

              {/* Saved Templates List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#0c3e35]">
                    القوالب المحفوظة ({templates.length}):
                  </h4>
                  {templates.length > 1 && (
                    <button
                      type="button"
                      onClick={handleApplyAllTemplates}
                      className="text-xs font-bold text-[#0c3e35] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#d4af37]" />
                      <span>إدراج كافة القوالب في الخطة دفعة واحدة</span>
                    </button>
                  )}
                </div>

                {loadingTemplates ? (
                  <div className="py-8 text-center text-[#5e736e]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0c3e35] mb-1" />
                    <span className="text-xs font-medium">جارٍ تحميل القوالب...</span>
                  </div>
                ) : templates.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-white border border-dashed border-[#d2d1c9] text-center text-xs text-[#5e736e]">
                    لا توجد قوالب مهام محفوظة لهذه المديرية بعد. يمكنك إضافة قوالب جديدة أعلاه أو حفظ أي مهمة كقالب أثناء كتابة الخطة.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {templates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="p-3.5 rounded-xl bg-white border border-[#d2d1c9] flex items-center justify-between gap-3 shadow-xs hover:border-[#0c3e35] transition"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-extrabold text-[#0c3e35] truncate">{tpl.title}</h5>
                          </div>
                          {tpl.description && (
                            <p className="text-[11px] text-[#5e736e] mt-0.5 line-clamp-1">{tpl.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleApplyTemplate(tpl)}
                            className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#0c3e35] text-white hover:bg-[#072923] transition cursor-pointer shadow-xs active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>إدراج في الخطة</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(tpl.id)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition cursor-pointer"
                            title="حذف القالب"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-[#d2d1c9]">
                <button
                  type="button"
                  onClick={() => setShowTemplatesModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] text-xs font-bold hover:bg-[#f4f3ed] transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Announcement Details Dialog */}
        <AnnouncementDetailsModal
          data={selectedAnnouncement}
          currentUser={currentUser}
          onClose={() => setSelectedAnnouncement(null)}
        />

        {/* Incomplete / Carried-over Tasks Modal */}
        <IncompleteTasksModal
          isOpen={showIncompleteTasksModal}
          onClose={() => setShowIncompleteTasksModal(false)}
          tasks={incompleteTasks}
          loading={loadingIncompleteTasks}
          onSelectTask={handleImportIncompleteTask}
          onSelectAll={handleImportAllIncompleteTasks}
          onDismissTask={handleDismissIncompleteTask}
          alreadyAddedTitles={tasks.map((t) => t.title)}
        />

        {/* Modal Dialog: Confirm Delete Plan Task (Reusable & Mobile-Optimized) */}
        <ConfirmDeleteModal
          isOpen={Boolean(deleteConfirmTask)}
          onClose={() => setDeleteConfirmTask(null)}
          onConfirm={handleConfirmDeleteTask}
          title="حذف المهمة من الخطة"
          description={
            deleteConfirmTask?.isSavedOnServer
              ? 'سيتم حذف هذه المهمة نهائياً من خطة اليوم المعتمدة وتحديث السجل فوراً لدى الإدارة العامة.'
              : 'هل أنت متأكد من حذف هذه المهمة من مسودة الخطة اليومية؟'
          }
          itemName={deleteConfirmTask?.title}
          itemBadge={deleteConfirmTask?.isSavedOnServer ? 'مهمة معتمدة في الخطة اليومية' : undefined}
          confirmText="تأكيد الحذف المباشر"
          cancelText="إلغاء"
          isLoading={isDeletingTask}
        />

        {/* Modal: Quick Add Task to Today's Plan */}
        {showQuickAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
            <div className="bg-[#edece4] rounded-2xl border border-[#d2d1c9] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#d2d1c9] bg-white/60">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#0c3e35]" />
                  <h3 className="text-base font-bold text-[#0c3e35]">إضافة مهمة جديدة لخطة اليوم</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickAddModal(false)}
                  className="p-1.5 rounded-lg text-[#5e736e] hover:bg-[#f4f3ed] transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateQuickTask} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#0c3e35]">
                    عنوان المهمة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="مثال: متابعة التنسيق مع الجمارك البحرية..."
                    value={quickTaskTitle}
                    onChange={(e) => setQuickTaskTitle(e.target.value)}
                    className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] text-xs font-bold focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#0c3e35]">
                    تفاصيل إضافية أو مخرجات متوقعة (اختياري)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="تفاصيل أو ملاحظات للتنفيذ..."
                    value={quickTaskDesc}
                    onChange={(e) => setQuickTaskDesc(e.target.value)}
                    className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] text-xs focus:outline-none focus:border-[#0c3e35] resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#0c3e35]">أولوية المهمة</label>
                  <select
                    value={quickTaskPriority}
                    onChange={(e) => setQuickTaskPriority(e.target.value as Priority)}
                    className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] text-xs font-bold focus:outline-none focus:border-[#0c3e35]"
                  >
                    <option value="URGENT">عاجل جداً</option>
                    <option value="HIGH">أولوية مرتفعة</option>
                    <option value="NORMAL">أولوية عادية</option>
                    <option value="LOW">منخفضة</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#d2d1c9]">
                  <button
                    type="button"
                    onClick={() => setShowQuickAddModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#5e736e] hover:text-[#0c3e35] text-xs font-bold transition cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={savingQuickTask || !quickTaskTitle.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {savingQuickTask ? <Loader2 className="w-4 h-4 animate-spin text-[#d4af37]" /> : <Plus className="w-4 h-4 text-[#d4af37]" />}
                    <span>{savingQuickTask ? 'جاري الإضافة...' : 'إضافة المهمة للخطة'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </>
  );
};
